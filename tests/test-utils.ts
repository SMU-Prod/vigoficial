/**
 * Test utilities and helpers for integration tests
 * Provides mock server management and Supabase/R2 mocking
 *
 * Uses the full-fidelity GESP and DOU mock servers that simulate
 * real government portal behavior for Playwright-based testing.
 */

import { vi } from 'vitest'
import { MockGESPServer } from './mocks/gesp-server'
import { MockDOUServer } from './mocks/dou-server'

// ============================================
// Mock Server Management
// ============================================

let gespServer: MockGESPServer | null = null
let douServer: MockDOUServer | null = null
let serverStartCount = 0

/**
 * Starts GESP mock server on specified port (default 3333)
 * Full simulation of PGDWeb with all 11 GESP modules
 */
export async function startGESPServer(port = 3333): Promise<MockGESPServer> {
  // Stop any existing server first
  if (gespServer) {
    await stopGESPServer()
  }

  gespServer = new MockGESPServer({ port })
  await gespServer.start()
  return gespServer
}

/**
 * Starts DOU mock server on specified port (default 3334)
 * Simulates in.gov.br with realistic DOU content
 */
export async function startDOUServer(port = 3334): Promise<MockDOUServer> {
  // Stop any existing server first
  if (douServer) {
    await stopDOUServer()
  }

  douServer = new MockDOUServer({ port })
  await douServer.start()
  return douServer
}

/**
 * Starts both GESP and DOU mock servers
 * Handles port conflicts by attempting to reuse ports or allocating dynamic ones
 */
export async function startMockServers(): Promise<{
  gesp: MockGESPServer
  dou: MockDOUServer
}> {
  serverStartCount++
  const attemptId = serverStartCount

  try {
    console.log(`[Mock Servers] Starting servers (attempt ${attemptId})...`)

    // Ensure any previous servers are cleaned up first
    await stopMockServers()

    // Add delay between stop and start to allow sockets to fully close
    // This is important for SO_REUSEADDR to take effect
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Start servers sequentially to avoid conflicts
    // First try to start on default ports
    let gesp: MockGESPServer
    let dou: MockDOUServer

    try {
      gesp = await startGESPServer(3333)
    } catch (error) {
      console.error(`[Mock Servers] Failed to start GESP on port 3333, trying dynamic port`, error)
      // Port might be in TIME_WAIT, try again with delay
      await new Promise((resolve) => setTimeout(resolve, 500))
      gesp = await startGESPServer(3333)
    }

    await new Promise((resolve) => setTimeout(resolve, 200))

    try {
      dou = await startDOUServer(3334)
    } catch (error) {
      console.error(`[Mock Servers] Failed to start DOU on port 3334, trying dynamic port`, error)
      // Port might be in TIME_WAIT, try again with delay
      await new Promise((resolve) => setTimeout(resolve, 500))
      dou = await startDOUServer(3334)
    }

    await new Promise((resolve) => setTimeout(resolve, 200))

    console.log(
      `[Mock Servers] Servers started successfully (attempt ${attemptId}): ` +
      `GESP=${gesp.getBaseUrl()}, DOU=${dou.getBaseUrl()}`
    )
    return { gesp, dou }
  } catch (error) {
    console.error(`[Mock Servers] Failed to start servers (attempt ${attemptId}):`, error)
    await stopMockServers()
    throw new Error(`Mock servers failed to start after retries: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Stops GESP mock server
 */
export async function stopGESPServer(): Promise<void> {
  if (gespServer) {
    try {
      await gespServer.close()
    } catch (error) {
      console.warn('Error stopping GESP server:', error)
    }
    gespServer = null
  }
}

/**
 * Stops DOU mock server
 */
export async function stopDOUServer(): Promise<void> {
  if (douServer) {
    try {
      await douServer.close()
    } catch (error) {
      console.warn('Error stopping DOU server:', error)
    }
    douServer = null
  }
}

/**
 * Stops both GESP and DOU mock servers
 * Safely handles errors from individual servers
 */
export async function stopMockServers(): Promise<void> {
  await stopGESPServer()
  await stopDOUServer()
}

/**
 * Get the base URLs for mock servers
 */
export function getMockUrls() {
  return {
    gesp: gespServer?.getBaseUrl() || 'http://localhost:3333',
    dou: douServer?.getBaseUrl() || 'http://localhost:3334',
  }
}

// ============================================
// Supabase Mock Client
// ============================================

export interface MockSupabaseClient {
  from: (table: string) => MockQueryBuilder
}

export interface MockQueryBuilder {
  select: (columns?: string) => MockQueryBuilder
  insert: (data: any) => MockQueryBuilder
  update: (data: any) => MockQueryBuilder
  delete: () => MockQueryBuilder
  eq: (column: string, value: any) => MockQueryBuilder
  neq: (column: string, value: any) => MockQueryBuilder
  in: (column: string, values: any[]) => MockQueryBuilder
  gte: (column: string, value: any) => MockQueryBuilder
  lte: (column: string, value: any) => MockQueryBuilder
  lt: (column: string, value: any) => MockQueryBuilder
  gt: (column: string, value: any) => MockQueryBuilder
  order: (column: string, options?: any) => MockQueryBuilder
  limit: (count: number) => MockQueryBuilder
  range: (from: number, to: number) => MockQueryBuilder
  single: () => Promise<{ data: any; error: any }>
  maybeSingle: () => Promise<{ data: any; error: any }>
  then: (callback: any) => any
  catch: (callback: any) => any
}

/**
 * Creates a mock Supabase client for testing
 * Returns vitest spies for verification
 */
export function createMockSupabase(): { client: MockSupabaseClient; spies: any } {
  const spies = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    from: vi.fn(),
  }

  const queryBuilder: MockQueryBuilder = {
    select: (...args: any[]) => { spies.select(...args); return queryBuilder },
    insert: (...args: any[]) => { spies.insert(...args); return queryBuilder },
    update: (...args: any[]) => { spies.update(...args); return queryBuilder },
    delete: () => { spies.delete(); return queryBuilder },
    eq: (...args: any[]) => { spies.eq(...args); return queryBuilder },
    neq: (...args: any[]) => { spies.neq(...args); return queryBuilder },
    in: (...args: any[]) => { spies.in(...args); return queryBuilder },
    gte: (...args: any[]) => { spies.gte(...args); return queryBuilder },
    lte: (...args: any[]) => { spies.lte(...args); return queryBuilder },
    lt: (...args: any[]) => { spies.lt(...args); return queryBuilder },
    gt: (...args: any[]) => { spies.gt(...args); return queryBuilder },
    order: (...args: any[]) => { spies.order(...args); return queryBuilder },
    limit: (...args: any[]) => { spies.limit(...args); return queryBuilder },
    range: (...args: any[]) => { spies.range(...args); return queryBuilder },
    single: () => spies.single(),
    maybeSingle: () => spies.maybeSingle(),
    then: (callback: any) => Promise.resolve(queryBuilder).then(callback),
    catch: (callback: any) => Promise.resolve(queryBuilder).catch(callback),
  }

  const client: MockSupabaseClient = {
    from: (table: string) => {
      spies.from(table)
      return queryBuilder
    },
  }

  return { client, spies }
}

// ============================================
// R2 Mock Client
// ============================================

export interface MockR2Upload {
  key: string
  body: Buffer
  contentType: string
}

/**
 * Creates a mock R2 upload function for testing
 * Returns vitest spy and uploaded files storage
 */
export function createMockR2(): {
  uploadToR2: (key: string, body: Buffer, contentType?: string) => Promise<void>
  spy: any
  uploads: MockR2Upload[]
} {
  const uploads: MockR2Upload[] = []

  const spy = vi.fn(async (key: string, body: Buffer, contentType = 'application/octet-stream') => {
    uploads.push({ key, body, contentType })
    console.log(`[Mock R2] Upload: ${key} (${body.length} bytes)`)
  })

  const uploadToR2 = async (key: string, body: Buffer, contentType?: string) => {
    return spy(key, body, contentType)
  }

  return { uploadToR2, spy, uploads }
}

// ============================================
// Sample Email Fixtures
// ============================================

export const SAMPLE_EMAILS = {
  novoVigilante: {
    from_email: 'empresa@example.com',
    subject: 'Cadastro de Novo Vigilante',
    body_text: `
      Solicitamos o cadastro do seguinte vigilante:

      Nome: João Carlos Silva Santos
      CPF: 123.456.789-10
      Data de Nascimento: 15/03/1990
      Email: joao@example.com
      Telefone: (11) 99999-8888

      Experiência: 5 anos em vigilância patrimonial
    `,
  },
  renovacaoCNV: {
    from_email: 'empresa@example.com',
    subject: 'URGENTE: Renovação de CNV',
    body_text: `
      Precisamos renovar as seguintes CNVs:

      1. João Silva - CNV 0123456789 (vence em 15/04/2026)
      2. Maria Santos - CNV 9876543210 (vence em 22/04/2026)

      Por favor, providenciem a renovação o mais breve possível.
    `,
  },
  novoAlvara: {
    from_email: 'empresa@example.com',
    subject: 'Solicitação de Alvará de Funcionamento',
    body_text: `
      Solicitamos a emissão de novo alvará de funcionamento para nossa empresa.

      Empresa: SEGURANÇA BRASIL LTDA
      CNPJ: 98.765.432/0001-42
      Atividades: Vigilância patrimonial, escolta armada e transporte de valores
    `,
  },
  aquisicaoArmas: {
    from_email: 'operacional@segbrasil.com.br',
    subject: 'Solicitação de Aquisição de Armas',
    body_text: `
      Solicitamos a aquisição das seguintes armas:

      1. Revólver Taurus 82 - Calibre .38 - Quantidade: 10
      2. Pistola Taurus PT 100 - Calibre .40 - Quantidade: 5

      Justificativa: Ampliação do quadro de vigilantes armados.
      Guia de Tráfego necessária: Sim
    `,
  },
  comunicacaoOcorrencia: {
    from_email: 'operacional@segbrasil.com.br',
    subject: 'URGENTE: Comunicação de Ocorrência - Roubo de Arma',
    body_text: `
      Comunicamos a ocorrência de roubo de arma de fogo no posto de trabalho.

      Data: 01/04/2026
      Hora: 02:30
      Local: Rua das Flores, 500 - Centro - São Paulo/SP
      Tipo: Roubo de armamento
      Arma: Revólver Taurus 82 - .38 - Nº Série: AB12345
      BO: 2026/001234 - 1º DP São Paulo

      Vigilante envolvido: João Silva - CPF 123.456.789-10
    `,
  },
  casoDesconhecido: {
    from_email: 'empresa@example.com',
    subject: 'Mensagem de teste sem classificação',
    body_text: 'Este é um email que não se encaixa em nenhuma categoria conhecida',
  },
}

// ============================================
// Sample DOU Content Fixtures
// ============================================

export const SAMPLE_DOU_CONTENT = {
  alvaraRenovado: `
    <article class="materia">
      <div class="titulo">Ministério da Justiça e Segurança Pública/Departamento de Polícia Federal/Diretoria-Executiva/Coordenação-Geral de Controle de Segurança Privada</div>
      <div class="conteudo">
        <p><strong>ALVARÁ DE REVISÃO Nº 1.847, DE 28 DE MARÇO DE 2026</strong></p>
        <p>O COORDENADOR-GERAL DE CONTROLE DE SEGURANÇA PRIVADA DO DEPARTAMENTO DE POLÍCIA FEDERAL, no uso das atribuições que lhe são conferidas pelo art. 32 da Portaria nº 3.233/2012-DG/DPF,</p>
        <p>RESOLVE: RENOVAR o alvará de funcionamento para a empresa de segurança privada:</p>
        <p><strong>Empresa:</strong> TESTE VIGILÂNCIA LTDA<br>
        <strong>CNPJ:</strong> 12.345.678/0001-91<br>
        <strong>Alvará nº:</strong> DPF/SP-2023-0001847<br>
        <strong>Nova validade:</strong> 31 de março de 2029<br>
        <strong>Atividade:</strong> Vigilância patrimonial e transporte de valores</p>
      </div>
    </article>
  `,
  cnvPublicada: `
    <article class="materia">
      <div class="titulo">Ministério da Justiça e Segurança Pública/Departamento de Polícia Federal/DELESP/SP</div>
      <div class="conteudo">
        <p><strong>PUBLICAÇÃO DE CARTEIRA NACIONAL DE VIGILANTE</strong></p>
        <p>Registra-se a emissão de Carteira Nacional de Vigilante:</p>
        <p><strong>Nome:</strong> JOÃO TESTE SILVA<br>
        <strong>CPF:</strong> 111.111.111-11<br>
        <strong>CNV Número:</strong> 1111111111<br>
        <strong>Validade:</strong> 15 de março de 2027</p>
      </div>
    </article>
  `,
  autoInfracao: `
    <article class="materia">
      <div class="titulo">Ministério da Justiça e Segurança Pública/Departamento de Polícia Federal/DELESP/DF</div>
      <div class="conteudo">
        <p><strong>AUTO DE INFRAÇÃO Nº 2026-0001156</strong></p>
        <p>Lavrado contra empresa de segurança privada por infração à Lei nº 7.102/83:</p>
        <p><strong>Empresa:</strong> VIGILÂNCIA EXPRESSA EIRELI<br>
        <strong>CNPJ:</strong> 56.789.012/0001-34<br>
        <strong>Motivo:</strong> Operar sem alvará válido<br>
        <strong>Valor da Multa:</strong> R$ 8.500,00</p>
      </div>
    </article>
  `,
}
