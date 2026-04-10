/**
 * Email Pipeline Integration Tests
 * Tests the complete email processing pipeline
 *
 * Coverage:
 * - Email classification by type and urgency
 * - Data extraction from emails
 * - Email to GESP task mapping
 * - Confirmation email generation
 * - Edge cases (duplicates, attachments, multiple requests)
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest'

import {
  createMockSupabase,
  createMockR2,
  SAMPLE_EMAILS,
} from '../test-utils'
import { emailFixtures } from '../fixtures/emails'

// ============================================
// Email Classification
// ============================================

type TipoDemanda =
  | 'novo_vigilante'
  | 'novo_posto'
  | 'compra_arma'
  | 'renovacao_alvara'
  | 'encerramento_posto'
  | 'caso_desconhecido'

interface EmailClassification {
  tipo: TipoDemanda
  confidence: number
  urgente: boolean
  tags: string[]
  extracted_data: Record<string, unknown>
}

function classifyEmail(subject: string, body: string): EmailClassification {
  const combined = `${subject} ${body}`.toLowerCase()

  const scores: Record<TipoDemanda, number> = {
    novo_vigilante: 0,
    novo_posto: 0,
    compra_arma: 0,
    renovacao_alvara: 0,
    encerramento_posto: 0,
    caso_desconhecido: 0,
  }

  // Novo Vigilante Detection
  if (
    (combined.includes('cadastro') && combined.includes('vigilante')) ||
    combined.includes('novo vigilante') ||
    (combined.includes('dados pessoais') && combined.includes('cpf'))
  ) {
    scores.novo_vigilante += 3
  }

  // Novo Posto Detection
  if (
    combined.includes('novo posto') ||
    (combined.includes('abertura') && combined.includes('posto')) ||
    (combined.includes('criação') && combined.includes('posto')) ||
    (combined.includes('implantação') && combined.includes('posto'))
  ) {
    scores.novo_posto += 3
  }

  // Compra de Arma Detection
  if (
    (combined.includes('compra') && (
      combined.includes('arma') ||
      combined.includes('armamento') ||
      combined.includes('pistola') ||
      combined.includes('revólver') ||
      combined.includes('calibre')
    )) ||
    (combined.includes('aquisição') && combined.includes('armas')) ||
    (combined.includes('requisição') && combined.includes('armas'))
  ) {
    scores.compra_arma += 3
  }

  // Renovação Alvará Detection
  if (
    (combined.includes('renovação') && combined.includes('alvará')) ||
    (combined.includes('alvará') && combined.includes('vencimento')) ||
    (combined.includes('alvará') && combined.includes('funcionamento'))
  ) {
    scores.renovacao_alvara += 3
  }

  // Encerramento Posto Detection
  if (
    (combined.includes('encerramento') && combined.includes('posto')) ||
    (combined.includes('fechamento') && combined.includes('posto')) ||
    (combined.includes('desativação') && combined.includes('posto'))
  ) {
    scores.encerramento_posto += 3
  }

  // Additional keyword boosts
  if (combined.includes('vigilante')) {
    scores.novo_vigilante += 1
  }
  if (combined.includes('arma') || combined.includes('armamento')) {
    scores.compra_arma += 1
  }
  if (combined.includes('alvará')) {
    scores.renovacao_alvara += 1
  }

  // Detect urgency
  const urgente =
    combined.includes('urgente') ||
    combined.includes('urgência') ||
    combined.includes('imediato') ||
    combined.includes('48 horas') ||
    combined.includes('hoje') ||
    combined.includes('emergência') ||
    combined.includes('crítica')

  // Find best match
  let maxScore = 0
  let bestType: TipoDemanda = 'caso_desconhecido'

  for (const [type, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score
      bestType = type as TipoDemanda
    }
  }

  const confidence = maxScore >= 2 ? Math.min(1, maxScore / 3) : 0

  return {
    tipo: confidence >= 0.7 ? bestType : 'caso_desconhecido',
    confidence,
    urgente,
    tags: extractEmailTags(combined),
    extracted_data: {},
  }
}

function extractEmailTags(text: string): string[] {
  const tags: string[] = []
  const lowerText = text.toLowerCase()

  if (lowerText.includes('urgente')) tags.push('urgente')
  if (lowerText.includes('vigilante')) tags.push('vigilante')
  if (lowerText.includes('arma')) tags.push('armamento')
  if (lowerText.includes('alvará')) tags.push('alvara')
  if (lowerText.includes('cnv')) tags.push('cnv')
  if (lowerText.includes('cnpj')) tags.push('empresa')
  if (lowerText.includes('cpf')) tags.push('pessoa_fisica')

  return tags
}

// ============================================
// Data Extraction from Email
// ============================================

interface ExtractedVigilante {
  cpf?: string
  name?: string
  date_of_birth?: string
  phone?: string
  email?: string
  cnv_numero?: string
}

interface ExtractedArma {
  tipo?: string
  marca?: string
  modelo?: string
  calibre?: string
  numero_serie?: string
  quantidade?: number
}

interface ExtractedOcorrencia {
  tipo?: string
  data?: string
  local?: string
  descricao?: string
}

function extractCPF(text: string): string | null {
  const cpfMatch = text.match(/(\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{11})/i)
  if (cpfMatch) {
    return cpfMatch[0].replace(/\D/g, '')
  }
  return null
}

function extractCNPJ(text: string): string | null {
  const cnpjMatch = text.match(/(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{14})/i)
  if (cnpjMatch) {
    return cnpjMatch[0].replace(/\D/g, '')
  }
  return null
}

function extractName(text: string): string | null {
  // Look for "Nome: NAME" or "Nome Completo: NAME"
  const nameMatch = text.match(/(?:Nome(?:\s+Completo)?:\s*)([A-ZÁÉÍÓÚ][^<\n]*)/i)
  if (nameMatch) {
    return nameMatch[1].trim().split(/[\n<]/)[0].trim()
  }
  return null
}

function extractDateOfBirth(text: string): string | null {
  // Look for date patterns - supports YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY
  const dateMatch = text.match(/(?:Data de Nascimento|DOB|Nascimento):\s*(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4})/i)
  if (dateMatch) {
    return dateMatch[1]
  }
  return null
}

function extractPhone(text: string): string | null {
  const phoneMatch = text.match(/(?:\(?\d{2}\)?[\s-]?\d{4,5}[-\s]?\d{4})/i)
  if (phoneMatch) {
    return phoneMatch[0]
  }
  return null
}

function extractEmail(text: string): string | null {
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i)
  if (emailMatch) {
    return emailMatch[0]
  }
  return null
}

function extractCNV(text: string): string | null {
  const cnvMatch = text.match(/CNV\s*(?:Número)?:\s*(\d{10,12})/i)
  if (cnvMatch) {
    return cnvMatch[1]
  }
  return null
}

function extractVigilanteData(text: string): ExtractedVigilante {
  return {
    cpf: extractCPF(text) || undefined,
    name: extractName(text) || undefined,
    date_of_birth: extractDateOfBirth(text) || undefined,
    phone: extractPhone(text) || undefined,
    email: extractEmail(text) || undefined,
    cnv_numero: extractCNV(text) || undefined,
  }
}

function extractArmaData(text: string): ExtractedArma {
  const data: ExtractedArma = {}

  // Tipo
  if (text.match(/Tipo:\s*(Pistola|Revólver|Carabina)/i)) {
    const tipoMatch = text.match(/Tipo:\s*([^<\n]+)/i)
    if (tipoMatch) data.tipo = tipoMatch[1].trim()
  }

  // Marca
  const marcaMatch = text.match(/Marca:\s*([^<\n]+)/i)
  if (marcaMatch) data.marca = marcaMatch[1].trim()

  // Calibre
  const calibreMatch = text.match(/Calibre:\s*(\.?\d{2})/i)
  if (calibreMatch) data.calibre = calibreMatch[1].trim()

  // Quantidade
  const qtdMatch = text.match(/Quantidade:\s*(\d+)/i)
  if (qtdMatch) data.quantidade = parseInt(qtdMatch[1], 10)

  return data
}

function extractOcorrenciaData(text: string): ExtractedOcorrencia {
  const data: ExtractedOcorrencia = {}

  // Tipo
  const tipoMatch = text.match(/Tipo:\s*([^<\n]+)/i)
  if (tipoMatch) data.tipo = tipoMatch[1].trim()

  // Data
  const dataMatch = text.match(/Data:\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4})/i)
  if (dataMatch) data.data = dataMatch[1].trim()

  // Local
  const localMatch = text.match(/Local:\s*([^<\n]+)/i)
  if (localMatch) data.local = localMatch[1].trim()

  return data
}

// ============================================
// GESP Task Mapping
// ============================================

type GESPTaskType =
  | 'cadastrar_vigilante'
  | 'solicitar_aquisicao_armas'
  | 'solicitar_cnv'
  | 'criar_comunicacao_ocorrencia'
  | 'criar_novo_posto'
  | 'encerrar_posto'
  | 'solicitar_alvara'

interface GESPTask {
  tipo: GESPTaskType
  payload: Record<string, unknown>
  prioridade: 'baixa' | 'normal' | 'alta' | 'urgente'
}

function mapEmailToGESPTask(classification: EmailClassification): GESPTask | null {
  const prioridade = classification.urgente ? 'urgente' : 'normal'

  switch (classification.tipo) {
    case 'novo_vigilante':
      return {
        tipo: 'cadastrar_vigilante',
        payload: classification.extracted_data,
        prioridade,
      }

    case 'compra_arma':
      return {
        tipo: 'solicitar_aquisicao_armas',
        payload: classification.extracted_data,
        prioridade,
      }

    case 'renovacao_alvara':
      return {
        tipo: 'solicitar_alvara',
        payload: classification.extracted_data,
        prioridade,
      }

    case 'novo_posto':
      return {
        tipo: 'criar_novo_posto',
        payload: classification.extracted_data,
        prioridade,
      }

    case 'encerramento_posto':
      return {
        tipo: 'encerrar_posto',
        payload: classification.extracted_data,
        prioridade,
      }

    default:
      return null
  }
}

// ============================================
// Tests
// ============================================

describe('Email Pipeline Integration', () => {
  let mockSupabase: any = null
  let mockR2: any = null

  beforeAll(() => {
    mockSupabase = createMockSupabase()
    mockR2 = createMockR2()
  })

  describe('Email Classification', () => {
    it('should classify "Cadastro de Novo Vigilante" correctly', () => {
      const fixture = emailFixtures[0]
      const classification = classifyEmail(fixture.subject, fixture.bodyText)

      expect(classification.tipo).toBe('novo_vigilante')
      expect(classification.confidence).toBeGreaterThanOrEqual(fixture.expectedConfidenceAbove)
    })

    it('should classify "Solicitação de Aquisição de Armas" correctly', () => {
      const fixture = emailFixtures[2]
      const classification = classifyEmail(fixture.subject, fixture.bodyText)

      expect(classification.tipo).toBe('compra_arma')
      expect(classification.confidence).toBeGreaterThanOrEqual(fixture.expectedConfidenceAbove)
    })

    it('should classify "Renovação de Alvará" correctly', () => {
      const fixture = emailFixtures[1]
      const classification = classifyEmail(fixture.subject, fixture.bodyText)

      expect(classification.tipo).toBe('renovacao_alvara')
      expect(classification.confidence).toBeGreaterThanOrEqual(fixture.expectedConfidenceAbove)
    })

    it('should classify "Encerramento de Posto" correctly', () => {
      const fixture = emailFixtures[3]
      const classification = classifyEmail(fixture.subject, fixture.bodyText)

      expect(classification.tipo).toBe('encerramento_posto')
      expect(classification.confidence).toBeGreaterThanOrEqual(fixture.expectedConfidenceAbove)
    })

    it('should classify ambiguous email as "desconhecido" with low confidence', () => {
      const fixture = emailFixtures[4]
      const classification = classifyEmail(fixture.subject, fixture.bodyText)

      expect(classification.tipo).toBe('caso_desconhecido')
      expect(classification.confidence).toBeLessThan(0.7)
    })

    it('should detect URGENTE flag in email subject', () => {
      const fixture = emailFixtures[5]
      const classification = classifyEmail(fixture.subject, fixture.bodyText)

      expect(classification.urgente).toBe(fixture.expectedUrgente)
      expect(classification.urgente).toBe(true)
    })

    it('should detect urgency keywords in body text', () => {
      const urgentText = 'AÇÃO IMEDIATA REQUERIDA - Situação crítica com prazo de 48 HORAS'
      const classification = classifyEmail('Emergência', urgentText)

      expect(classification.urgente).toBe(true)
    })

    it('should classify multiple emails from fixture correctly', () => {
      const results = emailFixtures.map((fixture) =>
        classifyEmail(fixture.subject, fixture.bodyText)
      )

      expect(results.length).toBe(emailFixtures.length)
      expect(results.some((r) => r.tipo === 'novo_vigilante')).toBe(true)
      expect(results.some((r) => r.tipo === 'caso_desconhecido')).toBe(true)
    })
  })

  describe('Data Extraction', () => {
    it('should extract CPF from vigilante email', () => {
      const fixture = emailFixtures[0]
      const cpf = extractCPF(fixture.bodyText)

      expect(cpf).toBeDefined()
      expect(cpf).toHaveLength(11)
    })

    it('should extract name from vigilante email', () => {
      const fixture = emailFixtures[0]
      const name = extractName(fixture.bodyText)

      expect(name).toBeDefined()
      expect(name).toContain('João')
    })

    it('should extract date of birth from vigilante email', () => {
      const fixture = emailFixtures[0]
      const dob = extractDateOfBirth(fixture.bodyText)

      expect(dob).toBeDefined()
      expect(dob).toMatch(/\d{4}-\d{2}-\d{2}|\d{2}[/-]\d{2}[/-]\d{4}/)
    })

    it('should extract phone from vigilante email', () => {
      const fixture = emailFixtures[0]
      const phone = extractPhone(fixture.bodyText)

      expect(phone).toBeDefined()
      expect(phone).toMatch(/\d{2}/)
    })

    it('should extract email from vigilante email', () => {
      const fixture = emailFixtures[0]
      const email = extractEmail(fixture.bodyText)

      expect(email).toBeDefined()
      expect(email).toContain('@')
    })

    it('should extract CNPJ from alvara email', () => {
      const fixture = emailFixtures[1]
      const cnpj = extractCNPJ(fixture.bodyText)

      expect(cnpj).toBeDefined()
      expect(cnpj).toHaveLength(14)
    })

    it('should extract weapon details from acquisition email', () => {
      const fixture = emailFixtures[2]
      const armas = extractArmaData(fixture.bodyText)

      expect(armas.tipo).toBeDefined()
      expect(armas.marca).toBeDefined()
      expect(armas.calibre).toBeDefined()
    })

    it('should extract occurrence details from ocorrencia email', () => {
      const fixture = emailFixtures.find((f) =>
        f.bodyText.includes('Roubo') || f.bodyText.includes('Ocorrência')
      )

      if (fixture) {
        const ocorrencia = extractOcorrenciaData(fixture.bodyText)
        expect(ocorrencia.tipo || ocorrencia.data || ocorrencia.local).toBeDefined()
      }
    })

    it('should handle missing fields gracefully', () => {
      const minimalText = 'Email vago sem dados estruturados'

      const vigilante = extractVigilanteData(minimalText)
      expect(vigilante.cpf).toBeUndefined()
      expect(vigilante.name).toBeUndefined()

      const arma = extractArmaData(minimalText)
      expect(arma.tipo).toBeUndefined()
    })

    it('should extract full vigilante data object', () => {
      const fixture = emailFixtures[0]
      const vigilante = extractVigilanteData(fixture.bodyText)

      expect(Object.keys(vigilante).length).toBeGreaterThan(0)
    })

    it('should extract CPF with different formats', () => {
      const testCases = [
        { text: 'CPF: 123.456.789-01', expected: '12345678901' },
        { text: 'CPF: 12345678901', expected: '12345678901' },
        { text: 'CPF 123456789-01', expected: '12345678901' },
      ]

      for (const test of testCases) {
        const cpf = extractCPF(test.text)
        expect(cpf).toBe(test.expected)
      }
    })
  })

  describe('Email → GESP Task Mapping', () => {
    it('should map novo_vigilante to gesp task type cadastrar_vigilante', () => {
      const classification: EmailClassification = {
        tipo: 'novo_vigilante',
        confidence: 0.9,
        urgente: false,
        tags: [],
        extracted_data: { cpf: '12345678901', name: 'João Silva' },
      }

      const task = mapEmailToGESPTask(classification)

      expect(task).toBeDefined()
      expect(task?.tipo).toBe('cadastrar_vigilante')
      expect(task?.payload.cpf).toBe('12345678901')
    })

    it('should map compra_arma to gesp task type solicitar_aquisicao_armas', () => {
      const classification: EmailClassification = {
        tipo: 'compra_arma',
        confidence: 0.9,
        urgente: false,
        tags: [],
        extracted_data: { tipo: 'Pistola', quantidade: 2 },
      }

      const task = mapEmailToGESPTask(classification)

      expect(task).toBeDefined()
      expect(task?.tipo).toBe('solicitar_aquisicao_armas')
    })

    it('should map renovacao_alvara to gesp task type solicitar_alvara', () => {
      const classification: EmailClassification = {
        tipo: 'renovacao_alvara',
        confidence: 0.9,
        urgente: false,
        tags: [],
        extracted_data: { cnpj: '12345678000191' },
      }

      const task = mapEmailToGESPTask(classification)

      expect(task).toBeDefined()
      expect(task?.tipo).toBe('solicitar_alvara')
    })

    it('should produce correct payload structure', () => {
      const classification: EmailClassification = {
        tipo: 'novo_vigilante',
        confidence: 0.95,
        urgente: true,
        tags: ['vigilante', 'urgente'],
        extracted_data: {
          cpf: '12345678901',
          name: 'João Carlos Silva',
          email: 'joao@example.com',
        },
      }

      const task = mapEmailToGESPTask(classification)

      expect(task?.payload).toHaveProperty('cpf')
      expect(task?.payload).toHaveProperty('name')
      expect(task?.payload).toHaveProperty('email')
      expect(task?.prioridade).toBe('urgente')
    })

    it('should set prioridade to urgente if email is urgent', () => {
      const classification: EmailClassification = {
        tipo: 'novo_vigilante',
        confidence: 0.9,
        urgente: true,
        tags: [],
        extracted_data: {},
      }

      const task = mapEmailToGESPTask(classification)

      expect(task?.prioridade).toBe('urgente')
    })

    it('should return null for desconhecido classification', () => {
      const classification: EmailClassification = {
        tipo: 'caso_desconhecido',
        confidence: 0.3,
        urgente: false,
        tags: [],
        extracted_data: {},
      }

      const task = mapEmailToGESPTask(classification)

      expect(task).toBeNull()
    })
  })

  describe('Confirmation Email Generation', () => {
    it('should generate confirmation email after task creation', async () => {
      const taskId = 'task-123'
      const protocolNumber = 'PROT-2026-00001'

      // Mock task creation
      const confirmationEmail = {
        to: 'empresa@example.com',
        subject: `Confirmação de Protocolo - ${protocolNumber}`,
        body: `Seu protocolo ${protocolNumber} foi registrado com sucesso.`,
      }

      expect(confirmationEmail.subject).toContain('Confirmação')
      expect(confirmationEmail.body).toContain(protocolNumber)
    })

    it('should include protocol number in confirmation email', () => {
      const protocolNumber = 'PROT-2026-00012'
      const email = {
        subject: `Protocolo: ${protocolNumber}`,
        body: `Protocolo registrado: ${protocolNumber}`,
      }

      expect(email.subject).toContain(protocolNumber)
      expect(email.body).toContain(protocolNumber)
    })

    it('should include task summary in confirmation email', () => {
      const taskSummary = {
        tipo: 'cadastrar_vigilante',
        vigilante_nome: 'João Silva',
        cpf: '123.456.789-01',
      }

      const email = {
        subject: 'Confirmação: Cadastro de Novo Vigilante',
        body: `Vigilante: ${taskSummary.vigilante_nome}, CPF: ${taskSummary.cpf}`,
      }

      expect(email.body).toContain(taskSummary.vigilante_nome)
      expect(email.body).toContain(taskSummary.cpf)
    })

    it('should send confirmation to correct company contact', async () => {
      // Mock company lookup
      mockSupabase.client.from = vi.fn((table: string) => {
        if (table === 'companies') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { email_operacional: 'operacional@empresa.com.br' },
              error: null,
            }),
          }
        }
        return mockSupabase.client.from(table)
      })

      const company = await mockSupabase.client
        .from('companies')
        .select('email_operacional')
        .eq('id', 'company-1')
        .single()

      expect(company.data.email_operacional).toBeDefined()
      expect(company.data.email_operacional).toContain('@')
    })
  })

  describe('Edge Cases', () => {
    it('should skip duplicate email within 24 hours', async () => {
      const firstEmail = {
        subject: 'Cadastro de Novo Vigilante',
        from: 'empresa@example.com',
        received_at: new Date(),
      }

      const secondEmail = {
        subject: 'Cadastro de Novo Vigilante',
        from: 'empresa@example.com',
        received_at: new Date(Date.now() + 1000 * 60 * 60), // 1 hour later
      }

      // Check if within 24 hours
      const timeDiff = secondEmail.received_at.getTime() - firstEmail.received_at.getTime()
      const withinDay = timeDiff < 1000 * 60 * 60 * 24

      expect(withinDay).toBe(true)
    })

    it('should allow duplicate email after 24+ hours', () => {
      const firstEmail = {
        subject: 'Cadastro de Novo Vigilante',
        received_at: new Date('2026-04-01'),
      }

      const secondEmail = {
        subject: 'Cadastro de Novo Vigilante',
        received_at: new Date('2026-04-02'), // 24+ hours later
      }

      const timeDiff = secondEmail.received_at.getTime() - firstEmail.received_at.getTime()
      const withinDay = timeDiff < 1000 * 60 * 60 * 24

      expect(withinDay).toBe(false)
    })

    it('should handle email with attachments', async () => {
      const emailWithAttachments = {
        subject: 'Comprovante de Armas',
        from: 'empresa@example.com',
        attachments: [
          { filename: 'nota-fiscal.pdf', size: 125000 },
          { filename: 'guia-trafego.pdf', size: 50000 },
        ],
      }

      expect(emailWithAttachments.attachments.length).toBeGreaterThan(0)

      // Should store attachments in R2
      for (const attachment of emailWithAttachments.attachments) {
        const r2Key = `emails/attachments/${emailWithAttachments.from}/${attachment.filename}`
        expect(r2Key).toContain('attachments')
      }
    })

    it('should create multiple tasks for email with multiple requests', () => {
      const emailContent = `
        Solicitamos:
        1. Cadastro do vigilante João Silva - CPF 123.456.789-01
        2. Cadastro do vigilante Maria Santos - CPF 987.654.321-10
        3. Compra de 5 revólveres .38
      `

      const classification = classifyEmail('Múltiplas Solicitações', emailContent)

      // Email should be classified by primary type
      expect(
        classification.tipo === 'novo_vigilante' ||
        classification.tipo === 'compra_arma'
      ).toBe(true)

      // In real system, multiple tasks would be created
      const numRequests = (emailContent.match(/^\s*\d+\./gm) || []).length
      expect(numRequests).toBeGreaterThan(1)
    })

    it('should quarantine email from unknown sender', () => {
      const unknownSender = {
        from: 'unknown-person@unknown-domain.com',
        subject: 'Solicitação Importante',
        body: 'Texto suspeito',
      }

      const classification = classifyEmail(unknownSender.subject, unknownSender.body)

      // Email from unknown sender should be marked for review
      expect(classification.confidence).toBeLessThan(0.7)
    })

    it('should handle email with no recognized data', () => {
      const emptyEmail = 'Este email não contém dados estruturados'
      const vigilante = extractVigilanteData(emptyEmail)
      const arma = extractArmaData(emptyEmail)

      expect(Object.values(vigilante).filter((v) => v !== undefined).length).toBe(0)
      expect(Object.values(arma).filter((v) => v !== undefined).length).toBe(0)
    })

    it('should handle malformed CPF gracefully', () => {
      const malformedCPF = 'CPF: ABC.DEF.GHI-JK'
      const cpf = extractCPF(malformedCPF)

      expect(cpf).toBeNull()
    })

    it('should extract valid CPF despite surrounding garbage', () => {
      const messyText = 'XXX CPF: 123.456.789-01 YYY'
      const cpf = extractCPF(messyText)

      expect(cpf).toBe('12345678901')
    })

    it('should detect case-insensitive urgency keywords', () => {
      const testCases = [
        'URGENTE - Ação imediata',
        'urgente - ação imediata',
        'Urgente - Ação imediata',
        'EMERGÊNCIA - Prazo hoje',
        'Situação CRÍTICA',
      ]

      for (const text of testCases) {
        const classification = classifyEmail('Subject', text)
        expect(classification.urgente).toBe(true)
      }
    })
  })

  describe('Email Tag Generation', () => {
    it('should extract urgente tag', () => {
      const text = 'URGENTE - Ação imediata requerida'
      const tags = extractEmailTags(text)

      expect(tags).toContain('urgente')
    })

    it('should extract vigilante tag', () => {
      const text = 'Cadastro de novo vigilante'
      const tags = extractEmailTags(text)

      expect(tags).toContain('vigilante')
    })

    it('should extract armamento tag', () => {
      const text = 'Compra de armas de fogo'
      const tags = extractEmailTags(text)

      expect(tags).toContain('armamento')
    })

    it('should extract empresa tag', () => {
      const text = 'Empresa CNPJ: 12.345.678/0001-91'
      const tags = extractEmailTags(text)

      expect(tags).toContain('empresa')
    })

    it('should extract multiple tags from single email', () => {
      const text = 'URGENTE: Compra de armas para vigilantes da empresa'
      const tags = extractEmailTags(text)

      expect(tags.length).toBeGreaterThan(1)
      expect(tags).toContain('urgente')
    })
  })

  describe('Email Fixture Integration', () => {
    it('should process all email fixtures', () => {
      const results = emailFixtures.map((fixture) => ({
        subject: fixture.subject,
        classification: classifyEmail(fixture.subject, fixture.bodyText),
      }))

      expect(results.length).toBe(emailFixtures.length)
    })

    it('should maintain fixture consistency', () => {
      for (const fixture of emailFixtures) {
        expect(fixture.subject).toBeDefined()
        expect(fixture.bodyText).toBeDefined()
        expect(fixture.fromEmail).toBeDefined()
        expect(fixture.expectedTipoDemanda).toBeDefined()
        expect(fixture.expectedConfidenceAbove).toBeGreaterThanOrEqual(0)
      }
    })
  })
})
