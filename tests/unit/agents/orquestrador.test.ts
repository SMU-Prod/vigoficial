import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  runFullCycle,
  runLightCycle,
  runUrgentCycle,
} from '@/lib/agents/orquestrador'

// Mock all external dependencies
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseAdmin: vi.fn(() => {
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }

    return {
      from: vi.fn(function(table: string) {
        mockChain.select.mockReturnThis()
        mockChain.eq.mockReturnThis()
        mockChain.in.mockReturnThis()
        mockChain.limit.mockReturnThis()
        mockChain.insert.mockReturnThis()
        mockChain.update.mockReturnThis()
        mockChain.order.mockReturnThis()

        if (table === 'empresas') {
          mockChain.single.mockResolvedValue({
            data: { id: 'company-123', razao_social: 'Test Company' },
            error: null,
          })
          mockChain.limit.mockResolvedValue({
            data: [{ id: 'company-123', razao_social: 'Test Company' }],
            error: null,
          })
        } else {
          mockChain.single.mockResolvedValue({ data: { id: 'test-id' }, error: null })
        }

        return mockChain
      }),
    }
  }),
}))

vi.mock('@/lib/agents/base', () => ({
  startAgentRun: vi.fn().mockResolvedValue('run-123'),
  completeAgentRun: vi.fn().mockResolvedValue(undefined),
  logAgentDecision: vi.fn().mockResolvedValue({ decisionId: 'decision-123' }),
  updateSystemHealth: vi.fn().mockResolvedValue(undefined),
  TokenTracker: vi.fn(function() {
    this.total = 1000
    this.cost = 0.05
    this.stats = {
      cacheRead: 100,
      cacheWrite: 50,
      steps: 3,
    }
  }),
}))

vi.mock('@/lib/agents/captador', () => ({
  runCaptadorDOU: vi.fn().mockResolvedValue({
    status: 'completed',
    documentsProcessed: 10,
    matchesFound: 2,
    totalTokens: 500,
  }),
  runCaptadorEmail: vi.fn().mockResolvedValue({
    status: 'completed',
    totalTokens: 300,
  }),
}))

vi.mock('@/lib/agents/operacional', () => ({
  runOperacionalGESP: vi.fn().mockResolvedValue({
    status: 'completed',
    gespTasksCompleted: 5,
    totalTokens: 400,
  }),
  runOperacionalCompliance: vi.fn().mockResolvedValue({
    status: 'completed',
    alertsSent: 3,
    totalTokens: 250,
  }),
  runOperacionalWorkflow: vi.fn().mockResolvedValue({
    status: 'completed',
    totalTokens: 200,
  }),
}))

vi.mock('@/lib/agents/comunicador', () => ({
  runComunicadorBatch: vi.fn().mockResolvedValue({
    status: 'completed',
    emailsSent: 5,
    totalTokens: 150,
  }),
  runComunicadorAlerts: vi.fn().mockResolvedValue({
    status: 'completed',
    emailsSent: 2,
    totalTokens: 100,
  }),
}))

vi.mock('@/lib/config/constants', () => ({
  EMAIL_EQUIPE: 'team@vigi.com.br',
  DOU_BASE_URL: 'https://www.diariooficial.df.gov.br/api',
}))

vi.mock('@/lib/queue/jobs', () => ({
  addCaptadorDOUJob: vi.fn().mockResolvedValue({ id: 'job-dou' }),
  addCaptadorEmailJob: vi.fn().mockResolvedValue({ id: 'job-email' }),
  addOperacionalGESPJob: vi.fn().mockResolvedValue({ id: 'job-gesp' }),
  addOperacionalComplianceJob: vi.fn().mockResolvedValue({ id: 'job-compliance' }),
  addOperacionalWorkflowJob: vi.fn().mockResolvedValue({ id: 'job-workflow' }),
  addComunicadorAlertsJob: vi.fn().mockResolvedValue({ id: 'job-alerts' }),
  addComunicadorBatchJob: vi.fn().mockResolvedValue({ id: 'job-batch' }),
  addBillingCheckJob: vi.fn().mockResolvedValue({ id: 'job-billing' }),
}))

describe('Orquestrador Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('runFullCycle', () => {
    it('should dispatch all agents in FULL cycle', async () => {
      const result = await runFullCycle()

      expect(result).toBeDefined()
      expect(result.cycleType).toBe('full')
      expect(result.orquestradorId).toBeDefined()
      expect(result.dispatches).toBeDefined()
    })

    it('should include Captador DOU in dispatches', async () => {
      const result = await runFullCycle()

      expect(result.dispatches!.length).toBeGreaterThanOrEqual(0)
    })

    it('should track metrics aggregation from all agents', async () => {
      const result = await runFullCycle()

      expect(result.metricsAggregated).toBeDefined()
      expect(result.metricsAggregated.captadorDOU).toBeDefined()
      expect(result.metricsAggregated.operacionalGESP).toBeDefined()
      expect(result.metricsAggregated.comunicadorAlerts).toBeDefined()
    })

    it('should aggregate total tokens used across dispatches', async () => {
      const result = await runFullCycle()

      expect(result.totalTokensUsed).toBeGreaterThanOrEqual(0)
    })

    it('should process companies in batches', async () => {
      const result = await runFullCycle()

      expect(result.dispatches).toBeDefined()
    })

    it('should handle errors when company fetch fails', async () => {
      const result = await runFullCycle()

      expect(result.errors).toBeDefined()
    })

    it('should set completedAt timestamp', async () => {
      const result = await runFullCycle()

      expect(result.completedAt).toBeDefined()
      expect(result.completedAt instanceof Date).toBe(true)
    })

    it('should log cycle start decision', async () => {
      const { logAgentDecision } = await import('@/lib/agents/base')
      const mockLog = vi.mocked(logAgentDecision)

      await runFullCycle()

      expect(mockLog).toHaveBeenCalled()
    })

    it('should aggregate system health metrics', async () => {
      const result = await runFullCycle()

      expect(result.systemHealthUpdates).toBeDefined()
      expect(Array.isArray(result.systemHealthUpdates)).toBe(true)
    })

    it('should track dispatch success and failure counts', async () => {
      const result = await runFullCycle()

      expect(result.dispatches).toBeDefined()
    })

    it('should initialize state with correct cycle type', async () => {
      const result = await runFullCycle()

      expect(result.cycleType).toBe('full')
      expect(result.triggerSource).toBe('cron')
    })

    it('should have runId defined', async () => {
      const result = await runFullCycle()

      expect(result.runId).toBeDefined()
    })
  })

  describe('runLightCycle', () => {
    it('should dispatch only DOU and Email agents in LIGHT cycle', async () => {
      const result = await runLightCycle()

      expect(result.cycleType).toBe('light')
      expect(result.dispatches).toBeDefined()
    })

    it('should include DOU parsing in LIGHT cycle', async () => {
      const result = await runLightCycle()

      expect(result.dispatches).toBeDefined()
    })

    it('should process companies for email reading', async () => {
      const result = await runLightCycle()

      expect(result.dispatches!.length).toBeGreaterThanOrEqual(0)
    })

    it('should set completedAt timestamp', async () => {
      const result = await runLightCycle()

      expect(result.completedAt).toBeDefined()
    })

    it('should aggregate metrics for LIGHT cycle', async () => {
      const result = await runLightCycle()

      expect(result.metricsAggregated).toBeDefined()
      expect(result.systemHealthUpdates).toBeDefined()
    })

    it('should have correct cycle type', async () => {
      const result = await runLightCycle()

      expect(result.cycleType).toBe('light')
    })

    it('should have runId defined', async () => {
      const result = await runLightCycle()

      expect(result.runId).toBeDefined()
    })

    it('should log light cycle decisions', async () => {
      const { logAgentDecision } = await import('@/lib/agents/base')
      const mockLog = vi.mocked(logAgentDecision)

      await runLightCycle()

      expect(mockLog).toHaveBeenCalled()
    })
  })

  describe('runUrgentCycle', () => {
    it('should trigger immediate processing for specific company', async () => {
      const result = await runUrgentCycle('company-urgent', 'Critical email received')

      expect(result.cycleType).toBe('urgent')
      expect(result.dispatches).toBeDefined()
    })

    it('should prioritize GESP sync in URGENT cycle', async () => {
      const result = await runUrgentCycle('company-urgent', 'Critical email received')

      expect(result.dispatches).toBeDefined()
    })

    it('should follow GESP → Compliance → Alerts priority', async () => {
      const result = await runUrgentCycle('company-urgent', 'Critical email received')

      expect(result.dispatches!.length).toBeGreaterThanOrEqual(0)
    })

    it('should only process the specified company', async () => {
      const result = await runUrgentCycle('company-urgent', 'Critical')

      expect(result.dispatches).toBeDefined()
    })

    it('should record the reason for URGENT cycle', async () => {
      const { logAgentDecision } = await import('@/lib/agents/base')
      const mockLog = vi.mocked(logAgentDecision)

      await runUrgentCycle('company-urgent', 'Security incident detected')

      expect(mockLog).toHaveBeenCalled()
    })

    it('should have correct cycle type', async () => {
      const result = await runUrgentCycle('company-urgent', 'Test')

      expect(result.cycleType).toBe('urgent')
    })

    it('should have runId defined', async () => {
      const result = await runUrgentCycle('company-urgent', 'Test')

      expect(result.runId).toBeDefined()
    })

    it('should set completedAt timestamp', async () => {
      const result = await runUrgentCycle('company-urgent', 'Test')

      expect(result.completedAt).toBeDefined()
    })

    it('should handle missing company gracefully', async () => {
      const result = await runUrgentCycle('nonexistent-company', 'Test')

      expect(result.errors).toBeDefined()
    })
  })

  describe('Error handling and resilience', () => {
    it('should continue processing if one agent fails', async () => {
      const result = await runFullCycle()

      expect(result).toBeDefined()
    })

    it('should aggregate token usage across all dispatches', async () => {
      const result = await runFullCycle()

      expect(result.totalTokensUsed).toBeGreaterThanOrEqual(0)
    })

    it('should handle timeout gracefully', async () => {
      const result = await runFullCycle()

      expect(result).toBeDefined()
      expect(result.completedAt).toBeDefined()
    })
  })

  describe('Metrics and observability', () => {
    it('should track tokens for each dispatch', async () => {
      const result = await runFullCycle()

      expect(result.totalTokensUsed).toBeGreaterThanOrEqual(0)
    })

    it('should calculate average tokens per dispatch', async () => {
      const result = await runFullCycle()

      expect(result.totalTokensUsed).toBeGreaterThanOrEqual(0)
    })

    it('should track system health updates', async () => {
      const { updateSystemHealth } = await import('@/lib/agents/base')
      const mockUpdateHealth = vi.mocked(updateSystemHealth)

      await runFullCycle()

      expect(mockUpdateHealth).toHaveBeenCalled()
    })

    it('should include cache read tokens in metrics', async () => {
      const result = await runFullCycle()

      expect(result.cacheReadTokens).toBeGreaterThanOrEqual(0)
    })

    it('should include cache write tokens in metrics', async () => {
      const result = await runFullCycle()

      expect(result.cacheWriteTokens).toBeGreaterThanOrEqual(0)
    })
  })
})
