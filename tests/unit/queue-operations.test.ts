import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  getDouQueue,
  getEmailReadQueue,
  getGespSyncQueue,
  getGespActionQueue,
  getComplianceQueue,
  getFleetQueue,
  getEmailSendQueue,
  getBillingQueue,
  getAllQueues,
} from '@/lib/queue/queues'
import {
  addDouJob,
  addEmailReadJob,
  addGespSyncJob,
  addComplianceJob,
  addFleetJob,
  addEmailSendJob,
  addBillingJob,
} from '@/lib/queue/jobs'

// Mock BullMQ Queue
vi.mock('bullmq', () => ({
  Queue: vi.fn(function(name: string) {
    return {
      name,
      add: vi.fn().mockResolvedValue({ id: `job_${name}_123` }),
      process: vi.fn(),
      on: vi.fn(),
      close: vi.fn(),
    }
  }),
}))

vi.mock('@/lib/redis/connection', () => ({
  redisConnection: {
    host: 'localhost',
    port: 6379,
  },
}))

describe('Queue Operations - Lazy Queue Factory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Queue Creation and Caching (getOrCreate Pattern)', () => {
    it('should create dou queue on first call', () => {
      const queue = getDouQueue()
      expect(queue).toBeDefined()
      expect(queue).toHaveProperty('add')
    })

    it('should return cached dou queue on subsequent calls', () => {
      const queue1 = getDouQueue()
      const queue2 = getDouQueue()
      expect(queue1).toBe(queue2)
    })

    it('should create email-read queue on first call', () => {
      const queue = getEmailReadQueue()
      expect(queue).toBeDefined()
      expect(queue).toHaveProperty('add')
    })

    it('should cache email-read queue', () => {
      const queue1 = getEmailReadQueue()
      const queue2 = getEmailReadQueue()
      expect(queue1).toBe(queue2)
    })

    it('should create gesp-sync queue on first call', () => {
      const queue = getGespSyncQueue()
      expect(queue).toBeDefined()
      expect(queue).toHaveProperty('add')
    })

    it('should cache gesp-sync queue', () => {
      const queue1 = getGespSyncQueue()
      const queue2 = getGespSyncQueue()
      expect(queue1).toBe(queue2)
    })

    it('should create gesp-action queue on first call', () => {
      const queue = getGespActionQueue()
      expect(queue).toBeDefined()
      expect(queue).toHaveProperty('add')
    })

    it('should create compliance queue on first call', () => {
      const queue = getComplianceQueue()
      expect(queue).toBeDefined()
    })

    it('should create fleet queue on first call', () => {
      const queue = getFleetQueue()
      expect(queue).toBeDefined()
    })

    it('should create email-send queue on first call', () => {
      const queue = getEmailSendQueue()
      expect(queue).toBeDefined()
    })

    it('should create billing queue on first call', () => {
      const queue = getBillingQueue()
      expect(queue).toBeDefined()
    })

    it('should cache all queue instances independently', () => {
      const dou = getDouQueue()
      const email = getEmailReadQueue()
      const compliance = getComplianceQueue()

      expect(dou).not.toBe(email)
      expect(email).not.toBe(compliance)
      expect(dou).not.toBe(compliance)
    })
  })

  describe('getAllQueues - Queue Collection', () => {
    it('should return array of all queues', () => {
      const queues = getAllQueues()
      expect(Array.isArray(queues)).toBe(true)
      expect(queues.length).toBe(8)
    })

    it('should include dou queue', () => {
      const queues = getAllQueues()
      const douQueue = queues.find((q) => q.name === 'dou' || q === getDouQueue())
      expect(douQueue).toBeDefined()
    })

    it('should include email-read queue', () => {
      const queues = getAllQueues()
      expect(queues).toContain(getEmailReadQueue())
    })

    it('should include gesp-sync queue', () => {
      const queues = getAllQueues()
      expect(queues).toContain(getGespSyncQueue())
    })

    it('should include gesp-action queue', () => {
      const queues = getAllQueues()
      expect(queues).toContain(getGespActionQueue())
    })

    it('should include compliance queue', () => {
      const queues = getAllQueues()
      expect(queues).toContain(getComplianceQueue())
    })

    it('should include fleet queue', () => {
      const queues = getAllQueues()
      expect(queues).toContain(getFleetQueue())
    })

    it('should include email-send queue', () => {
      const queues = getAllQueues()
      expect(queues).toContain(getEmailSendQueue())
    })

    it('should include billing queue', () => {
      const queues = getAllQueues()
      expect(queues).toContain(getBillingQueue())
    })

    it('should return same queues on multiple calls', () => {
      const queues1 = getAllQueues()
      const queues2 = getAllQueues()

      expect(queues1.length).toBe(queues2.length)
      for (let i = 0; i < queues1.length; i++) {
        expect(queues1[i]).toBe(queues2[i])
      }
    })
  })

  describe('Job Addition - DOU Queue', () => {
    it('should add parse-dou job to dou queue', async () => {
      const job = await addDouJob()
      expect(job).toBeDefined()
      expect(job.id).toBeTruthy()
    })

    it('should include current date in dou job', async () => {
      const queue = getDouQueue()
      const mockAdd = vi.mocked(queue.add)

      await addDouJob()

      expect(mockAdd).toHaveBeenCalledWith(
        'parse-dou',
        expect.objectContaining({
          date: expect.any(String),
        }),
        expect.any(Object)
      )
    })

    it('should configure dou job removal on complete (24 hours)', async () => {
      const queue = getDouQueue()
      const mockAdd = vi.mocked(queue.add)

      await addDouJob()

      expect(mockAdd).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          removeOnComplete: { age: 86400 },
        })
      )
    })

    it('should configure dou job removal on fail (7 days)', async () => {
      const queue = getDouQueue()
      const mockAdd = vi.mocked(queue.add)

      await addDouJob()

      expect(mockAdd).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          removeOnFail: { age: 604800 },
        })
      )
    })
  })

  describe('Job Addition - Email Read Queue', () => {
    it('should add read-emails job with company ID', async () => {
      const job = await addEmailReadJob('company_1')

      expect(job).toBeDefined()
      expect(job.id).toBeTruthy()
    })

    it('should pass company ID in job data', async () => {
      const queue = getEmailReadQueue()
      const mockAdd = vi.mocked(queue.add)

      await addEmailReadJob('company_1')

      expect(mockAdd).toHaveBeenCalledWith(
        'read-emails',
        expect.objectContaining({
          companyId: 'company_1',
        }),
        expect.any(Object)
      )
    })

    it('should retry email read job 3 times', async () => {
      const queue = getEmailReadQueue()
      const mockAdd = vi.mocked(queue.add)

      await addEmailReadJob('company_1')

      expect(mockAdd).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          attempts: 3,
        })
      )
    })
  })

  describe('Job Addition - GESP Sync Queue', () => {
    it('should add sync-empresa job with company ID', async () => {
      const job = await addGespSyncJob('company_1')

      expect(job).toBeDefined()
      expect(job.id).toBeTruthy()
    })

    it('should set normal priority by default', async () => {
      const queue = getGespSyncQueue()
      const mockAdd = vi.mocked(queue.add)

      await addGespSyncJob('company_1')

      expect(mockAdd).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          priority: 10,
        })
      )
    })

    it('should set priority 1 for urgente', async () => {
      const queue = getGespSyncQueue()
      const mockAdd = vi.mocked(queue.add)

      await addGespSyncJob('company_1', 'urgente')

      expect(mockAdd).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          priority: 1,
        })
      )
    })

    it('should retry GESP job 5 times', async () => {
      const queue = getGespSyncQueue()
      const mockAdd = vi.mocked(queue.add)

      await addGespSyncJob('company_1')

      expect(mockAdd).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          attempts: 5,
        })
      )
    })

    it('should use exponential backoff (3 minutes initial delay)', async () => {
      const queue = getGespSyncQueue()
      const mockAdd = vi.mocked(queue.add)

      await addGespSyncJob('company_1')

      expect(mockAdd).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          backoff: {
            type: 'exponential',
            delay: 3 * 60 * 1000, // 3 minutes
          },
        })
      )
    })

    it('should not remove GESP jobs on complete', async () => {
      const queue = getGespSyncQueue()
      const mockAdd = vi.mocked(queue.add)

      await addGespSyncJob('company_1')

      expect(mockAdd).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          removeOnComplete: false,
        })
      )
    })

    it('should not remove GESP jobs on fail', async () => {
      const queue = getGespSyncQueue()
      const mockAdd = vi.mocked(queue.add)

      await addGespSyncJob('company_1')

      expect(mockAdd).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          removeOnFail: false,
        })
      )
    })
  })

  describe('Job Addition - Compliance Queue', () => {
    it('should add check-validades job with company ID', async () => {
      const job = await addComplianceJob('company_1')

      expect(job).toBeDefined()
      expect(job.id).toBeTruthy()
    })

    it('should pass company ID in job data', async () => {
      const queue = getComplianceQueue()
      const mockAdd = vi.mocked(queue.add)

      await addComplianceJob('company_1')

      expect(mockAdd).toHaveBeenCalledWith(
        'check-validades',
        expect.objectContaining({
          companyId: 'company_1',
        }),
        expect.any(Object)
      )
    })
  })

  describe('Job Addition - Fleet Queue', () => {
    it('should add process-fleet job with company ID', async () => {
      const job = await addFleetJob('company_1')

      expect(job).toBeDefined()
      expect(job.id).toBeTruthy()
    })

    it('should pass company ID in job data', async () => {
      const queue = getFleetQueue()
      const mockAdd = vi.mocked(queue.add)

      await addFleetJob('company_1')

      expect(mockAdd).toHaveBeenCalledWith(
        'process-fleet',
        expect.objectContaining({
          companyId: 'company_1',
        }),
        expect.any(Object)
      )
    })
  })

  describe('Job Addition - Email Send Queue', () => {
    it('should add send-email job with all parameters', async () => {
      const jobData = {
        companyId: 'company_1',
        templateId: 'A' as const,
        mode: 'CLIENTE_HTML' as const,
        to: 'user@example.com',
        subject: 'Test Email',
        payload: { razaoSocial: 'Empresa Teste' },
      }

      const job = await addEmailSendJob(jobData)

      expect(job).toBeDefined()
      expect(job.id).toBeTruthy()
    })

    it('should retry email send job 5 times', async () => {
      const queue = getEmailSendQueue()
      const mockAdd = vi.mocked(queue.add)

      await addEmailSendJob({
        companyId: 'company_1',
        templateId: 'B' as const,
        mode: 'CLIENTE_HTML' as const,
        to: 'user@example.com',
        subject: 'Test',
        payload: {},
      })

      expect(mockAdd).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          attempts: 5,
        })
      )
    })

    it('should use exponential backoff for email send (10 seconds initial)', async () => {
      const queue = getEmailSendQueue()
      const mockAdd = vi.mocked(queue.add)

      await addEmailSendJob({
        companyId: 'company_1',
        templateId: 'C' as const,
        mode: 'CLIENTE_HTML' as const,
        to: 'user@example.com',
        subject: 'Test',
        payload: {},
      })

      expect(mockAdd).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          backoff: {
            type: 'exponential',
            delay: 10_000,
          },
        })
      )
    })

    it('should handle template ID validation', async () => {
      const validTemplates = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

      for (const templateId of validTemplates) {
        const job = await addEmailSendJob({
          companyId: 'company_1',
          templateId: templateId as any,
          mode: 'CLIENTE_HTML',
          to: 'user@example.com',
          subject: 'Test',
          payload: {},
        })

        expect(job).toBeDefined()
      }
    })

    it('should handle mode validation', async () => {
      const modes = ['CLIENTE_HTML', 'OFICIO_PF']

      for (const mode of modes) {
        const job = await addEmailSendJob({
          companyId: 'company_1',
          templateId: 'A' as const,
          mode: mode as any,
          to: 'user@example.com',
          subject: 'Test',
          payload: {},
        })

        expect(job).toBeDefined()
      }
    })
  })

  describe('Job Addition - Billing Queue', () => {
    it('should add billing-check job', async () => {
      const job = await addBillingJob()

      expect(job).toBeDefined()
      expect(job.id).toBeTruthy()
    })

    it('should include current date in billing job', async () => {
      const queue = getBillingQueue()
      const mockAdd = vi.mocked(queue.add)

      await addBillingJob()

      expect(mockAdd).toHaveBeenCalledWith(
        'billing-check',
        expect.objectContaining({
          date: expect.any(String),
        }),
        expect.any(Object)
      )
    })
  })

  describe('Job Retry Configuration', () => {
    it('should use DEFAULT_RETRY (3 attempts, 30s delay) for standard jobs', async () => {
      const queue = getComplianceQueue()
      const mockAdd = vi.mocked(queue.add)

      await addComplianceJob('company_1')

      expect(mockAdd).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 30_000,
          },
        })
      )
    })

    it('should use GESP_RETRY (5 attempts, 3m delay) for GESP jobs', async () => {
      const queue = getGespSyncQueue()
      const mockAdd = vi.mocked(queue.add)

      await addGespSyncJob('company_1')

      expect(mockAdd).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 3 * 60 * 1000,
          },
        })
      )
    })

    it('should use custom retry for email send (5 attempts, 10s delay)', async () => {
      const queue = getEmailSendQueue()
      const mockAdd = vi.mocked(queue.add)

      await addEmailSendJob({
        companyId: 'company_1',
        templateId: 'A' as const,
        mode: 'CLIENTE_HTML' as const,
        to: 'user@example.com',
        subject: 'Test',
        payload: {},
      })

      expect(mockAdd).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 10_000,
          },
        })
      )
    })
  })

  describe('Job Cleanup Configuration', () => {
    it('should remove completed jobs after 24 hours (default)', async () => {
      const queue = getComplianceQueue()
      const mockAdd = vi.mocked(queue.add)

      await addComplianceJob('company_1')

      expect(mockAdd).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          removeOnComplete: { age: 86400 },
        })
      )
    })

    it('should remove failed jobs after 7 days (default)', async () => {
      const queue = getFleetQueue()
      const mockAdd = vi.mocked(queue.add)

      await addFleetJob('company_1')

      expect(mockAdd).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          removeOnFail: { age: 604800 },
        })
      )
    })

    it('should preserve GESP jobs (no removal)', async () => {
      const queue = getGespSyncQueue()
      const mockAdd = vi.mocked(queue.add)

      await addGespSyncJob('company_1')

      expect(mockAdd).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          removeOnComplete: false,
          removeOnFail: false,
        })
      )
    })
  })

  describe('Orchestrator Compatibility Wrappers', () => {
    it('should support addCaptadorDOUJob wrapper', async () => {
      const { addCaptadorDOUJob } = await import('@/lib/queue/jobs')

      const job = await addCaptadorDOUJob({
        dispatchId: 'dispatch_1',
        orquestradorId: 'orq_1',
      })

      expect(job).toBeDefined()
    })

    it('should support addCaptadorEmailJob wrapper with company ID', async () => {
      const { addCaptadorEmailJob } = await import('@/lib/queue/jobs')

      const job = await addCaptadorEmailJob({
        dispatchId: 'dispatch_1',
        orquestradorId: 'orq_1',
        companyId: 'company_1',
      })

      expect(job).toBeDefined()
    })

    it('should support addOperacionalGESPJob wrapper with priority', async () => {
      const { addOperacionalGESPJob } = await import('@/lib/queue/jobs')

      const job = await addOperacionalGESPJob({
        dispatchId: 'dispatch_1',
        orquestradorId: 'orq_1',
        companyId: 'company_1',
        priority: 'urgent',
      })

      expect(job).toBeDefined()
    })

    it('should support addBillingCheckJob wrapper', async () => {
      const { addBillingCheckJob } = await import('@/lib/queue/jobs')

      const job = await addBillingCheckJob({
        dispatchId: 'dispatch_1',
        orquestradorId: 'orq_1',
      })

      expect(job).toBeDefined()
    })
  })
})
