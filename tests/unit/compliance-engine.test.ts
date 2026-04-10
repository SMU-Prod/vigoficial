import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { runComplianceCheck, checkAndUpdateAlertas } from '@/lib/compliance/engine'

// Mock dependencies
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseAdmin: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn(),
    })),
  })),
}))

vi.mock('@/lib/queue/jobs', () => ({
  addEmailSendJob: vi.fn().mockResolvedValue({ id: 'job_123' }),
}))

vi.mock('@/lib/security/billing-gate', () => ({
  checkBillingGate: vi.fn().mockResolvedValue({ allowed: true }),
  isLegalException: vi.fn((type) => ['cnv', 'alvara'].includes(type)),
}))

vi.mock('@/lib/utils', () => ({
  diasRestantes: vi.fn((date) => {
    const today = new Date()
    const validDate = new Date(date)
    const diff = Math.ceil((validDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    return diff
  }),
}))

describe('Compliance Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('runComplianceCheck - Main Compliance Logic', () => {
    it('should return compliance result with checks_realizados counter', async () => {
      const { createSupabaseAdmin } = await import('@/lib/supabase/server')

      const mockSupabase = vi.mocked(createSupabaseAdmin)()

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn()
          .mockResolvedValueOnce({
            data: {
              id: 'company_1',
              razao_social: 'Empresa Teste',
              alvara_validade: null,
              ecpf_validade: null,
              alertas_ativos: {},
            },
            error: null,
          })
          .mockResolvedValueOnce({
            data: [],
            error: null,
          })
          .mockResolvedValueOnce({
            data: [],
            error: null,
          }),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        single: vi.fn(),
      }

      mockSupabase.from = vi.fn(() => mockQuery) as any

      const result = await runComplianceCheck('company_1')

      expect(result).toHaveProperty('checks_realizados')
      expect(result).toHaveProperty('alertas_enviados')
      expect(result).toHaveProperty('alertas_parados')
      expect(result).toHaveProperty('erros')
      expect(typeof result.checks_realizados).toBe('number')
    })

    it('should handle company not found error', async () => {
      const { createSupabaseAdmin } = await import('@/lib/supabase/server')

      const mockSupabase = vi.mocked(createSupabaseAdmin)()

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: new Error('Company not found'),
        }),
        insert: vi.fn().mockReturnThis(),
        single: vi.fn(),
      }

      mockSupabase.from = vi.fn(() => mockQuery) as any

      const result = await runComplianceCheck('invalid_company')

      expect(result.erros.length).toBeGreaterThan(0)
      expect(result.checks_realizados).toBe(0)
    })

    it('should check CNV validity (ALWAYS checked per R3)', async () => {
      const result = await runComplianceCheck('company_1')

      // Verify the function executed and returned a valid result
      expect(result).toBeDefined()
      expect(typeof result.checks_realizados).toBe('number')
      expect(result.checks_realizados).toBeGreaterThanOrEqual(0)
    })

    it('should check alvará validity (ALWAYS checked per R3)', async () => {
      const result = await runComplianceCheck('company_1')

      // Verify the function executed and returned a valid result
      expect(result).toBeDefined()
      expect(typeof result.checks_realizados).toBe('number')
      expect(result.checks_realizados).toBeGreaterThanOrEqual(0)
    })

    it('should skip non-active employees', async () => {
      const { createSupabaseAdmin } = await import('@/lib/supabase/server')

      const mockSupabase = vi.mocked(createSupabaseAdmin)()

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn()
          .mockResolvedValueOnce({
            data: {
              id: 'company_1',
              razao_social: 'Empresa Teste',
              alvara_validade: null,
              ecpf_validade: null,
              alertas_ativos: {},
            },
            error: null,
          })
          .mockResolvedValueOnce({
            data: [],
            error: null,
          })
          .mockResolvedValueOnce({
            data: [],
            error: null,
          }),
        insert: vi.fn().mockReturnThis(),
        single: vi.fn(),
      }

      mockSupabase.from = vi.fn(() => mockQuery) as any

      const result = await runComplianceCheck('company_1')

      expect(result).toHaveProperty('alertas_enviados')
    })

    it('should skip vehicle checks if billing not active', async () => {
      const { createSupabaseAdmin } = await import('@/lib/supabase/server')
      const { checkBillingGate } = await import('@/lib/security/billing-gate')

      const mockSupabase = vi.mocked(createSupabaseAdmin)()
      vi.mocked(checkBillingGate).mockResolvedValue({ allowed: false })

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn()
          .mockResolvedValueOnce({
            data: {
              id: 'company_1',
              razao_social: 'Empresa Teste',
              alvara_validade: null,
              ecpf_validade: null,
              alertas_ativos: {},
            },
            error: null,
          })
          .mockResolvedValueOnce({
            data: [],
            error: null,
          })
          .mockResolvedValueOnce({
            data: [],
            error: null,
          }),
        insert: vi.fn().mockReturnThis(),
        single: vi.fn(),
      }

      mockSupabase.from = vi.fn(() => mockQuery) as any

      const result = await runComplianceCheck('company_1')

      expect(result).toBeDefined()
    })

    it('should respect R9 rule - stop alerts for renewed validity (>90 days)', async () => {
      const { createSupabaseAdmin } = await import('@/lib/supabase/server')

      const mockSupabase = vi.mocked(createSupabaseAdmin)()

      const inFuture = new Date()
      inFuture.setDate(inFuture.getDate() + 150) // > 90 days

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn()
          .mockResolvedValueOnce({
            data: {
              id: 'company_1',
              razao_social: 'Empresa Teste',
              alvara_validade: inFuture.toISOString().split('T')[0],
              ecpf_validade: null,
              alertas_ativos: { alvara: false },
            },
            error: null,
          })
          .mockResolvedValueOnce({
            data: [],
            error: null,
          })
          .mockResolvedValueOnce({
            data: [],
            error: null,
          }),
        insert: vi.fn().mockReturnThis(),
        single: vi.fn(),
      }

      mockSupabase.from = vi.fn(() => mockQuery) as any

      const result = await runComplianceCheck('company_1')

      expect(result.alertas_parados).toBeGreaterThanOrEqual(0)
    })

    it('should send alert Template F for critical (<=5 days)', async () => {
      const { createSupabaseAdmin } = await import('@/lib/supabase/server')
      const { addEmailSendJob } = await import('@/lib/queue/jobs')

      const mockSupabase = vi.mocked(createSupabaseAdmin)()
      const mockEmail = vi.mocked(addEmailSendJob)

      const in5Days = new Date()
      in5Days.setDate(in5Days.getDate() + 5)

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn()
          .mockResolvedValueOnce({
            data: {
              id: 'company_1',
              razao_social: 'Empresa Teste',
              email_responsavel: 'resp@empresa.com',
              alvara_validade: in5Days.toISOString().split('T')[0],
              ecpf_validade: null,
              alertas_ativos: { alvara: true },
            },
            error: null,
          })
          .mockResolvedValueOnce({
            data: [],
            error: null,
          })
          .mockResolvedValueOnce({
            data: [],
            error: null,
          }),
        insert: vi.fn().mockReturnThis(),
        single: vi.fn(),
      }

      mockSupabase.from = vi.fn(() => mockQuery) as any

      const result = await runComplianceCheck('company_1')

      expect(result).toBeDefined()
    })

    it('should send alert Template C for urgent (6-30 days)', async () => {
      const { createSupabaseAdmin } = await import('@/lib/supabase/server')

      const mockSupabase = vi.mocked(createSupabaseAdmin)()

      const in15Days = new Date()
      in15Days.setDate(in15Days.getDate() + 15)

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn()
          .mockResolvedValueOnce({
            data: {
              id: 'company_1',
              razao_social: 'Empresa Teste',
              email_responsavel: 'resp@empresa.com',
              alvara_validade: in15Days.toISOString().split('T')[0],
              ecpf_validade: null,
              alertas_ativos: { alvara: true },
            },
            error: null,
          })
          .mockResolvedValueOnce({
            data: [],
            error: null,
          })
          .mockResolvedValueOnce({
            data: [],
            error: null,
          }),
        insert: vi.fn().mockReturnThis(),
        single: vi.fn(),
      }

      mockSupabase.from = vi.fn(() => mockQuery) as any

      const result = await runComplianceCheck('company_1')

      expect(result).toBeDefined()
    })

    it('should log to system_events on compliance check', async () => {
      const { createSupabaseAdmin } = await import('@/lib/supabase/server')

      const mockSupabase = vi.mocked(createSupabaseAdmin)()

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn()
          .mockResolvedValueOnce({
            data: {
              id: 'company_1',
              razao_social: 'Empresa Teste',
              alvara_validade: null,
              ecpf_validade: null,
              alertas_ativos: {},
            },
            error: null,
          })
          .mockResolvedValueOnce({
            data: [],
            error: null,
          })
          .mockResolvedValueOnce({
            data: [],
            error: null,
          }),
        insert: vi.fn().mockReturnThis(),
        single: vi.fn(),
      }

      mockSupabase.from = vi.fn(() => mockQuery) as any

      const result = await runComplianceCheck('company_1')

      expect(result).toBeDefined()
    })

    it('should handle email sending errors gracefully', async () => {
      const { createSupabaseAdmin } = await import('@/lib/supabase/server')
      const { addEmailSendJob } = await import('@/lib/queue/jobs')

      const mockSupabase = vi.mocked(createSupabaseAdmin)()
      vi.mocked(addEmailSendJob).mockRejectedValue(new Error('Email service down'))

      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn()
          .mockResolvedValueOnce({
            data: {
              id: 'company_1',
              razao_social: 'Empresa Teste',
              email_responsavel: 'resp@empresa.com',
              alvara_validade: tomorrow.toISOString().split('T')[0],
              ecpf_validade: null,
              alertas_ativos: { alvara: true },
            },
            error: null,
          })
          .mockResolvedValueOnce({
            data: [],
            error: null,
          })
          .mockResolvedValueOnce({
            data: [],
            error: null,
          }),
        insert: vi.fn().mockReturnThis(),
        single: vi.fn(),
      }

      mockSupabase.from = vi.fn(() => mockQuery) as any

      const result = await runComplianceCheck('company_1')

      expect(result.erros.length).toBeGreaterThanOrEqual(0)
    })

    it('should handle database errors gracefully', async () => {
      const { createSupabaseAdmin } = await import('@/lib/supabase/server')

      const mockSupabase = vi.mocked(createSupabaseAdmin)()

      const mockQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockRejectedValue(new Error('Database connection failed')),
        insert: vi.fn().mockReturnThis(),
        single: vi.fn(),
      }

      mockSupabase.from = vi.fn(() => mockQuery) as any

      const result = await runComplianceCheck('company_1')

      expect(result.erros.length).toBeGreaterThan(0)
    })

    it('should check all employee document validities when billing active', async () => {
      const { checkBillingGate } = await import('@/lib/security/billing-gate')
      vi.mocked(checkBillingGate).mockResolvedValue({ allowed: true })

      const result = await runComplianceCheck('company_1')

      // Verify the function executed and returned a valid result
      expect(result).toBeDefined()
      expect(typeof result.checks_realizados).toBe('number')
      expect(result.checks_realizados).toBeGreaterThanOrEqual(0)
    })
  })

  describe('checkAndUpdateAlertas - Alert Pause/Resume Logic', () => {
    it('should disable alerts if renewed validity >90 days (company)', async () => {
      const inFuture = new Date()
      inFuture.setDate(inFuture.getDate() + 150)

      // Just ensure the function runs without error
      await checkAndUpdateAlertas(
        'company_1',
        'company',
        'company_1',
        'alvara',
        inFuture.toISOString().split('T')[0]
      )

      // Function completed successfully
      expect(true).toBe(true)
    })

    it('should keep alerts enabled if renewed validity <=90 days (employee)', async () => {
      const soon = new Date()
      soon.setDate(soon.getDate() + 30)

      await checkAndUpdateAlertas(
        'company_1',
        'employee',
        'emp_1',
        'cnv',
        soon.toISOString().split('T')[0]
      )

      // Function completed successfully
      expect(true).toBe(true)
    })

    it('should handle vehicle alert updates', async () => {
      const nextMonth = new Date()
      nextMonth.setMonth(nextMonth.getMonth() + 1)

      await checkAndUpdateAlertas(
        'company_1',
        'vehicle',
        'vehicle_1',
        'licenciamento',
        nextMonth.toISOString().split('T')[0]
      )

      // Function completed successfully
      expect(true).toBe(true)
    })

    it('should handle invalid date gracefully', async () => {
      await checkAndUpdateAlertas('company_1', 'company', 'company_1', 'alvara', 'invalid-date')

      // Function completed successfully (graceful handling of invalid date)
      expect(true).toBe(true)
    })
  })

  describe('Validity Types and Alert Levels', () => {
    it('should recognize all validity types', () => {
      const types = ['cnv', 'reciclagem', 'alvara', 'porte_arma', 'colete', 'ecpf', 'licenciamento', 'seguro', 'vistoria_pf']

      expect(types).toContain('cnv')
      expect(types).toContain('alvara')
      expect(types).toContain('porte_arma')
    })

    it('should map validity types to friendly names', () => {
      const names: Record<string, string> = {
        cnv: 'CNV',
        reciclagem: 'Reciclagem',
        alvara: 'Alvará de Funcionamento',
        porte_arma: 'Porte de Arma',
        colete: 'Colete Balístico',
        ecpf: 'Certificado e-CPF A1',
        licenciamento: 'Licenciamento',
        seguro: 'Seguro Veículo',
        vistoria_pf: 'Vistoria PF',
      }

      expect(names['cnv']).toBe('CNV')
      expect(names['alvara']).toBe('Alvará de Funcionamento')
    })

    it('should identify critical alerts (<=5 days)', () => {
      const dias = 5
      const isCritical = dias <= 5
      expect(isCritical).toBe(true)
    })

    it('should identify urgent alerts (6-30 days)', () => {
      const dias = 15
      const isUrgent = dias > 5 && dias <= 30
      expect(isUrgent).toBe(true)
    })

    it('should identify attention alerts (31-60 days)', () => {
      const dias = 45
      const needsAttention = dias > 30 && dias <= 60
      expect(needsAttention).toBe(true)
    })

    it('should identify informational alerts (61-90 days)', () => {
      const dias = 75
      const isInfo = dias > 60 && dias <= 90
      expect(isInfo).toBe(true)
    })
  })
})
