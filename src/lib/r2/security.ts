/**
 * OPS-04: R2 Access Control & Security
 *
 * Provides secure file upload and access patterns for Cloudflare R2:
 * - Signed URLs instead of public URLs (time-limited access)
 * - Content-type validation before upload
 * - File size limits to prevent abuse
 *
 * Usage:
 * ✓ const signedUrl = await generateSignedUrl(key)
 * ✓ await uploadWithValidation(key, buffer, contentType, sizeLimit)
 * ✗ Never use uploadToR2() directly - use this module
 */

import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/config/env";

/**
 * Maximum file sizes (in bytes) by category
 * OPS-04: Prevent abuse through size limits
 */
const MAX_FILE_SIZES = {
  certificados: 5 * 1024 * 1024, // 5 MB
  documentos: 10 * 1024 * 1024, // 10 MB
  gesp_prints: 3 * 1024 * 1024, // 3 MB
  discrepancias: 10 * 1024 * 1024, // 10 MB
  emails_gerados: 2 * 1024 * 1024, // 2 MB
  billing: 1 * 1024 * 1024, // 1 MB
};

/**
 * Allowed MIME types by category
 * OPS-04: Validate content before storing
 */
const ALLOWED_CONTENT_TYPES: Record<string, string[]> = {
  certificados: ["application/pkcs12", "application/x-pkcs12", "application/octet-stream"],
  documentos: ["application/pdf", "image/jpeg", "image/png", "text/plain"],
  gesp_prints: ["image/png", "image/jpeg", "image/webp"],
  discrepancias: ["application/pdf", "text/csv", "application/json"],
  emails_gerados: ["message/rfc822", "text/plain", "application/json"],
  billing: ["application/pdf", "text/csv", "application/json"],
};

const r2Client = new S3Client({
  region: "auto",
  endpoint: env.R2_ENDPOINT,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = env.R2_BUCKET_NAME;

/**
 * Generate a signed URL for R2 object
 * Defaults to 1 hour expiration for security
 *
 * OPS-04: Always use signed URLs instead of making objects public
 */
export async function generateSignedUrl(
  key: string,
  expiresInSeconds: number = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  return getSignedUrl(r2Client, command, { expiresIn: expiresInSeconds });
}

/**
 * Validate file before upload
 * Checks size and content-type against category limits
 *
 * OPS-04: Content-type validation
 */
export function validateFileUpload(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType: string,
  category: keyof typeof MAX_FILE_SIZES
): { valid: boolean; error?: string } {
  // Extract category from key if not provided in full path
  const defaultCategory = (key.split("/")?.[2] || category) as keyof typeof MAX_FILE_SIZES;
  const actualCategory = category || defaultCategory;

  // Size validation
  const size = typeof body === "string" ? Buffer.byteLength(body) : body.length;
  const maxSize = MAX_FILE_SIZES[actualCategory];

  if (size > maxSize) {
    return {
      valid: false,
      error: `File size ${(size / 1024).toFixed(2)}KB exceeds limit of ${(maxSize / 1024).toFixed(2)}KB for category ${actualCategory}`,
    };
  }

  // Content-type validation
  const allowedTypes = ALLOWED_CONTENT_TYPES[actualCategory];
  if (allowedTypes && !allowedTypes.includes(contentType)) {
    return {
      valid: false,
      error: `Content-type '${contentType}' not allowed for ${actualCategory}. Allowed: ${allowedTypes.join(", ")}`,
    };
  }

  return { valid: true };
}

/**
 * Upload file to R2 with security validation
 * Always validates before upload
 *
 * OPS-04: Validated upload with size and type checks
 */
export async function uploadWithValidation(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType: string,
  category: keyof typeof MAX_FILE_SIZES
): Promise<{ success: boolean; key?: string; error?: string }> {
  // Validate file
  const validation = validateFileUpload(key, body, contentType, category);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
    };
  }

  try {
    await r2Client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Add security headers for uploaded files
        ServerSideEncryption: "AES256", // Encrypt at rest
        Metadata: {
          "security-validated": "true",
          "uploaded-at": new Date().toISOString(),
        },
      })
    );

    return { success: true, key };
  } catch (error) {
    return {
      success: false,
      error: `R2 upload failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Get file size limit for a category
 * Useful for frontend validation
 */
export function getFileSizeLimit(category: keyof typeof MAX_FILE_SIZES): number {
  return MAX_FILE_SIZES[category];
}

/**
 * Get allowed content types for a category
 * Useful for form input accept attribute
 */
export function getAllowedContentTypes(category: keyof typeof MAX_FILE_SIZES): string[] {
  return ALLOWED_CONTENT_TYPES[category] || [];
}
