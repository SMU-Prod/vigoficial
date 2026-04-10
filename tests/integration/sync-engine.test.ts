import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { syncEmpresa } from '../../src/lib/gesp/sync'
import { createSupabaseAdmin } from '../../src/lib/supabase/server'
import { uploadToR2, getFromR2, r2Path } from '../../src/lib/r2/client'
import { checkBillingGate } from '../../src/lib/security/billing-gate'
import { decryptField } from '../../src/lib/security/crypto'
import { addEmailSendJob } from '../../src/lib/queue/jobs'
import { GespBrowser } from '../../src/lib/gesp/browser'

// Mock ALL external dependencies used by sync.ts
vi.mock('../../src/lib/supabase/server')
vi.mock('../../src/lib/r2/client')
vi.mock('../../src/lib/security/billing-gate')
vi.mock('../../src/lib/security/crypto')
vi.mock('../../src/lib/queue/jobs')
vi.mock('../../src/lib/gesp/browser')
vi.mock('../../src/lib/gesp/lock')

// Mock BullMQ to prevent Redis connection and module resolution issues
// (queues.ts is lazy now but vitest still resolves the import graph)
vi.mock('bullmq', () => {
  function MockQueue() {
    return {
      add: vi.fn().mockResolvedValue({ id: 'mock-job-id' }),
      close: vi.fn().mockResolvedValue(undefined),
      getRepeatableJobs: vi.fn().mockResolvedValue([]),
      removeRepeatableByKey: vi.fn().mockResolvedValue(undefined),
    }
  }
  function MockWorker() {
    return { on: vi.fn(), close: vi.fn().mockResolvedValue(undefined) }
  }
  return { Queue: MockQueue, Worker: MockWorker, QueueScheduler: vi.fn() }
})

// ─────────────────────────────────────────────────────────────────────
// Smart Supabase Mock — routes data by table name and operation
// ─────────────────────────────────────────────────────────────────────

interface QueryResult {
  data: any
  error: any
}

/**
 * Creates a table-aware Supabase mock.
 * Each table can have its own response for select/insert/update/single.
 */
function createSmartSupabase() {
  // Per-table response queues
  const tableResponses: Record<string, QueryResult[]> = {}
  const singleResponses: Record<string, QueryResult[]> = {}
  const insertResponses: Record<string, QueryResult[]> = {}
  const updateResponses: Record<string, QueryResult[]> = {}

  // Track calls for assertions
  const calls = {
    from: [] as string[],
    select: [] as any[],
    insert: [] as any[],
    update: [] as any[],
    eq: [] as any[],
    in: [] as any[],
    order: [] as any[],
    single: [] as any[],
  }

  // Default response
  const defaultResult: QueryResult = { data: null, error: null }

  function setTableData(table: string, data: any) {
    if (!tableResponses[table]) tableResponses[table] = []
    tableResponses[table].push({ data, error: null })
  }

  function setSingleData(table: string, data: any) {
    if (!singleResponses[table]) singleResponses[table] = []
    singleResponses[table].push({ data, error: null })
  }

  function getTableData(table: string): QueryResult {
    const queue = tableResponses[table]
    if (queue && queue.length > 0) return queue.shift()!
    return defaultResult
  }

  function getSingleData(table: string): QueryResult {
    const queue = singleResponses[table]
    if (queue && queue.length > 0) return queue.shift()!
    return defaultResult
  }

  function getInsertData(table: string): QueryResult {
    const queue = insertResponses[table]
    if (queue && queue.length > 0) return queue.shift()!
    return defaultResult
  }

  function getUpdateData(table: string): QueryResult {
    const queue = updateResponses[table]
    if (queue && queue.length > 0) return queue.shift()!
    return defaultResult
  }

  // The client
  let currentTable = ''
  let lastOperation: 'select' | 'insert' | 'update' | 'delete' = 'select'
  let lastUpdatePayload: any = null

  const builder: any = {
    select(...args: any[]) { calls.select.push(args); lastOperation = 'select'; return builder },
    insert(data: any) { calls.insert.push(data); lastOperation = 'insert'; return builder },
    update(data: any) { calls.update.push(data); lastUpdatePayload = data; lastOperation = 'update'; return builder },
    delete() { lastOperation = 'delete'; return builder },
    eq(...args: any[]) { calls.eq.push(args); return builder },
    neq() { return builder },
    in(...args: any[]) { calls.in.push(args); return builder },
    gte() { return builder },
    lte() { return builder },
    lt() { return builder },
    gt() { return builder },
    order(...args: any[]) { calls.order.push(args); return builder },
    limit() { return builder },
    range() { return builder },
    single() {
      calls.single.push(currentTable)
      return Promise.resolve(getSingleData(currentTable))
    },
    maybeSingle() {
      return Promise.resolve(getSingleData(currentTable))
    },
    // Thenable — this is what makes `await supabase.from(...).select(...).eq(...)` work
    then(resolve: any, reject?: any) {
      let result: QueryResult
      if (lastOperation === 'select') {
        result = getTableData(currentTable)
      } else if (lastOperation === 'insert') {
        result = getInsertData(currentTable)
      } else if (lastOperation === 'update') {
        result = getUpdateData(currentTable)
      } else {
        result = defaultResult
      }
      return Promise.resolve(result).then(resolve, reject)
    },
  }

  const client = {
    from(table: string) {
      currentTable = table
      calls.from.push(table)
      lastOperation = 'select'
      lastUpdatePayload = null
      return builder
    },
  }

  return {
    client,
    calls,
    setTableData,
    setSingleData,
    getLastUpdatePayload: () => lastUpdatePayload,
    // Convenience: setup standard company + tasks
    setupCompany(companyData: any) {
      setSingleData('companies', companyData)
    },
    setupTasks(tasks: any[]) {
      setTableData('gesp_tasks', tasks)
    },
  }
}

// ─────────────────────────────────────────────────────────────────────
// Standard test company data
// ─────────────────────────────────────────────────────────────────────

const COMPANY_BASE = {
  id: 'company-test',
  cnpj: '12.345.678/0001-91',
  habilitada: true,
  razao_social: 'Test Security Co',
  ecpf_r2_path: 'certs/test.pfx',
  ecpf_senha_encrypted: 'encrypted-password',
  email_responsavel: 'admin@test.com',
}

function makeTask(overrides: Partial<{
  id: string
  tipo_acao: string
  payload: any
  status: string
  tentativas: number
  max_tentativas: number
}> = {}) {
  return {
    id: overrides.id || `task-${Date.now()}`,
    tipo_acao: overrides.tipo_acao || 'enviar_processo',
    payload: overrides.payload || {},
    status: overrides.status || 'pendente',
    tentativas: overrides.tentativas ?? 0,
    max_tentativas: overrides.max_tentativas ?? 3,
  }
}

// Mock PFX stream helper
function mockPfxStream() {
  return {
    [Symbol.asyncIterator]: async function* () {
      yield Buffer.from('mock-pfx-data')
    },
  } as any
}

// ─────────────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────────────

describe('GESP Sync Engine', () => {
  let db: ReturnType<typeof createSmartSupabase>
  let mockBrowser: any

  beforeEach(() => {
    vi.clearAllMocks()

    // ── Supabase ──
    db = createSmartSupabase()
    vi.mocked(createSupabaseAdmin).mockReturnValue(db.client as any)

    // ── R2 ──
    vi.mocked(getFromR2).mockResolvedValue(mockPfxStream())
    vi.mocked(uploadToR2).mockResolvedValue(undefined as any)
    vi.mocked(r2Path).mockImplementation(
      (companyId, folder, file, date) => `${companyId}/${folder}/${date}/${file}`
    )

    // ── Crypto ──
    vi.mocked(decryptField).mockReturnValue('decrypted-password')

    // ── Billing Gate ──
    vi.mocked(checkBillingGate).mockResolvedValue({
      allowed: true,
      status: 'ativo',
    } as any)

    // ── Email Job ──
    vi.mocked(addEmailSendJob).mockResolvedValue({ id: 'job-123' } as any)

    // ── Browser Mock — every method sync.ts calls ──
    mockBrowser = {
      open: vi.fn().mockResolvedValue(undefined),
      login: vi.fn().mockResolvedValue(true),
      close: vi.fn().mockResolvedValue(undefined),
      screenshot: vi.fn().mockResolvedValue(Buffer.from('screenshot')),
      snapshotEmpresa: vi.fn().mockResolvedValue({
        rawData: { modules: 'all' },
        vigilantesCount: 10,
        postosCount: 5,
        armasCount: 3,
      }),
      cadastrarVigilante: vi.fn().mockResolvedValue({
        protocolo: 'VIG-001',
        printAntes: Buffer.from('before'),
        printDepois: Buffer.from('after'),
      }),
      cadastrarProcurador: vi.fn().mockResolvedValue({
        sucesso: true,
        printAntes: Buffer.from('before'),
        printDepois: Buffer.from('after'),
      }),
      criarProcessoAutorizativo: vi.fn().mockResolvedValue({
        protocolo: 'PROC-2026-001',
        printAntes: Buffer.from('before'),
        printDepois: Buffer.from('after'),
      }),
      verificarPendencias: vi.fn().mockResolvedValue({
        pendencias: [],
        printAntes: Buffer.from('before'),
        printDepois: Buffer.from('after'),
      }),
      enviarProcesso: vi.fn().mockResolvedValue({
        protocolo: 'GESP-2026-001',
        printAntes: Buffer.from('before'),
        printDepois: Buffer.from('after'),
      }),
      adicionarDocumentoProcesso: vi.fn().mockResolvedValue({
        sucesso: true,
        printAntes: Buffer.from('before'),
        printDepois: Buffer.from('after'),
      }),
      criarTurma: vi.fn().mockResolvedValue({
        turmaId: 'TURMA-001',
        printAntes: Buffer.from('before'),
        printDepois: Buffer.from('after'),
      }),
      enviarTurma: vi.fn().mockResolvedValue({
        printAntes: Buffer.from('before'),
        printDepois: Buffer.from('after'),
      }),
      importarAlunosTurma: vi.fn().mockResolvedValue({
        protocolo: 'ALUNOS-001',
        alunosImportados: 30,
        printAntes: Buffer.from('before'),
        printDepois: Buffer.from('after'),
      }),
      comunicarInicioTurma: vi.fn().mockResolvedValue({
        protocolo: 'TURMA-INICIO',
        printAntes: Buffer.from('before'),
        printDepois: Buffer.from('after'),
      }),
      comunicarConclusaoTurma: vi.fn().mockResolvedValue({
        protocolo: 'TURMA-CONCLUSAO',
        printAntes: Buffer.from('before'),
        printDepois: Buffer.from('after'),
      }),
      comunicarCancelamentoTurma: vi.fn().mockResolvedValue({
        protocolo: 'TURMA-CANCELADA',
        printAntes: Buffer.from('before'),
        printDepois: Buffer.from('after'),
      }),
      importarXml: vi.fn().mockResolvedValue({
        sucesso: true,
        registrosProcessados: 15,
        printAntes: Buffer.from('before'),
        printDepois: Buffer.from('after'),
      }),
      criarGuiaTransporte: vi.fn().mockResolvedValue({
        guiaId: 'GUIA-001',
        protocolo: 'GUIA-PROTO-001',
        printAntes: Buffer.from('before'),
        printDepois: Buffer.from('after'),
      }),
      enviarGuiaTransporte: vi.fn().mockResolvedValue({
        numeroGuia: 'GUIA-SENT-001',
        printAntes: Buffer.from('before'),
        printDepois: Buffer.from('after'),
      }),
      criarComunicacaoOcorrencia: vi.fn().mockResolvedValue({
        protocolo: 'OCOR-001',
        printAntes: Buffer.from('before'),
        printDepois: Buffer.from('after'),
      }),
      criarComunicacaoEvento: vi.fn().mockResolvedValue({
        protocolo: 'EVT-001',
        printAntes: Buffer.from('before'),
        printDepois: Buffer.from('after'),
      }),
      enviarComplementacaoOcorrencia: vi.fn().mockResolvedValue({
        protocolo: 'COMPL-001',
        printAntes: Buffer.from('before'),
        printDepois: Buffer.from('after'),
      }),
      solicitarCredenciamentoInstrutor: vi.fn().mockResolvedValue({
        protocolo: 'CRED-001',
        printAntes: Buffer.from('before'),
        printDepois: Buffer.from('after'),
      }),
      solicitarCNV: vi.fn().mockResolvedValue({
        protocolo: 'CNV-001',
        printAntes: Buffer.from('before'),
        printDepois: Buffer.from('after'),
      }),
      imprimirCNV: vi.fn().mockResolvedValue({
        sucesso: true,
        printAntes: Buffer.from('before'),
        printDepois: Buffer.from('after'),
      }),
      responderNotificacao: vi.fn().mockResolvedValue({
        printAntes: Buffer.from('before'),
        printDepois: Buffer.from('after'),
      }),
      consultarProcessosPunitivos: vi.fn().mockResolvedValue({
        processos: [{ id: 'pun-1', numero: '2026/0001' }],
        printScreen: Buffer.from('screen'),
      }),
      enviarDefesaPunitivo: vi.fn().mockResolvedValue({
        protocolo: 'DEF-001',
        printAntes: Buffer.from('before'),
        printDepois: Buffer.from('after'),
      }),
      interporRecursoPunitivo: vi.fn().mockResolvedValue({
        protocolo: 'REC-001',
        printAntes: Buffer.from('before'),
        printDepois: Buffer.from('after'),
      }),
      gerarGruMulta: vi.fn().mockResolvedValue({
        gruLinhaDigitavel: '12345.67890 12345.678901 12345.678901 1 12340000010000',
        printAntes: Buffer.from('before'),
        printDepois: Buffer.from('after'),
      }),
      declararPagamentoMulta: vi.fn().mockResolvedValue({
        protocolo: 'PAG-001',
        printAntes: Buffer.from('before'),
        printDepois: Buffer.from('after'),
      }),
      solicitarRestituicaoMulta: vi.fn().mockResolvedValue({
        protocolo: 'REST-001',
        printAntes: Buffer.from('before'),
        printDepois: Buffer.from('after'),
      }),
      consultarGru: vi.fn().mockResolvedValue({
        status: 'paga',
        printScreen: Buffer.from('screen'),
      }),
      // Processo Bancário methods
      solicitarRecadastramentoBancario: vi.fn().mockResolvedValue({
        protocolo: 'RECAD-001',
        printAntes: Buffer.from('before'),
        printDepois: Buffer.from('after'),
      }),
      solicitarPlanoSegurancaNovaAgencia: vi.fn().mockResolvedValue({
        protocolo: 'PLANO-001',
        printAntes: Buffer.from('before'),
        printDepois: Buffer.from('after'),
      }),
      solicitarRenovacaoPlanoAumento: vi.fn().mockResolvedValue({
        protocolo: 'RENOV-001',
        printAntes: Buffer.from('before'),
        printDepois: Buffer.from('after'),
      }),
      solicitarPlanoEmergencial: vi.fn().mockResolvedValue({
        protocolo: 'EMERG-001',
        printAntes: Buffer.from('before'),
        printDepois: Buffer.from('after'),
      }),
      solicitarPlanoMudancaEndereco: vi.fn().mockResolvedValue({
        protocolo: 'MUD-001',
        printAntes: Buffer.from('before'),
        printDepois: Buffer.from('after'),
      }),
      editarRascunhoBancario: vi.fn().mockResolvedValue({
        protocolo: 'RASC-001',
        printAntes: Buffer.from('before'),
        printDepois: Buffer.from('after'),
      }),
      responderNotificacaoBancaria: vi.fn().mockResolvedValue({
        protocolo: 'NOTIF-BANC-001',
        printAntes: Buffer.from('before'),
        printDepois: Buffer.from('after'),
      }),
      interporRecursoBancario: vi.fn().mockResolvedValue({
        protocolo: 'REC-BANC-001',
        printAntes: Buffer.from('before'),
        printDepois: Buffer.from('after'),
      }),
    }

    // Must use regular function (not arrow) so it works with `new` keyword
    vi.mocked(GespBrowser).mockImplementation(function () { return mockBrowser } as any)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // Helper: setup company + empty tasks (common pattern)
  function setupCompanyNoTasks(companyOverrides: Partial<typeof COMPANY_BASE> = {}) {
    db.setupCompany({ ...COMPANY_BASE, ...companyOverrides })
    db.setupTasks([])
  }

  // Helper: setup company + specific tasks
  function setupCompanyWithTasks(
    tasks: any[],
    companyOverrides: Partial<typeof COMPANY_BASE> = {},
  ) {
    db.setupCompany({ ...COMPANY_BASE, ...companyOverrides })
    db.setupTasks(tasks)
  }

  // ═══════════════════════════════════════════════════════════════════
  // Session Management
  // ═══════════════════════════════════════════════════════════════════

  describe('Session Management', () => {
    it('creates browser session with certificate config', async () => {
      setupCompanyNoTasks()

      await syncEmpresa('company-test')

      expect(mockBrowser.open).toHaveBeenCalledWith(
        expect.objectContaining({
          tipo: 'e-CPF',
          r2Path: 'certs/test.pfx',
          senha: 'decrypted-password',
          cnpjEmpresa: '12.345.678/0001-91',
        }),
        expect.any(Buffer),
      )
    })

    it('decrypts certificate password before use', async () => {
      setupCompanyNoTasks()

      await syncEmpresa('company-test')

      expect(decryptField).toHaveBeenCalledWith('encrypted-password')
    })

    it('downloads PFX from R2 using ecpf_r2_path', async () => {
      setupCompanyNoTasks()

      await syncEmpresa('company-test')

      expect(getFromR2).toHaveBeenCalledWith('certs/test.pfx')
    })

    it('calls browser.login with company CNPJ', async () => {
      setupCompanyNoTasks()

      await syncEmpresa('company-test')

      expect(mockBrowser.login).toHaveBeenCalledWith('12.345.678/0001-91')
    })

    it('takes snapshot of empresa after login', async () => {
      setupCompanyNoTasks()

      await syncEmpresa('company-test')

      expect(mockBrowser.snapshotEmpresa).toHaveBeenCalled()
    })

    it('closes browser after all tasks complete', async () => {
      setupCompanyNoTasks()

      await syncEmpresa('company-test')

      expect(mockBrowser.close).toHaveBeenCalled()
    })

    it('closes browser even if error occurs', async () => {
      db.setupCompany({ ...COMPANY_BASE })
      mockBrowser.login.mockResolvedValueOnce(false)
      // login returns false → throws "Falha no login GESP"
      // Actually sync.ts: if (!loggedIn) throw new Error(...)
      // but after browser.open, the error will cause the catch block

      await expect(syncEmpresa('company-test')).rejects.toThrow('Falha no login')
      expect(mockBrowser.close).toHaveBeenCalled()
    })

    it('throws if company not found', async () => {
      // Don't setup company — single() returns { data: null }
      await expect(syncEmpresa('nonexistent')).rejects.toThrow('não encontrada')
    })

    it('throws if company not enabled (habilitada=false)', async () => {
      db.setupCompany({ ...COMPANY_BASE, habilitada: false })
      await expect(syncEmpresa('company-test')).rejects.toThrow('não habilitada')
    })

    it('throws if company has no certificate path', async () => {
      db.setupCompany({ ...COMPANY_BASE, ecpf_r2_path: null })
      await expect(syncEmpresa('company-test')).rejects.toThrow('sem certificado digital')
    })

    it('throws if company has no encrypted password', async () => {
      db.setupCompany({ ...COMPANY_BASE, ecpf_senha_encrypted: null })
      await expect(syncEmpresa('company-test')).rejects.toThrow('sem senha do certificado')
    })

    it('returns zero tasks_executed when no pending tasks', async () => {
      setupCompanyNoTasks()

      const result = await syncEmpresa('company-test')

      expect(result.tasks_executed).toBe(0)
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // Billing Gate (R3)
  // ═══════════════════════════════════════════════════════════════════

  describe('Billing Gate (R3)', () => {
    it('allows sync when billing is active', async () => {
      vi.mocked(checkBillingGate).mockResolvedValue({ allowed: true, status: 'ativo' } as any)
      setupCompanyNoTasks()

      await syncEmpresa('company-test')

      expect(checkBillingGate).toHaveBeenCalledWith('company-test')
      expect(mockBrowser.open).toHaveBeenCalled()
    })

    it('blocks sync when billing is "suspenso"', async () => {
      vi.mocked(checkBillingGate).mockResolvedValue({
        allowed: false,
        status: 'suspenso',
        reason: 'Subscription suspended',
      } as any)
      db.setupCompany({ ...COMPANY_BASE })

      await expect(syncEmpresa('company-test')).rejects.toThrow(/billing.*suspenso/)
    })

    it('blocks sync when billing is "cancelado"', async () => {
      vi.mocked(checkBillingGate).mockResolvedValue({
        allowed: false,
        status: 'cancelado',
        reason: 'Subscription cancelled',
      } as any)
      db.setupCompany({ ...COMPANY_BASE })

      await expect(syncEmpresa('company-test')).rejects.toThrow(/billing.*cancelado/)
    })

    it('includes reason in billing error message', async () => {
      vi.mocked(checkBillingGate).mockResolvedValue({
        allowed: false,
        status: 'suspenso',
        reason: 'Payment overdue for 30 days',
      } as any)
      db.setupCompany({ ...COMPANY_BASE })

      await expect(syncEmpresa('company-test')).rejects.toThrow(/Payment overdue/)
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // Task Batching (R4)
  // ═══════════════════════════════════════════════════════════════════

  describe('Task Batching (R4)', () => {
    it('processes up to 999 tasks in a single batch', async () => {
      const tasks = Array.from({ length: 999 }, (_, i) =>
        makeTask({ id: `task-${i}`, tipo_acao: 'enviar_processo', payload: { processo_id: `proc-${i}` } }),
      )
      setupCompanyWithTasks(tasks)

      await syncEmpresa('company-test')

      expect(mockBrowser.enviarProcesso).toHaveBeenCalledTimes(999)
    })

    it('splits into multiple batches when > 999 items', async () => {
      const tasks = Array.from({ length: 2000 }, (_, i) =>
        makeTask({ id: `task-${i}`, tipo_acao: 'enviar_processo', payload: { processo_id: `proc-${i}` } }),
      )
      setupCompanyWithTasks(tasks)

      await syncEmpresa('company-test')

      expect(mockBrowser.enviarProcesso).toHaveBeenCalledTimes(2000)
    }, 30000)

    it('preserves task order within batches', async () => {
      const tasks = [
        makeTask({ id: 'task-1', tipo_acao: 'enviar_processo', payload: { processo_id: 'first' } }),
        makeTask({ id: 'task-2', tipo_acao: 'enviar_processo', payload: { processo_id: 'second' } }),
      ]
      setupCompanyWithTasks(tasks)

      await syncEmpresa('company-test')

      const calls = mockBrowser.enviarProcesso.mock.calls
      expect(calls[0][0]).toBe('first')
      expect(calls[1][0]).toBe('second')
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // Module: Cadastrar Vigilante
  // ═══════════════════════════════════════════════════════════════════

  describe('Task: cadastrar_vigilante', () => {
    it('calls browser.cadastrarVigilante with full payload', async () => {
      const payload = {
        nome_completo: 'João Carlos Silva',
        cpf: '123.456.789-10',
        rg: 'MG-12.345.678',
        data_nascimento: '1990-03-15',
        nome_mae: 'Maria da Silva',
        cnv_numero: '0123456789',
        funcao: 'Vigilante Patrimonial',
      }
      setupCompanyWithTasks([makeTask({ tipo_acao: 'cadastrar_vigilante', payload })])

      await syncEmpresa('company-test')

      expect(mockBrowser.cadastrarVigilante).toHaveBeenCalledWith(payload)
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // Module: Cadastrar Procurador
  // ═══════════════════════════════════════════════════════════════════

  describe('Task: cadastrar_procurador', () => {
    it('calls browser.cadastrarProcurador(cpf, nome)', async () => {
      setupCompanyWithTasks([
        makeTask({
          tipo_acao: 'cadastrar_procurador',
          payload: { cpf_procurador: '111.222.333-44', nome_procurador: 'Maria Silva' },
        }),
      ])

      await syncEmpresa('company-test')

      expect(mockBrowser.cadastrarProcurador).toHaveBeenCalledWith(
        '111.222.333-44',
        'Maria Silva',
      )
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // Module: Snapshot Empresa
  // ═══════════════════════════════════════════════════════════════════

  describe('Task: snapshot_empresa', () => {
    it('calls browser.snapshotEmpresa() and screenshot()', async () => {
      setupCompanyWithTasks([makeTask({ tipo_acao: 'snapshot_empresa', payload: {} })])

      await syncEmpresa('company-test')

      // snapshotEmpresa is called twice: once in main flow + once in task
      expect(mockBrowser.snapshotEmpresa).toHaveBeenCalledTimes(2)
      expect(mockBrowser.screenshot).toHaveBeenCalledWith('snapshot-inicio')
      expect(mockBrowser.screenshot).toHaveBeenCalledWith('snapshot-fim')
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // Module: Processo Autorizativo
  // ═══════════════════════════════════════════════════════════════════

  describe('Task: criar_processo_autorizativo', () => {
    it('calls browser.criarProcessoAutorizativo({tipo, descricao})', async () => {
      setupCompanyWithTasks([
        makeTask({
          tipo_acao: 'criar_processo_autorizativo',
          payload: { tipo: 'alvara', descricao: 'Nova solicitação' },
        }),
      ])

      await syncEmpresa('company-test')

      expect(mockBrowser.criarProcessoAutorizativo).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'alvara' }),
      )
    })
  })

  describe('Task: verificar_pendencias', () => {
    it('calls browser.verificarPendencias(processo_id)', async () => {
      setupCompanyWithTasks([
        makeTask({
          tipo_acao: 'verificar_pendencias',
          payload: { processo_id: 'proc-456' },
        }),
      ])

      await syncEmpresa('company-test')

      expect(mockBrowser.verificarPendencias).toHaveBeenCalledWith('proc-456')
    })
  })

  describe('Task: enviar_processo', () => {
    it('calls browser.enviarProcesso(processo_id)', async () => {
      setupCompanyWithTasks([
        makeTask({
          tipo_acao: 'enviar_processo',
          payload: { processo_id: 'proc-789' },
        }),
      ])

      await syncEmpresa('company-test')

      expect(mockBrowser.enviarProcesso).toHaveBeenCalledWith('proc-789')
    })
  })

  describe('Task: adicionar_documento_processo', () => {
    it('calls browser.adicionarDocumentoProcesso(processo_id, docInfo)', async () => {
      const docBuffer = Buffer.from('pdf-content')
      setupCompanyWithTasks([
        makeTask({
          tipo_acao: 'adicionar_documento_processo',
          payload: {
            processo_id: 'proc-100',
            doc_nome: 'alvara.pdf',
            doc_tipo: 'application/pdf',
            doc_buffer: docBuffer,
          },
        }),
      ])

      await syncEmpresa('company-test')

      expect(mockBrowser.adicionarDocumentoProcesso).toHaveBeenCalledWith(
        'proc-100',
        expect.objectContaining({ nome: 'alvara.pdf', tipo: 'application/pdf' }),
      )
    })
  })

  // Subtypes that route to criarProcessoAutorizativo
  describe('Processo Autorizativo subtypes', () => {
    const subtypes = [
      'informar_aquisicao_municoes',
      'solicitar_aquisicao_coletes',
      'certificado_vistoria_veiculo',
      'alteracao_atos_constitutivos',
    ]

    subtypes.forEach((tipo) => {
      it(`task "${tipo}" calls criarProcessoAutorizativo({tipo})`, async () => {
        setupCompanyWithTasks([
          makeTask({ tipo_acao: tipo, payload: { descricao: 'Teste' } }),
        ])

        await syncEmpresa('company-test')

        expect(mockBrowser.criarProcessoAutorizativo).toHaveBeenCalledWith(
          expect.objectContaining({ tipo }),
        )
      })
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // Module: Processo Punitivo
  // ═══════════════════════════════════════════════════════════════════

  describe('Task: consultar_processo_punitivo', () => {
    it('calls browser.consultarProcessosPunitivos()', async () => {
      setupCompanyWithTasks([
        makeTask({ tipo_acao: 'consultar_processo_punitivo', payload: {} }),
      ])

      await syncEmpresa('company-test')

      expect(mockBrowser.consultarProcessosPunitivos).toHaveBeenCalled()
    })
  })

  describe('Task: enviar_defesa_punitivo', () => {
    it('calls browser.enviarDefesaPunitivo(numero, {fundamentacao})', async () => {
      setupCompanyWithTasks([
        makeTask({
          tipo_acao: 'enviar_defesa_punitivo',
          payload: { numero_processo: 'PUN-001', texto: 'Defesa formal' },
        }),
      ])

      await syncEmpresa('company-test')

      expect(mockBrowser.enviarDefesaPunitivo).toHaveBeenCalledWith(
        'PUN-001',
        expect.objectContaining({ fundamentacao: 'Defesa formal' }),
      )
    })
  })

  describe('Task: interpor_recurso_punitivo', () => {
    it('calls browser.interporRecursoPunitivo(numero, {fundamentacao})', async () => {
      setupCompanyWithTasks([
        makeTask({
          tipo_acao: 'interpor_recurso_punitivo',
          payload: { numero_processo: 'PUN-002', texto: 'Recurso aqui' },
        }),
      ])

      await syncEmpresa('company-test')

      expect(mockBrowser.interporRecursoPunitivo).toHaveBeenCalledWith(
        'PUN-002',
        expect.objectContaining({ fundamentacao: 'Recurso aqui' }),
      )
    })
  })

  describe('Task: gerar_gru_multa', () => {
    it('calls browser.gerarGruMulta(numero_processo)', async () => {
      setupCompanyWithTasks([
        makeTask({
          tipo_acao: 'gerar_gru_multa',
          payload: { numero_processo: 'PUN-003' },
        }),
      ])

      await syncEmpresa('company-test')

      expect(mockBrowser.gerarGruMulta).toHaveBeenCalledWith('PUN-003')
    })
  })

  describe('Task: declarar_pagamento_multa', () => {
    it('calls browser.declararPagamentoMulta(numero, gru)', async () => {
      setupCompanyWithTasks([
        makeTask({
          tipo_acao: 'declarar_pagamento_multa',
          payload: { numero_processo: 'PUN-004', gru_linha_digitavel: '12345' },
        }),
      ])

      await syncEmpresa('company-test')

      expect(mockBrowser.declararPagamentoMulta).toHaveBeenCalledWith('PUN-004', '12345')
    })
  })

  describe('Task: restituicao_multa', () => {
    it('calls browser.solicitarRestituicaoMulta(numero, justificativa)', async () => {
      setupCompanyWithTasks([
        makeTask({
          tipo_acao: 'restituicao_multa',
          payload: { numero_processo: 'PUN-005', justificativa: 'Pagamento indevido' },
        }),
      ])

      await syncEmpresa('company-test')

      expect(mockBrowser.solicitarRestituicaoMulta).toHaveBeenCalledWith('PUN-005', 'Pagamento indevido')
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // Module: Turma
  // ═══════════════════════════════════════════════════════════════════

  describe('Task: criar_turma', () => {
    it('calls browser.criarTurma with full payload', async () => {
      const payload = {
        nomeTurma: 'Turma A2026',
        tipoCurso: 'Vigilância Patrimonial',
        dataInicio: '2026-04-01',
        dataFim: '2026-06-30',
        local: 'São Paulo',
      }
      setupCompanyWithTasks([makeTask({ tipo_acao: 'criar_turma', payload })])

      await syncEmpresa('company-test')

      expect(mockBrowser.criarTurma).toHaveBeenCalledWith(
        expect.objectContaining({ nomeTurma: 'Turma A2026' }),
      )
    })
  })

  describe('Task: enviar_turma', () => {
    it('calls browser.enviarTurma(turma_id)', async () => {
      setupCompanyWithTasks([
        makeTask({ tipo_acao: 'enviar_turma', payload: { turma_id: 'turma-001' } }),
      ])

      await syncEmpresa('company-test')

      expect(mockBrowser.enviarTurma).toHaveBeenCalledWith('turma-001')
    })
  })

  describe('Task: adicionar_aluno_turma', () => {
    it('calls browser.importarAlunosTurma(turma_id, xml)', async () => {
      setupCompanyWithTasks([
        makeTask({
          tipo_acao: 'adicionar_aluno_turma',
          payload: { turma_id: 'turma-002', xml_content: '<alunos></alunos>' },
        }),
      ])

      await syncEmpresa('company-test')

      expect(mockBrowser.importarAlunosTurma).toHaveBeenCalledWith(
        'turma-002',
        '<alunos></alunos>',
      )
    })
  })

  describe('Turma lifecycle communications', () => {
    it('comunicar_inicio_turma calls browser.comunicarInicioTurma()', async () => {
      setupCompanyWithTasks([
        makeTask({ tipo_acao: 'comunicar_inicio_turma', payload: { turma_id: 'T-001' } }),
      ])

      await syncEmpresa('company-test')

      expect(mockBrowser.comunicarInicioTurma).toHaveBeenCalledWith('T-001')
    })

    it('comunicar_conclusao_turma calls browser.comunicarConclusaoTurma()', async () => {
      setupCompanyWithTasks([
        makeTask({ tipo_acao: 'comunicar_conclusao_turma', payload: { turma_id: 'T-002' } }),
      ])

      await syncEmpresa('company-test')

      expect(mockBrowser.comunicarConclusaoTurma).toHaveBeenCalledWith('T-002')
    })

    it('comunicar_cancelamento_turma calls browser with turma_id and motivo', async () => {
      setupCompanyWithTasks([
        makeTask({
          tipo_acao: 'comunicar_cancelamento_turma',
          payload: { turma_id: 'T-003', motivo: 'Falta de alunos' },
        }),
      ])

      await syncEmpresa('company-test')

      expect(mockBrowser.comunicarCancelamentoTurma).toHaveBeenCalledWith('T-003', 'Falta de alunos')
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // Module: Importação XML
  // ═══════════════════════════════════════════════════════════════════

  describe('Importação XML tasks', () => {
    it('importar_pessoas_xml calls browser.importarXml("pessoa", xml)', async () => {
      setupCompanyWithTasks([
        makeTask({
          tipo_acao: 'importar_pessoas_xml',
          payload: { xml_content: '<pessoas></pessoas>' },
        }),
      ])

      await syncEmpresa('company-test')

      expect(mockBrowser.importarXml).toHaveBeenCalledWith('pessoa', '<pessoas></pessoas>')
    })

    it('importar_veiculos_xml calls browser.importarXml("veiculo", xml)', async () => {
      setupCompanyWithTasks([
        makeTask({
          tipo_acao: 'importar_veiculos_xml',
          payload: { xml_content: '<veiculos></veiculos>' },
        }),
      ])

      await syncEmpresa('company-test')

      expect(mockBrowser.importarXml).toHaveBeenCalledWith('veiculo', '<veiculos></veiculos>')
    })

    it('importar_alunos_xml calls browser.importarXml("aluno", xml)', async () => {
      setupCompanyWithTasks([
        makeTask({
          tipo_acao: 'importar_alunos_xml',
          payload: { xml_content: '<alunos></alunos>' },
        }),
      ])

      await syncEmpresa('company-test')

      expect(mockBrowser.importarXml).toHaveBeenCalledWith('aluno', '<alunos></alunos>')
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // Module: Guia de Transporte
  // ═══════════════════════════════════════════════════════════════════

  describe('Task: criar_guia_transporte', () => {
    it('calls browser.criarGuiaTransporte with full payload', async () => {
      const payload = {
        origemCidade: 'São Paulo',
        origemUf: 'SP',
        destinoCidade: 'Rio de Janeiro',
        destinoUf: 'RJ',
        dataTransporte: '2026-04-15',
        responsavelNome: 'Carlos Silva',
        responsavelCpf: '123.456.789-10',
        veiculoPlaca: 'ABC-1234',
      }
      setupCompanyWithTasks([makeTask({ tipo_acao: 'criar_guia_transporte', payload })])

      await syncEmpresa('company-test')

      expect(mockBrowser.criarGuiaTransporte).toHaveBeenCalledWith(
        expect.objectContaining({ origemCidade: 'São Paulo', destinoUf: 'RJ' }),
      )
    })
  })

  describe('Task: enviar_guia', () => {
    it('calls browser.enviarGuiaTransporte(guia_id)', async () => {
      setupCompanyWithTasks([
        makeTask({ tipo_acao: 'enviar_guia', payload: { guia_id: 'guia-001' } }),
      ])

      await syncEmpresa('company-test')

      expect(mockBrowser.enviarGuiaTransporte).toHaveBeenCalledWith('guia-001')
    })
  })

  describe('Guia de Transporte variants', () => {
    it('criar_guia_transporte_transferencia uses criarGuiaTransporte', async () => {
      setupCompanyWithTasks([
        makeTask({
          tipo_acao: 'criar_guia_transporte_transferencia',
          payload: {
            origemCidade: 'Belo Horizonte', origemUf: 'MG',
            destinoCidade: 'Brasília', destinoUf: 'DF',
            dataTransporte: '2026-05-01',
            responsavelNome: 'João', responsavelCpf: '000.111.222-33',
          },
        }),
      ])

      await syncEmpresa('company-test')

      expect(mockBrowser.criarGuiaTransporte).toHaveBeenCalled()
    })

    it('criar_guia_coletes_destruicao uses criarGuiaTransporte', async () => {
      setupCompanyWithTasks([
        makeTask({
          tipo_acao: 'criar_guia_coletes_destruicao',
          payload: {
            origemCidade: 'Curitiba', origemUf: 'PR',
            destinoCidade: 'São Paulo', destinoUf: 'SP',
            dataTransporte: '2026-05-10',
            responsavelNome: 'Pedro', responsavelCpf: '444.555.666-77',
          },
        }),
      ])

      await syncEmpresa('company-test')

      expect(mockBrowser.criarGuiaTransporte).toHaveBeenCalled()
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // Module: Comunicação de Ocorrência / Evento
  // ═══════════════════════════════════════════════════════════════════

  describe('Task: comunicacao_ocorrencia', () => {
    it('calls browser.criarComunicacaoOcorrencia with full payload', async () => {
      const payload = {
        tipo: 'roubo',
        dataOcorrencia: '2026-04-01',
        horaOcorrencia: '02:30',
        localOcorrencia: 'Rua das Flores, 500',
        descricao: 'Roubo de arma de fogo',
        boletimOcorrencia: '2026/001234',
      }
      setupCompanyWithTasks([makeTask({ tipo_acao: 'comunicacao_ocorrencia', payload })])

      await syncEmpresa('company-test')

      expect(mockBrowser.criarComunicacaoOcorrencia).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'roubo', localOcorrencia: 'Rua das Flores, 500' }),
      )
    })
  })

  describe('Task: comunicacao_evento', () => {
    it('calls browser.criarComunicacaoEvento with full payload', async () => {
      const payload = {
        tipoEvento: 'treinamento',
        nomeEvento: 'Treinamento de Vigilância Armada',
        armaFogo: true,
        dataInicio: '2026-04-20',
        vigilantesCpfs: ['123.456.789-10', '987.654.321-00'],
      }
      setupCompanyWithTasks([makeTask({ tipo_acao: 'comunicacao_evento', payload })])

      await syncEmpresa('company-test')

      expect(mockBrowser.criarComunicacaoEvento).toHaveBeenCalledWith(
        expect.objectContaining({ tipoEvento: 'treinamento', armaFogo: true }),
      )
    })
  })

  describe('Task: enviar_complementacao_ocorrencia', () => {
    it('calls browser.enviarComplementacaoOcorrencia(protocolo, {descricao, arquivos})', async () => {
      setupCompanyWithTasks([
        makeTask({
          tipo_acao: 'enviar_complementacao_ocorrencia',
          payload: { protocolo_fase1: 'OCOR-001', texto: 'Complementação', documentos: undefined },
        }),
      ])

      await syncEmpresa('company-test')

      expect(mockBrowser.enviarComplementacaoOcorrencia).toHaveBeenCalledWith(
        'OCOR-001',
        expect.objectContaining({ descricao: 'Complementação' }),
      )
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // Module: Credenciamento de Instrutores
  // ═══════════════════════════════════════════════════════════════════

  describe('Task: credenciamento_instrutor', () => {
    it('calls browser.solicitarCredenciamentoInstrutor with payload', async () => {
      const payload = {
        cpfInstrutor: '111.222.333-44',
        nomeInstrutor: 'Carlos Instrutor',
        disciplina: 'Tiro Defensivo',
        certidoesBuffers: [],
      }
      setupCompanyWithTasks([makeTask({ tipo_acao: 'credenciamento_instrutor', payload })])

      await syncEmpresa('company-test')

      expect(mockBrowser.solicitarCredenciamentoInstrutor).toHaveBeenCalledWith(
        expect.objectContaining({ cpfInstrutor: '111.222.333-44' }),
      )
    })
  })

  describe('Task: renovar_credenciamento_instrutor', () => {
    it('reuses solicitarCredenciamentoInstrutor for renewal', async () => {
      const payload = {
        cpfInstrutor: '555.666.777-88',
        nomeInstrutor: 'Maria Instrutora',
        disciplina: 'Defesa Pessoal',
        certidoesBuffers: [],
      }
      setupCompanyWithTasks([makeTask({ tipo_acao: 'renovar_credenciamento_instrutor', payload })])

      await syncEmpresa('company-test')

      expect(mockBrowser.solicitarCredenciamentoInstrutor).toHaveBeenCalledWith(
        expect.objectContaining({ cpfInstrutor: '555.666.777-88' }),
      )
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // Module: CNV (Carteira Nacional de Vigilante)
  // ═══════════════════════════════════════════════════════════════════

  describe('Task: solicitar_cnv', () => {
    it('calls browser.solicitarCNV with cpf string', async () => {
      const payload = {
        cpfVigilante: '123.456.789-10',
        gruLinhaDigitavel: '12345.67890 12345.678901',
      }
      setupCompanyWithTasks([makeTask({ tipo_acao: 'solicitar_cnv', payload })])

      await syncEmpresa('company-test')

      expect(mockBrowser.solicitarCNV).toHaveBeenCalledWith('123.456.789-10')
    })
  })

  describe('Task: imprimir_cnv', () => {
    it('calls browser.imprimirCNV(cpf)', async () => {
      setupCompanyWithTasks([
        makeTask({ tipo_acao: 'imprimir_cnv', payload: { cpf_vigilante: '123.456.789-10' } }),
      ])

      await syncEmpresa('company-test')

      expect(mockBrowser.imprimirCNV).toHaveBeenCalledWith('123.456.789-10')
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // Module: Notificação Autônoma
  // ═══════════════════════════════════════════════════════════════════

  describe('Task: responder_notificacao', () => {
    it('calls browser.responderNotificacao with notification number and text', async () => {
      setupCompanyWithTasks([
        makeTask({
          tipo_acao: 'responder_notificacao',
          payload: { numero_notificacao: 'NOT-001', texto: 'Resposta formal' },
        }),
      ])

      await syncEmpresa('company-test')

      expect(mockBrowser.responderNotificacao).toHaveBeenCalledWith(
        'NOT-001',
        expect.objectContaining({ texto: 'Resposta formal' })
      )
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // Module: Consulta GRU
  // ═══════════════════════════════════════════════════════════════════

  describe('Task: consultar_gru', () => {
    it('calls browser.consultarGru(linha_digitavel)', async () => {
      setupCompanyWithTasks([
        makeTask({
          tipo_acao: 'consultar_gru',
          payload: { linha_digitavel: '12345.67890 12345' },
        }),
      ])

      await syncEmpresa('company-test')

      expect(mockBrowser.consultarGru).toHaveBeenCalledWith('12345.67890 12345')
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // Module: Processo Bancário
  // ═══════════════════════════════════════════════════════════════════

  describe('Processo Bancário tasks', () => {
    it('solicitar_recadastramento_bancario calls the correct method', async () => {
      setupCompanyWithTasks([
        makeTask({
          tipo_acao: 'solicitar_recadastramento_bancario',
          payload: { nomeInstituicao: 'Banco X' },
        }),
      ])

      await syncEmpresa('company-test')

      expect(mockBrowser.solicitarRecadastramentoBancario).toHaveBeenCalledWith(
        expect.objectContaining({ nomeInstituicao: 'Banco X' }),
      )
    })

    it('solicitar_plano_seguranca_nova_agencia calls the correct method', async () => {
      setupCompanyWithTasks([
        makeTask({
          tipo_acao: 'solicitar_plano_seguranca_nova_agencia',
          payload: { nomeAgencia: 'Agência Centro', enderecoAgencia: 'Rua A, 100' },
        }),
      ])

      await syncEmpresa('company-test')

      expect(mockBrowser.solicitarPlanoSegurancaNovaAgencia).toHaveBeenCalled()
    })

    it('solicitar_renovacao_plano_sem_alteracao calls solicitarRenovacaoPlanoAumento', async () => {
      setupCompanyWithTasks([
        makeTask({
          tipo_acao: 'solicitar_renovacao_plano_sem_alteracao',
          payload: { numeroPlanoAnterior: 'PL-001' },
        }),
      ])

      await syncEmpresa('company-test')

      expect(mockBrowser.solicitarRenovacaoPlanoAumento).toHaveBeenCalled()
    })

    it('solicitar_renovacao_plano_com_reducao calls solicitarRenovacaoPlanoAumento', async () => {
      setupCompanyWithTasks([
        makeTask({
          tipo_acao: 'solicitar_renovacao_plano_com_reducao',
          payload: { numeroPlanoAnterior: 'PL-002' },
        }),
      ])

      await syncEmpresa('company-test')

      expect(mockBrowser.solicitarRenovacaoPlanoAumento).toHaveBeenCalled()
    })

    it('solicitar_plano_emergencial calls the correct method', async () => {
      setupCompanyWithTasks([
        makeTask({
          tipo_acao: 'solicitar_plano_emergencial',
          payload: { nomeAgencia: 'Agência Emergência' },
        }),
      ])

      await syncEmpresa('company-test')

      expect(mockBrowser.solicitarPlanoEmergencial).toHaveBeenCalled()
    })

    it('solicitar_plano_mudanca_endereco calls the correct method', async () => {
      setupCompanyWithTasks([
        makeTask({
          tipo_acao: 'solicitar_plano_mudanca_endereco',
          payload: { novoEndereco: 'Rua B, 200' },
        }),
      ])

      await syncEmpresa('company-test')

      expect(mockBrowser.solicitarPlanoMudancaEndereco).toHaveBeenCalled()
    })

    it('editar_rascunho_bancario calls editarRascunhoBancario(numero)', async () => {
      setupCompanyWithTasks([
        makeTask({
          tipo_acao: 'editar_rascunho_bancario',
          payload: { numero_rascunho: 'RASC-001' },
        }),
      ])

      await syncEmpresa('company-test')

      expect(mockBrowser.editarRascunhoBancario).toHaveBeenCalledWith('RASC-001')
    })

    it('responder_notificacao_bancario calls the correct method', async () => {
      setupCompanyWithTasks([
        makeTask({
          tipo_acao: 'responder_notificacao_bancario',
          payload: { numero_notificacao: 'NB-001', texto: 'Resposta' },
        }),
      ])

      await syncEmpresa('company-test')

      expect(mockBrowser.responderNotificacaoBancaria).toHaveBeenCalledWith(
        'NB-001',
        expect.objectContaining({ texto: 'Resposta' }),
      )
    })

    it('interpor_recurso_bancario calls the correct method', async () => {
      setupCompanyWithTasks([
        makeTask({
          tipo_acao: 'interpor_recurso_bancario',
          payload: { numero_processo: 'PB-001', fundamentacao: 'Fundamento legal' },
        }),
      ])

      await syncEmpresa('company-test')

      expect(mockBrowser.interporRecursoBancario).toHaveBeenCalledWith(
        'PB-001',
        expect.objectContaining({ fundamentacao: 'Fundamento legal' }),
      )
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // Protocol Handling & R2 Upload
  // ═══════════════════════════════════════════════════════════════════

  describe('Protocol Handling', () => {
    it('uploads printAntes and printDepois to R2', async () => {
      setupCompanyWithTasks([
        makeTask({
          id: 'task-upload',
          tipo_acao: 'enviar_processo',
          payload: { processo_id: 'proc-1' },
        }),
      ])

      await syncEmpresa('company-test')

      expect(uploadToR2).toHaveBeenCalledTimes(2) // antes + depois
      expect(r2Path).toHaveBeenCalledWith(
        'company-test',
        'gesp_prints',
        'task-upload-antes.png',
        expect.any(String),
      )
    })

    it('sends confirmation email (R8) after task success', async () => {
      setupCompanyWithTasks([
        makeTask({
          tipo_acao: 'enviar_processo',
          payload: { processo_id: 'proc-1' },
        }),
      ])

      await syncEmpresa('company-test')

      expect(addEmailSendJob).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 'company-test',
          templateId: 'B',
          mode: 'CLIENTE_HTML',
          to: 'admin@test.com',
          subject: expect.stringContaining('enviar_processo'),
          payload: expect.objectContaining({
            protocoloGesp: 'GESP-2026-001',
          }),
        }),
      )
    })

    it('returns tasks_executed count', async () => {
      setupCompanyWithTasks([
        makeTask({ id: 't1', tipo_acao: 'enviar_processo', payload: { processo_id: 'p1' } }),
        makeTask({ id: 't2', tipo_acao: 'enviar_processo', payload: { processo_id: 'p2' } }),
        makeTask({ id: 't3', tipo_acao: 'enviar_processo', payload: { processo_id: 'p3' } }),
      ])

      const result = await syncEmpresa('company-test')

      expect(result.tasks_executed).toBe(3)
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // Error Handling & Retry (R6)
  // ═══════════════════════════════════════════════════════════════════

  describe('Error Handling & Retry', () => {
    it('marks task as "retry" when tentativas < max_tentativas', async () => {
      mockBrowser.enviarProcesso.mockRejectedValue(new Error('Connection timeout'))

      setupCompanyWithTasks([
        makeTask({
          id: 'task-retry',
          tipo_acao: 'enviar_processo',
          payload: { processo_id: 'proc-1' },
          tentativas: 0,
          max_tentativas: 3,
        }),
      ])

      await syncEmpresa('company-test')

      // The update call should have status: 'retry'
      expect(db.calls.update).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ status: 'retry', erro_detalhe: 'Connection timeout' }),
        ]),
      )
    })

    it('marks task as "erro" when tentativas >= max_tentativas', async () => {
      mockBrowser.enviarProcesso.mockRejectedValue(new Error('Permanent failure'))

      setupCompanyWithTasks([
        makeTask({
          id: 'task-error',
          tipo_acao: 'enviar_processo',
          payload: { processo_id: 'proc-1' },
          tentativas: 2, // +1 = 3, which equals max_tentativas
          max_tentativas: 3,
        }),
      ])

      await syncEmpresa('company-test')

      expect(db.calls.update).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ status: 'erro', erro_detalhe: 'Permanent failure' }),
        ]),
      )
    })

    it('continues processing remaining tasks after one fails', async () => {
      // First task fails, second succeeds
      mockBrowser.enviarProcesso
        .mockRejectedValueOnce(new Error('First fails'))
        .mockResolvedValueOnce({
          protocolo: 'GESP-OK',
          printAntes: Buffer.from('b'),
          printDepois: Buffer.from('a'),
        })

      setupCompanyWithTasks([
        makeTask({ id: 't-fail', tipo_acao: 'enviar_processo', payload: { processo_id: 'p1' } }),
        makeTask({ id: 't-ok', tipo_acao: 'enviar_processo', payload: { processo_id: 'p2' } }),
      ])

      const result = await syncEmpresa('company-test')

      // One succeeded
      expect(result.tasks_executed).toBe(1)
      expect(mockBrowser.enviarProcesso).toHaveBeenCalledTimes(2)
    })

    it('stores error message in task record', async () => {
      const errorMsg = 'GESP returned 500: Internal Server Error'
      mockBrowser.enviarProcesso.mockRejectedValue(new Error(errorMsg))

      setupCompanyWithTasks([
        makeTask({ tipo_acao: 'enviar_processo', payload: { processo_id: 'p1' } }),
      ])

      await syncEmpresa('company-test')

      expect(db.calls.update).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ erro_detalhe: errorMsg }),
        ]),
      )
    })
  })

  // ═══════════════════════════════════════════════════════════════════
  // Unknown Task Type
  // ═══════════════════════════════════════════════════════════════════

  describe('Unknown task type', () => {
    it('handles unknown tipo_acao with generic screenshot', async () => {
      setupCompanyWithTasks([
        makeTask({ tipo_acao: 'tipo_inventado_xyz', payload: {} }),
      ])

      await syncEmpresa('company-test')

      expect(mockBrowser.screenshot).toHaveBeenCalledWith('antes-unknown')
      expect(mockBrowser.screenshot).toHaveBeenCalledWith('depois-unknown')
    })
  })
})
