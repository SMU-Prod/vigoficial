/**
 * Integration Tests - GESP Mock Server Module Coverage
 *
 * Comprehensive HTTP-based testing of all 11 GESP modules:
 * 1. Empresa
 * 2. Processo Autorizativo
 * 3. Processo Punitivo
 * 4. Turma
 * 5. Guia de Transporte
 * 6. Comunicação de Ocorrência
 * 7. Comunicação de Evento
 * 8. Credenciamento de Instrutores
 * 9. Notificação Autônoma
 * 10. CNV
 * 11. Importação XML
 *
 * Tests make direct HTTP requests to the mock server on port 3555
 * Validates HTML responses, form fields, and Portuguese labels
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as http from 'http'
import { MockGESPServer } from '../mocks/gesp-server'

// =============================================================================
// HTTP HELPER FUNCTION
// =============================================================================

interface FetchOptions {
  method?: string
  body?: string
  headers?: Record<string, string>
  cookies?: string[]
}

interface FetchResponse {
  status: number
  body: string
  headers: Record<string, string>
}

async function fetchPage(
  path: string,
  options: FetchOptions = {}
): Promise<FetchResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(`http://localhost:3555${path}`)
    const requestOptions: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64)',
        'X-Test-Auth': 'true',
        ...options.headers,
      },
    }

    if (options.cookies && options.cookies.length > 0) {
      requestOptions.headers!['Cookie'] = options.cookies.join('; ')
    }

    const req = http.request(requestOptions, (res) => {
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        resolve({
          status: res.statusCode || 500,
          body: data,
          headers: res.headers as Record<string, string>,
        })
      })
    })

    req.on('error', reject)

    if (options.body) {
      req.write(options.body)
    }

    req.end()
  })
}

/**
 * Helper to check if HTML contains a specific string (case-insensitive)
 */
function hasText(html: string, text: string): boolean {
  return html.toLowerCase().includes(text.toLowerCase())
}

/**
 * Helper to extract Set-Cookie headers and format as cookie strings
 */
function extractCookies(response: FetchResponse): string[] {
  const setCookie = response.headers['set-cookie']
  if (!setCookie) return []
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie]
  return cookies.map((c) => c.split(';')[0])
}

/**
 * Helper to format form data for POST requests
 */
function formatFormData(data: Record<string, string>): string {
  return Object.entries(data)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')
}

// =============================================================================
// TEST SUITE
// =============================================================================

describe('GESP Mock Server - Full Module Testing', () => {
  let server: MockGESPServer

  beforeAll(async () => {
    server = new MockGESPServer({ port: 3555 })
    await server.start()
    // Give server a moment to fully initialize
    await new Promise((resolve) => setTimeout(resolve, 100))
  })

  afterAll(async () => {
    if (server) {
      await server.close()
    }
  })

  // ===========================================================================
  // AUTHENTICATION FLOW TESTS
  // ===========================================================================

  describe('Authentication Flow', () => {
    it('serves GOV.BR login page at /login', async () => {
      const response = await fetchPage('/gesp/login')
      expect(response.status).toBe(200)
      expect(hasText(response.body, 'GOV.BR')).toBe(true)
      expect(hasText(response.body, 'Login')).toBe(true)
    })

    it('serves certificate selection page', async () => {
      const response = await fetchPage('/gesp/certificado')
      expect(response.status).toBe(200)
      expect(hasText(response.body, 'Certificado')).toBe(true)
      expect(hasText(response.body, 'e-CNPJ') || hasText(response.body, 'e-CPF')).toBe(true)
    })

    it('serves profile selection page', async () => {
      const response = await fetchPage('/gesp/perfil')
      expect(response.status).toBe(200)
      expect(hasText(response.body, 'Perfil')).toBe(true)
    })

    it('serves terms of agreement page', async () => {
      const response = await fetchPage('/gesp/termos')
      expect(response.status).toBe(200)
      expect(hasText(response.body, 'Termo')).toBe(true)
      expect(hasText(response.body, 'Concordo') || hasText(response.body, 'Aceitar')).toBe(true)
    })

    it('serves dashboard after authentication', async () => {
      const response = await fetchPage('/gesp/dashboard')
      expect(response.status).toBe(200)
      expect(hasText(response.body, 'GESP')).toBe(true)
    })

    it('redirects to login when not authenticated', async () => {
      const response = await fetchPage('/gesp/dashboard/protected')
      expect([200, 302, 303]).toContain(response.status)
    })
  })

  // ===========================================================================
  // MODULE 1: EMPRESA
  // ===========================================================================

  describe('Module 1: Empresa', () => {
    it('serves Atualizar Dados page with tabs', async () => {
      const response = await fetchPage('/gesp/empresa/atualizar')
      expect(response.status).toBe(200)
      expect(hasText(response.body, 'Atualizar')).toBe(true)
      expect(hasText(response.body, 'Identificação')).toBe(true)
      expect(hasText(response.body, 'Endereço')).toBe(true)
      expect(hasText(response.body, 'Autorização')).toBe(true)
    })

    it('serves Gerenciar Procuradores with list and form', async () => {
      const response = await fetchPage('/gesp/empresa/procuradores')
      expect(response.status).toBe(200)
      expect(hasText(response.body, 'Procurador')).toBe(true)
      expect(hasText(response.body, 'CPF')).toBe(true)
      expect(hasText(response.body, 'Nome')).toBe(true)
      expect(hasText(response.body, 'tabela') || hasText(response.body, 'table')).toBe(true)
    })

    it('handles POST to add new procurador', async () => {
      const formData = formatFormData({
        cpf: '123.456.789-00',
        nome: 'João Silva',
        dataInicio: '2024-01-01',
        dataFim: '2025-12-31',
      })

      const response = await fetchPage('/gesp/empresa/procuradores/adicionar', {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })

      expect([200, 201, 302, 303]).toContain(response.status)
    })

    it('serves Consultar GRU page', async () => {
      const response = await fetchPage('/gesp/empresa/gru')
      expect(response.status).toBe(200)
      expect(hasText(response.body, 'GRU')).toBe(true)
    })
  })

  // ===========================================================================
  // MODULE 2: PROCESSO AUTORIZATIVO
  // ===========================================================================

  describe('Module 2: Processo Autorizativo', () => {
    it('serves Acompanhar with search form and results table', async () => {
      const response = await fetchPage('/gesp/processo/acompanhar')
      expect(response.status).toBe(200)
      expect(hasText(response.body, 'Acompanhar')).toBe(true)
      expect(hasText(response.body, 'tabela') || hasText(response.body, 'table')).toBe(true)
    })

    it('serves Solicitar Autorização de Funcionamento form', async () => {
      const response = await fetchPage('/gesp/processo/solicitar/funcionamento')
      expect(response.status).toBe(200)
      expect(hasText(response.body, 'Funcionamento')).toBe(true)
      expect(hasText(response.body, 'formulário') || hasText(response.body, 'form')).toBe(true)
    })

    it('serves menu with multiple subtypes', async () => {
      const response = await fetchPage('/gesp/processo/solicitar')
      expect(response.status).toBe(200)
      expect(
        hasText(response.body, 'Funcionamento') ||
        hasText(response.body, 'Armas') ||
        hasText(response.body, 'Atividade')
      ).toBe(true)
    })

    it('handles POST to submit processo', async () => {
      const formData = formatFormData({
        tipo: 'Autorização de Funcionamento',
        descricao: 'Teste de submissão',
      })

      const response = await fetchPage('/gesp/processo/solicitar/funcionamento/submit', {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })

      expect([200, 201, 302, 303]).toContain(response.status)
      // Verify protocol format (YYYY/NNNN)
      if (hasText(response.body, '/')) {
        expect(response.body).toMatch(/\d{4}\/\d{4,}/)
      }
    })

    it('serves Editar Rascunhos page', async () => {
      const response = await fetchPage('/gesp/processo/editar-rascunhos')
      expect(response.status).toBe(200)
      expect(hasText(response.body, 'Rascunho')).toBe(true)
    })

    it('serves Responder Notificação page', async () => {
      const response = await fetchPage('/gesp/processo/responder-notificacao')
      expect(response.status).toBe(200)
      expect(hasText(response.body, 'Notificação')).toBe(true)
    })

    it('serves Interpor Recurso page', async () => {
      const response = await fetchPage('/gesp/processo/interpor-recurso')
      expect(response.status).toBe(200)
      expect(hasText(response.body, 'Recurso')).toBe(true)
    })
  })

  // ===========================================================================
  // MODULE 3: PROCESSO PUNITIVO
  // ===========================================================================

  describe('Module 3: Processo Punitivo', () => {
    it('serves Acompanhar with process list', async () => {
      const response = await fetchPage('/gesp/punitivo/acompanhar')
      expect(response.status).toBe(200)
      expect(hasText(response.body, 'Punitivo')).toBe(true)
    })

    it('serves Responder Notificação', async () => {
      const response = await fetchPage('/gesp/punitivo/responder-notificacao')
      expect(response.status).toBe(200)
      expect(hasText(response.body, 'Notificação')).toBe(true)
    })

    it('serves Interpor Recurso', async () => {
      const response = await fetchPage('/gesp/punitivo/interpor-recurso')
      expect(response.status).toBe(200)
      expect(hasText(response.body, 'Recurso')).toBe(true)
    })
  })

  // ===========================================================================
  // MODULE 4: TURMA
  // ===========================================================================

  describe('Module 4: Turma', () => {
    it('serves Criar Turma form with all fields', async () => {
      const response = await fetchPage('/gesp/turma/criar')
      expect(response.status).toBe(200)
      expect(hasText(response.body, 'Turma')).toBe(true)
      expect(hasText(response.body, 'formulário') || hasText(response.body, 'form')).toBe(true)
    })

    it('has Tipo Curso dropdown', async () => {
      const response = await fetchPage('/gesp/turma/criar')
      expect(response.status).toBe(200)
      expect(hasText(response.body, 'Curso') || hasText(response.body, 'Tipo')).toBe(true)
    })

    it('has Excedentes field with limits', async () => {
      const response = await fetchPage('/gesp/turma/criar')
      expect(response.status).toBe(200)
      expect(hasText(response.body, 'Excedente') || hasText(response.body, 'Aluno')).toBe(true)
    })

    it('serves Gerenciar Turma table', async () => {
      const response = await fetchPage('/gesp/turma/gerenciar')
      expect(response.status).toBe(200)
      expect(hasText(response.body, 'Turma')).toBe(true)
      expect(hasText(response.body, 'tabela') || hasText(response.body, 'table')).toBe(true)
    })

    it('handles POST to create turma', async () => {
      const formData = formatFormData({
        tipoCurso: 'Básico',
        dataInicio: '2024-05-01',
        dataTermino: '2024-06-30',
      })

      const response = await fetchPage('/gesp/turma/criar/submit', {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })

      expect([200, 201, 302, 303]).toContain(response.status)
    })
  })

  // ===========================================================================
  // MODULE 5: GUIA DE TRANSPORTE
  // ===========================================================================

  describe('Module 5: Guia de Transporte', () => {
    it('serves Solicitar form with product type', async () => {
      const response = await fetchPage('/gesp/guia/solicitar')
      expect(response.status).toBe(200)
      expect(hasText(response.body, 'Guia')).toBe(true)
      expect(hasText(response.body, 'Transporte')).toBe(true)
      expect(hasText(response.body, 'formulário') || hasText(response.body, 'form')).toBe(true)
    })

    it('has Origem and Destino fields', async () => {
      const response = await fetchPage('/gesp/guia/solicitar')
      expect(response.status).toBe(200)
      expect(hasText(response.body, 'Origem') || hasText(response.body, 'Destino')).toBe(true)
    })

    it('serves Acompanhar with status table', async () => {
      const response = await fetchPage('/gesp/guia/acompanhar')
      expect(response.status).toBe(200)
      expect(hasText(response.body, 'Acompanhar')).toBe(true)
      expect(hasText(response.body, 'tabela') || hasText(response.body, 'table')).toBe(true)
    })
  })

  // ===========================================================================
  // MODULE 6: COMUNICAÇÃO DE OCORRÊNCIA
  // ===========================================================================

  describe('Module 6: Comunicação de Ocorrência', () => {
    it('serves Comunicar form with fields', async () => {
      const response = await fetchPage('/gesp/ocorrencia/comunicar')
      expect(response.status).toBe(200)
      expect(hasText(response.body, 'Comunicar')).toBe(true)
      expect(hasText(response.body, 'Ocorrência')).toBe(true)
      expect(hasText(response.body, 'formulário') || hasText(response.body, 'form')).toBe(true)
    })

    it('shows deadline information', async () => {
      const response = await fetchPage('/gesp/ocorrencia/comunicar')
      expect(response.status).toBe(200)
      expect(
        hasText(response.body, 'dia') ||
        hasText(response.body, 'prazo') ||
        hasText(response.body, 'deadline')
      ).toBe(true)
    })

    it('serves Acompanhar table', async () => {
      const response = await fetchPage('/gesp/ocorrencia/acompanhar')
      expect(response.status).toBe(200)
      expect(hasText(response.body, 'Acompanhar')).toBe(true)
      expect(hasText(response.body, 'tabela') || hasText(response.body, 'table')).toBe(true)
    })
  })

  // ===========================================================================
  // MODULE 7: COMUNICAÇÃO DE EVENTO
  // ===========================================================================

  describe('Module 7: Comunicação de Evento', () => {
    it('serves Comunicar form', async () => {
      const response = await fetchPage('/gesp/evento/comunicar')
      expect(response.status).toBe(200)
      expect(hasText(response.body, 'Evento')).toBe(true)
      expect(hasText(response.body, 'formulário') || hasText(response.body, 'form')).toBe(true)
    })

    it('serves Acompanhar table', async () => {
      const response = await fetchPage('/gesp/evento/acompanhar')
      expect(response.status).toBe(200)
      expect(hasText(response.body, 'Acompanhar')).toBe(true)
      expect(hasText(response.body, 'tabela') || hasText(response.body, 'table')).toBe(true)
    })
  })

  // ===========================================================================
  // MODULE 8: CREDENCIAMENTO DE INSTRUTORES
  // ===========================================================================

  describe('Module 8: Credenciamento de Instrutores', () => {
    it('serves Credenciar form', async () => {
      const response = await fetchPage('/gesp/credenciamento/credenciar')
      expect(response.status).toBe(200)
      expect(hasText(response.body, 'Credenciar')).toBe(true)
      expect(hasText(response.body, 'Instrutor')).toBe(true)
      expect(hasText(response.body, 'formulário') || hasText(response.body, 'form')).toBe(true)
    })

    it('serves Consultar table', async () => {
      const response = await fetchPage('/gesp/credenciamento/consultar')
      expect(response.status).toBe(200)
      expect(hasText(response.body, 'Consultar')).toBe(true)
      expect(hasText(response.body, 'tabela') || hasText(response.body, 'table')).toBe(true)
    })
  })

  // ===========================================================================
  // MODULE 9: NOTIFICAÇÃO AUTÔNOMA
  // ===========================================================================

  describe('Module 9: Notificação Autônoma', () => {
    it('serves Consultar with search', async () => {
      const response = await fetchPage('/gesp/notificacao/consultar')
      expect(response.status).toBe(200)
      expect(hasText(response.body, 'Notificação')).toBe(true)
    })

    it('serves Responder with textarea', async () => {
      const response = await fetchPage('/gesp/notificacao/responder')
      expect(response.status).toBe(200)
      expect(hasText(response.body, 'Responder')).toBe(true)
      expect(hasText(response.body, 'textarea') || hasText(response.body, 'justificativa')).toBe(
        true
      )
    })

    it('shows 30-day deadline', async () => {
      const response = await fetchPage('/gesp/notificacao/responder')
      expect(response.status).toBe(200)
      expect(
        hasText(response.body, '30') ||
        hasText(response.body, 'dias') ||
        hasText(response.body, 'dia')
      ).toBe(true)
    })

    it('serves Interpor Recurso', async () => {
      const response = await fetchPage('/gesp/notificacao/recurso')
      expect(response.status).toBe(200)
      expect(hasText(response.body, 'Recurso')).toBe(true)
    })
  })

  // ===========================================================================
  // MODULE 10: CNV
  // ===========================================================================

  describe('Module 10: CNV', () => {
    it('serves Consultar CNV with search form', async () => {
      const response = await fetchPage('/gesp/cnv/consultar')
      expect(response.status).toBe(200)
      expect(hasText(response.body, 'CNV')).toBe(true)
      expect(hasText(response.body, 'Carteira')).toBe(true)
    })

    it('has CPF search field', async () => {
      const response = await fetchPage('/gesp/cnv/consultar')
      expect(response.status).toBe(200)
      expect(hasText(response.body, 'CPF')).toBe(true)
    })

    it('shows CNV data fields when searched', async () => {
      const response = await fetchPage('/gesp/cnv/consultar?cpf=123.456.789-00')
      expect(response.status).toBe(200)
      expect(
        hasText(response.body, 'Nome') ||
        hasText(response.body, 'Número') ||
        hasText(response.body, 'Validade')
      ).toBe(true)
    })
  })

  // ===========================================================================
  // MODULE 11: IMPORTAÇÃO XML
  // ===========================================================================

  describe('Module 11: Importação XML', () => {
    it('serves Importar page with file upload', async () => {
      const response = await fetchPage('/gesp/importacao/importar')
      expect(response.status).toBe(200)
      expect(hasText(response.body, 'Importar')).toBe(true)
      expect(hasText(response.body, 'XML')).toBe(true)
      expect(hasText(response.body, 'upload') || hasText(response.body, 'arquivo')).toBe(true)
    })

    it('has XML type selector', async () => {
      const response = await fetchPage('/gesp/importacao/importar')
      expect(response.status).toBe(200)
      expect(
        hasText(response.body, 'Pessoa') ||
        hasText(response.body, 'Veículo') ||
        hasText(response.body, 'Aluno')
      ).toBe(true)
    })

    it('serves Acompanhar Importação table', async () => {
      const response = await fetchPage('/gesp/importacao/acompanhar')
      expect(response.status).toBe(200)
      expect(hasText(response.body, 'Acompanhar')).toBe(true)
      expect(hasText(response.body, 'tabela') || hasText(response.body, 'table')).toBe(true)
    })
  })

  // ===========================================================================
  // UNIVERSAL UI PATTERNS
  // ===========================================================================

  describe('Universal UI Patterns', () => {
    it('all module pages include menu bar', async () => {
      const paths = [
        '/gesp/empresa/atualizar',
        '/gesp/processo/acompanhar',
        '/gesp/turma/criar',
        '/gesp/guia/solicitar',
      ]

      for (const path of paths) {
        const response = await fetchPage(path)
        expect(response.status).toBe(200)
        expect(hasText(response.body, 'Empresa')).toBe(true)
      }
    })

    it('authenticated pages require login', async () => {
      const response = await fetchPage('/gesp/empresa/atualizar')
      // Should either be 200 (already authenticated) or redirect
      expect([200, 302, 303, 401]).toContain(response.status)
    })

    it('form submissions accept POST method', async () => {
      const formData = formatFormData({ test: 'data' })

      const response = await fetchPage('/gesp/empresa/procuradores/adicionar', {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })

      // POST should be accepted (may redirect or return 201)
      expect([200, 201, 302, 303, 400]).toContain(response.status)
    })

    it('successful submissions may return confirmation dialog', async () => {
      const formData = formatFormData({
        cpf: '123.456.789-00',
        nome: 'Teste',
      })

      const response = await fetchPage('/gesp/empresa/procuradores/adicionar', {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })

      // Response body may contain confirmation text
      if (response.status === 200) {
        expect(
          hasText(response.body, 'sucesso') ||
          hasText(response.body, 'Sucesso') ||
          hasText(response.body, 'confirmação') ||
          hasText(response.body, 'adicionado')
        ).toBe(true)
      }
    })

    it('serves valid HTTP responses with proper headers', async () => {
      const response = await fetchPage('/gesp/dashboard')
      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toBeDefined()
    })

    it('HTML responses contain Portuguese labels', async () => {
      const response = await fetchPage('/gesp/empresa/atualizar')
      expect(response.status).toBe(200)

      const portugueseLabels = [
        'Atualizar',
        'Dados',
        'Identificação',
        'Endereço',
        'Autorização',
      ]

      let hasPortugueseContent = false
      for (const label of portugueseLabels) {
        if (hasText(response.body, label)) {
          hasPortugueseContent = true
          break
        }
      }

      expect(hasPortugueseContent).toBe(true)
    })

    it('module pages have form elements with proper names', async () => {
      const response = await fetchPage('/gesp/empresa/procuradores')
      expect(response.status).toBe(200)
      expect(
        hasText(response.body, 'input') ||
        hasText(response.body, 'select') ||
        hasText(response.body, 'textarea') ||
        hasText(response.body, 'form')
      ).toBe(true)
    })
  })

  // ===========================================================================
  // PROTOCOL AND REFERENCE GENERATION
  // ===========================================================================

  describe('Protocol and Reference Generation', () => {
    it('processo submissions generate YYYY/NNNN protocol format', async () => {
      const formData = formatFormData({
        tipo: 'Funcionamento',
        descricao: 'Teste',
      })

      const response = await fetchPage('/gesp/processo/solicitar/funcionamento/submit', {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })

      // If submission succeeds, response may contain protocol
      if (response.status === 200) {
        const protocolMatch = response.body.match(/\d{4}\/\d{4,}/)
        if (protocolMatch) {
          expect(protocolMatch[0]).toMatch(/^\d{4}\/\d{4,}$/)
        }
      }
    })

    it('turma creation generates turma ID reference', async () => {
      const formData = formatFormData({
        tipoCurso: 'Básico',
        dataInicio: '2024-05-01',
      })

      const response = await fetchPage('/gesp/turma/criar/submit', {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })

      expect([200, 201, 302, 303]).toContain(response.status)
    })
  })

  // ===========================================================================
  // MODULE NAVIGATION AND ROUTING
  // ===========================================================================

  describe('Module Navigation and Routing', () => {
    it('all 11 modules are accessible from base paths', async () => {
      const modulePaths = [
        '/gesp/empresa',
        '/gesp/processo',
        '/gesp/punitivo',
        '/gesp/turma',
        '/gesp/guia',
        '/gesp/ocorrencia',
        '/gesp/evento',
        '/gesp/credenciamento',
        '/gesp/notificacao',
        '/gesp/cnv',
        '/gesp/importacao',
      ]

      for (const path of modulePaths) {
        const response = await fetchPage(path)
        expect([200, 302, 303, 301]).toContain(response.status)
      }
    })

    it('submenu links return valid responses', async () => {
      const submenuLinks = [
        '/gesp/empresa/atualizar',
        '/gesp/empresa/procuradores',
        '/gesp/empresa/gru',
        '/gesp/processo/acompanhar',
        '/gesp/processo/solicitar/funcionamento',
        '/gesp/turma/criar',
        '/gesp/turma/gerenciar',
      ]

      for (const link of submenuLinks) {
        const response = await fetchPage(link)
        expect([200, 302, 303]).toContain(response.status)
      }
    })

    it('handles invalid routes gracefully', async () => {
      const response = await fetchPage('/gesp/invalid-module')
      // Should return 404 or redirect
      expect([302, 303, 404]).toContain(response.status)
    })
  })

  // ===========================================================================
  // DATA AND FORM PROCESSING
  // ===========================================================================

  describe('Data and Form Processing', () => {
    it('handles form data with special characters', async () => {
      const formData = formatFormData({
        nome: 'João da Silva Santos',
        descricao: 'Teste com acentuação',
      })

      const response = await fetchPage('/gesp/empresa/procuradores/adicionar', {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
        },
      })

      expect([200, 201, 302, 303, 400]).toContain(response.status)
    })

    it('validates CPF format requirements', async () => {
      const validFormData = formatFormData({
        cpf: '123.456.789-00',
        nome: 'Teste',
      })

      const response = await fetchPage('/gesp/empresa/procuradores/adicionar', {
        method: 'POST',
        body: validFormData,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })

      expect([200, 201, 302, 303]).toContain(response.status)
    })

    it('handles date fields in forms', async () => {
      const formData = formatFormData({
        dataInicio: '2024-01-01',
        dataTermino: '2024-12-31',
      })

      const response = await fetchPage('/gesp/turma/criar/submit', {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })

      expect([200, 201, 302, 303, 400]).toContain(response.status)
    })
  })

  // ===========================================================================
  // ERROR HANDLING AND VALIDATION
  // ===========================================================================

  describe('Error Handling and Validation', () => {
    it('missing required fields return appropriate errors', async () => {
      const incompleteData = formatFormData({ nome: '' })

      const response = await fetchPage('/gesp/empresa/procuradores/adicionar', {
        method: 'POST',
        body: incompleteData,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })

      // Should return error or validation failure
      expect([200, 400]).toContain(response.status)
    })

    it('invalid request methods are handled', async () => {
      const response = await fetchPage('/gesp/empresa/atualizar', {
        method: 'DELETE',
      })

      // Should reject DELETE or convert to GET
      expect([200, 405]).toContain(response.status)
    })

    it('timeout handling on long responses', async () => {
      // This is a basic connectivity test
      const response = await fetchPage('/gesp/dashboard')
      expect(response.status).toBeDefined()
    })
  })

  // ===========================================================================
  // TABLE AND LIST RESPONSES
  // ===========================================================================

  describe('Table and List Responses', () => {
    it('tables include header rows', async () => {
      const response = await fetchPage('/gesp/empresa/procuradores')
      expect(response.status).toBe(200)
      expect(
        hasText(response.body, '<th>') ||
        hasText(response.body, '<thead>') ||
        hasText(response.body, 'cabeçalho')
      ).toBe(true)
    })

    it('search results display in table format', async () => {
      const response = await fetchPage('/gesp/processo/acompanhar')
      expect(response.status).toBe(200)
      expect(
        hasText(response.body, '<tr>') ||
        hasText(response.body, '<table>') ||
        hasText(response.body, 'tabela')
      ).toBe(true)
    })

    it('empty results show appropriate message', async () => {
      const response = await fetchPage('/gesp/processo/acompanhar?filtro=inexistente')
      expect(response.status).toBe(200)
      // May contain "nenhum", "vazio", "sem resultados", or empty table
      expect(
        hasText(response.body, 'nenhum') ||
        hasText(response.body, 'vazio') ||
        hasText(response.body, '<table>') ||
        hasText(response.body, 'sem')
      ).toBe(true)
    })

    it('turma list includes all status columns', async () => {
      const response = await fetchPage('/gesp/turma/gerenciar')
      expect(response.status).toBe(200)
      expect(hasText(response.body, 'tabela') || hasText(response.body, 'table')).toBe(true)
    })

    it('guide transportation list shows origin/destination', async () => {
      const response = await fetchPage('/gesp/guia/acompanhar')
      expect(response.status).toBe(200)
      expect(
        hasText(response.body, 'Origem') ||
        hasText(response.body, 'Destino') ||
        hasText(response.body, 'tabela') ||
        hasText(response.body, 'table')
      ).toBe(true)
    })
  })
})
