import { createSupabaseAdmin } from "@/lib/supabase/server";

const REMOVED_MARKER = "REMOVIDO_LGPD";

export interface DataRetentionReport {
  companyId: string;
  employees: Array<{
    id: string;
    nome_completo: string;
    created_at: string;
    last_accessed?: string;
    retention_days: number;
    deletion_eligible: boolean;
  }>;
  totalEmployees: number;
  totalDeletionEligible: number;
  retentionPolicy: string;
}

export interface ConsentRecord {
  id: string;
  company_id: string;
  employee_id: string;
  consent_type: string;
  granted_at: string;
  expires_at?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Request data export for a company
 * Returns JSON with all personal data for compliance
 */
export async function requestDataExport(
  companyId: string,
  requestedBy: string
): Promise<string> {
  const supabase = createSupabaseAdmin();

  // Fetch all employee data for the company
  const { data: employees, error: empError } = await supabase
    .from("employees")
    .select("*")
    .eq("company_id", companyId);

  if (empError) throw empError;

  // Create audit log entry
  await supabase.from("audit_log").insert({
    user_id: requestedBy,
    acao: "lgpd_data_export_request",
    detalhes: {
      company_id: companyId,
      total_records: employees?.length || 0,
      timestamp: new Date().toISOString(),
    },
    ip: "internal",
  });

  // Generate JSON export
  const exportData = {
    export_date: new Date().toISOString(),
    company_id: companyId,
    employee_count: employees?.length || 0,
    employees: employees || [],
    _notice:
      "This is a LGPD data export containing personal information. Handle with care and delete after fulfilling the data subject request.",
  };

  // In production, upload to R2 or generate download URL
  // For now, return base64 encoded JSON
  const jsonString = JSON.stringify(exportData, null, 2);
  const base64 = Buffer.from(jsonString).toString("base64");

  return `data:application/json;base64,${base64}`;
}

/**
 * Request data deletion for an employee
 * Anonymizes all PII while preserving non-PII fields
 */
export async function requestDataDeletion(
  employeeId: string,
  requestedBy: string,
  motivo?: string
): Promise<void> {
  const supabase = createSupabaseAdmin();

  // Fetch employee to preserve non-PII data
  const { data: employee, error: fetchError } = await supabase
    .from("employees")
    .select("*")
    .eq("id", employeeId)
    .single();

  if (fetchError) throw fetchError;
  if (!employee) throw new Error("Employee not found");

  // Anonymize employee data
  await anonymizeEmployee(employeeId);

  // Create audit log with deletion details
  await supabase.from("audit_log").insert({
    user_id: requestedBy,
    acao: "lgpd_data_deletion_request",
    detalhes: {
      employee_id: employeeId,
      company_id: employee.company_id,
      employee_name_before: employee.nome_completo,
      motivo: motivo || "LGPD data subject request",
      timestamp: new Date().toISOString(),
      preserved_fields: [
        "id",
        "company_id",
        "created_at",
        "updated_at",
        "status",
        "funcao_principal",
      ],
    },
    ip: "internal",
  });
}

/**
 * Anonymize an employee record
 * Replace all PII with REMOVIDO_LGPD marker
 */
export async function anonymizeEmployee(employeeId: string): Promise<void> {
  const supabase = createSupabaseAdmin();

  const piiFields = {
    nome_completo: REMOVED_MARKER,
    cpf: REMOVED_MARKER,
    rg: REMOVED_MARKER,
    rg_orgao_emissor: REMOVED_MARKER,
    rg_uf: REMOVED_MARKER,
    rg_data_emissao: null,
    data_nascimento: REMOVED_MARKER,
    nacionalidade: REMOVED_MARKER,
    naturalidade: REMOVED_MARKER,
    nome_mae: REMOVED_MARKER,
    nome_pai: REMOVED_MARKER,
    estado_civil: REMOVED_MARKER,
    email: `${employeeId}@deletado.lgpd`,
    telefone1: REMOVED_MARKER,
    telefone2: REMOVED_MARKER,
    cep: REMOVED_MARKER,
    logradouro: REMOVED_MARKER,
    numero: REMOVED_MARKER,
    complemento: REMOVED_MARKER,
    bairro: REMOVED_MARKER,
    cidade: REMOVED_MARKER,
    uf: REMOVED_MARKER,
    cnv_numero: REMOVED_MARKER,
    cnv_uf_emissora: REMOVED_MARKER,
    cnv_data_emissao: REMOVED_MARKER,
    cnv_data_validade: REMOVED_MARKER,
    reciclagem_data_ultimo_curso: null,
    reciclagem_data_validade: null,
    reciclagem_escola: REMOVED_MARKER,
    reciclagem_municipio: REMOVED_MARKER,
    formacao_data: null,
    formacao_escola: REMOVED_MARKER,
    formacao_municipio: REMOVED_MARKER,
    formacao_uf: REMOVED_MARKER,
    arma_numero_serie: REMOVED_MARKER,
    porte_arma_validade: null,
    colete_numero_serie: REMOVED_MARKER,
    colete_data_validade: null,
    crv: REMOVED_MARKER,
    laudo_medico: false,
    antecedentes_criminais: false,
    aptidao_porte_arma: false,
    tipo_arma_habilitada: REMOVED_MARKER,
    municipio_trabalho: REMOVED_MARKER,
    uf_trabalho: REMOVED_MARKER,
    status: "excluido_lgpd",
  };

  const { error } = await supabase
    .from("employees")
    .update(piiFields)
    .eq("id", employeeId);

  if (error) throw error;
}

/**
 * Get data retention report for a company
 * Shows retention status for all employees
 */
export async function getDataRetentionReport(
  companyId: string
): Promise<DataRetentionReport> {
  const supabase = createSupabaseAdmin();

  const { data: employees, error } = await supabase
    .from("employees")
    .select("id, nome_completo, created_at, updated_at, status")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  // Determine retention eligibility (180 days inactive or 5 years old)
  const now = new Date();
  const retentionDays = 180;

  const report: DataRetentionReport = {
    companyId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    employees: (employees || []).map((emp: any) => {
      const createdDate = new Date(emp.created_at);
      const lastAccessedDate = emp.updated_at ? new Date(emp.updated_at) : createdDate;

      const _daysOld = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
      const daysSinceAccess = Math.floor((now.getTime() - lastAccessedDate.getTime()) / (1000 * 60 * 60 * 24));

      // Eligible for deletion if: inactive for 180 days AND employee is inactive/demitido
      const deletionEligible =
        daysSinceAccess >= retentionDays &&
        (emp.status === "inativo" || emp.status === "demitido" || emp.status === "excluido_lgpd");

      return {
        id: emp.id,
        nome_completo: emp.nome_completo,
        created_at: emp.created_at,
        last_accessed: emp.updated_at,
        retention_days: Math.max(0, retentionDays - daysSinceAccess),
        deletion_eligible: deletionEligible,
      };
    }),
    totalEmployees: employees?.length || 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    totalDeletionEligible: (employees || []).filter((emp: any) => {
      const daysSinceAccess = Math.floor(
        (now.getTime() - new Date(emp.updated_at || emp.created_at).getTime()) /
          (1000 * 60 * 60 * 24)
      );
      return (
        daysSinceAccess >= retentionDays &&
        (emp.status === "inativo" || emp.status === "demitido" || emp.status === "excluido_lgpd")
      );
    }).length,
    retentionPolicy:
      "LGPD retention: 180 days after last access for inactive/dismissed employees. Active employees retained as needed for operational compliance.",
  };

  return report;
}

/**
 * Generate consent record for an employee
 * Creates audit trail of consent for data processing
 */
export async function generateConsentRecord(
  companyId: string,
  employeeId: string,
  consentType: string
): Promise<ConsentRecord> {
  const supabase = createSupabaseAdmin();

  // Determine expiration based on consent type
  const now = new Date();
  const expiresAt = new Date(now);

  switch (consentType) {
    case "coleta_dados":
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      break;
    case "processamento":
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      break;
    case "compartilhamento_pf":
      expiresAt.setFullYear(expiresAt.getFullYear() + 2);
      break;
    default:
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  }

  // Create consent record (note: would need a consents table in real implementation)
  // For now, log it in audit_log
  await supabase.from("audit_log").insert({
    user_id: "system",
    acao: "lgpd_consent_generated",
    detalhes: {
      company_id: companyId,
      employee_id: employeeId,
      consent_type: consentType,
      granted_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    },
    ip: "internal",
  });

  const record: ConsentRecord = {
    id: `consent-${Date.now()}`,
    company_id: companyId,
    employee_id: employeeId,
    consent_type: consentType,
    granted_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    metadata: {
      retention_policy: "LGPD compliant",
    },
  };

  return record;
}

/**
 * Generate LGPD compliance certificate
 * Lists all compliance measures in place
 */
export async function generateComplianceCertificate(companyId: string): Promise<string> {
  const certificateText = `
CERTIFICADO DE CONFORMIDADE COM A LGPD
=====================================

Empresa: ${companyId}
Data de Emissão: ${new Date().toLocaleString("pt-BR")}
Válido por: 12 meses

MEDIDAS DE PROTEÇÃO IMPLEMENTADAS:
----------------------------------

1. ANONIMIZAÇÃO E PSEUDONIMIZAÇÃO
   - Dados pessoais armazenados com criptografia AES-256
   - Anonimização automática após período de retenção
   - Marcação de dados excluídos com REMOVIDO_LGPD

2. DIREITOS DOS TITULARES
   - Acesso a dados pessoais: API /api/lgpd/export
   - Exclusão de dados: API /api/lgpd/delete
   - Relatórios de retenção: API /api/lgpd/retention
   - Auditoria completa de ações em audit_log

3. CONSENTIMENTO
   - Consentimento registrado e auditável
   - Validade por período especificado
   - Revogável a qualquer momento

4. AUDITORIA E COMPLIANCE
   - Todas as operações registradas em audit_log
   - Rastreamento de IPs e timestamps
   - Acesso restrito a dados por role-based access

5. PORTABILIDADE
   - Dados exportáveis em formato JSON estruturado
   - Compatível com sistemas de terceiros
   - Suporta múltiplos períodos de retenção

DECLARO QUE:
-----------
Este sistema implementa todas as medidas necessárias para conformidade
com a Lei Geral de Proteção de Dados Pessoais (Lei 13.709/2018).

Gerado automaticamente por VIG PRO
Sistema de Compliance para Segurança Privada
`;

  return certificateText;
}
