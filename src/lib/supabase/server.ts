import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env } from "@/lib/config/env"; // OPS-02: Use validated env instead of process.env

export async function createSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll pode falhar em Server Components (read-only)
            // Isso é seguro — o middleware cuida do refresh
          }
        },
      },
    }
  );
}

/**
 * Cliente com service_role — APENAS para uso server-side em:
 * - API Routes
 * - Server Actions
 * - Workers BullMQ
 * NUNCA expor no client-side
 */
export function createSupabaseAdmin() {
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
