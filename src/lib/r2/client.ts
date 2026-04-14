import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { env } from "@/lib/config/env"; // OPS-02: Use validated env

const r2Client = new S3Client({
  region: "auto",
  endpoint: env.R2_ENDPOINT,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = env.R2_BUCKET_NAME;

export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType: string = "application/octet-stream"
) {
  await r2Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return key;
}

export async function getFromR2(key: string) {
  const response = await r2Client.send(
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })
  );
  return response.Body;
}

/**
 * Gera o caminho R2 padronizado por CNPJ.
 *
 * Estrutura:
 *   {cnpj_limpo}/{categoria}/{filename}
 *   {cnpj_limpo}/{categoria}/{date}/{filename}  (para prints e discrepâncias)
 *
 * Fallback: se cnpj não for fornecido, usa companyId (retrocompatibilidade).
 */
export function r2Path(
  companyId: string,
  category: "certificados" | "documentos" | "gesp_prints" | "discrepancias" | "emails_gerados" | "billing" | "procuracoes" | "contratos",
  filename: string,
  options?: { date?: string; cnpj?: string }
) {
  const dateStr = options?.date || new Date().toISOString().split("T")[0];
  const base = options?.cnpj
    ? `cnpj/${options.cnpj.replace(/\D/g, "")}`
    : `companies/${companyId}`;

  if (category === "gesp_prints" || category === "discrepancias") {
    return `${base}/${category}/${dateStr}/${filename}`;
  }
  return `${base}/${category}/${filename}`;
}

/**
 * Gera path R2 com CNPJ obrigatório.
 * Uso recomendado para novos uploads — garante organização por CNPJ.
 */
export function r2PathByCnpj(
  cnpj: string,
  category: string,
  filename: string,
  date?: string
): string {
  const cnpjLimpo = cnpj.replace(/\D/g, "");
  if (cnpjLimpo.length !== 14) {
    throw new Error(`CNPJ inválido para path R2: "${cnpj}"`);
  }
  const dateStr = date || new Date().toISOString().split("T")[0];
  return `cnpj/${cnpjLimpo}/${category}/${dateStr}/${filename}`;
}
