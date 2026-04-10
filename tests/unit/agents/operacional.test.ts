import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  runOperacionalGESP,
  runOperacionalCompliance,
  runOperacionalWorkflow,
} from '@/lib/agents/operacional'

// Mock all external dependencies
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseAdmin: vi.fn(() => {
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'company-123', razao_social: 'Test Company', cnpj: '12.345.678/0001-90' },
        error: null
      }),
    }

    return {
      from: vi.fn(function(table: string) {
        mockChain.select.mockReturnThis()
        mockChain.eq.mockReturnThis()
        mockChain.insert.mockReturnThis()
        mockChain.update.mockReturnThis()
        mockChain.order.mockReturnThis()
        mockChain.single.mockResolvedValue({
          data: { id: 'test-id', razao_social: 'Test Company' },
          error: null
        })
        return mockChain
      }),
    }
  }),
}))

vi.mock('@/lib/agents/base', () => ({
  startAgentRun: vi.fn().mockResolvedValue('run-operacional-123'),
  completeAgentRun: vi.fn().mockResolvedValue(undefined),
  logAgentDecision: vi.fn().mockResolvedValue({ decisionId: 'decision-123' }),
  TokenTracker: vi.fn(function() {
    this.total = 500
    this.cost = 0.02
    this.stats = {
      cacheRead: 50,
      cacheWrite: 25,
      steps: 4,
    }
  }),
  createStep: vi.fn((step) => step),
  startStep: vi.fn((step) => ({ ...step, status: 'running', startedAt: new Date().toISOString() })),
  completeStep: vi.fn((step, output) => ({ ...step, status: 'completed', output, completedAt: new Date().toISOString() })),
  failStep: vi.fn((step, error) => ({ ...step, status: 'failed', error })),
}))

vi.mock('@/lib/gesp/sync', () => ({
  syncEmpresa: vi.fn().mockResolvedValue({
    tasks_executed: 3,
    screenshots: [],
  }),
}))

vi.mock('@/lib/compliance/engine', () => ({
  checkComplianceEmpresa: vi.fn().mockResolvedValue({
    checks_realizados: 5,
  }),
  runComplianceCheck: vi.fn().mockResolvedValue({
    checks_realizados: 5,
    alertas_enviados: 3,
    alertas_parados: 2,
  }),
}))

vi.mock('@/lib/security/billing-gate', () => ({
  checkBillingGate: vi.fn().mockResolvedValue({
    allowed: true,
    status: 'ativo',
  }),
  isOperationAllowed: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/lib/queue/jobs', () => ({
  addEmailSendJob: vi.fn().mockResolvedValue({ id: 'job-email' }),
  addGespSyncJob: vi.fn().mockResolvedValue({ id: 'job-sync' }),
}))

vi.mock('@/lib/config/constants', () => ({
  EMAIL_EQUIPE: 'team@vigi.com.br',
  ALERT_THRESHOLDS: {
    critical: 5,
    warning: 15,
  },
}))

describe('Operacional Agent - GESP Processing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('runOperacionalGESP', () => {
    it('should execute GESP sync and return OperacionalState', async () => {
      const result = await runOperacionalGESP('company-123', 'manual_sync')

      expect(result).toBeDefined()
      expect(result.agentName).toBe('operacional')
      expect(result.companyId).toBe('company-123')
    })

    it('should set runId from startAgentRun', async () => {
      const result = await runOperacionalGESP('company-123', 'manual_sync')

      expect(result.runId).toBeDefined()
      expect(typeof result.runId).toBe('string')
    })

    it('should apply billing gate check (R3)', async () => {
      const { checkBillingGate } = await import('@/lib/security/billing-gate')
      const mockBillingGate = vi.mocked(checkBillingGate)

      await runOperacionalGESP('company-123', 'manual_sync')

      expect(mockBillingGate).toHaveBeenCalledWith('company-123')
    })

    it('should block GESP when billing is inactive', async () => {
      const { checkBillingGate } = await import('@/lib/security/billing-gate')
      const mockBillingGate = vi.mocked(checkBillingGate)

      mockBillingGate.mockResolvedValueOnce({
        allowed: false,
        status: 'suspenso',
        reason: 'Billing suspended',
      })

      const result = await runOperacionalGESP('company-123', 'manual_sync')

      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('should fetch company data before sync', async () => {
      const result = await runOperacionalGESP('company-123', 'manual_sync')

      expect(result).toBeDefined()
      expect(result.agentName).toBe('operacional')
    })

    it('should call syncEmpresa with company ID', async () => {
      const { syncEmpresa } = await import('@/lib/gesp/sync')
      const mockSync = vi.mocked(syncEmpresa)

      await runOperacionalGESP('company-123', 'manual_sync')

      expect(mockSync).toHaveBeenCalledWith('company-123')
    })

    it('should track GESP tasks executed', async () => {
      const { syncEmpresa } = await import('@/lib/gesp/sync')
      const mockSync = vi.mocked(syncEmpresa)

      mockSync.mockResolvedValueOnce({
        tasks_executed: 5,
        screenshots: [],
      })

      const result = await runOperacionalGESP('company-123', 'manual_sync')

      expect(result.gespTasksCompleted).toBe(5)
    })

    it('should create GESP session ID', async () => {
      const result = await runOperacionalGESP('company-123', 'manual_sync')

      expect(result.gespSessionId).toBeDefined()
      expect(result.gespSessionId).toContain('GESP-')
    })

    it('should log GESP decision', async () => {
      const { logAgentDecision } = await import('@/lib/agents/base')
      const mockLog = vi.mocked(logAgentDecision)

      await runOperacionalGESP('company-123', 'manual_sync')

      expect(mockLog).toHaveBeenCalled()
    })

    it('should complete agent run successfully', async () => {
      const { completeAgentRun } = await import('@/lib/agents/base')
      const mockComplete = vi.mocked(completeAgentRun)

      await runOperacionalGESP('company-123', 'manual_sync')

      expect(mockComplete).toHaveBeenCalled()
    })

    it('should track token usage', async () => {
      const result = await runOperacionalGESP('company-123', 'manual_sync')

      expect(result.totalTokens).toBeGreaterThanOrEqual(0)
      expect(result.cacheReadTokens).toBeGreaterThanOrEqual(0)
      expect(result.cacheWriteTokens).toBeGreaterThanOrEqual(0)
    })

    it('should initialize state with proper steps array', async () => {
      const result = await runOperacionalGESP('company-123', 'manual_sync')

      expect(result.steps).toBeDefined()
      expect(Array.isArray(result.steps)).toBe(true)
    })

    it('should handle sync errors gracefully', async () => {
      const { syncEmpresa } = await import('@/lib/gesp/sync')
      const mockSync = vi.mocked(syncEmpresa)

      mockSync.mockRejectedValueOnce(new Error('Browser crashed'))

      const result = await runOperacionalGESP('company-123', 'manual_sync')

      expect(result.errors.length).toBeGreaterThan(0)
    })
  })
})

describe('Operacional Agent - Compliance Processing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('runOperacionalCompliance', () => {
    it('should perform compliance checks and return OperacionalState', async () => {
      const result = await runOperacionalCompliance('company-123')

      expect(result).toBeDefined()
      expect(result.agentName).toBe('operacional')
      expect(result.companyId).toBe('company-123')
    })

    it('should call runComplianceCheck with company ID', async () => {
      const { runComplianceCheck } = await import('@/lib/compliance/engine')
      const mockCompliance = vi.mocked(runComplianceCheck)

      await runOperacionalCompliance('company-123')

      expect(mockCompliance).toHaveBeenCalledWith('company-123')
    })

    it('should track alerts sent from compliance result', async () => {
      const { runComplianceCheck } = await import('@/lib/compliance/engine')
      const mockCompliance = vi.mocked(runComplianceCheck)

      mockCompliance.mockResolvedValueOnce({
        checks_realizados: 5,
        alertas_enviados: 3,
        alertas_parados: 1,
      })

      const result = await runOperacionalCompliance('company-123')

      expect(result.alertsSent).toBe(3)
    })

    it('should track alerts stopped', async () => {
      const { runComplianceCheck } = await import('@/lib/compliance/engine')
      const mockCompliance = vi.mocked(runComplianceCheck)

      mockCompliance.mockResolvedValueOnce({
        checks_realizados: 5,
        alertas_enviados: 3,
        alertas_parados: 2,
      })

      const result = await runOperacionalCompliance('company-123')

      expect(result.alertsStopped).toBe(2)
    })

    it('should allow compliance checks with suspended billing (legal exception)', async () => {
      const { checkBillingGate } = await import('@/lib/security/billing-gate')
      const mockBillingGate = vi.mocked(checkBillingGate)

      mockBillingGate.mockResolvedValueOnce({
        allowed: false,
        status: 'suspenso',
      })

      const result = await runOperacionalCompliance('company-123')

      // Compliance proceeds even if billing is suspended (legal exception for CNV/alvará)
      expect(result).toBeDefined()
    })

    it('should handle compliance check failure', async () => {
      const { runComplianceCheck } = await import('@/lib/compliance/engine')
      const mockCompliance = vi.mocked(runComplianceCheck)

      mockCompliance.mockRejectedValueOnce(new Error('Database error'))

      const result = await runOperacionalCompliance('company-123')

      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('should log compliance decision', async () => {
      const { logAgentDecision } = await import('@/lib/agents/base')
      const mockLog = vi.mocked(logAgentDecision)

      await runOperacionalCompliance('company-123')

      expect(mockLog).toHaveBeenCalled()
    })

    it('should complete agent run', async () => {
      const { completeAgentRun } = await import('@/lib/agents/base')
      const mockComplete = vi.mocked(completeAgentRun)

      await runOperacionalCompliance('company-123')

      expect(mockComplete).toHaveBeenCalled()
    })

    it('should fetch company data', async () => {
      const result = await runOperacionalCompliance('company-123')

      expect(result).toBeDefined()
      expect(result.companyId).toBe('company-123')
    })

    it('should initialize billing gate check step', async () => {
      const result = await runOperacionalCompliance('company-123')

      expect(result.steps).toBeDefined()
      expect(result.steps.length).toBeGreaterThan(0)
    })
  })
})

describe('Operacional Agent - Workflow Processing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('runOperacionalWorkflow', () => {
    it('should process workflow and return OperacionalState', async () => {
      const result = await runOperacionalWorkflow(
        'company-123',
        'workflow-456',
        'novo_vigilante',
        { employee_name: 'João Silva', cpf: '123.456.789-00' }
      )

      expect(result).toBeDefined()
      expect(result.agentName).toBe('operacional')
      expect(result.workflowId).toBe('workflow-456')
    })

    it('should store workflow parameters in state', async () => {
      const dadosExtraidos = { employee_name: 'João Silva' }

      const result = await runOperacionalWorkflow(
        'company-123',
        'workflow-456',
        'novo_vigilante',
        dadosExtraidos
      )

      expect(result.tipoDemanda).toBe('novo_vigilante')
      expect(result.dadosExtraidos).toEqual(dadosExtraidos)
    })

    it('should apply billing gate for workflows', async () => {
      const { isOperationAllowed } = await import('@/lib/security/billing-gate')
      const mockAllowed = vi.mocked(isOperationAllowed)

      await runOperacionalWorkflow(
        'company-123',
        'workflow-456',
        'novo_vigilante',
        {}
      )

      expect(mockAllowed).toHaveBeenCalled()
    })

    it('should classify arma as critical operation', async () => {
      const result = await runOperacionalWorkflow(
        'company-123',
        'workflow-456',
        'arma',
        { weapon_type: 'pistola' }
      )

      expect(result.needsHumanApproval).toBe(true)
    })

    it('should classify arma_adicional as critical', async () => {
      const result = await runOperacionalWorkflow(
        'company-123',
        'workflow-456',
        'arma_adicional',
        {}
      )

      expect(result.needsHumanApproval).toBe(true)
    })

    it('should classify encerramento as critical', async () => {
      const result = await runOperacionalWorkflow(
        'company-123',
        'workflow-456',
        'encerramento',
        {}
      )

      expect(result.needsHumanApproval).toBe(true)
    })

    it('should classify destruicao as critical', async () => {
      const result = await runOperacionalWorkflow(
        'company-123',
        'workflow-456',
        'destruicao',
        {}
      )

      expect(result.needsHumanApproval).toBe(true)
    })

    it('should classify novo_vigilante as non-critical', async () => {
      const result = await runOperacionalWorkflow(
        'company-123',
        'workflow-456',
        'novo_vigilante',
        {}
      )

      expect(result.needsHumanApproval).toBe(false)
    })

    it('should queue critical operations for human approval', async () => {
      const { addEmailSendJob } = await import('@/lib/queue/jobs')
      const mockEmailJob = vi.mocked(addEmailSendJob)

      await runOperacionalWorkflow(
        'company-123',
        'workflow-456',
        'arma',
        {}
      )

      expect(mockEmailJob).toHaveBeenCalled()
    })

    it('should execute non-critical operations immediately', async () => {
      const result = await runOperacionalWorkflow(
        'company-123',
        'workflow-456',
        'novo_vigilante',
        {}
      )

      expect(result.needsHumanApproval).toBe(false)
      expect(result.gespTasksCompleted).toBeGreaterThanOrEqual(0)
    })

    it('should queue GESP sync job for non-critical ops', async () => {
      const { addGespSyncJob } = await import('@/lib/queue/jobs')
      const mockGespJob = vi.mocked(addGespSyncJob)

      await runOperacionalWorkflow(
        'company-123',
        'workflow-456',
        'novo_vigilante',
        {}
      )

      expect(mockGespJob).toHaveBeenCalled()
    })

    it('should set humanApprovalReason for critical ops', async () => {
      const result = await runOperacionalWorkflow(
        'company-123',
        'workflow-456',
        'arma',
        {}
      )

      expect(result.humanApprovalReason).toBeDefined()
      expect(result.humanApprovalReason).toContain('arma')
    })

    it('should handle workflow with extracted data', async () => {
      const extractedData = {
        employee_name: 'João Silva',
        cpf: '123.456.789-00',
        company_name: 'Security Corp',
        cnpj: '12.345.678/0001-90',
      }

      const result = await runOperacionalWorkflow(
        'company-123',
        'workflow-456',
        'novo_vigilante',
        extractedData
      )

      expect(result.dadosExtraidos).toEqual(extractedData)
    })

    it('should handle blocked workflow due to billing', async () => {
      const { isOperationAllowed } = await import('@/lib/security/billing-gate')
      const mockAllowed = vi.mocked(isOperationAllowed)

      mockAllowed.mockResolvedValueOnce(false)

      const result = await runOperacionalWorkflow(
        'company-123',
        'workflow-456',
        'novo_vigilante',
        {}
      )

      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('should log workflow classification decision', async () => {
      const { logAgentDecision } = await import('@/lib/agents/base')
      const mockLog = vi.mocked(logAgentDecision)

      await runOperacionalWorkflow(
        'company-123',
        'workflow-456',
        'novo_vigilante',
        {}
      )

      expect(mockLog).toHaveBeenCalled()
    })

    it('should track steps for workflow processing', async () => {
      const result = await runOperacionalWorkflow(
        'company-123',
        'workflow-456',
        'novo_vigilante',
        {}
      )

      expect(result.steps).toBeDefined()
      expect(result.steps.length).toBeGreaterThan(0)
    })

    it('should complete agent run successfully', async () => {
      const { completeAgentRun } = await import('@/lib/agents/base')
      const mockComplete = vi.mocked(completeAgentRun)

      await runOperacionalWorkflow(
        'company-123',
        'workflow-456',
        'novo_vigilante',
        {}
      )

      expect(mockComplete).toHaveBeenCalled()
    })

    it('should track token usage', async () => {
      const result = await runOperacionalWorkflow(
        'company-123',
        'workflow-456',
        'novo_vigilante',
        {}
      )

      expect(result.totalTokens).toBeGreaterThanOrEqual(0)
      expect(result.cacheReadTokens).toBeGreaterThanOrEqual(0)
      expect(result.cacheWriteTokens).toBeGreaterThanOrEqual(0)
    })
  })
})
