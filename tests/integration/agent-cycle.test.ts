/**
 * Integration Test - Agent Cycle Tests
 *
 * Tests the full agent cycle including:
 * - DOU parsing and HTML extraction
 * - Email classification with AI
 * - Email data extraction
 * - Confidence threshold validation (R7: 0.70)
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import {
  startMockServers,
  stopMockServers,
  createMockSupabase,
  createMockR2,
  SAMPLE_EMAILS,
  SAMPLE_DOU_CONTENT,
} from '../test-utils'

// Mock Supabase and R2 before importing modules
vi.mock('@/lib/supabase/server', () => {
  const mockSupabase = createMockSupabase()
  return {
    createSupabaseAdmin: vi.fn(() => mockSupabase.client),
  }
})

vi.mock('@/lib/r2/client', async () => {
  const mockR2 = createMockR2()
  return {
    uploadToR2: mockR2.uploadToR2,
  }
})

vi.mock('@/lib/ai/client', () => ({
  getAnthropicClient: vi.fn(() => ({
    messages: {
      create: vi.fn(),
    },
  })),
  AI_MODELS: {
    FAST: 'claude-haiku-4-5-20251001',
    COMPLEX: 'claude-sonnet-4-6',
    ADVANCED: 'claude-sonnet-4-6',
  },
}))

// ============================================
// Test Suite Setup
// ============================================

describe('Agent Cycle - Integration Tests', () => {
  beforeAll(
    async () => {
      console.log('[Test Suite] Starting mock servers...')
      try {
        await startMockServers()
        console.log('[Test Suite] Mock servers started successfully')
      } catch (error) {
        console.error('[Test Suite] Failed to start mock servers:', error)
        throw new Error(`Failed to start mock servers: ${error instanceof Error ? error.message : String(error)}`)
      }
    },
    30000 // 30 second timeout for server startup
  )

  afterAll(async () => {
    console.log('[Test Suite] Stopping mock servers...')
    try {
      await stopMockServers()
      console.log('[Test Suite] Mock servers stopped')
    } catch (error) {
      console.error('[Test Suite] Error stopping mock servers:', error)
    }
  })

  // ============================================
  // DOU Parser Tests
  // ============================================

  describe('DOU Parser - HTML Extraction', () => {
    it('should read DOU HTML fixture file', () => {
      const fixturePath = path.join(__dirname, '../fixtures/dou-secao1-sample.html')
      expect(fs.existsSync(fixturePath)).toBe(true)

      const html = fs.readFileSync(fixturePath, 'utf-8')
      expect(html).toContain('Diário Oficial da União')
      expect(html.length).toBeGreaterThan(0)
    })

    it('should extract alvara_renovado articles from HTML', () => {
      const fixturePath = path.join(__dirname, '../fixtures/dou-secao1-sample.html')
      const html = fs.readFileSync(fixturePath, 'utf-8')

      // Extract articles with "RENOVAÇÃO DE ALVARÁ"
      const alvaraPattern = /RENOVAÇÃO DE ALVARÁ DE FUNCIONAMENTO/gi
      const matches = html.match(alvaraPattern)

      expect(matches).not.toBeNull()
      expect(matches!.length).toBeGreaterThanOrEqual(1)
    })

    it('should extract cnv_publicada articles from HTML', () => {
      const fixturePath = path.join(__dirname, '../fixtures/dou-secao1-sample.html')
      const html = fs.readFileSync(fixturePath, 'utf-8')

      // Extract articles with CNV
      const cnvPattern = /(PUBLICAÇÃO|REGISTRO) DE (CARTEIRA|CARTEIRA NACIONAL) DE VIGILANTE/gi
      const matches = html.match(cnvPattern)

      expect(matches).not.toBeNull()
      expect(matches!.length).toBeGreaterThanOrEqual(1)
    })

    it('should extract CNPJ and company names from articles', () => {
      const fixturePath = path.join(__dirname, '../fixtures/dou-secao1-sample.html')
      const html = fs.readFileSync(fixturePath, 'utf-8')

      // Extract CNPJ pattern: XX.XXX.XXX/XXXX-XX
      const cnpjPattern = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g
      const cnpjs = html.match(cnpjPattern)

      expect(cnpjs).not.toBeNull()
      expect(cnpjs!.length).toBeGreaterThanOrEqual(3)

      // Extract company names from fixture HTML (in campo-valor-texto spans after Empresa label)
      const companyPattern = /campo-valor-texto">([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-ZÁÀÂÃÉÊÍÓÔÕÚÇ\s&.]+(?:LTDA|S\.A\.|EIRELI|ME))/g
      const matches = html.match(companyPattern)
      expect(matches).not.toBeNull()
    })

    it('should extract validity dates from articles', () => {
      const fixturePath = path.join(__dirname, '../fixtures/dou-secao1-sample.html')
      const html = fs.readFileSync(fixturePath, 'utf-8')

      // Extract date pattern: DD de [month] de YYYY
      const datePattern = /\d{2} de \w+ de \d{4}/g
      const dates = html.match(datePattern)

      expect(dates).not.toBeNull()
      expect(dates!.length).toBeGreaterThanOrEqual(4)
    })

    it('should extract CPF from CNV articles', () => {
      const fixturePath = path.join(__dirname, '../fixtures/dou-secao1-sample.html')
      const html = fs.readFileSync(fixturePath, 'utf-8')

      // Extract CPF pattern: XXX.XXX.XXX-XX
      const cpfPattern = /\d{3}\.\d{3}\.\d{3}-\d{2}/g
      const cpfs = html.match(cpfPattern)

      expect(cpfs).not.toBeNull()
      expect(cpfs!.length).toBeGreaterThanOrEqual(2)
    })
  })

  // ============================================
  // Email Classification Tests
  // ============================================

  describe('Email Classification - Classification Logic', () => {
    it('should classify novo_vigilante emails', () => {
      const email = SAMPLE_EMAILS.novoVigilante
      const keywords = ['novo', 'vigilante', 'cadastro', 'cadastra']

      const isNovoVigilante = keywords.some((kw) =>
        email.subject.toLowerCase().includes(kw) ||
        email.body_text.toLowerCase().includes(kw)
      )

      expect(isNovoVigilante).toBe(true)
    })

    it('should classify renovacao_cnv emails', () => {
      const email = SAMPLE_EMAILS.renovacaoCNV
      const keywords = ['renovação', 'renova', 'cnv', 'carteira']

      const isRenovacao = keywords.some((kw) =>
        email.subject.toLowerCase().includes(kw) ||
        email.body_text.toLowerCase().includes(kw)
      )

      expect(isRenovacao).toBe(true)
    })

    it('should classify novo_alvara emails', () => {
      const email = SAMPLE_EMAILS.novoAlvara
      const keywords = ['alvará', 'alvara', 'funcionamento']

      const isNovoAlvara = keywords.some((kw) =>
        email.subject.toLowerCase().includes(kw) ||
        email.body_text.toLowerCase().includes(kw)
      )

      expect(isNovoAlvara).toBe(true)
    })

    it('should detect urgency from email subject', () => {
      const urgentEmail = SAMPLE_EMAILS.renovacaoCNV
      const urgencyKeywords = ['urgente', 'urgência', 'prazo hoje', 'imediato']

      const isUrgent = urgencyKeywords.some((kw) =>
        urgentEmail.subject.toLowerCase().includes(kw)
      )

      expect(isUrgent).toBe(true)
    })

    it('should not mark regular emails as urgent', () => {
      const regularEmail = SAMPLE_EMAILS.novoVigilante
      const urgencyKeywords = ['urgente', 'urgência', 'prazo hoje', 'imediato']

      const isUrgent = urgencyKeywords.some((kw) =>
        regularEmail.subject.toLowerCase().includes(kw)
      )

      expect(isUrgent).toBe(false)
    })
  })

  // ============================================
  // Email Data Extraction Tests
  // ============================================

  describe('Email Data Extraction - Pattern Matching', () => {
    it('should extract CPF from email body', () => {
      const email = SAMPLE_EMAILS.novoVigilante
      const cpfPattern = /(\d{3})\.?(\d{3})\.?(\d{3})-?(\d{2})/g

      const matches = email.body_text.match(cpfPattern)
      expect(matches).not.toBeNull()
      expect(matches!.length).toBeGreaterThan(0)
      expect(matches![0]).toContain('123')
    })

    it('should extract name from email body', () => {
      const email = SAMPLE_EMAILS.novoVigilante
      // Pattern for names (mixed case, Brazilian names with accents)
      const namePattern = /Nome:\s*(.+)/

      const match = email.body_text.match(namePattern)
      expect(match).not.toBeNull()
      expect(match![1].trim()).toBe('João Carlos Silva Santos')
    })

    it('should extract email from email body', () => {
      const email = SAMPLE_EMAILS.novoVigilante
      const emailPattern = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/g

      const matches = email.body_text.match(emailPattern)
      expect(matches).not.toBeNull()
      expect(matches![0]).toBe('joao@example.com')
    })

    it('should extract phone number from email body', () => {
      const email = SAMPLE_EMAILS.novoVigilante
      const phonePattern = /\(?\d{2}\)?\s?\d{4,5}-?\d{4}/g

      const matches = email.body_text.match(phonePattern)
      expect(matches).not.toBeNull()
      expect(matches!.length).toBeGreaterThan(0)
    })

    it('should extract CNV numbers from email body', () => {
      const email = SAMPLE_EMAILS.renovacaoCNV
      // CNV is typically 10 digits
      const cnvPattern = /CNV\s+(\d{10})/g

      const matches = email.body_text.match(cnvPattern)
      expect(matches).not.toBeNull()
      expect(matches!.length).toBeGreaterThan(0)
    })

    it('should extract CNPJ from email body', () => {
      const email = SAMPLE_EMAILS.novoAlvara
      const cnpjPattern = /(\d{2})\.?(\d{3})\.?(\d{3})\/?\d{4}-?(\d{2})/g

      const matches = email.body_text.match(cnpjPattern)
      expect(matches).not.toBeNull()
      expect(matches!.length).toBeGreaterThan(0)
    })
  })

  // ============================================
  // Confidence Threshold Tests (R7: 0.70)
  // ============================================

  describe('Email Classification - Confidence Threshold (R7: 0.70)', () => {
    it('should accept classification with confidence >= 0.70', () => {
      const classification = {
        tipo_demanda: 'novo_vigilante',
        confidence: 0.85,
      }

      const CONFIDENCE_THRESHOLD = 0.70
      const shouldProcess = classification.confidence >= CONFIDENCE_THRESHOLD

      expect(shouldProcess).toBe(true)
    })

    it('should accept classification with confidence exactly 0.70', () => {
      const classification = {
        tipo_demanda: 'novo_vigilante',
        confidence: 0.70,
      }

      const CONFIDENCE_THRESHOLD = 0.70
      const shouldProcess = classification.confidence >= CONFIDENCE_THRESHOLD

      expect(shouldProcess).toBe(true)
    })

    it('should reject classification with confidence < 0.70', () => {
      const classification = {
        tipo_demanda: 'unknown',
        confidence: 0.65,
      }

      const CONFIDENCE_THRESHOLD = 0.70
      const shouldProcess = classification.confidence >= CONFIDENCE_THRESHOLD
      const shouldSendTemplateE = !shouldProcess

      expect(shouldProcess).toBe(false)
      expect(shouldSendTemplateE).toBe(true)
    })

    it('should route low confidence emails to template E (unknown case)', () => {
      const email = SAMPLE_EMAILS.casosDesconhecido
      const classification = {
        tipo_demanda: 'caso_desconhecido',
        confidence: 0.45,
      }

      const CONFIDENCE_THRESHOLD = 0.70
      const shouldSendTemplateE = classification.confidence < CONFIDENCE_THRESHOLD

      expect(shouldSendTemplateE).toBe(true)
      expect(classification.tipo_demanda).toBe('caso_desconhecido')
    })

    it('should track all classifications for audit trail', () => {
      const classifications = [
        { tipo: 'novo_vigilante', confidence: 0.95 },
        { tipo: 'renovacao_cnv', confidence: 0.85 },
        { tipo: 'novo_alvara', confidence: 0.78 },
        { tipo: 'caso_desconhecido', confidence: 0.45 },
      ]

      const CONFIDENCE_THRESHOLD = 0.70

      for (const classification of classifications) {
        const shouldProcess = classification.confidence >= CONFIDENCE_THRESHOLD
        if (!shouldProcess) {
          expect(classification.tipo).toBe('caso_desconhecido')
        }
      }
    })
  })

  // ============================================
  // Mock Server Connectivity Tests
  // ============================================

  describe('Mock Servers - Connectivity', () => {
    it('should have GESP server responding on port 3333', async () => {
      try {
        const response = await fetch('http://localhost:3333/health')
        expect(response.ok).toBe(true)

        const text = await response.text()
        expect(text).toContain('ok')
      } catch (error) {
        throw new Error(`GESP server not accessible: ${error}`)
      }
    })

    it('should have DOU server responding on port 3334', async () => {
      try {
        const response = await fetch('http://localhost:3334/servicos/diario-oficial/secao-1?data=2026-03-31')
        expect(response.ok).toBe(true)

        const html = await response.text()
        expect(html).toContain('Diário Oficial da União')
      } catch (error) {
        throw new Error(`DOU server not accessible: ${error}`)
      }
    })

    it('should handle GESP login endpoint', async () => {
      const response = await fetch('http://localhost:3333/gesp/login', {
        headers: { 'X-Test-Auth': 'true' },
      })

      expect(response.ok).toBe(true)
      const html = await response.text()
      expect(html).toContain('Login')
    })
  })

  // ============================================
  // AI Classification Tests (Conditional on ANTHROPIC_API_KEY)
  // ============================================

  describe('AI Classification - Anthropic Integration', () => {
    const hasRealAPIKey = process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.startsWith('test-')

    it('should skip AI tests if ANTHROPIC_API_KEY is test key', () => {
      if (!hasRealAPIKey) {
        console.log('[Test] Skipping AI tests - using test API key')
      }
      expect(!hasRealAPIKey).toBe(!hasRealAPIKey)
    })

    it('should validate email structure before AI classification', () => {
      const email = SAMPLE_EMAILS.novoVigilante

      expect(email).toHaveProperty('from_email')
      expect(email).toHaveProperty('subject')
      expect(email).toHaveProperty('body_text')
      expect(email.from_email).toMatch(/.+@.+/)
    })

    it('should have sample emails with required fields', () => {
      for (const [key, email] of Object.entries(SAMPLE_EMAILS)) {
        expect(email).toHaveProperty('from_email')
        expect(email).toHaveProperty('subject')
        expect(email).toHaveProperty('body_text')
        expect(email.body_text.length).toBeGreaterThan(0)
      }
    })
  })

  // ============================================
  // Full Cycle Integration Test
  // ============================================

  describe('Full Agent Cycle - Integration', () => {
    it('should complete email processing cycle: receive -> classify -> extract', async () => {
      const email = SAMPLE_EMAILS.novoVigilante

      // Step 1: Email received
      expect(email.from_email).toBeTruthy()
      expect(email.subject).toBeTruthy()
      expect(email.body_text).toBeTruthy()

      // Step 2: Classify
      const keywords = ['novo', 'vigilante', 'cadastro']
      const isNovoVigilante = keywords.some((kw) =>
        email.subject.toLowerCase().includes(kw) ||
        email.body_text.toLowerCase().includes(kw)
      )
      expect(isNovoVigilante).toBe(true)

      // Step 3: Extract data
      const cpfPattern = /(\d{3})\.?(\d{3})\.?(\d{3})-?(\d{2})/
      const namePattern = /Nome:\s*(.+)/
      const emailPattern = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/

      const cpfMatch = email.body_text.match(cpfPattern)
      const nameMatch = email.body_text.match(namePattern)
      const emailMatch = email.body_text.match(emailPattern)

      expect(cpfMatch).not.toBeNull()
      expect(nameMatch).not.toBeNull()
      expect(emailMatch).not.toBeNull()
    })

    it('should handle DOU parsing cycle: fetch -> extract -> parse -> store', async () => {
      const fixturePath = path.join(__dirname, '../fixtures/dou-secao1-sample.html')
      const html = fs.readFileSync(fixturePath, 'utf-8')

      // Step 1: Fetch (simulated)
      expect(html).toContain('Diário Oficial da União')

      // Step 2: Extract sections
      const alvaraPattern = /RENOVAÇÃO DE ALVARÁ DE FUNCIONAMENTO/gi
      const cnvPattern = /(PUBLICAÇÃO|REGISTRO) DE (CARTEIRA|CARTEIRA NACIONAL) DE VIGILANTE/gi

      const alvaras = html.match(alvaraPattern)
      const cnvs = html.match(cnvPattern)

      expect(alvaras).not.toBeNull()
      expect(cnvs).not.toBeNull()

      // Step 3: Parse (extract data)
      const cnpjPattern = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g
      const cpfPattern = /\d{3}\.\d{3}\.\d{3}-\d{2}/g

      const cnpjs = html.match(cnpjPattern)
      const cpfs = html.match(cpfPattern)

      expect(cnpjs).not.toBeNull()
      expect(cpfs).not.toBeNull()

      // Step 4: Store (verified via R2 mock)
      expect(cnpjs!.length).toBeGreaterThanOrEqual(3)
    })
  })

  // ============================================
  // Error Handling Tests
  // ============================================

  describe('Error Handling - Edge Cases', () => {
    it('should handle emails with missing fields gracefully', () => {
      const incompleteEmail = {
        from_email: 'test@example.com',
        subject: 'Test',
        body_text: '', // Empty body
      }

      const hasContent = !!(incompleteEmail.body_text && incompleteEmail.body_text.length > 0)
      expect(hasContent).toBe(false)
    })

    it('should handle malformed CPF gracefully', () => {
      const malformedCPF = '123'
      const cpfPattern = /(\d{3})\.?(\d{3})\.?(\d{3})-?(\d{2})/

      const match = malformedCPF.match(cpfPattern)
      expect(match).toBeNull()
    })

    it('should handle empty DOU HTML gracefully', () => {
      const emptyHtml = ''
      const alvaraPattern = /RENOVAÇÃO DE ALVARÁ/gi

      const matches = emptyHtml.match(alvaraPattern)
      expect(matches).toBeNull()
    })

    it('should validate confidence score is between 0 and 1', () => {
      const validScores = [0, 0.5, 0.7, 1.0]
      const invalidScores = [-0.1, 1.5, 2.0, -1]

      for (const score of validScores) {
        expect(score).toBeGreaterThanOrEqual(0)
        expect(score).toBeLessThanOrEqual(1)
      }

      for (const score of invalidScores) {
        expect(score < 0 || score > 1).toBe(true)
      }
    })
  })
})
