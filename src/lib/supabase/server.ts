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
 *
 * Build-safe: durante `next build` (Collecting page data) as env vars
 * podem não existir. Retorna um Proxy stub que nunca será chamado no build.
 */
let _adminClient: ReturnType<typeof createClient> | null = null;

export function createSupabaseAdmin() {
  // Singleton: reutiliza a mesma instância
  if (_adminClient) return _adminClient;

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  // Durante o build phase do Next.js, env vars são undefined.
  // Retorna proxy stub — nunca será chamado em build, só em runtime.
  if (!url || !key) {
    return new Proxy({} as ReturnType<typeof createClient>, {
      get(_target, prop) {
        // Permite typeof checks e toString sem explodir
        if (prop === Symbol.toPrimitive || prop === "toString" || prop === "valueOf") {
          return () => "[SupabaseBuildStub]";
        }
        // Retorna função no-op para chamadas encadeadas (.from().select() etc)
        return (..._args: unknown[]) =>
          new Proxy({}, { get: () => () => ({ data: null, error: null }) });
      },
    });
  }

  _adminClient = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _adminClient;
}
