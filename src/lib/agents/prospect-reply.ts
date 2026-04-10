/**
 * VIGI — Classificação de Respostas de Prospects
 *
 * Quando um prospect responde ao email de prospecção (Template I),
 * este módulo classifica a intenção da resposta e avança o pipeline.
 *
 * FLUXO:
 *   1. Inbound route detecta "Re: Relatório regulatório gratuito —" no subject
 *   2. Despacha job "inbound.prospect_reply" para a fila "email-read"
 *   3. emailReadWorker chama processProspectReply()
 *   4. Haiku classifica intenção (positiva/negativa/neutra/fora_contexto)
 *   5. Prospect é atualizado: score, temperatura, status, activities
 *   6. Se positivo: status → "reuniao_agendada" ou "proposta_enviada" + alerta equipe
 *   7. Se negativo: tag "opt_out" adicionada, cooldown estendido para 90 dias
 */

import { getAnthropicClient, AI_MODELS } from "@/lib/ai/client";
import { startAgentRun, completeAgentRun, logAgentDecision } from "@/lib/agents/base";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { emitEvent } from "@/lib/iml/event-graph";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ReplyIntencao =
  | "positiva"       // Quer saber mais, pediu proposta, agendou reunião
  | "negativa"       // Não tenho interesse, me remova da lista
  | "neutra"         // Dúvida, pediu mais info sem compromisso
  | "fora_contexto"; // Email fora do contexto (forward acidental, OOO, etc.)

export interface ProspectReplyResult {
  prospectId: string | null;
  intencao: ReplyIntencao;
  confianca: number;
  resumo: string;
  acaoTomada: string;
}

// ─── Prompt de Classificação ──────────────────────────────────────────────────

const REPLY_CLASSIFIER_PROMPT = `Você é um especialista em vendas B2B para o setor de segurança privada no Brasil.
Classifique a resposta deste prospect ao nosso email de prospecção da VIGI (plataforma de compliance para segurança privada).

Retorne JSON:
{
  "intencao": "positiva|negativa|neutra|fora_contexto",
  "confianca": 0.0-1.0,
  "resumo": "Uma frase resumindo a resposta do prospect",
  "proxima_acao": "O que a equipe comercial deve fazer agora"
}

Critérios:
- POSITIVA: Demonstra interesse (quer proposta, pede demonstração, pergunta preço, quer reunião, elogiou, disse "me interessei")
- NEGATIVA: Recusa clara (não tenho interesse, me remova, não precisamos, já temos fornecedor)
- NEUTRA: Dúvida sobre o produto/serviço, pediu mais informações sem compromisso, perguntou como funciona
- FORA_CONTEXTO: Auto-reply, out of office, email encaminhado erroneamente, spam

IMPORTANTE: Se o email parece ser de outra pessoa que não o decisor (ex: "encaminhar para RH"), classifique como NEUTRA.`;

// ─── Detecção de Reply de Prospecção ─────────────────────────────────────────

/** Padrão de assunto dos emails de prospecção enviados pelo Template I */
const OUTREACH_SUBJECT_PATTERN = "relatório regulatório gratuito";
const OUTREACH_SUBJECT_RE_PATTERN = /^re:/i;

/**
 * Verifica se um email inbound é uma resposta ao nosso email de prospecção.
 * Critério: subject começa com "Re:" E contém nosso padrão de assunto.
 */
export function isProspectReply(subject: string): boolean {
  const subjectLower = subject.toLowerCase();
  return (
    OUTREACH_SUBJECT_RE_PATTERN.test(subject.trim()) &&
    subjectLower.includes(OUTREACH_SUBJECT_PATTERN)
  );
}

// ─── Processamento Principal ──────────────────────────────────────────────────

/**
 * Processa uma resposta de prospect ao email de prospecção.
 *
 * @param inboundId - ID do registro em email_inbound
 * @param fromEmail - Email do prospect que respondeu
 * @param subject   - Assunto do email de resposta
 * @param bodyText  - Corpo do email em texto
 */
export async function processProspectReply(
  inboundId: string,
  fromEmail: string,
  subject: string,
  bodyText: string
): Promise<ProspectReplyResult> {
  const supabase = createSupabaseAdmin();
  const anthropic = getAnthropicClient();

  const result: ProspectReplyResult = {
    prospectId: null,
    intencao: "fora_contexto",
    confianca: 0,
    resumo: "",
    acaoTomada: "nenhuma",
  };

  // ── Inicia agent_run para rastreamento na página de Agentes ──
  const runResult = await startAgentRun({
    agent_name: "captador",
    run_type: "webhook",
    input_data: { inbound_id: inboundId, from_email: fromEmail, subject },
  });
  const runId = typeof runResult === "string" ? runResult : runResult.runId;

  try {
    // ── 1. Classifica intenção com Haiku ──
    const response = await anthropic.messages.create({
      model: AI_MODELS.fast,
      max_tokens: 512,
      system: [{ type: "text", text: REPLY_CLASSIFIER_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{
        role: "user",
        content: `De: ${fromEmail}\nAssunto: ${subject}\n\nCorpo:\n${bodyText.slice(0, 2000)}`,
      }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "{}";
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}");

    result.intencao = (parsed.intencao as ReplyIntencao) ?? "fora_contexto";
    result.confianca = parseFloat(parsed.confianca) || 0;
    result.resumo = parsed.resumo ?? "";
    const proximaAcao: string = parsed.proxima_acao ?? "";

    // Loga decisão de classificação
    await logAgentDecision({
      run_id: runId,
      agent_name: "captador",
      decision_type: "prospect_reply_classified",
      detalhes: {
        from_email: fromEmail,
        intencao: result.intencao,
        confianca: result.confianca,
        resumo: result.resumo,
        proxima_acao: proximaAcao,
        tokens_used: response.usage.input_tokens + response.usage.output_tokens,
      },
    });

    // ── 2. Localiza prospect pelo email ──
    const { data: prospect } = await supabase
      .from("prospects")
      .select("id, score, temperatura, status, razao_social, tags")
      .or(`email.eq.${fromEmail},email_contato.eq.${fromEmail}`)
      .maybeSingle();

    if (!prospect) {
      await supabase
        .from("email_inbound")
        .update({ status: "processado", tipo_demanda: "prospect_reply_sem_match" })
        .eq("id", inboundId);
      result.acaoTomada = "prospect_nao_encontrado";

      await logAgentDecision({
        run_id: runId,
        agent_name: "captador",
        decision_type: "prospect_reply_no_match",
        detalhes: { from_email: fromEmail, motivo: "Nenhum prospect encontrado com esse email" },
      });
      await completeAgentRun(runId, "captador", "completed", result as unknown as Record<string, unknown>);
      return result;
    }

    result.prospectId = prospect.id;

    // ── 3. Aplica ação baseada na intenção ──
    await applyReplyAction(prospect, result, proximaAcao, supabase);

    // Loga ação tomada
    await logAgentDecision({
      run_id: runId,
      agent_name: "captador",
      decision_type: "prospect_reply_action",
      detalhes: {
        prospect_id: prospect.id,
        razao_social: prospect.razao_social,
        intencao: result.intencao,
        acao_tomada: result.acaoTomada,
      },
    });

    // ── 4. Marca inbound como processado ──
    await supabase
      .from("email_inbound")
      .update({
        status: "processado",
        tipo_demanda: `prospect_reply_${result.intencao}`,
        confidence_score: result.confianca,
        parser_resultado: {
          intencao: result.intencao,
          resumo: result.resumo,
          proxima_acao: proximaAcao,
          prospect_id: prospect.id,
        },
      })
      .eq("id", inboundId);

    await completeAgentRun(runId, "captador", "completed", result as unknown as Record<string, unknown>);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.acaoTomada = `erro: ${msg}`;
    void supabase
      .from("email_inbound")
      .update({ status: "erro", tipo_demanda: "prospect_reply_erro" })
      .eq("id", inboundId);
    await completeAgentRun(runId, "captador", "failed", { error: msg });
  }

  return result;
}

// ─── Aplicação de Ação por Intenção ──────────────────────────────────────────

async function applyReplyAction(
  prospect: {
    id: string;
    score: number;
    temperatura: string;
    status: string;
    razao_social: string;
    tags: string[];
  },
  result: ProspectReplyResult,
  proximaAcao: string,
  supabase: ReturnType<typeof createSupabaseAdmin>
): Promise<void> {
  const now = new Date().toISOString();

  switch (result.intencao) {
    case "positiva": {
      // Prospect demonstrou interesse → avança no pipeline
      const novoScore = Math.min(100, (prospect.score ?? 0) + 30);
      const novoStatus = prospect.status === "contatado" ? "reuniao_agendada" : prospect.status;

      await supabase.from("prospects").update({
        score: novoScore,
        temperatura: "quente",
        status: novoStatus,
        tags: [...new Set([...(prospect.tags ?? []), "respondeu_positivo", "alta_prioridade"])].slice(-15),
        updated_at: now,
      }).eq("id", prospect.id);

      await supabase.from("prospect_activities").insert({
        prospect_id: prospect.id,
        tipo: "email_resposta",
        descricao: `[Reply Positivo] ${result.resumo}. Próxima ação: ${proximaAcao}. Score: ${novoScore} (+30).`,
        realizado_por: "agente_captador",
      });

      // IML event — sinal de alta intenção
      await emitEvent({
        eventType: "PROSPECT_QUALIFICADO",
        entityType: "prospect",
        entityId: prospect.id,
        agentName: "captador",
        severity: "high",
        metadata: {
          action: "prospect_replied_positive",
          intencao: result.intencao,
          novoScore,
          novoStatus,
          resumo: result.resumo,
        },
      }).catch(() => {});

      // Alerta para a equipe (sistema de notificação interno)
      await supabase.from("system_events").insert({
        tipo: "prospect_reply_positivo",
        severidade: "aviso",
        mensagem: `🔥 Prospect quente respondeu: ${prospect.razao_social} — "${result.resumo}"`,
        detalhes: {
          prospect_id: prospect.id,
          razao_social: prospect.razao_social,
          resumo: result.resumo,
          proxima_acao: proximaAcao,
          score: novoScore,
        },
      });

      result.acaoTomada = `pipeline_avancado:${novoStatus}`;
      break;
    }

    case "negativa": {
      // Prospect não tem interesse → respeita opt-out, estende cooldown
      const tags = [...new Set([...(prospect.tags ?? []), "opt_out", "nao_perturbar"])].slice(-15);

      await supabase.from("prospects").update({
        tags,
        temperatura: "frio",
        updated_at: now,
      }).eq("id", prospect.id);

      await supabase.from("prospect_activities").insert({
        prospect_id: prospect.id,
        tipo: "email_resposta",
        descricao: `[Reply Negativo] ${result.resumo}. Tag opt_out aplicada — pausa de 90 dias no outreach.`,
        realizado_por: "agente_captador",
      });

      // Registra opt-out para honrar o cooldown estendido no enqueueOutreach
      await supabase.from("system_events").insert({
        tipo: "prospect_opt_out",
        severidade: "info",
        mensagem: `Prospect solicitou não receber mais contatos: ${prospect.razao_social}`,
        detalhes: { prospect_id: prospect.id, razao_social: prospect.razao_social, resumo: result.resumo },
      });

      result.acaoTomada = "opt_out_registrado";
      break;
    }

    case "neutra": {
      // Dúvida ou pedido de mais informações → registra e alerta equipe
      const novoScore = Math.min(100, (prospect.score ?? 0) + 10);

      await supabase.from("prospects").update({
        score: novoScore,
        tags: [...new Set([...(prospect.tags ?? []), "respondeu_duvida"])].slice(-15),
        updated_at: now,
      }).eq("id", prospect.id);

      await supabase.from("prospect_activities").insert({
        prospect_id: prospect.id,
        tipo: "email_resposta",
        descricao: `[Reply Neutro] ${result.resumo}. Prospect pediu mais informações. Score: ${novoScore} (+10).`,
        realizado_por: "agente_captador",
      });

      await supabase.from("system_events").insert({
        tipo: "prospect_reply_neutro",
        severidade: "info",
        mensagem: `Prospect respondeu com dúvida: ${prospect.razao_social} — "${result.resumo}"`,
        detalhes: {
          prospect_id: prospect.id,
          razao_social: prospect.razao_social,
          resumo: result.resumo,
          proxima_acao: proximaAcao,
        },
      });

      result.acaoTomada = "duvida_registrada";
      break;
    }

    case "fora_contexto":
    default: {
      // Auto-reply, OOO etc. → ignora, não atualiza prospect
      result.acaoTomada = "ignorado_fora_contexto";
      break;
    }
  }
}

// ─── Verificação de Opt-Out ───────────────────────────────────────────────────

/**
 * Verifica se um prospect está em opt-out antes de enviar outreach.
 * Usar em enqueueOutreach() para honrar pedidos de remoção da lista.
 */
export async function isProspectOptOut(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  prospectId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("prospects")
    .select("tags")
    .eq("id", prospectId)
    .maybeSingle();

  if (!data?.tags) return false;
  return (data.tags as string[]).includes("opt_out");
}
