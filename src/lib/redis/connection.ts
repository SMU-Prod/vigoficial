import type { ConnectionOptions } from "bullmq";
import { env } from "@/lib/config/env"; // OPS-02: Use validated env

export const redisConnection: ConnectionOptions = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
};
