/**
 * VIGI PRO — Enriquecimento em Massa via BrasilAPI
 *
 * COMO RODAR:
 *   node scripts/enrich-all.mjs
 *
 * Flags:
 *   --prospects-only   → só prospects
 *   --companies-only   → só companies
 *   --limit=50         → limita quantidade
 *   --dry-run          → mostra sem alterar
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Carrega .env.local manualmente (sem dependência de dotenv)
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios no .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── BrasilAPI ────────────────────────────────────────────────────────────────

let lastRequest = 0;

async function fetchCNPJ(cnpj) {
  const clean = cnpj.replace(/\D/g, "");
  if (clean.length !== 14) return null;

  // Rate limit: max 3 req/s
  const now = Date.now();
  const wait = Math.max(0, 350 - (now - lastRequest));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();

  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`, {
      headers: {
        "User-Agent": "VIGI-PRO/1.0 (enrich-script)",
        "Accept": "application/json",
      },
    });
    if (!res.ok) {
      if (res.status === 429) {
        console.log(`  ... Rate limited, aguardando 5s...`);
        await new Promise((r) => setTimeout(r, 5000));
        return fetchCNPJ(cnpj);
      }
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error(`  ERRO ao buscar ${clean}:`, err.message);
    return null;
  }
}

// ─── Args ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const prospectsOnly = args.includes("--prospects-only");
const companiesOnly = args.includes("--companies-only");
const dryRun = args.includes("--dry-run");
const fillGaps = args.includes("--fill-gaps"); // Re-enrich prospects missing email/telefone
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1]) : 500;

// ─── Enrich Prospects ─────────────────────────────────────────────────────────

async function enrichProspects() {
  console.log("\n Buscando prospects sem dados completos...");

  const { data: prospects, error } = await supabase
    .from("prospects")
    .select("id, cnpj, razao_social")
    .is("cnae_principal", null)
    .not("cnpj", "is", null)
    .limit(limit);

  if (error) {
    console.error("ERRO ao buscar prospects:", error.message);
    return { total: 0, ok: 0, fail: 0 };
  }

  console.log(`${prospects.length} prospects pendentes\n`);

  let ok = 0, fail = 0;

  for (let i = 0; i < prospects.length; i++) {
    const p = prospects[i];
    const nome = (p.razao_social || "").slice(0, 45);
    process.stdout.write(`  [${i + 1}/${prospects.length}] ${nome}... `);

    if (dryRun) {
      console.log("(dry-run)");
      ok++;
      continue;
    }

    const data = await fetchCNPJ(p.cnpj);
    if (!data) {
      console.log("nao encontrado");
      fail++;
      continue;
    }

    const updateFields = {
      nome_fantasia: data.nome_fantasia || null,
      cnae_principal: data.cnae_fiscal ? String(data.cnae_fiscal) : null,
      cnae_descricao: data.cnae_fiscal_descricao || null,
      data_abertura: data.data_inicio_atividade || null,
      capital_social: data.capital_social || null,
      porte: data.porte || null,
      telefone1: data.ddd_telefone_1 || null,
      telefone2: data.ddd_telefone_2 || null,
      logradouro: data.logradouro || null,
      numero: data.numero || null,
      complemento: data.complemento || null,
      bairro: data.bairro || null,
      cep: data.cep || null,
      municipio: data.municipio || null,
      uf: data.uf || null,
      updated_at: new Date().toISOString(),
    };

    // Se o prospect nao tem email mas a BrasilAPI tem, adiciona
    if (data.email) {
      updateFields.email = data.email;
    }

    const { error: updateErr } = await supabase
      .from("prospects")
      .update(updateFields)
      .eq("id", p.id);

    if (updateErr) {
      console.log(`ERRO: ${updateErr.message}`);
      fail++;
    } else {
      console.log(`OK ${data.municipio || "?"}/${data.uf || "?"} CNAE:${data.cnae_fiscal || "?"}`);
      ok++;
    }
  }

  return { total: prospects.length, ok, fail };
}

// ─── Fill Gaps (email/telefone faltantes em prospects já enriquecidos) ────────

async function fillProspectGaps() {
  console.log("\n Buscando prospects COM cnae mas SEM email...");

  const { data: prospects, error } = await supabase
    .from("prospects")
    .select("id, cnpj, razao_social, email, telefone1, telefone2, municipio")
    .not("cnae_principal", "is", null)
    .is("email", null)
    .not("cnpj", "is", null)
    .limit(limit);

  if (error) {
    console.error("ERRO ao buscar prospects:", error.message);
    return { total: 0, ok: 0, fail: 0 };
  }

  console.log(`${prospects.length} prospects sem email para verificar\n`);

  let ok = 0, fail = 0, skipped = 0;

  for (let i = 0; i < prospects.length; i++) {
    const p = prospects[i];
    const nome = (p.razao_social || "").slice(0, 40);
    process.stdout.write(`  [${i + 1}/${prospects.length}] ${nome}... `);

    if (dryRun) {
      console.log("(dry-run)");
      ok++;
      continue;
    }

    const data = await fetchCNPJ(p.cnpj);
    if (!data) {
      console.log("nao encontrado");
      fail++;
      continue;
    }

    // Só atualiza campos que estão vazios no banco
    const updates = {};
    if (!p.email && data.email) updates.email = data.email;
    if (!p.telefone1 && data.ddd_telefone_1) updates.telefone1 = data.ddd_telefone_1;
    if (!p.telefone2 && data.ddd_telefone_2) updates.telefone2 = data.ddd_telefone_2;
    if (!p.municipio && data.municipio) updates.municipio = data.municipio;

    if (Object.keys(updates).length === 0) {
      console.log("sem dados novos na API");
      skipped++;
      continue;
    }

    updates.updated_at = new Date().toISOString();

    const { error: updateErr } = await supabase
      .from("prospects")
      .update(updates)
      .eq("id", p.id);

    if (updateErr) {
      console.log(`ERRO: ${updateErr.message}`);
      fail++;
    } else {
      const filled = Object.keys(updates).filter(k => k !== "updated_at").join(", ");
      console.log(`OK +${filled}`);
      ok++;
    }
  }

  console.log(`\n  Resumo gaps: ${ok} atualizados, ${skipped} sem dados novos, ${fail} falhas`);
  return { total: prospects.length, ok, fail };
}

// ─── Enrich Companies ─────────────────────────────────────────────────────────

async function enrichCompanies() {
  console.log("\n Buscando companies sem dados completos...");

  // Tenta com enriched_at, fallback para cnae_principal
  let companies, error;

  const r1 = await supabase
    .from("companies")
    .select("id, cnpj, razao_social")
    .is("enriched_at", null)
    .limit(limit);

  if (r1.error) {
    // Campo enriched_at nao existe - migration nao rodou
    console.log("  Campo enriched_at nao existe, tentando fallback...");
    const r2 = await supabase
      .from("companies")
      .select("id, cnpj, razao_social")
      .is("cnae_principal", null)
      .limit(limit);

    if (r2.error) {
      // cnae_principal tambem nao existe - migration nao rodou
      console.log("  Campos novos nao existem. Rode a migration primeiro:");
      console.log("  supabase/migrations/20260404_companies_enrich_fields.sql");
      console.log("  Atualizando apenas nome_fantasia...\n");

      const r3 = await supabase
        .from("companies")
        .select("id, cnpj, razao_social, nome_fantasia")
        .is("nome_fantasia", null)
        .limit(limit);

      companies = r3.data;
      error = r3.error;
    } else {
      companies = r2.data;
      error = r2.error;
    }
  } else {
    companies = r1.data;
    error = r1.error;
  }

  if (error || !companies) {
    console.error("ERRO ao buscar companies:", error?.message);
    return { total: 0, ok: 0, fail: 0 };
  }

  console.log(`${companies.length} companies pendentes\n`);

  let ok = 0, fail = 0;

  for (let i = 0; i < companies.length; i++) {
    const c = companies[i];
    const nome = (c.razao_social || "").slice(0, 45);
    process.stdout.write(`  [${i + 1}/${companies.length}] ${nome}... `);

    if (dryRun) {
      console.log("(dry-run)");
      ok++;
      continue;
    }

    const data = await fetchCNPJ(c.cnpj);
    if (!data) {
      console.log("nao encontrado");
      fail++;
      continue;
    }

    // Tenta update com todos os campos
    const fullUpdate = {
      nome_fantasia: data.nome_fantasia || null,
      cnae_principal: data.cnae_fiscal ? String(data.cnae_fiscal) : null,
      cnae_descricao: data.cnae_fiscal_descricao || null,
      capital_social: data.capital_social || null,
      porte: data.porte || null,
      data_abertura: data.data_inicio_atividade || null,
      natureza_juridica: data.natureza_juridica || null,
      logradouro: data.logradouro || null,
      numero: data.numero || null,
      complemento: data.complemento || null,
      bairro: data.bairro || null,
      cep: data.cep || null,
      municipio: data.municipio || null,
      situacao_cadastral: data.situacao || null,
      enriched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error: err1 } = await supabase
      .from("companies")
      .update(fullUpdate)
      .eq("id", c.id);

    if (err1) {
      // Fallback: so nome_fantasia (campo original)
      const { error: err2 } = await supabase
        .from("companies")
        .update({
          nome_fantasia: data.nome_fantasia || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", c.id);

      if (err2) {
        console.log(`ERRO: ${err2.message}`);
        fail++;
      } else {
        console.log(`PARCIAL (rode migration) ${data.municipio || "?"}/${data.uf || "?"}`);
        ok++;
      }
    } else {
      console.log(`OK ${data.municipio || "?"}/${data.uf || "?"} CNAE:${data.cnae_fiscal || "?"}`);
      ok++;
    }
  }

  return { total: companies.length, ok, fail };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("===================================================");
  console.log("  VIGI PRO - Enriquecimento em Massa (BrasilAPI)");
  console.log("===================================================");
  console.log(`  Supabase: ${SUPABASE_URL}`);
  console.log(`  Limite: ${limit}`);
  console.log(`  Modo: ${dryRun ? "DRY RUN" : "PRODUCAO"}${fillGaps ? " + FILL GAPS" : ""}`);

  let pResult = { total: 0, ok: 0, fail: 0 };
  let cResult = { total: 0, ok: 0, fail: 0 };

  if (!companiesOnly) pResult = await enrichProspects();
  if (fillGaps) {
    console.log("\n--- Modo --fill-gaps: preenchendo email/telefone faltantes ---");
    const gapResult = await fillProspectGaps();
    pResult.total += gapResult.total;
    pResult.ok += gapResult.ok;
    pResult.fail += gapResult.fail;
  }
  if (!prospectsOnly) cResult = await enrichCompanies();

  console.log("\n===================================================");
  console.log("  RESULTADO FINAL");
  console.log("===================================================");
  if (!companiesOnly) console.log(`  Prospects: ${pResult.ok}/${pResult.total} OK, ${pResult.fail} falhas`);
  if (!prospectsOnly) console.log(`  Companies: ${cResult.ok}/${cResult.total} OK, ${cResult.fail} falhas`);
  console.log("===================================================\n");
}

main().catch(console.error);
