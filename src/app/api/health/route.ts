import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { redisConnection } from "@/lib/redis/connection";
import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";
import { Redis } from "ioredis";
import { env } from "@/lib/config/env"; // OPS-02

const VERSION = "1.0.0";

interface HealthCheckResult {
  status: "ok" | "degraded" | "error";
  timestamp: string;
  version: string;
  services: {
    database: {
      status: "ok" | "error";
      latency?: number;
      error?: string;
    };
    redis: {
      status: "ok" | "error";
      latency?: number;
      error?: string;
    };
    r2: {
      status: "ok" | "error";
      latency?: number;
      error?: string;
    };
  };
}

/**
 * GET /api/health
 * Health check endpoint for monitoring
 * Returns status of all critical services
 * No authentication required
 */
export async function GET(): Promise<NextResponse<HealthCheckResult>> {
  const timestamp = new Date().toISOString();
  const services: HealthCheckResult["services"] = {
    database: { status: "ok" },
    redis: { status: "ok" },
    r2: { status: "ok" },
  };

  // Check Supabase/PostgreSQL
  try {
    const startDb = Date.now();
    const supabase = createSupabaseAdmin();

    // Simple connectivity query
    const { error } = await supabase.from("companies").select("id").limit(1);

    const dbLatency = Date.now() - startDb;

    if (error) {
      services.database = {
        status: "error",
        latency: dbLatency,
        error: error.message,
      };
    } else {
      services.database = { status: "ok", latency: dbLatency };
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    services.database = {
      status: "error",
      error: errorMsg,
    };
  }

  // Check Redis
  try {
    const startRedis = Date.now();

    // Create temporary Redis client for health check
    const tempRedis = new Redis({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      host: (redisConnection as any).host || "127.0.0.1",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      port: (redisConnection as any).port || 6379,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      password: (redisConnection as any).password,
      maxRetriesPerRequest: null,
    });

    try {
      const pongResult = await tempRedis.ping();
      const redisLatency = Date.now() - startRedis;

      if (pongResult === "PONG") {
        services.redis = { status: "ok", latency: redisLatency };
      } else {
        services.redis = {
          status: "error",
          latency: redisLatency,
          error: "Unexpected PING response",
        };
      }
    } catch (pingErr) {
      const redisLatency = Date.now() - startRedis;
      const errorMsg = pingErr instanceof Error ? pingErr.message : "Unknown error";
      services.redis = {
        status: "error",
        latency: redisLatency,
        error: errorMsg,
      };
    } finally {
      await tempRedis.quit();
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    services.redis = {
      status: "error",
      error: errorMsg,
    };
  }

  // Check R2/S3
  try {
    const startR2 = Date.now();

    const r2Client = new S3Client({
      region: "auto",
      endpoint: env.R2_ENDPOINT,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });

    const bucketName = env.R2_BUCKET_NAME;

    try {
      await r2Client.send(
        new HeadBucketCommand({ Bucket: bucketName })
      );

      const r2Latency = Date.now() - startR2;
      services.r2 = { status: "ok", latency: r2Latency };
    } catch (err) {
      const r2Latency = Date.now() - startR2;
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      services.r2 = {
        status: "error",
        latency: r2Latency,
        error: errorMsg,
      };
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    services.r2 = {
      status: "error",
      error: errorMsg,
    };
  }

  // Determine overall status
  const allOk = Object.values(services).every((s) => s.status === "ok");
  const anyError = Object.values(services).some((s) => s.status === "error");

  const result: HealthCheckResult = {
    status: allOk ? "ok" : anyError ? "error" : "degraded",
    timestamp,
    version: VERSION,
    services,
  };

  const statusCode = allOk ? 200 : 503;

  return NextResponse.json(result, { status: statusCode });
}
