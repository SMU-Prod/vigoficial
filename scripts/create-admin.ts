/**
 * Cria/reseta o usuário admin no banco de dados
 *
 * Uso: npx tsx scripts/create-admin.ts
 */

import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

// Carrega .env.local
function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

const projectRoot = resolve(__dirname, "..");
loadEnvFile(join(projectRoot, ".env.local"));
loadEnvFile(join(projectRoot, ".env"));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Variáveis de ambiente não encontradas");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const email = "admin@vigi.com";
  const password = "Admin@Vigi2026!";

  console.log("🔐 Gerando hash bcrypt...");
  const hash = await bcrypt.hash(password, 12);
  console.log("✅ Hash gerado");

  // Verifica se já existe
  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .single();

  if (existing) {
    // Atualiza senha
    const { error } = await supabase
      .from("users")
      .update({
        password_hash: hash,
        tentativas_falhas: 0,
        bloqueado_ate: null,
        deve_trocar_senha: false,
      })
      .eq("id", existing.id);

    if (error) {
      console.error("❌ Erro ao atualizar:", error.message);
      process.exit(1);
    }
    console.log("✅ Usuário atualizado!");
  } else {
    // Cria novo
    const { error } = await supabase.from("users").insert({
      email,
      password_hash: hash,
      nome: "Admin VIGI",
      role: "admin",
      company_ids: [],
      deve_trocar_senha: false,
      tentativas_falhas: 0,
    });

    if (error) {
      console.error("❌ Erro ao criar:", error.message);
      process.exit(1);
    }
    console.log("✅ Usuário criado!");
  }

  console.log("\n📋 Credenciais:");
  console.log(`   Email: ${email}`);
  console.log(`   Senha: ${password}`);
  console.log("\n🚀 Agora faça login em http://localhost:3000/login");
}

main().catch(console.error);
