import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getAuthFromRequest, requireRole } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
import { requestDataDeletion } from "@/lib/lgpd/compliance";
import { z } from "zod";

const deleteSchema = z.object({
  employeeId: z.string().uuid("ID do funcionário inválido"),
  motivo: z.string().optional(),
});

type DeleteInput = z.infer<typeof deleteSchema>;

export async function POST(request: NextRequest) {
  // Rate limiting
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "admin");
  if (denied) return denied;

  try {
    const body = await request.json();

    // Validate request
    const validationResult = deleteSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const data: DeleteInput = validationResult.data;

    // Verify employee access
    const supabase = createSupabaseAdmin();
    const { data: employee, error: fetchError } = await supabase
      .from("employees")
      .select("company_id")
      .eq("id", data.employeeId)
      .single();

    if (fetchError || !employee) {
      return NextResponse.json(
        { error: "Funcionário não encontrado" },
        { status: 404 }
      );
    }

    if (auth!.role !== "admin" && !auth!.companyIds.includes(employee.company_id)) {
      return NextResponse.json(
        { error: "Sem permissão para acessar este funcionário" },
        { status: 403 }
      );
    }

    // Request data deletion
    await requestDataDeletion(data.employeeId, auth!.userId, data.motivo);

    return NextResponse.json({
      success: true,
      message: "Solicitação de exclusão de dados processada com sucesso",
      employeeId: data.employeeId,
      timestamp: new Date().toISOString(),
      note: "Todos os dados pessoais foram anonimizados. Um audit trail foi preservado para conformidade.",
    });
  } catch (error: unknown) {
    console.error("[LGPD DELETE]", error);
    return NextResponse.json(
      { error: "Erro ao processar solicitação de exclusão" },
      { status: 500 }
    );
  }
}
