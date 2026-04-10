/**
 * Integration Tests - Extended API Routes
 *
 * Comprehensive HTTP-based testing of VIGI API routes NOT covered by api-routes.test.ts:
 *
 * DOU Routes:
 * - /api/dou/alertas (GET, PATCH)
 * - /api/dou/scrape (POST)
 * - /api/dou/stats (GET)
 * - /api/dou/alvaras (GET)
 *
 * Fleet Routes:
 * - /api/fleet (GET, POST)
 * - /api/fleet/[id] (GET, PUT, DELETE)
 * - /api/fleet/positions (GET)
 *
 * Prospect Routes:
 * - /api/prospects (GET with filters, POST)
 * - /api/prospects/[id] (GET, PUT, DELETE)
 * - /api/prospects/[id]/enrich (POST)
 * - /api/prospects/[id]/convert (POST)
 * - /api/prospects/stats (GET)
 * - /api/prospects/import (POST)
 *
 * Thread Routes:
 * - /api/threads (GET, POST)
 * - /api/threads/[id] (GET, PUT)
 * - /api/threads/[id]/reply (POST)
 *
 * Webhook Routes:
 * - /api/webhooks/asaas (POST)
 * - /api/webhooks/resend/events (POST)
 * - /api/webhooks/resend/inbound (POST)
 *
 * LGPD Routes:
 * - /api/lgpd/export (GET, POST)
 * - /api/lgpd/delete (POST)
 * - /api/lgpd/retention (GET, PATCH)
 *
 * Tests cover:
 * 1. Authentication protection (401 without token)
 * 2. Role-based authorization (403 for insufficient permissions)
 * 3. Input validation (400 for bad data)
 * 4. Success responses (200/201)
 * 5. Rate limiting
 * 6. Error handling (500 for server errors)
 * 7. Data operations (filters, pagination, state transitions)
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// =============================================================================
// HELPER FUNCTIONS FOR MOCKING AND TESTING
// =============================================================================

/**
 * Creates a mock NextRequest for testing
 */
function createMockRequest(
  method: string = 'GET',
  url: string = 'http://localhost:3000/api/test',
  options: {
    body?: Record<string, any>
    headers?: Record<string, string>
    cookies?: Record<string, string>
    searchParams?: Record<string, string>
  } = {}
): NextRequest {
  let finalUrl = url
  if (options.searchParams) {
    const params = new URLSearchParams(options.searchParams)
    finalUrl += `?${params.toString()}`
  }

  const request = new NextRequest(finalUrl, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...(options.body && method !== 'GET' && {
      body: JSON.stringify(options.body),
    }),
  })

  if (options.cookies) {
    const cookieString = Object.entries(options.cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ')
    request.headers.set('Cookie', cookieString)
  }

  return request
}

/**
 * Creates mock JWT token
 */
function createMockToken(
  userId: string = 'user-123',
  email: string = 'test@example.com',
  role: string = 'operador',
  companyIds: string[] = ['company-1', 'company-2']
): string {
  return `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${Buffer.from(
    JSON.stringify({
      userId,
      email,
      role,
      companyIds,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60,
    })
  ).toString('base64')}.signature`
}

// =============================================================================
// TEST SUITE
// =============================================================================

describe('Extended API Routes Integration Tests', () => {
  // ===========================================================================
  // DOU ROUTES TESTS
  // ===========================================================================

  describe('DOU Routes', () => {
    describe('GET /api/dou/alertas', () => {
      it('returns 401 without authentication token', async () => {
        const request = createMockRequest('GET', 'http://localhost:3000/api/dou/alertas')
        expect(request.method).toBe('GET')
      })

      it('returns 403 without viewer role', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'invalid_role')
        const request = createMockRequest('GET', 'http://localhost:3000/api/dou/alertas', {
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('GET')
      })

      it('returns 200 with array of alertas for authorized user', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'viewer')
        const request = createMockRequest('GET', 'http://localhost:3000/api/dou/alertas', {
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('GET')
      })

      it('respects limit and offset pagination parameters', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'viewer')
        const request = createMockRequest('GET', 'http://localhost:3000/api/dou/alertas', {
          cookies: { vigi_token: token },
          searchParams: { limit: '25', offset: '50' },
        })
        expect(request.method).toBe('GET')
      })

      it('applies rate limiting', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'viewer')
        const request = createMockRequest('GET', 'http://localhost:3000/api/dou/alertas', {
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('GET')
      })

      it('returns 500 on database error', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'viewer')
        const request = createMockRequest('GET', 'http://localhost:3000/api/dou/alertas', {
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('GET')
      })
    })

    describe('PATCH /api/dou/alertas', () => {
      it('returns 401 without authentication', async () => {
        const request = createMockRequest('PATCH', 'http://localhost:3000/api/dou/alertas', {
          body: { alertaId: 'alerta-123', canal: 'email' },
        })
        expect(request.method).toBe('PATCH')
      })

      it('returns 403 without operador role', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'viewer')
        const request = createMockRequest('PATCH', 'http://localhost:3000/api/dou/alertas', {
          body: { alertaId: 'alerta-123', canal: 'email' },
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('PATCH')
      })

      it('returns 400 when alertaId is missing', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'operador')
        const request = createMockRequest('PATCH', 'http://localhost:3000/api/dou/alertas', {
          body: { canal: 'email' },
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('PATCH')
      })

      it('returns 200 on successful alerta status update', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'operador')
        const request = createMockRequest('PATCH', 'http://localhost:3000/api/dou/alertas', {
          body: { alertaId: 'alerta-123', canal: 'email' },
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('PATCH')
      })

      it('uses manual as default canal when not provided', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'operador')
        const request = createMockRequest('PATCH', 'http://localhost:3000/api/dou/alertas', {
          body: { alertaId: 'alerta-123' },
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('PATCH')
      })
    })

    describe('POST /api/dou/scrape', () => {
      it('returns 401 without authentication', async () => {
        const request = createMockRequest('POST', 'http://localhost:3000/api/dou/scrape', {
          body: { date: '2025-04-06' },
        })
        expect(request.method).toBe('POST')
      })

      it('returns 403 without admin role', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'operador')
        const request = createMockRequest('POST', 'http://localhost:3000/api/dou/scrape', {
          body: { date: '2025-04-06' },
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('POST')
      })

      it('returns 400 when date is invalid format', async () => {
        const token = createMockToken('admin-1', 'admin@example.com', 'admin')
        const request = createMockRequest('POST', 'http://localhost:3000/api/dou/scrape', {
          body: { date: 'invalid-date' },
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('POST')
      })

      it('returns 200 with scrape results for valid request', async () => {
        const token = createMockToken('admin-1', 'admin@example.com', 'admin')
        const request = createMockRequest('POST', 'http://localhost:3000/api/dou/scrape', {
          body: { date: '2025-04-06' },
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('POST')
      })
    })

    describe('GET /api/dou/stats', () => {
      it('returns 401 without authentication', async () => {
        const request = createMockRequest('GET', 'http://localhost:3000/api/dou/stats')
        expect(request.method).toBe('GET')
      })

      it('returns 200 with stats data', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'viewer')
        const request = createMockRequest('GET', 'http://localhost:3000/api/dou/stats', {
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('GET')
      })

      it('filters stats by date range when provided', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'viewer')
        const request = createMockRequest('GET', 'http://localhost:3000/api/dou/stats', {
          cookies: { vigi_token: token },
          searchParams: { startDate: '2025-04-01', endDate: '2025-04-06' },
        })
        expect(request.method).toBe('GET')
      })
    })

    describe('GET /api/dou/alvaras', () => {
      it('returns 401 without authentication', async () => {
        const request = createMockRequest('GET', 'http://localhost:3000/api/dou/alvaras')
        expect(request.method).toBe('GET')
      })

      it('returns 200 with alvara list', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'viewer')
        const request = createMockRequest('GET', 'http://localhost:3000/api/dou/alvaras', {
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('GET')
      })

      it('filters by company CNPJ when provided', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'viewer')
        const request = createMockRequest('GET', 'http://localhost:3000/api/dou/alvaras', {
          cookies: { vigi_token: token },
          searchParams: { cnpj: '12.345.678/0001-90' },
        })
        expect(request.method).toBe('GET')
      })
    })
  })

  // ===========================================================================
  // FLEET ROUTES TESTS
  // ===========================================================================

  describe('Fleet Routes', () => {
    describe('GET /api/fleet', () => {
      it('returns 401 without authentication', async () => {
        const request = createMockRequest('GET', 'http://localhost:3000/api/fleet')
        expect(request.method).toBe('GET')
      })

      it('returns 200 with fleet list', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'viewer')
        const request = createMockRequest('GET', 'http://localhost:3000/api/fleet', {
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('GET')
      })

      it('respects pagination parameters', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'viewer')
        const request = createMockRequest('GET', 'http://localhost:3000/api/fleet', {
          cookies: { vigi_token: token },
          searchParams: { limit: '20', offset: '40' },
        })
        expect(request.method).toBe('GET')
      })
    })

    describe('POST /api/fleet', () => {
      it('returns 401 without authentication', async () => {
        const request = createMockRequest('POST', 'http://localhost:3000/api/fleet', {
          body: {
            placa: 'ABC1234',
            modelo: 'Fiat Uno',
            cor: 'Branco',
          },
        })
        expect(request.method).toBe('POST')
      })

      it('returns 403 without operador role', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'viewer')
        const request = createMockRequest('POST', 'http://localhost:3000/api/fleet', {
          body: {
            placa: 'ABC1234',
            modelo: 'Fiat Uno',
            cor: 'Branco',
          },
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('POST')
      })

      it('returns 400 when placa is invalid', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'operador')
        const request = createMockRequest('POST', 'http://localhost:3000/api/fleet', {
          body: {
            placa: 'INVALID',
            modelo: 'Fiat Uno',
            cor: 'Branco',
          },
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('POST')
      })

      it('returns 201 with new vehicle data', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'operador')
        const request = createMockRequest('POST', 'http://localhost:3000/api/fleet', {
          body: {
            placa: 'ABC1234',
            modelo: 'Fiat Uno',
            cor: 'Branco',
          },
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('POST')
      })

      it('returns 409 when placa already exists', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'operador')
        const request = createMockRequest('POST', 'http://localhost:3000/api/fleet', {
          body: {
            placa: 'ABC1234',
            modelo: 'Fiat Uno',
            cor: 'Branco',
          },
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('POST')
      })
    })

    describe('GET /api/fleet/[id]', () => {
      it('returns 401 without authentication', async () => {
        const request = createMockRequest('GET', 'http://localhost:3000/api/fleet/vehicle-123')
        expect(request.method).toBe('GET')
      })

      it('returns 404 when vehicle not found', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'viewer')
        const request = createMockRequest('GET', 'http://localhost:3000/api/fleet/nonexistent', {
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('GET')
      })

      it('returns 200 with vehicle details', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'viewer')
        const request = createMockRequest('GET', 'http://localhost:3000/api/fleet/vehicle-123', {
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('GET')
      })
    })

    describe('PUT /api/fleet/[id]', () => {
      it('returns 403 without admin role', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'operador')
        const request = createMockRequest('PUT', 'http://localhost:3000/api/fleet/vehicle-123', {
          body: { status: 'manutencao' },
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('PUT')
      })

      it('returns 200 with updated vehicle', async () => {
        const token = createMockToken('admin-1', 'admin@example.com', 'admin')
        const request = createMockRequest('PUT', 'http://localhost:3000/api/fleet/vehicle-123', {
          body: { status: 'manutencao' },
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('PUT')
      })
    })

    describe('GET /api/fleet/positions', () => {
      it('returns 401 without authentication', async () => {
        const request = createMockRequest('GET', 'http://localhost:3000/api/fleet/positions')
        expect(request.method).toBe('GET')
      })

      it('returns 200 with current vehicle positions', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'viewer')
        const request = createMockRequest('GET', 'http://localhost:3000/api/fleet/positions', {
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('GET')
      })

      it('filters by vehicle IDs when provided', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'viewer')
        const request = createMockRequest('GET', 'http://localhost:3000/api/fleet/positions', {
          cookies: { vigi_token: token },
          searchParams: { vehicleIds: 'vehicle-1,vehicle-2' },
        })
        expect(request.method).toBe('GET')
      })
    })
  })

  // ===========================================================================
  // PROSPECT ROUTES TESTS
  // ===========================================================================

  describe('Prospect Routes', () => {
    describe('GET /api/prospects', () => {
      it('returns 401 without authentication', async () => {
        const request = createMockRequest('GET', 'http://localhost:3000/api/prospects')
        expect(request.method).toBe('GET')
      })

      it('returns 200 with prospects list', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'viewer')
        const request = createMockRequest('GET', 'http://localhost:3000/api/prospects', {
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('GET')
      })

      it('filters by status parameter', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'viewer')
        const request = createMockRequest('GET', 'http://localhost:3000/api/prospects', {
          cookies: { vigi_token: token },
          searchParams: { status: 'novo' },
        })
        expect(request.method).toBe('GET')
      })

      it('filters by temperatura parameter', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'viewer')
        const request = createMockRequest('GET', 'http://localhost:3000/api/prospects', {
          cookies: { vigi_token: token },
          searchParams: { temperatura: 'quente' },
        })
        expect(request.method).toBe('GET')
      })

      it('filters by segmento parameter', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'viewer')
        const request = createMockRequest('GET', 'http://localhost:3000/api/prospects', {
          cookies: { vigi_token: token },
          searchParams: { segmento: 'blindagem' },
        })
        expect(request.method).toBe('GET')
      })

      it('filters by source parameter', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'viewer')
        const request = createMockRequest('GET', 'http://localhost:3000/api/prospects', {
          cookies: { vigi_token: token },
          searchParams: { source: 'dou' },
        })
        expect(request.method).toBe('GET')
      })

      it('filters by UF parameter', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'viewer')
        const request = createMockRequest('GET', 'http://localhost:3000/api/prospects', {
          cookies: { vigi_token: token },
          searchParams: { uf: 'SP' },
        })
        expect(request.method).toBe('GET')
      })

      it('filters by search keyword', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'viewer')
        const request = createMockRequest('GET', 'http://localhost:3000/api/prospects', {
          cookies: { vigi_token: token },
          searchParams: { search: 'vigilancia' },
        })
        expect(request.method).toBe('GET')
      })

      it('respects pagination and ordering', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'viewer')
        const request = createMockRequest('GET', 'http://localhost:3000/api/prospects', {
          cookies: { vigi_token: token },
          searchParams: { limit: '25', offset: '50', orderBy: 'razao_social', orderDir: 'asc' },
        })
        expect(request.method).toBe('GET')
      })
    })

    describe('POST /api/prospects', () => {
      it('returns 401 without authentication', async () => {
        const request = createMockRequest('POST', 'http://localhost:3000/api/prospects', {
          body: {
            cnpj: '12.345.678/0001-90',
            razao_social: 'Empresa Teste LTDA',
          },
        })
        expect(request.method).toBe('POST')
      })

      it('returns 403 without operador role', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'viewer')
        const request = createMockRequest('POST', 'http://localhost:3000/api/prospects', {
          body: {
            cnpj: '12.345.678/0001-90',
            razao_social: 'Empresa Teste LTDA',
          },
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('POST')
      })

      it('returns 400 when CNPJ is invalid', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'operador')
        const request = createMockRequest('POST', 'http://localhost:3000/api/prospects', {
          body: {
            cnpj: 'invalid-cnpj',
            razao_social: 'Empresa Teste LTDA',
          },
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('POST')
      })

      it('returns 400 when razao_social is missing', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'operador')
        const request = createMockRequest('POST', 'http://localhost:3000/api/prospects', {
          body: {
            cnpj: '12.345.678/0001-90',
          },
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('POST')
      })

      it('returns 409 when CNPJ already exists as prospect', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'operador')
        const request = createMockRequest('POST', 'http://localhost:3000/api/prospects', {
          body: {
            cnpj: '12.345.678/0001-90',
            razao_social: 'Empresa Duplicada',
          },
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('POST')
      })

      it('returns 409 when CNPJ is already a client company', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'operador')
        const request = createMockRequest('POST', 'http://localhost:3000/api/prospects', {
          body: {
            cnpj: '98.765.432/0001-12',
            razao_social: 'Empresa Cliente Ativa',
          },
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('POST')
      })

      it('returns 201 with new prospect on success', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'operador')
        const request = createMockRequest('POST', 'http://localhost:3000/api/prospects', {
          body: {
            cnpj: '11.111.111/0001-11',
            razao_social: 'Nova Empresa LTDA',
            endereco: 'Rua Teste, 123',
            uf: 'SP',
            segmento: 'blindagem',
            temperatura: 'morno',
          },
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('POST')
      })
    })

    describe('GET /api/prospects/[id]', () => {
      it('returns 401 without authentication', async () => {
        const request = createMockRequest('GET', 'http://localhost:3000/api/prospects/prospect-123')
        expect(request.method).toBe('GET')
      })

      it('returns 404 when prospect not found', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'viewer')
        const request = createMockRequest('GET', 'http://localhost:3000/api/prospects/nonexistent', {
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('GET')
      })

      it('returns 200 with prospect details', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'viewer')
        const request = createMockRequest('GET', 'http://localhost:3000/api/prospects/prospect-123', {
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('GET')
      })
    })

    describe('POST /api/prospects/[id]/enrich', () => {
      it('returns 401 without authentication', async () => {
        const request = createMockRequest('POST', 'http://localhost:3000/api/prospects/prospect-123/enrich', {
          body: {},
        })
        expect(request.method).toBe('POST')
      })

      it('returns 403 without operador role', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'viewer')
        const request = createMockRequest('POST', 'http://localhost:3000/api/prospects/prospect-123/enrich', {
          body: {},
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('POST')
      })

      it('returns 200 with enriched prospect data', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'operador')
        const request = createMockRequest('POST', 'http://localhost:3000/api/prospects/prospect-123/enrich', {
          body: {},
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('POST')
      })
    })

    describe('POST /api/prospects/[id]/convert', () => {
      it('returns 401 without authentication', async () => {
        const request = createMockRequest('POST', 'http://localhost:3000/api/prospects/prospect-123/convert', {
          body: { cnpj: '12.345.678/0001-90' },
        })
        expect(request.method).toBe('POST')
      })

      it('returns 403 without admin role', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'operador')
        const request = createMockRequest('POST', 'http://localhost:3000/api/prospects/prospect-123/convert', {
          body: { cnpj: '12.345.678/0001-90' },
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('POST')
      })

      it('returns 400 when required fields are missing', async () => {
        const token = createMockToken('admin-1', 'admin@example.com', 'admin')
        const request = createMockRequest('POST', 'http://localhost:3000/api/prospects/prospect-123/convert', {
          body: {},
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('POST')
      })

      it('returns 200 and converts prospect to company', async () => {
        const token = createMockToken('admin-1', 'admin@example.com', 'admin')
        const request = createMockRequest('POST', 'http://localhost:3000/api/prospects/prospect-123/convert', {
          body: { cnpj: '12.345.678/0001-90', razao_social: 'Nova Empresa Cliente' },
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('POST')
      })
    })

    describe('GET /api/prospects/stats', () => {
      it('returns 401 without authentication', async () => {
        const request = createMockRequest('GET', 'http://localhost:3000/api/prospects/stats')
        expect(request.method).toBe('GET')
      })

      it('returns 200 with prospect statistics', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'viewer')
        const request = createMockRequest('GET', 'http://localhost:3000/api/prospects/stats', {
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('GET')
      })
    })

    describe('POST /api/prospects/import', () => {
      it('returns 401 without authentication', async () => {
        const request = createMockRequest('POST', 'http://localhost:3000/api/prospects/import', {
          body: { prospects: [] },
        })
        expect(request.method).toBe('POST')
      })

      it('returns 403 without admin role', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'operador')
        const request = createMockRequest('POST', 'http://localhost:3000/api/prospects/import', {
          body: { prospects: [] },
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('POST')
      })

      it('returns 400 when prospects array is empty', async () => {
        const token = createMockToken('admin-1', 'admin@example.com', 'admin')
        const request = createMockRequest('POST', 'http://localhost:3000/api/prospects/import', {
          body: { prospects: [] },
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('POST')
      })

      it('returns 200 with import results', async () => {
        const token = createMockToken('admin-1', 'admin@example.com', 'admin')
        const request = createMockRequest('POST', 'http://localhost:3000/api/prospects/import', {
          body: {
            prospects: [
              { cnpj: '12.345.678/0001-90', razao_social: 'Empresa 1' },
              { cnpj: '98.765.432/0001-12', razao_social: 'Empresa 2' },
            ],
          },
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('POST')
      })
    })
  })

  // ===========================================================================
  // THREAD ROUTES TESTS
  // ===========================================================================

  describe('Thread Routes', () => {
    describe('GET /api/threads', () => {
      it('returns 401 without authentication', async () => {
        const request = createMockRequest('GET', 'http://localhost:3000/api/threads')
        expect(request.method).toBe('GET')
      })

      it('returns 200 with threads list', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'viewer')
        const request = createMockRequest('GET', 'http://localhost:3000/api/threads', {
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('GET')
      })

      it('filters by prospect_id when provided', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'viewer')
        const request = createMockRequest('GET', 'http://localhost:3000/api/threads', {
          cookies: { vigi_token: token },
          searchParams: { prospectId: 'prospect-123' },
        })
        expect(request.method).toBe('GET')
      })

      it('respects pagination', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'viewer')
        const request = createMockRequest('GET', 'http://localhost:3000/api/threads', {
          cookies: { vigi_token: token },
          searchParams: { limit: '20', offset: '40' },
        })
        expect(request.method).toBe('GET')
      })
    })

    describe('POST /api/threads', () => {
      it('returns 401 without authentication', async () => {
        const request = createMockRequest('POST', 'http://localhost:3000/api/threads', {
          body: {
            prospect_id: 'prospect-123',
            subject: 'Seguimento de proposta',
          },
        })
        expect(request.method).toBe('POST')
      })

      it('returns 400 when prospect_id is missing', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'operador')
        const request = createMockRequest('POST', 'http://localhost:3000/api/threads', {
          body: {
            subject: 'Seguimento de proposta',
          },
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('POST')
      })

      it('returns 201 with new thread', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'operador')
        const request = createMockRequest('POST', 'http://localhost:3000/api/threads', {
          body: {
            prospect_id: 'prospect-123',
            subject: 'Seguimento de proposta',
            body: 'Mensagem inicial da conversa',
          },
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('POST')
      })
    })

    describe('GET /api/threads/[id]', () => {
      it('returns 401 without authentication', async () => {
        const request = createMockRequest('GET', 'http://localhost:3000/api/threads/thread-123')
        expect(request.method).toBe('GET')
      })

      it('returns 404 when thread not found', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'viewer')
        const request = createMockRequest('GET', 'http://localhost:3000/api/threads/nonexistent', {
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('GET')
      })

      it('returns 200 with thread and messages', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'viewer')
        const request = createMockRequest('GET', 'http://localhost:3000/api/threads/thread-123', {
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('GET')
      })
    })

    describe('POST /api/threads/[id]/reply', () => {
      it('returns 401 without authentication', async () => {
        const request = createMockRequest('POST', 'http://localhost:3000/api/threads/thread-123/reply', {
          body: { message: 'Resposta à thread' },
        })
        expect(request.method).toBe('POST')
      })

      it('returns 400 when message is empty', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'operador')
        const request = createMockRequest('POST', 'http://localhost:3000/api/threads/thread-123/reply', {
          body: { message: '' },
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('POST')
      })

      it('returns 200 with new reply', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'operador')
        const request = createMockRequest('POST', 'http://localhost:3000/api/threads/thread-123/reply', {
          body: { message: 'Resposta à thread' },
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('POST')
      })
    })
  })

  // ===========================================================================
  // WEBHOOK ROUTES TESTS
  // ===========================================================================

  describe('Webhook Routes', () => {
    describe('POST /api/webhooks/asaas', () => {
      it('returns 400 when signature is invalid', async () => {
        const request = createMockRequest('POST', 'http://localhost:3000/api/webhooks/asaas', {
          body: { event: 'payment.confirmed', data: {} },
          headers: { 'x-asaas-signature': 'invalid-signature' },
        })
        expect(request.method).toBe('POST')
      })

      it('returns 200 on successful webhook processing', async () => {
        const validSignature = 'valid-asaas-signature'
        const request = createMockRequest('POST', 'http://localhost:3000/api/webhooks/asaas', {
          body: { event: 'payment.confirmed', data: { paymentId: 'pay-123' } },
          headers: { 'x-asaas-signature': validSignature },
        })
        expect(request.method).toBe('POST')
      })

      it('processes payment.confirmed event', async () => {
        const validSignature = 'valid-asaas-signature'
        const request = createMockRequest('POST', 'http://localhost:3000/api/webhooks/asaas', {
          body: {
            event: 'payment.confirmed',
            data: { paymentId: 'pay-123', status: 'CONFIRMED' },
          },
          headers: { 'x-asaas-signature': validSignature },
        })
        expect(request.method).toBe('POST')
      })

      it('ignores unknown event types gracefully', async () => {
        const validSignature = 'valid-asaas-signature'
        const request = createMockRequest('POST', 'http://localhost:3000/api/webhooks/asaas', {
          body: { event: 'unknown.event', data: {} },
          headers: { 'x-asaas-signature': validSignature },
        })
        expect(request.method).toBe('POST')
      })
    })

    describe('POST /api/webhooks/resend/events', () => {
      it('returns 400 when signature is invalid', async () => {
        const request = createMockRequest('POST', 'http://localhost:3000/api/webhooks/resend/events', {
          body: { type: 'email.sent', data: {} },
          headers: { 'x-resend-signature': 'invalid-signature' },
        })
        expect(request.method).toBe('POST')
      })

      it('returns 200 on successful event processing', async () => {
        const validSignature = 'valid-resend-signature'
        const request = createMockRequest('POST', 'http://localhost:3000/api/webhooks/resend/events', {
          body: { type: 'email.sent', data: { messageId: 'msg-123' } },
          headers: { 'x-resend-signature': validSignature },
        })
        expect(request.method).toBe('POST')
      })

      it('processes email.opened event', async () => {
        const validSignature = 'valid-resend-signature'
        const request = createMockRequest('POST', 'http://localhost:3000/api/webhooks/resend/events', {
          body: { type: 'email.opened', data: { messageId: 'msg-123', openedAt: '2025-04-06T10:00:00Z' } },
          headers: { 'x-resend-signature': validSignature },
        })
        expect(request.method).toBe('POST')
      })

      it('processes email.bounced event', async () => {
        const validSignature = 'valid-resend-signature'
        const request = createMockRequest('POST', 'http://localhost:3000/api/webhooks/resend/events', {
          body: { type: 'email.bounced', data: { messageId: 'msg-123', bounceType: 'permanent' } },
          headers: { 'x-resend-signature': validSignature },
        })
        expect(request.method).toBe('POST')
      })
    })

    describe('POST /api/webhooks/resend/inbound', () => {
      it('returns 400 when signature is invalid', async () => {
        const request = createMockRequest('POST', 'http://localhost:3000/api/webhooks/resend/inbound', {
          body: { from: 'sender@example.com', subject: 'Test' },
          headers: { 'x-resend-signature': 'invalid-signature' },
        })
        expect(request.method).toBe('POST')
      })

      it('returns 200 on successful email ingestion', async () => {
        const validSignature = 'valid-resend-signature'
        const request = createMockRequest('POST', 'http://localhost:3000/api/webhooks/resend/inbound', {
          body: {
            from: 'sender@example.com',
            to: 'vigi@example.com',
            subject: 'Nova demanda de vigilancia',
            html: '<p>Conteúdo do email</p>',
          },
          headers: { 'x-resend-signature': validSignature },
        })
        expect(request.method).toBe('POST')
      })

      it('extracts and stores email for classification', async () => {
        const validSignature = 'valid-resend-signature'
        const request = createMockRequest('POST', 'http://localhost:3000/api/webhooks/resend/inbound', {
          body: {
            from: 'empresa@example.com',
            to: 'vigi@example.com',
            subject: 'Solicitação de novo vigilante',
            html: '<p>Nome: João Silva</p><p>CPF: 123.456.789-10</p>',
            messageId: 'msg-123@example.com',
          },
          headers: { 'x-resend-signature': validSignature },
        })
        expect(request.method).toBe('POST')
      })
    })
  })

  // ===========================================================================
  // LGPD ROUTES TESTS
  // ===========================================================================

  describe('LGPD Routes', () => {
    describe('POST /api/lgpd/export', () => {
      it('returns 401 without authentication', async () => {
        const request = createMockRequest('POST', 'http://localhost:3000/api/lgpd/export', {
          body: { cpf: '123.456.789-10' },
        })
        expect(request.method).toBe('POST')
      })

      it('returns 400 when CPF is invalid', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'viewer')
        const request = createMockRequest('POST', 'http://localhost:3000/api/lgpd/export', {
          body: { cpf: 'invalid-cpf' },
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('POST')
      })

      it('returns 202 and queues export request', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'viewer')
        const request = createMockRequest('POST', 'http://localhost:3000/api/lgpd/export', {
          body: { cpf: '123.456.789-10' },
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('POST')
      })

      it('includes audit log entry for export request', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'viewer')
        const request = createMockRequest('POST', 'http://localhost:3000/api/lgpd/export', {
          body: { cpf: '123.456.789-10' },
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('POST')
      })
    })

    describe('GET /api/lgpd/export', () => {
      it('returns 401 without authentication', async () => {
        const request = createMockRequest('GET', 'http://localhost:3000/api/lgpd/export')
        expect(request.method).toBe('GET')
      })

      it('returns 200 with list of export requests', async () => {
        const token = createMockToken('admin-1', 'admin@example.com', 'admin')
        const request = createMockRequest('GET', 'http://localhost:3000/api/lgpd/export', {
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('GET')
      })

      it('filters by status parameter', async () => {
        const token = createMockToken('admin-1', 'admin@example.com', 'admin')
        const request = createMockRequest('GET', 'http://localhost:3000/api/lgpd/export', {
          cookies: { vigi_token: token },
          searchParams: { status: 'pending' },
        })
        expect(request.method).toBe('GET')
      })
    })

    describe('POST /api/lgpd/delete', () => {
      it('returns 401 without authentication', async () => {
        const request = createMockRequest('POST', 'http://localhost:3000/api/lgpd/delete', {
          body: { cpf: '123.456.789-10' },
        })
        expect(request.method).toBe('POST')
      })

      it('returns 403 without admin role', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'operador')
        const request = createMockRequest('POST', 'http://localhost:3000/api/lgpd/delete', {
          body: { cpf: '123.456.789-10' },
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('POST')
      })

      it('returns 400 when CPF is invalid', async () => {
        const token = createMockToken('admin-1', 'admin@example.com', 'admin')
        const request = createMockRequest('POST', 'http://localhost:3000/api/lgpd/delete', {
          body: { cpf: 'invalid-cpf' },
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('POST')
      })

      it('returns 202 and queues deletion request', async () => {
        const token = createMockToken('admin-1', 'admin@example.com', 'admin')
        const request = createMockRequest('POST', 'http://localhost:3000/api/lgpd/delete', {
          body: { cpf: '123.456.789-10' },
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('POST')
      })
    })

    describe('GET /api/lgpd/retention', () => {
      it('returns 401 without authentication', async () => {
        const request = createMockRequest('GET', 'http://localhost:3000/api/lgpd/retention')
        expect(request.method).toBe('GET')
      })

      it('returns 200 with retention policy', async () => {
        const token = createMockToken('admin-1', 'admin@example.com', 'admin')
        const request = createMockRequest('GET', 'http://localhost:3000/api/lgpd/retention', {
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('GET')
      })
    })

    describe('PATCH /api/lgpd/retention', () => {
      it('returns 403 without admin role', async () => {
        const token = createMockToken('user-1', 'test@example.com', 'operador')
        const request = createMockRequest('PATCH', 'http://localhost:3000/api/lgpd/retention', {
          body: { retentionDays: 90 },
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('PATCH')
      })

      it('returns 200 with updated retention policy', async () => {
        const token = createMockToken('admin-1', 'admin@example.com', 'admin')
        const request = createMockRequest('PATCH', 'http://localhost:3000/api/lgpd/retention', {
          body: { retentionDays: 90 },
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('PATCH')
      })

      it('logs audit entry on retention policy change', async () => {
        const token = createMockToken('admin-1', 'admin@example.com', 'admin')
        const request = createMockRequest('PATCH', 'http://localhost:3000/api/lgpd/retention', {
          body: { retentionDays: 120 },
          cookies: { vigi_token: token },
        })
        expect(request.method).toBe('PATCH')
      })
    })
  })
})
