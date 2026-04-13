/**
 * OPS-02: Environment Variable Validation
 *
 * Centralized schema validation for all environment variables using Zod.
 * Ensures type safety and catches missing/invalid configs at startup.
 *
 * Import this module instead of accessing process.env directly:
 * ✓ import { env } from "@/lib/config/env"
 * ✓ env.ANTHROPIC_API_KEY
 * ✗ process.env.ANTHROPIC_API_KEY
 */

import { z } from "zod";

const envSchema = z.object({
  // ──── Supabase ────
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().describe("Supabase project URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).describe("Supabase anonymous key"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).describe("Supabase service role key (server-side only)"),

  // ──── Authentication ────
  JWT_SECRET: z.string().min(32).describe("JWT signing secret (min 32 chars)"),
  NEXTAUTH_URL: z.string().url().optional().describe("NextAuth base URL"),

  // ──── Redis (BullMQ) ────
  REDIS_HOST: z.string().default("127.0.0.1").describe("Redis host"),
  REDIS_PORT: z.coerce.number().default(6379).describe("Redis port"),
  REDIS_PASSWORD: z.string().optional().describe("Redis password"),

  // ──── Email ────
  RESEND_API_KEY: z.string().min(1).describe("Resend API key for outbound email"),
  RESEND_WEBHOOK_SECRET: z.string().optional().describe("Resend webhook signing secret"),
  GMAIL_CLIENT_ID: z.string().optional().describe("Gmail API client ID"),
  GMAIL_CLIENT_SECRET: z.string().optional().describe("Gmail API client secret"),
  GMAIL_REFRESH_TOKEN: z.string().optional().describe("Gmail API refresh token"),
  EMAIL_FROM: z.string().email().describe("Default sender email"),
  EMAIL_EQUIPE: z.string().email().describe("Internal team email"),
  EMAIL_FROM_ATENDIMENTO: z.string().optional().describe("Atendimento sender address override"),
  EMAIL_FROM_VIGIPRO: z.string().optional().describe("VIG PRO sender address override"),
  EMAIL_FROM_ADMIN: z.string().optional().describe("Admin sender address override"),

  // ──── AI / Claude ────
  ANTHROPIC_API_KEY: z.string().min(1).describe("Anthropic API key for Claude models"),
  AI_MODEL_FAST: z.string().default("claude-haiku-4-5-20251001").describe("Fast model for quick tasks"),
  AI_MODEL_COMPLEX: z.string().default("claude-sonnet-4-6").describe("Complex reasoning model"),
  AI_MODEL_ADVANCED: z.string().default("claude-sonnet-4-6").describe("Advanced decision model"),

  // ──── Billing (Asaas) ────
  ASAAS_API_KEY: z.string().min(1).describe("Asaas API key for payment processing"),
  ASAAS_WEBHOOK_SECRET: z.string().optional().describe("Asaas webhook signing secret"),
  ASAAS_SANDBOX: z.enum(["true", "false"]).default("true").describe("Use Asaas sandbox"),

  // ──── Cloud Storage (Cloudflare R2) ────
  R2_ACCOUNT_ID: z.string().min(1).describe("Cloudflare account ID"),
  R2_ACCESS_KEY_ID: z.string().min(1).describe("R2 access key ID"),
  R2_SECRET_ACCESS_KEY: z.string().min(1).describe("R2 secret access key"),
  R2_BUCKET_NAME: z.string().default("vigipro-data").describe("R2 bucket name"),
  R2_ENDPOINT: z.string().url().describe("R2 endpoint URL"),

  // ──── Security / Cron ────
  CRON_SECRET: z.string().min(32).describe("Cron endpoint secret (min 32 chars)"),
  CRON_ALLOWED_IPS: z.string().optional().describe("Comma-separated IP whitelist for cron"),
  ENCRYPTION_KEY: z.string().min(32).describe("Data encryption key (min 32 chars)"),

  // ──── GPS / Webhooks ────
  GPS_WEBHOOK_SECRET: z.string().optional().describe("GPS tracker webhook authentication token"),

  // ──── Observability ────
  SENTRY_DSN: z.string().optional().describe("Sentry error tracking DSN"),
  LANGFUSE_PUBLIC_KEY: z.string().optional().describe("Langfuse LLM observability public key"),
  LANGFUSE_SECRET_KEY: z.string().optional().describe("Langfuse LLM observability secret key"),
  LANGFUSE_BASE_URL: z.string().url().default("https://cloud.langfuse.com").describe("Langfuse API base URL"),

  // ──── Government APIs (GESP, DOU) ────
  GESP_PORTAL_URL: z.string().url().default("https://www.gov.br/pf/pt-br/assuntos/seguranca-privada/sistemas").describe("GESP portal URL"),
  GESP_URL: z.string().url().default("https://servicos.dpf.gov.br/gesp/").describe("GESP system URL"),
  GOV_BR_LOGIN_URL: z.string().url().default("https://sso.acesso.gov.br").describe("Gov.br login URL"),
  DOU_BASE_URL: z.string().url().default("https://www.in.gov.br").describe("Diário Oficial da União URL"),

  // ──── Feature Flags ────
  GESP_DRY_RUN: z.enum(["true", "false"]).default("false").describe("Simulate GESP execution without browser"),
  EMAIL_REDIRECT_TO: z.string().email().optional().describe("Redirect all emails to address (testing in production)"),

  // ──── Node / Runtime ────
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  VERCEL: z.string().optional().describe("Set by Vercel when deployed"),
});

// Parse and validate environment
function parseEnv() {
  // During Next.js build phase ("Collecting page data"), env vars may not
  // be available. Skip strict validation and return defaults/empty strings
  // so the build can complete. Real validation happens at runtime startup.
  const isBuildPhase =
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.NEXT_PHASE === "phase-production-server";

  if (isBuildPhase) {
    // Return a permissive parse that fills defaults but doesn't throw
    const permissive = envSchema.safeParse(process.env);
    if (permissive.success) return permissive.data;

    // Fallback: return process.env cast to the expected shape.
    // Values will be undefined at build time but never actually called.
    console.warn("[env] Build phase: skipping strict env validation");
    return process.env as unknown as z.infer<typeof envSchema>;
  }

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const missingVars = Object.entries(parsed.error.flatten().fieldErrors)
      .filter(([, errors]) => errors && errors.length > 0)
      .map(([field, errors]) => `  - ${field}: ${errors[0]}`)
      .join("\n");

    const message = `
❌ Invalid or missing environment variables:
${missingVars}

Please check your .env.local file and ensure all required variables are set.
See .env.example for reference.
`;

    throw new Error(message);
  }

  return parsed.data;
}

// Parse once at module load, then export as singleton
const env = parseEnv();

export { env };
export type Env = typeof env;
