/**
 * VIGI PRO — GESP Knowledge Base
 *
 * Base de conhecimento extraída do Manual GESP Empresa v15.0 (Sistema v21.0.0 / Março 2019)
 * Fonte oficial: Polícia Federal — DELESP / CGCSP
 *
 * Propósito:
 *   - Guiar o Cognitive Engine em cada decisão dentro do GESP
 *   - Definir TODOS os processos disponíveis, seus requisitos, prazos e criticidade
 *   - Servir como referência para o Orquestrador decidir QUAIS ações solicitar aprovação
 *   - Nunca executar um processo sem conferir aqui se está mapeado e aprovado
 *
 * IMPORTANTE: Qualquer ação no GESP que não esteja mapeada aqui DEVE ser bloqueada
 * e escalada para revisão humana antes de prosseguir.
 */

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type GespProcessCategory =
  | "autorizativo"   // Processos Autorizativos (seção 5)
  | "punitivo"       // Processos Punitivos (seção 6)
  | "turma"          // Turmas de Vigilantes (seção 7)
  | "transporte"     // Guia de Transporte de Armas (seção 8)
  | "ocorrencia"     // Comunicação de Ocorrência (seção 9)
  | "evento"         // Comunicação de Evento (seção 10)
  | "instrutor"      // Credenciamento de Instrutores (seção 11)
  | "cnv"            // Carteira Nacional de Vigilantes (seção 13)
  | "importacao"     // Importação de dados em lote (seção 14)
  | "bancario"       // Processo Bancário / Planos de Segurança (seção 18)
  | "dados"          // Atualização de dados cadastrais (seção 3)
  | "consulta"       // Consultas sem alteração (acompanhar, visualizar)

export type GespRiskLevel =
  | "critical"   // Exige aprovação admin + notificação imediata (armas, multas, recursos)
  | "high"       // Exige aprovação admin (licenças, revisões, coletes, veículos)
  | "medium"     // Exige aprovação admin (turmas, eventos, instrutores, CNV)
  | "low"        // Exige aprovação admin (consultas que alteram estado)
  | "readonly"   // Apenas leitura, sem aprovação necessária (acompanhar, consultar)

export type GespDeadline =
  | "24h"        // Comunicação de Ocorrência — prazo máximo 24 horas após fato
  | "annual"     // Revisão de Autorização de Funcionamento — anual
  | "pre_open"   // Plano de Segurança Bancária — mín 60 dias antes de abrir agência
  | "none"       // Sem prazo específico

export interface GespProcess {
  /** Código único do processo — usado em gesp_tasks.tipo_acao */
  code: string
  /** Nome legível */
  name: string
  /** Seção do manual GESP */
  manualSection: string
  /** Categoria do processo */
  category: GespProcessCategory
  /** Nível de risco — determina o fluxo de aprovação */
  riskLevel: GespRiskLevel
  /** Requer aprovação do admin ANTES de executar */
  requiresAdminApproval: boolean
  /** Prazo de execução após trigger */
  deadline: GespDeadline
  /** Documentos/dados obrigatórios para executar */
  requiredFields: string[]
  /** Campos opcionais */
  optionalFields: string[]
  /** Se requer pagamento de GRU (Guia de Recolhimento da União) */
  requiresGRU: boolean
  /** Descrição do que o processo faz */
  description: string
  /** Alertas e observações críticas do manual */
  alerts: string[]
  /** Tipo de empresa que pode executar este processo */
  applicableTo: Array<"empresa_seguranca" | "empresa_organica" | "curso_formacao" | "instituicao_financeira" | "qualquer">
  /** Se suporta recurso em caso de indeferimento */
  allowsAppeal: boolean
}

// ─── Mapa Completo de Processos GESP ─────────────────────────────────────────

export const GESP_PROCESSES: Record<string, GespProcess> = {

  // ══════════════════════════════════════════════════════════
  // SEÇÃO 5 — PROCESSOS AUTORIZATIVOS
  // ══════════════════════════════════════════════════════════

  "autorizacao_funcionamento": {
    code: "autorizacao_funcionamento",
    name: "Solicitar Autorização de Funcionamento",
    manualSection: "5.2",
    category: "autorizativo",
    riskLevel: "critical",
    requiresAdminApproval: true,
    deadline: "none",
    requiredFields: [
      "cnpj", "razao_social", "endereco", "tipo_servico", "tipo_atividade",
      "responsavel_tecnico", "ato_constitutivo_pdf", "certidao_negativa_federal",
      "certidao_negativa_estadual", "certidao_negativa_municipal"
    ],
    optionalFields: ["certidao_negativa_trabalhista", "documentos_adicionais"],
    requiresGRU: true,
    description: "Primeiro processo de uma empresa de segurança no GESP. Solicita autorização inicial para funcionar. Gerado apenas uma vez; renovações são feitas via 'revisao_autorizacao'.",
    alerts: [
      "É o processo inicial — só executado UMA VEZ por empresa",
      "Após aprovação, a empresa recebe Alvará de Funcionamento",
      "Sem aprovação, nenhuma operação de segurança privada é legal",
      "Requer GRU para pagamento de taxas"
    ],
    applicableTo: ["empresa_seguranca", "empresa_organica", "curso_formacao"],
    allowsAppeal: true,
  },

  "revisao_autorizacao": {
    code: "revisao_autorizacao",
    name: "Solicitar Revisão de Autorização de Funcionamento",
    manualSection: "5.5",
    category: "autorizativo",
    riskLevel: "critical",
    requiresAdminApproval: true,
    deadline: "annual",
    requiredFields: [
      "cnpj", "razao_social", "certidao_negativa_federal",
      "certidao_negativa_estadual", "certidao_negativa_municipal",
      "documentacao_atual"
    ],
    optionalFields: ["alteracoes_dados"],
    requiresGRU: true,
    description: "Renovação anual obrigatória da autorização de funcionamento. Empresa que não renovar perde o direito de operar. ALERTA: Monitorar data de vencimento e solicitar antes do prazo.",
    alerts: [
      "PRAZO CRÍTICO: Renovação deve ser feita ANTES do vencimento do alvará atual",
      "Alvará vencido = empresa operando ilegalmente",
      "Não é permitido solicitar se houver processo de Atos com alteração de Endereço em andamento",
      "Requer GRU"
    ],
    applicableTo: ["empresa_seguranca", "empresa_organica", "curso_formacao"],
    allowsAppeal: true,
  },

  "aquisicao_armas": {
    code: "aquisicao_armas",
    name: "Solicitar Aquisição de Armas e Munições",
    manualSection: "5.3",
    category: "autorizativo",
    riskLevel: "critical",
    requiresAdminApproval: true,
    deadline: "none",
    requiredFields: [
      "cnpj", "tipo_arma", "quantidade", "contratos_pj_vinculados",
      "contratos_pf_vinculados", "justificativa", "gru_pagamento"
    ],
    optionalFields: ["petrechos", "municoes_tipo", "municoes_quantidade"],
    requiresGRU: true,
    description: "Processo para aquisição de armas de fogo, munições e petrechos. Contratos DEVEM estar previamente vinculados. Apenas para empresas de segurança especializadas (não orgânicas) e cursos de formação.",
    alerts: [
      "CRÍTICO: Requer contratos PJ/PF devidamente cadastrados e vinculados ao processo",
      "Apenas armas dos tipos autorizados pela PF para segurança privada",
      "Empresa deve informar nota fiscal de aquisição após deferimento (process 'informar_aquisicao_municoes')",
      "Guias de Transporte só podem ser emitidas para postos vinculados ao contrato",
      "Empresa Orgânica: sem itens de contratos PJ/PF (processo diferente)"
    ],
    applicableTo: ["empresa_seguranca", "curso_formacao"],
    allowsAppeal: true,
  },

  "aquisicao_coletes": {
    code: "aquisicao_coletes",
    name: "Solicitar Aquisição de Coletes",
    manualSection: "5.12",
    category: "autorizativo",
    riskLevel: "high",
    requiresAdminApproval: true,
    deadline: "none",
    requiredFields: ["cnpj", "tipo_colete", "quantidade", "justificativa", "nivel_protecao"],
    optionalFields: ["documentos_adicionais"],
    requiresGRU: false,
    description: "Solicitação de autorização para aquisição de coletes de proteção balística. Processo NÃO requer GRU. Se indeferido, pode ser interposto recurso.",
    alerts: [
      "Não requer GRU — diferente da maioria dos processos",
      "Coletes têm validade — monitorar e solicitar renovação antes do vencimento",
      "Se indeferido: interpor recurso via 5.10"
    ],
    applicableTo: ["empresa_seguranca", "empresa_organica"],
    allowsAppeal: true,
  },

  "nova_atividade": {
    code: "nova_atividade",
    name: "Solicitar Autorização de Nova Atividade",
    manualSection: "5.4",
    category: "autorizativo",
    riskLevel: "high",
    requiresAdminApproval: true,
    deadline: "none",
    requiredFields: ["cnpj", "tipo_atividade_nova", "justificativa", "documentacao_suporte"],
    optionalFields: ["certidoes_adicionais"],
    requiresGRU: true,
    description: "Adiciona novas atividades de segurança ao rol permitido da empresa. Algumas atividades exigem mínimo de 1 ano de funcionamento (escolta armada, segurança particular).",
    alerts: [
      "Escolta armada e segurança particular: exigem 1 ano de funcionamento",
      "Curso de formação: EXCLUSIVO — exclui todas as outras atividades",
      "Transporte de Valores: não permitido se houver processo de Atos com alteração de Endereço em andamento"
    ],
    applicableTo: ["empresa_seguranca"],
    allowsAppeal: true,
  },

  "outra_instalacao": {
    code: "outra_instalacao",
    name: "Solicitar Autorização de Funcionamento de Outra Instalação",
    manualSection: "5.13",
    category: "autorizativo",
    riskLevel: "high",
    requiresAdminApproval: true,
    deadline: "none",
    requiredFields: ["cnpj", "endereco_instalacao", "tipo_instalacao", "documentacao_local"],
    optionalFields: ["planta_baixa", "documentos_adicionais"],
    requiresGRU: true,
    description: "Autorização para funcionamento de locais que a empresa use como 'Outras Instalações'. Não requer CNPJ próprio do local.",
    alerts: [
      "Diferente de filial — não exige CNPJ da instalação",
      "Requer comprovação do uso do local"
    ],
    applicableTo: ["empresa_seguranca", "empresa_organica"],
    allowsAppeal: true,
  },

  "certificado_vistoria_veiculo": {
    code: "certificado_vistoria_veiculo",
    name: "Solicitar Expedição de Certificado de Vistoria de Veículo",
    manualSection: "5.14",
    category: "autorizativo",
    riskLevel: "high",
    requiresAdminApproval: true,
    deadline: "none",
    requiredFields: ["cnpj", "veiculo_placa", "veiculo_chassi", "tipo_processo", "documentos_veiculo"],
    optionalFields: [],
    requiresGRU: true,
    description: "Para empresas de Transporte de Valores. Certificado tem validade de 1 ano. Autorização: 1 GRU. Renovação: 2 GRUs.",
    alerts: [
      "Certificado de Vistoria de Veículo tem validade de 1 ANO — monitorar vencimento",
      "Autorização: 1 GRU. Renovação: 2 GRUs",
      "Veículo novo deve ser cadastrado ANTES de solicitar o certificado",
      "Processo tramitando = veículo NÃO pode ser transferido ou excluído"
    ],
    applicableTo: ["empresa_seguranca"],
    allowsAppeal: true,
  },

  "certificado_seguranca_organica": {
    code: "certificado_seguranca_organica",
    name: "Solicitar Expedição de Certificado de Segurança de Orgânica",
    manualSection: "5.7",
    category: "autorizativo",
    riskLevel: "high",
    requiresAdminApproval: true,
    deadline: "none",
    requiredFields: ["cnpj", "documentacao_organica"],
    optionalFields: [],
    requiresGRU: true,
    description: "Processo exclusivo para Empresas Orgânicas. Expedição do certificado de segurança.",
    alerts: ["Exclusivo para perfil Empresa Orgânica"],
    applicableTo: ["empresa_organica"],
    allowsAppeal: true,
  },

  "filial_organica": {
    code: "filial_organica",
    name: "Solicitar Autorização de Funcionamento de Filial de Orgânica",
    manualSection: "5.6",
    category: "autorizativo",
    riskLevel: "high",
    requiresAdminApproval: true,
    deadline: "none",
    requiredFields: ["cnpj_filial", "endereco_filial", "documentacao_filial"],
    optionalFields: [],
    requiresGRU: true,
    description: "Autorização para filiais de empresas orgânicas.",
    alerts: ["Exclusivo para perfil Empresa Orgânica"],
    applicableTo: ["empresa_organica"],
    allowsAppeal: true,
  },

  "alteracao_atos_constitutivos": {
    code: "alteracao_atos_constitutivos",
    name: "Solicitar Alteração de Atos Constitutivos / Uniforme",
    manualSection: "4.15",
    category: "autorizativo",
    riskLevel: "high",
    requiresAdminApproval: true,
    deadline: "none",
    requiredFields: ["cnpj", "tipo_alteracao", "novo_contrato_social", "documentacao_suporte"],
    optionalFields: ["novo_uniforme", "novo_responsavel", "novo_endereco"],
    requiresGRU: false,
    description: "Altera contrato social da empresa: razão social, tipo societário, responsáveis, sócios PJ, endereço, capital social, uniforme.",
    alerts: [
      "Alteração de Endereço: NÃO permitida se houver processo de Revisão, Nova Atividade em Transporte de Valores ou Expedição de Certificado de Segurança em andamento",
      "Mudança de endereço impacta outros processos — verificar dependências antes"
    ],
    applicableTo: ["empresa_seguranca", "empresa_organica"],
    allowsAppeal: false,
  },

  "informar_aquisicao_municoes": {
    code: "informar_aquisicao_municoes",
    name: "Informar Aquisição de Munições",
    manualSection: "4.16",
    category: "autorizativo",
    riskLevel: "high",
    requiresAdminApproval: true,
    deadline: "none",
    requiredFields: ["cnpj", "processo_aquisicao_id", "nota_fiscal", "quantidade_adquirida", "tipo_municao"],
    optionalFields: ["notas_fiscais_adicionais"],
    requiresGRU: false,
    description: "Registro obrigatório após deferimento de processo de aquisição de munições. Sistema não permite informar mais do que o deferido.",
    alerts: [
      "OBRIGATÓRIO após compra de munições autorizadas",
      "Sistema valida: quantidade informada ≤ quantidade deferida/provida nos alvarás",
      "Múltiplas notas fiscais permitidas"
    ],
    applicableTo: ["empresa_seguranca", "curso_formacao"],
    allowsAppeal: false,
  },

  "responder_notificacao": {
    code: "responder_notificacao",
    name: "Responder Notificação",
    manualSection: "5.9",
    category: "autorizativo",
    riskLevel: "critical",
    requiresAdminApproval: true,
    deadline: "none", // Prazo definido na notificação da PF
    requiredFields: ["processo_id", "resposta_texto", "documentos_suporte"],
    optionalFields: ["documentos_adicionais"],
    requiresGRU: false,
    description: "Resposta a notificações enviadas pela PF sobre processos autorizativos. Prazo definido na própria notificação. Ignorar notificações pode resultar em indeferimento.",
    alerts: [
      "CRÍTICO: Verificar PRAZO na notificação — cada notificação tem seu próprio prazo",
      "Ignorar notificação pode resultar em indeferimento automático do processo",
      "Captador deve monitorar Quadro de Avisos do GESP diariamente para detectar novas notificações"
    ],
    applicableTo: ["qualquer"],
    allowsAppeal: false,
  },

  "interpor_recurso": {
    code: "interpor_recurso",
    name: "Interpor Recurso",
    manualSection: "5.10",
    category: "autorizativo",
    riskLevel: "critical",
    requiresAdminApproval: true,
    deadline: "none", // Prazo definido no indeferimento
    requiredFields: ["processo_id", "motivo_recurso", "argumentos_juridicos", "documentos_suporte"],
    optionalFields: ["advogado_oab", "certidoes_adicionais"],
    requiresGRU: false,
    description: "Recurso contra decisão de indeferimento pela PF. Deve ser interposto dentro do prazo informado no ato de indeferimento.",
    alerts: [
      "PRAZO: Definido no ato de indeferimento — não perder prazo",
      "Recurso sem fundamentação jurídica tende a ser negado",
      "Após esgotamento de recurso no GESP, recursos judiciais ainda são possíveis mas fogem do escopo do sistema"
    ],
    applicableTo: ["qualquer"],
    allowsAppeal: false,
  },

  // ══════════════════════════════════════════════════════════
  // SEÇÃO 6 — PROCESSOS PUNITIVOS
  // ══════════════════════════════════════════════════════════

  "enviar_defesa": {
    code: "enviar_defesa",
    name: "Enviar Defesa (Processo Punitivo)",
    manualSection: "6.2",
    category: "punitivo",
    riskLevel: "critical",
    requiresAdminApproval: true,
    deadline: "none", // Prazo definido no auto de infração
    requiredFields: ["processo_punitivo_id", "defesa_texto", "documentos_prova"],
    optionalFields: ["advogado_oab", "testemunhas"],
    requiresGRU: false,
    description: "Defesa administrativa em processo punitivo iniciado pela PF. Prazo definido no auto de infração.",
    alerts: [
      "CRÍTICO: Não perder prazo de defesa — após prazo, empresa perde direito à defesa",
      "Defesa sem documentação probatória tem baixa chance de êxito",
      "Captador deve monitorar processos punitivos no GESP daily"
    ],
    applicableTo: ["qualquer"],
    allowsAppeal: true,
  },

  "gerar_gru_multa": {
    code: "gerar_gru_multa",
    name: "Gerar GRU / Declarar Pagamento de Multa",
    manualSection: "6.5",
    category: "punitivo",
    riskLevel: "critical",
    requiresAdminApproval: true,
    deadline: "none",
    requiredFields: ["processo_punitivo_id", "valor_multa", "data_pagamento"],
    optionalFields: ["comprovante_pagamento"],
    requiresGRU: true,
    description: "Geração de GRU para pagamento de multa e declaração de pagamento após quitação.",
    alerts: [
      "Multa não paga pode resultar em inscrição na dívida ativa",
      "Após pagamento: declarar comprovante no sistema dentro do prazo"
    ],
    applicableTo: ["qualquer"],
    allowsAppeal: false,
  },

  "restituicao_multa": {
    code: "restituicao_multa",
    name: "Restituição de Multa",
    manualSection: "6.6",
    category: "punitivo",
    riskLevel: "high",
    requiresAdminApproval: true,
    deadline: "none",
    requiredFields: ["processo_punitivo_id", "comprovante_pagamento", "motivo_restituicao"],
    optionalFields: ["dados_bancarios_restituicao"],
    requiresGRU: false,
    description: "Solicitação de devolução de multa paga indevidamente ou após recurso bem-sucedido.",
    alerts: ["Somente após recurso provido ou pagamento a maior"],
    applicableTo: ["qualquer"],
    allowsAppeal: false,
  },

  // ══════════════════════════════════════════════════════════
  // SEÇÃO 7 — TURMAS
  // ══════════════════════════════════════════════════════════

  "cadastrar_turma": {
    code: "cadastrar_turma",
    name: "Cadastrar Turma de Vigilantes",
    manualSection: "7.2",
    category: "turma",
    riskLevel: "medium",
    requiresAdminApproval: true,
    deadline: "none",
    requiredFields: [
      "cnpj", "tipo_curso", "data_inicio_prevista", "data_conclusao_prevista",
      "local_realizacao", "instrutor_credenciado", "lista_alunos_cpf"
    ],
    optionalFields: ["carga_horaria", "observacoes"],
    requiresGRU: true,
    description: "Cadastro de turma de formação de vigilantes. Requer instrutor devidamente credenciado no GESP.",
    alerts: [
      "Instrutor DEVE ter credenciamento ativo no GESP (processo 11.2)",
      "Comunicar início antes do início efetivo das aulas (processo 'comunicar_inicio_turma')",
      "Comunicar conclusão após término (processo 'comunicar_conclusao_turma')"
    ],
    applicableTo: ["curso_formacao"],
    allowsAppeal: false,
  },

  "comunicar_inicio_turma": {
    code: "comunicar_inicio_turma",
    name: "Comunicar Início de Turma",
    manualSection: "7.3",
    category: "turma",
    riskLevel: "medium",
    requiresAdminApproval: true,
    deadline: "none",
    requiredFields: ["turma_id", "data_inicio_real", "lista_alunos_presentes"],
    optionalFields: ["observacoes"],
    requiresGRU: false,
    description: "Comunicação formal do início das aulas de uma turma já cadastrada.",
    alerts: ["Deve ser comunicado ANTES do início efetivo das aulas"],
    applicableTo: ["curso_formacao"],
    allowsAppeal: false,
  },

  "comunicar_conclusao_turma": {
    code: "comunicar_conclusao_turma",
    name: "Comunicar Conclusão / Cancelamento de Turma",
    manualSection: "7.4",
    category: "turma",
    riskLevel: "medium",
    requiresAdminApproval: true,
    deadline: "none",
    requiredFields: ["turma_id", "data_conclusao", "resultado_alunos", "tipo_comunicacao"],
    optionalFields: ["motivo_cancelamento", "documentos_conclusao"],
    requiresGRU: false,
    description: "Comunicação de conclusão bem-sucedida ou cancelamento de turma.",
    alerts: ["Alunos aprovados poderão solicitar CNV após conclusão registrada"],
    applicableTo: ["curso_formacao"],
    allowsAppeal: false,
  },

  // ══════════════════════════════════════════════════════════
  // SEÇÃO 8 — GUIA DE TRANSPORTE
  // ══════════════════════════════════════════════════════════

  "guia_transporte": {
    code: "guia_transporte",
    name: "Solicitar Guia de Transporte de Armas",
    manualSection: "8.2",
    category: "transporte",
    riskLevel: "critical",
    requiresAdminApproval: true,
    deadline: "none",
    requiredFields: [
      "cnpj", "arma_id", "origem_local", "destino_local",
      "data_transporte", "responsavel_transporte", "contrato_vinculado"
    ],
    optionalFields: ["veiculo_transporte", "escolta"],
    requiresGRU: true,
    description: "Guia obrigatória para transporte legal de armas entre locais. Só pode ser emitida para postos vinculados ao contrato de aquisição das armas.",
    alerts: [
      "CRÍTICO: Transporte de arma sem Guia válida é crime",
      "Apenas para postos vinculados ao contrato da arma",
      "Guia tem validade — não usar fora do prazo"
    ],
    applicableTo: ["empresa_seguranca"],
    allowsAppeal: true,
  },

  "guia_transporte_transferencia_cnpj": {
    code: "guia_transporte_transferencia_cnpj",
    name: "Solicitar Guia de Transporte com Transferência de CNPJ",
    manualSection: "8.3",
    category: "transporte",
    riskLevel: "critical",
    requiresAdminApproval: true,
    deadline: "none",
    requiredFields: [
      "cnpj_origem", "cnpj_destino", "arma_id", "data_transporte",
      "justificativa_transferencia"
    ],
    optionalFields: ["documentos_transferencia"],
    requiresGRU: true,
    description: "Transferência de armas/munições entre unidades da mesma empresa com CNPJs diferentes.",
    alerts: [
      "CRÍTICO: Altera o CNPJ responsável pela arma",
      "Somente entre unidades da MESMA empresa (mesma raiz CNPJ)"
    ],
    applicableTo: ["empresa_seguranca"],
    allowsAppeal: true,
  },

  // ══════════════════════════════════════════════════════════
  // SEÇÃO 9 — COMUNICAÇÃO DE OCORRÊNCIA
  // ══════════════════════════════════════════════════════════

  "comunicar_ocorrencia": {
    code: "comunicar_ocorrencia",
    name: "Comunicar Ocorrência",
    manualSection: "9.2",
    category: "ocorrencia",
    riskLevel: "critical",
    requiresAdminApproval: true,
    deadline: "24h", // ← PRAZO MÁXIMO: 24 horas após o fato!
    requiredFields: [
      "cnpj", "tipo_ocorrencia", "data_hora_ocorrencia", "local_ocorrencia",
      "descricao_ocorrencia", "vigilantes_envolvidos"
    ],
    optionalFields: ["armas_envolvidas", "veiculos_envolvidos", "testemunhas"],
    requiresGRU: false,
    description: "Comunicação obrigatória à PF de ocorrências envolvendo a empresa. PRAZO MÁXIMO: 24 horas após o fato.",
    alerts: [
      "⚠️ URGÊNCIA MÁXIMA: Prazo de 24 HORAS após o fato",
      "Não comunicar dentro do prazo é infração administrativa grave",
      "Após comunicar, complementar com BO e apurações internas (processo 'complementar_ocorrencia')",
      "Tipos: uso de arma, acidente, furto/roubo de arma, morte, lesão corporal, etc."
    ],
    applicableTo: ["empresa_seguranca", "empresa_organica"],
    allowsAppeal: false,
  },

  "complementar_ocorrencia": {
    code: "complementar_ocorrencia",
    name: "Enviar Complementação de Ocorrência",
    manualSection: "9.3",
    category: "ocorrencia",
    riskLevel: "high",
    requiresAdminApproval: true,
    deadline: "none",
    requiredFields: [
      "ocorrencia_id", "boletim_ocorrencia", "relatorio_apuracao_interna"
    ],
    optionalFields: ["fotos", "documentos_adicionais", "laudo_pericial"],
    requiresGRU: false,
    description: "Complementação obrigatória após comunicação de ocorrência, com Boletim de Ocorrência e relatório de apuração interna.",
    alerts: [
      "Obrigatória após comunicação inicial",
      "Incluir BO (Boletim de Ocorrência) policial quando aplicável"
    ],
    applicableTo: ["empresa_seguranca", "empresa_organica"],
    allowsAppeal: false,
  },

  // ══════════════════════════════════════════════════════════
  // SEÇÃO 10 — COMUNICAÇÃO DE EVENTO
  // ══════════════════════════════════════════════════════════

  "comunicar_evento": {
    code: "comunicar_evento",
    name: "Comunicar Evento",
    manualSection: "10.2",
    category: "evento",
    riskLevel: "medium",
    requiresAdminApproval: true,
    deadline: "none",
    requiredFields: [
      "cnpj", "tipo_evento", "data_hora_evento", "local_evento",
      "descricao_evento", "numero_vigilantes"
    ],
    optionalFields: ["cliente_evento", "armas_utilizadas", "documentos_evento"],
    requiresGRU: false,
    description: "Comunicação prévia de eventos de segurança privada à PF. Necessária para eventos com grande efetivo.",
    alerts: [
      "Comunicar ANTES do evento",
      "Eventos com armas requerem atenção especial"
    ],
    applicableTo: ["empresa_seguranca"],
    allowsAppeal: false,
  },

  // ══════════════════════════════════════════════════════════
  // SEÇÃO 11 — CREDENCIAMENTO DE INSTRUTORES
  // ══════════════════════════════════════════════════════════

  "credenciamento_instrutor": {
    code: "credenciamento_instrutor",
    name: "Solicitar Credenciamento de Instrutor",
    manualSection: "11.2",
    category: "instrutor",
    riskLevel: "medium",
    requiresAdminApproval: true,
    deadline: "none",
    requiredFields: [
      "cpf_instrutor", "nome_instrutor", "especialidade", "formacao_academica",
      "certificados_habilitacao", "certidao_antecedentes"
    ],
    optionalFields: ["experiencia_profissional", "referencias"],
    requiresGRU: true,
    description: "Credenciamento de instrutores para ministrar cursos de formação de vigilantes.",
    alerts: [
      "Instrutor sem credenciamento ATIVO não pode ministrar aulas",
      "Credenciamento tem validade — renovar antes do vencimento",
      "Vinculado ao CNPJ do curso de formação"
    ],
    applicableTo: ["curso_formacao"],
    allowsAppeal: true,
  },

  // ══════════════════════════════════════════════════════════
  // SEÇÃO 13 — CNV
  // ══════════════════════════════════════════════════════════

  "solicitar_cnv": {
    code: "solicitar_cnv",
    name: "Solicitar Carteira Nacional de Vigilante (CNV)",
    manualSection: "13.1",
    category: "cnv",
    riskLevel: "medium",
    requiresAdminApproval: true,
    deadline: "none",
    requiredFields: ["cpf_vigilante", "gru_taxa_emissao"],
    optionalFields: [],
    requiresGRU: true,
    description: "Geração da CNV (Carteira Nacional de Vigilante) para vigilante habilitado. Requer GRU de taxa de emissão. Gera PDF para impressão.",
    alerts: [
      "Vigilante DEVE ter concluído curso de formação cadastrado no GESP",
      "CNV com validade vencida = vigilante trabalhando ilegalmente",
      "Monitorar CNVs vencidas no Quadro de Avisos do GESP"
    ],
    applicableTo: ["empresa_seguranca", "curso_formacao"],
    allowsAppeal: false,
  },

  // ══════════════════════════════════════════════════════════
  // SEÇÃO 14 — IMPORTAÇÃO
  // ══════════════════════════════════════════════════════════

  "importar_pessoas": {
    code: "importar_pessoas",
    name: "Importar Pessoas (Vigilantes em Lote)",
    manualSection: "14.2",
    category: "importacao",
    riskLevel: "medium",
    requiresAdminApproval: true,
    deadline: "none",
    requiredFields: ["cnpj", "arquivo_importacao_csv", "formato_modelo_gesp"],
    optionalFields: [],
    requiresGRU: false,
    description: "Importação em lote de vigilantes e/ou veículos via arquivo no modelo GESP. Útil para onboarding de grandes equipes.",
    alerts: [
      "Arquivo DEVE seguir modelo exato do GESP (seção 14.1 do manual)",
      "Validar dados antes de importar — erros podem corromper cadastro"
    ],
    applicableTo: ["empresa_seguranca", "empresa_organica"],
    allowsAppeal: false,
  },

  "importar_veiculos": {
    code: "importar_veiculos",
    name: "Importar Veículos em Lote",
    manualSection: "14.2",
    category: "importacao",
    riskLevel: "medium",
    requiresAdminApproval: true,
    deadline: "none",
    requiredFields: ["cnpj", "arquivo_importacao_csv", "formato_modelo_gesp"],
    optionalFields: [],
    requiresGRU: false,
    description: "Importação em lote de veículos da frota via arquivo no modelo GESP.",
    alerts: ["Arquivo DEVE seguir modelo exato do GESP (seção 14.1)"],
    applicableTo: ["empresa_seguranca"],
    allowsAppeal: false,
  },

  // ══════════════════════════════════════════════════════════
  // SEÇÃO 18 — PROCESSO BANCÁRIO
  // ══════════════════════════════════════════════════════════

  "plano_seguranca_nova_agencia": {
    code: "plano_seguranca_nova_agencia",
    name: "Solicitar Plano de Segurança Nova Agência/PAB",
    manualSection: "18.3",
    category: "bancario",
    riskLevel: "high",
    requiresAdminApproval: true,
    deadline: "pre_open", // Mínimo 60 dias antes da abertura
    requiredFields: [
      "cnpj_instituicao", "cnpj_agencia", "endereco_agencia", "tipo_agencia",
      "plano_seguranca_pdf", "elementos_seguranca"
    ],
    optionalFields: ["plantas_baixa", "documentos_adicionais"],
    requiresGRU: true,
    description: "Plano de segurança para nova agência bancária ou PAB. Prazo mínimo de 60 dias antes da abertura.",
    alerts: [
      "PRAZO CRÍTICO: Mínimo 60 DIAS antes da abertura da agência",
      "Abrir agência sem plano aprovado é ilegal",
      "Processo de Endereço Novo segue mesma regra"
    ],
    applicableTo: ["instituicao_financeira"],
    allowsAppeal: true,
  },

  "renovacao_plano_seguranca": {
    code: "renovacao_plano_seguranca",
    name: "Solicitar Renovação de Plano de Segurança (sem alteração ou com aumento)",
    manualSection: "18.4",
    category: "bancario",
    riskLevel: "medium",
    requiresAdminApproval: true,
    deadline: "none",
    requiredFields: ["cnpj_agencia", "plano_atual_id"],
    optionalFields: ["novos_elementos_seguranca"],
    requiresGRU: false,
    description: "Renovação de plano de segurança sem redução de elementos. Deferimento AUTOMÁTICO via sistema GESP — não requer análise da PF.",
    alerts: [
      "AUTOMÁTICO: deferimento via sistema sem análise da PF",
      "Somente quando NÃO há redução de elementos de segurança"
    ],
    applicableTo: ["instituicao_financeira"],
    allowsAppeal: false,
  },

  "renovacao_plano_com_reducao": {
    code: "renovacao_plano_com_reducao",
    name: "Solicitar Renovação de Plano de Segurança com Redução ou Alteração",
    manualSection: "18.5",
    category: "bancario",
    riskLevel: "high",
    requiresAdminApproval: true,
    deadline: "none",
    requiredFields: [
      "cnpj_agencia", "plano_atual_id", "justificativa_reducao",
      "novos_elementos_seguranca"
    ],
    optionalFields: ["documentos_suporte"],
    requiresGRU: true,
    description: "Renovação com redução ou alteração nos elementos de segurança. Requer análise da PF.",
    alerts: ["Requer análise e aprovação da PF — não é automático"],
    applicableTo: ["instituicao_financeira"],
    allowsAppeal: true,
  },

  "plano_emergencial": {
    code: "plano_emergencial",
    name: "Solicitar Plano Emergencial",
    manualSection: "18.6",
    category: "bancario",
    riskLevel: "critical",
    requiresAdminApproval: true,
    deadline: "none",
    requiredFields: ["cnpj_agencia", "motivo_emergencia", "plano_emergencial_pdf"],
    optionalFields: [],
    requiresGRU: false,
    description: "Plano de segurança emergencial para situações urgentes.",
    alerts: ["Uso em situações excepcionais — justificativa obrigatória"],
    applicableTo: ["instituicao_financeira"],
    allowsAppeal: false,
  },

  // ══════════════════════════════════════════════════════════
  // CONSULTAS (READONLY — sem aprovação necessária)
  // ══════════════════════════════════════════════════════════

  "acompanhar_processos": {
    code: "acompanhar_processos",
    name: "Acompanhar Processos (Consulta)",
    manualSection: "5.1",
    category: "consulta",
    riskLevel: "readonly",
    requiresAdminApproval: false,
    deadline: "none",
    requiredFields: ["cnpj"],
    optionalFields: ["numero_processo", "tipo_processo", "status"],
    requiresGRU: false,
    description: "Consulta de status de todos os processos da empresa. Inclui visualização de pareceres, certificados e histórico de termos de ciência.",
    alerts: [],
    applicableTo: ["qualquer"],
    allowsAppeal: false,
  },

  "quadro_avisos": {
    code: "quadro_avisos",
    name: "Consultar Quadro de Avisos (Monitoring)",
    manualSection: "2.9",
    category: "consulta",
    riskLevel: "readonly",
    requiresAdminApproval: false,
    deadline: "none",
    requiredFields: ["cnpj"],
    optionalFields: [],
    requiresGRU: false,
    description: "Verifica alertas ativos no dashboard do GESP: vigilantes sem CNV ou com CNV vencida, armas, coletes vencidos. Executado pelo Captador em cada ciclo para detectar pendências.",
    alerts: [
      "Fonte primária de detecção de urgências: CNV vencida, coletes vencidos, notificações PF",
      "Deve ser verificado diariamente pelo Captador"
    ],
    applicableTo: ["qualquer"],
    allowsAppeal: false,
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Retorna o processo pelo código, ou null se não mapeado.
 * Se null, a ação deve ser BLOQUEADA e escalada para revisão humana.
 */
export function getGespProcess(code: string): GespProcess | null {
  return GESP_PROCESSES[code] ?? null
}

/**
 * Verifica se um processo exige aprovação do admin antes de executar.
 */
export function requiresAdminApproval(processCode: string): boolean {
  const process = getGespProcess(processCode)
  if (!process) return true // Processo desconhecido → sempre exige aprovação
  return process.requiresAdminApproval
}

/**
 * Retorna todos os processos de uma categoria.
 */
export function getProcessesByCategory(category: GespProcessCategory): GespProcess[] {
  return Object.values(GESP_PROCESSES).filter(p => p.category === category)
}

/**
 * Retorna todos os processos críticos que exigem monitoramento de prazo.
 */
export function getDeadlineSensitiveProcesses(): GespProcess[] {
  return Object.values(GESP_PROCESSES).filter(
    p => p.deadline !== "none" && p.deadline !== undefined
  )
}

/**
 * Retorna todos os campos obrigatórios para um processo.
 * Útil para o Cognitive Engine montar o payload correto.
 */
export function getRequiredFields(processCode: string): string[] {
  return GESP_PROCESSES[processCode]?.requiredFields ?? []
}

/**
 * Lista de todos os processos conhecidos.
 */
export const ALL_GESP_PROCESS_CODES = Object.keys(GESP_PROCESSES)

/**
 * Processos com deadline de 24h — requerem detecção e execução IMEDIATA.
 */
export const URGENT_24H_PROCESSES = Object.values(GESP_PROCESSES)
  .filter(p => p.deadline === "24h")
  .map(p => p.code)

/**
 * Processos readonly — não precisam de aprovação admin.
 */
export const READONLY_PROCESSES = Object.values(GESP_PROCESSES)
  .filter(p => p.riskLevel === "readonly")
  .map(p => p.code)

/**
 * Contexto do manual GESP para passar ao Cognitive Engine como referência.
 * Usado em prompt caching para economizar tokens.
 */
export const GESP_MANUAL_CONTEXT = `
GESP EMPRESA — Manual de Operação v15.0 (Sistema v21.0, Março 2019)
Polícia Federal — DELESP/CGCSP

CATEGORIAS DE PROCESSOS:
1. Processos Autorizativos (Seção 5): Autorização funcionamento, armas, atividades, coletes, veículos, atos
2. Processos Punitivos (Seção 6): Defesas, recursos, multas, restituições
3. Turmas (Seção 7): Cursos de formação de vigilantes — cadastrar, comunicar início/conclusão
4. Guia de Transporte (Seção 8): Transporte legal de armas — crítico, qualquer transporte sem guia é crime
5. Comunicação de Ocorrência (Seção 9): PRAZO 24H após fato — obrigatório comunicar PF
6. Comunicação de Evento (Seção 10): Comunicar eventos de segurança previamente
7. Credenciamento de Instrutores (Seção 11): Instrutores de cursos de formação
8. CNV — Carteira Nacional de Vigilantes (Seção 13): Emissão e impressão de CNV
9. Importação (Seção 14): Importação em lote de pessoas/veículos
10. Processo Bancário (Seção 18): Planos de segurança para instituições financeiras

REGRAS CRÍTICAS:
- Certificado Digital (e-CNPJ ou e-CPF) obrigatório para QUALQUER acesso
- Certificado tipo A1 (software) ou A3 (token/smartcard)
- Prazo de Comunicação de Ocorrência: 24 HORAS após o fato
- Plano de Segurança Bancária: 60 DIAS antes da abertura da agência
- Revisão de Autorização: ANUAL — empresa com alvará vencido opera ilegalmente
- CNV vencida = vigilante trabalhando ilegalmente
- Colete vencido = infração administrativa
- Transporte de arma sem Guia válida = crime

QUADRO DE AVISOS (Home do GESP):
- Vigilantes sem CNV ou com CNV vencida
- Armas com irregularidades
- Coletes vencidos
- Notificações pendentes da PF
Deve ser verificado DIARIAMENTE pelo sistema de monitoring.
`
