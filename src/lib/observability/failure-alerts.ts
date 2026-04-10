/**
 * Silent Failure Alert System — VIGI PRO
 *
 * Detecta e alerta sobre falhas silenciosas:
 * - Workers com muitos jobs falhando
 * - Emails não enviados
 * - GESP sync falhando repetidamente
 * - Billing jobs sem execução
 *
 * Alerta via: system_events + email para equipe (Template M)
 */

import { createSupabaseAdmin } from "@/lib/supabase/server";
import { addEmailSendJob } from "@/lib/queue/jobs";
import { EMAIL_EQUIPE } from "@/lib/config/constants";

interface FailureThreshold {
  /** Nome do componente monitorado */
  component: string;
  /** Query Supabase para contar falhas recentes */
  countQuery: () => Promise<number>;
  /** Número máximo de falhas toleradas no período */
  maxFailures: number;
  /** Período de verificação em horas */
  windowHours: number;
  /** Severidade do alerta */
  severity: "critical" | "error" | "warning";
}

/**
 * Verifica falhas silenciosas e gera alertas.
 * Deve ser chamado via cron a cada 30 min.
 */
export async function checkSilentFailures(): Promise<{
  checked: number;
  alerts: number;
}> {
  const supabase = createSupabaseAdmin();
  let alertsGenerated = 0;

  const thresholds: FailureThreshold[] = [
    {
      component: "email-send",
      maxFailures: 5,
      windowHours: 1,
      severity: "error",
      countQuery: async () => {
        const since = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
        const { count } = await supabase
          .from("email_outbound")
          .select("*", { count: "exact", head: true })
          .eq("status", "erro")
          .gte("created_at", since);
        return count || 0;
      },
    },
    {
      component: "email-read",
      maxFailures: 10,
      windowHours: 2,
      severity: "warning",
      countQuery: async () => {
        const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        const { count } = await supabase
          .from("email_inbound")
          .select("*", { count: "exact", head: true })
          .eq("status", "erro")
          .gte("created_at", since);
        return count || 0;
      },
    },
    {
      component: "gesp-sync",
      maxFailures: 3,
      windowHours: 4,
      severity: "critical",
      countQuery: async () => {
        const since = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
        const { count } = await supabase
          .from("gesp_tasks")
          .select("*", { count: "exact", head: true })
          .eq("status", "erro")
          .gte("created_at", since);
        return count || 0;
      },
    },
    {
      component: "compliance",
      maxFailures: 5,
      windowHours: 24,
      severity: "error",
      countQuery: async () => {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { count } = await supabase
          .from("system_events")
          .select("*", { count: "exact", head: true })
          .eq("tipo", "compliance_erro")
          .gte("created_at", since);
        return count || 0;
      },
    },
  ];

  for (const threshold of thresholds) {
    try {
      const failureCount = await threshold.countQuery();

      if (failureCount > threshold.maxFailures) {
        // Verifica se já alertou recentemente (evita spam)
        const recentAlertCutoff = new Date(
          Date.now() - threshold.windowHours * 60 * 60 * 1000
        ).toISOString();

        const { data: recentAlert } = await supabase
          .from("system_events")
          .select("id")
          .eq("tipo", `silent_failure_${threshold.component}`)
          .gte("created_at", recentAlertCutoff)
          .limit(1);

        if (recentAlert && recentAlert.length > 0) {
          continue; // Já alertou nesse período
        }

        // Registra alerta no system_events
        await supabase.from("system_events").insert({
          tipo: `silent_failure_${threshold.component}`,
          severidade: threshold.severity,
          mensagem: `[ALERTA] ${threshold.component}: ${failureCount} falhas nas últimas ${threshold.windowHours}h (limite: ${threshold.maxFailures})`,
          metadata: {
            component: threshold.component,
            failureCount,
            threshold: threshold.maxFailures,
            windowHours: threshold.windowHours,
          },
        });

        // Envia email para equipe via Template M (sistema)
        try {
          await addEmailSendJob({
            companyId: "system",
            templateId: "M",
            mode: "CLIENTE_HTML",
            to: EMAIL_EQUIPE,
            subject: `[VIGI ALERTA ${threshold.severity.toUpperCase()}] ${threshold.component} — ${failureCount} falhas`,
            payload: {
              titulo: `Falha Silenciosa Detectada: ${threshold.component}`,
              mensagem: `O componente ${threshold.component} registrou ${failureCount} falhas nas últimas ${threshold.windowHours} horas, excedendo o limite de ${threshold.maxFailures}. Verifique os logs e o dashboard de workers.`,
              severidade: threshold.severity,
              timestamp: new Date().toISOString(),
            },
          });
        } catch {
          // Se email falhar, pelo menos o system_event foi registrado
          console.error(`[ALERT] Não foi possível enviar email de alerta para ${threshold.component}`);
        }

        alertsGenerated++;
      }
    } catch (err) {
      console.error(`[ALERT] Erro ao verificar ${threshold.component}:`, err);
    }
  }

  return { checked: thresholds.length, alerts: alertsGenerated };
}
