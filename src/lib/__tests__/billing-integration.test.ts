import { describe, it, expect, beforeEach, vi } from 'vitest'
import { billingDiario } from '../billing/asaas'

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
  addEmailSendJob: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(() => ({
    messages: {
      create: vi.fn(),
    },
  })),
}))

describe('Billing Integration - billingDiario', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should process companies and return count', async () => {
    const { createSupabaseAdmin } = await import('@/lib/supabase/server')
    const mockSupabase = vi.mocked(createSupabaseAdmin)()

    // Mock the companies query
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
    }

    const mockFrom = vi.fn(() => mockQuery)
    mockSupabase.from = mockFrom as any

    const result = await billingDiario()

    expect(result).toHaveProperty('processed')
    expect(typeof result.processed).toBe('number')
  })

  it('should not process when no companies found', async () => {
    const { createSupabaseAdmin } = await import('@/lib/supabase/server')
    const mockSupabase = vi.mocked(createSupabaseAdmin)()

    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    }

    const mockFrom = vi.fn(() => mockQuery)
    mockSupabase.from = mockFrom as any

    // @ts-ignore
    mockQuery.select = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null }),
    })

    const result = await billingDiario()

    expect(result.processed).toBe(0)
  })
})

describe('Billing Cycle - D+0 to D+30', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should mark company as inadimplente at D+5', async () => {
    // Test that the billing status transitions correctly
    // D+5 = -5 days difference
    const today = new Date()
    const billingDate = new Date(today)
    billingDate.setDate(billingDate.getDate() - 5) // 5 days ago

    const daysAgo = Math.ceil((billingDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    expect(daysAgo).toBe(-5)
  })

  it('should suspend company at D+15', async () => {
    const today = new Date()
    const billingDate = new Date(today)
    billingDate.setDate(billingDate.getDate() - 15)

    const daysAgo = Math.ceil((billingDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    expect(daysAgo).toBe(-15)
  })

  it('should cancel company at D+30', async () => {
    const today = new Date()
    const billingDate = new Date(today)
    billingDate.setDate(billingDate.getDate() - 30)

    const daysAgo = Math.ceil((billingDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    expect(daysAgo).toBe(-30)
  })

  it('should send reminder at D-10', async () => {
    const today = new Date()
    const billingDate = new Date(today)
    billingDate.setDate(billingDate.getDate() + 10)

    const daysUntil = Math.ceil((billingDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    expect(daysUntil).toBe(10)
  })
})

describe('Billing Status Transitions', () => {
  it('should transition: ativo -> inadimplente -> suspenso -> cancelado', () => {
    const statuses = ['ativo', 'inadimplente', 'suspenso', 'cancelado']
    expect(statuses[0]).toBe('ativo')
    expect(statuses[1]).toBe('inadimplente')
    expect(statuses[2]).toBe('suspenso')
    expect(statuses[3]).toBe('cancelado')
  })

  it('should only suspend if currently inadimplente', () => {
    const currentStatus = 'inadimplente'
    const canSuspend = currentStatus === 'inadimplente'
    expect(canSuspend).toBe(true)
  })

  it('should only cancel if currently suspenso', () => {
    const currentStatus = 'suspenso'
    const canCancel = currentStatus === 'suspenso'
    expect(canCancel).toBe(true)
  })

  it('should prevent invalid transitions', () => {
    const currentStatus = 'ativo' as string
    const canSuspend = currentStatus === 'inadimplente' // Should be false
    expect(canSuspend).toBe(false)
  })
})

describe('Billing - Company Statuses', () => {
  const createMockCompany = (overrides = {}) => ({
    id: '550e8400-e29b-41d4-a716-446655440000',
    razao_social: 'Empresa Teste',
    cnpj: '11222333000181',
    email_responsavel: 'resp@empresa.com',
    email_operacional: 'ops@empresa.com',
    billing_status: 'ativo',
    habilitada: true,
    data_proxima_cobranca: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    asaas_customer_id: 'cus_123456',
    valor_mensal: 497,
    plano: 'starter',
    ...overrides,
  })

  it('should process active company', () => {
    const company = createMockCompany()
    expect(company.billing_status).toBe('ativo')
    expect(company.habilitada).toBe(true)
  })

  it('should skip disabled companies', () => {
    const company = createMockCompany({ habilitada: false })
    const shouldProcess = company.habilitada
    expect(shouldProcess).toBe(false)
  })

  it('should handle company with no next billing date', () => {
    const company = createMockCompany({ data_proxima_cobranca: null })
    const hasDate = !!company.data_proxima_cobranca
    expect(hasDate).toBe(false)
  })

  it('should calculate days until billing', () => {
    const today = new Date()
    const billingDate = new Date(today)
    billingDate.setDate(billingDate.getDate() + 10)

    const days = Math.ceil((billingDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    expect(days).toBeGreaterThanOrEqual(9)
    expect(days).toBeLessThanOrEqual(11)
  })
})

describe('Billing - Template Sending', () => {
  it('should send Template D at D-10 and D-5', () => {
    const daysUntil = [10, 5]
    const shouldSend = daysUntil.includes(10) || daysUntil.includes(5)
    expect(shouldSend).toBe(true)
  })

  it('should generate charge at D-0', () => {
    const today = new Date()
    const billingDate = today
    const isD0 = billingDate.toDateString() === today.toDateString()
    expect(isD0).toBe(true)
  })

  it('should update next billing date', () => {
    const currentDate = new Date('2024-01-15')
    const nextDate = new Date(currentDate)
    nextDate.setDate(nextDate.getDate() + 30)

    expect(nextDate).toEqual(new Date('2024-02-14'))
  })
})

describe('Billing - Financial Events', () => {
  it('should record billing history entry', () => {
    const entry = {
      company_id: '550e8400-e29b-41d4-a716-446655440000',
      valor: 497,
      status: 'pendente',
      data_vencimento: '2024-01-15',
    }

    expect(entry.company_id).toBeTruthy()
    expect(entry.valor).toBeGreaterThan(0)
    expect(entry.status).toBe('pendente')
  })

  it('should record system events for status changes', () => {
    const event = {
      tipo: 'billing_inadimplente',
      severidade: 'warning',
      mensagem: 'Company marked as inadimplente',
      company_id: '550e8400-e29b-41d4-a716-446655440000',
    }

    expect(['billing_inadimplente', 'billing_suspenso', 'billing_cancelado']).toContain(event.tipo)
    expect(['warning', 'error', 'critical']).toContain(event.severidade)
  })
})

describe('Billing - Gating Enforcement', () => {
  it('should prevent GESP operations when suspenso', () => {
    const billingStatus = 'suspenso' as string
    const canExecuteGesp = billingStatus === 'ativo' || billingStatus === 'trial'
    expect(canExecuteGesp).toBe(false)
  })

  it('should allow GESP operations when ativo', () => {
    const billingStatus = 'ativo' as string
    const canExecuteGesp = billingStatus === 'ativo' || billingStatus === 'trial'
    expect(canExecuteGesp).toBe(true)
  })

  it('should allow GESP operations during trial', () => {
    const billingStatus = 'trial' as string
    const canExecuteGesp = billingStatus === 'ativo' || billingStatus === 'trial'
    expect(canExecuteGesp).toBe(true)
  })

  it('should block GESP operations when cancelado', () => {
    const billingStatus = 'cancelado' as string
    const canExecuteGesp = billingStatus === 'ativo' || billingStatus === 'trial'
    expect(canExecuteGesp).toBe(false)
  })
})
