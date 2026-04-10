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
 * Gera o caminho R2 padronizado conforme Seção 6.6 do PRD
 */
export function r2Path(
  companyId: string,
  category: "certificados" | "documentos" | "gesp_prints" | "discrepancias" | "emails_gerados" | "billing",
  filename: string,
  date?: string
) {
  const dateStr = date || new Date().toISOString().split("T")[0];
  if (category === "gesp_prints" || category === "discrepancias") {
    return `companies/${companyId}/${category}/${dateStr}/${filename}`;
  }
  return `companies/${companyId}/${category}/${filename}`;
}
