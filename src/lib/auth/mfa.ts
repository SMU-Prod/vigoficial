import { TOTP } from "@otplib/totp";
import { generateTOTP } from "@otplib/uri";
import QRCode from "qrcode";

const MFA_ISSUER = "VIG PRO";
const totp = new TOTP();

/**
 * Generate MFA secret and QR code for a user
 * Returns secret and QR code data URL
 */
export async function generateMfaSecret(email: string): Promise<{
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
}> {
  // Generate secret
  const secret = totp.generateSecret();

  // Create otpauth URL (for manual entry or scanning)
  const otpauthUrl = generateTOTP({
    issuer: MFA_ISSUER,
    label: email,
    secret,
  });

  // Generate QR code as data URL
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

  return {
    secret,
    otpauthUrl,
    qrCodeDataUrl,
  };
}

/**
 * Verify TOTP token against stored secret
 * Allows 30-second window (1 step) of drift
 */
export async function verifyMfaToken(secret: string, token: string): Promise<boolean> {
  try {
    // Verify with window of 1 (allows 30s skew before and after)
    const result = await totp.verify(token, {
      secret,
      epochTolerance: 30, // 30 seconds tolerance (1 period)
    });
    return result.valid;
  } catch {
    return false;
  }
}
