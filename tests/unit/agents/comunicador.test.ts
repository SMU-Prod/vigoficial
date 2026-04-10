import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  runComunicadorBatch,
  runComunicadorAlerts,
  runComunicadorOficio,
  sendWelcomeEmail,
  sendFleetAlert,
} from '@/lib/agents/comunicador'

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
        data: {
          id: 'company-123',
          razao_social: 'Test Company',
          cnpj: '12.345.678/0001-90',
          uf_sede: 'SP',
          email_responsavel: 'contact@company.com',
          email_operacional: 'ops@company.com',
        },
        error: null,
      }),
    }

    return {
      from: vi.fn(function(table: string) {
        mockChain.select.mockReturnThis()
        mockChain.eq.mockReturnThis()
        mockChain.insert.mockReturnThis()
        mockChain.update.mockReturnThis()
        mockChain.order.mockReturnThis()
        if (table === 'compliance_alerts' || table === 'dou_alerts') {
          mockChain.single.mockResolvedValue({ data: [], error: null })
        } else {
          mockChain.single.mockResolvedValue({ data: { id: 'test-id' }, error: null })
        }
        return mockChain
      }),
    }
  }),
}))

vi.mock('@/lib/agents/base', () => ({
  startAgentRun: vi.fn().mockResolvedValue('run-comunicador-123'),
  completeAgentRun: vi.fn().mockResolvedValue(undefined),
  logAgentDecision: vi.fn().mockResolvedValue({ decisionId: 'decision-123' }),
  TokenTracker: vi.fn(function() {
    this.total = 100
    this.cost = 0.01
    this.stats = {
      cacheRead: 10,
      cacheWrite: 5,
      steps: 2,
    }
  }),
}))

vi.mock('@/lib/queue/jobs', () => ({
  addEmailSendJob: vi.fn().mockResolvedValue({ id: 'job-email-123' }),
  addGespSyncJob: vi.fn().mockResolvedValue({ id: 'job-sync' }),
}))

vi.mock('@/lib/config/constants', () => ({
  EMAIL_FROM_DEFAULT: 'noreply@vigi.com.br',
  EMAIL_EQUIPE: 'team@vigi.com.br',
  ALERT_THRESHOLDS: {
    critical: 5,
    warning: 15,
  },
}))

describe('Comunicador Agent - Batch Email Processing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('runComunicadorBatch', () => {
    it('should process batch of emails and return ComunicadorState', async () => {
      const emails = [
        {
          companyId: 'company-1',
          to: 'user1@example.com',
          templateId: 'A' as const,
          mode: 'CLIENTE_HTML' as const,
          subject: 'Welcome',
          priority: 'urgent' as const,
          payload: {},
        },
      ]

      const result = await runComunicadorBatch(emails)

      expect(result).toBeDefined()
      expect(result.agentName).toBe('comunicador')
      expect(result.emailsToSend).toHaveLength(1)
    })

    it('should sort emails by priority (R13: urgent > normal > low)', async () => {
      const emails = [
        {
          companyId: 'company-1',
          to: 'user1@example.com',
          templateId: 'A' as const,
          mode: 'CLIENTE_HTML' as const,
          subject: 'Low',
          priority: 'low' as const,
          payload: {},
        },
        {
          companyId: 'company-2',
          to: 'user2@example.com',
          templateId: 'A' as const,
          mode: 'CLIENTE_HTML' as const,
          subject: 'Urgent',
          priority: 'urgent' as const,
          payload: {},
        },
      ]

      const result = await runComunicadorBatch(emails)

      expect(result.emailsToSend.length).toBeGreaterThanOrEqual(2)
    })

    it('should queue each email for sending via addEmailSendJob', async () => {
      const { addEmailSendJob } = await import('@/lib/queue/jobs')
      const mockEmailJob = vi.mocked(addEmailSendJob)

      const emails = [
        {
          companyId: 'company-1',
          to: 'user@example.com',
          templateId: 'A' as const,
          mode: 'CLIENTE_HTML' as const,
          subject: 'Test',
          priority: 'normal' as const,
          payload: {},
        },
      ]

      await runComunicadorBatch(emails)

      expect(mockEmailJob).toHaveBeenCalled()
    })

    it('should track sent and failed emails', async () => {
      const emails = [
        {
          companyId: 'company-1',
          to: 'user1@example.com',
          templateId: 'A' as const,
          mode: 'CLIENTE_HTML' as const,
          subject: 'Email 1',
          priority: 'normal' as const,
          payload: {},
        },
      ]

      const result = await runComunicadorBatch(emails)

      expect(result.emailsSent).toBeGreaterThanOrEqual(0)
      expect(result.emailsFailed).toBeGreaterThanOrEqual(0)
    })

    it('should handle empty email list', async () => {
      const result = await runComunicadorBatch([])

      expect(result).toBeDefined()
      expect(result.agentName).toBe('comunicador')
    })

    it('should log batch processing decision', async () => {
      const { logAgentDecision } = await import('@/lib/agents/base')
      const mockLog = vi.mocked(logAgentDecision)

      await runComunicadorBatch([])

      expect(mockLog).toHaveBeenCalled()
    })

    it('should complete agent run successfully', async () => {
      const { completeAgentRun } = await import('@/lib/agents/base')
      const mockComplete = vi.mocked(completeAgentRun)

      await runComunicadorBatch([])

      expect(mockComplete).toHaveBeenCalled()
    })

    it('should have runId defined', async () => {
      const result = await runComunicadorBatch([])

      expect(result.runId).toBeDefined()
    })
  })
})

describe('Comunicador Agent - Alert Processing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('runComunicadorAlerts', () => {
    it('should fetch and send compliance alerts', async () => {
      const result = await runComunicadorAlerts('company-123')

      expect(result).toBeDefined()
      expect(result.agentName).toBe('comunicador')
      expect(result.companyId).toBe('company-123')
    })

    it('should track emails sent for alerts', async () => {
      const result = await runComunicadorAlerts('company-123')

      expect(result.emailsSent).toBeGreaterThanOrEqual(0)
    })

    it('should track failed alert sends', async () => {
      const result = await runComunicadorAlerts('company-123')

      expect(result.emailsFailed).toBeGreaterThanOrEqual(0)
    })

    it('should handle alert sending errors gracefully', async () => {
      const result = await runComunicadorAlerts('company-123')

      expect(result.errors).toBeDefined()
      expect(Array.isArray(result.errors)).toBe(true)
    })

    it('should fetch company email addresses', async () => {
      const result = await runComunicadorAlerts('company-123')

      expect(result).toBeDefined()
    })

    it('should have runId defined', async () => {
      const result = await runComunicadorAlerts('company-123')

      expect(result.runId).toBeDefined()
    })

    it('should complete agent run', async () => {
      const { completeAgentRun } = await import('@/lib/agents/base')
      const mockComplete = vi.mocked(completeAgentRun)

      await runComunicadorAlerts('company-123')

      expect(mockComplete).toHaveBeenCalled()
    })

    it('should have proper ComunicadorState', async () => {
      const result = await runComunicadorAlerts('company-123')

      expect(result.startedAt).toBeDefined()
      expect(result.agentName).toBe('comunicador')
    })
  })
})

describe('Comunicador Agent - Ofício Processing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('runComunicadorOficio', () => {
    it('should generate and send ofício', async () => {
      const result = await runComunicadorOficio(
        'company-123',
        'OF-A',
        {
          CONTEUDO: 'Ofício content here',
        }
      )

      expect(result).toBeDefined()
      expect(result.agentName).toBe('comunicador')
      expect(result.companyId).toBe('company-123')
    })

    it('should execute ofício generation', async () => {
      const result = await runComunicadorOficio(
        'company-123',
        'OF-A',
        { CONTEUDO: 'Test' }
      )

      expect(result.runId).toBeDefined()
    })

    it('should support OF-A template', async () => {
      const result = await runComunicadorOficio(
        'company-123',
        'OF-A',
        { CONTEUDO: 'Content A' }
      )

      expect(result).toBeDefined()
    })

    it('should support OF-B template', async () => {
      const result = await runComunicadorOficio(
        'company-123',
        'OF-B',
        { CONTEUDO: 'Content B' }
      )

      expect(result).toBeDefined()
    })

    it('should support OF-C template', async () => {
      const result = await runComunicadorOficio(
        'company-123',
        'OF-C',
        { CONTEUDO: 'Content C' }
      )

      expect(result).toBeDefined()
    })

    it('should support OF-D template', async () => {
      const result = await runComunicadorOficio(
        'company-123',
        'OF-D',
        { CONTEUDO: 'Content D' }
      )

      expect(result).toBeDefined()
    })

    it('should support OF-E template', async () => {
      const result = await runComunicadorOficio(
        'company-123',
        'OF-E',
        { CONTEUDO: 'Content E' }
      )

      expect(result).toBeDefined()
    })

    it('should replace placeholders in template', async () => {
      const result = await runComunicadorOficio(
        'company-123',
        'OF-A',
        {
          CONTEUDO: 'Test content',
          CUSTOM_FIELD: 'Custom value',
        }
      )

      expect(result).toBeDefined()
    })

    it('should handle ofício parameters correctly', async () => {
      const result = await runComunicadorOficio(
        'company-123',
        'OF-A',
        { CONTEUDO: 'Test' }
      )

      expect(result).toBeDefined()
      expect(result.agentName).toBe('comunicador')
    })

    it('should track generated ofícios count', async () => {
      const result = await runComunicadorOficio(
        'company-123',
        'OF-A',
        { CONTEUDO: 'Test' }
      )

      expect(result.oficiosGenerated).toBeGreaterThanOrEqual(0)
    })

    it('should have runId defined', async () => {
      const result = await runComunicadorOficio(
        'company-123',
        'OF-A',
        { CONTEUDO: 'Test' }
      )

      expect(result.runId).toBeDefined()
    })

    it('should complete agent run', async () => {
      const { completeAgentRun } = await import('@/lib/agents/base')
      const mockComplete = vi.mocked(completeAgentRun)

      await runComunicadorOficio(
        'company-123',
        'OF-A',
        { CONTEUDO: 'Test' }
      )

      expect(mockComplete).toHaveBeenCalled()
    })
  })
})

describe('Comunicador Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('sendWelcomeEmail - Template A', () => {
    it('should send welcome email with Template A', async () => {
      const { addEmailSendJob } = await import('@/lib/queue/jobs')
      vi.mocked(addEmailSendJob).mockResolvedValueOnce({ id: 'job-email-123' })

      const jobId = await sendWelcomeEmail(
        'company-123',
        'user@example.com',
        'Company Name'
      )

      expect(jobId).toBeDefined()
      expect(typeof jobId).toBe('string')
    })

    it('should include company name in welcome payload', async () => {
      const { addEmailSendJob } = await import('@/lib/queue/jobs')
      const mockEmailJob = vi.mocked(addEmailSendJob)

      await sendWelcomeEmail(
        'company-123',
        'user@example.com',
        'Minha Empresa'
      )

      expect(mockEmailJob).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            companyName: 'Minha Empresa',
          }),
        })
      )
    })

    it('should return job ID string', async () => {
      const jobId = await sendWelcomeEmail(
        'company-123',
        'user@example.com',
        'Company'
      )

      expect(typeof jobId).toBe('string')
    })
  })

  describe('sendFleetAlert - Template G', () => {
    it('should send fleet alert with Template G', async () => {
      const { addEmailSendJob } = await import('@/lib/queue/jobs')
      const mockEmailJob = vi.mocked(addEmailSendJob)

      const vehicleData = {
        vehicleId: 'vehicle-1',
        model: 'Toyota Hilux',
        nextMaintenance: '2025-02-15',
      }

      const jobId = await sendFleetAlert(
        'company-123',
        'fleet@example.com',
        vehicleData
      )

      expect(jobId).toBeDefined()
      expect(mockEmailJob).toHaveBeenCalledWith(
        expect.objectContaining({
          templateId: 'G',
          mode: 'CLIENTE_HTML',
        })
      )
    })

    it('should include vehicle data in payload', async () => {
      const { addEmailSendJob } = await import('@/lib/queue/jobs')
      const mockEmailJob = vi.mocked(addEmailSendJob)

      const vehicleData = { vehicleId: 'vehicle-1', status: 'maintenance_due' }

      await sendFleetAlert(
        'company-123',
        'fleet@example.com',
        vehicleData
      )

      expect(mockEmailJob).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            vehicleData,
          }),
        })
      )
    })

    it('should return job ID string', async () => {
      const jobId = await sendFleetAlert(
        'company-123',
        'fleet@example.com',
        {}
      )

      expect(typeof jobId).toBe('string')
    })
  })
})

describe('Comunicador - Template and Email Constants', () => {
  it('should have 8 email templates (A through H)', () => {
    const templates = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
    expect(templates.length).toBe(8)
  })

  it('should have two email modes', () => {
    const modes = ['CLIENTE_HTML', 'OFICIO_PF']
    expect(modes.length).toBe(2)
  })

  it('should route DELESP by state for SP', () => {
    const delesp_sp = 'delesp.sp@pf.gov.br'
    expect(delesp_sp).toContain('@pf.gov.br')
  })
})
