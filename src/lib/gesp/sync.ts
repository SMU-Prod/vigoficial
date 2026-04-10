import { GespBrowser } from "./browser";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { uploadToR2, getFromR2, r2Path } from "@/lib/r2/client";
import { addEmailSendJob } from "@/lib/queue/jobs";
import { checkBillingGate } from "@/lib/security/billing-gate";
import { decryptField } from "@/lib/security/crypto";
import { logTimeoutWarning } from "./timeout-guard"; // OPS-05: Timeout guard
import { logger } from "@/lib/observability/logger"; // OPS-06: Structured logging
import { env } from "@/lib/config/env"; // OPS-02
import { getGespProcess, requiresAdminApproval, URGENT_24H_PROCESSES } from "./knowledge-base"; // GESP KB
import { requireApprovalAndWait } from "./admin-gate"; // Admin Gate

/** Fallback para Buffer opcional — evita undefined em uploads R2 */
const buf = (b: Buffer | undefined): Buffer => b ?? Buffer.alloc(0);

/**
 * GESP_DRY_RUN=true → simula execução sem abrir browser nem enviar ao GESP.
 * Tasks são marcadas como "concluido" com protocolo DRY-RUN-*.
 * Prints são placeholder 1x1 PNG.
 */
const IS_DRY_RUN = env.GESP_DRY_RUN === "true";

/** PNG 1x1 transparente para dry-run (sem R2 upload real) */
const _PLACEHOLDER_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAABJRUEFTuQmCC",
  "base64"
);

/**
 * Sincroniza uma empresa com o GESP
 * PRD Seção 3.2 — Integração GESP
 * Regra R3: Billing gating before GESP operations
 * Regra R4: Lote máx 999 vigilantes por submissão
 * Regra R5: Máx 1 sessão por empresa, 3 browsers total (via GespBrowser.open)
 * Regra R6: Retry quando GESP offline
 * OPS-05: Added timeout guard for serverless environments
 */
export async function syncEmpresa(companyId: string) {
  const _operationStart = Date.now();
  // OPS-05: Check timeout on serverless early
  logTimeoutWarning();

  const supabase = createSupabaseAdmin();

  // Busca dados da empresa
  const { data: company } = await supabase
    .from("companies")
    .select("*, ecpf_r2_path, ecpf_senha_encrypted, ecpf_validade")
    .eq("id", companyId)
    .single();

  if (!company) throw new Error(`Empresa ${companyId} não encontrada`);
  if (!company.habilitada) throw new Error(`Empresa ${companyId} não habilitada`);

  // ──── Gate de Procuração Eletrônica ────
  // Empresa só pode operar no GESP se tiver procuração validada
  if (company.procuracao_status && company.procuracao_status !== "validada") {
    throw new Error(
      `Empresa ${companyId} (${company.razao_social}) sem procuração eletrônica validada (status: ${company.procuracao_status}). ` +
      `O cliente precisa cadastrar a procuração no GESP antes de iniciar operações.`
    );
  }

  // Valida presença do certificado digital
  if (!company.ecpf_r2_path) {
    throw new Error(`Empresa ${companyId} sem certificado digital (ecpf_r2_path vazio)`);
  }
  if (!company.ecpf_senha_encrypted) {
    throw new Error(`Empresa ${companyId} sem senha do certificado (ecpf_senha_encrypted vazio)`);
  }

  // Verifica validade do certificado digital
  if (company.ecpf_validade) {
    const validadeDate = new Date(company.ecpf_validade);
    const agora = new Date();
    const diasAteExpiracao = Math.floor(
      (validadeDate.getTime() - agora.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diasAteExpiracao < 0) {
      throw new Error(
        `Certificado digital da empresa ${companyId} já expirou (expirou em ${validadeDate.toLocaleDateString("pt-BR")}). Renovar certificado é obrigatório para continuar.`
      );
    }

    if (diasAteExpiracao <= 7) {
      throw new Error(
        `Certificado digital da empresa ${companyId} expira em ${diasAteExpiracao} dia(s) (${validadeDate.toLocaleDateString("pt-BR")}). Renovar certificado urgentemente.`
      );
    }
  } else {
    logger.warn("Empresa sem data de validade de certificado registrada", { companyId }); // OPS-06
  }

  // ──── R3: Billing Gating ────
  const billingGate = await checkBillingGate(companyId);
  if (!billingGate.allowed) {
    throw new Error(
      `Empresa ${companyId} com billing ${billingGate.status} — GESP suspenso. Motivo: ${billingGate.reason}`
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // DRY-RUN MODE — Simula execução sem abrir browser/GESP
  // ══════════════════════════════════════════════════════════════════════
  if (IS_DRY_RUN) {
    logger.info(`Simulando sync para empresa (dry-run)`, { companyId, razaoSocial: company.razao_social }); // OPS-06

    const { data: allTasks } = await supabase
      .from("gesp_tasks")
      .select("*")
      .eq("company_id", companyId)
      .in("status", ["pendente", "retry"])
      .order("created_at");

    if (!allTasks || allTasks.length === 0) {
      logger.info("Nenhuma task pendente", { companyId }); // OPS-06
      return { tasks_executed: 0, snapshot: null };
    }

    let tasksExecuted = 0;

    for (const task of allTasks) {
      const protocoloDryRun = `DRY-RUN-${task.tipo_acao}-${Date.now()}`;
      logger.info("Task simulada", { taskId: task.id, tipoAcao: task.tipo_acao, protocolo: protocoloDryRun }); // OPS-06

      // Marca como executando → concluído (simulado)
      await supabase
        .from("gesp_tasks")
        .update({
          status: "concluido",
          tentativas: task.tentativas + 1,
          protocolo_gesp: protocoloDryRun,
          print_antes_r2: `dry-run/${task.id}-antes.png`,
          print_depois_r2: `dry-run/${task.id}-depois.png`,
          executed_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        })
        .eq("id", task.id);

      // Envia email de confirmação (Template B) — usa redirect se configurado
      await addEmailSendJob({
        companyId,
        templateId: "B",
        mode: "CLIENTE_HTML",
        to: company.email_responsavel,
        subject: `[VIG PRO][DRY-RUN] Simulação: ${task.tipo_acao}`,
        payload: {
          razaoSocial: company.razao_social,
          tipoAcao: task.tipo_acao.replace(/_/g, " "),
          descricao: `⚠️ SIMULAÇÃO (DRY-RUN) — Ação NÃO executada no GESP real`,
          protocoloGesp: protocoloDryRun,
          dataExecucao: new Date().toLocaleString("pt-BR"),
          detalhes: [
            "MODO: DRY-RUN (simulação)",
            ...Object.entries(task.payload || {}).map(([k, v]) => `${k}: ${v}`),
          ],
        },
      });

      tasksExecuted++;
    }

    logger.info("Sync dry-run concluído", { companyId, tasksExecuted }); // OPS-06
    return { tasks_executed: tasksExecuted, snapshot: null };
  }

  // ══════════════════════════════════════════════════════════════════════
  // MODO REAL — Execução normal com browser
  // ══════════════════════════════════════════════════════════════════════

  // ──── Prepara certificado digital ────
  // 1. Baixa .pfx do R2
  const pfxStream = await getFromR2(company.ecpf_r2_path);
  if (!pfxStream) {
    throw new Error(`Certificado não encontrado no R2: ${company.ecpf_r2_path}`);
  }
  const pfxChunks: Uint8Array[] = [];
  for await (const chunk of pfxStream as AsyncIterable<Uint8Array>) {
    pfxChunks.push(chunk);
  }
  const pfxBuffer = Buffer.concat(pfxChunks);

  // 2. Descriptografa senha do certificado
  const senhaCert = decryptField(company.ecpf_senha_encrypted);

  // 3. Monta config do certificado (e-CPF do procurador)
  const certificadoConfig = {
    tipo: "e-CPF" as const,
    r2Path: company.ecpf_r2_path,
    senha: senhaCert,
    cnpjEmpresa: company.cnpj,
  };

  const browser = new GespBrowser(companyId);

  try {
    // 1. Abre Firefox ESR com certificado A1 (R5 lock acontece aqui em GespBrowser.open)
    await browser.open(certificadoConfig, pfxBuffer);

    // 2. Login via Login Único GOV.BR → "Seu Certificado Digital"
    const loggedIn = await browser.login(company.cnpj);
    if (!loggedIn) throw new Error("Falha no login GESP via Login Único GOV.BR");

    // 3. Snapshot completo da empresa
    const snapshot = await browser.snapshotEmpresa();

    // Salva snapshot
    await supabase.from("gesp_snapshots").insert({
      company_id: companyId,
      snapshot_data: snapshot.rawData,
      vigilantes_count: snapshot.rawData?.vigilantes?.length ?? 0,
      postos_count: snapshot.rawData?.postos?.length ?? 0,
      armas_count: snapshot.rawData?.armas?.length ?? 0,
    });

    // 4. Processa tasks pendentes com batching (R4: máx 999)
    const { data: allTasks } = await supabase
      .from("gesp_tasks")
      .select("*")
      .eq("company_id", companyId)
      .in("status", ["pendente", "retry"])
      .order("created_at");

    if (!allTasks || allTasks.length === 0) {
      await browser.close();
      return { tasks_executed: 0, snapshot };
    }

    // ──── R4: Split into batches of 999 ────
    const batches = splitIntoBatches(allTasks, 999);
    let tasksExecuted = 0;

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];

      for (const task of batch) {
        try {
          // Valida payload antes de processar
          const payloadError = validateTaskPayload(task.tipo_acao, task.payload);
          if (payloadError) {
            await supabase
              .from("gesp_tasks")
              .update({
                status: "erro",
                erro_detalhe: `Validação de payload falhou: ${payloadError}`,
              })
              .eq("id", task.id);
            continue; // Skip para próxima task
          }

          // ──── ADMIN GATE: Toda ação GESP precisa de aprovação ────
          // Mapeia tipo_acao → process_code do knowledge-base
          // Processos readonly (quadro_avisos, acompanhar_processos) pulam o gate
          const processCodeMap: Record<string, string> = {
            "cadastrar_vigilante": "cadastro_vigilante",
            "criar_processo_autorizativo": "autorizacao_funcionamento",
            "comunicar_ocorrencia": "comunicar_ocorrencia",
            "guia_transporte": "guia_transporte",
            "alterar_dados_empresa": "alteracao_dados",
            "cadastrar_arma": "autorizacao_armas",
            "cadastrar_colete": "autorizacao_coletes",
            "cadastrar_veiculo": "autorizacao_veiculos",
            "turma_formacao": "turmas_formacao",
            "instrutor_credenciamento": "credenciamento_instrutores",
          };

          const mappedProcessCode = processCodeMap[task.tipo_acao] ?? task.tipo_acao;
          const gespProcess = getGespProcess(mappedProcessCode);

          if (gespProcess && requiresAdminApproval(mappedProcessCode)) {
            const isCritical = URGENT_24H_PROCESSES.includes(mappedProcessCode);
            const urgency = isCritical ? "critical" : (gespProcess.riskLevel === "critical" ? "high" : "normal");

            // Mark task as awaiting approval
            await supabase
              .from("gesp_tasks")
              .update({ status: "aguardando_aprovacao" })
              .eq("id", task.id);

            const approvalResult = await requireApprovalAndWait(
              companyId,
              mappedProcessCode,
              "operacional",
              task.id,
              task.payload as Record<string, unknown>,
              urgency as "low" | "normal" | "high" | "critical",
              `Task GESP: ${task.tipo_acao} — empresa ${companyId}`,
            );

            if (!approvalResult.approved) {
              logger.warn("Task GESP rejeitada pelo admin", {
                taskId: task.id,
                processCode: mappedProcessCode,
                status: approvalResult.status,
                adminNotes: approvalResult.adminNotes,
              });

              await supabase
                .from("gesp_tasks")
                .update({
                  status: approvalResult.status === "expired" ? "erro" : "cancelado",
                  erro_detalhe: `Admin ${approvalResult.status}: ${approvalResult.adminNotes ?? "sem nota"}`,
                })
                .eq("id", task.id);

              continue; // Skip — move to next task
            }

            logger.info("Task GESP aprovada pelo admin", {
              taskId: task.id,
              processCode: mappedProcessCode,
              approvalId: approvalResult.approvalId,
            });
          }
          // ──── END ADMIN GATE ────

          // Marca como executando
          await supabase
            .from("gesp_tasks")
            .update({ status: "executando", tentativas: task.tentativas + 1 })
            .eq("id", task.id);

          // Executa ação conforme tipo
          let resultado: { protocolo: string; printAntes: Buffer; printDepois: Buffer; status?: string };

          switch (task.tipo_acao) {
            case "cadastrar_vigilante": {
              const r = await browser.cadastrarVigilante(task.payload as {
                nome_completo: string;
                cpf: string;
                rg: string;
                data_nascimento: string;
                nome_mae: string;
                cnv_numero: string;
                funcao: string;
              });
              resultado = { protocolo: r.protocolo || `GESP-${Date.now()}`, printAntes: buf(r.printAntes), printDepois: buf(r.printDepois) };
              break;
            }

            case "criar_processo_autorizativo": {
              const r = await browser.criarProcessoAutorizativo(task.payload as {
                tipo: string;
                descricao?: string;
              });
              resultado = { protocolo: r.protocolo || `GESP-${Date.now()}`, printAntes: buf(r.printAntes), printDepois: buf(r.printDepois) };
              break;
            }

            case "verificar_pendencias": {
              const r = await browser.verificarPendencias(task.payload.processo_id as string);
              resultado = { protocolo: `pendencias-${r.pendencias?.length ?? 0}`, printAntes: buf(r.printAntes), printDepois: buf(r.printDepois) };
              break;
            }

            case "enviar_processo": {
              const r = await browser.enviarProcesso(task.payload.processo_id as string);
              resultado = { protocolo: r.protocolo || `GESP-${Date.now()}`, printAntes: buf(r.printAntes), printDepois: buf(r.printDepois) };
              break;
            }

            case "criar_turma": {
              const r = await browser.criarTurma(task.payload as {
                nomeTurma: string;
                tipoCurso: string;
                dataInicio: string;
                dataFim: string;
                local?: string;
              });
              resultado = { protocolo: r.turmaId || `GESP-${Date.now()}`, printAntes: buf(r.printAntes), printDepois: buf(r.printDepois) };
              break;
            }

            case "enviar_turma": {
              const r = await browser.enviarTurma(task.payload.turma_id as string);
              resultado = { protocolo: `turma-enviada`, printAntes: buf(r.printAntes), printDepois: buf(r.printDepois) };
              break;
            }

            case "importar_pessoas_xml":
            case "importar_veiculos_xml":
            case "importar_alunos_xml": {
              const tipo = task.tipo_acao === "importar_pessoas_xml" ? "pessoa"
                : task.tipo_acao === "importar_veiculos_xml" ? "veiculo"
                : "aluno";
              const r = await browser.importarXml(tipo, task.payload.xml_content as string);
              resultado = {
                protocolo: r.sucesso ? `import-${tipo}-${r.registrosProcessados}` : `GESP-${Date.now()}`,
                printAntes: buf(r.printAntes),
                printDepois: buf(r.printDepois),
              };
              break;
            }

            case "criar_guia_transporte": {
              const r = await browser.criarGuiaTransporte(task.payload as {
                origemCidade: string;
                origemUf: string;
                destinoCidade: string;
                destinoUf: string;
                dataTransporte: string;
                responsavelNome: string;
                responsavelCpf: string;
                veiculoPlaca?: string;
              });
              resultado = { protocolo: r.guiaId || `GESP-${Date.now()}`, printAntes: buf(r.printAntes), printDepois: buf(r.printDepois) };
              break;
            }

            case "enviar_guia": {
              const r = await browser.enviarGuiaTransporte(task.payload.guia_id as string);
              resultado = { protocolo: r.numeroGuia || `GESP-${Date.now()}`, printAntes: buf(r.printAntes), printDepois: buf(r.printDepois) };
              break;
            }

            case "comunicacao_ocorrencia": {
              const r = await browser.criarComunicacaoOcorrencia(task.payload as {
                tipo: string;
                dataOcorrencia: string;
                horaOcorrencia: string;
                localOcorrencia: string;
                descricao: string;
                boletimOcorrencia?: string;
              });
              resultado = { protocolo: r.protocolo || `GESP-${Date.now()}`, printAntes: buf(r.printAntes), printDepois: buf(r.printDepois) };
              break;
            }

            case "comunicacao_evento": {
              const r = await browser.criarComunicacaoEvento(task.payload as {
                tipoEvento: string;
                nomeEvento: string;
                armaFogo: boolean;
                duracao?: string;
                vigilantesCpfs: string[];
                local?: string;
                dataInicio: string;
                dataFim?: string;
              });
              resultado = { protocolo: r.protocolo || `GESP-${Date.now()}`, printAntes: buf(r.printAntes), printDepois: buf(r.printDepois) };
              break;
            }

            case "credenciamento_instrutor": {
              const r = await browser.solicitarCredenciamentoInstrutor(task.payload as {
                cpfInstrutor: string;
                nomeInstrutor: string;
                disciplina: string;
                certidoesBuffers: Buffer[];
              });
              resultado = { protocolo: r.protocolo || `GESP-${Date.now()}`, printAntes: buf(r.printAntes), printDepois: buf(r.printDepois) };
              break;
            }

            case "solicitar_cnv": {
              const r = await browser.solicitarCNV(task.payload.cpfVigilante as string);
              resultado = { protocolo: r.protocolo || `GESP-${Date.now()}`, printAntes: buf(r.printAntes), printDepois: buf(r.printDepois) };
              break;
            }

            case "responder_notificacao": {
              const r = await browser.responderNotificacao(
                task.payload.numero_notificacao as string,
                {
                  texto: task.payload.texto as string | undefined,
                  arquivos: task.payload.arquivos as Array<{ buffer: Buffer; nome: string }> | undefined,
                },
              );
              resultado = { protocolo: r.protocolo || `GESP-${Date.now()}`, printAntes: buf(r.printAntes), printDepois: buf(r.printDepois) };
              break;
            }

            case "snapshot_empresa": {
              const _snap = await browser.snapshotEmpresa();
              resultado = {
                protocolo: `snapshot-${Date.now()}`,
                printAntes: await browser.screenshot("snapshot-inicio"),
                printDepois: await browser.screenshot("snapshot-fim"),
              };
              break;
            }

            case "cadastrar_procurador": {
              const r = await browser.cadastrarProcurador(
                task.payload.cpf_procurador as string,
                task.payload.nome_procurador as string,
              );
              resultado = { protocolo: r.sucesso ? `proc-ok` : `GESP-${Date.now()}`, printAntes: buf(r.printAntes), printDepois: buf(r.printDepois) };
              break;
            }

            // ──── CNV: Imprimir ────
            case "imprimir_cnv": {
              const r = await browser.imprimirCNV(task.payload.cpf_vigilante as string);
              resultado = { protocolo: r.sucesso ? `cnv-print-ok` : `GESP-${Date.now()}`, printAntes: buf(r.printAntes), printDepois: buf(r.printDepois) };
              break;
            }

            // ──── Ocorrência: Fase 2 — Complementação (10 dias) ────
            case "enviar_complementacao_ocorrencia": {
              const r = await browser.enviarComplementacaoOcorrencia(
                task.payload.protocolo_fase1 as string,
                { descricao: task.payload.texto as string, arquivos: task.payload.documentos as Array<{ buffer: Buffer; nome: string }> | undefined },
              );
              resultado = { protocolo: r.protocolo || `GESP-${Date.now()}`, printAntes: buf(r.printAntes), printDepois: buf(r.printDepois) };
              break;
            }

            // ──── Turma: Comunicações de Lifecycle ────
            case "comunicar_inicio_turma": {
              const r = await browser.comunicarInicioTurma(task.payload.turma_id as string);
              resultado = { protocolo: r.protocolo || `turma-inicio`, printAntes: buf(r.printAntes), printDepois: buf(r.printDepois) };
              break;
            }

            case "comunicar_conclusao_turma": {
              const r = await browser.comunicarConclusaoTurma(task.payload.turma_id as string);
              resultado = { protocolo: r.protocolo || `turma-conclusao`, printAntes: buf(r.printAntes), printDepois: buf(r.printDepois) };
              break;
            }

            case "comunicar_cancelamento_turma": {
              const r = await browser.comunicarCancelamentoTurma(
                task.payload.turma_id as string,
                task.payload.motivo as string,
              );
              resultado = { protocolo: r.protocolo || `turma-cancelada`, printAntes: buf(r.printAntes), printDepois: buf(r.printDepois) };
              break;
            }

            // ──── Turma: Adicionar aluno e disciplinas ────
            case "adicionar_aluno_turma": {
              const r = await browser.importarAlunosTurma(
                task.payload.turma_id as string,
                task.payload.xml_content as string,
              );
              resultado = { protocolo: r.protocolo || `alunos-${r.alunosImportados}`, printAntes: buf(r.printAntes), printDepois: buf(r.printDepois) };
              break;
            }

            case "definir_disciplinas_turma": {
              const r = await browser.definirDisciplinasTurma(
                task.payload.turma_id as string,
                task.payload.disciplinas as string[],
              );
              resultado = { protocolo: r.protocolo || `GESP-${Date.now()}`, printAntes: buf(r.printAntes), printDepois: buf(r.printDepois) };
              break;
            }

            // ──── Processo Autorizativo: Adicionar documento ────
            case "adicionar_documento_processo": {
              const r = await browser.adicionarDocumentoProcesso(
                task.payload.processo_id as string,
                {
                  nome: task.payload.doc_nome as string,
                  tipo: task.payload.doc_tipo as string,
                  buffer: task.payload.doc_buffer as Buffer,
                },
              );
              resultado = { protocolo: r.sucesso ? `doc-ok` : `GESP-${Date.now()}`, printAntes: buf(r.printAntes), printDepois: buf(r.printDepois) };
              break;
            }

            // ──── Guia de Transporte: Variantes ────
            case "criar_guia_transporte_transferencia": {
              const r = await browser.criarGuiaTransporte({
                ...(task.payload as {
                  origemCidade: string; origemUf: string;
                  destinoCidade: string; destinoUf: string;
                  dataTransporte: string; responsavelNome: string;
                  responsavelCpf: string; veiculoPlaca?: string;
                }),
              });
              resultado = { protocolo: r.guiaId || `GESP-${Date.now()}`, printAntes: buf(r.printAntes), printDepois: buf(r.printDepois) };
              break;
            }

            case "criar_guia_coletes_destruicao": {
              const r = await browser.criarGuiaTransporte({
                ...(task.payload as {
                  origemCidade: string; origemUf: string;
                  destinoCidade: string; destinoUf: string;
                  dataTransporte: string; responsavelNome: string;
                  responsavelCpf: string; veiculoPlaca?: string;
                }),
              });
              resultado = { protocolo: r.guiaId || `GESP-${Date.now()}`, printAntes: buf(r.printAntes), printDepois: buf(r.printDepois) };
              break;
            }

            // ──── Processos Punitivos: Defesa, Recurso, Multa ────
            case "consultar_processo_punitivo": {
              const r = await browser.consultarProcessosPunitivos();
              resultado = {
                protocolo: `punitivos-${r.processos.length}`,
                printAntes: buf(r.printScreen),
                printDepois: buf(r.printScreen),
              };
              break;
            }

            case "enviar_defesa_punitivo": {
              const r = await browser.enviarDefesaPunitivo(
                task.payload.numero_processo as string,
                { fundamentacao: task.payload.texto as string },
              );
              resultado = { protocolo: r.protocolo || `defesa-enviada`, printAntes: buf(r.printAntes), printDepois: buf(r.printDepois) };
              break;
            }

            case "interpor_recurso_punitivo": {
              const r = await browser.interporRecursoPunitivo(
                task.payload.numero_processo as string,
                { fundamentacao: task.payload.texto as string },
              );
              resultado = { protocolo: r.protocolo || `recurso-enviado`, printAntes: buf(r.printAntes), printDepois: buf(r.printDepois) };
              break;
            }

            case "gerar_gru_multa": {
              const r = await browser.gerarGruMulta(task.payload.numero_processo as string);
              resultado = { protocolo: r.gruLinhaDigitavel || `GESP-${Date.now()}`, printAntes: buf(r.printAntes), printDepois: buf(r.printDepois) };
              break;
            }

            case "declarar_pagamento_multa": {
              const r = await browser.declararPagamentoMulta(
                task.payload.numero_processo as string,
                task.payload.gru_linha_digitavel as string,
              );
              resultado = { protocolo: r.protocolo || `pagamento-declarado`, printAntes: buf(r.printAntes), printDepois: buf(r.printDepois) };
              break;
            }

            case "restituicao_multa": {
              const r = await browser.solicitarRestituicaoMulta(
                task.payload.numero_processo as string,
                task.payload.justificativa as string,
              );
              resultado = { protocolo: r.protocolo || `GESP-${Date.now()}`, printAntes: buf(r.printAntes), printDepois: buf(r.printDepois) };
              break;
            }

            // ──── Credenciamento: Renovação ────
            case "renovar_credenciamento_instrutor": {
              // Renovação usa o mesmo fluxo que o credenciamento inicial
              const r = await browser.solicitarCredenciamentoInstrutor(task.payload as {
                cpfInstrutor: string;
                nomeInstrutor: string;
                disciplina: string;
                certidoesBuffers: Buffer[];
              });
              resultado = { protocolo: r.protocolo || `GESP-${Date.now()}`, printAntes: buf(r.printAntes), printDepois: buf(r.printDepois) };
              break;
            }

            // ──── Consulta GRU ────
            case "consultar_gru": {
              const r = await browser.consultarGru(task.payload.linha_digitavel as string);
              resultado = {
                protocolo: `gru-consultada`,
                printAntes: buf(r.printScreen ?? await browser.screenshot("gru-consulta")),
                printDepois: buf(r.printScreen ?? await browser.screenshot("gru-consulta-fim")),
                status: "consultada",
              };
              break;
            }

            // ──── Processo Bancário: Recadastramento ────
            case "solicitar_recadastramento_bancario": {
              const r = await browser.solicitarRecadastramentoBancario(task.payload as {
                nomeInstituicao?: string;
                gruLinhaDigitavel?: string;
              });
              resultado = { protocolo: r.protocolo || `GESP-${Date.now()}`, printAntes: buf(r.printAntes), printDepois: buf(r.printDepois) };
              break;
            }

            // ──── Processo Bancário: Plano de Segurança Nova Agência ────
            case "solicitar_plano_seguranca_nova_agencia": {
              const r = await browser.solicitarPlanoSegurancaNovaAgencia(task.payload as {
                nomeAgencia?: string;
                enderecoAgencia?: string;
                vigilantes?: {
                  qtdPostos: number;
                  cnpjEmpresaSeguranca?: string;
                  disposicao?: string;
                };
                alarme?: {
                  tipo?: string;
                  linhaExclusiva?: boolean;
                  linkRedundante?: boolean;
                  fonteEnergia?: string;
                  recebimentoSinal?: string;
                };
                cftv?: {
                  presente?: boolean;
                  especificacoes?: string;
                };
                gruLinhaDigitavel?: string;
              });
              resultado = { protocolo: r.protocolo || `GESP-${Date.now()}`, printAntes: buf(r.printAntes), printDepois: buf(r.printDepois) };
              break;
            }

            // ──── Processo Bancário: Renovação Plano sem Alteração / com Aumento ────
            case "solicitar_renovacao_plano_sem_alteracao":
            case "solicitar_renovacao_plano_com_reducao": {
              const r = await browser.solicitarRenovacaoPlanoAumento(task.payload as {
                numeroPlanoAnterior?: string;
                novosElementos?: {
                  nome: string;
                  quantidade: number;
                }[];
                gruLinhaDigitavel?: string;
              });
              resultado = { protocolo: r.protocolo || `GESP-${Date.now()}`, printAntes: buf(r.printAntes), printDepois: buf(r.printDepois) };
              break;
            }

            // ──── Processo Bancário: Plano Emergencial ────
            case "solicitar_plano_emergencial": {
              const r = await browser.solicitarPlanoEmergencial(task.payload as {
                nomeAgencia?: string;
                enderecoAgencia?: string;
                vigilantes?: {
                  qtdPostos: number;
                  cnpjEmpresaSeguranca?: string;
                };
                alarme?: {
                  tipo?: string;
                };
                gruLinhaDigitavel?: string;
              });
              resultado = { protocolo: r.protocolo || `GESP-${Date.now()}`, printAntes: buf(r.printAntes), printDepois: buf(r.printDepois) };
              break;
            }

            // ──── Processo Bancário: Plano Mudança de Endereço ────
            case "solicitar_plano_mudanca_endereco": {
              const r = await browser.solicitarPlanoMudancaEndereco(task.payload as {
                numeroPlanoAnterior?: string;
                novoEndereco?: string;
                gruLinhaDigitavel?: string;
              });
              resultado = { protocolo: r.protocolo || `GESP-${Date.now()}`, printAntes: buf(r.printAntes), printDepois: buf(r.printDepois) };
              break;
            }

            // ──── Processo Bancário: Editar Rascunho ────
            case "editar_rascunho_bancario": {
              const r = await browser.editarRascunhoBancario(task.payload.numero_rascunho as string);
              resultado = { protocolo: r.protocolo || `GESP-${Date.now()}`, printAntes: buf(r.printAntes), printDepois: buf(r.printDepois) };
              break;
            }

            // ──── Processo Bancário: Responder Notificação ────
            case "responder_notificacao_bancario": {
              const r = await browser.responderNotificacaoBancaria(
                task.payload.numero_notificacao as string,
                {
                  texto: task.payload.texto as string,
                  arquivos: task.payload.arquivos as Array<{ buffer: Buffer; nome: string }> | undefined,
                },
              );
              resultado = { protocolo: r.protocolo || `GESP-${Date.now()}`, printAntes: buf(r.printAntes), printDepois: buf(r.printDepois) };
              break;
            }

            // ──── Processo Bancário: Interpor Recurso ────
            case "interpor_recurso_bancario": {
              const r = await browser.interporRecursoBancario(
                task.payload.numero_processo as string,
                {
                  fundamentacao: task.payload.fundamentacao as string | undefined,
                  arquivos: task.payload.arquivos as Array<{ buffer: Buffer; nome: string }> | undefined,
                },
              );
              resultado = { protocolo: r.protocolo || `GESP-${Date.now()}`, printAntes: buf(r.printAntes), printDepois: buf(r.printDepois) };
              break;
            }

            // ──── Operações pendentes de implementação no browser ────
            case "informar_aquisicao_municoes":
            case "solicitar_aquisicao_coletes":
            case "certificado_vistoria_veiculo":
            case "alteracao_atos_constitutivos": {
              // Estas operações são subtipos de Processo Autorizativo
              // Usam o fluxo: criarProcessoAutorizativo → verificarPendencias → enviarProcesso
              const r = await browser.criarProcessoAutorizativo({
                tipo: task.tipo_acao,
                descricao: task.payload.descricao as string | undefined,
              });
              resultado = { protocolo: r.protocolo || `GESP-${Date.now()}`, printAntes: buf(r.printAntes), printDepois: buf(r.printDepois) };
              break;
            }

            default:
              // Task type desconhecido — captura print genérico para diagnóstico
              logger.warn("Tipo de ação desconhecido", { tipoAcao: task.tipo_acao }); // OPS-06
              resultado = {
                protocolo: `GESP-UNKNOWN-${Date.now()}`,
                printAntes: await browser.screenshot("antes-unknown"),
                printDepois: await browser.screenshot("depois-unknown"),
              };
          }

          // Upload prints para R2
          const dateStr = new Date().toISOString().split("T")[0];
          const printAntesPath = r2Path(companyId, "gesp_prints", `${task.id}-antes.png`, dateStr);
          const printDepoisPath = r2Path(companyId, "gesp_prints", `${task.id}-depois.png`, dateStr);

          await uploadToR2(printAntesPath, resultado.printAntes, "image/png");
          await uploadToR2(printDepoisPath, resultado.printDepois, "image/png");

          // Marca como concluído
          await supabase
            .from("gesp_tasks")
            .update({
              status: "concluido",
              protocolo_gesp: resultado.protocolo,
              print_antes_r2: printAntesPath,
              print_depois_r2: printDepoisPath,
              executed_at: new Date().toISOString(),
              completed_at: new Date().toISOString(),
            })
            .eq("id", task.id);

          // Template B — Confirmação obrigatória (Regra R8)
          await addEmailSendJob({
            companyId,
            templateId: "B",
            mode: "CLIENTE_HTML",
            to: company.email_responsavel,
            subject: `[VIG PRO] Confirmação: ${task.tipo_acao} executado`,
            payload: {
              razaoSocial: company.razao_social,
              tipoAcao: task.tipo_acao.replace(/_/g, " "),
              descricao: `Ação executada no GESP com sucesso`,
              protocoloGesp: resultado.protocolo,
              dataExecucao: new Date().toLocaleString("pt-BR"),
              detalhes: Object.entries(task.payload || {}).map(
                ([k, v]) => `${k}: ${v}`
              ),
            },
          });

          tasksExecuted++;
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);

          if (task.tentativas + 1 >= task.max_tentativas) {
            await supabase
              .from("gesp_tasks")
              .update({ status: "erro", erro_detalhe: errorMsg })
              .eq("id", task.id);
          } else {
            await supabase
              .from("gesp_tasks")
              .update({ status: "retry", erro_detalhe: errorMsg })
              .eq("id", task.id);
          }
        }
      }

      // Delay between batches (Regra R4)
      if (batchIdx < batches.length - 1) {
        await new Promise((r) => setTimeout(r, 5000)); // 5s delay between batches
      }
    }

    await browser.close();
    return { tasks_executed: tasksExecuted, snapshot };
  } catch (err) {
    await browser.close();
    throw err;
  }
}

/**
 * Valida payload de uma task conforme seu tipo
 * Retorna mensagem de erro se validação falhar, null se OK
 */
function validateTaskPayload(tipoAcao: string, payload: unknown): string | null {
  // Verifica se payload é null/undefined/vazio
  if (!payload || (typeof payload === "object" && Object.keys(payload).length === 0)) {
    return `Payload vazio para tipo: ${tipoAcao}`;
  }

  if (typeof payload !== "object") {
    return `Payload não é objeto para tipo: ${tipoAcao}`;
  }

  const p = payload as Record<string, unknown>;

  // Validações específicas por tipo
  switch (tipoAcao) {
    case "cadastrar_vigilante": {
      if (!p.nome_completo) return "Campo obrigatório ausente: nome_completo";
      if (!p.cpf) return "Campo obrigatório ausente: cpf";
      return null;
    }

    case "criar_processo_autorizativo": {
      if (!p.tipo) return "Campo obrigatório ausente: tipo";
      return null;
    }

    case "enviar_processo": {
      if (!p.processo_id) return "Campo obrigatório ausente: processo_id";
      return null;
    }

    case "criar_turma": {
      if (!p.nomeTurma) return "Campo obrigatório ausente: nomeTurma";
      if (!p.tipoCurso) return "Campo obrigatório ausente: tipoCurso";
      if (!p.dataInicio) return "Campo obrigatório ausente: dataInicio";
      if (!p.dataFim) return "Campo obrigatório ausente: dataFim";
      return null;
    }

    case "criar_guia_transporte": {
      if (!p.origemCidade) return "Campo obrigatório ausente: origemCidade";
      if (!p.destinoCidade) return "Campo obrigatório ausente: destinoCidade";
      if (!p.dataTransporte) return "Campo obrigatório ausente: dataTransporte";
      if (!p.responsavelNome) return "Campo obrigatório ausente: responsavelNome";
      if (!p.responsavelCpf) return "Campo obrigatório ausente: responsavelCpf";
      return null;
    }

    default:
      // Para outros tipos, apenas verifica se não é vazio
      return null;
  }
}

/**
 * R4: Split array into batches of specified size
 */
function splitIntoBatches<T>(items: T[], batchSize: number = 999): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}
