// =============================================================================
// VIGI — Tipos do Banco de Dados (alinhados com as 28 tabelas do PRD)
// =============================================================================

// --- Enums ---

export type UserRole = "admin" | "operador" | "viewer";

export type BillingStatus =
  | "trial"
  | "ativo"
  | "inadimplente"
  | "suspenso"
  | "cancelado";

export type EmployeeStatus = "ativo" | "inativo" | "afastado" | "demitido";

export type CnvSituacao = "valida" | "vencida" | "suspensa" | "cancelada";

export type WorkflowStatus =
  | "recebido"
  | "classificado"
  | "aguardando_aprovacao"
  | "aprovado"
  | "executando"
  | "concluido"
  | "erro"
  | "caso_desconhecido";

export type WorkflowPrioridade = "normal" | "urgente";

export type GespTaskStatus =
  | "pendente"
  | "executando"
  | "concluido"
  | "erro"
  | "retry";

export type EmailTemplateId =
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "H"
  | "I"
  | "J"
  | "K"
  | "L"
  | "M"
  | "N"
  | "O"
  | "OF-A"
  | "OF-B"
  | "OF-C"
  | "OF-D"
  | "OF-E";

export type EmailMode = "CLIENTE_HTML" | "OFICIO_PF";

export type WeaponEventType = "compra" | "venda" | "transporte" | "baixa";

export type VestStatus = "ativo" | "baixa_validade" | "baixa_defeito";

// --- Enums GESP/XSD ---

export type GespVinculoEmpregaticio = 1 | 2 | 3 | 9; // 1=Vigilante, 2=Supervisor, 3=Instrutor, 9=Outros
export type GespSituacaoPessoa = 5 | 8; // 5=Ativo, 8=Afastado INSS
export type GespTipoVeiculo = 1 | 2 | 3 | 4; // 1=Carro Forte, 2=Escolta Armada, 3=Outros, 4=Carro Leve TV
export type GespSituacaoVeiculo = 0 | 1 | 2 | 3 | 4; // v1: 0-4, v2: only 1
export type GespTipoPropriedade = 1 | 2 | 3 | 4 | 5; // 1=Próprio, 2=Leasing, 3=Alugado, 4=Outros, 5=Alienação Fiduciária

export type GespMarcaVeiculo =
  | "AGRALE" | "ALFA-ROMEU" | "ASIA" | "AUDI" | "BMW" | "CHRYSLER" | "CITROEN"
  | "DAEWOO" | "DODGE" | "FIAT" | "FORD" | "GENERAL MOTORS" | "HONDA" | "HYUNDAY"
  | "ISUZU" | "ITRAXX" | "IVECO" | "KIA" | "LADA" | "LAND ROVER" | "MAZDA"
  | "MERCEDES BENZ" | "MITSUBISHI" | "MONTEX" | "NISSAN" | "PEUGEOT" | "RENAULT"
  | "SAAB-SCANIA" | "SUNDOWN" | "SUZUKI" | "TOYOTA" | "TROLLER" | "VOLKSWAGEN"
  | "VOLVO" | "WILLYS OVERLAND" | "YAMAHA";

export type GespProcessoStatus =
  | "rascunho"
  | "pendencias_verificadas"
  | "enviado"
  | "em_analise"
  | "deferido"
  | "indeferido"
  | "notificado"
  | "exigencia";

export type GespTurmaStatus =
  | "rascunho"
  | "enviada"
  | "aprovada"
  | "recusada"
  | "inicio_comunicado"    // Após "Comunicar Início"
  | "em_andamento"         // Turma em execução
  | "concluida"            // Após "Comunicar Conclusão"
  | "cancelada";           // Após "Comunicar Cancelamento"

export type GuiaTransporteStatus =
  | "rascunho"
  | "enviada"
  | "aprovada"
  | "recusada"
  | "utilizada"
  | "vencida";

export type ComunicacaoOcorrenciaTipo =
  | "extravio"
  | "furto"
  | "roubo"
  | "outro";

export type CredenciamentoStatus =
  | "solicitado"
  | "em_analise"
  | "deferido"
  | "indeferido"
  | "vencido";

export type NotificacaoAutonomaStatus =
  | "recebida"
  | "em_andamento"
  | "respondida"
  | "prazo_expirado";

export type GespTaskTipoAcao =
  | "cadastrar_vigilante"
  | "criar_processo_autorizativo"
  | "enviar_processo"
  | "verificar_pendencias"
  | "adicionar_documento_processo"
  | "criar_turma"
  | "enviar_turma"
  | "comunicar_inicio_turma"
  | "comunicar_conclusao_turma"
  | "comunicar_cancelamento_turma"
  | "adicionar_aluno_turma"
  | "definir_disciplinas_turma"
  | "importar_pessoas_xml"
  | "importar_veiculos_xml"
  | "importar_alunos_xml"
  | "criar_guia_transporte"
  | "criar_guia_transporte_transferencia"
  | "criar_guia_coletes_destruicao"
  | "enviar_guia"
  | "comunicacao_ocorrencia"
  | "enviar_complementacao_ocorrencia"
  | "comunicacao_evento"
  | "credenciamento_instrutor"
  | "renovar_credenciamento_instrutor"
  | "solicitar_cnv"
  | "imprimir_cnv"
  | "responder_notificacao"
  | "snapshot_empresa"
  | "cadastrar_procurador"
  | "consultar_processo_punitivo"
  | "enviar_defesa_punitivo"
  | "interpor_recurso_punitivo"
  | "gerar_gru_multa"
  | "declarar_pagamento_multa"
  | "informar_aquisicao_municoes"
  | "solicitar_aquisicao_coletes"
  | "certificado_vistoria_veiculo"
  | "alteracao_atos_constitutivos"
  | "consultar_gru"
  // Processo Bancário
  | "solicitar_recadastramento_bancario"
  | "solicitar_plano_seguranca_nova_agencia"
  | "solicitar_renovacao_plano_sem_alteracao"
  | "solicitar_renovacao_plano_com_reducao"
  | "solicitar_plano_emergencial"
  | "solicitar_plano_mudanca_endereco"
  | "editar_rascunho_bancario"
  | "responder_notificacao_bancario"
  | "interpor_recurso_bancario"
  | "restituicao_multa";

// --- Processo Autorizativo: Subtipos (Manual GESP p24-46) ---
export type GespProcessoAutorizativoTipo =
  | "revisao_alvara"
  | "alteracao_atos_constitutivos"
  | "aquisicao_armas"
  | "aquisicao_municoes"
  | "aquisicao_coletes"
  | "informar_aquisicao_municoes"
  | "solicitar_aquisicao_coletes"
  | "transporte_armas"
  | "transferencia_armas"
  | "cancelamento_registro_armas"
  | "autorizacao_funcionamento"
  | "renovacao_autorizacao"
  | "extensao_area_atuacao"
  | "inclusao_atividade"
  | "certificado_vistoria_veiculo"
  | "mudanca_endereco"
  | "outro";

// --- Processo Bancário: Subtipos ---
export type GespProcessoBancarioTipo =
  | "recadastramento"
  | "plano_seguranca_nova_agencia"
  | "renovacao_sem_alteracao_ou_aumento"
  | "renovacao_com_reducao_ou_alteracao"
  | "plano_emergencial"
  | "plano_mudanca_endereco";

// --- Processo Bancário: Status (com deferimento automático para recadastramento) ---
export type GespProcessoBancarioStatus =
  | "rascunho"
  | "pendencias_verificadas"
  | "enviado"
  | "em_analise"
  | "deferido"
  | "deferido_automatico"
  | "indeferido"
  | "notificado"
  | "exigencia";

// --- Tipo de Instituição Financeira ---
export type GespTipoInstituicaoFinanceira =
  | "agencia_bancaria"
  | "cooperativa_credito"
  | "posto_atendimento_bancario";

// --- Disciplinas de Credenciamento de Instrutores (Manual GESP p81-91) ---
export type GespDisciplinaCredenciamento =
  | "legislacao_aplicada"
  | "seguranca_fisica_de_instalacoes"
  | "seguranca_pessoal"
  | "defesa_pessoal"
  | "primeiros_socorros"
  | "protecao_de_autoridades"
  | "transporte_de_valores"
  | "escolta_armada"
  | "armamento_e_tiro"
  | "prevencao_e_combate_a_incendio"
  | "relacoes_humanas_no_trabalho"
  | "radiocomunicacao"
  | "gerenciamento_de_crises"
  | "defesa_com_uso_progressivo_da_forca"
  | "tecnologia_e_sistemas_eletronicos_de_seguranca"
  | "seguranca_de_dignitarios"
  | "vigilancia_patrimonial"
  | "seguranca_portuaria"
  | "seguranca_de_grandes_eventos"
  | "outro";

// --- GRU Fonte de Arrecadação (códigos oficiais GESP/SIAR) ---
export type GespGruFonteArrecadacao =
  | "140244" // Multa
  | "140252" // Taxa de autorização
  | "140260" // Taxa de porte de arma
  | "140279" // Taxa de renovação
  | "140295" // CNV
  | "140309" // Vistoria
  | "140325" // Credenciamento
  | "140368"; // Vistoria Estabelecimentos Financeiros

// --- Guia de Transporte: Variantes (Manual GESP p58-66) ---
export type GuiaTransporteVariante =
  | "sem_transferencia"          // Guia normal (mesma empresa)
  | "com_transferencia_cnpj"     // Transferência entre empresas (CNPJ diferente)
  | "coletes_destruicao";        // Coletes para destruição

// --- Turma: Estados de Comunicação (Manual GESP p52-57) ---
export type GespTurmaComunicacaoTipo =
  | "comunicar_inicio"
  | "comunicar_conclusao"
  | "comunicar_cancelamento";

// --- Ocorrência: Fases obrigatórias (Manual GESP p67-76) ---
export type ComunicacaoOcorrenciaFase =
  | "fase1_comunicacao_24h"      // Comunicação inicial obrigatória em 24h
  | "fase2_complementacao_10d";  // Complementação obrigatória em 10 dias

// --- Tabelas Principais ---

export interface User {
  id: string;
  email: string;
  password_hash: string;
  nome: string;
  role: UserRole;
  company_ids: string[];
  deve_trocar_senha: boolean;
  tentativas_falhas: number;
  bloqueado_ate: string | null;
  mfa_ativo: boolean;
  mfa_secret: string | null;
  created_at: string;
  updated_at: string;
}

export type TipoUnidade = "matriz" | "filial";

export type InstructionCategoria = "geral" | "gesp" | "monitoramento" | "financeiro" | "comunicacao";

export interface Company {
  id: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  alvara_numero: string | null;
  alvara_validade: string | null;
  plano: "essencial" | "profissional" | "enterprise" | "custom";
  valor_mensal: number;
  billing_status: BillingStatus;
  data_proxima_cobranca: string | null;
  // Contrato
  contrato_inicio: string | null;
  contrato_vencimento: string | null; // 30 dias após 1º pagamento
  contrato_auto_renovacao: boolean;
  habilitada: boolean;
  email_operacional: string;
  email_responsavel: string;
  telefone: string | null;
  uf_sede: string;
  ecpf_r2_path: string | null;
  ecpf_senha_encrypted: string | null;
  ecpf_validade: string | null;
  alertas_ativos: Record<string, boolean>;
  // Vigilante alerts
  enviar_alerta_vigilante: boolean;
  // Filiais
  matriz_id: string | null;
  tipo_unidade: TipoUnidade;
  created_at: string;
  updated_at: string;
  // Virtual (populated on queries)
  filiais?: Company[];
  matriz?: Company;
}

export interface CompanyInstruction {
  id: string;
  company_id: string;
  titulo: string;
  conteudo: string;
  categoria: InstructionCategoria;
  ativo: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Employee {
  id: string;
  company_id: string;
  // Bloco 1 — Identificação Civil
  nome_completo: string;
  cpf: string;
  rg: string;
  rg_orgao_emissor: string;
  rg_uf: string;
  rg_data_emissao: string | null;
  data_nascimento: string;
  sexo: "M" | "F";
  nacionalidade: string | null;
  naturalidade: string | null;
  nome_mae: string;
  nome_pai: string | null;
  estado_civil: string | null;
  // Bloco 2 — Contato e Endereço
  email: string;
  telefone1: string;
  telefone2: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  // Bloco 3 — Situação Funcional
  status: EmployeeStatus;
  data_admissao: string;
  data_desligamento: string | null;
  tipo_vinculo: "CLT" | "Terceirizado";
  funcao_principal: string;
  posto_designado: string | null;
  // Bloco 4 — CNV
  cnv_numero: string;
  cnv_uf_emissora: string;
  cnv_data_emissao: string;
  cnv_data_validade: string;
  cnv_situacao: CnvSituacao;
  // Bloco 5 — Reciclagem
  reciclagem_data_ultimo_curso: string | null;
  reciclagem_data_validade: string | null;
  reciclagem_escola: string | null;
  reciclagem_municipio: string | null;
  // Bloco 6 — Formação Inicial
  formacao_data: string | null;
  formacao_escola: string | null;
  formacao_municipio: string | null;
  formacao_uf: string | null;
  // Bloco 7 — Armamento e Colete
  arma_numero_serie: string | null;
  porte_arma_validade: string | null;
  colete_numero_serie: string | null;
  colete_data_validade: string | null;
  // Campos adicionais PF
  crv: string | null;
  laudo_medico: boolean;
  antecedentes_criminais: boolean;
  aptidao_porte_arma: boolean;
  tipo_arma_habilitada: string | null;
  municipio_trabalho: string | null;
  uf_trabalho: string | null;
  // Controle de alertas
  alertas_ativos: Record<string, boolean>;
  // Campos GESP/XSD Import
  pis: string | null; // XSD: 11 dígitos numéricos ou "0"
  vinculo_empregaticio: GespVinculoEmpregaticio | null; // XSD: 1=Vigilante, 2=Supervisor, 3=Instrutor, 9=Outros
  situacao_pessoa: GespSituacaoPessoa | null; // XSD: 5=Ativo, 8=Afastado INSS
  cargo_gesp: string | null; // XSD: max 30 chars
  created_at: string;
  updated_at: string;
}

export interface EmailInbound {
  id: string;
  company_id: string | null;
  gmail_message_id: string;
  from_email: string;
  subject: string;
  body_text: string;
  body_html: string | null;
  received_at: string;
  status: "recebido" | "processado" | "erro";
  parser_resultado: Record<string, unknown> | null;
  tipo_demanda: string | null;
  confidence_score: number | null;
  workflow_id: string | null;
  created_at: string;
}

export interface EmailOutbound {
  id: string;
  company_id: string;
  template_id: EmailTemplateId;
  mode: EmailMode;
  to_email: string;
  subject: string;
  body_html: string | null;
  body_text: string | null;
  resend_id: string | null;
  status: "pendente" | "enviado" | "erro";
  erro_detalhe: string | null;
  workflow_id: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface EmailWorkflow {
  id: string;
  company_id: string;
  email_inbound_id: string | null;
  tipo_demanda: string;
  prioridade: WorkflowPrioridade;
  status: WorkflowStatus;
  dados_extraidos: Record<string, unknown>;
  aprovado_por: string | null;
  aprovado_em: string | null;
  erro_detalhe: string | null;
  created_at: string;
  updated_at: string;
}

export interface GespSession {
  id: string;
  company_id: string;
  browser_pid: number | null;
  status: "ativo" | "finalizado" | "erro";
  started_at: string;
  finished_at: string | null;
  erro_detalhe: string | null;
}

export interface GespTask {
  id: string;
  company_id: string;
  session_id: string | null;
  tipo_acao: GespTaskTipoAcao;
  payload: Record<string, unknown>;
  status: GespTaskStatus;
  tentativas: number;
  max_tentativas: number;
  print_antes_r2: string | null;
  print_depois_r2: string | null;
  protocolo_gesp: string | null;
  erro_detalhe: string | null;
  created_at: string;
  executed_at: string | null;
}

export interface Vehicle {
  id: string;
  company_id: string;
  placa: string;
  modelo: string;
  ano: number;
  tipo: string;
  km_atual: number;
  gps_provider: string | null;
  gps_device_id: string | null;
  gps_ultimo_lat: number | null;
  gps_ultimo_lng: number | null;
  gps_ultima_leitura: string | null;
  marca: string | null;
  licenciamento_validade: string | null;
  seguro_validade: string | null;
  vistoria_pf_validade: string | null;
  // Campos GESP/XSD Import
  chassi: string | null; // XSD: alfanumérico 17 posições
  renavam: string | null; // XSD: numérico 1-12 posições
  tipo_veiculo_gesp: GespTipoVeiculo | null; // 1=Carro Forte, 2=Escolta Armada, 3=Outros, 4=Carro Leve TV
  situacao_veiculo_gesp: GespSituacaoVeiculo | null; // 1=Ativo (v2), 0-4 (v1)
  tipo_propriedade: GespTipoPropriedade | null; // 1-5
  marca_gesp: GespMarcaVeiculo | null; // enum 40+ marcas
  numero_placa_mercosul: string | null; // formato XXX9X99
  uf_placa: string | null;
  cidade_placa: string | null;
  data_aquisicao: string | null;
  inicio_vigencia_contrato: string | null;
  fim_vigencia_contrato: string | null;
  alertas_ativos: Record<string, boolean>;
  created_at: string;
  updated_at: string;
}

export interface VehicleTelemetry {
  id: string;
  vehicle_id: string;
  latitude: number;
  longitude: number;
  velocidade: number | null;
  ignicao: boolean | null;
  odometro: number | null;
  provider: string;
  recorded_at: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string;
  acao: string;
  detalhes: Record<string, unknown>;
  ip: string;
  created_at: string;
}

// --- Prospecção / CRM ---

export type LeadStatus =
  | "novo"
  | "contatado"
  | "qualificado"
  | "proposta_enviada"
  | "negociacao"
  | "ganho"
  | "perdido";

export type LeadSource =
  | "csv_rfb"
  | "dou"
  | "website"
  | "indicacao"
  | "outbound"
  | "evento"
  | "outro";

export type LeadSegmento =
  | "micro"
  | "pequena"
  | "media"
  | "grande";

export type LeadTemperatura =
  | "frio"
  | "morno"
  | "quente";

export interface Prospect {
  id: string;
  // Dados da empresa (vindos do CSV da RFB)
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnae_principal: string | null;
  cnae_descricao: string | null;
  data_abertura: string | null;
  capital_social: number | null;
  porte: string | null;
  // Endereço
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cep: string | null;
  municipio: string | null;
  uf: string | null;
  // Contato
  telefone1: string | null;
  telefone2: string | null;
  email: string | null;
  // CRM
  status: LeadStatus;
  source: LeadSource;
  segmento: LeadSegmento | null;
  temperatura: LeadTemperatura;
  score: number; // 0-100
  // Contato comercial
  contato_nome: string | null;
  contato_cargo: string | null;
  contato_telefone: string | null;
  contato_email: string | null;
  // Pipeline
  plano_interesse: string | null;
  valor_estimado: number | null;
  motivo_perda: string | null;
  // Datas de acompanhamento
  ultimo_contato: string | null;
  proximo_followup: string | null;
  data_conversao: string | null;
  company_id: string | null; // Referência pós-conversão
  // Observações
  notas: string | null;
  tags: string[];
  // Metadata
  importado_por: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProspectActivity {
  id: string;
  prospect_id: string;
  user_id: string;
  tipo: "ligacao" | "email" | "reuniao" | "whatsapp" | "nota" | "proposta" | "followup";
  descricao: string;
  resultado: string | null;
  created_at: string;
}

// --- Entidades GESP ---

export interface GespProcesso {
  id: string;
  company_id: string;
  tipo_processo: GespProcessoAutorizativoTipo; // Subtipo do processo autorizativo
  numero_processo: string | null; // Formato: AAAA/NNNN (atribuído pela PF após envio)
  status: GespProcessoStatus;
  dados_processo: Record<string, unknown>;
  documentos: GespProcessoDocumento[];
  observacoes: string | null;
  data_envio: string | null;
  data_resposta: string | null;
  resultado_analise: string | null;
  // Campos de GRU (quando necessário pagamento de taxa)
  gru_fonte_arrecadacao: GespGruFonteArrecadacao | null;
  gru_linha_digitavel: string | null;
  gru_paga: boolean;
  created_at: string;
  updated_at: string;
}

export interface GespProcessoDocumento {
  nome: string;
  tipo: string;
  r2_path: string;
  uploaded_at: string;
}

// --- Responsável Estadual (p105) ---
export interface UnidadeResponsavelEstadual {
  cnpj: string;
  razao_social: string;
  endereco: string;
  bairro: string;
  complemento: string | null;
  cep: string;
  uf: string;
  municipio: string;
  telefone: string;
  nome_contato: string;
  email: string;
}

// --- Plano de Segurança Bancária (p110-111) ---
export interface PlanoSegurancaBancaria {
  horario_primeiro_periodo: {
    de: string;
    ate: string;
  };
  horario_segundo_periodo: {
    de: string;
    ate: string;
  };
  observacao: string | null;
  vigilantes_postos: number;
  vigilantes_cnpj_empresa: string;
  vigilantes_razao_social: string;
  vigilantes_disposicao: string;
  vigilantes_rodizio_intrajornada: boolean;
  armas_guardadas_local: boolean;
  armas_local: string | null;
  alarme_tipo: string;
  alarme_linha_exclusiva: boolean;
  alarme_link_redundante: boolean;
  alarme_fonte_energia_ininterrupta: boolean;
  alarme_especificar: string | null; // e.g., "NO BREAK"
  alarme_recebimento_sinal: "empresa_seguranca" | "orgao_policial" | "propria_instituicao";
  alarme_responsavel?: {
    nome: string;
    nome_contato: string;
    endereco: string;
    bairro: string;
    uf: string;
    municipio: string;
    telefone: string;
    telefone2?: string;
  };
  cftv: boolean;
  detector_metais_porta: boolean;
  detector_metais_portatil: boolean;
  cofre_fechadura_especial: boolean;
  cabine_escudo_anteparo_blindado: boolean;
  caixa_eletronico: boolean;
  outros_itens: string | null;
}

// --- Processo Bancário ---
export interface GespProcessoBancario {
  id: string;
  company_id: string;
  tipo_processo: GespProcessoBancarioTipo;
  numero_processo: string | null;
  status: GespProcessoBancarioStatus;
  tipo_instituicao: GespTipoInstituicaoFinanceira;
  unidade_responsavel_estadual?: UnidadeResponsavelEstadual;
  plano_seguranca: PlanoSegurancaBancaria | null;
  dados_processo: Record<string, unknown>;
  documentos: GespProcessoDocumento[];
  observacoes: string | null;
  data_envio: string | null;
  data_resposta: string | null;
  resultado_analise: string | null;
  gru_fonte_arrecadacao: GespGruFonteArrecadacao | null;
  gru_linha_digitavel: string | null;
  gru_paga: boolean;
  created_at: string;
  updated_at: string;
}

export interface GespTurma {
  id: string;
  company_id: string;
  nome_turma: string;
  tipo_curso: "formacao" | "reciclagem" | "extensao";
  status: GespTurmaStatus;
  data_inicio: string;
  data_fim: string;
  local: string | null;
  municipio: string | null;
  uf: string | null;
  max_alunos: number; // default 45, com checkbox excedentes = 60
  excedentes_habilitados: boolean; // checkbox "Incluir Excedentes" no GESP
  disciplinas: GespDisciplina[];
  // Prazos de envio: formação = 5 dias antes, reciclagem = 2 dias antes
  prazo_envio_dias: number;
  // Comunicações de lifecycle (Cadastrar → Comunicar Início → Conclusão/Cancelamento)
  data_comunicacao_inicio: string | null;
  data_comunicacao_conclusao: string | null;
  data_comunicacao_cancelamento: string | null;
  motivo_cancelamento: string | null;
  created_at: string;
  updated_at: string;
}

export interface GespDisciplina {
  nome: GespDisciplinaCredenciamento | string;
  carga_horaria: number;
  instrutor_cpf: string | null;
  instrutor_nome: string | null;
  instrutor_credenciamento_valido: boolean; // Instrutor com credenciamento ativo no GESP
}

export interface GespAluno {
  id: string;
  turma_id: string;
  cpf: string;
  nome: string | null;
  logradouro_endereco: string | null; // XSD: endereco max 150
  bairro_endereco: string | null; // XSD: bairro max 70
  uf_endereco: string | null; // XSD: typeEstado 27 UFs
  municipio_endereco: string | null;
  cep_endereco: string | null; // XSD: 8 dígitos
  telefone1: string | null; // XSD: 10-11 dígitos numéricos
  telefone2: string | null;
  nome_pai: string | null; // XSD: nome max 60
  nome_social: string | null; // XSD: nome max 60
  created_at: string;
}

export interface GuiaTransporte {
  id: string;
  company_id: string;
  variante: GuiaTransporteVariante; // sem_transferencia, com_transferencia_cnpj, coletes_destruicao
  status: GuiaTransporteStatus;
  origem_cidade: string;
  origem_uf: string;
  destino_cidade: string;
  destino_uf: string;
  data_transporte: string;
  responsavel_nome: string;
  responsavel_cpf: string;
  veiculo_placa: string | null;
  itens: GuiaTransporteItem[];
  numero_guia: string | null; // Número atribuído pelo GESP
  data_validade: string | null;
  // Campos para transferência de CNPJ
  cnpj_destino: string | null; // Para guia com transferência
  razao_social_destino: string | null;
  created_at: string;
  updated_at: string;
}

export interface GuiaTransporteItem {
  tipo: "arma" | "municao" | "nao_letal" | "equipamento";
  descricao: string;
  quantidade: number;
  numero_serie: string | null;
  calibre: string | null;
}

export interface ComunicacaoOcorrencia {
  id: string;
  company_id: string;
  tipo: ComunicacaoOcorrenciaTipo;
  fase_atual: ComunicacaoOcorrenciaFase; // Obrigatório: fase1 em 24h, fase2 em 10 dias
  data_ocorrencia: string;
  hora_ocorrencia: string;
  local_ocorrencia: string;
  descricao: string;
  boletim_ocorrencia: string | null; // Número do BO
  armas_envolvidas: ArmaOcorrencia[];
  protocolo_gesp: string | null;
  // Fase 1: Comunicação inicial (prazo 24h)
  data_comunicacao_fase1: string | null;
  protocolo_fase1: string | null;
  // Fase 2: Complementação (prazo 10 dias)
  complementacao_texto: string | null;
  complementacao_documentos_r2: string[];
  data_complementacao_fase2: string | null;
  protocolo_fase2: string | null;
  created_at: string;
}

export interface ArmaOcorrencia {
  numero_serie: string;
  tipo: string;
  calibre: string | null;
}

export interface ComunicacaoEvento {
  id: string;
  company_id: string;
  tipo_evento: string;
  nome_evento: string;
  arma_fogo: boolean; // S/N no GESP
  duracao: string | null;
  vigilantes_cpfs: string[]; // Lista de CPFs dos vigilantes
  local: string | null;
  data_inicio: string;
  data_fim: string | null;
  protocolo_gesp: string | null;
  created_at: string;
}

export interface CredenciamentoInstrutor {
  id: string;
  company_id: string;
  instrutor_cpf: string;
  instrutor_nome: string;
  disciplina: GespDisciplinaCredenciamento;
  status: CredenciamentoStatus;
  data_solicitacao: string;
  data_deferimento: string | null;
  data_validade: string | null; // 4 anos conforme manual
  certidoes_r2_paths: string[]; // 5 certidões criminais obrigatórias
  protocolo_gesp: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificacaoAutonoma {
  id: string;
  company_id: string;
  numero_notificacao: string;
  assunto: string;
  texto: string;
  status: NotificacaoAutonomaStatus;
  data_recebimento: string;
  prazo_resposta: string; // 30 dias a partir do recebimento
  resposta_texto: string | null;
  resposta_documentos_r2: string[];
  data_resposta: string | null;
  created_at: string;
  updated_at: string;
}

// --- Processo Punitivo (Manual GESP p47-51) ---
// Empresa NÃO cria processo punitivo — apenas consulta e responde
export type ProcessoPunitivoTipo =
  | "auto_de_infracao"
  | "processo_administrativo"   // PAD
  | "cassacao";

export type ProcessoPunitivoStatus =
  | "em_andamento"
  | "aguardando_defesa"        // Empresa precisa enviar defesa
  | "defesa_enviada"
  | "aguardando_recurso"       // Cabe recurso
  | "recurso_enviado"
  | "julgado"
  | "multa_pendente"           // Multa a pagar
  | "multa_paga"
  | "arquivado";

export interface ProcessoPunitivo {
  id: string;
  company_id: string;
  numero_processo: string;
  tipo: ProcessoPunitivoTipo;
  status: ProcessoPunitivoStatus;
  auto_de_infracao: string | null;
  data_autuacao: string | null;
  descricao: string | null;
  // Defesa
  defesa_texto: string | null;
  defesa_documentos_r2: string[];
  data_defesa: string | null;
  prazo_defesa: string | null;
  // Recurso
  recurso_texto: string | null;
  recurso_documentos_r2: string[];
  data_recurso: string | null;
  prazo_recurso: string | null; // 10 dias
  // Multa
  valor_multa: number | null;
  gru_multa_fonte: GespGruFonteArrecadacao | null;
  gru_multa_linha_digitavel: string | null;
  multa_paga: boolean;
  data_pagamento_multa: string | null;
  // Resultado
  resultado: "deferido" | "indeferido" | "parcialmente_deferido" | null;
  data_julgamento: string | null;
  created_at: string;
  updated_at: string;
}

export interface GespProcurador {
  id: string;
  company_id: string;
  cpf_procurador: string;
  nome_procurador: string;
  email_procurador: string | null;
  telefone_procurador: string | null;
  poderes: "plenos" | "limitados";
  ativo: boolean;
  data_cadastro: string;
  data_revogacao: string | null;
  created_at: string;
}

// --- Views ---

export interface ProcessoAtivo {
  id: string;
  company_id: string;
  razao_social: string;
  tipo_demanda: string;
  prioridade: WorkflowPrioridade;
  status: WorkflowStatus;
  created_at: string;
  dias_aberto: number;
}

export interface ValidadeCritica {
  tipo: string;
  entidade_id: string;
  entidade_nome: string;
  company_id: string;
  data_validade: string;
  dias_restantes: number;
  severidade: "informativo" | "atencao" | "urgente" | "critico";
}

export interface DashboardKpi {
  total_empresas_ativas: number;
  total_vigilantes_ativos: number;
  workflows_abertos: number;
  workflows_urgentes: number;
  validades_criticas: number;
  gesp_tasks_pendentes: number;
  emails_enviados_hoje: number;
  proximo_ciclo: string;
}

// --- Monitoramento DOU ---

export type TipoAto = "alvara" | "portaria" | "despacho" | "resolucao" | "instrucao_normativa";

export type TipoAlvara =
  | "autorizacao"
  | "renovacao"
  | "cancelamento"
  | "revisao"
  | "transferencia";

export type SubtipoAlvara =
  | "aquisicao_arma"
  | "aquisicao_municao"
  | "transporte_arma"
  | "funcionamento"
  | "revisao_alvara"
  | "autorizacao_compra"
  | "porte_arma"
  | "outro";

export type AlertaTipo =
  | "novo_alvara"
  | "renovacao"
  | "vencimento_proximo"
  | "processo_punitivo"
  | "cancelamento";

export type AlertaStatus = "pendente" | "enviado" | "falha" | "lido";
export type AlertaPrioridade = "baixa" | "normal" | "alta" | "urgente";
export type ScraperRunStatus = "running" | "success" | "error" | "partial";

export interface ItemLiberado {
  quantidade: number;
  descricao: string;
  tipo: string; // arma, municao, colete, equipamento
  calibre?: string;
  modelo?: string;
}

export interface DouPublicacao {
  id: string;
  titulo: string;
  tipo_ato: TipoAto;
  numero_ato: string | null;
  data_ato: string | null;
  data_publicacao: string;
  secao: number;
  edicao: string | null;
  pagina: string | null;
  orgao_principal: string | null;
  orgao_subordinado: string | null;
  unidade: string | null;
  texto_completo: string;
  resumo: string | null;
  url_publicacao: string | null;
  url_pdf: string | null;
  slug: string | null;
  dou_id: string | null;
  assinante: string | null;
  cargo_assinante: string | null;
  processado: boolean;
  created_at: string;
  updated_at: string;
}

export interface DouAlvara {
  id: string;
  publicacao_id: string;
  razao_social: string;
  cnpj: string;
  cnpj_limpo: string;
  uf: string | null;
  municipio: string | null;
  tipo_alvara: TipoAlvara;
  subtipo: SubtipoAlvara | null;
  numero_processo: string | null;
  delegacia: string | null;
  itens_liberados: ItemLiberado[];
  validade_dias: number | null;
  data_validade: string | null;
  texto_original: string;
  company_id: string | null;
  prospect_id: string | null;
  notificado: boolean;
  data_notificacao: string | null;
  canal_notificacao: string | null;
  created_at: string;
  updated_at: string;
  // Joins
  publicacao?: DouPublicacao;
}

export interface DouAlerta {
  id: string;
  alvara_id: string | null;
  publicacao_id: string | null;
  company_id: string | null;
  prospect_id: string | null;
  cnpj: string;
  razao_social: string | null;
  tipo_alerta: AlertaTipo;
  titulo: string;
  mensagem: string;
  prioridade: AlertaPrioridade;
  status: AlertaStatus;
  enviado_em: string | null;
  lido_em: string | null;
  canal: string | null;
  created_at: string;
}

export interface DouScraperRun {
  id: string;
  data_alvo: string;
  secao: number;
  status: ScraperRunStatus;
  publicacoes_encontradas: number;
  alvaras_extraidos: number;
  alertas_gerados: number;
  empresas_vinculadas: number;
  erro: string | null;
  detalhes: Record<string, unknown> | null;
  iniciado_em: string;
  finalizado_em: string | null;
  duracao_ms: number | null;
}

// --- Email Threading ---
export type ThreadStatus = "PENDENTE" | "EM_ANDAMENTO" | "FINALIZADO";
export type ThreadParticipantTipo = "interno_admin" | "interno_operador" | "externo_cnpj" | "externo_outro";
export type ThreadParticipantMotivo = "responsavel_empresa" | "interveio" | "cliente_copiou" | "admin_manual";
export type KnowledgeBaseStatus = "pendente" | "aprovado" | "rejeitado" | "auto_aprovado";

export interface EmailThread {
  id: string;
  company_id: string;
  subject: string;
  cnpj_detectado: string | null;
  status: ThreadStatus;
  tipo_demanda: string | null;
  last_message_id: string | null;
  message_ids: string[];
  created_at: string;
  updated_at: string;
  finalizado_at: string | null;
  finalizado_por: string | null;
}

export interface ThreadParticipant {
  id: string;
  thread_id: string;
  user_id: string | null;
  email: string;
  tipo: ThreadParticipantTipo;
  motivo_entrada: ThreadParticipantMotivo;
  entrou_em: string;
  ativo: boolean;
}

export interface UserMetric {
  id: string;
  user_id: string;
  thread_id: string | null;
  company_id: string | null;
  t_primeira_leitura: string | null;
  t_acao_iniciada: string | null;
  t_cliente_atualizado: string | null;
  minutos_resposta: number | null;
  minutos_execucao: number | null;
  dentro_do_prazo: boolean | null;
  modulo_gesp: string | null;
  created_at: string;
}

export interface KnowledgeBaseEntry {
  id: string;
  email_original_id: string | null;
  descricao_caso: string;
  solucao_adotada: string | null;
  resolvido_por_id: string | null;
  tempo_resolucao_min: number | null;
  status: KnowledgeBaseStatus;
  confianca_ia: number;
  aprovado_por_email: boolean;
  tags: string[];
  kb_ref: string | null;
  created_at: string;
}

// Template I added
export type EmailTemplateIdFull = EmailTemplateId | "I";

// Outbound with threading
export interface EmailOutboundWithThread {
  id: string;
  company_id: string;
  thread_id: string | null;
  template_id: EmailTemplateId;
  mode: EmailMode;
  from_email: string;
  to_email: string;
  cc_emails: string[];
  subject: string;
  body_html: string | null;
  body_text: string | null;
  resend_id: string | null;
  status: string;
  erro_detalhe: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  created_at: string;
  sent_at: string | null;
}
