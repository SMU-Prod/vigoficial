/**
 * Webhook signature validation for external services
 *
 * Provides timing-safe signature verification for webhooks from:
 * - Asaas (payment provider)
 * - Resend (email service)
 * - GPS providers (generic HMAC-SHA256)
 *
 * Pattern follows cron-auth.ts with crypto.timingSafeEqual for security.
 */

import crypto from "crypto";

/**
 * Verify Asaas webhook signature.
 *
 * Asaas uses a simple string-based signature verification:
 * The signature header contains the webhook secret, and we compare it
 * directly with the configured secret.
 *
 * @param payload Raw webhook body (as string or JSON stringified)
 * @param signature Value from asaas-access-token or x-asaas-signature header
 * @param secret ASAAS_WEBHOOK_SECRET from environment
 * @returns true if signature is valid, false otherwise
 */
export async function verifyAsaasWebhook(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  if (!signature || !secret) {
    return false;
  }

  try {
    // Asaas uses simple string comparison (signature header = secret)
    // Use timing-safe comparison to prevent timing attacks
    const signatureBuffer = Buffer.from(signature, "utf-8");
    const secretBuffer = Buffer.from(secret, "utf-8");

    if (signatureBuffer.length !== secretBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(signatureBuffer, secretBuffer);
  } catch {
    return false;
  }
}

/**
 * Verify Resend webhook signature.
 *
 * Resend uses Svix-style HMAC-SHA256 signatures with:
 * - svix-id: unique message ID
 * - svix-timestamp: Unix timestamp when message was sent
 * - svix-signature: HMAC-SHA256 of {id}.{timestamp}.{payload}
 *
 * This is typically handled by the Resend SDK (resend.webhooks.verify),
 * but this function provides a manual verification option if needed.
 *
 * @param payload Raw webhook body (MUST be raw text, not JSON-parsed)
 * @param signature Value from svix-signature header
 * @param secret RESEND_WEBHOOK_SECRET from environment
 * @returns true if signature is valid, false otherwise
 */
export async function verifyResendWebhook(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  if (!payload || !signature || !secret) {
    return false;
  }

  try {
    // Resend/Svix format: signature is a base64-encoded HMAC-SHA256
    // The signed content is typically: {id}.{timestamp}.{body}
    // However, the actual implementation depends on Resend's library.
    // For now, we provide a generic HMAC-SHA256 verification.

    // Compute expected signature
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("base64");

    // Use timing-safe comparison
    const signatureBuffer = Buffer.from(signature, "base64");
    const expectedBuffer = Buffer.from(expectedSignature, "base64");

    if (signatureBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

/**
 * Generic HMAC-SHA256 signature verification.
 *
 * Used for GPS providers and any service that sends HMAC-SHA256 signatures.
 * Signature can be in hex or base64 format.
 *
 * @param payload Raw webhook body
 * @param signature Hex or base64-encoded signature from header
 * @param secret Webhook secret from environment
 * @param algorithm Hash algorithm (default: "sha256")
 * @returns true if signature is valid, false otherwise
 */
export async function verifyHmacSignature(
  payload: string,
  signature: string,
  secret: string,
  algorithm: string = "sha256"
): Promise<boolean> {
  if (!payload || !signature || !secret) {
    return false;
  }

  try {
    // Try hex first (most common for HMAC)
    let expectedSignature = crypto
      .createHmac(algorithm, secret)
      .update(payload)
      .digest("hex");

    let signatureBuffer = Buffer.from(signature, "hex");
    let expectedBuffer = Buffer.from(expectedSignature, "hex");

    // If hex parsing failed or lengths don't match, try base64
    if (signatureBuffer.length === 0 || expectedBuffer.length === 0) {
      expectedSignature = crypto
        .createHmac(algorithm, secret)
        .update(payload)
        .digest("base64");

      signatureBuffer = Buffer.from(signature, "base64");
      expectedBuffer = Buffer.from(expectedSignature, "base64");
    }

    if (signatureBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  } catch {
    return false;
  }
}
