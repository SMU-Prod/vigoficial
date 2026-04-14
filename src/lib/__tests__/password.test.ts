import { describe, it, expect } from 'vitest'
import {
  hashPassword,
  comparePassword,
  validatePasswordStrength,
} from '../auth/password'

describe('Password - hashPassword', () => {
  it('should hash a password', async () => {
    const password = 'MyPassword123!@#'
    const hash = await hashPassword(password)

    expect(hash).toBeTruthy()
    expect(hash).not.toBe(password)
    expect(hash.length).toBeGreaterThan(20) // bcrypt hashes are long
  })

  it('should create different hashes for same password', async () => {
    const password = 'MyPassword123!@#'
    const hash1 = await hashPassword(password)
    const hash2 = await hashPassword(password)

    expect(hash1).not.toBe(hash2)
  })

  it('should handle long passwords', async () => {
    const password = 'A'.repeat(100) + '1!@'
    const hash = await hashPassword(password)

    expect(hash).toBeTruthy()
  })

  it('should handle passwords with special characters', async () => {
    const password = 'P@ssw0rd!#$%^&*()'
    const hash = await hashPassword(password)

    expect(hash).toBeTruthy()
    expect(hash).not.toBe(password)
  })
})

describe('Password - comparePassword', () => {
  it('should verify correct password', async () => {
    const password = 'MyPassword123!@#'
    const hash = await hashPassword(password)

    const result = await comparePassword(password, hash)
    expect(result).toBe(true)
  })

  it('should reject incorrect password', async () => {
    const password = 'MyPassword123!@#'
    const hash = await hashPassword(password)

    const result = await comparePassword('WrongPassword123!@#', hash)
    expect(result).toBe(false)
  })

  it('should be case-sensitive', async () => {
    const password = 'MyPassword123!@#'
    const hash = await hashPassword(password)

    const result = await comparePassword('mypassword123!@#', hash)
    expect(result).toBe(false)
  })

  it('should handle empty password', async () => {
    const hash = await hashPassword('ValidPassword1!@')
    const result = await comparePassword('', hash)
    expect(result).toBe(false)
  })

  it('should handle whitespace differences', async () => {
    const password = 'MyPassword123!@#'
    const hash = await hashPassword(password)

    const result = await comparePassword(' MyPassword123!@# ', hash)
    expect(result).toBe(false) // Should not match (whitespace matters)
  })
})

describe('Password - validatePasswordStrength', () => {
  it('should accept valid password', () => {
    const result = validatePasswordStrength('MyPassword123!@#')

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should reject password shorter than 12 characters', () => {
    const result = validatePasswordStrength('MyPass1!')

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Mínimo 12 caracteres')
  })

  it('should reject password without uppercase', () => {
    const result = validatePasswordStrength('mypassword123!@#')

    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    // Check for uppercase requirement error (handles encoding issues)
    expect(result.errors.some(e => e.toLowerCase().includes('mai') && e.toLowerCase().includes('scula'))).toBe(true)
  })

  it('should reject password without number', () => {
    const result = validatePasswordStrength('MyPassword!@#$%^')

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Pelo menos 1 número')
  })

  it('should reject password without special character', () => {
    const result = validatePasswordStrength('MyPassword123ABC')

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Pelo menos 1 caractere especial')
  })

  it('should report multiple failures', () => {
    const result = validatePasswordStrength('short1')

    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(1)
    expect(result.errors.some(e => e.includes('12 caracteres'))).toBe(true)
    // Check for uppercase requirement (handles encoding issues)
    expect(result.errors.some(e => e.toLowerCase().includes('mai') && e.toLowerCase().includes('scula'))).toBe(true)
  })

  it('should accept passwords with various special characters', () => {
    const specialChars = ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '_', '+', '-', '=', '[', ']', '{', '}', ';', ':', "'", '"', '\\', '|', ',', '.', '<', '>', '/', '?']

    for (const char of specialChars) {
      const password = `MyPassword123${char}`
      const result = validatePasswordStrength(password)
      expect(result.valid, `Failed with special char: ${char}`).toBe(true)
    }
  })

  it('should accept exactly 12 character password if all requirements met', () => {
    const result = validatePasswordStrength('MyPassword1!')

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should accept long passwords', () => {
    const result = validatePasswordStrength('MyVeryLongPassword123!@#$%^&*()')

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should accept password with multiple numbers and special chars', () => {
    const result = validatePasswordStrength('MyPassword123!@#$%')

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })
})
