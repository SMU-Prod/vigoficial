/**
 * VIGI — DOU Prospector
 *
 * Extrai empresas de segurança privada do DOU que NÃO são clientes VIGI.
 * Cada empresa encontrada vira um prospect automaticamente no CRM.
 *
 * Fluxo:
 * 1. DOU parser roda normalmente (06h)
 * 2. Prospector analisa as MESMAS seções relevantes
 * 3. Identifica empresas mencionadas
 * 4. Cruza com base de companies e prospects existentes
 * 5. Cria novos prospects com source = "dou" e score baseado no sinal_compra
 * 6. Registra atividade automática no prospect
 */

import { getAnthropicClient, AI_MODELS } from "@/lib/ai/client";
import { DOU_PROSPECTION_PROMPT } from "@/lib/ai/prompts";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { TokenTracker } from "@/lib/agents/base";
import { getEmailSendQueue } from "@/lib/queue/queues";
import { enrichProspect } from "@/lib/services/cnpj-enrichment";
import { AI_CONFIG } from "@/lib/config/constants";

interface DOUProspectCandidate {
  cnpj: string | null;
  razao_social: string;
  tipo_publicacao: string;
  uf: string | null;
  resumo: string;
  sinal_compra: number;
}

interface ProspectionResult {
  totalCandidates: number;
  newProspectsCreated: number;
  existingClientsSkipped: number;
  existingProspectsUpdated: number;
  outreachEmailsQueued: number;
  errors: string[];
  tokenUsage: { input: number; output: number };
}

/**
 * Analisa seções do DOU e cria/atualiza prospects automaticamente.
 * Chamado após o parseDOU() principal no ciclo das 06h.
 */
export async function prospectFromDOU(
  sections: string[],
  douDate: string
): Promise<ProspectionResult> {
  const supabase = createSupabaseAdmin();
  const tokenTracker = new TokenTracker("dou_prospector");
  const result: ProspectionResult = {
    totalCandidates: 0,
    newProspectsCreated: 0,
    existingClientsSkipped: 0,
    existingProspectsUpdated: 0,
    outreachEmailsQueued: 0,
    errors: [],
    tokenUsage: { input: 0, output: 0 },
  };

  if (sections.length === 0) return result;

  // 1. Extrair candidatos de todas as seções via IA
  const allCandidates: DOUProspectCandidate[] = [];

  for (const section of sections) {
    try {
      const candidates = await extractCandidates(section, tokenTracker);
      allCandidates.push(...candidates);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`[extract] ${msg}`);
    }
  }

  // Deduplica por razao_social (pode aparecer múltiplas vezes)
  const uniqueCandidates = deduplicateCandidates(allCandidates);
  result.totalCandidates = uniqueCandidates.length;

  // 2. Para cada candidato, verificar se já existe
  for (const candidate of uniqueCandidates) {
    try {
      await processCandidate(candidate, douDate, supabase, result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`[process] ${candidate.razao_social}: ${msg}`);
    }
  }

  // 3. Token usage
  result.tokenUsage = {
    input: tokenTracker.totalInputTokens,
    output: tokenTracker.totalOutputTokens,
  };

  // 4. Log evento
  await supabase.from("system_events").insert({
    tipo: "dou_prospection",
    severidade: "info",
    mensagem: `DOU ${douDate}: ${result.newProspectsCreated} novos, ${result.existingProspectsUpdated} atualizados, ${result.existingClientsSkipped} já clientes, ${result.outreachEmailsQueued} emails enviados`,
    detalhes: result,
  });

  return result;
}

/**
 * Extrai candidatos a prospect de uma seção do DOU.
 */
async function extractCandidates(
  sectionText: string,
  tokenTracker: TokenTracker
): Promise<DOUProspectCandidate[]> {
  const anthropic = getAnthropicClient();

  const response = await anthropic.messages.create({
    model: AI_MODELS.fast, // Haiku — rápido e barato
    max_tokens: AI_CONFIG.DOU_MAX_TOKENS,
    system: [
      {
        type: "text",
        text: DOU_PROSPECTION_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: `TEXTO DOU:\n${sectionText}` }],
  });

  tokenTracker.track(response.usage);

  try {
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const parsed = JSON.parse(text);
    return (parsed.empresas || []) as DOUProspectCandidate[];
  } catch {
    return [];
  }
}

/**
 * Processa um candidato: cria prospect, atualiza existente, ou ignora.
 */
async function processCandidate(
  candidate: DOUProspectCandidate,
  douDate: string,
  supabase: ReturnType<typeof createSupabaseAdmin>,
  result: ProspectionResult
) {
  const cnpjClean = candidate.cnpj?.replace(/\D/g, "") || null;

  // Check 1: Já é cliente VIGI?
  if (cnpjClean) {
    const { data: existingCompany } = await supabase
      .from("companies")
      .select("id")
      .eq("cnpj", cnpjClean)
      .single();

    if (existingCompany) {
      result.existingClientsSkipped++;
      return;
    }
  }

  // Check 2: Já é prospect?
  let existingProspect = null;
  if (cnpjClean) {
    const { data } = await supabase
      .from("prospects")
      .select("id, score, tags, email, email_contato, razao_social, status")
      .eq("cnpj", cnpjClean)
      .single();
    existingProspect = data;
  } else {
    // Sem CNPJ, busca por razão social (match parcial)
    const { data } = await supabase
      .from("prospects")
      .select("id, score, tags, email, email_contato, razao_social, status")
      .ilike("razao_social", `%${candidate.razao_social}%`)
      .limit(1)
      .single();
    existingProspect = data;
  }

  if (existingProspect) {
    // Atualiza score se sinal_compra é maior, e registra atividade
    const newScore = Math.min(
      100,
      (existingProspect.score || 0) + candidate.sinal_compra * 3
    );

    // Atualiza temperatura baseado no score combinado
    const novaTemp = newScore >= 70 ? "quente" : newScore >= 40 ? "morno" : "frio";

    await supabase
      .from("prospects")
      .update({
        score: newScore,
        temperatura: novaTemp,
        tags: [
          ...((existingProspect.tags as string[]) || []),
          `dou_${douDate}`,
        ].slice(-10),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingProspect.id);

    // Registra atividade de DOU
    await supabase.from("prospect_activities").insert({
      prospect_id: existingProspect.id,
      tipo: "nota",
      descricao: `[Auto-DOU ${douDate}] ${candidate.tipo_publicacao}: ${candidate.resumo}`,
      realizado_por: "sistema_dou",
    });

    // ==========================================
    // OUTREACH: Enviar email consultivo (Template I)
    // Só envia se o prospect tem email E ainda não é cliente (status != "ganho")
    // ==========================================
    const prospectEmail = existingProspect.email || existingProspect.email_contato;
    const isActiveProspect = existingProspect.status !== "ganho" && existingProspect.status !== "perdido";

    if (prospectEmail && isActiveProspect) {
      try {
        // Verificar se já enviou outreach nos últimos 30 dias para este prospect
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data: recentOutreach } = await supabase
          .from("email_outbound")
          .select("id")
          .eq("to_email", prospectEmail)
          .eq("template_id", "I")
          .gte("created_at", thirtyDaysAgo.toISOString())
          .limit(1)
          .single();

        if (!recentOutreach) {
          // Formatar CNPJ para exibição
          const cnpjFormatado = cnpjClean
            ? cnpjClean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
            : candidate.cnpj || "";

          // Enfileirar email de prospecção consultiva
          await getEmailSendQueue().add(
            `outreach-dou-${existingProspect.id}-${douDate}`,
            {
              companyId: null, // É prospect, não company
              prospectId: existingProspect.id,
              templateId: "I",
              mode: "CLIENTE_HTML",
              to: prospectEmail,
              subject: `📊 Relatório regulatório gratuito — ${existingProspect.razao_social || candidate.razao_social}`,
              payload: {
                razaoSocial: existingProspect.razao_social || candidate.razao_social,
                cnpj: cnpjFormatado,
                dataPublicacao: douDate.split("-").reverse().join("/"),
                tipoPublicacao: candidate.tipo_publicacao.replace(/_/g, " "),
                resumoPublicacao: candidate.resumo,
                itensDetectados: [],
                uf: candidate.uf,
                score: newScore,
                linkRelatorio: `https://app.vigi.com.br/relatorio/${existingProspect.id}`,
              },
            },
            {
              attempts: 3,
              backoff: { type: "exponential", delay: AI_CONFIG.RETRY_BACKOFF_DELAY },
              removeOnComplete: 100,
              removeOnFail: 50,
            }
          );

          // Registrar atividade de outreach
          await supabase.from("prospect_activities").insert({
            prospect_id: existingProspect.id,
            tipo: "email_enviado",
            descricao: `[Auto-Outreach] Email consultivo enviado (Template I) — Publicação DOU ${douDate}: ${candidate.tipo_publicacao}`,
            realizado_por: "sistema_dou",
          });

          // Avançar status se ainda é "novo"
          if (existingProspect.status === "novo") {
            await supabase
              .from("prospects")
              .update({ status: "contatado" })
              .eq("id", existingProspect.id);
          }

          result.outreachEmailsQueued++;
        }
      } catch (emailErr) {
        const msg = emailErr instanceof Error ? emailErr.message : String(emailErr);
        result.errors.push(`[outreach] ${candidate.razao_social}: ${msg}`);
      }
    }

    result.existingProspectsUpdated++;
    return;
  }

  // Check 3: Criar novo prospect
  const score = calculateDOUScore(candidate);

  const { data: newProspect, error } = await supabase
    .from("prospects")
    .insert({
      cnpj: cnpjClean,
      razao_social: candidate.razao_social,
      uf: candidate.uf || null,
      status: "novo",
      source: "dou" as const,
      temperatura: candidate.sinal_compra >= 7 ? "morno" : "frio",
      segmento: null,
      score,
      tags: [`dou_${douDate}`, candidate.tipo_publicacao],
      observacoes: `Detectada no DOU ${douDate}: ${candidate.resumo}`,
    })
    .select("id")
    .single();

  if (error) {
    result.errors.push(`[insert] ${candidate.razao_social}: ${error.message}`);
    return;
  }

  // Registra atividade inicial
  if (newProspect) {
    await supabase.from("prospect_activities").insert({
      prospect_id: newProspect.id,
      tipo: "nota",
      descricao: `[Auto-DOU] Empresa detectada no DOU ${douDate}. Tipo: ${candidate.tipo_publicacao}. Sinal de compra: ${candidate.sinal_compra}/10. Resumo: ${candidate.resumo}`,
      realizado_por: "sistema_dou",
    });

    // Enrich prospect data from BrasilAPI (non-blocking)
    enrichProspect(newProspect.id).catch(err => {
      console.error(`[DOU Prospector] Failed to enrich prospect ${newProspect.id}:`, err);
    });
  }

  result.newProspectsCreated++;
}

/**
 * Calcula score para prospect baseado em dados do DOU.
 */
function calculateDOUScore(candidate: DOUProspectCandidate): number {
  let score = 0;

  // Sinal de compra (0-10) → peso alto
  score += candidate.sinal_compra * 5; // até 50 pontos

  // Tem CNPJ → mais confiável
  if (candidate.cnpj) score += 15;

  // Tem UF → facilita contato
  if (candidate.uf) score += 5;

  // Tipo de publicação → diferentes pesos
  const typeBonus: Record<string, number> = {
    multa_aplicada: 20, // Empresa precisa URGENTE de compliance
    habilitacao: 15, // Empresa nova, precisa de tudo
    alvara_renovado: 10, // Empresa ativa
    cnv_publicada: 5, // Funcionários ativos
    portaria_nova: 0,
    cancelamento: 0,
    outro: 0,
  };
  score += typeBonus[candidate.tipo_publicacao] || 0;

  return Math.min(100, score);
}

/**
 * Deduplica candidatos por CNPJ ou razão social.
 * Mantém o com maior sinal_compra.
 */
function deduplicateCandidates(
  candidates: DOUProspectCandidate[]
): DOUProspectCandidate[] {
  const map = new Map<string, DOUProspectCandidate>();

  for (const c of candidates) {
    const key = c.cnpj?.replace(/\D/g, "") || c.razao_social.toLowerCase().trim();
    const existing = map.get(key);
    if (!existing || c.sinal_compra > existing.sinal_compra) {
      map.set(key, c);
    }
  }

  return Array.from(map.values());
}
