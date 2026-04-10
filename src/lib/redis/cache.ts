/**
 * VIGI PRO — Redis Cache Layer
 *
 * Cache genérico com suporte a:
 * - TTL por chave
 * - Invalidação por tag/prefix
 * - Fallback graceful (sem cache se Redis indisponível)
 * - JSON serialization automática
 *
 * Uso:
 *   const data = await cache.getOrSet("dashboard:kpis", () => fetchFromDB(), 300);
 *   await cache.invalidate("dashboard:*");
 */

import { Redis } from "ioredis";
import { env } from "@/lib/config/env"; // OPS-02

// Default TTLs por categoria (em segundos)
export const CACHE_TTL = {
  /** Dashboard KPIs: 5 min */
  dashboard: 300,
  /** Agent status: 15 seg (atualizado por polling) */
  agentStatus: 15,
  /** Company data: 10 min */
  company: 600,
  /** Compliance alerts: 2 min */
  compliance: 120,
  /** Queue stats: 30 seg */
  queueStats: 30,
  /** IML events: 1 min */
  imlEvents: 60,
  /** Metrics: 5 min */
  metrics: 300,
} as const;

// Prefix para separar cache de outros dados Redis
const CACHE_PREFIX = "vigi:cache:";

let _redis: Redis | null = null;
let _redisAvailable = true;

function getRedis(): Redis | null {
  if (!_redisAvailable) return null;
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
      keyPrefix: CACHE_PREFIX,
    });

    _redis.on("error", () => {
      _redisAvailable = false;
      _redis?.disconnect();
      _redis = null;
    });

    _redis.connect().catch(() => {
      _redisAvailable = false;
      _redis = null;
    });

    return _redis;
  } catch {
    _redisAvailable = false;
    return null;
  }
}

/**
 * Busca valor do cache.
 * Retorna null se não encontrado ou Redis indisponível.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Salva valor no cache com TTL.
 */
export async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch {
    // Silently fail — cache is best-effort
  }
}

/**
 * Cache-aside pattern: busca no cache, se não encontrou, executa `fetcher()` e salva.
 *
 * @example
 *   const kpis = await cacheGetOrSet("dashboard:kpis", () => queryKPIs(), CACHE_TTL.dashboard);
 */
export async function cacheGetOrSet<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number
): Promise<T> {
  // Try cache first
  const cached = await cacheGet<T>(key);
  if (cached !== null) return cached;

  // Cache miss: fetch from source
  const data = await fetcher();

  // Save to cache (non-blocking)
  cacheSet(key, data, ttlSeconds).catch(() => {});

  return data;
}

/**
 * Deleta uma chave específica do cache.
 */
export async function cacheDelete(key: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    await redis.del(key);
  } catch {
    // ignore
  }
}

/**
 * Invalida todas as chaves que casam com um pattern.
 *
 * @example
 *   await cacheInvalidatePattern("dashboard:*"); // limpa todo cache de dashboard
 *   await cacheInvalidatePattern("company:abc-123:*"); // limpa cache de uma company
 */
export async function cacheInvalidatePattern(pattern: string): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;

  try {
    // SCAN para não bloquear Redis (diferente de KEYS que bloqueia)
    let cursor = "0";
    let deleted = 0;
    const fullPattern = `${CACHE_PREFIX}${pattern}`;

    do {
      // Usar sendCommand para acessar SCAN sem o keyPrefix
      const [nextCursor, keys] = await redis.scan(
        parseInt(cursor),
        "MATCH",
        fullPattern,
        "COUNT",
        100
      ) as [string, string[]];

      cursor = nextCursor;

      if (keys.length > 0) {
        // Remove o prefix antes de deletar (Redis adiciona automaticamente)
        const cleanKeys = keys.map((k) => k.replace(CACHE_PREFIX, ""));
        await redis.del(...cleanKeys);
        deleted += keys.length;
      }
    } while (cursor !== "0");

    return deleted;
  } catch {
    return 0;
  }
}

/**
 * Retorna stats do cache (para dashboard de métricas).
 */
export async function cacheStats(): Promise<{
  available: boolean;
  keyCount?: number;
  memoryUsed?: string;
} | null> {
  const redis = getRedis();
  if (!redis) return { available: false };

  try {
    const info = await redis.info("memory");
    const keyCount = await redis.dbsize();

    const memMatch = info.match(/used_memory_human:(.+)/);
    const memoryUsed = memMatch ? memMatch[1].trim() : "unknown";

    return { available: true, keyCount, memoryUsed };
  } catch {
    return { available: false };
  }
}
