/**
 * Script de importação dos CNPJs da RFB para a tabela de prospects
 *
 * Uso:
 *   npx tsx scripts/import-rfb-prospects.ts <caminho-do-csv>
 *
 * O CSV deve ter o formato extraído da RFB com separador ";"
 * Filtra apenas MATRIZ + situação ATIVA
 * Calcula segmento e score automaticamente
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

// ============================================================================
// Carrega .env.local manualmente (sem depender de dotenv)
// ============================================================================

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
    // Remove aspas
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

// Tenta carregar .env.local e .env na raiz do projeto
const projectRoot = resolve(__dirname, "..");
loadEnvFile(join(projectRoot, ".env.local"));
loadEnvFile(join(projectRoot, ".env"));

// ============================================================================
// Configuração
// ============================================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Variáveis NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// CNAEs alvo de segurança privada com obrigação GESP
const CNAES_GESP = [
  "8011101", // Atividades de vigilância e segurança privada
  "8011102", // Serviços de adestramento de cães de guarda
  "8012900", // Atividades de transporte de valores
  "8020001", // Atividades de monitoramento de sistemas de segurança eletrônica
  "8020002", // Outras atividades de serviços de segurança
  "8030700", // Atividades de investigação particular
];

// ============================================================================
// Parser CSV
// ============================================================================

function parseCapitalSocial(valor: string): number | null {
  if (!valor) return null;
  // "R$ 100.000,00" → 100000.00
  const clean = valor
    .replace("R$", "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const num = parseFloat(clean);
  return isNaN(num) ? null : num;
}

function determineSegmento(capital: number | null): string | null {
  if (!capital) return null;
  if (capital >= 1000000) return "grande";
  if (capital >= 200000) return "media";
  if (capital >= 50000) return "pequena";
  return "micro";
}

function calculateScore(row: any): number {
  let score = 0;

  // CNAE principal
  if (row.cnae_principal === "8011101") score += 30;
  else if (CNAES_GESP.includes(row.cnae_principal)) score += 20;

  // Tem email
  if (row.email) score += 15;

  // Tem telefone
  if (row.telefone1) score += 10;

  // Capital social
  if (row.capital_social) {
    if (row.capital_social >= 1000000) score += 20;
    else if (row.capital_social >= 200000) score += 15;
    else if (row.capital_social >= 50000) score += 10;
    else score += 5;
  }

  // Empresa recente
  if (row.data_abertura) {
    const parts = row.data_abertura.split("/");
    const year = parseInt(parts[2] || "0");
    if (year >= 2020) score += 10;
    else if (year >= 2010) score += 5;
  }

  // UF prioritária
  const ufsPrioritarias = ["SP", "RJ", "MG", "PR", "RS", "BA", "DF"];
  if (row.uf && ufsPrioritarias.includes(row.uf)) score += 5;

  return Math.min(100, score);
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ";" && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

// ============================================================================
// Importação
// ============================================================================

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("❌ Uso: npx tsx scripts/import-rfb-prospects.ts <caminho-do-csv>");
    process.exit(1);
  }

  console.log("📂 Lendo CSV:", resolve(csvPath));
  const content = readFileSync(resolve(csvPath), "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());

  // Pega headers
  const headers = parseCsvLine(lines[0]).map((h) => h.replace(/"/g, "").trim());
  console.log(`📋 Headers: ${headers.join(", ")}`);
  console.log(`📊 Total de linhas: ${lines.length - 1}`);

  // Mapeia índices
  const idx = (name: string) => headers.indexOf(name);

  // Processa linhas
  const prospects: any[] = [];
  let skippedFilial = 0;
  let skippedInativa = 0;
  let skippedNoCnae = 0;

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length < 5) continue;

    const matrizFilial = fields[idx("matriz_filial")]?.replace(/"/g, "").trim();
    const situacao = fields[idx("situacao_cadastral")]?.replace(/"/g, "").trim();
    const cnaeCode = fields[idx("cnae_principal_codigo")]?.replace(/"/g, "").trim();

    // Filtra: apenas MATRIZ + ATIVA
    if (matrizFilial !== "MATRIZ") { skippedFilial++; continue; }
    if (situacao !== "ATIVA") { skippedInativa++; continue; }

    // Verifica se tem CNAE de segurança (principal ou secundário)
    const cnaesSecundarios = fields[idx("cnaes_secundarios")]?.replace(/"/g, "").trim() || "";
    const allCnaes = [cnaeCode, ...cnaesSecundarios.split(",")].filter(Boolean);
    const hasGespCnae = allCnaes.some((c) => CNAES_GESP.includes(c));

    // Inclui todas as empresas do CSV (já são do setor)
    const cnpjRaw = fields[idx("cnpj")]?.replace(/"/g, "").trim().replace(/\D/g, "");
    if (!cnpjRaw || cnpjRaw.length !== 14) continue;

    const capital = parseCapitalSocial(fields[idx("capital_social")]?.replace(/"/g, "").trim());
    const email = fields[idx("email")]?.replace(/"/g, "").trim().toLowerCase() || null;
    const telefone1 = fields[idx("telefone1")]?.replace(/"/g, "").trim() || null;
    const telefone2 = fields[idx("telefone2")]?.replace(/"/g, "").trim() || null;
    const uf = fields[idx("uf")]?.replace(/"/g, "").trim() || null;

    const row = {
      cnpj: cnpjRaw,
      razao_social: fields[idx("razao_social")]?.replace(/"/g, "").trim(),
      nome_fantasia: fields[idx("nome_fantasia")]?.replace(/"/g, "").trim() || null,
      cnae_principal: cnaeCode || null,
      cnae_descricao: fields[idx("cnae_principal_descricao")]?.replace(/"/g, "").trim() || null,
      data_abertura: fields[idx("data_abertura")]?.replace(/"/g, "").trim() || null,
      capital_social: capital,
      porte: fields[idx("porte")]?.replace(/"/g, "").trim() || null,
      logradouro: [
        fields[idx("tipo_logradouro")]?.replace(/"/g, "").trim(),
        fields[idx("logradouro")]?.replace(/"/g, "").trim(),
      ].filter(Boolean).join(" ") || null,
      numero: fields[idx("numero")]?.replace(/"/g, "").trim() || null,
      complemento: fields[idx("complemento")]?.replace(/"/g, "").trim() || null,
      bairro: fields[idx("bairro")]?.replace(/"/g, "").trim() || null,
      cep: fields[idx("cep")]?.replace(/"/g, "").trim() || null,
      municipio: fields[idx("municipio")]?.replace(/"/g, "").trim() || null,
      uf,
      telefone1,
      telefone2,
      email,
      status: "novo",
      source: "csv_rfb",
      segmento: determineSegmento(capital),
      temperatura: "frio",
      score: 0,
      tags: hasGespCnae ? ["gesp_obrigatoria"] : ["setor_seguranca"],
      importado_por: "script_rfb",
    };

    row.score = calculateScore(row);
    prospects.push(row);
  }

  console.log(`\n📊 Resumo do processamento:`);
  console.log(`  ✅ Prospects a importar: ${prospects.length}`);
  console.log(`  ⏭️  Filiais ignoradas: ${skippedFilial}`);
  console.log(`  ⏭️  Inativas ignoradas: ${skippedInativa}`);

  // Importa em batches de 100
  const BATCH_SIZE = 100;
  let imported = 0;
  let duplicates = 0;
  let errors = 0;

  console.log(`\n🚀 Iniciando importação em batches de ${BATCH_SIZE}...`);

  for (let i = 0; i < prospects.length; i += BATCH_SIZE) {
    const batch = prospects.slice(i, i + BATCH_SIZE);

    const { data, error } = await supabase
      .from("prospects")
      .upsert(batch, { onConflict: "cnpj", ignoreDuplicates: true })
      .select("id");

    if (error) {
      console.error(`  ❌ Batch ${Math.floor(i / BATCH_SIZE) + 1} erro: ${error.message}`);
      errors += batch.length;
    } else {
      const insertedCount = (data || []).length;
      imported += insertedCount;
      duplicates += batch.length - insertedCount;
    }

    // Progress
    if ((i / BATCH_SIZE) % 10 === 0) {
      const pct = Math.round(((i + BATCH_SIZE) / prospects.length) * 100);
      console.log(`  📦 Progresso: ${Math.min(pct, 100)}% (${imported} importados)`);
    }
  }

  console.log(`\n✅ Importação concluída!`);
  console.log(`  📥 Importados: ${imported}`);
  console.log(`  🔄 Duplicados (ignorados): ${duplicates}`);
  console.log(`  ❌ Erros: ${errors}`);

  // Estatísticas finais
  const { count } = await supabase
    .from("prospects")
    .select("*", { count: "exact", head: true });

  console.log(`\n📊 Total de prospects no banco: ${count}`);
}

main().catch(console.error);
