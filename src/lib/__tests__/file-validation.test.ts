import { describe, it, expect } from 'vitest'
import {
  validateFile,
  validateFileMagicBytes,
  hasExecutableSignatures,
  validateFileComprehensive,
  CERTIFICATE_PRESET,
  DOCUMENT_PRESET,
  IMAGE_PRESET,
} from '../security/file-validation'

describe('FileValidation - validateFile', () => {
  it('should validate file with no restrictions', () => {
    const file = new File(['content'], 'test.txt', { type: 'text/plain' })
    const result = validateFile(file)

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should reject oversized files', () => {
    const content = 'a'.repeat(15 * 1024 * 1024)
    const file = new File([content], 'large.pdf', { type: 'application/pdf' })
    const result = validateFile(file, { maxSizeMB: 10 })

    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors.some(e => e.toLowerCase().includes('exceeds') || e.toLowerCase().includes('maximum'))).toBe(true)
  })

  it('should validate file size within limit', () => {
    const content = 'x'.repeat(1024 * 1024 * 5) // 5 MB
    const file = new File([content], 'file.pdf', { type: 'application/pdf' })
    const result = validateFile(file, { maxSizeMB: 10 })

    expect(result.valid).toBe(true)
  })

  it('should validate MIME type', () => {
    const file = new File(['content'], 'file.txt', { type: 'text/plain' })
    const result = validateFile(file, {
      allowedTypes: ['application/pdf', 'application/msword'],
    })

    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors.some(e => e.toLowerCase().includes('mime') || e.toLowerCase().includes('type'))).toBe(true)
  })

  it('should accept allowed MIME type', () => {
    const file = new File(['content'], 'file.pdf', { type: 'application/pdf' })
    const result = validateFile(file, {
      allowedTypes: ['application/pdf'],
    })

    expect(result.valid).toBe(true)
  })

  it('should validate file extension', () => {
    const file = new File(['content'], 'file.exe', { type: 'application/octet-stream' })
    const result = validateFile(file, {
      allowedExtensions: ['pdf', 'doc'],
    })

    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    // Error could mention extension or not allowed
    expect(result.errors.some(e => e.toLowerCase().includes('extension') || e.toLowerCase().includes('not allowed') || e.toLowerCase().includes('dangerous'))).toBe(true)
  })

  it('should reject dangerous extensions', () => {
    const dangerousExtensions = [
      'exe', 'bat', 'cmd', 'com', 'scr', 'vbs', 'js', 'ps1', 'msi', 'dll',
    ]

    for (const ext of dangerousExtensions) {
      const file = new File(['content'], `file.${ext}`, { type: 'application/octet-stream' })
      const result = validateFile(file)

      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      // Check for dangerous or not allowed error
      expect(result.errors.some(e => e.toLowerCase().includes('not allowed') || e.toLowerCase().includes('dangerous') || e.toLowerCase().includes('extension'))).toBe(true)
    }
  })

  it('should handle buffer input', () => {
    const buffer = Buffer.from('test content')
    const result = validateFile(buffer, { maxSizeMB: 10 })

    expect(result.valid).toBe(true)
  })
})

describe('FileValidation - validateFileMagicBytes', () => {
  it('should validate PDF magic bytes', async () => {
    // PDF header: %PDF
    const pdfHeader = new Uint8Array([0x25, 0x50, 0x44, 0x46])
    const result = await validateFileMagicBytes(pdfHeader, 'pdf')

    expect(result).toBe(true)
  })

  it('should reject invalid PDF header', async () => {
    const fakeHeader = new Uint8Array([0x00, 0x00, 0x00, 0x00])
    const result = await validateFileMagicBytes(fakeHeader, 'pdf')

    expect(result).toBe(false)
  })

  it('should validate PNG magic bytes', async () => {
    // PNG header
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const result = await validateFileMagicBytes(pngHeader, 'png')

    expect(result).toBe(true)
  })

  it('should validate JPEG magic bytes', async () => {
    // JPEG header
    const jpegHeader = new Uint8Array([0xff, 0xd8, 0xff])
    const result = await validateFileMagicBytes(jpegHeader, 'jpg')

    expect(result).toBe(true)
  })

  it('should skip validation for unknown types', async () => {
    const unknownHeader = new Uint8Array([0x00, 0x00, 0x00])
    const result = await validateFileMagicBytes(unknownHeader, 'unknown')

    expect(result).toBe(true)
  })
})

describe('FileValidation - hasExecutableSignatures', () => {
  it('should detect PE executable (MZ header)', () => {
    const peHeader = new Uint8Array([0x4d, 0x5a, 0x00, 0x00])
    const result = hasExecutableSignatures(peHeader)

    expect(result).toBe(true)
  })

  it('should detect ELF executable', () => {
    const elfHeader = new Uint8Array([0x7f, 0x45, 0x4c, 0x46])
    const result = hasExecutableSignatures(elfHeader)

    expect(result).toBe(true)
  })

  it('should detect Mach-O (macOS) executable', () => {
    const machoHeader = new Uint8Array([0xfe, 0xed, 0xfa, 0xce])
    const result = hasExecutableSignatures(machoHeader)

    expect(result).toBe(true)
  })

  it('should reject non-executable files', () => {
    const textHeader = new Uint8Array([0x50, 0x4c, 0x41, 0x49])
    const result = hasExecutableSignatures(textHeader)

    expect(result).toBe(false)
  })

  it('should handle short buffers', () => {
    const shortBuffer = new Uint8Array([0x00])
    const result = hasExecutableSignatures(shortBuffer)

    expect(result).toBe(false)
  })
})

describe('FileValidation - validateFileComprehensive', () => {
  it('should validate safe PDF', async () => {
    const pdfHeader = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])
    const file = new File([Buffer.from(pdfHeader)], 'test.pdf', { type: 'application/pdf' })
    const result = await validateFileComprehensive(
      file,
      {
        maxSizeMB: 10,
        allowedExtensions: ['pdf'],
      }
    )

    expect(result.valid).toBe(true)
  })

  it('should reject files with executable signature', async () => {
    // PE executable header
    const exeHeader = Buffer.from([0x4d, 0x5a, 0x90, 0x00])
    const result = await validateFileComprehensive(exeHeader)

    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors.some(e => e.includes('executable') || e.includes('malware'))).toBe(true)
  })

  it('should validate magic bytes when extension provided', async () => {
    const pdfHeader = new Uint8Array([0x25, 0x50, 0x44, 0x46])
    const file = new File([Buffer.from(pdfHeader)], 'test.pdf', { type: 'application/pdf' })
    const result = await validateFileComprehensive(file, {
      allowedExtensions: ['pdf'],
    })

    expect(result.valid).toBe(true)
  })

  it('should detect spoofed file type', async () => {
    // JPEG header in PDF file
    const jpegHeader = new Uint8Array([0xff, 0xd8, 0xff])
    const file = new File([Buffer.from(jpegHeader)], 'fake.pdf', { type: 'application/pdf' })
    const result = await validateFileComprehensive(file, {
      allowedExtensions: ['pdf'],
    })

    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    // Check for spoofing or format mismatch error
    expect(result.errors.some(e => e.includes('match') || e.includes('format') || e.includes('spoofing'))).toBe(true)
  })
})

describe('FileValidation - Presets', () => {
  it('should have certificate preset configuration', () => {
    expect(CERTIFICATE_PRESET.maxSizeMB).toBe(5)
    expect(CERTIFICATE_PRESET.allowedTypes).toContain('application/x-pkcs12')
    expect(CERTIFICATE_PRESET.allowedExtensions).toContain('pfx')
  })

  it('should have document preset configuration', () => {
    expect(DOCUMENT_PRESET.maxSizeMB).toBe(10)
    expect(DOCUMENT_PRESET.allowedTypes).toContain('application/pdf')
    expect(DOCUMENT_PRESET.allowedExtensions).toContain('pdf')
  })

  it('should have image preset configuration', () => {
    expect(IMAGE_PRESET.maxSizeMB).toBe(5)
    expect(IMAGE_PRESET.allowedTypes).toContain('image/jpeg')
    expect(IMAGE_PRESET.allowedExtensions).toContain('jpg')
  })

  it('should validate file with certificate preset', () => {
    const file = new File(['content'], 'cert.pfx', { type: 'application/x-pkcs12' })
    const result = validateFile(file, CERTIFICATE_PRESET)

    expect(result.valid).toBe(true)
  })

  it('should reject oversized certificate', () => {
    const largeContent = new Array(6 * 1024 * 1024).fill('a').join('')
    const file = new File([largeContent], 'cert.pfx', { type: 'application/x-pkcs12' })
    const result = validateFile(file, CERTIFICATE_PRESET)

    expect(result.valid).toBe(false)
  })
})

describe('FileValidation - Edge Cases', () => {
  it('should handle empty files', () => {
    const file = new File([], 'empty.txt')
    const result = validateFile(file)

    expect(result.valid).toBe(true)
  })

  it('should handle files with no extension', () => {
    const file = new File(['content'], 'noextension')
    const result = validateFile(file, {
      allowedExtensions: ['txt'],
    })

    expect(result.valid).toBe(false)
  })

  it('should handle files with multiple dots in name', () => {
    const file = new File(['content'], 'file.backup.pdf', { type: 'application/pdf' })
    const result = validateFile(file, {
      allowedExtensions: ['pdf'],
    })

    expect(result.valid).toBe(true)
  })

  it('should be case-insensitive for extensions', () => {
    const file = new File(['content'], 'FILE.PDF', { type: 'application/pdf' })
    const result = validateFile(file, {
      allowedExtensions: ['pdf'],
    })

    expect(result.valid).toBe(true)
  })
})
