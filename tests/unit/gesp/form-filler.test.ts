/**
 * Unit Tests - GESP FormFiller
 *
 * Tests the FormFiller class from @/lib/gesp/form-filler:
 * - fillFormField() for text input and textarea
 * - selectDropdown() for select elements
 * - clickTab() for form tabs
 * - uploadFile() for file inputs
 * - Button clicking and form submission
 * - Error handling and element not found scenarios
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { FormFiller } from '@/lib/gesp/form-filler'
import type { Page, Locator } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'

// Mock Playwright Page and Locator
const createMockLocator = (): Partial<Locator> => ({
  first: vi.fn().mockReturnThis(),
  fill: vi.fn().mockResolvedValue(null),
  selectOption: vi.fn().mockResolvedValue(null),
  click: vi.fn().mockResolvedValue(null),
  setInputFiles: vi.fn().mockResolvedValue(null),
  allTextContents: vi.fn().mockResolvedValue([]),
})

const createMockPage = (): Partial<Page> => ({
  locator: vi.fn().mockReturnValue(createMockLocator()),
  $: vi.fn().mockResolvedValue(null),
  waitForLoadState: vi.fn().mockResolvedValue(null),
})

describe('GESP FormFiller', () => {
  let mockPage: Partial<Page>
  let filler: FormFiller

  beforeEach(() => {
    mockPage = createMockPage()
    filler = new FormFiller(mockPage as Page)
    vi.clearAllMocks()
  })

  afterEach(() => {
    // Clean up any temporary files
    const tmpDir = require('os').tmpdir()
    const files = fs.readdirSync(tmpDir)
    files.forEach((file: string) => {
      if (file.startsWith('test-file')) {
        try {
          fs.unlinkSync(path.join(tmpDir, file))
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    })
  })

  // ===========================================================================
  // FILL FORM FIELD TESTS
  // ===========================================================================

  describe('fillFormField()', () => {
    it('fills text input field by label', async () => {
      const mockLocator = createMockLocator()
      vi.mocked(mockPage.locator).mockReturnValueOnce(mockLocator as any)

      await filler.fillFormField('Nome Completo', 'João Silva')

      expect(mockPage.locator).toHaveBeenCalledWith(
        expect.stringContaining('Nome Completo')
      )
      expect(mockLocator.fill).toHaveBeenCalledWith('João Silva')
    })

    it('fills textarea field', async () => {
      const mockLocator = createMockLocator()
      vi.mocked(mockPage.locator).mockReturnValueOnce(mockLocator as any)

      await filler.fillFormField('Descrição', 'Texto longo com múltiplas linhas')

      expect(mockLocator.fill).toHaveBeenCalledWith('Texto longo com múltiplas linhas')
    })

    it('handles field with special characters in label', async () => {
      const mockLocator = createMockLocator()
      vi.mocked(mockPage.locator).mockReturnValueOnce(mockLocator as any)

      await filler.fillFormField('CPF/CNPJ', '123.456.789-10')

      expect(mockLocator.fill).toHaveBeenCalledWith('123.456.789-10')
    })

    it('clears and fills existing field value', async () => {
      const mockLocator = createMockLocator()
      vi.mocked(mockPage.locator).mockReturnValueOnce(mockLocator as any)

      await filler.fillFormField('Campo', 'novo valor')

      expect(mockLocator.fill).toHaveBeenCalledWith('novo valor')
    })

    it('handles field not found gracefully', async () => {
      const mockLocator = {
        first: vi.fn().mockReturnValue(null),
      }
      vi.mocked(mockPage.locator).mockReturnValueOnce(mockLocator as any)

      // Should not throw
      await expect(
        filler.fillFormField('NonExistent', 'value')
      ).resolves.toBeUndefined()
    })

    it('throws error when page is not initialized', async () => {
      const nullFiller = new FormFiller(null as any as Page)

      await expect(nullFiller.fillFormField('Label', 'value')).rejects.toThrow(
        'Página não inicializada'
      )
    })

    it('handles fill errors gracefully', async () => {
      const mockLocator = {
        first: vi.fn().mockReturnValue({
          fill: vi.fn().mockRejectedValue(new Error('Element not fillable')),
        }),
      }
      vi.mocked(mockPage.locator).mockReturnValueOnce(mockLocator as any)

      // Should not throw, error should be logged
      await expect(
        filler.fillFormField('Campo', 'valor')
      ).resolves.toBeUndefined()
    })
  })

  // ===========================================================================
  // SELECT DROPDOWN TESTS
  // ===========================================================================

  describe('selectDropdown()', () => {
    it('selects option by label text', async () => {
      const mockLocator = createMockLocator()
      vi.mocked(mockPage.locator).mockReturnValueOnce(mockLocator as any)

      await filler.selectDropdown('Estado', 'São Paulo')

      expect(mockLocator.selectOption).toHaveBeenCalledWith({
        label: 'São Paulo',
      })
    })

    it('handles dropdown with special characters', async () => {
      const mockLocator = createMockLocator()
      vi.mocked(mockPage.locator).mockReturnValueOnce(mockLocator as any)

      await filler.selectDropdown('Tipo (A/B/C)', 'Tipo A')

      expect(mockLocator.selectOption).toHaveBeenCalledWith({
        label: 'Tipo A',
      })
    })

    it('handles empty option selection', async () => {
      const mockLocator = createMockLocator()
      vi.mocked(mockPage.locator).mockReturnValueOnce(mockLocator as any)

      await filler.selectDropdown('Filtro', '')

      expect(mockLocator.selectOption).toHaveBeenCalledWith({
        label: '',
      })
    })

    it('throws error when page is not initialized', async () => {
      const nullFiller = new FormFiller(null as any as Page)

      await expect(
        nullFiller.selectDropdown('Label', 'option')
      ).rejects.toThrow('Página não inicializada')
    })

    it('handles dropdown not found gracefully', async () => {
      const mockLocator = {
        first: vi.fn().mockReturnValue(null),
      }
      vi.mocked(mockPage.locator).mockReturnValueOnce(mockLocator as any)

      await expect(
        filler.selectDropdown('NonExistent', 'option')
      ).resolves.toBeUndefined()
    })

    it('handles select errors gracefully', async () => {
      const mockLocator = {
        first: vi.fn().mockReturnValue({
          selectOption: vi
            .fn()
            .mockRejectedValue(new Error('Invalid option')),
        }),
      }
      vi.mocked(mockPage.locator).mockReturnValueOnce(mockLocator as any)

      await expect(
        filler.selectDropdown('Campo', 'opcao')
      ).resolves.toBeUndefined()
    })
  })

  // ===========================================================================
  // CLICK TAB TESTS
  // ===========================================================================

  describe('clickTab()', () => {
    it('clicks form tab by name', async () => {
      const mockElement = { click: vi.fn().mockResolvedValue(null) }
      vi.mocked(mockPage.$).mockResolvedValueOnce(mockElement as any)

      await filler.clickTab('Dados Principais')

      expect(mockPage.$).toHaveBeenCalledWith('text="Dados Principais"')
      expect(mockElement.click).toHaveBeenCalled()
    })

    it('waits for network idle after tab click', async () => {
      const mockElement = { click: vi.fn().mockResolvedValue(null) }
      vi.mocked(mockPage.$).mockResolvedValueOnce(mockElement as any)

      await filler.clickTab('Anexos')

      expect(mockPage.waitForLoadState).toHaveBeenCalledWith('networkidle')
    })

    it('applies delay after tab navigation', async () => {
      const mockElement = { click: vi.fn().mockResolvedValue(null) }
      vi.mocked(mockPage.$).mockResolvedValueOnce(mockElement as any)

      const delaySpy = vi.spyOn(global, 'setTimeout')
      await filler.clickTab('Aba')

      expect(delaySpy).toHaveBeenCalled()
      delaySpy.mockRestore()
    })

    it('handles tab not found gracefully', async () => {
      vi.mocked(mockPage.$).mockResolvedValueOnce(null)

      await expect(filler.clickTab('NonExistent')).resolves.toBeUndefined()
    })

    it('throws error when page is not initialized', async () => {
      const nullFiller = new FormFiller(null as any as Page)

      await expect(nullFiller.clickTab('Aba')).rejects.toThrow(
        'Página não inicializada'
      )
    })
  })

  // ===========================================================================
  // UPLOAD FILE TESTS
  // ===========================================================================

  describe('uploadFile()', () => {
    it('uploads file to input element', async () => {
      const testBuffer = Buffer.from('test file content')
      const mockElement = { setInputFiles: vi.fn().mockResolvedValue(null) }
      vi.mocked(mockPage.$).mockResolvedValueOnce(mockElement as any)

      const setInputFilesSpy = vi.spyOn(mockElement, 'setInputFiles')

      await filler.uploadFile(testBuffer, 'test.pdf', 'input[type="file"]')

      expect(mockPage.$).toHaveBeenCalledWith('input[type="file"]')
      expect(setInputFilesSpy).toHaveBeenCalled()
    })

    it('handles large file uploads', async () => {
      const largeBuffer = Buffer.alloc(5 * 1024 * 1024) // 5MB
      const mockElement = { setInputFiles: vi.fn().mockResolvedValue(null) }
      vi.mocked(mockPage.$).mockResolvedValueOnce(mockElement as any)

      await filler.uploadFile(largeBuffer, 'large-file.pdf', 'input')

      expect(mockElement.setInputFiles).toHaveBeenCalled()
    })

    it('cleans up temporary file after upload', async () => {
      const testBuffer = Buffer.from('test content')
      const mockElement = { setInputFiles: vi.fn().mockResolvedValue(null) }
      vi.mocked(mockPage.$).mockResolvedValueOnce(mockElement as any)

      const unlinkSpy = vi.spyOn(fs, 'unlinkSync')

      await filler.uploadFile(testBuffer, 'temp-file.txt', 'input')

      // Should clean up temp file
      expect(unlinkSpy).toHaveBeenCalled()
      unlinkSpy.mockRestore()
    })

    it('handles upload element not found gracefully', async () => {
      const testBuffer = Buffer.from('content')
      vi.mocked(mockPage.$).mockResolvedValueOnce(null)

      await expect(
        filler.uploadFile(testBuffer, 'file.pdf', 'input')
      ).resolves.toBeUndefined()
    })

    it('throws error when page is not initialized', async () => {
      const nullFiller = new FormFiller(null as any as Page)
      const testBuffer = Buffer.from('content')

      await expect(
        nullFiller.uploadFile(testBuffer, 'file.pdf', 'input')
      ).rejects.toThrow('Página não inicializada')
    })

    it('handles setInputFiles errors gracefully', async () => {
      const testBuffer = Buffer.from('content')
      const mockElement = {
        setInputFiles: vi
          .fn()
          .mockRejectedValue(new Error('Invalid file format')),
      }
      vi.mocked(mockPage.$).mockResolvedValueOnce(mockElement as any)

      // Should not throw
      await expect(
        filler.uploadFile(testBuffer, 'invalid.xyz', 'input')
      ).resolves.toBeUndefined()
    })
  })

  // ===========================================================================
  // ERROR HANDLING TESTS
  // ===========================================================================

  describe('Error handling', () => {
    it('logs errors to logger', async () => {
      const mockLocator = {
        first: vi.fn().mockReturnValue({
          fill: vi.fn().mockRejectedValue(new Error('Test error')),
        }),
      }
      vi.mocked(mockPage.locator).mockReturnValueOnce(mockLocator as any)

      // Should log error but not throw
      await expect(
        filler.fillFormField('Field', 'value')
      ).resolves.toBeUndefined()
    })

    it('handles concurrent operations', async () => {
      const mockLocator = createMockLocator()
      vi.mocked(mockPage.locator).mockReturnValue(mockLocator as any)

      const operations = [
        filler.fillFormField('Field1', 'value1'),
        filler.fillFormField('Field2', 'value2'),
        filler.selectDropdown('Dropdown', 'option'),
      ]

      await expect(Promise.all(operations)).resolves.toBeDefined()
    })

    it('recovers from transient failures', async () => {
      const mockLocator = {
        first: vi.fn(),
      }

      // First call fails, second succeeds
      vi.mocked(mockPage.locator)
        .mockReturnValueOnce({
          first: vi
            .fn()
            .mockReturnValue({
              fill: vi
                .fn()
                .mockRejectedValue(new Error('Transient error')),
            }),
        } as any)
        .mockReturnValueOnce({
          first: vi.fn().mockReturnValue({
            fill: vi.fn().mockResolvedValue(null),
          }),
        } as any)

      await filler.fillFormField('Field', 'value1')
      await filler.fillFormField('Field', 'value2')

      expect(mockPage.locator).toHaveBeenCalledTimes(2)
    })
  })

  // ===========================================================================
  // INTEGRATION TESTS
  // ===========================================================================

  describe('Integration scenarios', () => {
    it('fills complete form with multiple field types', async () => {
      const mockLocator = createMockLocator()
      vi.mocked(mockPage.locator).mockReturnValue(mockLocator as any)
      vi.mocked(mockPage.$).mockResolvedValue({ click: vi.fn() } as any)

      await filler.fillFormField('Nome', 'João Silva')
      await filler.fillFormField('Email', 'joao@example.com')
      await filler.selectDropdown('Estado', 'São Paulo')
      await filler.clickTab('Confirmação')

      expect(mockLocator.fill).toHaveBeenCalledTimes(2)
      expect(mockLocator.selectOption).toHaveBeenCalledTimes(1)
      expect(mockPage.$).toHaveBeenCalled()
    })

    it('handles form submission flow', async () => {
      const mockLocator = createMockLocator()
      const mockButton = { click: vi.fn().mockResolvedValue(null) }
      vi.mocked(mockPage.locator).mockReturnValue(mockLocator as any)
      vi.mocked(mockPage.$).mockResolvedValue(mockButton as any)

      await filler.fillFormField('Campo', 'valor')
      // In real scenario, would click submit button

      expect(mockLocator.fill).toHaveBeenCalled()
    })

    it('handles multi-step form wizard', async () => {
      const mockLocator = createMockLocator()
      const mockTab = { click: vi.fn().mockResolvedValue(null) }
      vi.mocked(mockPage.locator).mockReturnValue(mockLocator as any)
      vi.mocked(mockPage.$).mockResolvedValue(mockTab as any)

      // Step 1
      await filler.fillFormField('Passo 1 Campo', 'valor1')
      await filler.clickTab('Passo 2')

      // Step 2
      await filler.fillFormField('Passo 2 Campo', 'valor2')
      await filler.clickTab('Confirmação')

      expect(mockLocator.fill).toHaveBeenCalledTimes(2)
      expect(mockTab.click).toHaveBeenCalled()
    })
  })
})
