import * as crypto from "crypto";
import { env } from "@/lib/config/env"; // OPS-02

/**
 * Criptografia simétrica AES-256-GCM para campos sensíveis
 * Usado para: senhas de certificados digitais, dados sensíveis no banco
 *
 * A chave é derivada do ENCRYPTION_KEY no .env via HKDF
 * Se ENCRYPTION_KEY não estiver definida, usa JWT_SECRET como fallback
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT = "vigi-field-encryption-v1";

/**
 * Deriva chave de 256 bits a partir da env var
 */
function getDerivedKey(): Buffer {
  const secret = env.ENCRYPTION_KEY || env.JWT_SECRET;
  if (!secret) {
    throw new Error("ENCRYPTION_KEY ou JWT_SECRET não definido no ambiente");
  }
  return crypto.scryptSync(secret, SALT, 32);
}

/**
 * Criptografa um campo de texto (ex.: senha do certificado digital)
 *
 * Formato de saída: iv:authTag:ciphertext (tudo em hex)
 */
export function encryptField(plaintext: string): string {
  const key = getDerivedKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Descriptografa um campo previamente criptografado com encryptField
 *
 * @param encrypted - String no formato iv:authTag:ciphertext (hex)
 * @returns Texto original
 * @throws Se o formato for inválido ou a chave estiver errada
 */
export function decryptField(encrypted: string): string {
  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error(
      "Campo criptografado em formato inválido. Esperado: iv:authTag:ciphertext"
    );
  }

  const [ivHex, authTagHex, ciphertext] = parts;
  const key = getDerivedKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
