/**
 * VIGI — CNPJ Enrichment Service
 *
 * Integrates with BrasilAPI to fetch and enrich prospect data with real-time
 * company information.
 */

import { createSupabaseAdmin } from "@/lib/supabase/server";
import type { Prospect } from "@/types/database";

/**
 * BrasilAPI CNPJ Response format
 */
interface BrasilAPICNPJResponse {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  descricao: string;
  cnae_fiscal: number;
  cnae_fiscal_descricao: string;
  data_inicio_atividade: string;
  data_situacao: string;
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
  cnae_principal: {
    code: number;
    description: string;
  };
}

interface EnrichmentResult {
  success: boolean;
  data?: Partial<Prospect>;
  error?: string;
}

interface BatchEnrichmentResult {
  total: number;
  enriched: number;
  skipped: number;
  failed: number;
  errors: string[];
}

/**
 * Rate limiter state — max 3 requests per second
 */
let lastRequestTime = 0;
const minDelayMs = 1000 / 3; // ~333ms between requests

/**
 * Wait to respect rate limit (max 3 requests/second)
 */
async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < minDelayMs) {
    const delay = minDelayMs - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  lastRequestTime = Date.now();
}

/**
 * Fetch CNPJ data from BrasilAPI with retry logic
 */
async function fetchFromBrasilAPI(
  cnpj: string,
  retries: number = 1
): Promise<BrasilAPICNPJResponse> {
  const cnpjClean = cnpj.replace(/\D/g, "");

  if (cnpjClean.length !== 14) {
    throw new Error("Invalid CNPJ format");
  }

  // Respect rate limit
  await waitForRateLimit();

  const url = `https://brasilapi.com.br/api/cnpj/v1/${cnpjClean}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("CNPJ not found in BrasilAPI");
      }
      throw new Error(`BrasilAPI returned status ${response.status}`);
    }

    const data = await response.json();
    return data as BrasilAPICNPJResponse;
  } catch (error) {
    if (retries > 0) {
      // Wait 2 seconds before retrying
      await new Promise(resolve => setTimeout(resolve, 2000));
      return fetchFromBrasilAPI(cnpj, retries - 1);
    }
    throw error;
  }
}

/**
 * Map BrasilAPI response to prospect fields
 */
function mapBrasilAPIToPerspect(
  data: BrasilAPICNPJResponse
): Partial<Prospect> {
  return {
    nome_fantasia: data.nome_fantasia || null,
    cnae_principal: data.cnae_principal?.code?.toString() || null,
    cnae_descricao: data.cnae_fiscal_descricao || null,
    data_abertura: data.data_inicio_atividade || null,
    capital_social: data.capital_social || null,
    porte: data.porte || null,
    email: data.email || null,
    telefone1: data.ddd_telefone_1 || null,
    telefone2: data.ddd_telefone_2 || null,
    logradouro: data.logradouro || null,
    numero: data.numero || null,
    complemento: data.complemento || null,
    bairro: data.bairro || null,
    cep: data.cep || null,
    municipio: data.municipio || null,
    uf: data.uf || null,
  };
}

/**
 * Fetch CNPJ data and return without saving
 */
export async function enrichCnpjData(cnpj: string): Promise<EnrichmentResult> {
  try {
    const brasilData = await fetchFromBrasilAPI(cnpj);
    const mapped = mapBrasilAPIToPerspect(brasilData);

    return {
      success: true,
      data: mapped,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[CNPJ Enrichment] Error fetching data for", cnpj, errorMsg);

    return {
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * Fetch CNPJ data and update prospect in Supabase
 */
export async function enrichProspect(prospectId: string): Promise<EnrichmentResult> {
  const supabase = createSupabaseAdmin();

  try {
    // 1. Get prospect
    const { data: prospect, error: fetchError } = await supabase
      .from("prospects")
      .select("*")
      .eq("id", prospectId)
      .single();

    if (fetchError || !prospect) {
      return {
        success: false,
        error: `Prospect not found: ${fetchError?.message || "unknown"}`,
      };
    }

    if (!prospect.cnpj) {
      return {
        success: false,
        error: "Prospect has no CNPJ",
      };
    }

    // 2. Fetch from BrasilAPI
    const brasilData = await fetchFromBrasilAPI(prospect.cnpj);
    const enrichedFields = mapBrasilAPIToPerspect(brasilData);

    // 3. Update prospect
    const { data: updatedProspect, error: updateError } = await supabase
      .from("prospects")
      .update({
        ...enrichedFields,
        updated_at: new Date().toISOString(),
      })
      .eq("id", prospectId)
      .select()
      .single();

    if (updateError || !updatedProspect) {
      return {
        success: false,
        error: `Failed to update prospect: ${updateError?.message || "unknown"}`,
      };
    }

    // 4. Log activity
    try {
      await supabase.from("prospect_activities").insert({
        prospect_id: prospectId,
        tipo: "nota",
        descricao: `[Auto-Enriquecimento] Dados enriquecidos via BrasilAPI: ${Object.keys(enrichedFields).filter(k => enrichedFields[k as keyof typeof enrichedFields]).join(", ")}`,
        realizado_por: "sistema_enriquecimento",
      });
    } catch (actError) {
      console.warn("[CNPJ Enrichment] Could not log activity:", actError);
    }

    return {
      success: true,
      data: updatedProspect,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[CNPJ Enrichment] Error enriching prospect", prospectId, errorMsg);

    return {
      success: false,
      error: errorMsg,
    };
  }
}

// =============================================================================
// COMPANY ENRICHMENT (clientes já cadastrados)
// =============================================================================

/**
 * Map BrasilAPI response to company fields
 */
function mapBrasilAPIToCompany(data: BrasilAPICNPJResponse) {
  return {
    nome_fantasia: data.nome_fantasia || null,
    cnae_principal: data.cnae_principal?.code?.toString() || null,
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
  };
}

/**
 * Enriquece uma company (cliente) individual via BrasilAPI.
 */
export async function enrichCompany(companyId: string): Promise<EnrichmentResult> {
  const supabase = createSupabaseAdmin();

  try {
    const { data: company, error: fetchError } = await supabase
      .from("companies")
      .select("id, cnpj, razao_social")
      .eq("id", companyId)
      .single();

    if (fetchError || !company) {
      return { success: false, error: `Company not found: ${fetchError?.message || "unknown"}` };
    }

    if (!company.cnpj) {
      return { success: false, error: "Company has no CNPJ" };
    }

    const brasilData = await fetchFromBrasilAPI(company.cnpj);
    const enrichedFields = mapBrasilAPIToCompany(brasilData);

    const { error: updateError } = await supabase
      .from("companies")
      .update({ ...enrichedFields, updated_at: new Date().toISOString() })
      .eq("id", companyId);

    if (updateError) {
      return { success: false, error: `Failed to update company: ${updateError.message}` };
    }

    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[CNPJ Enrichment] Error enriching company", companyId, errorMsg);
    return { success: false, error: errorMsg };
  }
}

// =============================================================================
// BATCH ENRICHMENT (prospects antigos + companies)
// =============================================================================

/**
 * Enriquece em batch todos os prospects que ainda não têm dados completos.
 * Critério: campo `cnae_principal` é NULL (indica que nunca foi enriquecido).
 *
 * Respeita rate limit da BrasilAPI (3 req/s).
 */
export async function batchEnrichProspects(
  limit: number = 200
): Promise<BatchEnrichmentResult> {
  const supabase = createSupabaseAdmin();
  const result: BatchEnrichmentResult = {
    total: 0, enriched: 0, skipped: 0, failed: 0, errors: [],
  };

  // Busca prospects sem enriquecimento (cnae_principal = null e tem cnpj)
  const { data: prospects, error } = await supabase
    .from("prospects")
    .select("id, cnpj")
    .is("cnae_principal", null)
    .not("cnpj", "is", null)
    .limit(limit);

  if (error || !prospects) {
    result.errors.push(`Query error: ${error?.message}`);
    return result;
  }

  result.total = prospects.length;

  for (const prospect of prospects) {
    try {
      const enrichResult = await enrichProspect(prospect.id);
      if (enrichResult.success) {
        result.enriched++;
      } else {
        result.failed++;
        result.errors.push(`prospect ${prospect.id}: ${enrichResult.error}`);
      }
    } catch (err) {
      result.failed++;
      result.errors.push(`prospect ${prospect.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Log resultado
  await supabase.from("system_events").insert({
    tipo: "batch_enrich_prospects",
    severidade: result.failed > result.enriched ? "warning" : "info",
    mensagem: `Batch enrich prospects: ${result.enriched}/${result.total} OK, ${result.failed} falhas`,
    metadata: result,
  });

  return result;
}

/**
 * Enriquece em batch todas as companies que ainda não foram enriquecidas.
 * Critério: campo `enriched_at` é NULL.
 */
export async function batchEnrichCompanies(
  limit: number = 100
): Promise<BatchEnrichmentResult> {
  const supabase = createSupabaseAdmin();
  const result: BatchEnrichmentResult = {
    total: 0, enriched: 0, skipped: 0, failed: 0, errors: [],
  };

  const { data: companies, error } = await supabase
    .from("companies")
    .select("id, cnpj")
    .is("enriched_at", null)
    .limit(limit);

  if (error || !companies) {
    result.errors.push(`Query error: ${error?.message}`);
    return result;
  }

  result.total = companies.length;

  for (const company of companies) {
    try {
      const enrichResult = await enrichCompany(company.id);
      if (enrichResult.success) {
        result.enriched++;
      } else {
        result.failed++;
        result.errors.push(`company ${company.id}: ${enrichResult.error}`);
      }
    } catch (err) {
      result.failed++;
      result.errors.push(`company ${company.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Log resultado
  await supabase.from("system_events").insert({
    tipo: "batch_enrich_companies",
    severidade: result.failed > result.enriched ? "warning" : "info",
    mensagem: `Batch enrich companies: ${result.enriched}/${result.total} OK, ${result.failed} falhas`,
    metadata: result,
  });

  return result;
}

/**
 * Enriquece TUDO: prospects + companies em uma única chamada.
 */
export async function batchEnrichAll(): Promise<{
  prospects: BatchEnrichmentResult;
  companies: BatchEnrichmentResult;
}> {
  const prospects = await batchEnrichProspects();
  const companies = await batchEnrichCompanies();
  return { prospects, companies };
}
