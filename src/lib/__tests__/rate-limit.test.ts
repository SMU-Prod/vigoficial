import { describe, it, expect, beforeEach, vi } from 'vitest'
import { rateLimit, createRateLimitResponse, RateLimitConfig } from '../security/rate-limit'
import { NextRequest } from 'next/server'

// Mock NextRequest
function createMockRequest(ip: string = '192.168.1.1'): NextRequest {
  const req = new Request('http://localhost/api/test', {
    method: 'POST',
    headers: {
      'x-forwarded-for': ip,
    },
  })
  return req as NextRequest
}

describe('RateLimit - rateLimit', () => {
  beforeEach(() => {
    // Clear the in-memory store before each test
    vi.clearAllMocks()
  })

  it('should allow request under limit', async () => {
    const config: RateLimitConfig = { windowMs: 60000, maxRequests: 5 }
    const request = createMockRequest('192.168.1.1')

    const result = await rateLimit(request, config)

    expect(result.success).toBe(true)
    expect(result.remaining).toBe(4)
  })

  it('should block request over limit', async () => {
    const config: RateLimitConfig = { windowMs: 60000, maxRequests: 2 }
    const request = createMockRequest('192.168.1.2')

    // Make 3 requests
    await rateLimit(request, config)
    await rateLimit(request, config)
    const result = await rateLimit(request, config)

    expect(result.success).toBe(false)
    expect(result.remaining).toBe(0)
    expect(result.retryAfter).toBeDefined()
  })

  it('should track remaining requests', async () => {
    const config: RateLimitConfig = { windowMs: 60000, maxRequests: 5 }
    const request = createMockRequest('192.168.1.3')

    const result1 = await rateLimit(request, config)
    expect(result1.remaining).toBe(4)

    const result2 = await rateLimit(request, config)
    expect(result2.remaining).toBe(3)

    const result3 = await rateLimit(request, config)
    expect(result3.remaining).toBe(2)
  })

  it('should distinguish between different IPs', async () => {
    const config: RateLimitConfig = { windowMs: 60000, maxRequests: 2 }

    const request1 = createMockRequest('192.168.1.4')
    const request2 = createMockRequest('192.168.1.5')

    const result1a = await rateLimit(request1, config)
    const result2a = await rateLimit(request2, config)

    expect(result1a.success).toBe(true)
    expect(result2a.success).toBe(true)

    const result1b = await rateLimit(request1, config)
    const result2b = await rateLimit(request2, config)

    expect(result1b.remaining).toBe(0)
    expect(result2b.remaining).toBe(0)
  })

  it('should return resetAt timestamp', async () => {
    const config: RateLimitConfig = { windowMs: 60000, maxRequests: 5 }
    const request = createMockRequest('192.168.1.6')

    const result = await rateLimit(request, config)

    expect(result.resetAt).toBeInstanceOf(Date)
    expect(result.resetAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('should calculate retryAfter for blocked requests', async () => {
    const config: RateLimitConfig = { windowMs: 60000, maxRequests: 1 }
    const request = createMockRequest('192.168.1.7')

    await rateLimit(request, config)
    const result = await rateLimit(request, config)

    expect(result.success).toBe(false)
    expect(result.retryAfter).toBeDefined()
    expect(result.retryAfter).toBeGreaterThan(0)
    expect(result.retryAfter).toBeLessThanOrEqual(60)
  })
})

describe('RateLimit - createRateLimitResponse', () => {
  it('should return null for successful rate limit', () => {
    const result = {
      success: true,
      remaining: 5,
      resetAt: new Date(),
    }

    const response = createRateLimitResponse(result)
    expect(response).toBeNull()
  })

  it('should return 429 response for rate limit exceeded', () => {
    const resetAt = new Date()
    const result = {
      success: false,
      remaining: 0,
      resetAt,
      retryAfter: 30,
    }

    const response = createRateLimitResponse(result)

    expect(response).not.toBeNull()
    expect(response?.status).toBe(429)
  })

  it('should include Retry-After header', () => {
    const result = {
      success: false,
      remaining: 0,
      resetAt: new Date(),
      retryAfter: 45,
    }

    const response = createRateLimitResponse(result)

    expect(response?.headers.get('Retry-After')).toBe('45')
  })

  it('should include X-RateLimit-Reset header', () => {
    const resetAt = new Date('2024-01-15T10:30:00Z')
    const result = {
      success: false,
      remaining: 0,
      resetAt,
      retryAfter: 30,
    }

    const response = createRateLimitResponse(result)

    expect(response?.headers.get('X-RateLimit-Reset')).toBe(resetAt.toISOString())
  })

  it('should return error message in body', async () => {
    const result = {
      success: false,
      remaining: 0,
      resetAt: new Date(),
      retryAfter: 30,
    }

    const response = createRateLimitResponse(result)
    const body = await response?.json()

    expect(body?.error).toBe('Too many requests')
    expect(body?.retryAfter).toBe(30)
  })

  it('should use default retry-after when not provided', () => {
    const result = {
      success: false,
      remaining: 0,
      resetAt: new Date(),
    }

    const response = createRateLimitResponse(result)

    expect(response?.headers.get('Retry-After')).toBe('60')
  })
})

describe('RateLimit - Different Configurations', () => {
  it('should work with login configuration', async () => {
    const loginConfig: RateLimitConfig = { windowMs: 15 * 60 * 1000, maxRequests: 5 }
    const request = createMockRequest('192.168.1.8')

    // Should allow 5 login attempts
    for (let i = 0; i < 5; i++) {
      const result = await rateLimit(request, loginConfig)
      expect(result.success).toBe(true)
    }

    // 6th attempt should fail
    const result = await rateLimit(request, loginConfig)
    expect(result.success).toBe(false)
  })

  it('should work with API configuration', async () => {
    const apiConfig: RateLimitConfig = { windowMs: 60 * 1000, maxRequests: 100 }
    const request = createMockRequest('192.168.1.9')

    // Allow 100 requests
    for (let i = 0; i < 100; i++) {
      const result = await rateLimit(request, apiConfig)
      expect(result.success).toBe(true)
    }

    // 101st should fail
    const result = await rateLimit(request, apiConfig)
    expect(result.success).toBe(false)
  })

  it('should work with webhook configuration', async () => {
    const webhookConfig: RateLimitConfig = { windowMs: 60 * 1000, maxRequests: 200 }
    const request = createMockRequest('192.168.1.10')

    // Should allow more requests than API
    const results = []
    for (let i = 0; i < 201; i++) {
      const result = await rateLimit(request, webhookConfig)
      results.push(result.success)
    }

    // First 200 should succeed, 201st should fail
    expect(results.filter(r => r === true)).toHaveLength(200)
    expect(results[200]).toBe(false)
  })
})

describe('RateLimit - IP Detection', () => {
  it('should extract IP from x-forwarded-for header', async () => {
    const config: RateLimitConfig = { windowMs: 60000, maxRequests: 1 }

    const request1 = createMockRequest('192.168.1.1')
    const request2 = createMockRequest('192.168.1.2')

    const result1 = await rateLimit(request1, config)
    const result2 = await rateLimit(request2, config)

    expect(result1.remaining).toBe(0)
    expect(result2.remaining).toBe(0)
  })
})
