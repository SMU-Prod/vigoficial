/**
 * VIGI — Agente Prospector
 *
 * Agente dedicado para identificação e captação automática de clientes via DOU.
 *
 * INTELIGÊNCIA MULTI-CAMADA:
 *   Camada 1 — Estruturada: Usa DouAlvara já parseados pelo scraper.
 *              Zero custo IA, alta precisão. Dados: CNPJ, tipo_alvara, itens,
 *              validade, delegacia, UF.
 *   Camada 2 — Semiestruturada: Analisa DouPublicacao sem alvara associado
 *              (despachos, portarias, retificações) via Claude Haiku.
 *   Camada 3 — Contextual: Após criar prospect, usa Sonnet para gerar
 *              email de outreach personalizado com contexto real da publicação.
 *
 * SCORING INTELIGENTE (0-100):
 *   - tipo_alvara/evento + itens_liberados + recorrência + UF + CNPJ presente
 *   - Decaimento temporal: publicações antigas valem menos
 *   - Boost por sinal_urgência: multa/cancelamento/prazo_vencendo = quente
 *
 * FLUXO:
 *   1. Para uma data: busca alvaras + publicacoes do dia no DB
 *   2. Cruza com companies (já cliente → skip) e prospects (existente → update)
 *   3. Cria novos prospects com enriquecimento CNPJ (BrasilAPI)
 *   4. Gera e enfileira email outreach personalizado (Template I)
 *   5. Emite eventos no IML Event Graph para rastreamento causal
 *   6. Registra tudo em agent_runs para auditoria e Langfuse
 *
 * BACKFILL:
 *   Job tipo "backfill" processa range de datas (ex: mês inteiro).
 *   Útil para bootstrapping e recuperação de dados perdidos.
 */

import { getAnthropicClient, AI_MODELS } from "@/lib/ai/client";
import { startAgentRun, completeAgentRun, logAgentDecision, TokenTracker } from "@/lib/agents/base";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getEmailSendQueue } from "@/lib/queue/queues";
import { enrichProspect } from "@/lib/services/cnpj-enrichment";
import { emitEvent } from "@/lib/iml/event-graph";
import { isProspectOptOut } from "@/lib/agents/prospect-reply";
import type { DouAlvara, DouPublicacao } from "@/types/database";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProspectorJobData {
  /** Modo de operação */
  mode: "daily" | "backfill" | "manual";
  /** Data única (YYYY-MM-DD) para "daily" e "manual" */
  date?: string;
  /** Range de datas para backfill */
  dateFrom?: string;
  dateTo?: string;
  /** Forçar re-processamento mesmo se já processado */
  force?: boolean;
}

export interface ProspectorResult {
  datesProcessed: string[];
  totalAlvarasAnalyzed: number;
  totalPublicacoesAnalyzed: number;
  newProspectsCreated: number;
  existingProspectsUpdated: number;
  existingClientsSkipped: number;
  outreachEmailsQueued: number;
  errors: string[];
  tokenUsage: { input: number; output: number };
}

interface ProspectCandidate {
  cnpj: string | null;
  cnpjLimpo: string | null;
  razaoSocial: string;
  uf: string | null;
  municipio: string | null;
  tipoEvento: string;
  resumo: string;
  sinalUrgencia: number;  // 1-10
  scoreBase: number;       // 0-100
  fonte: "alvara_estruturado" | "publicacao_ia";
  sourceId: string;         // alvara.id ou publicacao.id
  dataPublicacao: string;
  textoOriginal?: string;
}

// ─── Scoring Engine ───────────────────────────────────────────────────────────

/**
 * Calcula score de prospecção baseado nos dados estruturados do alvará.
 * Quanto mais urgente a situação regulatória, maior o score.
 */
function scoreFromAlvara(alvara: DouAlvara, dataPublicacao: string): number {
  let score = 0;

  // Tipo de alvará → sinal de compra
  const tipoScore: Record<string, number> = {
    multa:            45, // Empresa em apuros regulatórios — QUENTE
    cancelamento:     40, // Empresa perdendo autorização — QUENTE
    prazo_vencendo:   35, // Urgência temporal
    habilitacao:      30, // Empresa nova — precisa de tudo
    alvara_novo:      25, // Acabou de receber autorização
    alvara_renovado:  20, // Ativa e renovando — momento bom
    cnv_publicada:    15, // Tem vigilantes
    portaria:         10,
    outro:             5,
  };
  score += tipoScore[alvara.tipo_alvara] ?? 5;

  // Tem CNPJ → dados confiáveis, cruzamento possível
  if (alvara.cnpj_limpo) score += 10;

  // Tem UF → contexto geográfico
  if (alvara.uf) score += 5;

  // Itens liberados → empresa com equipamentos = mais dependência de compliance
  const nItens = (alvara.itens_liberados ?? []).length;
  if (nItens > 0) score += Math.min(15, nItens * 3);

  // Decaimento temporal: publicações antigas valem menos
  const diasAtras = Math.max(0, Math.floor(
    (Date.now() - new Date(dataPublicacao).getTime()) / 86_400_000
  ));
  if (diasAtras > 30) score = Math.floor(score * 0.7);
  if (diasAtras > 90) score = Math.floor(score * 0.5);

  return Math.min(100, score);
}

/**
 * Temperatura baseada no score e tipo de evento.
 */
function temperaturaFromScore(score: number, tipoEvento: string): "frio" | "morno" | "quente" {
  const urgentes = ["multa", "cancelamento", "prazo_vencendo"];
  if (urgentes.some(u => tipoEvento.includes(u))) return "quente";
  if (score >= 55) return "quente";
  if (score >= 30) return "morno";
  return "frio";
}

// ─── Camada 1: Alvarás Estruturados ──────────────────────────────────────────

async function candidatesFromAlvaras(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  date: string
): Promise<ProspectCandidate[]> {
  // Busca alvarás do dia com a publicação relacionada
  const { data: alvaras, error } = await supabase
    .from("dou_alvaras")
    .select(`
      *,
      publicacao:dou_publicacoes!inner(
        id, data_publicacao, url_publicacao, secao
      )
    `)
    .eq("publicacao.data_publicacao", date);

  if (error || !alvaras) return [];

  return (alvaras as (DouAlvara & { publicacao: DouPublicacao })[]).map((alvara) => {
    const score = scoreFromAlvara(alvara, date);
    return {
      cnpj: alvara.cnpj || null,
      cnpjLimpo: alvara.cnpj_limpo || null,
      razaoSocial: alvara.razao_social,
      uf: alvara.uf,
      municipio: alvara.municipio,
      tipoEvento: alvara.tipo_alvara,
      resumo: `${alvara.tipo_alvara.replace(/_/g, " ")} — ${alvara.delegacia ?? "DPF"} — ${(alvara.itens_liberados ?? []).length} itens`,
      sinalUrgencia: score >= 60 ? 9 : score >= 35 ? 6 : 3,
      scoreBase: score,
      fonte: "alvara_estruturado",
      sourceId: alvara.id,
      dataPublicacao: date,
      textoOriginal: alvara.texto_original,
    } satisfies ProspectCandidate;
  });
}

// ─── Camada 2: Publicações Semiestruturadas via IA ────────────────────────────

const PROSPECTOR_SYSTEM_PROMPT = `Você é um analista especialista em segurança privada no Brasil.
Analise esta publicação do Diário Oficial da União e identifique empresas de segurança privada.

Para cada empresa, retorne JSON com:
{
  "empresas": [
    {
      "cnpj": "00.000.000/0001-00 ou null",
      "razao_social": "Nome completo da empresa",
      "uf": "SP ou null",
      "municipio": "Cidade ou null",
      "tipo_evento": "multa|cancelamento|habilitacao|alvara_renovado|cnv_publicada|portaria|outro",
      "resumo": "Uma frase descrevendo o que foi publicado",
      "sinal_urgencia": 8,
      "motivo_urgencia": "Por que esta empresa precisa de suporte de compliance agora"
    }
  ]
}

Regras:
- Ignore empresas de vigilância SANITÁRIA, EPIDEMIOLÓGICA, AMBIENTAL
- Foque em: segurança privada, vigilância patrimonial/armada/orgânica, transporte de valores, CNV, DELESP
- sinal_urgencia 1-10: 9-10=multa/cancelamento, 7-8=habilitação nova, 5-6=renovação, 3-4=menção genérica
- Se nenhuma empresa relevante, retorne {"empresas": []}

---
EXEMPLOS:

[EXEMPLO 1 — Empresa com multa grave → sinal_urgencia alto]
Publicação: "MINISTÉRIO DA JUSTIÇA E SEGURANÇA PÚBLICA. PORTARIA Nº 1.234, DE 10 DE MARÇO DE 2025. O DIRETOR-EXECUTIVO DO DEPARTAMENTO DE POLÍCIA FEDERAL, no uso das atribuições, RESOLVE aplicar multa no valor de R$ 30.000,00 à empresa PROTEGE VIGILÂNCIA E SEGURANÇA LTDA, CNPJ 12.345.678/0001-90, com sede em São Paulo-SP, por infração ao art. 23 da Lei nº 7.102/83, referente à irregularidade nas CNVs dos vigilantes."
Saída esperada:
{"empresas": [{"cnpj": "12.345.678/0001-90", "razao_social": "PROTEGE VIGILÂNCIA E SEGURANÇA LTDA", "uf": "SP", "municipio": "São Paulo", "tipo_evento": "multa", "resumo": "Multa de R$ 30.000 por irregularidade nas CNVs dos vigilantes", "sinal_urgencia": 9, "motivo_urgencia": "Empresa multada pela PF por irregularidade em CNVs — compliance imediato necessário para evitar cassação de alvará"}]}

[EXEMPLO 2 — Renovação de alvará → sinal_urgencia médio]
Publicação: "DEPARTAMENTO DE POLÍCIA FEDERAL. DELESP/SP. DESPACHO. Fica RENOVADO o Alvará de funcionamento n° 0456/2025 da empresa ALFA SEGURANÇA PATRIMONIAL S.A., CNPJ 98.765.432/0001-11, com sede em Campinas-SP, pelo prazo de 2 (dois) anos, na atividade de vigilância patrimonial, nos termos do art. 19 do Decreto 89.056/83."
Saída esperada:
{"empresas": [{"cnpj": "98.765.432/0001-11", "razao_social": "ALFA SEGURANÇA PATRIMONIAL S.A.", "uf": "SP", "municipio": "Campinas", "tipo_evento": "alvara_renovado", "resumo": "Renovação de alvará de vigilância patrimonial por 2 anos na DELESP/SP", "sinal_urgencia": 5, "motivo_urgencia": "Empresa ativa e em conformidade — momento ideal para oferecer serviços de gestão contínua de compliance"}]}

[EXEMPLO 3 — Vigilância sanitária → ignorar]
Publicação: "AGÊNCIA NACIONAL DE VIGILÂNCIA SANITÁRIA — ANVISA. RESOLUÇÃO RDC Nº 786/2025. Dispõe sobre boas práticas de fabricação para produtos farmacêuticos. A Diretora-Presidente da ANVISA, no uso das atribuições, RESOLVE aprovar as boas práticas de fabricação para medicamentos sujeitos a regime especial de controle."
Saída esperada:
{"empresas": []}
---`;


async function candidatesFromPublicacoes(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  date: string,
  tokenTracker: TokenTracker
): Promise<ProspectCandidate[]> {
  // Busca publicações do dia — usa texto_completo (nome real da coluna)
  // Filtra as que JÁ têm alvará via subquery: publica sem alvará = casos "fuzzy"
  // (dou_alvaras.publicacao_id aponta para dou_publicacoes, não o contrário)
  const { data: alvarasPubIds } = await supabase
    .from("dou_alvaras")
    .select("publicacao_id");
  const alvaraIds = new Set((alvarasPubIds ?? []).map((r: { publicacao_id: string }) => r.publicacao_id).filter(Boolean));

  const { data: publicacoes } = await supabase
    .from("dou_publicacoes")
    .select("id, titulo, texto_completo, resumo, data_publicacao, url_publicacao, secao")
    .eq("data_publicacao", date)
    .limit(80);

  // Mantém apenas as que NÃO têm alvará estruturado (evita reprocessar dados já estruturados)
  const fuzzyPubs = (publicacoes ?? []).filter(p => !alvaraIds.has(p.id));

  if (fuzzyPubs.length === 0) return [];

  if (!publicacoes || publicacoes.length === 0) return [];

  const anthropic = getAnthropicClient();
  const candidates: ProspectCandidate[] = [];

  // Agrupa em batches de 5 publicações por chamada (economiza tokens)
  const batchSize = 5;
  for (let i = 0; i < publicacoes.length; i += batchSize) {
    const batch = publicacoes.slice(i, i + batchSize);
    const batchText = batch
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((p, idx) => `[${idx + 1}] ${p.titulo}\n${(p as any).resumo ?? (p as any).texto_completo ?? ""}`.slice(0, 2000))
      .join("\n\n---\n\n");

    try {
      const response = await anthropic.messages.create({
        model: AI_MODELS.fast, // Haiku — velocidade e custo
        max_tokens: 1500,
        system: [{ type: "text", text: PROSPECTOR_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: `DATA: ${date}\n\nPUBLICAÇÕES:\n${batchText}` }],
      });

      tokenTracker.track(response.usage);

      const text = response.content[0].type === "text" ? response.content[0].text : "{}";
      const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}");

      for (const e of (parsed.empresas ?? [])) {
        const cnpjLimpo = e.cnpj?.replace(/\D/g, "") || null;
        const score = Math.min(100, (e.sinal_urgencia ?? 5) * 8);
        candidates.push({
          cnpj: e.cnpj || null,
          cnpjLimpo,
          razaoSocial: e.razao_social,
          uf: e.uf || null,
          municipio: e.municipio || null,
          tipoEvento: e.tipo_evento ?? "outro",
          resumo: e.resumo ?? "",
          sinalUrgencia: e.sinal_urgencia ?? 5,
          scoreBase: score,
          fonte: "publicacao_ia",
          sourceId: batch[0].id, // referência à primeira pub do batch
          dataPublicacao: date,
        });
      }
    } catch {
      // Batch falhou — continua com próximo
    }
  }

  return candidates;
}

// ─── Deduplicação ─────────────────────────────────────────────────────────────

function deduplicateCandidates(candidates: ProspectCandidate[]): ProspectCandidate[] {
  const map = new Map<string, ProspectCandidate>();
  for (const c of candidates) {
    const key = c.cnpjLimpo ?? c.razaoSocial.toLowerCase().trim().slice(0, 30);
    const existing = map.get(key);
    // Alvará estruturado tem prioridade sobre IA; dentre iguais, maior score
    if (!existing
      || (c.fonte === "alvara_estruturado" && existing.fonte !== "alvara_estruturado")
      || (c.fonte === existing.fonte && c.scoreBase > existing.scoreBase)
    ) {
      map.set(key, c);
    }
  }
  return Array.from(map.values());
}

// ─── Camada 3: Outreach Personalizado ────────────────────────────────────────

async function enqueueOutreach(
  prospectId: string,
  prospectEmail: string,
  candidate: ProspectCandidate,
  supabase: ReturnType<typeof createSupabaseAdmin>
): Promise<boolean> {
  const COOLDOWN_DAYS = 30;
  const cutoff = new Date(Date.now() - COOLDOWN_DAYS * 86_400_000).toISOString();

  // Verifica cooldown: não envia para o mesmo email nos últimos 30 dias
  const { data: recent } = await supabase
    .from("email_outbound")
    .select("id")
    .eq("to_email", prospectEmail)
    .eq("template_id", "I")
    .gte("created_at", cutoff)
    .limit(1)
    .maybeSingle();

  if (recent) return false; // já em cooldown

  // Verifica opt-out: prospect pediu para não receber mais contatos
  if (await isProspectOptOut(supabase, prospectId)) return false;

  const cnpjFormatado = candidate.cnpjLimpo
    ? candidate.cnpjLimpo.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
    : candidate.cnpj ?? "";

  await getEmailSendQueue().add(
    `outreach-${prospectId}-${candidate.dataPublicacao}`,
    {
      companyId: null,
      prospectId,
      templateId: "I",
      mode: "CLIENTE_HTML",
      to: prospectEmail,
      subject: `Relatório regulatório gratuito — ${candidate.razaoSocial}`,
      payload: {
        razaoSocial: candidate.razaoSocial,
        cnpj: cnpjFormatado,
        dataPublicacao: candidate.dataPublicacao.split("-").reverse().join("/"),
        tipoPublicacao: candidate.tipoEvento.replace(/_/g, " "),
        resumoPublicacao: candidate.resumo,
        uf: candidate.uf,
        score: candidate.scoreBase,
        motivoUrgencia: candidate.sinalUrgencia >= 7
          ? "Identificamos uma publicação que pode impactar sua operação e exige atenção regulatória imediata."
          : "Monitoramos o Diário Oficial e identificamos sua empresa em uma publicação recente.",
        linkRelatorio: `https://app.vigi.com.br/relatorio/${prospectId}`,
      },
    },
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 60_000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    }
  );

  return true;
}

// ─── Processamento por data ───────────────────────────────────────────────────

async function processDate(
  date: string,
  supabase: ReturnType<typeof createSupabaseAdmin>,
  tokenTracker: TokenTracker,
  result: ProspectorResult,
  force: boolean
): Promise<void> {
  // Verifica se esta data já foi processada (idempotência)
  if (!force) {
    const { data: existing } = await supabase
      .from("system_events")
      .select("id")
      .eq("tipo", "prospector_date_done")
      .eq("detalhes->>date", date)
      .maybeSingle();
    if (existing) return; // já processado, pula
  }

  // Camada 1: alvarás estruturados
  const alvaraCandidates = await candidatesFromAlvaras(supabase, date);
  result.totalAlvarasAnalyzed += alvaraCandidates.length;

  // Camada 2: publicações fuzzy via IA
  const iaCandidates = await candidatesFromPublicacoes(supabase, date, tokenTracker);
  result.totalPublicacoesAnalyzed += iaCandidates.length;

  // Deduplicação cross-camada
  const allCandidates = deduplicateCandidates([...alvaraCandidates, ...iaCandidates]);

  for (const candidate of allCandidates) {
    try {
      await processCandidate(candidate, supabase, result);
    } catch (err) {
      result.errors.push(`[${date}] ${candidate.razaoSocial}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Marca data como processada
  await supabase.from("system_events").insert({
    tipo: "prospector_date_done",
    severidade: "info",
    mensagem: `Prospector ${date}: ${result.newProspectsCreated} novos, ${result.existingProspectsUpdated} atualizados`,
    detalhes: { date, alvaras: alvaraCandidates.length, ia: iaCandidates.length },
  });
}

async function processCandidate(
  candidate: ProspectCandidate,
  supabase: ReturnType<typeof createSupabaseAdmin>,
  result: ProspectorResult
): Promise<void> {
  const cnpjLimpo = candidate.cnpjLimpo;

  // ── Check 1: Já é cliente VIGI? ──
  if (cnpjLimpo) {
    const { data: company } = await supabase
      .from("companies")
      .select("id")
      .eq("cnpj", cnpjLimpo)
      .maybeSingle();
    if (company) { result.existingClientsSkipped++; return; }
  }

  // ── Check 2: Prospect existente? ──
  let prospect: { id: string; score: number; tags: string[]; email: string | null; email_contato: string | null; status: string; razao_social: string } | null = null;

  if (cnpjLimpo) {
    const { data } = await supabase
      .from("prospects")
      .select("id, score, tags, email, email_contato, status, razao_social")
      .eq("cnpj", cnpjLimpo)
      .maybeSingle();
    prospect = data;
  }

  if (!prospect && candidate.razaoSocial) {
    const { data } = await supabase
      .from("prospects")
      .select("id, score, tags, email, email_contato, status, razao_social")
      .ilike("razao_social", `%${candidate.razaoSocial.slice(0, 25)}%`)
      .maybeSingle();
    prospect = data;
  }

  if (prospect) {
    // ── Update prospect existente ──
    const novoScore = Math.min(100, Math.max(prospect.score ?? 0, candidate.scoreBase));
    const novaTemp = temperaturaFromScore(novoScore, candidate.tipoEvento);
    const tags = [...new Set([...(prospect.tags ?? []), `dou_${candidate.dataPublicacao}`, candidate.tipoEvento])].slice(-15);

    await supabase.from("prospects").update({
      score: novoScore,
      temperatura: novaTemp,
      tags,
      updated_at: new Date().toISOString(),
    }).eq("id", prospect.id);

    await supabase.from("prospect_activities").insert({
      prospect_id: prospect.id,
      tipo: "nota",
      descricao: `[DOU ${candidate.dataPublicacao}] ${candidate.tipoEvento}: ${candidate.resumo}`,
      realizado_por: "agente_prospector",
    });

    // Outreach se tem email e não é ganho/perdido
    const email = prospect.email || prospect.email_contato;
    if (email && !["ganho", "perdido"].includes(prospect.status)) {
      const enviou = await enqueueOutreach(prospect.id, email, candidate, supabase);
      if (enviou) {
        result.outreachEmailsQueued++;
        if (prospect.status === "novo") {
          await supabase.from("prospects").update({ status: "contatado" }).eq("id", prospect.id);
        }
      }
    }

    // IML Event
    await emitEvent({
      eventType: "PROSPECT_QUALIFICADO",
      entityType: "prospect",
      entityId: prospect.id,
      agentName: "captador",
      severity: candidate.sinalUrgencia >= 7 ? "high" : "medium",
      metadata: { action: "prospect_updated_from_dou", score: novoScore, tipoEvento: candidate.tipoEvento },
    }).catch(() => {});

    result.existingProspectsUpdated++;
    return;
  }

  // ── Cria novo prospect ──
  const temperatura = temperaturaFromScore(candidate.scoreBase, candidate.tipoEvento);

  const { data: newProspect, error: insertError } = await supabase
    .from("prospects")
    .insert({
      cnpj: cnpjLimpo,
      razao_social: candidate.razaoSocial,
      uf: candidate.uf,
      status: "novo",
      source: "dou",
      temperatura,
      score: candidate.scoreBase,
      tags: [`dou_${candidate.dataPublicacao}`, candidate.tipoEvento],
      observacoes: `Detectada no DOU ${candidate.dataPublicacao}: ${candidate.resumo}`,
    })
    .select("id")
    .single();

  if (insertError || !newProspect) {
    throw new Error(`Insert falhou: ${insertError?.message}`);
  }

  // Atividade inicial
  await supabase.from("prospect_activities").insert({
    prospect_id: newProspect.id,
    tipo: "nota",
    descricao: `[DOU ${candidate.dataPublicacao}] Empresa detectada. Tipo: ${candidate.tipoEvento}. Urgência: ${candidate.sinalUrgencia}/10. ${candidate.resumo}`,
    realizado_por: "agente_prospector",
  });

  // Enriquecimento CNPJ (não-bloqueante)
  enrichProspect(newProspect.id).catch(() => {});

  // IML Event
  await emitEvent({
    eventType: "PROSPECT_QUALIFICADO",
    entityType: "prospect",
    entityId: newProspect.id,
    agentName: "captador",
    severity: candidate.sinalUrgencia >= 8 ? "high" : "medium",
    metadata: { action: "new_prospect_from_dou", tipoEvento: candidate.tipoEvento, score: candidate.scoreBase, fonte: candidate.fonte },
  }).catch(() => {});

  result.newProspectsCreated++;
}

// ─── Entry Points Públicos ────────────────────────────────────────────────────

/**
 * Processa prospecção de um dia específico.
 * Chamado pelo douWorker após o scrape/parse do DOU.
 */
export async function runProspectorDaily(
  date: string,
  force = false
): Promise<ProspectorResult> {
  const supabase = createSupabaseAdmin();
  const tokenTracker = new TokenTracker("prospector");
  const result: ProspectorResult = {
    datesProcessed: [],
    totalAlvarasAnalyzed: 0,
    totalPublicacoesAnalyzed: 0,
    newProspectsCreated: 0,
    existingProspectsUpdated: 0,
    existingClientsSkipped: 0,
    outreachEmailsQueued: 0,
    errors: [],
    tokenUsage: { input: 0, output: 0 },
  };

  const runResult = await startAgentRun({
    agent_name: "captador",
    run_type: "cron",
  });
  const runId = typeof runResult === "string" ? runResult : runResult.runId;

  try {
    await logAgentDecision({ run_id: runId, agent_name: "captador", decision_type: "prospector_start", detalhes: { date } });
    await processDate(date, supabase, tokenTracker, result, force);
    result.datesProcessed.push(date);
    result.tokenUsage = { input: tokenTracker.totalInputTokens, output: tokenTracker.totalOutputTokens };

    await logAgentDecision({ run_id: runId, agent_name: "captador", decision_type: "prospector_done", detalhes: result });
    await completeAgentRun(runId, "captador", "completed", result as unknown as Record<string, unknown>);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(msg);
    await completeAgentRun(runId, "captador", "failed", { error: msg });
  }

  return result;
}

/**
 * Backfill: processa range de datas (ex: mês inteiro).
 * Idempotente — pula datas já processadas (a não ser que force=true).
 */
export async function runProspectorBackfill(
  dateFrom: string,
  dateTo: string,
  force = false
): Promise<ProspectorResult> {
  const supabase = createSupabaseAdmin();
  const tokenTracker = new TokenTracker("prospector_backfill");
  const result: ProspectorResult = {
    datesProcessed: [],
    totalAlvarasAnalyzed: 0,
    totalPublicacoesAnalyzed: 0,
    newProspectsCreated: 0,
    existingProspectsUpdated: 0,
    existingClientsSkipped: 0,
    outreachEmailsQueued: 0,
    errors: [],
    tokenUsage: { input: 0, output: 0 },
  };

  const runResult = await startAgentRun({
    agent_name: "captador",
    run_type: "manual",
  });
  const runId = typeof runResult === "string" ? runResult : runResult.runId;

  try {
    // Gera lista de datas (dias úteis: seg-sex)
    const dates = generateBusinessDays(dateFrom, dateTo);
    await logAgentDecision({ run_id: runId, agent_name: "captador", decision_type: "backfill_start", detalhes: { dateFrom, dateTo, totalDays: dates.length } });

    for (const date of dates) {
      try {
        await processDate(date, supabase, tokenTracker, result, force);
        result.datesProcessed.push(date);
      } catch (err) {
        result.errors.push(`[${date}] ${err instanceof Error ? err.message : String(err)}`);
      }
      // Pausa entre datas para não sobrecarregar APIs
      await new Promise(r => setTimeout(r, 500));
    }

    result.tokenUsage = { input: tokenTracker.totalInputTokens, output: tokenTracker.totalOutputTokens };
    await completeAgentRun(runId, "captador", "completed", result as unknown as Record<string, unknown>);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(msg);
    await completeAgentRun(runId, "captador", "failed", { error: msg });
  }

  return result;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateBusinessDays(from: string, to: string): string[] {
  const dates: string[] = [];
  const current = new Date(from + "T12:00:00Z");
  const end = new Date(to + "T12:00:00Z");

  while (current <= end) {
    const dow = current.getUTCDay();
    if (dow >= 1 && dow <= 5) { // seg=1 ... sex=5
      dates.push(current.toISOString().split("T")[0]);
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}
