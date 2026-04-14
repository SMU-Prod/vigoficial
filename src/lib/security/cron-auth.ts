/**
 * FIX: SEG-07 - CRON request authentication via HMAC-SHA256
 * Uses Web Crypto API (crypto.subtle) — compatible with Edge Runtime.
 *
 * Pattern:
 * 1. Client computes timestamp (e.g., "2024-01-01T12:00:00Z")
 * 2. Client computes HMAC-SHA256(timestamp, CRON_SECRET)
 * 3. Client sends Authorization: CRON-HMAC-SHA256 <timestamp>:<hmac>
 * 4. Server verifies HMAC and timestamp is within 5-minute window
 */

/** Hex-encode a Uint8Array */
function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Decode a hex string to Uint8Array (returns null on invalid input) */
function fromHex(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0) return null;
  try {
    const pairs = hex.match(/.{2}/g);
    if (!pairs) return null;
    return new Uint8Array(pairs.map((b) => parseInt(b, 16)));
  } catch {
    return null;
  }
}

/** Import an HMAC-SHA256 key for the given secret string */
async function importHmacKey(
  secret: string,
  usage: "sign" | "verify"
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage]
  );
}

/**
 * Generate CRON HMAC signature (async — uses Web Crypto)
 * @param timestamp ISO 8601 timestamp string (e.g., new Date().toISOString())
 * @param secret CRON_SECRET from environment
 * @returns HMAC-SHA256 hex digest
 */
export async function generateCronHmac(
  timestamp: string,
  secret: string
): Promise<string> {
  const key = await importHmacKey(secret, "sign");
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(timestamp)
  );
  return toHex(sig);
}

/**
 * Verify CRON request signature and timestamp freshness (async — uses Web Crypto)
 * @param authHeader Value of Authorization header (e.g., "CRON-HMAC-SHA256 timestamp:hmac")
 * @param secret CRON_SECRET from environment
 * @param maxAgeSeconds Maximum age of timestamp (default: 5 minutes)
 * @returns { valid: boolean; timestamp?: string; error?: string }
 */
export async function verifyCronAuth(
  authHeader: string | null,
  secret: string | undefined,
  maxAgeSeconds: number = 5 * 60
): Promise<{ valid: boolean; timestamp?: string; error?: string }> {
  if (!authHeader) {
    return { valid: false, error: "Missing Authorization header" };
  }

  if (!secret) {
    return { valid: false, error: "CRON_SECRET not configured" };
  }

  // Parse "CRON-HMAC-SHA256 timestamp:hmac"
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "CRON-HMAC-SHA256") {
    return { valid: false, error: "Invalid Authorization header format" };
  }

  // Use lastIndexOf: ISO 8601 timestamps contain colons (e.g. 2026-04-14T04:40:32Z)
  // but HMAC hex digests never do, so the last colon is always the separator.
  const colonIdx = parts[1].lastIndexOf(":");
  if (colonIdx === -1) {
    return { valid: false, error: "Missing timestamp or HMAC in Authorization header" };
  }

  const timestamp = parts[1].slice(0, colonIdx);
  const providedHmac = parts[1].slice(colonIdx + 1);

  if (!timestamp || !providedHmac) {
    return { valid: false, error: "Missing timestamp or HMAC in Authorization header" };
  }

  // Verify timestamp format and freshness
  const timestampMs = Date.parse(timestamp);
  if (isNaN(timestampMs)) {
    return { valid: false, error: "Invalid timestamp format" };
  }

  const age = (Date.now() - timestampMs) / 1000;
  if (Math.abs(age) > maxAgeSeconds) {
    return {
      valid: false,
      error: `Timestamp too old or in future (age: ${age.toFixed(1)}s, max: ${maxAgeSeconds}s)`,
    };
  }

  // Decode provided HMAC from hex
  const sigBytes = fromHex(providedHmac);
  if (!sigBytes) {
    return { valid: false, error: "Invalid HMAC format" };
  }

  // Verify using crypto.subtle.verify — timing-safe by spec
  try {
    const key = await importHmacKey(secret, "verify");
    const match = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes as Uint8Array<ArrayBuffer>,
      new TextEncoder().encode(timestamp)
    );
    return { valid: match, timestamp };
  } catch {
    return { valid: false, error: "HMAC verification failed" };
  }
}

/**
 * Middleware helper for CRON route protection
 * Usage in middleware.ts:
 *   const cronResult = await verifyCronAuth(
 *     request.headers.get("authorization"),
 *     process.env.CRON_SECRET
 *   );
 *   if (!cronResult.valid) {
 *     return NextResponse.json({ error: cronResult.error }, { status: 401 });
 *   }
 */
export function getCronAuthError(
  cronResult: Awaited<ReturnType<typeof verifyCronAuth>>
): string {
  return cronResult.error || "CRON authentication failed";
}
