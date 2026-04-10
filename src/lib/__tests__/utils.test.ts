import { describe, it, expect } from 'vitest'
import {
  cn,
  formatCnpj,
  formatCpf,
  isValidCpf,
  isValidCnpj,
  formatDateBr,
  formatBrl,
  diasRestantes,
} from '../utils'

describe('Utils - cn', () => {
  it('should combine classes with truthy values', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c')
  })

  it('should filter out false values', () => {
    expect(cn('a', false, 'b', null, 'c', undefined)).toBe('a b c')
  })

  it('should handle all falsy values', () => {
    expect(cn(false, null, undefined)).toBe('')
  })

  it('should handle empty input', () => {
    expect(cn()).toBe('')
  })

  it('should handle conditional classes', () => {
    const isActive = true
    const isDisabled = false
    expect(cn('base', isActive && 'active', isDisabled && 'disabled')).toBe(
      'base active'
    )
  })
})

describe('Utils - formatCnpj', () => {
  it('should format valid CNPJ', () => {
    expect(formatCnpj('11222333000181')).toBe('11.222.333/0001-81')
  })

  it('should format CNPJ with special characters', () => {
    expect(formatCnpj('11.222.333/0001-81')).toBe('11.222.333/0001-81')
  })

  it('should return unformatted string for short input', () => {
    expect(formatCnpj('123')).toBe('123')
  })

  it('should handle empty string', () => {
    expect(formatCnpj('')).toBe('')
  })

  it('should remove non-digit characters before formatting', () => {
    expect(formatCnpj('11-222-333-0001-81')).toBe('11.222.333/0001-81')
  })
})

describe('Utils - formatCpf', () => {
  it('should format valid CPF', () => {
    expect(formatCpf('11144477735')).toBe('111.444.777-35')
  })

  it('should format CPF with special characters', () => {
    expect(formatCpf('111.444.777-35')).toBe('111.444.777-35')
  })

  it('should return unformatted string for short input', () => {
    expect(formatCpf('123')).toBe('123')
  })

  it('should handle empty string', () => {
    expect(formatCpf('')).toBe('')
  })

  it('should remove non-digit characters before formatting', () => {
    expect(formatCpf('111-444-777-35')).toBe('111.444.777-35')
  })
})

describe('Utils - isValidCpf', () => {
  it('should validate a correct CPF', () => {
    expect(isValidCpf('11144477735')).toBe(true)
  })

  it('should validate CPF with formatting', () => {
    expect(isValidCpf('111.444.777-35')).toBe(true)
  })

  it('should reject CPF with all same digits', () => {
    expect(isValidCpf('11111111111')).toBe(false)
    expect(isValidCpf('00000000000')).toBe(false)
    expect(isValidCpf('22222222222')).toBe(false)
  })

  it('should reject CPF with wrong length', () => {
    expect(isValidCpf('123')).toBe(false)
    expect(isValidCpf('12345678901234')).toBe(false)
  })

  it('should reject CPF with wrong check digits', () => {
    expect(isValidCpf('11144477736')).toBe(false)
  })

  it('should reject empty string', () => {
    expect(isValidCpf('')).toBe(false)
  })

  it('should reject CPF with non-numeric characters', () => {
    expect(isValidCpf('111.444.777-3a')).toBe(false)
  })

  it('should validate a mathematically valid test CPF', () => {
    // Valid CPF that passes validation
    expect(isValidCpf('11144477735')).toBe(true)
  })
})

describe('Utils - isValidCnpj', () => {
  it('should validate a correct CNPJ', () => {
    expect(isValidCnpj('11222333000181')).toBe(true)
  })

  it('should validate CNPJ with formatting', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true)
  })

  it('should reject CNPJ with all same digits', () => {
    expect(isValidCnpj('11111111111111')).toBe(false)
    expect(isValidCnpj('00000000000000')).toBe(false)
  })

  it('should reject CNPJ with wrong length', () => {
    expect(isValidCnpj('123')).toBe(false)
    expect(isValidCnpj('123456789012345')).toBe(false)
  })

  it('should reject CNPJ with wrong check digits', () => {
    expect(isValidCnpj('11222333000182')).toBe(false)
  })

  it('should reject empty string', () => {
    expect(isValidCnpj('')).toBe(false)
  })

  it('should reject CNPJ with non-numeric characters', () => {
    expect(isValidCnpj('11.222.333/0001-8a')).toBe(false)
  })
})

describe('Utils - formatDateBr', () => {
  it('should format date in BR format', () => {
    const result = formatDateBr('2024-01-15')
    // Date formatting is locale-dependent, just verify it's not the dash
    expect(result).not.toBe('—')
    expect(result).toBeTruthy()
  })

  it('should handle ISO format with time', () => {
    const result = formatDateBr('2024-01-15T10:30:00Z')
    expect(result).toBeTruthy()
    expect(result).not.toBe('—')
  })

  it('should return dash for null', () => {
    expect(formatDateBr(null)).toBe('—')
  })

  it('should return dash for undefined', () => {
    expect(formatDateBr(undefined)).toBe('—')
  })

  it('should return dash for empty string', () => {
    expect(formatDateBr('')).toBe('—')
  })

  it('should handle invalid date gracefully', () => {
    // JavaScript's toLocaleDateString returns "Invalid Date" for invalid dates
    const result = formatDateBr('invalid-date')
    expect(result).toBeTruthy()
  })
})

describe('Utils - formatBrl', () => {
  it('should format positive number as BRL', () => {
    const result = formatBrl(100)
    expect(result).toContain('100')
    expect(result).toMatch(/R\$|R \$/)
  })

  it('should format decimal numbers', () => {
    const result = formatBrl(99.99)
    expect(result).toContain('99')
  })

  it('should format zero', () => {
    const result = formatBrl(0)
    expect(result).toMatch(/R\$|R \$/)
  })

  it('should format negative number', () => {
    const result = formatBrl(-50.50)
    expect(result).toContain('-')
  })

  it('should handle large numbers', () => {
    const result = formatBrl(1000000)
    expect(result).toMatch(/1\.000\.000|1000000/)
  })

  it('should use comma for decimal separator in pt-BR', () => {
    const result = formatBrl(123.45)
    expect(result).toMatch(/,/)
  })
})

describe('Utils - diasRestantes', () => {
  it('should return days remaining for future date', () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 10)
    const result = diasRestantes(futureDate.toISOString().split('T')[0])
    expect(result).toBeGreaterThanOrEqual(9)
    expect(result).toBeLessThanOrEqual(11)
  })

  it('should return 0 or negative for past date', () => {
    const pastDate = new Date()
    pastDate.setDate(pastDate.getDate() - 5)
    const result = diasRestantes(pastDate.toISOString().split('T')[0])
    expect(result).toBeLessThanOrEqual(-4)
  })

  it('should handle today correctly', () => {
    const today = new Date().toISOString().split('T')[0]
    const result = diasRestantes(today)
    expect(result).toBeLessThanOrEqual(1)
    expect(result).toBeGreaterThanOrEqual(-1)
  })

  it('should return null for null date', () => {
    expect(diasRestantes(null)).toBeNull()
  })

  it('should return null for undefined date', () => {
    expect(diasRestantes(undefined)).toBeNull()
  })

  it('should return null for empty string', () => {
    expect(diasRestantes('')).toBeNull()
  })

  it('should round up fractional days', () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(23, 59, 59)
    const result = diasRestantes(tomorrow.toISOString())
    expect(result).toBeGreaterThanOrEqual(1)
  })
})
