import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getAuthFromRequest, requireRole } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
import { validateBody, delespSchema } from "@/lib/validation/schemas";

export async function GET(request: NextRequest) {
  // Rate limiting
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "viewer");
  if (denied) return denied;

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("delesp_contacts")
    .select("*")
    .order("uf");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function PUT(request: NextRequest) {
  // Rate limiting
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "admin");
  if (denied) return denied;

  const body = await request.json();

  // Validate body (partial update)
  const updateSchema = delespSchema.partial();
  const { data: _validated, error: validationError } = await validateBody(request, updateSchema);
  if (validationError && Object.keys(validationError).length > 0) {
    console.warn("Validation warnings on delesp update:", validationError);
  }

  const { id, ...updateData } = body;

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("delesp_contacts")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
