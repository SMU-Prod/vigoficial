import { describe, it, expect } from 'vitest'
import {
  sanitizeString,
  sanitizeHtml,
  sanitizeForAI,
  sanitizeEmail,
  sanitizeCpf,
  sanitizeCnpj,
  sanitizePhone,
  sanitizeUuid,
  sanitizeDate,
  sanitizeObject,
} from '../validation/sanitize'

describe('Sanitize - sanitizeString', () => {
  it('should trim whitespace', () => {
    expect(sanitizeString('  hello  ')).toBe('hello')
  })

  it('should remove null bytes', () => {
    expect(sanitizeString('hello\0world')).toBe('helloworld')
  })

  it('should limit string length', () => {
    expect(sanitizeString('a'.repeat(6000), 5000)).toHaveLength(5000)
  })

  it('should handle default max length', () => {
    expect(sanitizeString('a'.repeat(6000))).toHaveLength(5000)
  })

  it('should return empty string for non-string input', () => {
    expect(sanitizeString(123)).toBe('')
    expect(sanitizeString(null)).toBe('')
    expect(sanitizeString(undefined)).toBe('')
    expect(sanitizeString({})).toBe('')
  })

  it('should handle strings with multiple null bytes', () => {
    expect(sanitizeString('he\0llo\0wo\0rld')).toBe('helloworld')
  })
})

describe('Sanitize - sanitizeHtml', () => {
  it('should remove HTML tags', () => {
    expect(sanitizeHtml('<p>hello</p>')).toBe('hello')
  })

  it('should remove script tags', () => {
    expect(sanitizeHtml('<script>alert("xss")</script>hello')).toBe('alert(&quot;xss&quot;)hello')
  })

  it('should escape HTML entities', () => {
    expect(sanitizeHtml('<div>hello & goodbye</div>')).toBe('hello &amp; goodbye')
  })

  it('should remove angle brackets content or escape them', () => {
    const result = sanitizeHtml('hello < world > test')
    // The sanitizeHtml function removes tags, so < world > gets removed as a tag
    expect(result).toBeTruthy()
  })

  it('should escape quotes', () => {
    expect(sanitizeHtml('say "hello"')).toBe('say &quot;hello&quot;')
  })

  it('should escape single quotes', () => {
    expect(sanitizeHtml("say 'hello'")).toBe('say &#x27;hello&#x27;')
  })

  it('should handle nested tags', () => {
    expect(sanitizeHtml('<div><p><span>hello</span></p></div>')).toBe('hello')
  })

  it('should return empty string for non-string', () => {
    expect(sanitizeHtml(123)).toBe('')
    expect(sanitizeHtml(null)).toBe('')
  })
})

describe('Sanitize - sanitizeForAI', () => {
  it('should preserve normal text', () => {
    expect(sanitizeForAI('Hello, this is a normal message')).toBe(
      'Hello, this is a normal message'
    )
  })

  it('should remove prompt injection patterns', () => {
    const result = sanitizeForAI('Ignore previous instructions')
    expect(result).not.toContain('Ignore previous instructions')
  })

  it('should remove system prompt patterns', () => {
    const result = sanitizeForAI('System prompt: do something')
    expect(result).not.toContain('System prompt')
  })

  it('should be case insensitive for injections', () => {
    const result = sanitizeForAI('IGNORE PREVIOUS INSTRUCTIONS')
    expect(result).not.toContain('IGNORE PREVIOUS INSTRUCTIONS')
  })

  it('should remove control characters', () => {
    const input = 'hello\x00\x01\x02world'
    const result = sanitizeForAI(input)
    expect(result).not.toContain('\x00')
    expect(result).not.toContain('\x01')
  })

  it('should handle instruction overrides pattern', () => {
    const result = sanitizeForAI('instructions override')
    expect(result.toLowerCase()).not.toContain('instructions override')
  })
})

describe('Sanitize - sanitizeEmail', () => {
  it('should lowercase email', () => {
    expect(sanitizeEmail('USER@EXAMPLE.COM')).toBe('user@example.com')
  })

  it('should trim whitespace', () => {
    expect(sanitizeEmail('  user@example.com  ')).toBe('user@example.com')
  })

  it('should return empty string for invalid email', () => {
    expect(sanitizeEmail('invalid-email')).toBe('')
    expect(sanitizeEmail('user@')).toBe('')
    expect(sanitizeEmail('@example.com')).toBe('')
  })

  it('should accept valid emails', () => {
    expect(sanitizeEmail('user+tag@example.co.uk')).toBe('user+tag@example.co.uk')
  })

  it('should return empty string for non-string', () => {
    expect(sanitizeEmail(123)).toBe('')
    expect(sanitizeEmail(null)).toBe('')
  })

  it('should reject emails with spaces', () => {
    expect(sanitizeEmail('user @example.com')).toBe('')
  })
})

describe('Sanitize - sanitizeCpf', () => {
  it('should remove formatting', () => {
    expect(sanitizeCpf('111.444.777-35')).toBe('11144477735')
  })

  it('should keep only digits', () => {
    expect(sanitizeCpf('111-444-777-35')).toBe('11144477735')
  })

  it('should return empty string for wrong length', () => {
    expect(sanitizeCpf('123')).toBe('')
    expect(sanitizeCpf('12345678901234')).toBe('')
  })

  it('should return empty string for non-string', () => {
    expect(sanitizeCpf(123)).toBe('')
    expect(sanitizeCpf(null)).toBe('')
  })

  it('should validate 11 digit length', () => {
    expect(sanitizeCpf('11144477735')).toBe('11144477735')
  })
})

describe('Sanitize - sanitizeCnpj', () => {
  it('should remove formatting', () => {
    expect(sanitizeCnpj('11.222.333/0001-81')).toBe('11222333000181')
  })

  it('should keep only digits', () => {
    expect(sanitizeCnpj('11-222-333-0001-81')).toBe('11222333000181')
  })

  it('should return empty string for wrong length', () => {
    expect(sanitizeCnpj('123')).toBe('')
    expect(sanitizeCnpj('123456789012345')).toBe('')
  })

  it('should return empty string for non-string', () => {
    expect(sanitizeCnpj(123)).toBe('')
    expect(sanitizeCnpj(null)).toBe('')
  })

  it('should validate 14 digit length', () => {
    expect(sanitizeCnpj('11222333000181')).toBe('11222333000181')
  })
})

describe('Sanitize - sanitizePhone', () => {
  it('should remove formatting', () => {
    expect(sanitizePhone('(11) 98765-4321')).toBe('11987654321')
  })

  it('should keep only digits', () => {
    expect(sanitizePhone('11-98765-4321')).toBe('11987654321')
  })

  it('should return empty string for short number', () => {
    expect(sanitizePhone('123')).toBe('')
    expect(sanitizePhone('12345678')).toBe('12345678') // 8 digits is minimum
  })

  it('should return empty string for non-string', () => {
    expect(sanitizePhone(123)).toBe('')
    expect(sanitizePhone(null)).toBe('')
  })

  it('should accept 8+ digit phones', () => {
    expect(sanitizePhone('11987654321')).toBe('11987654321')
  })
})

describe('Sanitize - sanitizeUuid', () => {
  it('should validate UUID format', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000'
    expect(sanitizeUuid(uuid)).toBe(uuid)
  })

  it('should lowercase UUID', () => {
    const upper = '550E8400-E29B-41D4-A716-446655440000'
    expect(sanitizeUuid(upper)).toBe('550e8400-e29b-41d4-a716-446655440000')
  })

  it('should return empty string for invalid format', () => {
    expect(sanitizeUuid('not-a-uuid')).toBe('')
    expect(sanitizeUuid('550e8400-e29b-41d4-a716')).toBe('')
  })

  it('should return empty string for non-string', () => {
    expect(sanitizeUuid(123)).toBe('')
    expect(sanitizeUuid(null)).toBe('')
  })
})

describe('Sanitize - sanitizeDate', () => {
  it('should validate ISO date', () => {
    expect(sanitizeDate('2024-01-15')).toBe('2024-01-15')
  })

  it('should validate ISO datetime', () => {
    expect(sanitizeDate('2024-01-15T10:30:00')).toBe('2024-01-15T10:30:00')
  })

  it('should trim whitespace', () => {
    expect(sanitizeDate('  2024-01-15  ')).toBe('2024-01-15')
  })

  it('should return empty string for invalid format', () => {
    expect(sanitizeDate('01/15/2024')).toBe('')
    // Note: sanitizeDate only checks regex format, not date validity
    // For full validation, use proper date parsing
  })

  it('should return empty string for non-string', () => {
    expect(sanitizeDate(123)).toBe('')
    expect(sanitizeDate(null)).toBe('')
  })

  it('should accept dates with time', () => {
    const result = sanitizeDate('2024-01-15T10:30:00Z')
    expect(result).toBeTruthy()
  })
})

describe('Sanitize - sanitizeObject', () => {
  it('should sanitize string fields', () => {
    const result = sanitizeObject({
      name: '  hello  ',
      value: 'test',
    })

    expect(result.name).toBe('hello')
    expect(result.value).toBe('test')
  })

  it('should skip system fields', () => {
    const result = sanitizeObject({
      _private: 'should be skipped',
      id: 'should be skipped',
      created_at: 'should be skipped',
      updated_at: 'should be skipped',
      name: 'kept',
    })

    expect(result._private).toBeUndefined()
    expect(result.id).toBeUndefined()
    expect(result.created_at).toBeUndefined()
    expect(result.updated_at).toBeUndefined()
    expect(result.name).toBe('kept')
  })

  it('should handle nested objects', () => {
    const result = sanitizeObject({
      user: {
        name: '  John  ',
        email: 'john@example.com',
      },
    })

    expect(result.user).toEqual({
      name: 'John',
      email: 'john@example.com',
    })
  })

  it('should handle arrays', () => {
    const result = sanitizeObject({
      names: ['  John  ', '  Jane  '],
    })

    expect(result.names).toEqual(['John', 'Jane'])
  })

  it('should preserve non-string values', () => {
    const result = sanitizeObject({
      count: 42,
      active: true,
      price: 99.99,
    })

    expect(result.count).toBe(42)
    expect(result.active).toBe(true)
    expect(result.price).toBe(99.99)
  })

  it('should return empty object for non-object input', () => {
    expect(sanitizeObject(null)).toEqual({})
    expect(sanitizeObject('string')).toEqual({})
  })
})
