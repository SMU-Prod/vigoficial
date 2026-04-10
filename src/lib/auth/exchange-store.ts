import crypto from "crypto";
import Redis from "ioredis";
import { env } from "@/lib/config/env"; // OPS-02

interface ExchangeEntry {
  token: string;
  redirect: string;
  createdAt: number;
}

/**
 * Store for one-time token exchange codes with Redis persistence.
 * FIX: SEG-02 - Migrated from in-memory Map to Redis with 5-min TTL for multi-instance deployment support.
 *
 * Pattern: login API validates credentials → generates JWT → stores it here
 * with a random code → client navigates to /api/auth/exchange?code=XXX
 * → exchange endpoint sets the cookie via HTTP redirect (100% reliable).
 *
 * Codes expire after 60 seconds and are single-use.
 */
const CODE_TTL_SECONDS = 300; // 5 minutes (Redis TTL, longer than actual code validity)
const CODE_VALIDITY_MS = 60_000; // 60 seconds (when code actually expires)

let redisClient: Redis | null = null;
let fallbackStore: Map<string, ExchangeEntry> | null = null;

// Initialize Redis client with graceful fallback to in-memory
function initializeRedis(): Redis | null {
  if (redisClient) return redisClient;

  try {
    redisClient = new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    redisClient.on("error", () => {
      console.warn("[ExchangeStore] Redis connection failed, falling back to in-memory store");
    });

    return redisClient;
  } catch (error) {
    console.warn("[ExchangeStore] Failed to initialize Redis:", error);
    return null;
  }
}

// Initialize fallback in-memory store
function getFallbackStore(): Map<string, ExchangeEntry> {
  if (!fallbackStore) {
    fallbackStore = new Map<string, ExchangeEntry>();
    // Cleanup expired entries periodically
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of fallbackStore!.entries()) {
        if (now - entry.createdAt > CODE_VALIDITY_MS) {
          fallbackStore!.delete(key);
        }
      }
    }, 5 * 60_000); // 5 minutes
  }
  return fallbackStore;
}

/**
 * Store a JWT token with a one-time exchange code.
 * Returns the exchange code.
 */
export async function createExchangeCode(token: string, redirect: string): Promise<string> {
  const code = crypto.randomBytes(32).toString("hex");
  const entry: ExchangeEntry = { token, redirect, createdAt: Date.now() };

  const redis = initializeRedis();
  if (redis && redis.status === "ready") {
    try {
      // Store in Redis with TTL
      await redis.setex(
        `exchange:${code}`,
        CODE_TTL_SECONDS,
        JSON.stringify(entry)
      );
      return code;
    } catch (error) {
      console.warn("[ExchangeStore] Redis write failed, falling back to in-memory:", error);
      // Fall through to in-memory store
    }
  }

  // Fallback: use in-memory store
  const store = getFallbackStore();
  store.set(code, entry);
  return code;
}

/**
 * Consume an exchange code. Returns { token, redirect } or null if invalid/expired.
 * Code is deleted after use (single-use).
 */
export async function consumeExchangeCode(
  code: string
): Promise<{ token: string; redirect: string } | null> {
  const redis = initializeRedis();
  if (redis && redis.status === "ready") {
    try {
      const data = await redis.getdel(`exchange:${code}`);
      if (!data) return null;

      const entry: ExchangeEntry = JSON.parse(data);

      // Check expiration (allow some clock skew)
      if (Date.now() - entry.createdAt > CODE_VALIDITY_MS) {
        return null;
      }

      return { token: entry.token, redirect: entry.redirect };
    } catch (error) {
      console.warn("[ExchangeStore] Redis read failed, falling back to in-memory:", error);
      // Fall through to in-memory store
    }
  }

  // Fallback: use in-memory store
  const store = getFallbackStore();
  const entry = store.get(code);
  if (!entry) return null;

  // Always delete (single-use)
  store.delete(code);

  // Check expiration
  if (Date.now() - entry.createdAt > CODE_VALIDITY_MS) {
    return null;
  }

  return { token: entry.token, redirect: entry.redirect };
}
