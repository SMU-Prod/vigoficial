import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { addEmailSendJob } from "@/lib/queue/jobs";
import { rateLimit, createRateLimitResponse } from "@/lib/security/rate-limit";

export async function POST(request: NextRequest) {
  const cronLimitConfig = { windowMs: 60 * 1000, maxRequests: 5 };
  const limitResult = await rateLimit(request, cronLimitConfig);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  try {
    const supabase = createSupabaseAdmin();

    // Get all active companies
    const { data: companies } = await supabase
      .from("companies")
      .select("id, razao_social, email_responsavel, billing_status")
      .in("billing_status", ["ativo", "trial"]);

    if (!companies || companies.length === 0) {
      return NextResponse.json({ ok: true, sent: 0 });
    }

    let sent = 0;
    const periodo = new Date().toISOString().slice(0, 7); // YYYY-MM

    for (const company of companies) {
      if (!company.email_responsavel) continue;

      await addEmailSendJob({
        companyId: company.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        templateId: "J" as any,
        mode: "CLIENTE_HTML",
        to: company.email_responsavel,
        subject: `Relatório Mensal — ${company.razao_social} — ${periodo}`,
        payload: {
          razaoSocial: company.razao_social,
          periodo,
          linkRelatorio: `/api/relatorios?tipo=mensal&mes=${periodo}&company_id=${company.id}&formato=pdf`,
        },
      });
      sent++;
    }

    return NextResponse.json({ ok: true, sent, total: companies.length });
  } catch (err) {
    console.error("[CRON REPORTS]", err);
    return NextResponse.json({ error: "Erro ao agendar relatórios" }, { status: 500 });
  }
}
