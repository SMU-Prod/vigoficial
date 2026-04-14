import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12; // PRD Seção 7: Bcrypt com 12 rounds

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Valida requisitos de senha do PRD Seção 3.8:
 * Mínimo 12 caracteres + maiúscula + número + especial
 */
export function validatePasswordStrength(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 12) {
    errors.push("Mínimo 12 caracteres");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("Pelo menos 1 letra mai��scula");
  }
  if (!/[0-9]/.test(password)) {
    errors.push("Pelo menos 1 número");
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push("Pelo menos 1 caractere especial");
  }

  return { valid: errors.length === 0, errors };
}
