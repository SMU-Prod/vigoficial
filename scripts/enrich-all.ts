/**
 * VIGI PRO — Script de Enriquecimento em Massa via BrasilAPI
 *
 * Popula dados completos (CNAE, endereço, capital, porte, telefones, etc.)
 * de TODAS as empresas em prospects e companies que ainda não foram enriquecidas.
 *
 * COMO RODAR:
 *   npx tsx scripts/enrich-all.ts
 *
 * Flags opcionais:
 *   --prospects-only   → só enriquece prospects
 *   --companies-only   → só enriquece companies
 *   --limit=50         → limita quantidade por tabela
 *   --dry-run          → mostra o que faria sem alterar o banco
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { resolve } from "path";

// Carrega .env.local
dotenv.config({ path: resolve(__dirname, "../.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios no .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── BrasilAPI ────────────────────────────────────────────────────────────────

interface BrasilAPIResponse {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  cnae_fiscal: number;
  cnae_fiscal_descricao: string;
  data_inicio_atividade: string;
  situacao: string;
  capital_social: number;
  porte: string;
  email: string | null;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cep: string;
  municipio: string;
  uf: string;
  ddd_telefone_1: string | null;
  ddd_telefone_2: string | null;
  natureza_juridica: string;
}

let lastRequest = 0;

async function fetchCNPJ(cnpj: string): Promise<BrasilAPIResponse | null> {
  const clean = cnpj.replace(/\D/g, "");
  if (clean.length !== 14) return null;

  // Rate limit: max 3 req/s
  const now = Date.now();
  const wait = Math.max(0, 350 - (now - lastRequest));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();

  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`);
    if (!res.ok) {
      if (res.status === 429) {
        // Rate limited — espera 5s e tenta de novo
        console.log(`  ⏳ Rate limited, aguardando 5s...`);
        await new Promise((r) => setTimeout(r, 5000));
        return fetchCNPJ(cnpj);
      }
      return null;
    }
    return (await res.json()) as BrasilAPIResponse;
  } catch (err) {
    console.error(`  ❌ Erro ao buscar ${clean}:`, err);
    return null;
  }
}

// ─── Args ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const prospectsOnly = args.includes("--prospects-only");
const companiesOnly = args.includes("--companies-only");
const dryRun = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1]) : 500;

// ─── Enrich Prospects ─────────────────────────────────────────────────────────

async function enrichProspects() {
  console.log("\n🔍 Buscando prospects sem dados completos...");

  const { data: prospects, error } = await supabase
    .from("prospects")
    .select("id, cnpj, razao_social")
    .is("cnae_principal", null)
    .not("cnpj", "is", null)
    .limit(limit);

  if (error) {
    console.error("❌ Erro ao buscar prospects:", error.message);
    return { total: 0, ok: 0, fail: 0 };
  }

  console.log(`📋 ${prospects.length} prospects pendentes de enriquecimento\n`);

  let ok = 0, fail = 0;

  for (let i = 0; i < prospects.length; i++) {
    const p = prospects[i];
    process.stdout.write(`  [${i + 1}/${prospects.length}] ${p.razao_social?.slice(0, 40)}... `);

    if (dryRun) {
      console.log("(dry-run)");
      ok++;
      continue;
    }

    const data = await fetchCNPJ(p.cnpj);
    if (!data) {
      console.log("❌ não encontrado");
      fail++;
      continue;
    }

    const { error: updateErr } = await supabase
      .from("prospects")
      .update({
        nome_fantasia: data.nome_fantasia || null,
        cnae_principal: String(data.cnae_fiscal) || null,
        cnae_descricao: data.cnae_fiscal_descricao || null,
        data_abertura: data.data_inicio_atividade || null,
        capital_social: data.capital_social || null,
        porte: data.porte || null,
        email: data.email || undefined, // não sobrescreve se já tem
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
      })
      .eq("id", p.id);

    if (updateErr) {
      console.log(`❌ ${updateErr.message}`);
      fail++;
    } else {
      console.log(`✅ ${data.municipio}/${data.uf} — CNAE ${data.cnae_fiscal}`);
      ok++;
    }
  }

  return { total: prospects.length, ok, fail };
}

// ─── Enrich Companies ─────────────────────────────────────────────────────────

async function enrichCompanies() {
  console.log("\n🏢 Buscando companies sem dados completos...");

  // Tenta com enriched_at (campo novo), fallback para cnae_principal
  let { data: companies, error } = await supabase
    .from("companies")
    .select("id, cnpj, razao_social")
    .is("enriched_at", null)
    .limit(limit);

  if (error) {
    // Campo enriched_at pode não existir ainda — fallback
    console.log("  ⚠️  Campo enriched_at não existe, usando fallback...");
    const fallback = await supabase
      .from("companies")
      .select("id, cnpj, razao_social")
      .is("cnae_principal", null)
      .limit(limit);
    companies = fallback.data;
    error = fallback.error;
  }

  if (error || !companies) {
    console.error("❌ Erro ao buscar companies:", error?.message);
    return { total: 0, ok: 0, fail: 0 };
  }

  console.log(`📋 ${companies.length} companies pendentes de enriquecimento\n`);

  let ok = 0, fail = 0;

  for (let i = 0; i < companies.length; i++) {
    const c = companies[i];
    process.stdout.write(`  [${i + 1}/${companies.length}] ${c.razao_social?.slice(0, 40)}... `);

    if (dryRun) {
      console.log("(dry-run)");
      ok++;
      continue;
    }

    const data = await fetchCNPJ(c.cnpj);
    if (!data) {
      console.log("❌ não encontrado");
      fail++;
      continue;
    }

    // Campos que existem na migration nova
    const updateFields: Record<string, unknown> = {
      nome_fantasia: data.nome_fantasia || undefined,
      updated_at: new Date().toISOString(),
    };

    // Tenta atualizar campos novos (ignora se migration não rodou)
    try {
      const { error: updateErr } = await supabase
        .from("companies")
        .update({
          ...updateFields,
          cnae_principal: String(data.cnae_fiscal) || null,
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
        })
        .eq("id", c.id);

      if (updateErr) {
        // Fallback: só atualiza nome_fantasia (campo que já existe)
        await supabase
          .from("companies")
          .update(updateFields)
          .eq("id", c.id);
        console.log(`⚠️  parcial (rode a migration primeiro) — ${data.municipio}/${data.uf}`);
      } else {
        console.log(`✅ ${data.municipio}/${data.uf} — CNAE ${data.cnae_fiscal}`);
      }
      ok++;
    } catch {
      console.log("❌ erro ao atualizar");
      fail++;
    }
  }

  return { total: companies.length, ok, fail };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  VIGI PRO — Enriquecimento em Massa (BrasilAPI)");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  Supabase: ${SUPABASE_URL}`);
  console.log(`  Limite por tabela: ${limit}`);
  console.log(`  Modo: ${dryRun ? "DRY RUN (sem alterações)" : "PRODUÇÃO"}`);

  let prospectResult = { total: 0, ok: 0, fail: 0 };
  let companyResult = { total: 0, ok: 0, fail: 0 };

  if (!companiesOnly) {
    prospectResult = await enrichProspects();
  }

  if (!prospectsOnly) {
    companyResult = await enrichCompanies();
  }

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  RESULTADO FINAL");
  console.log("═══════════════════════════════════════════════════");

  if (!companiesOnly) {
    console.log(`  Prospects: ${prospectResult.ok}/${prospectResult.total} ✅  ${prospectResult.fail} ❌`);
  }
  if (!prospectsOnly) {
    console.log(`  Companies: ${companyResult.ok}/${companyResult.total} ✅  ${companyResult.fail} ❌`);
  }

  console.log("═══════════════════════════════════════════════════\n");
}

main().catch(console.error);
