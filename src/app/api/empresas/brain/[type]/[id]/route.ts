import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getAuthFromRequest, requireRole } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";

/**
 * GET /api/empresas/brain/:type/:id
 *
 * Retorna TODO o conhecimento do sistema sobre uma empresa ou prospect.
 * Agrega de múltiplas tabelas em paralelo. Estrutura do payload:
 *
 *   {
 *     base: {...},               // dados primários (companies ou prospects)
 *     enriquecimento: {...},     // CNAE, porte, capital social, RFB
 *     compliance: { alvara, alertas, validades_criticas },
 *     vigilantes: [...],         // employees + contagens por situação
 *     frota: { veiculos, manutencoes },
 *     armas_coletes: { armas, coletes },
 *     gesp: { tasks, sessions, snapshots, procuracoes, approvals },
 *     emails: { threads, inbound, outbound, workflows },
 *     dou: { alvaras, publicacoes, alertas },
 *     billing: { history },
 *     prospect: { activities },  // só se type=prospect
 *     ai: { agent_runs, decisions, iml_events },
 *     discrepancias: [...],
 *     notifications: [...]
 *   }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "viewer");
  if (denied) return denied;

  const { type, id } = await params;
  if (type !== "company" && type !== "prospect") {
    return NextResponse.json({ error: "type inválido" }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdmin();

    // ─── Carregar registro base ───
    let base: Record<string, unknown> | null = null;
    let cnpj: string | null = null;
    let companyId: string | null = null;

    if (type === "company") {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw new Error(`base company: ${error.message}`);
      base = data;
      cnpj = (data as Record<string, unknown>)?.cnpj as string | null;
      companyId = id;
    } else {
      const { data, error } = await supabase
        .from("prospects")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw new Error(`base prospect: ${error.message}`);
      base = data;
      cnpj = (data as Record<string, unknown>)?.cnpj as string | null;
      // Se o prospect já foi convertido, busca a company associada
      companyId = (data as Record<string, unknown>)?.company_id as string | null;
    }

    if (!base) {
      return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    }

    // ─── Buscar TODAS as relações em paralelo ───
    // Para prospects sem company_id, várias queries retornam vazio (esperado).
    const cId = companyId;
    const safeFetch = async <T>(
      label: string,
      runner: () => Promise<{ data: T | null; error: { message: string } | null }>
    ): Promise<T | []> => {
      try {
        const { data, error } = await runner();
        if (error) {
          console.warn(`[BRAIN/${label}]`, error.message);
          return [] as unknown as T;
        }
        return (data || ([] as unknown as T)) as T;
      } catch (e) {
        console.warn(`[BRAIN/${label}]`, e);
        return [] as unknown as T;
      }
    };

    const empty: Promise<unknown[]> = Promise.resolve([]);

    const [
      employees,
      vehicles,
      vehicleMaintenance,
      weapons,
      vests,
      gespTasks,
      gespSessions,
      gespApprovals,
      gespSnapshots,
      procuracoes,
      threads,
      inbound,
      outbound,
      workflows,
      douAlvaras,
      douAlertas,
      billing,
      agentRuns,
      imlEvents,
      discrepancies,
      notifications,
      prospectActivities,
      filiais,
      instructions,
    ] = await Promise.all([
      // Vigilantes
      cId
        ? safeFetch("employees", () =>
            supabase
              .from("employees")
              .select(
                "id, nome_completo, cpf, funcao_principal, status, cnv_numero, cnv_data_validade, porte_arma_validade, colete_data_validade, reciclagem_data_validade, alertas_ativos, posto_designado, data_admissao"
              )
              .eq("company_id", cId)
              .order("nome_completo")
              .limit(500)
          )
        : empty,

      // Frota
      cId
        ? safeFetch("vehicles", () =>
            supabase
              .from("vehicles")
              .select("*")
              .eq("company_id", cId)
              .order("placa")
              .limit(200)
          )
        : empty,

      cId
        ? safeFetch("vehicle_maintenance", () =>
            supabase
              .from("vehicle_maintenance")
              .select("*")
              .eq("company_id", cId)
              .order("realizada_em", { ascending: false })
              .limit(50)
          )
        : empty,

      // Armas e coletes
      cId
        ? safeFetch("weapons", () =>
            supabase
              .from("weapons")
              .select("*")
              .eq("company_id", cId)
              .order("created_at", { ascending: false })
              .limit(100)
          )
        : empty,

      cId
        ? safeFetch("vests", () =>
            supabase
              .from("vests")
              .select("*")
              .eq("company_id", cId)
              .order("data_validade")
              .limit(100)
          )
        : empty,

      // GESP
      cId
        ? safeFetch("gesp_tasks", () =>
            supabase
              .from("gesp_tasks")
              .select(
                "id, tipo_acao, status, tentativas, protocolo_gesp, erro_detalhe, created_at, executed_at, completed_at"
              )
              .eq("company_id", cId)
              .order("created_at", { ascending: false })
              .limit(50)
          )
        : empty,

      cId
        ? safeFetch("gesp_sessions", () =>
            supabase
              .from("gesp_sessions")
              .select("*")
              .eq("company_id", cId)
              .order("started_at", { ascending: false })
              .limit(20)
          )
        : empty,

      cId
        ? safeFetch("gesp_approvals", () =>
            supabase
              .from("gesp_approvals")
              .select("*")
              .eq("company_id", cId)
              .order("requested_at", { ascending: false })
              .limit(20)
          )
        : empty,

      cId
        ? safeFetch("gesp_snapshots", () =>
            supabase
              .from("gesp_snapshots")
              .select("id, vigilantes_count, postos_count, armas_count, created_at")
              .eq("company_id", cId)
              .order("created_at", { ascending: false })
              .limit(10)
          )
        : empty,

      cId
        ? safeFetch("procuracoes", () =>
            supabase
              .from("procuracoes")
              .select("*")
              .eq("company_id", cId)
              .order("created_at", { ascending: false })
              .limit(10)
          )
        : empty,

      // Emails
      cId
        ? safeFetch("threads", () =>
            supabase
              .from("email_threads")
              .select("id, subject, status, tipo_demanda, created_at, updated_at")
              .eq("company_id", cId)
              .order("updated_at", { ascending: false })
              .limit(30)
          )
        : empty,

      cId
        ? safeFetch("inbound", () =>
            supabase
              .from("email_inbound")
              .select(
                "id, from_email, subject, tipo_demanda, status, confidence_score, received_at"
              )
              .eq("company_id", cId)
              .order("received_at", { ascending: false })
              .limit(30)
          )
        : empty,

      cId
        ? safeFetch("outbound", () =>
            supabase
              .from("email_outbound")
              .select(
                "id, template_id, mode, from_email, to_email, subject, status, erro_detalhe, sent_at, created_at"
              )
              .eq("company_id", cId)
              .order("created_at", { ascending: false })
              .limit(30)
          )
        : empty,

      cId
        ? safeFetch("workflows", () =>
            supabase
              .from("email_workflows")
              .select("id, tipo_demanda, prioridade, status, created_at, updated_at")
              .eq("company_id", cId)
              .order("created_at", { ascending: false })
              .limit(20)
          )
        : empty,

      // DOU — busca por CNPJ (funciona pra prospect também)
      cnpj
        ? safeFetch("dou_alvaras", () =>
            supabase
              .from("dou_alvaras")
              .select(
                "id, razao_social, tipo_alvara, subtipo, numero_processo, delegacia, uf, municipio, data_validade, texto_original, created_at"
              )
              .eq("cnpj_limpo", cnpj.replace(/\D/g, ""))
              .order("created_at", { ascending: false })
              .limit(20)
          )
        : empty,

      cnpj
        ? safeFetch("dou_alertas", () =>
            supabase
              .from("dou_alertas")
              .select(
                "id, tipo_alerta, titulo, mensagem, prioridade, status, enviado_em, created_at"
              )
              .eq("cnpj", cnpj)
              .order("created_at", { ascending: false })
              .limit(20)
          )
        : empty,

      // Billing
      cId
        ? safeFetch("billing", () =>
            supabase
              .from("billing_history")
              .select("*")
              .eq("company_id", cId)
              .order("data_vencimento", { ascending: false })
              .limit(24)
          )
        : empty,

      // AI
      cId
        ? safeFetch("agent_runs", () =>
            supabase
              .from("agent_runs")
              .select(
                "id, agent_name, trigger_type, status, started_at, completed_at, duration_ms, total_tokens_used, total_cost_usd, error_message"
              )
              .eq("company_id", cId)
              .order("started_at", { ascending: false })
              .limit(20)
          )
        : empty,

      cId
        ? safeFetch("iml_events", () =>
            supabase
              .from("iml_events")
              .select(
                "id, event_type, agent_name, severity, occurred_at, metadata"
              )
              .eq("company_id", cId)
              .order("occurred_at", { ascending: false })
              .limit(30)
          )
        : empty,

      // Discrepâncias e notificações
      cId
        ? safeFetch("discrepancies", () =>
            supabase
              .from("discrepancies")
              .select("*")
              .eq("company_id", cId)
              .order("created_at", { ascending: false })
              .limit(20)
          )
        : empty,

      cId
        ? safeFetch("notifications", () =>
            supabase
              .from("notifications")
              .select("id, title, message, type, category, read, created_at")
              .eq("company_id", cId)
              .order("created_at", { ascending: false })
              .limit(20)
          )
        : empty,

      // Atividades de prospect (só faz sentido pra prospect, mas roda sempre)
      type === "prospect"
        ? safeFetch("prospect_activities", () =>
            supabase
              .from("prospect_activities")
              .select(
                "id, tipo, descricao, resultado, created_at"
              )
              .eq("prospect_id", id)
              .order("created_at", { ascending: false })
              .limit(50)
          )
        : empty,

      // Filiais (se for matriz)
      type === "company"
        ? safeFetch("filiais", () =>
            supabase
              .from("companies")
              .select("id, cnpj, razao_social, municipio, uf_sede")
              .eq("matriz_id", id)
              .order("razao_social")
          )
        : empty,

      // Instruções customizadas
      cId
        ? safeFetch("company_instructions", () =>
            supabase
              .from("company_instructions")
              .select("id, titulo, conteudo, categoria, ativo, created_at")
              .eq("company_id", cId)
              .eq("ativo", true)
              .order("created_at", { ascending: false })
              .limit(20)
          )
        : empty,
    ]);

    return NextResponse.json({
      type,
      base,
      cnpj,
      companyId,
      vigilantes: employees,
      frota: { veiculos: vehicles, manutencoes: vehicleMaintenance },
      armamento: { armas: weapons, coletes: vests },
      gesp: {
        tasks: gespTasks,
        sessions: gespSessions,
        approvals: gespApprovals,
        snapshots: gespSnapshots,
        procuracoes,
      },
      emails: {
        threads,
        inbound,
        outbound,
        workflows,
      },
      dou: {
        alvaras: douAlvaras,
        alertas: douAlertas,
      },
      billing: { history: billing },
      ai: {
        runs: agentRuns,
        events: imlEvents,
      },
      discrepancias: discrepancies,
      notifications,
      prospect: {
        activities: prospectActivities,
      },
      filiais,
      instructions,
    });
  } catch (err) {
    console.error("[BRAIN/DETAIL]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro" },
      { status: 500 }
    );
  }
}
