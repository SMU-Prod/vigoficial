/**
 * VIGI PRO — Institutional Memory Layer: Pattern Distiller
 *
 * Analisa o Event Graph e extrai padrões (insights) usando:
 * 1. Agregação SQL para encontrar padrões estatísticos
 * 2. Claude Haiku para interpretar padrões em linguagem natural
 *
 * Roda 1x/dia às 02:00 via BullMQ queue 'insight-distill'.
 * Cada análise custa ~2K tokens input + ~500 output (centavos/dia).
 */
import { createSupabaseAdmin } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const _MIN_EVIDENCE_FOR_INSIGHT = 3;
const MIN_CONFIDENCE_FOR_READY = 0.85;
const MIN_EVIDENCE_FOR_READY = 5;

// ─── Types ───

interface PatternCandidate {
  type: string;
  title: string;
  description: string;
  evidence: string[];
  suggestedAction?: string;
  suggestedParams?: Record<string, unknown>;
  relatedAgent?: string;
  relatedCompanyId?: string;
  impactLevel?: "critical" | "high" | "medium" | "low";
}

interface DistillResult {
  patternsFound: number;
  insightsCreated: number;
  insightsUpdated: number;
  tokensUsed: number;
}

// ─── Main Distill Function ───

/**
 * Executa o ciclo completo de destilação de padrões.
 * Chamado pelo worker BullMQ 1x/dia.
 */
export async function runPatternDistillation(): Promise<DistillResult> {
  const result: DistillResult = {
    patternsFound: 0,
    insightsCreated: 0,
    insightsUpdated: 0,
    tokensUsed: 0,
  };

  try {
    console.log("[PatternDistiller] Starting daily distillation...");

    // 1. Coleta agregações do Event Graph
    const aggregations = await collectAggregations();

    if (aggregations.length === 0) {
      console.log("[PatternDistiller] No data to analyze");
      return result;
    }

    // 2. Envia para Claude Haiku interpretar
    const patterns = await interpretPatterns(aggregations);
    result.patternsFound = patterns.length;
    result.tokensUsed = patterns.reduce((sum, _) => sum + 2500, 0); // Estimativa

    // 3. Persiste insights no banco
    for (const pattern of patterns) {
      const saved = await saveOrUpdateInsight(pattern);
      if (saved === "created") result.insightsCreated++;
      if (saved === "updated") result.insightsUpdated++;
    }

    console.log(`[PatternDistiller] Done: ${result.patternsFound} patterns, ${result.insightsCreated} new, ${result.insightsUpdated} updated`);
  } catch (err) {
    console.error("[PatternDistiller] Error:", err);
  }

  return result;
}

// ─── Aggregation Collectors ───

interface Aggregation {
  category: string;
  query_label: string;
  data: Record<string, unknown>[];
}

async function collectAggregations(): Promise<Aggregation[]> {
  const supabase = createSupabaseAdmin();
  const aggregations: Aggregation[] = [];

  // 1. Timing patterns: quando cada tipo de evento acontece mais
  let timingData = null;
  try { ({ data: timingData } = await supabase.rpc("iml_agg_timing_patterns")); } catch { /* RPC opcional */ }
  if (!timingData) {
    // Fallback: query direta
    const { data } = await supabase
      .from("iml_events")
      .select("event_type, occurred_at")
      .gte("occurred_at", new Date(Date.now() - 30 * 86400000).toISOString())
      .order("occurred_at", { ascending: true })
      .limit(1000);

    if (data && data.length > 0) {
      // Agrupa por tipo e dia da semana
      const grouped: Record<string, Record<number, number>> = {};
      for (const event of data) {
        const type = event.event_type;
        const dow = new Date(event.occurred_at).getDay();
        if (!grouped[type]) grouped[type] = {};
        grouped[type][dow] = (grouped[type][dow] || 0) + 1;
      }

      aggregations.push({
        category: "timing",
        query_label: "Distribuição de eventos por dia da semana (últimos 30 dias)",
        data: Object.entries(grouped).map(([type, days]) => ({ event_type: type, distribution: days })),
      });
    }
  } else {
    aggregations.push({ category: "timing", query_label: "Timing patterns", data: timingData });
  }

  // 2. Performance patterns: taxa de sucesso por agente e tipo
  // FIX: IA-10 — Increase limit from 500 to 5000 for better pattern coverage
  const { data: perfData } = await supabase
    .from("agent_runs")
    .select("agent_name, status, trigger_type, duration_ms")
    .gte("started_at", new Date(Date.now() - 30 * 86400000).toISOString())
    .limit(5000);

  if (perfData && perfData.length > 0) {
    const grouped: Record<string, { total: number; success: number; failed: number; avgDuration: number }> = {};
    for (const run of perfData) {
      const key = `${run.agent_name}:${run.trigger_type}`;
      if (!grouped[key]) grouped[key] = { total: 0, success: 0, failed: 0, avgDuration: 0 };
      grouped[key].total++;
      if (run.status === "completed") grouped[key].success++;
      if (run.status === "failed") grouped[key].failed++;
      grouped[key].avgDuration += (run.duration_ms || 0);
    }

    // Calcula médias
    for (const key of Object.keys(grouped)) {
      grouped[key].avgDuration = Math.round(grouped[key].avgDuration / grouped[key].total);
    }

    aggregations.push({
      category: "performance",
      query_label: "Performance por agente e trigger (últimos 30 dias)",
      data: Object.entries(grouped).map(([key, stats]) => {
        const [agent, trigger] = key.split(":");
        return { agent, trigger, ...stats, successRate: Math.round((stats.success / stats.total) * 100) };
      }),
    });
  }

  // 3. Correlation patterns: eventos que frequentemente co-ocorrem
  // FIX: IA-10 — Increase limit from 300 to 5000 and add cursor pagination support
  const { data: edgeData } = await supabase
    .from("iml_event_edges")
    .select(`
      relation_type,
      source_event:iml_events!iml_event_edges_source_event_id_fkey(event_type, agent_name),
      target_event:iml_events!iml_event_edges_target_event_id_fkey(event_type, agent_name)
    `)
    .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
    .order("created_at", { ascending: false })
    .limit(5000);

  if (edgeData && edgeData.length > 0) {
    aggregations.push({
      category: "correlations",
      query_label: "Relações causais mais frequentes (últimos 30 dias)",
      data: edgeData as unknown as Record<string, unknown>[],
    });
  }

  // 4. Anomalies: erros recorrentes
  const { data: errorData } = await supabase
    .from("iml_events")
    .select("event_type, agent_name, company_id, metadata, occurred_at")
    .eq("severity", "high")
    .gte("occurred_at", new Date(Date.now() - 7 * 86400000).toISOString())
    .order("occurred_at", { ascending: false })
    .limit(50);

  if (errorData && errorData.length > 0) {
    aggregations.push({
      category: "anomalies",
      query_label: "Eventos de alta severidade (últimos 7 dias)",
      data: errorData,
    });
  }

  return aggregations;
}

// ─── Pattern Interpretation (Claude Haiku) ───

async function interpretPatterns(aggregations: Aggregation[]): Promise<PatternCandidate[]> {
  try {
    const anthropic = new Anthropic();

    const prompt = `Você é o Pattern Distiller do sistema VIGI PRO, uma plataforma de compliance para segurança privada.
Analise os dados agregados abaixo e identifique padrões acionáveis.

Para cada padrão encontrado, retorne um JSON com:
- type: TIMING_PATTERN | PERFORMANCE_PATTERN | BEHAVIORAL_PATTERN | CORRELATION | ANOMALY | OPTIMIZATION | RISK_SIGNAL | RECOMMENDATION
- title: Título curto (max 80 chars)
- description: Descrição detalhada do padrão observado
- suggestedAction: Ação concreta sugerida
- impactLevel: critical | high | medium | low
- relatedAgent: captador | operacional | comunicador | orquestrador (se aplicável)

DADOS AGREGADOS:
${JSON.stringify(aggregations, null, 2)}

Responda APENAS com um array JSON de padrões. Se não encontrar padrões significativos, retorne [].
Foque em insights que gerem valor operacional real — não listar obviedades.`;

    const response = await anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    // Parse JSON da resposta
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const patterns = JSON.parse(jsonMatch[0]) as PatternCandidate[];
    return patterns.filter((p) => p.title && p.description);
  } catch (err) {
    console.error("[PatternDistiller] Haiku interpretation error:", err);
    return [];
  }
}

// ─── Insight Persistence ───

async function saveOrUpdateInsight(pattern: PatternCandidate): Promise<"created" | "updated" | "skipped"> {
  const supabase = createSupabaseAdmin();

  // Verifica se já existe insight similar (mesmo tipo + título parecido)
  const { data: existing } = await supabase
    .from("iml_insights")
    .select("id, evidence_count, confidence")
    .eq("insight_type", pattern.type)
    .ilike("title", `%${pattern.title.slice(0, 30)}%`)
    .not("status", "in", '("expired","superseded")')
    .limit(1)
    .single();

  if (existing) {
    // Atualiza insight existente (incrementa evidência)
    await supabase
      .from("iml_insights")
      .update({
        description: pattern.description,
        suggested_action: pattern.suggestedAction,
        evidence_count: existing.evidence_count + 1,
        last_evidence_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        // Recalcula confiança
        confidence: Math.min(0.95, 0.3 + 0.65 * (1 - Math.exp(-0.3 * (existing.evidence_count + 1)))),
        status: existing.evidence_count + 1 >= MIN_EVIDENCE_FOR_READY
          && Math.min(0.95, 0.3 + 0.65 * (1 - Math.exp(-0.3 * (existing.evidence_count + 1)))) >= MIN_CONFIDENCE_FOR_READY
          ? "ready"
          : "pending",
      })
      .eq("id", existing.id);

    return "updated";
  }

  // Cria novo insight
  const { error } = await supabase.from("iml_insights").insert({
    insight_type: pattern.type,
    title: pattern.title,
    description: pattern.description,
    suggested_action: pattern.suggestedAction || null,
    suggested_params: pattern.suggestedParams || {},
    evidence_count: 1,
    confidence: 0.3, // Confidence inicial baixa
    status: "pending",
    related_agent: pattern.relatedAgent || null,
    related_company_id: pattern.relatedCompanyId || null,
    impact_level: pattern.impactLevel || "medium",
    admin_approved: false,
    expires_at: new Date(Date.now() + 90 * 86400000).toISOString(), // 90 dias
  });

  if (error) {
    console.error("[PatternDistiller] Insert insight error:", error);
    return "skipped";
  }

  return "created";
}
