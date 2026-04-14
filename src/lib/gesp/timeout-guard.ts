/**
 * OPS-05: Serverless Timeout Protection for GESP Operations
 *
 * Vercel (serverless) has strict timeout limits:
 * - Free tier: 10 seconds
 * - Pro/Enterprise: 60 seconds (Hobby: 60s, Pro: 900s)
 *
 * GESP operations (browser automation) can take 5-30+ minutes.
 * This guard detects serverless environment and warns about timeout risk.
 *
 * Usage:
 * - Import at top of sync.ts and browser.ts
 * - Automatically logs warnings in serverless environment
 * - Provides timeout estimates
 */

import { env } from "@/lib/config/env";

/**
 * Check if running in Vercel serverless environment
 */
export function isServerlessEnvironment(): boolean {
  return !!env.VERCEL;
}

/**
 * Get estimated timeout limit for current environment (in seconds)
 */
export function getTimeoutLimit(): number {
  if (!isServerlessEnvironment()) {
    return 3600; // Self-hosted: 1 hour
  }

  // Vercel timeouts depend on plan
  // Free: 10s, Pro: 60s (default), Enterprise: 900s (15 min)
  // We assume Pro/standard, but log warning for safety
  return 60; // Vercel Pro default
}

/**
 * Log timeout warning at initialization
 * Called automatically on module load
 *
 * OPS-05: Warns about serverless timeout risks
 */
export function logTimeoutWarning(): void {
  if (!isServerlessEnvironment()) {
    return; // No warning needed for self-hosted
  }

  const limit = getTimeoutLimit();
  const warning = `
⚠️  OPS-05: Running on Vercel serverless (timeout: ${limit}s)

GESP operations typically take 5-30+ minutes and WILL timeout on Vercel's
default limits. You have two options:

1. RECOMMENDED: Use a dedicated GESP worker
   - Deploy to Vercel Edge Functions with WebCrypto support
   - Or run on separate long-running infrastructure (EC2, railway.app, etc.)
   - Set GESP_DRY_RUN=true for testing on serverless

2. Re-architecture:
   - Break GESP operations into smaller steps
   - Queue long operations to background job runner (BullMQ)
   - Return immediately to client, process asynchronously

Current environment: Vercel ${process.env.VERCEL_ENV || "unknown"}
Timeout limit: ${limit}s
Estimated GESP operation time: 300-1800s (5-30 minutes)

DO NOT deploy GESP operations directly to Vercel without addressing this!
`;

  console.warn(warning);
}

/**
 * Estimate time remaining before timeout
 * Returns null if sufficient time, warning string if low
 */
export function checkTimeRemaining(startTimeMs: number): {
  timeRemaining: number;
  willTimeout: boolean;
  message?: string;
} {
  const limit = getTimeoutLimit() * 1000; // Convert to ms
  const elapsed = Date.now() - startTimeMs;
  const timeRemaining = limit - elapsed;
  const willTimeout = timeRemaining < 5000; // Less than 5s buffer

  return {
    timeRemaining: Math.max(0, timeRemaining),
    willTimeout,
    message: willTimeout
      ? `TIMEOUT IMMINENT: ${(timeRemaining / 1000).toFixed(1)}s remaining (limit: ${limit / 1000}s)`
      : undefined,
  };
}

/**
 * Assert that we have enough time for operation
 * Throws error if running on serverless (GESP not supported)
 */
export function assertValidGespEnvironment(): void {
  if (isServerlessEnvironment()) {
    throw new Error(
      "OPS-05: GESP operations cannot run on serverless (Vercel). " +
      "Set GESP_DRY_RUN=true or deploy to self-hosted infrastructure."
    );
  }
}

// Log warning on module load
if (typeof process !== "undefined") {
  logTimeoutWarning();
}
