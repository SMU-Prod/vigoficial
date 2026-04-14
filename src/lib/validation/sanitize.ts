import { z } from "zod";

/**
 * Sanitize a string: trim, remove null bytes, limit length
 */
export function sanitizeString(
  input: unknown,
  maxLength: number = 5000
): string {
  if (typeof input !== "string") {
    return "";
  }

  return input
    .trim()
    .replace(/\0/g, "") // Remove null bytes
    .slice(0, maxLength);
}

/**
 * Sanitize HTML: strip all tags and dangerous attributes
 */
export function sanitizeHtml(input: unknown): string {
  if (typeof input !== "string") {
    return "";
  }

  return input
    .replace(/<[^>]*>/g, "") // Remove all HTML tags
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .trim();
}

/**
 * Sanitize input for AI API (Claude)
 * Prevent prompt injection by escaping dangerous patterns
 */
export function sanitizeForAI(input: unknown): string {
  if (typeof input !== "string") {
    return "";
  }

  let sanitized = sanitizeString(input);

  // Remove common prompt injection patterns
  const injectionPatterns = [
    /ignore\s+previous\s+instructions/gi,
    /system\s*prompt/gi,
    /instructions\s*override/gi,
    /disregard\s+everything/gi,
    /\{.*system.*\}/gi,
  ];

  for (const pattern of injectionPatterns) {
    sanitized = sanitized.replace(pattern, "");
  }

  // Remove suspicious escapes and control chars
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  return sanitized;
}

/**
 * Recursively sanitize all string fields in an object
 */
export function sanitizeObject(
  obj: unknown,
  schema?: z.ZodSchema
): Record<string, unknown> {
  if (typeof obj !== "object" || obj === null) {
    return {};
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Skip private/system fields
    if (key.startsWith("_") || key === "id" || key === "created_at" || key === "updated_at") {
      continue;
    }

    if (typeof value === "string") {
      result[key] = sanitizeString(value);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        typeof item === "string" ? sanitizeString(item) : item
      );
    } else if (typeof value === "object" && value !== null) {
      result[key] = sanitizeObject(value as Record<string, unknown>, schema);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Sanitize email: lowercase, trim, basic validation
 */
export function sanitizeEmail(input: unknown): string {
  if (typeof input !== "string") {
    return "";
  }

  const sanitized = input.trim().toLowerCase();

  // Basic email pattern check (additional validation should be done with Zod)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitized)) {
    return "";
  }

  return sanitized;
}

/**
 * Sanitize CPF: remove formatting, validate length
 */
export function sanitizeCpf(input: unknown): string {
  if (typeof input !== "string") {
    return "";
  }

  const digits = input.replace(/\D/g, "");

  if (digits.length !== 11) {
    return "";
  }

  return digits;
}

/**
 * Sanitize CNPJ: remove formatting, validate length
 */
export function sanitizeCnpj(input: unknown): string {
  if (typeof input !== "string") {
    return "";
  }

  const digits = input.replace(/\D/g, "");

  if (digits.length !== 14) {
    return "";
  }

  return digits;
}

/**
 * Sanitize phone: remove formatting, validate minimum length
 */
export function sanitizePhone(input: unknown): string {
  if (typeof input !== "string") {
    return "";
  }

  const digits = input.replace(/\D/g, "");

  if (digits.length < 8) {
    return "";
  }

  return digits;
}

/**
 * Sanitize UUID: validate format
 */
export function sanitizeUuid(input: unknown): string {
  if (typeof input !== "string") {
    return "";
  }

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!uuidRegex.test(input)) {
    return "";
  }

  return input.toLowerCase();
}

/**
 * Sanitize ISO date string
 */
export function sanitizeDate(input: unknown): string {
  if (typeof input !== "string") {
    return "";
  }

  const sanitized = input.trim();

  // Basic ISO date validation
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/.test(sanitized)) {
    return "";
  }

  try {
    // Verify it's a valid date
    new Date(sanitized);
    return sanitized;
  } catch {
    return "";
  }
}
