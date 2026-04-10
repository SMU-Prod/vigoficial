import { z } from "zod";
import { isValidCpf, isValidCnpj } from "@/lib/utils";
import { NextRequest } from "next/server";

// ============================================================================
// GESP/XSD Constants
// ============================================================================

const GESP_MARCAS = [
  "AGRALE", "ALFA-ROMEU", "ASIA", "AUDI", "BMW", "CHRYSLER", "CITROEN",
  "DAEWOO", "DODGE", "FIAT", "FORD", "GENERAL MOTORS", "HONDA", "HYUNDAY",
  "ISUZU", "ITRAXX", "IVECO", "KIA", "LADA", "LAND ROVER", "MAZDA",
  "MERCEDES BENZ", "MITSUBISHI", "MONTEX", "NISSAN", "PEUGEOT", "RENAULT",
  "SAAB-SCANIA", "SUNDOWN", "SUZUKI", "TOYOTA", "TROLLER", "VOLKSWAGEN",
  "VOLVO", "WILLYS OVERLAND", "YAMAHA",
] as const;

const GESP_ESTADOS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS",
  "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC",
  "SE", "SP", "TO",
] as const;

// ============================================================================
// Authentication Schemas
// ============================================================================

export const loginSchema = z.object({
  email: z
    .string()
    .email("Email inválido")
    .transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1, "Senha obrigatória"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  senhaAtual: z.string().min(1, "Senha atual obrigatória"),
  novaSenha: z
    .string()
    .min(12, "Mínimo 12 caracteres")
    .regex(/[A-Z]/, "Deve conter letra maiúscula")
    .regex(/[0-9]/, "Deve conter número")
    .regex(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, "Deve conter caractere especial"),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// ============================================================================
// User Schemas
// ============================================================================

export const createUserSchema = z.object({
  email: z
    .string()
    .email("Email inválido")
    .transform((v) => v.toLowerCase().trim()),
  nome: z.string().min(2, "Nome obrigatório"),
  password: z
    .string()
    .min(12, "Mínimo 12 caracteres")
    .regex(/[A-Z]/, "Deve conter letra maiúscula")
    .regex(/[0-9]/, "Deve conter número")
    .regex(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, "Deve conter caractere especial"),
  role: z.enum(["admin", "operador", "viewer"]).default("viewer"),
  company_ids: z.array(z.string().uuid()).default([]),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

// ============================================================================
// Company Schemas
// ============================================================================

export const companySchema = z.object({
  cnpj: z
    .string()
    .refine(isValidCnpj, "CNPJ inválido")
    .transform((v) => v.replace(/\D/g, "")),
  razao_social: z.string().min(3, "Razão social obrigatória"),
  nome_fantasia: z.string().optional(),
  email_operacional: z
    .string()
    .email("Email operacional inválido")
    .transform((v) => v.toLowerCase().trim()),
  email_responsavel: z
    .string()
    .email("Email responsável inválido")
    .transform((v) => v.toLowerCase().trim()),
  telefone: z.string().optional(),
  uf_sede: z.string().length(2, "UF deve ter 2 caracteres"),
  plano: z.enum(["starter", "professional", "enterprise", "custom"]).default("starter"),
  valor_mensal: z.number().positive().default(497),
  alvara_numero: z.string().optional(),
  alvara_validade: z.string().optional(),
  // Filiais
  tipo_unidade: z.enum(["matriz", "filial"]).default("matriz"),
  matriz_id: z.string().uuid("ID da matriz inválido").nullable().optional(),
});

export type CompanyInput = z.infer<typeof companySchema>;

// ============================================================================
// Company Instructions Schema (VIGIPro)
// ============================================================================

export const companyInstructionSchema = z.object({
  company_id: z.string().uuid("ID da empresa inválido"),
  titulo: z.string().min(3, "Título obrigatório (min 3 caracteres)"),
  conteudo: z.string().min(10, "Conteúdo obrigatório (min 10 caracteres)"),
  categoria: z.enum(["geral", "gesp", "monitoramento", "financeiro", "comunicacao"]).default("geral"),
  ativo: z.boolean().default(true),
});

export type CompanyInstructionInput = z.infer<typeof companyInstructionSchema>;

// ============================================================================
// Employee Schemas
// ============================================================================

const FUNCOES_PF = [
  "Vigilante Patrimonial",
  "Vigilante Armado",
  "Vigilante Desarmado",
  "Vigilante de Transporte de Valores",
  "Vigilante de Escolta Armada",
  "Vigilante de Segurança Pessoal Privada",
  "Vigilante de Grandes Eventos",
] as const;

export const employeeSchema = z.object({
  company_id: z.string().uuid("ID da empresa inválido"),
  // Bloco 1: Identificação Civil
  nome_completo: z.string().min(5, "Nome completo obrigatório"),
  cpf: z
    .string()
    .refine(isValidCpf, "CPF inválido")
    .transform((v) => v.replace(/\D/g, "")),
  rg: z.string().min(1, "RG obrigatório"),
  rg_orgao_emissor: z.string().min(1, "Órgão emissor obrigatório"),
  rg_uf: z.string().length(2, "UF deve ter 2 caracteres"),
  rg_data_emissao: z.string().optional(),
  data_nascimento: z.string().min(1, "Data de nascimento obrigatória"),
  sexo: z.enum(["M", "F"], { message: "Sexo deve ser M ou F" }),
  nacionalidade: z.string().optional(),
  naturalidade: z.string().optional(),
  nome_mae: z.string().min(3, "Nome da mãe obrigatório (PF)"),
  nome_pai: z.string().optional(),
  estado_civil: z.string().optional(),
  // Bloco 2: Contato e Endereço
  email: z
    .string()
    .email("Email inválido")
    .transform((v) => v.toLowerCase().trim()),
  telefone1: z.string().min(8, "Telefone obrigatório"),
  telefone2: z.string().optional(),
  cep: z.string().optional(),
  logradouro: z.string().optional(),
  numero: z.string().optional(),
  complemento: z.string().optional(),
  bairro: z.string().optional(),
  cidade: z.string().optional(),
  uf: z.string().length(2).optional(),
  // Bloco 3: Situação Funcional
  status: z
    .enum(["ativo", "inativo", "afastado", "demitido"])
    .default("ativo"),
  data_admissao: z.string().min(1, "Data de admissão obrigatória"),
  data_desligamento: z.string().optional(),
  tipo_vinculo: z.enum(["CLT", "Terceirizado"]).default("CLT"),
  funcao_principal: z.enum(FUNCOES_PF, {
    message: "Função principal inválida",
  }),
  posto_designado: z.string().uuid().optional().nullable(),
  // Bloco 4: CNV
  cnv_numero: z.string().min(1, "Número da CNV obrigatório"),
  cnv_uf_emissora: z.string().length(2, "UF deve ter 2 caracteres"),
  cnv_data_emissao: z.string().min(1, "Data de emissão da CNV obrigatória"),
  cnv_data_validade: z.string().min(1, "Data de validade da CNV obrigatória"),
  cnv_situacao: z
    .enum(["valida", "vencida", "suspensa", "cancelada"])
    .default("valida"),
  // Bloco 5: Reciclagem
  reciclagem_data_ultimo_curso: z.string().optional(),
  reciclagem_data_validade: z.string().optional(),
  reciclagem_escola: z.string().optional(),
  reciclagem_municipio: z.string().optional(),
  // Bloco 6: Formação Inicial
  formacao_data: z.string().optional(),
  formacao_escola: z.string().optional(),
  formacao_municipio: z.string().optional(),
  formacao_uf: z.string().optional(),
  // Bloco 7: Armamento e Colete
  arma_numero_serie: z.string().optional(),
  porte_arma_validade: z.string().optional(),
  colete_numero_serie: z.string().optional(),
  colete_data_validade: z.string().optional(),
  // Campos adicionais PF
  crv: z.string().optional(),
  tipo_arma_habilitada: z.string().optional(),
  municipio_trabalho: z.string().optional(),
  uf_trabalho: z.string().optional(),
  // Campos GESP/XSD Import
  pis: z.string().regex(/^(.{0}|[0-9]{11})$/, "PIS: 11 dígitos ou vazio").optional().nullable(),
  vinculo_empregaticio: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(9)]).optional().nullable(),
  situacao_pessoa: z.union([z.literal(5), z.literal(8)]).optional().nullable(),
  cargo_gesp: z.string().max(30, "Cargo GESP: máximo 30 caracteres").optional().nullable(),
});

export type EmployeeInput = z.infer<typeof employeeSchema>;

// ============================================================================
// Vehicle Schemas
// ============================================================================

export const vehicleSchema = z.object({
  company_id: z.string().uuid("ID da empresa inválido"),
  placa: z.string().min(7, "Placa obrigatória"),
  modelo: z.string().min(2, "Modelo obrigatório"),
  marca: z.string().optional(),
  ano: z.number().optional(),
  tipo: z
    .enum(["operacional", "escolta", "transporte_valores", "administrativo"])
    .default("operacional"),
  km_atual: z.number().default(0),
  gps_provider: z.string().optional(),
  gps_device_id: z.string().optional(),
  licenciamento_validade: z.string().optional(),
  seguro_validade: z.string().optional(),
  vistoria_pf_validade: z.string().optional(),
  // Campos GESP/XSD Import
  chassi: z.string().regex(/^[a-zA-Z0-9]{17}$/, "Chassi: 17 caracteres alfanuméricos").optional().nullable(),
  renavam: z.string().regex(/^[0-9]{1,12}$/, "RENAVAM: 1-12 dígitos numéricos").optional().nullable(),
  tipo_veiculo_gesp: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional().nullable(),
  situacao_veiculo_gesp: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional().nullable(),
  tipo_propriedade: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).optional().nullable(),
  marca_gesp: z.enum(GESP_MARCAS).optional().nullable(),
  numero_placa_mercosul: z.string().regex(/^[a-zA-Z]{3}[0-9]{1}[a-zA-Z]{1}[0-9]{2}$/, "Placa Mercosul: formato XXX9X99").optional().nullable(),
  uf_placa: z.enum(GESP_ESTADOS).optional().nullable(),
  cidade_placa: z.string().optional().nullable(),
  data_aquisicao: z.string().optional().nullable(),
  inicio_vigencia_contrato: z.string().optional().nullable(),
  fim_vigencia_contrato: z.string().optional().nullable(),
});

export type VehicleInput = z.infer<typeof vehicleSchema>;

// ============================================================================
// Workflow Schemas
// ============================================================================

export const workflowSchema = z.object({
  company_id: z.string().uuid(),
  email_inbound_id: z.string().uuid().optional().nullable(),
  tipo_demanda: z.string().min(1, "Tipo de demanda obrigatório"),
  prioridade: z.enum(["normal", "urgente"]).default("normal"),
  status: z
    .enum([
      "recebido",
      "classificado",
      "aguardando_aprovacao",
      "aprovado",
      "executando",
      "concluido",
      "erro",
      "caso_desconhecido",
    ])
    .default("recebido"),
  dados_extraidos: z.record(z.string(), z.unknown()).default({}),
});

export type WorkflowInput = z.infer<typeof workflowSchema>;

// ============================================================================
// Billing Schemas
// ============================================================================

export const billingSchema = z.object({
  company_id: z.string().uuid(),
  valor: z.number().positive("Valor deve ser positivo"),
  plano: z
    .enum(["starter", "professional", "enterprise", "custom"])
    .default("starter"),
  status: z
    .enum(["trial", "ativo", "inadimplente", "suspenso", "cancelado"])
    .default("ativo"),
});

export type BillingInput = z.infer<typeof billingSchema>;

// ============================================================================
// DELESP Schemas
// ============================================================================

export const delespSchema = z.object({
  uf: z.string().length(2, "UF deve ter 2 caracteres"),
  nome: z.string().min(1, "Nome obrigatório"),
  email: z
    .string()
    .email("Email inválido")
    .transform((v) => v.toLowerCase().trim()),
  telefone: z.string().min(8, "Telefone obrigatório"),
  status: z.enum(["ativo", "inativo"]).default("ativo"),
});

export type DelespInput = z.infer<typeof delespSchema>;

// ============================================================================
// Report Schemas
// ============================================================================

export const reportSchema = z.object({
  tipo: z
    .enum(["mensal", "compliance", "validades", "gesp", "frota", "billing"])
    .default("mensal"),
  mes: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Formato deve ser YYYY-MM")
    .default(() => new Date().toISOString().slice(0, 7)),
});

export type ReportInput = z.infer<typeof reportSchema>;

// ============================================================================
// GESP Task Schemas
// ============================================================================

const GESP_TASK_TIPOS = [
  "cadastrar_vigilante", "criar_processo_autorizativo", "enviar_processo",
  "verificar_pendencias", "adicionar_documento_processo", "criar_turma",
  "enviar_turma", "comunicar_inicio_turma", "comunicar_conclusao_turma",
  "comunicar_cancelamento_turma", "adicionar_aluno_turma", "definir_disciplinas_turma",
  "importar_pessoas_xml", "importar_veiculos_xml", "importar_alunos_xml",
  "criar_guia_transporte", "criar_guia_transporte_transferencia", "criar_guia_coletes_destruicao",
  "enviar_guia", "comunicacao_ocorrencia", "enviar_complementacao_ocorrencia",
  "comunicacao_evento", "credenciamento_instrutor", "renovar_credenciamento_instrutor",
  "solicitar_cnv", "imprimir_cnv", "responder_notificacao",
  "snapshot_empresa", "cadastrar_procurador",
  "consultar_processo_punitivo", "enviar_defesa_punitivo", "interpor_recurso_punitivo",
  "gerar_gru_multa", "declarar_pagamento_multa",
  "informar_aquisicao_municoes", "solicitar_aquisicao_coletes",
  "certificado_vistoria_veiculo", "alteracao_atos_constitutivos", "consultar_gru",
  "solicitar_recadastramento_bancario", "solicitar_plano_seguranca_nova_agencia",
  "solicitar_renovacao_plano_sem_alteracao", "solicitar_renovacao_plano_com_reducao",
  "solicitar_plano_emergencial", "solicitar_plano_mudanca_endereco",
  "editar_rascunho_bancario", "responder_notificacao_bancario",
  "interpor_recurso_bancario", "restituicao_multa",
] as const;

export const gespTaskSchema = z.object({
  company_id: z.string().uuid(),
  session_id: z.string().uuid().optional().nullable(),
  tipo_acao: z.enum(GESP_TASK_TIPOS, { message: "Tipo de ação GESP inválido" }),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export type GespTaskInput = z.infer<typeof gespTaskSchema>;

// ============================================================================
// Prospect / CRM Schemas
// ============================================================================

export const prospectSchema = z.object({
  cnpj: z
    .string()
    .refine(isValidCnpj, "CNPJ inválido")
    .transform((v) => v.replace(/\D/g, "")),
  razao_social: z.string().min(3, "Razão social obrigatória"),
  nome_fantasia: z.string().optional().nullable(),
  cnae_principal: z.string().optional().nullable(),
  cnae_descricao: z.string().optional().nullable(),
  data_abertura: z.string().optional().nullable(),
  capital_social: z.number().optional().nullable(),
  porte: z.string().optional().nullable(),
  logradouro: z.string().optional().nullable(),
  numero: z.string().optional().nullable(),
  complemento: z.string().optional().nullable(),
  bairro: z.string().optional().nullable(),
  cep: z.string().optional().nullable(),
  municipio: z.string().optional().nullable(),
  uf: z.string().length(2).optional().nullable(),
  telefone1: z.string().optional().nullable(),
  telefone2: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  status: z
    .enum(["novo", "contatado", "qualificado", "proposta_enviada", "negociacao", "ganho", "perdido"])
    .default("novo"),
  source: z
    .enum(["csv_rfb", "website", "indicacao", "outbound", "evento", "outro"])
    .default("csv_rfb"),
  segmento: z.enum(["micro", "pequena", "media", "grande"]).optional().nullable(),
  temperatura: z.enum(["frio", "morno", "quente"]).default("frio"),
  score: z.number().min(0).max(100).default(0),
  contato_nome: z.string().optional().nullable(),
  contato_cargo: z.string().optional().nullable(),
  contato_telefone: z.string().optional().nullable(),
  contato_email: z.string().email().optional().nullable(),
  plano_interesse: z.string().optional().nullable(),
  valor_estimado: z.number().optional().nullable(),
  motivo_perda: z.string().optional().nullable(),
  ultimo_contato: z.string().optional().nullable(),
  proximo_followup: z.string().optional().nullable(),
  notas: z.string().optional().nullable(),
  tags: z.array(z.string()).default([]),
});

export type ProspectInput = z.infer<typeof prospectSchema>;

export const prospectActivitySchema = z.object({
  prospect_id: z.string().uuid("ID do prospect inválido"),
  tipo: z.enum(["ligacao", "email", "reuniao", "whatsapp", "nota", "proposta", "followup"]),
  descricao: z.string().min(1, "Descrição obrigatória"),
  resultado: z.string().optional().nullable(),
});

export type ProspectActivityInput = z.infer<typeof prospectActivitySchema>;

export const prospectUpdateSchema = prospectSchema.partial().omit({ cnpj: true });

export type ProspectUpdateInput = z.infer<typeof prospectUpdateSchema>;

// ============================================================================
// GESP Import Schemas (XSD-aligned)
// ============================================================================

export const gespPessoaXmlSchema = z.object({
  vinculoEmpregaticio: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(9)]),
  cpf: z.string().regex(/^[0-9]{11}$/, "CPF: 11 dígitos"),
  nome: z.string().min(1).max(60, "Nome: máximo 60 caracteres"),
  pis: z.string().regex(/^(.{0}|[0-9]{11})$/, "PIS: 11 dígitos ou vazio").optional(),
  dataAdmissao: z.string().optional(), // YYYY-MM-DD (convertido para DDMMAAAA na geração)
  sexo: z.enum(["M", "F", "m", "f"]).optional(),
  cargo: z.string().max(30, "Cargo: máximo 30 caracteres").optional(),
  situacao: z.union([z.literal(5), z.literal(8)]).optional(), // Obrigatório apenas na v2
});

export type GespPessoaXmlInput = z.infer<typeof gespPessoaXmlSchema>;

export const gespVeiculoXmlSchema = z.object({
  tipoVeiculo: z.enum(["1", "2", "3", "4"]),
  situacao: z.string().regex(/^[0-4]$/, "Situação: 0-4"),
  chassi: z.string().regex(/^[a-zA-Z0-9]{17}$/, "Chassi: 17 chars"),
  renavam: z.string().regex(/^[0-9]{1,12}$/, "RENAVAM: 1-12 dígitos"),
  modelo: z.string().min(1),
  marca: z.enum(GESP_MARCAS),
  anoFabricacao: z.number().int().min(1900),
  tipoPropriedade: z.enum(["1", "2", "3", "4", "5"]).optional(), // Obrigatório na v2
  ufPlaca: z.enum(GESP_ESTADOS).optional(),
  cidadePlaca: z.string().optional(),
  numeroPlaca: z.string().regex(/^[a-zA-Z]{3}[0-9]{4}$/, "Placa: formato XXX9999").optional(),
  numeroPlacaMercosul: z.string().regex(/^[a-zA-Z]{3}[0-9]{1}[a-zA-Z]{1}[0-9]{2}$/, "Placa Mercosul: formato XXX9X99").optional(),
  dataAquisicao: z.string().optional(),
  inicioVigenciaContrato: z.string().optional(),
  fimVigenciaContrato: z.string().optional(),
});

export type GespVeiculoXmlInput = z.infer<typeof gespVeiculoXmlSchema>;

export const gespAlunoXmlSchema = z.object({
  cpf: z.string().regex(/^[0-9]{11}$/, "CPF: 11 dígitos"),
  logradouroEndereco: z.string().max(150, "Endereço: máximo 150 caracteres"),
  bairroEndereco: z.string().max(70, "Bairro: máximo 70 caracteres"),
  ufEndereco: z.enum(GESP_ESTADOS),
  municipioEndereco: z.string().min(1),
  cepEndereco: z.string().regex(/^[0-9]{8}$/, "CEP: 8 dígitos"),
  telefone1: z.string().regex(/^[0-9]{10,11}$/, "Telefone: 10-11 dígitos"),
  nomePai: z.string().max(60).optional(),
  nomeSocial: z.string().max(60).optional(),
  telefone2: z.string().regex(/^[0-9]{10,11}$/, "Telefone: 10-11 dígitos").optional(),
});

export type GespAlunoXmlInput = z.infer<typeof gespAlunoXmlSchema>;

export const gespTurmaSchema = z.object({
  company_id: z.string().uuid(),
  nome_turma: z.string().min(1, "Nome da turma obrigatório"),
  tipo_curso: z.enum(["formacao", "reciclagem", "extensao"]),
  data_inicio: z.string().min(1),
  data_fim: z.string().min(1),
  local: z.string().optional().nullable(),
  municipio: z.string().optional().nullable(),
  uf: z.string().length(2).optional().nullable(),
  max_alunos: z.number().int().min(1).max(60).default(45), // default 45, checkbox excedentes = 60
  excedentes_habilitados: z.boolean().default(false),
  // Prazos: formação = 5 dias antes, reciclagem = 2 dias antes do envio
});

export type GespTurmaInput = z.infer<typeof gespTurmaSchema>;

export const guiaTransporteSchema = z.object({
  company_id: z.string().uuid(),
  variante: z.enum(["sem_transferencia", "com_transferencia_cnpj", "coletes_destruicao"]).default("sem_transferencia"),
  origem_cidade: z.string().min(1),
  origem_uf: z.enum(GESP_ESTADOS),
  destino_cidade: z.string().min(1),
  destino_uf: z.enum(GESP_ESTADOS),
  data_transporte: z.string().min(1),
  responsavel_nome: z.string().min(1),
  responsavel_cpf: z.string().regex(/^[0-9]{11}$/, "CPF: 11 dígitos"),
  veiculo_placa: z.string().optional().nullable(),
  // Campos para transferência de CNPJ
  cnpj_destino: z.string().optional().nullable(),
  razao_social_destino: z.string().optional().nullable(),
});

export type GuiaTransporteInput = z.infer<typeof guiaTransporteSchema>;

export const comunicacaoOcorrenciaSchema = z.object({
  company_id: z.string().uuid(),
  tipo: z.enum(["extravio", "furto", "roubo", "outro"]),
  data_ocorrencia: z.string().min(1),
  hora_ocorrencia: z.string().min(1),
  local_ocorrencia: z.string().min(1),
  descricao: z.string().min(1),
  boletim_ocorrencia: z.string().optional().nullable(),
});

export type ComunicacaoOcorrenciaInput = z.infer<typeof comunicacaoOcorrenciaSchema>;

export const comunicacaoEventoSchema = z.object({
  company_id: z.string().uuid(),
  tipo_evento: z.string().min(1),
  nome_evento: z.string().min(1),
  arma_fogo: z.boolean(),
  duracao: z.string().optional().nullable(),
  vigilantes_cpfs: z.array(z.string().regex(/^[0-9]{11}$/, "CPF: 11 dígitos")).min(1),
  local: z.string().optional().nullable(),
  data_inicio: z.string().min(1),
  data_fim: z.string().optional().nullable(),
});

export type ComunicacaoEventoInput = z.infer<typeof comunicacaoEventoSchema>;

// Disciplinas de credenciamento (Manual GESP p81-91)
const GESP_DISCIPLINAS = [
  "legislacao_aplicada",
  "seguranca_fisica_de_instalacoes",
  "seguranca_pessoal",
  "defesa_pessoal",
  "primeiros_socorros",
  "protecao_de_autoridades",
  "transporte_de_valores",
  "escolta_armada",
  "armamento_e_tiro",
  "prevencao_e_combate_a_incendio",
  "relacoes_humanas_no_trabalho",
  "radiocomunicacao",
  "gerenciamento_de_crises",
  "defesa_com_uso_progressivo_da_forca",
  "tecnologia_e_sistemas_eletronicos_de_seguranca",
  "seguranca_de_dignitarios",
  "vigilancia_patrimonial",
  "seguranca_portuaria",
  "seguranca_de_grandes_eventos",
  "outro",
] as const;

// Processo Autorizativo subtipos (Manual GESP p24-46)
const GESP_PROCESSO_TIPOS = [
  "revisao_alvara",
  "alteracao_atos_constitutivos",
  "aquisicao_armas",
  "aquisicao_municoes",
  "aquisicao_coletes",
  "informar_aquisicao_municoes",
  "solicitar_aquisicao_coletes",
  "transporte_armas",
  "transferencia_armas",
  "cancelamento_registro_armas",
  "autorizacao_funcionamento",
  "renovacao_autorizacao",
  "extensao_area_atuacao",
  "inclusao_atividade",
  "certificado_vistoria_veiculo",
  "mudanca_endereco",
  "outro",
] as const;

// GRU Fonte de Arrecadação (códigos oficiais GESP/SIAR)
const GESP_GRU_FONTES = [
  "140244", "140252", "140260", "140279", "140295", "140309", "140325", "140368",
] as const;

export const credenciamentoInstrutorSchema = z.object({
  company_id: z.string().uuid(),
  instrutor_cpf: z.string().regex(/^[0-9]{11}$/, "CPF: 11 dígitos"),
  instrutor_nome: z.string().min(1),
  disciplina: z.enum(GESP_DISCIPLINAS, { message: "Disciplina inválida" }),
});

export type CredenciamentoInstrutorInput = z.infer<typeof credenciamentoInstrutorSchema>;

export const processoAutorizativoSchema = z.object({
  company_id: z.string().uuid(),
  tipo_processo: z.enum(GESP_PROCESSO_TIPOS, { message: "Tipo de processo inválido" }),
  descricao: z.string().optional().nullable(),
  gru_fonte_arrecadacao: z.enum(GESP_GRU_FONTES).optional().nullable(),
  gru_linha_digitavel: z.string().optional().nullable(),
});

export type ProcessoAutorizativoInput = z.infer<typeof processoAutorizativoSchema>;

export const processoPunitivoDefesaSchema = z.object({
  numero_processo: z.string().min(1, "Número do processo obrigatório"),
  texto: z.string().min(1, "Texto da defesa obrigatório"),
});

export type ProcessoPunitivoDefesaInput = z.infer<typeof processoPunitivoDefesaSchema>;

export const cnvSolicitacaoSchema = z.object({
  cpf_vigilante: z.string().regex(/^[0-9]{11}$/, "CPF: 11 dígitos"),
  gru_linha_digitavel: z.string().min(1, "Linha digitável da GRU obrigatória"),
});

export type CnvSolicitacaoInput = z.infer<typeof cnvSolicitacaoSchema>;

export const complementacaoOcorrenciaSchema = z.object({
  protocolo_fase1: z.string().min(1, "Protocolo da fase 1 obrigatório"),
  texto: z.string().min(1, "Texto da complementação obrigatório"),
});

export type ComplementacaoOcorrenciaInput = z.infer<typeof complementacaoOcorrenciaSchema>;

// ============================================================================
// Processo Bancário Constants
// ============================================================================

const TIPOS_INSTITUICAO_FINANCEIRA = [
  "agencia_bancaria",
  "cooperativa_credito",
  "posto_atendimento_bancario",
] as const;

const PROCESSO_BANCARIO_TIPOS = [
  "solicitar_recadastramento_bancario",
  "solicitar_plano_seguranca_nova_agencia",
  "solicitar_renovacao_plano_sem_alteracao",
  "solicitar_renovacao_plano_com_reducao",
  "solicitar_plano_emergencial",
  "solicitar_plano_mudanca_endereco",
] as const;

// ============================================================================
// Processo Bancário Schemas
// ============================================================================

export const planoSegurancaBancariaSchema = z.object({
  horario_primeiro_periodo: z.object({
    de: z.string().min(1, "Horário inicial do primeiro período obrigatório"),
    ate: z.string().min(1, "Horário final do primeiro período obrigatório"),
  }),
  horario_segundo_periodo: z.object({
    de: z.string().optional().nullable(),
    ate: z.string().optional().nullable(),
  }).optional().nullable(),
  observacao: z.string().optional().nullable(),
  vigilantes_postos: z.number().int().min(0, "Número de vigilantes não pode ser negativo"),
  vigilantes_cnpj_empresa: z
    .string()
    .refine(isValidCnpj, "CNPJ da empresa de vigilantes inválido")
    .transform((v) => v.replace(/\D/g, ""))
    .optional()
    .nullable(),
  armas_guardadas_local: z.boolean().default(false),
  alarme_tipo: z.string().optional().nullable(),
  alarme_linha_exclusiva: z.boolean().default(false),
  alarme_link_redundante: z.boolean().default(false),
  alarme_fonte_energia: z.boolean().default(false),
  alarme_recebimento_sinal: z.enum(["monitorado_policia", "monitorado_central", "nao_monitorado"]).optional(),
  cftv: z.boolean().default(false),
  detector_metais_porta: z.boolean().default(false),
  detector_metais_portatil: z.boolean().default(false),
  cofre_fechadura_especial: z.boolean().default(false),
  cabine_blindada: z.boolean().default(false),
  caixa_eletronico: z.boolean().default(false),
  outros_itens: z.string().optional().nullable(),
}).refine(
  (data) => {
    const itemCount = [
      data.vigilantes_postos > 0 ? 1 : 0,
      data.alarme_tipo ? 1 : 0,
      data.cftv ? 1 : 0,
      data.detector_metais_porta || data.detector_metais_portatil ? 1 : 0,
      data.cofre_fechadura_especial ? 1 : 0,
      data.cabine_blindada ? 1 : 0,
    ].reduce((a, b) => a + b, 0);
    return itemCount >= 3;
  },
  {
    message: "Mínimo de 3 itens requerido (Vigilantes + Alarme + um de CFTV/Detector/Cofre/Cabine)",
    path: ["_root"],
  }
);

export type PlanoSegurancaBancariaInput = z.infer<typeof planoSegurancaBancariaSchema>;

export const renovacaoPlanoSchema = z.object({
  tipo_renovacao: z.enum(["sem_alteracoes", "com_aumento_elementos"], {
    message: "Tipo de renovação inválido",
  }),
  justificativa: z.string().optional().nullable(),
}).refine(
  (data) => {
    if (data.tipo_renovacao === "com_aumento_elementos" && !data.justificativa) {
      return false;
    }
    return true;
  },
  {
    message: "Justificativa obrigatória para renovação com alterações",
    path: ["justificativa"],
  }
);

export type RenovacaoPlanoInput = z.infer<typeof renovacaoPlanoSchema>;

export const processoBancarioSchema = z.object({
  tipo: z.enum(PROCESSO_BANCARIO_TIPOS, {
    message: "Tipo de processo bancário inválido",
  }),
  cnpj_instituicao: z
    .string()
    .refine(isValidCnpj, "CNPJ da instituição inválido")
    .transform((v) => v.replace(/\D/g, "")),
  tipo_instituicao_financeira: z.enum(TIPOS_INSTITUICAO_FINANCEIRA, {
    message: "Tipo de instituição financeira inválido",
  }),
  numero_agencia_cooperativa: z.string().optional().nullable(),
  numero_pab: z.string().optional().nullable(),
  plano_seguranca: planoSegurancaBancariaSchema.optional().nullable(),
});

export type ProcessoBancarioInput = z.infer<typeof processoBancarioSchema>;

export const unidadeEstadualSchema = z.object({
  uf: z.enum(GESP_ESTADOS, { message: "UF inválida" }),
  nome: z.string().min(1, "Nome obrigatório"),
  email: z
    .string()
    .email("Email inválido")
    .transform((v) => v.toLowerCase().trim()),
  telefone: z.string().min(8, "Telefone obrigatório"),
  endereco: z.string().optional().nullable(),
  numero: z.string().optional().nullable(),
  complemento: z.string().optional().nullable(),
  bairro: z.string().optional().nullable(),
  cidade: z.string().optional().nullable(),
  cep: z.string().optional().nullable(),
  status: z.enum(["ativo", "inativo"]).default("ativo"),
});

export type UnidadeEstadualInput = z.infer<typeof unidadeEstadualSchema>;

// ============================================================================
// Validation Helper
// ============================================================================

export interface ValidationResult<T> {
  data: T | null;
  error: Record<string, string> | null;
  success: boolean;
}

/**
 * Parse and validate request body against a Zod schema
 */
export async function validateBody<T>(
  request: NextRequest,
  schema: z.ZodType<unknown>
): Promise<ValidationResult<T>> {
  try {
    const body = await request.json();
    const data = await schema.parseAsync(body);
    return { data: data as T, error: null, success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors: Record<string, string> = {};
      for (const issue of error.issues) {
        const path = issue.path.join(".");
        formattedErrors[path] = issue.message;
      }
      return { data: null, error: formattedErrors, success: false };
    }
    return {
      data: null,
      error: { _: "Erro ao processar dados" },
      success: false,
    };
  }
}

/**
 * Validate query parameters against a schema
 */
export function validateQuery<T>(
  params: Record<string, string | string[] | undefined>,
  schema: z.ZodType<unknown>
): ValidationResult<T> {
  try {
    const data = schema.parse(params);
    return { data: data as T, error: null, success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors: Record<string, string> = {};
      for (const issue of error.issues) {
        const path = issue.path.join(".");
        formattedErrors[path] = issue.message;
      }
      return { data: null, error: formattedErrors, success: false };
    }
    return {
      data: null,
      error: { _: "Erro ao processar parâmetros" },
      success: false,
    };
  }
}
