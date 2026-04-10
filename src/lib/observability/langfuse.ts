/**
 * VIGI — Langfuse LLM Observability
 * Tracks all AI calls, costs, latency, and cache performance.
 * PRD Seção 6 — Observabilidade completa de custos e traces.
 *
 * Integration approach:
 * - Wraps Anthropic SDK calls with trace context
 * - Tracks input/output tokens and cost per call
 * - Records cache hit rates for prompt caching optimization
 * - Aggregates daily/weekly metrics for billing dashboard
 */
import { Langfuse } from "langfuse";
import { env } from "@/lib/config/env"; // OPS-02

// Singleton Langfuse client
let _langfuse: Langfuse | null = null;

export function getLangfuse(): Langfuse | null {
  if (!env.LANGFUSE_PUBLIC_KEY || !env.LANGFUSE_SECRET_KEY) {
    return null; // Graceful degradation if not configured
  }

  if (!_langfuse) {
    _langfuse = new Langfuse({
      publicKey: env.LANGFUSE_PUBLIC_KEY,
      secretKey: env.LANGFUSE_SECRET_KEY,
      baseUrl: env.LANGFUSE_BASE_URL,
    });
  }
  return _langfuse;
}

// Trace an agent run
export function startTrace(params: {
  name: string;           // e.g., "captador-dou", "operacional-gesp"
  userId?: string;        // company_id
  sessionId?: string;     // run_id
  metadata?: Record<string, unknown>;
  tags?: string[];
}) {
  const langfuse = getLangfuse();
  if (!langfuse) return null;

  return langfuse.trace({
    name: params.name,
    userId: params.userId,
    sessionId: params.sessionId,
    metadata: params.metadata,
    tags: params.tags || [],
  });
}

// Track an LLM generation within a trace
export function trackGeneration(
  trace: ReturnType<Langfuse["trace"]> | null,
  params: {
    name: string;           // e.g., "classify-email", "extract-data"
    model: string;          // e.g., "claude-haiku-4-5-20251001"
    input: unknown;         // prompt sent
    output: unknown;        // response received
    usage: {
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
    };
    metadata?: Record<string, unknown>;
    startTime: Date;
    endTime: Date;
  }
) {
  if (!trace) return;

  trace.generation({
    name: params.name,
    model: params.model,
    input: params.input,
    output: params.output,
    usage: {
      input: params.usage.inputTokens,
      output: params.usage.outputTokens,
      // Langfuse supports custom usage fields via metadata
    },
    metadata: {
      ...params.metadata,
      cache_read_tokens: params.usage.cacheReadTokens || 0,
      cache_write_tokens: params.usage.cacheWriteTokens || 0,
      cache_hit_rate: params.usage.cacheReadTokens
        ? params.usage.cacheReadTokens / (params.usage.inputTokens + (params.usage.cacheReadTokens || 0))
        : 0,
    },
    startTime: params.startTime,
    endTime: params.endTime,
  });
}

// End a trace and flush
export async function endTrace(
  trace: ReturnType<Langfuse["trace"]> | null,
  output?: unknown
) {
  if (!trace) return;

  trace.update({ output });

  // Flush in serverless/edge environments
  const langfuse = getLangfuse();
  if (langfuse) {
    await langfuse.flushAsync();
  }
}

// Score a trace (for quality tracking)
export function scoreTrace(
  trace: ReturnType<Langfuse["trace"]> | null,
  name: string,
  value: number,
  comment?: string
) {
  if (!trace) return;

  trace.score({
    name,
    value,
    comment,
  });
}

// Shutdown gracefully (call on process exit)
export async function shutdownLangfuse(): Promise<void> {
  const langfuse = getLangfuse();
  if (langfuse) {
    await langfuse.shutdownAsync();
  }
}
