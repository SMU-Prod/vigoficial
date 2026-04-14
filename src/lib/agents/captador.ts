/**
 * VIGI — Agente Captador
 * PRD Seção 3.1 (DOU) + 3.3 (Email Parser)
 *
 * Responsabilidades:
 * - Ler e parsear DOU Seção 1 diariamente
 * - Classificar emails recebidos (Haiku)
 * - Extrair dados estruturados (Sonnet)
 * - Vincular publicações a empresas/prospects
 * - Gerar alertas DOU
 * - Rastrear tokens e decisões para Langfuse
 */

import { getAnthropicClient, AI_MODELS, AI_THRESHOLDS } from "@/lib/ai/client";
import {
  CLASSIFIER_SYSTEM_PROMPT,
  EXTRACTOR_SYSTEM_PROMPT,
  DOU_PARSER_SYSTEM_PROMPT,
} from "@/lib/ai/prompts";
import {
  startAgentRun,
  completeAgentRun,
  logAgentDecision,
  TokenTracker,
} from "@/lib/agents/base";
import { CaptadorState, ClassificationResult } from "@/lib/agents/types";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { uploadToR2 } from "@/lib/r2/client";
import { DOU_BASE_URL } from "@/lib/config/constants";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface DOUDocument {
  date: string;
  section: string;
  title: string;
  content: string;
  url: string;
}

interface DOUParseResult {
  documents: DOUDocument[];
  rawHtml: string;
  processedAt: string;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens: number;
    cacheReadInputTokens: number;
  };
}

interface SecurityKeywordMatch {
  document: DOUDocument;
  matchedKeywords: string[];
  relevanceScore: number;
}

interface EmailClassification {
  tipo_demanda: string; // "reclamacao", "denuncia", "solicitud_info", "caso_desconhecido"
  confidence: number;
  reasoning: string;
  requiresExtraction: boolean;
}

interface ExtractedData {
  company_name?: string;
  cnpj?: string;
  employee_names?: string[];
  employee_cpfs?: string[];
  regulation?: string;
  violation_type?: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// DOU PROCESSING
// ============================================================================

/**
 * Fetch and parse DOU publication for a given date
 * Returns parsed documents, raw HTML, and token tracking
 */
export async function runCaptadorDOU(date?: string): Promise<CaptadorState> {
  const targetDate = date || new Date().toISOString().split("T")[0];
  const _client = getAnthropicClient();
  const supabase = createSupabaseAdmin();
  const tokenTracker = new TokenTracker("captador_dou");

  let runId: string | null = null;
  const state: CaptadorState = {
    agentName: "captador",
    runId: "",
    triggerType: "cron",
    triggerSource: "dou_parsing",
    startedAt: new Date().toISOString(),
    steps: [],
    runType: "dou_parsing",
    date: targetDate,
    status: "pending",
    documentsProcessed: 0,
    matchesFound: 0,
    alertsGenerated: 0,
    errors: [],
    totalTokens: 0,
    totalCostUsd: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    tokenUsage: tokenTracker as unknown as Record<string, unknown>,
  };

  try {
    // 1. Start run in agent_runs
    const startResult = await startAgentRun({
      agent_name: "captador",
      run_type: "cron",
      input_data: { date: targetDate },
    }) as { runId: string };

    if (!startResult.runId) {
      throw new Error("Failed to start agent run");
    }

    runId = startResult.runId;
    state.runId = runId;

    // 2. Fetch DOU HTML for date
    const douUrl = `${DOU_BASE_URL}/${targetDate}`;

    const response = await fetch(douUrl, {
      headers: {
        "User-Agent":
          "VIG-PRO/1.0 (compliance automation for Brazilian security companies)",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch DOU: ${response.statusText}`);
    }

    const rawHtml = await response.text();

    // 3. Extract security sections using DOU parser with prompt caching
    const parseResult = await parseDouWithAI(rawHtml, tokenTracker);
    state.documentsProcessed = parseResult.documents.length;

    // 4. Filter documents by security keywords and relevance
    const securityMatches = filterSecurityDocuments(parseResult.documents);

    // 5. For each security-relevant document, extract structured data
    const extractedRecords: Record<string, unknown>[] = [];

    for (const match of securityMatches) {
      try {
        const decision = await logAgentDecision({
          agent_name: "captador",
          agent_run_id: runId,
          decision_type: "dou_extraction",
          input_data: {
            document_title: match.document.title,
            matched_keywords: match.matchedKeywords,
            relevance_score: match.relevanceScore,
          },
          output_data: undefined,
          model_used: AI_MODELS.SONNET,
          confidence: match.relevanceScore,
          reasoning: `Matched security keywords: ${match.matchedKeywords.join(", ")}`,
        });

        const extracted = await extractDouData(
          match.document.content,
          tokenTracker
        );

        extractedRecords.push({
          document_id: `dou_${targetDate}_${match.document.title.replace(/\s+/g, "_")}`,
          date: targetDate,
          section: match.document.section,
          title: match.document.title,
          url: match.document.url,
          extracted_data: extracted,
          relevance_score: match.relevanceScore,
          decision_id: decision.decisionId,
        });

        // 6. Update companies/employees affected
        if (extracted.cnpj) {
          await linkDouToCompany(
            extracted.cnpj,
            extracted.company_name || "",
            match.document,
            supabase
          );
          (state.matchesFound as number)++;
        }

        if (extracted.employee_cpfs && extracted.employee_cpfs.length > 0) {
          await linkDouToEmployees(
            extracted.employee_cpfs,
            extracted.employee_names || [],
            match.document,
            supabase
          );
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[Captador DOU] Error processing document:`, errorMsg);
        state.errors.push(`[document_processing] ${errorMsg}`);
      }
    }

    // 7. Save raw HTML and parsed JSON to R2
    const r2Path = `dou/${targetDate}/`;
    await uploadToR2(
      `${r2Path}raw.html`,
      rawHtml,
      "text/html"
    );

    await uploadToR2(
      `${r2Path}parsed.json`,
      JSON.stringify(extractedRecords, null, 2),
      "application/json"
    );

    // 8. Generate dou_alertas for matched companies
    state.alertsGenerated = await generateDouAlertas(
      extractedRecords,
      supabase
    );

    // 9. Save parsing result to database
    await supabase.from("dou_parsing_results").insert({
      date: targetDate,
      documents_found: state.documentsProcessed,
      security_matches: state.matchesFound,
      raw_html_r2_path: `${r2Path}raw.html`,
      parsed_json_r2_path: `${r2Path}parsed.json`,
      token_usage: {
        inputTokens: tokenTracker.totalInputTokens,
        outputTokens: tokenTracker.totalOutputTokens,
        cacheCreationInputTokens: tokenTracker.cacheCreationTokens,
        cacheReadInputTokens: tokenTracker.cacheReadTokens,
      },
      processed_at: new Date().toISOString(),
    });

    state.status = "completed" as const;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[Captador DOU] Fatal error:", errorMsg);
    state.status = "failed" as const;
    state.errors.push(`[fatal] ${errorMsg}`);
  } finally {
    // 10. Complete run in agent_runs
    if (runId) {
      await completeAgentRun({
        runId,
        status: (state.status || "failed") as "completed" | "failed",
        output_data: {
          documentsProcessed: state.documentsProcessed,
          matchesFound: state.matchesFound,
          alertsGenerated: state.alertsGenerated,
        },
      });
    }
  }

  return state;
}

/**
 * Parse DOU HTML using Claude Sonnet with prompt caching
 * Extracts document sections and metadata
 */
async function parseDouWithAI(
  htmlContent: string,
  tokenTracker: TokenTracker
): Promise<DOUParseResult> {
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: AI_MODELS.SONNET,
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: DOU_PARSER_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Extract all security-related documents from this DOU HTML. Focus on Seção 1 (Official Notices) and identify documents related to private security companies, alvarás (licenses), CNVs (notifications), and regulatory changes.\n\nHTML Content:\n${htmlContent.substring(0, 10000)}`,
          },
        ],
      },
    ],
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tokenTracker.recordUsage(response.usage as any);

  let documents: DOUDocument[] = [];
  try {
    const content = response.content[0];
    if (content.type === "text") {
      // Parse JSON response from Claude
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        documents = parsed.documents || [];
      }
    }
  } catch (_err) {
    console.warn("[Captador DOU] Failed to parse Claude response as JSON");
  }

  return {
    documents,
    rawHtml: htmlContent,
    processedAt: new Date().toISOString(),
    tokenUsage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheCreationInputTokens: response.usage.cache_creation_input_tokens || 0,
      cacheReadInputTokens: response.usage.cache_read_input_tokens || 0,
    },
  };
}

/**
 * Filter DOU documents for security-relevant keywords
 * Returns scored matches ordered by relevance
 */
function filterSecurityDocuments(documents: DOUDocument[]): SecurityKeywordMatch[] {
  const securityKeywords = [
    "vigilância",
    "segurança",
    "alvará",
    "CNV",
    "empresa de segurança",
    "guarda",
    "proteção",
    "portaria",
    "regulamentação",
    "armamento",
    "licença",
    "autorização",
    "cassação",
    "suspensão",
    "multa",
    "infração",
  ];

  const matches: SecurityKeywordMatch[] = [];

  for (const doc of documents) {
    const content = `${doc.title} ${doc.content}`.toLowerCase();
    const matchedKeywords = securityKeywords.filter((keyword) =>
      content.includes(keyword.toLowerCase())
    );

    if (matchedKeywords.length > 0) {
      // Calculate relevance score (0-1) based on keyword count and position
      const relevanceScore = Math.min(
        1,
        matchedKeywords.length / securityKeywords.length * 0.5 + 0.5
      );

      matches.push({
        document: doc,
        matchedKeywords,
        relevanceScore,
      });
    }
  }

  // Sort by relevance descending
  return matches.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

/**
 * Extract structured data from a DOU document using Claude Sonnet
 * with prompt caching
 */
async function extractDouData(
  content: string,
  tokenTracker: TokenTracker
): Promise<ExtractedData> {
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: AI_MODELS.SONNET,
    max_tokens: 2048,
    system: [
      {
        type: "text",
        text: EXTRACTOR_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Extract structured data from this DOU document:\n\n${content.substring(0, 5000)}`,
          },
        ],
      },
    ],
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tokenTracker.recordUsage(response.usage as any);

  let extracted: ExtractedData = {};
  try {
    const responseText =
      response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      extracted = JSON.parse(jsonMatch[0]);
    }
  } catch (_err) {
    console.warn("[Captador DOU] Failed to parse extraction response");
  }

  return extracted;
}

/**
 * Link DOU publication to a company record
 * Creates/updates company_dou_links
 */
async function linkDouToCompany(
  cnpj: string,
  companyName: string,
  document: DOUDocument,
  supabase: ReturnType<typeof createSupabaseAdmin>
): Promise<void> {
  // First, find or create company record
  let { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("cnpj", cnpj)
    .single();

  if (!company) {
    const { data: newCompany } = await supabase
      .from("companies")
      .insert({
        cnpj,
        name: companyName,
        source: "dou_parser",
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (!newCompany) return;
    company = newCompany;
  }

  // Create DOU link
  await supabase.from("company_dou_links").insert({
    company_id: company!.id,
    dou_date: document.date,
    dou_section: document.section,
    dou_title: document.title,
    dou_url: document.url,
    created_at: new Date().toISOString(),
  });
}

/**
 * Link DOU publication to employee records
 */
async function linkDouToEmployees(
  cpfs: string[],
  names: string[],
  document: DOUDocument,
  supabase: ReturnType<typeof createSupabaseAdmin>
): Promise<void> {
  for (let i = 0; i < cpfs.length; i++) {
    const cpf = cpfs[i];
    const name = names[i] || `Employee ${i + 1}`;

    // Find or create employee record
    let { data: employee } = await supabase
      .from("employees")
      .select("id")
      .eq("cpf", cpf)
      .single();

    if (!employee) {
      const { data: newEmployee } = await supabase
        .from("employees")
        .insert({
          cpf,
          name,
          source: "dou_parser",
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (!newEmployee) continue;
      employee = newEmployee;
    }

    // Create employee DOU link
    await supabase.from("employee_dou_links").insert({
      employee_id: employee!.id,
      dou_date: document.date,
      dou_section: document.section,
      dou_title: document.title,
      dou_url: document.url,
      created_at: new Date().toISOString(),
    });
  }
}

/**
 * Generate DOU alerts for affected companies
 * Returns count of alerts created
 */
async function generateDouAlertas(
  records: Record<string, unknown>[],
  supabase: ReturnType<typeof createSupabaseAdmin>
): Promise<number> {
  let alertCount = 0;

  for (const record of records) {
    const extracted = (record as Record<string, unknown>)
      .extracted_data as ExtractedData;
    if (!extracted || !extracted.cnpj) continue;

    // Find company
    const { data: company } = await supabase
      .from("companies")
      .select("id")
      .eq("cnpj", extracted.cnpj)
      .single();

    if (!company) continue;

    // Create alert
    const { data: alert } = await supabase
      .from("dou_alertas")
      .insert({
        company_id: company.id,
        alert_type: extracted.violation_type || "regulatory_change",
        dou_date: (record as Record<string, unknown>).date,
        dou_title: (record as Record<string, unknown>).title,
        dou_url: (record as Record<string, unknown>).url,
        extracted_details: extracted,
        severity: "medium",
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (alert) alertCount++;
  }

  return alertCount;
}

// ============================================================================
// EMAIL PROCESSING
// ============================================================================

/**
 * Process incoming email for classification and extraction
 * PRD Rule R7: confidence threshold 0.70
 */
export async function runCaptadorEmail(
  companyId: string,
  emailId: string,
  subject: string,
  bodyText: string,
  fromEmail: string
): Promise<CaptadorState> {
  const _client = getAnthropicClient();
  const supabase = createSupabaseAdmin();
  const tokenTracker = new TokenTracker("captador_email");

  let runId: string | null = null;
  const state: CaptadorState = {
    agentName: "captador",
    runId: "",
    triggerType: "webhook",
    triggerSource: "email_classification",
    startedAt: new Date().toISOString(),
    steps: [],
    runType: "email_classification",
    status: "pending",
    emailId,
    companyId,
    documentsProcessed: 0,
    matchesFound: 0,
    alertsGenerated: 0,
    errors: [],
    totalTokens: 0,
    totalCostUsd: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    tokenUsage: tokenTracker as unknown as Record<string, unknown>,
  };

  try {
    // GAP-05 FIX: Idempotency check — skip if this email was already processed.
    // Prevents duplicate classification when webhook fires multiple times for same email.
    const { data: alreadyProcessed } = await supabase
      .from("email_inbound")
      .select("id, status")
      .eq("id", emailId)
      .in("status", ["processado", "classificado", "ignorado"])
      .maybeSingle();

    if (alreadyProcessed) {
      state.status = "completed";
      state.runId = "dedup-skip";
      return state; // Return early — no processing, no agent run record
    }

    // 1. Start run in agent_runs
    const startResult = await startAgentRun({
      agent_name: "captador",
      run_type: "webhook",
      input_data: {
        email_id: emailId,
        company_id: companyId,
        subject,
        from_email: fromEmail,
      },
    }) as { runId: string };

    if (!startResult.runId) {
      throw new Error("Failed to start agent run");
    }

    runId = startResult.runId;
    state.runId = runId;

    // 2. Classify email using Haiku with prompt caching
    const classification = await classifyEmail(
      subject,
      bodyText,
      fromEmail,
      tokenTracker
    );

    // Log classification decision
    await logAgentDecision({
      agent_name: "captador",
      agent_run_id: runId,
      decision_type: "email_classification",
      input_data: {
        subject,
        from_email: fromEmail,
        body_length: bodyText.length,
      },
      output_data: classification as unknown as Record<string, unknown>,
      model_used: AI_MODELS.HAIKU,
      confidence: classification.confidence,
      reasoning: classification.reasoning,
    });

    state.documentsProcessed = 1;

    // 3. If confidence >= 0.70 and not "caso_desconhecido", extract data using Sonnet
    let extractedData: ExtractedData | null = null;

    if (
      classification.confidence >= AI_THRESHOLDS.CONFIDENCE_THRESHOLD &&
      classification.tipo_demanda !== "caso_desconhecido"
    ) {
      extractedData = await extractEmailData(bodyText, tokenTracker);

      // Log extraction decision
      await logAgentDecision({
        agent_name: "captador",
        agent_run_id: runId,
        decision_type: "email_extraction",
        input_data: {
          classification_type: classification.tipo_demanda,
        },
        output_data: extractedData as unknown as Record<string, unknown>,
        model_used: AI_MODELS.SONNET,
        confidence: 0.85, // Extraction doesn't have explicit confidence
        reasoning: `Extracted data from ${classification.tipo_demanda} email`,
      });

      state.matchesFound = extractedData.cnpj ? 1 : 0;
    } else if (classification.confidence < AI_THRESHOLDS.CONFIDENCE_THRESHOLD) {
      // Low confidence → mark as "caso_desconhecido"
      classification.tipo_demanda = "caso_desconhecido";
      classification.requiresExtraction = false;
    }

    // 4. Create workflow in email_workflows
    const { data: workflow } = await supabase
      .from("email_workflows")
      .insert({
        company_id: companyId,
        email_id: emailId,
        classification_type: classification.tipo_demanda,
        classification_confidence: classification.confidence,
        extracted_data: extractedData,
        status: classification.requiresExtraction
          ? "pending_analysis"
          : "completed",
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (!workflow) {
      throw new Error("Failed to create workflow record");
    }

    // 5. If extracted data contains CNPJ, link to company/prospect
    if (extractedData?.cnpj) {
      await linkEmailToCompany(extractedData.cnpj, companyId, supabase);
      state.matchesFound = 1;
    }

    state.status = "completed" as const;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[Captador Email] Fatal error:", errorMsg);
    state.status = "failed" as const;
    state.errors.push(`[fatal] ${errorMsg}`);
  } finally {
    // 6. Complete run in agent_runs
    if (runId) {
      await completeAgentRun({
        runId,
        status: (state.status || "failed") as "completed" | "failed",
        output_data: {
          documentsProcessed: state.documentsProcessed,
          matchesFound: state.matchesFound,
        },
      });
    }
  }

  return state;
}

/**
 * Classify email using Claude Haiku with prompt caching
 * PRD Rule R7: confidence threshold 0.70
 */
async function classifyEmail(
  subject: string,
  bodyText: string,
  fromEmail: string,
  tokenTracker: TokenTracker
): Promise<EmailClassification> {
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: AI_MODELS.HAIKU,
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: CLASSIFIER_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Classify this email:\n\nFrom: ${fromEmail}\nSubject: ${subject}\n\nBody:\n${bodyText.substring(0, 3000)}`,
          },
        ],
      },
    ],
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tokenTracker.recordUsage(response.usage as any);

  const classification: EmailClassification = {
    tipo_demanda: "caso_desconhecido",
    confidence: 0,
    reasoning: "Failed to parse classification",
    requiresExtraction: false,
  };

  try {
    const responseText =
      response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      classification.tipo_demanda = parsed.tipo_demanda || classification.tipo_demanda;
      classification.confidence = parseFloat(parsed.confidence) || 0;
      classification.reasoning = parsed.reasoning || "";
      classification.requiresExtraction =
        classification.confidence >= AI_THRESHOLDS.CONFIDENCE_THRESHOLD;
    }
  } catch (_err) {
    console.warn("[Captador Email] Failed to parse classification response");
  }

  return classification;
}

/**
 * Extract structured data from email body using Claude Sonnet
 * with prompt caching
 */
async function extractEmailData(
  bodyText: string,
  tokenTracker: TokenTracker
): Promise<ExtractedData> {
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: AI_MODELS.SONNET,
    max_tokens: 2048,
    system: [
      {
        type: "text",
        text: EXTRACTOR_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Extract structured data from this email:\n\n${bodyText.substring(0, 5000)}`,
          },
        ],
      },
    ],
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tokenTracker.recordUsage(response.usage as any);

  let extracted: ExtractedData = {};

  try {
    const responseText =
      response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      extracted = JSON.parse(jsonMatch[0]);
    }
  } catch (_err) {
    console.warn("[Captador Email] Failed to parse extraction response");
  }

  return extracted;
}

/**
 * Link email-extracted CNPJ to company record
 */
async function linkEmailToCompany(
  cnpj: string,
  reportingCompanyId: string,
  supabase: ReturnType<typeof createSupabaseAdmin>
): Promise<void> {
  // Find or create prospect company
  let { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("cnpj", cnpj)
    .single();

  if (!company) {
    const { data: newCompany } = await supabase
      .from("companies")
      .insert({
        cnpj,
        source: "email_extraction",
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (!newCompany) return;
    company = newCompany;
  }

  // Create linkage
  await supabase.from("company_email_reports").insert({
    reporting_company_id: reportingCompanyId,
    mentioned_company_id: company!.id,
    created_at: new Date().toISOString(),
  });
}

export type { ClassificationResult };
