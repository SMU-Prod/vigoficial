/**
 * JWT verification for Edge Runtime (middleware).
 * Uses Web Crypto API (HMAC-SHA256) — no Node.js dependencies.
 *
 * O jwt.ts principal usa 'jsonwebtoken' que depende de Node.js crypto.
 * Este módulo é usado APENAS no middleware (Edge Runtime).
 */

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error(
    "[jwt-edge] JWT_SECRET não definido. Configure a variável de ambiente JWT_SECRET."
  );
}

interface JwtPayloadEdge {
  userId: string;
  email: string;
  role: string;
  companyIds: string[];
  iat?: number;
  exp?: number;
}

/**
 * Decodifica Base64URL para Uint8Array (raw bytes).
 * Seguro para conteúdo binário (assinaturas) e texto.
 */
function base64UrlToUint8Array(str: string): Uint8Array {
  const padded = str + "=".repeat((4 - (str.length % 4)) % 4);
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Decodifica Base64URL para string UTF-8.
 * Usa TextDecoder para suportar caracteres multi-byte (acentos, emojis, etc).
 */
function base64UrlDecodeUtf8(str: string): string {
  const bytes = base64UrlToUint8Array(str);
  return new TextDecoder("utf-8").decode(bytes);
}

/**
 * Verify a HS256 JWT using Web Crypto API.
 * Works in Edge Runtime, Service Workers, and browsers.
 */
export async function verifyTokenEdge(token: string): Promise<JwtPayloadEdge> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format");
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  // Verify header is HS256
  const header = JSON.parse(base64UrlDecodeUtf8(headerB64));
  if (header.alg !== "HS256") {
    throw new Error(`Unsupported algorithm: ${header.alg}`);
  }

  // Import the secret key
  const encoder = new TextEncoder();
  const keyData = encoder.encode(JWT_SECRET);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  // Verify signature
  const signatureInput = encoder.encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlToUint8Array(signatureB64);

  const valid = await crypto.subtle.verify("HMAC", cryptoKey, signature as Uint8Array<ArrayBuffer>, signatureInput);

  if (!valid) {
    throw new Error("Invalid JWT signature");
  }

  // Parse payload (UTF-8 safe for metadata with accents, etc.)
  const payload: JwtPayloadEdge = JSON.parse(base64UrlDecodeUtf8(payloadB64));

  // Check expiration
  if (payload.exp && Date.now() >= payload.exp * 1000) {
    throw new Error("JWT expired");
  }

  return payload;
}
