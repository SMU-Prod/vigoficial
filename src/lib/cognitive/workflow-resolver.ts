/**
 * VIGI CognitiveEngine — Workflow Resolver
 *
 * Mapeia tipo_demanda → cadeia de ações conforme PRD Seção 9.
 * Cada tipo de demanda tem uma sequência específica de passos,
 * templates, e regras que se aplicam.
 */

import {
  TipoDemanda,
  WorkflowAction,
  WorkflowDefinition,
} from "./types";

export class WorkflowResolver {
  /**
   * Resolve o workflow completo para um tipo de demanda.
   * Retorna ações ordenadas e regras aplicáveis.
   */
  resolve(
    tipoDemanda: TipoDemanda,
    extractedData: Record<string, unknown>,
    urgente: boolean,
    companyId?: string
  ): { actions: WorkflowAction[]; rules: string[] } {
    const definition = WORKFLOW_DEFINITIONS[tipoDemanda];
    if (!definition) {
      return this.resolveUnknown(extractedData, companyId);
    }

    const actions: WorkflowAction[] = [];
    const rules = new Set<string>(definition.rules);
    let prevActionId: string | undefined;

    // Sempre R2: salvar email antes de processar
    rules.add("R2");

    // Sempre R8: Template B após ação
    rules.add("R8");

    // R10: urgente → prioridade máxima
    if (urgente) {
      rules.add("R10");
    }

    // R3: gating de billing
    rules.add("R3");

    for (const step of definition.steps) {
      const actionId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      // Verificar se tem dados suficientes para o passo
      const missingFields = step.requiredFields.filter(
        (f) => !extractedData[f] && extractedData[f] !== 0
      );
      const canProceed = missingFields.length === 0 || step.allowPartialData;

      const action: WorkflowAction = {
        id: actionId,
        type: step.actionType,
        description: step.description,
        targetAgent: step.targetAgent,
        priority: urgente ? 1 : 5,
        payload: {
          tipoDemanda,
          companyId,
          ...extractedData,
          missingFields: missingFields.length > 0 ? missingFields : undefined,
        },
        dependsOn: prevActionId ? [prevActionId] : [],
        template: step.template,
        prdRule: definition.prdSection,
        status: canProceed ? "pending" : "pending",
      };

      actions.push(action);
      prevActionId = actionId;
    }

    // Se gera ofício → adicionar R11 e R12
    if (definition.generatesOficio) {
      rules.add("R11");
      rules.add("R12");
    }

    // Ação final: Template B de confirmação (R8)
    actions.push({
      id: `act_${Date.now()}_confirm`,
      type: "send_email_client",
      description: "Enviar Template B — confirmação de ação executada (R8)",
      targetAgent: "comunicador",
      priority: urgente ? 2 : 8,
      payload: {
        templateId: "CONFIRMATION",
        companyId,
        tipoDemanda,
        dadosResumo: extractedData,
      },
      dependsOn: prevActionId ? [prevActionId] : [],
      template: "B",
      prdRule: "R8",
      status: "pending",
    });

    return { actions, rules: Array.from(rules).sort() };
  }

  /**
   * Workflow para caso_desconhecido — escalar para humano (R7).
   */
  private resolveUnknown(
    extractedData: Record<string, unknown>,
    companyId?: string
  ): { actions: WorkflowAction[]; rules: string[] } {
    return {
      actions: [
        {
          id: `act_${Date.now()}_escalate`,
          type: "escalate_human",
          description: "Escalar para equipe humana — demanda não reconhecida (R7)",
          targetAgent: "comunicador",
          priority: 3,
          payload: {
            templateId: "UNKNOWN_CASE",
            companyId,
            extractedData,
            recipient: "equipe@vigi.com.br",
          },
          dependsOn: [],
          template: "E",
          prdRule: "R7",
          status: "pending",
        },
      ],
      rules: ["R2", "R3", "R7"],
    };
  }

  /**
   * Retorna a definição de um workflow.
   */
  getDefinition(tipoDemanda: TipoDemanda): WorkflowDefinition | undefined {
    return WORKFLOW_DEFINITIONS[tipoDemanda];
  }

  /**
   * Lista todos os workflows disponíveis.
   */
  listWorkflows(): WorkflowDefinition[] {
    return Object.values(WORKFLOW_DEFINITIONS);
  }
}

// ─── Workflow Definitions (PRD Seção 9) ──────────────────────────

const WORKFLOW_DEFINITIONS: Record<TipoDemanda, WorkflowDefinition> = {
  novo_vigilante: {
    tipoDemanda: "novo_vigilante",
    name: "Cadastro de Novo Vigilante",
    description: "Cadastrar vigilante no GESP, atualizar banco, confirmar cliente",
    prdSection: "9.1",
    steps: [
      {
        name: "extract_vigilante_data",
        actionType: "extract_data",
        targetAgent: "captador",
        description: "Extrair dados completos do vigilante do email/documentos",
        requiredFields: ["nome_completo", "cpf"],
        allowPartialData: false,
      },
      {
        name: "check_billing",
        actionType: "compliance_check",
        targetAgent: "operacional",
        description: "Verificar status de billing da empresa (R3)",
        requiredFields: [],
        allowPartialData: true,
      },
      {
        name: "gesp_cadastro",
        actionType: "gesp_action",
        targetAgent: "operacional",
        description: "Cadastrar vigilante no portal GESP (R4: batch max 999, R5: lock)",
        requiredFields: ["nome_completo", "cpf", "data_nascimento"],
        allowPartialData: false,
      },
      {
        name: "update_database",
        actionType: "update_database",
        targetAgent: "operacional",
        description: "Registrar vigilante no banco de dados VIG PRO",
        requiredFields: ["nome_completo", "cpf"],
        allowPartialData: true,
      },
    ],
    templates: ["B"],
    rules: ["R1", "R3", "R4", "R5", "R8"],
    requiresGesp: true,
    generatesOficio: false,
  },

  novo_posto: {
    tipoDemanda: "novo_posto",
    name: "Abertura de Novo Posto",
    description: "Criar processo, gerar OF-A para DELESP, confirmar cliente",
    prdSection: "9.2",
    steps: [
      {
        name: "extract_posto_data",
        actionType: "extract_data",
        targetAgent: "captador",
        description: "Extrair dados do posto de serviço",
        requiredFields: ["nome", "endereco", "cidade", "uf"],
        allowPartialData: false,
      },
      {
        name: "check_billing",
        actionType: "compliance_check",
        targetAgent: "operacional",
        description: "Verificar billing (R3)",
        requiredFields: [],
        allowPartialData: true,
      },
      {
        name: "create_process",
        actionType: "create_process",
        targetAgent: "operacional",
        description: "Criar processo de abertura de posto no VIG PRO",
        requiredFields: ["nome", "endereco"],
        allowPartialData: true,
      },
      {
        name: "generate_oficio",
        actionType: "send_oficio_pf",
        targetAgent: "comunicador",
        description: "Gerar OF-A para DELESP do estado do posto (R12)",
        requiredFields: ["nome", "endereco", "cidade", "uf"],
        allowPartialData: false,
        template: "OF-A",
      },
    ],
    templates: ["B", "OF-A"],
    rules: ["R3", "R8", "R11", "R12"],
    requiresGesp: false,
    generatesOficio: true,
  },

  compra_arma: {
    tipoDemanda: "compra_arma",
    name: "Compra de Arma de Fogo",
    description: "Registrar aquisição, gerar OF-B para DELESP, confirmar cliente",
    prdSection: "9.3",
    steps: [
      {
        name: "extract_arma_data",
        actionType: "extract_data",
        targetAgent: "captador",
        description: "Extrair dados da transação de arma",
        requiredFields: ["numero_serie", "tipo"],
        allowPartialData: false,
      },
      {
        name: "check_billing",
        actionType: "compliance_check",
        targetAgent: "operacional",
        description: "Verificar billing (R3)",
        requiredFields: [],
        allowPartialData: true,
      },
      {
        name: "register_weapon",
        actionType: "update_database",
        targetAgent: "operacional",
        description: "Registrar arma no banco VIG PRO",
        requiredFields: ["numero_serie"],
        allowPartialData: true,
      },
      {
        name: "generate_oficio",
        actionType: "send_oficio_pf",
        targetAgent: "comunicador",
        description: "Gerar OF-B para DELESP (R12)",
        requiredFields: ["numero_serie", "tipo"],
        allowPartialData: false,
        template: "OF-B",
      },
    ],
    templates: ["B", "OF-B"],
    rules: ["R3", "R8", "R11", "R12"],
    requiresGesp: false,
    generatesOficio: true,
  },

  venda_arma: {
    tipoDemanda: "venda_arma",
    name: "Venda de Arma de Fogo",
    description: "Registrar saída, gerar OF-B para DELESP, confirmar cliente",
    prdSection: "9.4",
    steps: [
      {
        name: "extract_venda_data",
        actionType: "extract_data",
        targetAgent: "captador",
        description: "Extrair dados da venda de arma",
        requiredFields: ["numero_serie"],
        allowPartialData: false,
      },
      {
        name: "check_billing",
        actionType: "compliance_check",
        targetAgent: "operacional",
        description: "Verificar billing (R3)",
        requiredFields: [],
        allowPartialData: true,
      },
      {
        name: "update_weapon_status",
        actionType: "update_database",
        targetAgent: "operacional",
        description: "Atualizar status da arma para vendida",
        requiredFields: ["numero_serie"],
        allowPartialData: true,
      },
      {
        name: "generate_oficio",
        actionType: "send_oficio_pf",
        targetAgent: "comunicador",
        description: "Gerar OF-B para DELESP (R12)",
        requiredFields: ["numero_serie"],
        allowPartialData: false,
        template: "OF-B",
      },
    ],
    templates: ["B", "OF-B"],
    rules: ["R3", "R8", "R11", "R12"],
    requiresGesp: false,
    generatesOficio: true,
  },

  transporte_equipamento: {
    tipoDemanda: "transporte_equipamento",
    name: "Transporte de Armas/Equipamentos",
    description: "Gerar OF-C para DELESP, confirmar cliente",
    prdSection: "9.5",
    steps: [
      {
        name: "extract_transporte_data",
        actionType: "extract_data",
        targetAgent: "captador",
        description: "Extrair dados do transporte (itens, origem, destino)",
        requiredFields: ["itens", "origem", "destino"],
        allowPartialData: false,
      },
      {
        name: "check_billing",
        actionType: "compliance_check",
        targetAgent: "operacional",
        description: "Verificar billing (R3)",
        requiredFields: [],
        allowPartialData: true,
      },
      {
        name: "generate_oficio",
        actionType: "send_oficio_pf",
        targetAgent: "comunicador",
        description: "Gerar OF-C para DELESP de origem e destino (R12)",
        requiredFields: ["itens", "origem", "destino"],
        allowPartialData: false,
        template: "OF-C",
      },
    ],
    templates: ["B", "OF-C"],
    rules: ["R3", "R8", "R11", "R12"],
    requiresGesp: false,
    generatesOficio: true,
  },

  encerramento_posto: {
    tipoDemanda: "encerramento_posto",
    name: "Encerramento de Posto",
    description: "Gerar OF-E para DELESP, realocar vigilantes, confirmar cliente",
    prdSection: "9.6",
    steps: [
      {
        name: "extract_encerramento_data",
        actionType: "extract_data",
        targetAgent: "captador",
        description: "Extrair dados do encerramento",
        requiredFields: ["nome_posto"],
        allowPartialData: false,
      },
      {
        name: "check_billing",
        actionType: "compliance_check",
        targetAgent: "operacional",
        description: "Verificar billing (R3)",
        requiredFields: [],
        allowPartialData: true,
      },
      {
        name: "process_closure",
        actionType: "create_process",
        targetAgent: "operacional",
        description: "Processar encerramento e realocar vigilantes",
        requiredFields: ["nome_posto"],
        allowPartialData: true,
      },
      {
        name: "generate_oficio",
        actionType: "send_oficio_pf",
        targetAgent: "comunicador",
        description: "Gerar OF-E para DELESP (R12)",
        requiredFields: ["nome_posto"],
        allowPartialData: false,
        template: "OF-E",
      },
    ],
    templates: ["B", "OF-E"],
    rules: ["R3", "R8", "R11", "R12"],
    requiresGesp: false,
    generatesOficio: true,
  },

  transferencia_posto: {
    tipoDemanda: "transferencia_posto",
    name: "Transferência de Vigilante entre Postos",
    description: "Atualizar GESP e banco, confirmar cliente",
    prdSection: "9.7",
    steps: [
      {
        name: "extract_transferencia_data",
        actionType: "extract_data",
        targetAgent: "captador",
        description: "Extrair dados da transferência",
        requiredFields: ["nome_vigilante", "posto_destino"],
        allowPartialData: false,
      },
      {
        name: "check_billing",
        actionType: "compliance_check",
        targetAgent: "operacional",
        description: "Verificar billing (R3)",
        requiredFields: [],
        allowPartialData: true,
      },
      {
        name: "gesp_transfer",
        actionType: "gesp_action",
        targetAgent: "operacional",
        description: "Atualizar transferência no GESP (R5: lock)",
        requiredFields: ["nome_vigilante"],
        allowPartialData: false,
      },
      {
        name: "update_database",
        actionType: "update_database",
        targetAgent: "operacional",
        description: "Atualizar banco de dados",
        requiredFields: ["nome_vigilante"],
        allowPartialData: true,
      },
    ],
    templates: ["B"],
    rules: ["R3", "R5", "R8"],
    requiresGesp: true,
    generatesOficio: false,
  },

  renovacao_cnv: {
    tipoDemanda: "renovacao_cnv",
    name: "Renovação de CNV",
    description: "Verificar DOU, gerenciar alertas cascade, confirmar cliente",
    prdSection: "9.8",
    steps: [
      {
        name: "extract_cnv_data",
        actionType: "extract_data",
        targetAgent: "captador",
        description: "Extrair dados da renovação CNV",
        requiredFields: ["nome_vigilante"],
        allowPartialData: true,
      },
      {
        name: "check_dou",
        actionType: "compliance_check",
        targetAgent: "captador",
        description: "Verificar se CNV já foi publicada no DOU (R9: parar alertas se sim)",
        requiredFields: [],
        allowPartialData: true,
      },
      {
        name: "generate_alerts",
        actionType: "generate_alert",
        targetAgent: "comunicador",
        description: "Configurar cascade de alertas: 90/60/30/15/5 dias (Templates C/F)",
        requiredFields: [],
        allowPartialData: true,
      },
    ],
    templates: ["B", "C", "F"],
    rules: ["R3", "R8", "R9"],
    requiresGesp: false,
    generatesOficio: false,
  },

  compra_colete: {
    tipoDemanda: "compra_colete",
    name: "Compra de Colete Balístico",
    description: "Registrar aquisição no banco, confirmar cliente",
    prdSection: "9.9",
    steps: [
      {
        name: "extract_colete_data",
        actionType: "extract_data",
        targetAgent: "captador",
        description: "Extrair dados do colete",
        requiredFields: ["quantidade"],
        allowPartialData: true,
      },
      {
        name: "check_billing",
        actionType: "compliance_check",
        targetAgent: "operacional",
        description: "Verificar billing (R3)",
        requiredFields: [],
        allowPartialData: true,
      },
      {
        name: "register_vest",
        actionType: "update_database",
        targetAgent: "operacional",
        description: "Registrar colete(s) no banco VIG PRO",
        requiredFields: [],
        allowPartialData: true,
      },
    ],
    templates: ["B"],
    rules: ["R3", "R8"],
    requiresGesp: false,
    generatesOficio: false,
  },

  baixa_colete: {
    tipoDemanda: "baixa_colete",
    name: "Baixa de Colete Balístico",
    description: "Registrar baixa, confirmar cliente",
    prdSection: "9.10",
    steps: [
      {
        name: "extract_baixa_data",
        actionType: "extract_data",
        targetAgent: "captador",
        description: "Extrair dados da baixa",
        requiredFields: ["numero_serie"],
        allowPartialData: false,
      },
      {
        name: "check_billing",
        actionType: "compliance_check",
        targetAgent: "operacional",
        description: "Verificar billing (R3)",
        requiredFields: [],
        allowPartialData: true,
      },
      {
        name: "deactivate_vest",
        actionType: "update_database",
        targetAgent: "operacional",
        description: "Marcar colete como baixado",
        requiredFields: ["numero_serie"],
        allowPartialData: false,
      },
    ],
    templates: ["B"],
    rules: ["R3", "R8"],
    requiresGesp: false,
    generatesOficio: false,
  },

  correcao_dados: {
    tipoDemanda: "correcao_dados",
    name: "Correção de Dados Cadastrais",
    description: "Verificar divergência GESP vs email (R1), corrigir, confirmar",
    prdSection: "9.11",
    steps: [
      {
        name: "extract_correcao_data",
        actionType: "extract_data",
        targetAgent: "captador",
        description: "Extrair dados da correção solicitada",
        requiredFields: ["campo_a_corrigir", "valor_correto"],
        allowPartialData: false,
      },
      {
        name: "check_billing",
        actionType: "compliance_check",
        targetAgent: "operacional",
        description: "Verificar billing (R3)",
        requiredFields: [],
        allowPartialData: true,
      },
      {
        name: "gesp_snapshot_before",
        actionType: "take_screenshot",
        targetAgent: "operacional",
        description: "Screenshot ANTES da correção no GESP (R1: dual screenshots)",
        requiredFields: [],
        allowPartialData: true,
      },
      {
        name: "gesp_correction",
        actionType: "gesp_action",
        targetAgent: "operacional",
        description: "Corrigir dado no GESP (R1: se divergir → OF-D)",
        requiredFields: ["campo_a_corrigir", "valor_correto"],
        allowPartialData: false,
      },
      {
        name: "gesp_snapshot_after",
        actionType: "take_screenshot",
        targetAgent: "operacional",
        description: "Screenshot DEPOIS da correção no GESP (R1)",
        requiredFields: [],
        allowPartialData: true,
      },
    ],
    templates: ["B", "OF-D"],
    rules: ["R1", "R3", "R5", "R8", "R11", "R12"],
    requiresGesp: true,
    generatesOficio: true,
  },

  manutencao_veiculo: {
    tipoDemanda: "manutencao_veiculo",
    name: "Manutenção de Veículo da Frota",
    description: "Registrar manutenção, alertar se threshold atingido",
    prdSection: "9.12",
    steps: [
      {
        name: "extract_veiculo_data",
        actionType: "extract_data",
        targetAgent: "captador",
        description: "Extrair dados da manutenção",
        requiredFields: ["placa"],
        allowPartialData: true,
      },
      {
        name: "register_maintenance",
        actionType: "update_database",
        targetAgent: "operacional",
        description: "Registrar manutenção no banco",
        requiredFields: ["placa"],
        allowPartialData: true,
      },
    ],
    templates: ["B", "G"],
    rules: ["R3", "R8"],
    requiresGesp: false,
    generatesOficio: false,
  },

  reciclagem: {
    tipoDemanda: "reciclagem",
    name: "Curso de Reciclagem de Vigilante",
    description: "Registrar reciclagem, confirmar cliente",
    prdSection: "9.13",
    steps: [
      {
        name: "extract_reciclagem_data",
        actionType: "extract_data",
        targetAgent: "captador",
        description: "Extrair dados do curso de reciclagem",
        requiredFields: ["nomes_vigilantes"],
        allowPartialData: true,
      },
      {
        name: "check_billing",
        actionType: "compliance_check",
        targetAgent: "operacional",
        description: "Verificar billing (R3)",
        requiredFields: [],
        allowPartialData: true,
      },
      {
        name: "register_training",
        actionType: "update_database",
        targetAgent: "operacional",
        description: "Registrar reciclagem no banco",
        requiredFields: [],
        allowPartialData: true,
      },
    ],
    templates: ["B"],
    rules: ["R3", "R8"],
    requiresGesp: false,
    generatesOficio: false,
  },

  renovacao_alvara: {
    tipoDemanda: "renovacao_alvara",
    name: "Renovação de Alvará",
    description: "Verificar DOU, gerenciar alertas cascade, confirmar",
    prdSection: "9.14",
    steps: [
      {
        name: "extract_alvara_data",
        actionType: "extract_data",
        targetAgent: "captador",
        description: "Extrair dados do alvará",
        requiredFields: [],
        allowPartialData: true,
      },
      {
        name: "check_dou",
        actionType: "compliance_check",
        targetAgent: "captador",
        description: "Verificar se alvará foi renovado no DOU (R9)",
        requiredFields: [],
        allowPartialData: true,
      },
      {
        name: "generate_alerts",
        actionType: "generate_alert",
        targetAgent: "comunicador",
        description: "Configurar cascade de alertas: 90/60/30/15/5 dias",
        requiredFields: [],
        allowPartialData: true,
      },
    ],
    templates: ["B", "C", "D", "F"],
    rules: ["R3", "R8", "R9"],
    requiresGesp: false,
    generatesOficio: false,
  },

  caso_desconhecido: {
    tipoDemanda: "caso_desconhecido",
    name: "Caso Desconhecido",
    description: "Escalar para equipe humana via Template E (R7)",
    prdSection: "9.15",
    steps: [
      {
        name: "escalate_human",
        actionType: "escalate_human",
        targetAgent: "comunicador",
        description: "Enviar Template E para equipe@vigi.com.br (R7)",
        requiredFields: [],
        allowPartialData: true,
        template: "E",
      },
    ],
    templates: ["E"],
    rules: ["R2", "R7"],
    requiresGesp: false,
    generatesOficio: false,
  },

  criar_turma: {
    tipoDemanda: "criar_turma",
    name: "Criação de Turma de Formação/Reciclagem",
    description: "Criar turma no GESP, definir disciplinas, importar alunos, enviar para aprovação PF",
    prdSection: "GESP-Manual-p52",
    steps: [
      {
        name: "extract_turma_data",
        actionType: "extract_data",
        targetAgent: "captador",
        description: "Extrair dados da turma (nome, tipo, datas, local, alunos)",
        requiredFields: ["nome_turma", "tipo_curso", "data_inicio", "data_fim"],
        allowPartialData: false,
      },
      {
        name: "check_billing",
        actionType: "compliance_check",
        targetAgent: "operacional",
        description: "Verificar billing (R3)",
        requiredFields: [],
        allowPartialData: true,
      },
      {
        name: "gesp_criar_turma",
        actionType: "gesp_criar_turma",
        targetAgent: "operacional",
        description: "Criar turma no portal GESP (max 60 alunos)",
        requiredFields: ["nome_turma", "tipo_curso", "data_inicio"],
        allowPartialData: false,
      },
      {
        name: "gesp_importar_alunos",
        actionType: "gesp_importar_xml",
        targetAgent: "operacional",
        description: "Importar alunos via XML (se lista disponível)",
        requiredFields: [],
        allowPartialData: true,
      },
      {
        name: "gesp_enviar_turma",
        actionType: "gesp_enviar_turma",
        targetAgent: "operacional",
        description: "Enviar turma para aprovação da PF",
        requiredFields: [],
        allowPartialData: true,
      },
    ],
    templates: ["B"],
    rules: ["R3", "R5", "R8"],
    requiresGesp: true,
    generatesOficio: false,
  },

  guia_transporte: {
    tipoDemanda: "guia_transporte",
    name: "Guia de Transporte de Produtos Controlados",
    description: "Criar guia no GESP para transporte de armas, munições ou não-letais",
    prdSection: "GESP-Manual-p58",
    steps: [
      {
        name: "extract_transporte_data",
        actionType: "extract_data",
        targetAgent: "captador",
        description: "Extrair dados do transporte (origem, destino, itens, responsável)",
        requiredFields: ["origem_cidade", "origem_uf", "destino_cidade", "destino_uf"],
        allowPartialData: false,
      },
      {
        name: "check_billing",
        actionType: "compliance_check",
        targetAgent: "operacional",
        description: "Verificar billing (R3)",
        requiredFields: [],
        allowPartialData: true,
      },
      {
        name: "gesp_criar_guia",
        actionType: "gesp_guia_transporte",
        targetAgent: "operacional",
        description: "Criar Guia de Transporte no GESP",
        requiredFields: ["origem_cidade", "destino_cidade"],
        allowPartialData: false,
      },
      {
        name: "gesp_enviar_guia",
        actionType: "gesp_enviar_guia",
        targetAgent: "operacional",
        description: "Enviar guia para aprovação DELESP",
        requiredFields: [],
        allowPartialData: true,
      },
    ],
    templates: ["B"],
    rules: ["R3", "R5", "R8"],
    requiresGesp: true,
    generatesOficio: false,
  },

  comunicacao_ocorrencia: {
    tipoDemanda: "comunicacao_ocorrencia",
    name: "Comunicação de Ocorrência (24h)",
    description: "Registrar ocorrência no GESP — PRAZO OBRIGATÓRIO 24 HORAS",
    prdSection: "GESP-Manual-p67",
    steps: [
      {
        name: "extract_ocorrencia_data",
        actionType: "extract_data",
        targetAgent: "captador",
        description: "Extrair dados da ocorrência (tipo, data/hora, local, BO, armas)",
        requiredFields: ["tipo", "data_ocorrencia", "descricao"],
        allowPartialData: false,
      },
      {
        name: "gesp_comunicacao",
        actionType: "gesp_comunicacao_ocorrencia",
        targetAgent: "operacional",
        description: "Registrar comunicação no GESP — URGENTE (24h)",
        requiredFields: ["tipo", "data_ocorrencia", "descricao"],
        allowPartialData: false,
      },
    ],
    templates: ["B"],
    rules: ["R3", "R5", "R8", "R10"],
    requiresGesp: true,
    generatesOficio: false,
  },

  comunicacao_evento: {
    tipoDemanda: "comunicacao_evento",
    name: "Comunicação de Evento",
    description: "Notificar evento no GESP (tipo, arma de fogo, vigilantes)",
    prdSection: "GESP-Manual-p77",
    steps: [
      {
        name: "extract_evento_data",
        actionType: "extract_data",
        targetAgent: "captador",
        description: "Extrair dados do evento (tipo, nome, arma S/N, vigilantes CPFs)",
        requiredFields: ["tipo_evento", "nome_evento", "data_inicio"],
        allowPartialData: false,
      },
      {
        name: "gesp_comunicacao_evento",
        actionType: "gesp_comunicacao_evento",
        targetAgent: "operacional",
        description: "Registrar comunicação de evento no GESP",
        requiredFields: ["tipo_evento", "nome_evento"],
        allowPartialData: false,
      },
    ],
    templates: ["B"],
    rules: ["R3", "R5", "R8"],
    requiresGesp: true,
    generatesOficio: false,
  },

  credenciamento_instrutor: {
    tipoDemanda: "credenciamento_instrutor",
    name: "Credenciamento de Instrutor",
    description: "Solicitar credenciamento no GESP (validade 4 anos, 5 certidões criminais)",
    prdSection: "GESP-Manual-p81",
    steps: [
      {
        name: "extract_instrutor_data",
        actionType: "extract_data",
        targetAgent: "captador",
        description: "Extrair dados do instrutor (CPF, nome, disciplina)",
        requiredFields: ["instrutor_cpf", "instrutor_nome", "disciplina"],
        allowPartialData: false,
      },
      {
        name: "check_billing",
        actionType: "compliance_check",
        targetAgent: "operacional",
        description: "Verificar billing (R3)",
        requiredFields: [],
        allowPartialData: true,
      },
      {
        name: "gesp_credenciamento",
        actionType: "gesp_credenciamento",
        targetAgent: "operacional",
        description: "Solicitar credenciamento no GESP (requer 5 certidões criminais)",
        requiredFields: ["instrutor_cpf", "disciplina"],
        allowPartialData: false,
      },
    ],
    templates: ["B"],
    rules: ["R3", "R5", "R8"],
    requiresGesp: true,
    generatesOficio: false,
  },

  solicitar_cnv: {
    tipoDemanda: "solicitar_cnv",
    name: "Solicitação de CNV",
    description: "Solicitar emissão de Carteira Nacional de Vigilante via GESP + GRU",
    prdSection: "GESP-Manual-p96",
    steps: [
      {
        name: "extract_cnv_data",
        actionType: "extract_data",
        targetAgent: "captador",
        description: "Extrair dados para CNV (CPF vigilante, GRU linha digitável)",
        requiredFields: ["cpf_vigilante", "gru_linha_digitavel"],
        allowPartialData: false,
      },
      {
        name: "gesp_solicitar_cnv",
        actionType: "gesp_solicitar_cnv",
        targetAgent: "operacional",
        description: "Solicitar CNV no GESP com GRU paga",
        requiredFields: ["cpf_vigilante", "gru_linha_digitavel"],
        allowPartialData: false,
      },
    ],
    templates: ["B"],
    rules: ["R3", "R5", "R8"],
    requiresGesp: true,
    generatesOficio: false,
  },

  notificacao_autonoma: {
    tipoDemanda: "notificacao_autonoma",
    name: "Resposta a Notificação Autônoma da PF",
    description: "Responder notificação da PF dentro do prazo de 30 dias",
    prdSection: "GESP-Manual-p92",
    steps: [
      {
        name: "extract_notificacao_data",
        actionType: "extract_data",
        targetAgent: "captador",
        description: "Extrair dados da notificação (número, assunto, prazo)",
        requiredFields: ["numero_notificacao"],
        allowPartialData: true,
      },
      {
        name: "gesp_responder",
        actionType: "gesp_responder_notificacao",
        targetAgent: "operacional",
        description: "Responder notificação no GESP (prazo 30 dias)",
        requiredFields: ["numero_notificacao", "texto_resposta"],
        allowPartialData: false,
      },
    ],
    templates: ["B"],
    rules: ["R3", "R5", "R8"],
    requiresGesp: true,
    generatesOficio: false,
  },

  processo_autorizativo: {
    tipoDemanda: "processo_autorizativo",
    name: "Processo Autorizativo GESP",
    description: "Criar e enviar processo autorizativo: Rascunho → Verificar → Enviar → Análise PF",
    prdSection: "GESP-Manual-p24",
    steps: [
      {
        name: "extract_processo_data",
        actionType: "extract_data",
        targetAgent: "captador",
        description: "Extrair dados do processo (tipo, documentos)",
        requiredFields: ["tipo_processo"],
        allowPartialData: true,
      },
      {
        name: "check_billing",
        actionType: "compliance_check",
        targetAgent: "operacional",
        description: "Verificar billing (R3)",
        requiredFields: [],
        allowPartialData: true,
      },
      {
        name: "gesp_criar_processo",
        actionType: "gesp_criar_processo",
        targetAgent: "operacional",
        description: "Criar processo autorizativo no GESP (status: Rascunho)",
        requiredFields: ["tipo_processo"],
        allowPartialData: false,
      },
      {
        name: "gesp_verificar_pendencias",
        actionType: "gesp_verificar_pendencias",
        targetAgent: "operacional",
        description: "Verificar pendências do processo",
        requiredFields: [],
        allowPartialData: true,
      },
      {
        name: "gesp_enviar",
        actionType: "gesp_enviar_processo",
        targetAgent: "operacional",
        description: "Enviar processo para análise da PF",
        requiredFields: [],
        allowPartialData: true,
      },
    ],
    templates: ["B"],
    rules: ["R3", "R5", "R8"],
    requiresGesp: true,
    generatesOficio: false,
  },

  importacao_xml: {
    tipoDemanda: "importacao_xml",
    name: "Importação XML no GESP",
    description: "Importar dados via XML: Pessoa, Veículo ou Aluno (encoding UTF-8 obrigatório)",
    prdSection: "GESP-Manual-p98",
    steps: [
      {
        name: "extract_import_data",
        actionType: "extract_data",
        targetAgent: "captador",
        description: "Extrair tipo e dados para importação XML",
        requiredFields: ["tipo_importacao"],
        allowPartialData: true,
      },
      {
        name: "check_billing",
        actionType: "compliance_check",
        targetAgent: "operacional",
        description: "Verificar billing (R3)",
        requiredFields: [],
        allowPartialData: true,
      },
      {
        name: "gesp_importar",
        actionType: "gesp_importar_xml",
        targetAgent: "operacional",
        description: "Importar XML no GESP (Pessoa/Veículo/Aluno)",
        requiredFields: ["tipo_importacao", "xml_content"],
        allowPartialData: false,
      },
    ],
    templates: ["B"],
    rules: ["R3", "R4", "R5", "R8"],
    requiresGesp: true,
    generatesOficio: false,
  },
};
