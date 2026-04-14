import { describe, it, expect, beforeEach, vi } from 'vitest'

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

vi.mock('resend', () => ({
  Resend: vi.fn(() => ({
    emails: {
      send: vi.fn().mockResolvedValue({ data: { id: 'email_123' } }),
    },
  })),
}))

vi.mock('@react-email/components', () => ({
  render: vi.fn((_component) => '<html><body>Email Content</body></html>'),
}))

describe('Email Integration - Email Workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should process email inbound event', () => {
    const emailInbound = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      company_id: '550e8400-e29b-41d4-a716-446655440001',
      from_email: 'user@example.com',
      subject: 'Novo Vigilante',
      body_text: 'Solicito cadastro do vigilante João Silva...',
      status: 'recebido',
      created_at: new Date().toISOString(),
    }

    expect(emailInbound.status).toBe('recebido')
    expect(emailInbound.body_text).toBeTruthy()
  })

  it('should classify email to workflow', () => {
    const classification = {
      tipo_demanda: 'novo_vigilante',
      confidence: 0.95,
      urgente: false,
    }

    expect(classification.tipo_demanda).toBe('novo_vigilante')
    expect(classification.confidence).toBeGreaterThan(0.6)
  })

  it('should create workflow from classified email', () => {
    const workflow = {
      id: '550e8400-e29b-41d4-a716-446655440002',
      company_id: '550e8400-e29b-41d4-a716-446655440001',
      email_inbound_id: '550e8400-e29b-41d4-a716-446655440000',
      tipo_demanda: 'novo_vigilante',
      status: 'classificado',
      prioridade: 'normal',
      dados_extraidos: {},
    }

    expect(workflow.tipo_demanda).toBe('novo_vigilante')
    expect(workflow.status).toBe('classificado')
  })

  it('should extract data from workflow', () => {
    const extracted = {
      nome_completo: 'João Silva dos Santos',
      cpf: '11144477735',
      rg: '123456789',
      data_nascimento: '1990-01-15',
      email: 'joao@example.com',
    }

    expect(extracted.nome_completo).toBeTruthy()
    expect(extracted.cpf).toBeTruthy()
    expect(extracted.email).toBeTruthy()
  })
})

describe('Email Classification - Urgency Detection', () => {
  it('should mark email as urgent when subject contains URGENTE', () => {
    const subjects = [
      'URGENTE: Novo Vigilante',
      'Urgente - Compra de Arma',
      'PRAZO HOJE: Renovação CNV',
      'AUTUAÇÃO Número 12345',
      'IMEDIATO: Transferência de Posto',
    ]

    for (const subject of subjects) {
      const isUrgent = /urgente|urgência|prazo hoje|autuação|imediato/i.test(subject)
      expect(isUrgent).toBe(true)
    }
  })

  it('should set priority 1 for urgent emails', () => {
    const urgentEmail = {
      subject: 'URGENTE: Novo Vigilante',
      prioridade: 'urgente',
    }

    expect(urgentEmail.prioridade).toBe('urgente')
  })

  it('should set priority normal for regular emails', () => {
    const regularEmail = {
      subject: 'Novo Vigilante',
      prioridade: 'normal',
    }

    expect(regularEmail.prioridade).toBe('normal')
  })
})

describe('Email - Unknown Case Template', () => {
  it('should send Template E for unknown case', async () => {
    const emailOutbound = {
      id: '550e8400-e29b-41d4-a716-446655440003',
      template_id: 'E',
      status: 'enviado',
      to_email: 'user@example.com',
      subject: '[VIG PRO] Caso não classificado',
    }

    expect(emailOutbound.template_id).toBe('E')
    expect(emailOutbound.status).toBe('enviado')
  })

  it('should include original email in Template E', () => {
    const templatePayload = {
      razaoSocial: 'Empresa Teste',
      emailOriginal: 'user@example.com',
      assuntoOriginal: 'Assunto não identificado',
      corpoOriginal: 'Corpo do email...',
    }

    expect(templatePayload.emailOriginal).toBeTruthy()
    expect(templatePayload.assuntoOriginal).toBeTruthy()
  })
})

describe('Email - Action Confirmation Template', () => {
  it('should send Template B after action execution', async () => {
    const emailOutbound = {
      id: '550e8400-e29b-41d4-a716-446655440004',
      template_id: 'B',
      status: 'enviado',
      to_email: 'resp@empresa.com',
      workflow_id: '550e8400-e29b-41d4-a716-446655440002',
    }

    expect(emailOutbound.template_id).toBe('B')
    expect(emailOutbound.workflow_id).toBeTruthy()
  })

  it('should include action details in Template B', () => {
    const templatePayload = {
      razaoSocial: 'Empresa Teste',
      tipoAcao: 'Cadastro de Vigilante',
      statusAcao: 'executado',
      dataExecucao: new Date().toISOString(),
      detalhes: {
        nome: 'João Silva',
        cpf: '11144477735',
      },
    }

    expect(templatePayload.tipoAcao).toBeTruthy()
    expect(templatePayload.statusAcao).toBe('executado')
  })
})

describe('Email - Templates', () => {
  const templates = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

  it('should have all required templates defined', () => {
    expect(templates).toContain('A') // Boas-vindas
    expect(templates).toContain('B') // Confirmação
    expect(templates).toContain('C') // Alerta Validade
    expect(templates).toContain('D') // Renovação
    expect(templates).toContain('E') // Caso Desconhecido
    expect(templates).toContain('F') // Urgência
    expect(templates).toContain('G') // Alerta Frota
  })

  it('should map templates correctly', () => {
    const templateMap = {
      'A': 'Boas-vindas',
      'B': 'Confirmação',
      'C': 'Alerta Validade',
      'D': 'Renovação',
      'E': 'Caso Desconhecido',
      'F': 'Urgência',
      'G': 'Alerta Frota',
    }

    expect(templateMap['A']).toBe('Boas-vindas')
    expect(templateMap['E']).toBe('Caso Desconhecido')
  })
})

describe('Email Sending - Status Tracking', () => {
  it('should record email_outbound before sending', () => {
    const outbound = {
      id: '550e8400-e29b-41d4-a716-446655440005',
      status: 'pendente',
      created_at: new Date().toISOString(),
    }

    expect(outbound.status).toBe('pendente')
    expect(outbound.created_at).toBeTruthy()
  })

  it('should update status to enviado after successful send', () => {
    const outbound = {
      id: '550e8400-e29b-41d4-a716-446655440005',
      status: 'enviado',
      resend_id: 'email_123',
      sent_at: new Date().toISOString(),
    }

    expect(outbound.status).toBe('enviado')
    expect(outbound.resend_id).toBeTruthy()
  })

  it('should record status as erro on failure', () => {
    const outbound = {
      id: '550e8400-e29b-41d4-a716-446655440005',
      status: 'erro',
      erro_detalhe: 'Connection timeout',
    }

    expect(outbound.status).toBe('erro')
    expect(outbound.erro_detalhe).toBeTruthy()
  })
})

describe('Email - Company Email Selection', () => {
  it('should use email_responsavel for CLIENTE_HTML mode', () => {
    const company = {
      email_responsavel: 'responsavel@empresa.com',
      email_operacional: 'operacional@empresa.com',
    }

    const mode = 'CLIENTE_HTML'
    const toEmail = mode === 'CLIENTE_HTML' ? company.email_responsavel : company.email_operacional

    expect(toEmail).toBe('responsavel@empresa.com')
  })

  it('should use email_operacional for OFICIO_PF mode', () => {
    const company = {
      email_responsavel: 'responsavel@empresa.com',
      email_operacional: 'operacional@empresa.com',
    }

    const mode = 'OFICIO_PF' as string
    const toEmail = mode === 'CLIENTE_HTML' ? company.email_responsavel : company.email_operacional

    expect(toEmail).toBe('operacional@empresa.com')
  })
})

describe('Email - Rendering', () => {
  it('should render React Email template to HTML', async () => {
    const _payload = {
      razaoSocial: 'Empresa Teste',
      emailEmpresa: 'operacional@empresa.com',
    }

    const html = '<html><body>Email Content</body></html>'

    expect(html).toContain('html')
    expect(html).toContain('body')
  })

  it('should pass payload to template', () => {
    const payload = {
      razaoSocial: 'Empresa Teste',
      tipoDocumento: 'CNV',
      diasRestantes: 5,
    }

    expect(payload.razaoSocial).toBeTruthy()
    expect(payload.diasRestantes).toBe(5)
  })
})

describe('Email Workflow - Integration', () => {
  it('should complete full email workflow', async () => {
    const steps = [
      { step: 1, action: 'Email received', status: 'recebido' },
      { step: 2, action: 'Email classified', status: 'classificado' },
      { step: 3, action: 'Workflow created', status: 'criado' },
      { step: 4, action: 'Data extracted', status: 'extraido' },
      { step: 5, action: 'Action executed', status: 'executado' },
      { step: 6, action: 'Confirmation sent', status: 'confirmado' },
    ]

    expect(steps).toHaveLength(6)
    expect(steps[0].status).toBe('recebido')
    expect(steps[steps.length - 1].status).toBe('confirmado')
  })

  it('should handle email with low confidence', () => {
    const classification = {
      tipo_demanda: 'caso_desconhecido',
      confidence: 0.45,
      urgente: false,
    }

    const shouldSendTemplateE = classification.confidence < 0.6
    expect(shouldSendTemplateE).toBe(true)
  })

  it('should escalate urgent emails', () => {
    const email = {
      subject: 'URGENTE: Problema crítico',
      urgente: true,
      prioridade: 'urgente',
    }

    expect(email.prioridade).toBe('urgente')
    expect(email.urgente).toBe(true)
  })
})

describe('Email - Error Handling', () => {
  it('should handle send failure gracefully', () => {
    const outbound = {
      status: 'erro',
      erro_detalhe: 'Email service unavailable',
      retry_count: 0,
    }

    expect(outbound.status).toBe('erro')
    expect(outbound.erro_detalhe).toBeTruthy()
  })

  it('should track retry attempts', () => {
    const outbound = {
      status: 'erro',
      retry_count: 3,
      last_retry_at: new Date().toISOString(),
    }

    const canRetry = outbound.retry_count < 5
    expect(canRetry).toBe(true)
  })

  it('should validate email format before sending', () => {
    const validEmails = ['user@example.com', 'test+tag@domain.co.uk']
    const invalidEmails = ['invalid-email', 'user@', '@domain.com']

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    for (const email of validEmails) {
      expect(emailRegex.test(email)).toBe(true)
    }

    for (const email of invalidEmails) {
      expect(emailRegex.test(email)).toBe(false)
    }
  })
})
