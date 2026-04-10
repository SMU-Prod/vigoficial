import { NextRequest, NextResponse } from "next/server";
import { Redis } from "ioredis";
import { env } from "@/lib/config/env"; // OPS-02
import { apiError } from "@/lib/api/response";

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export const rateLimitConfig = {
  login: { windowMs: 15 * 60 * 1000, maxRequests: 10 } as RateLimitConfig,
  api: { windowMs: 60 * 1000, maxRequests: 100 } as RateLimitConfig,
  webhook: { windowMs: 60 * 1000, maxRequests: 200 } as RateLimitConfig,
};

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number;
}

// ─── Redis client (lazy, with in-memory fallback) ───────────────────────────

let _redis: Redis | null = null;
let _redisFailed = false;

function getRedis(): Redis | null {
  if (_redisFailed) return null;
  if (_redis) return _redis;

  try {
    _redis = new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 2000,
      enableOfflineQueue: false,
    });

    _redis.on("error", () => {
      // Silently fall back to in-memory on Redis connection errors
      _redisFailed = true;
      _redis?.disconnect();
      _redis = null;
    });

    _redis.connect().catch(() => {
      _redisFailed = true;
      _redis = null;
    });

    return _redis;
  } catch {
    _redisFailed = true;
    return null;
  }
}

// ─── In-memory fallback (single-instance only) ─────────────────────────────

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const memStore = new Map<string, RateLimitEntry>();

// Cleanup interval: remove expired entries every 10 minutes
const CLEANUP_INTERVAL = 10 * 60 * 1000;
if (typeof global !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memStore.entries()) {
      if (entry.resetAt < now) {
        memStore.delete(key);
      }
    }
  }, CLEANUP_INTERVAL);
}

/**
 * Get client IP from request
 * FIX: SEG-04 - Prefer CF-Connecting-IP (Cloudflare), then x-real-ip, then x-forwarded-for (first IP only)
 * to prevent IP spoofing via header manipulation
 */
function getClientIp(request: NextRequest): string {
  // Prefer Cloudflare header (most trusted)
  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (cfConnectingIp && cfConnectingIp.length > 0) {
    return cfConnectingIp.trim();
  }

  // Fall back to x-real-ip (trusted proxy header)
  const xRealIp = request.headers.get("x-real-ip");
  if (xRealIp && xRealIp.length > 0) {
    return xRealIp.trim();
  }

  // Finally, use x-forwarded-for (least trusted - can be spoofed), take first IP only
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  return "unknown";
}

/**
 * Rate limit via Redis (multi-instance safe) with in-memory fallback.
 *
 * Uses Redis INCR + PEXPIRE for atomic counting.
 * Falls back to in-memory Map if Redis is unavailable.
 */
export async function rateLimit(
  request: NextRequest,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const ip = getClientIp(request);
  const key = `rl:${ip}:${config.windowMs}:${config.maxRequests}`;
  const now = Date.now();

  const redis = getRedis();

  if (redis) {
    try {
      return await rateLimitRedis(redis, key, config, now);
    } catch {
      // Redis failed mid-request, fall back
    }
  }

  // Fallback: in-memory
  return rateLimitMemory(key, config, now);
}

async function rateLimitRedis(
  redis: Redis,
  key: string,
  config: RateLimitConfig,
  now: number
): Promise<RateLimitResult> {
  // Atomic increment + set TTL if new key
  const count = await redis.incr(key);
  if (count === 1) {
    // First request in window — set expiration
    await redis.pexpire(key, config.windowMs);
  }

  // Get TTL for resetAt calculation
  const ttl = await redis.pttl(key);
  const resetAt = new Date(now + Math.max(ttl, 0));
  const remaining = Math.max(0, config.maxRequests - count);
  const success = count <= config.maxRequests;

  if (!success) {
    const retryAfter = Math.ceil(Math.max(ttl, 0) / 1000);
    return { success, remaining, resetAt, retryAfter };
  }

  return { success, remaining, resetAt };
}

function rateLimitMemory(
  key: string,
  config: RateLimitConfig,
  now: number
): RateLimitResult {
  let entry = memStore.get(key);

  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + config.windowMs };
  }

  entry.count++;
  memStore.set(key, entry);

  const remaining = Math.max(0, config.maxRequests - entry.count);
  const resetAt = new Date(entry.resetAt);
  const success = entry.count <= config.maxRequests;

  if (!success) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { success, remaining, resetAt, retryAfter };
  }

  return { success, remaining, resetAt };
}

/**
 * Reset rate limit for a specific IP + config (call after successful login)
 */
export async function resetRateLimit(request: NextRequest, config: RateLimitConfig): Promise<void> {
  const ip = getClientIp(request);
  const key = `rl:${ip}:${config.windowMs}:${config.maxRequests}`;

  const redis = getRedis();
  if (redis) {
    try {
      await redis.del(key);
    } catch {
      // ignore
    }
  }

  memStore.delete(key);
}

/**
 * Rate limit middleware that returns NextResponse on failure
 * TD-09: Uses standardized apiError response format
 */
export function createRateLimitResponse(result: RateLimitResult): NextResponse | null {
  if (!result.success) {
    const response = apiError(
      "RATE_LIMITED",
      "Muitas requisições. Tente novamente em breve.",
      429,
      { retryAfter: result.retryAfter }
    );
    response.headers.set("Retry-After", result.retryAfter?.toString() || "60");
    response.headers.set("X-RateLimit-Reset", result.resetAt.toISOString());
    return response;
  }
  return null;
}
