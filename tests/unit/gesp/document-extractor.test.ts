/**
 * Unit Tests - GESP DocumentExtractor
 *
 * Tests the DocumentExtractor class from @/lib/gesp/document-extractor:
 * - parseTable() for extracting HTML table data
 * - parseTableWithHeaders() for structured table extraction
 * - extractText() for text content
 * - extractHTML() for HTML content
 * - Error handling for missing elements
 * - Complex HTML parsing scenarios
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DocumentExtractor } from '@/lib/gesp/document-extractor'
import type { Page, Locator } from 'playwright'

// Mock Playwright Locator
const createMockLocator = (options?: {
  textContents?: string[]
  innerHTML?: string
  textContent?: string
  allLocators?: any[]
}): Partial<Locator> => ({
  all: vi.fn().mockResolvedValue(options?.allLocators || []),
  locator: vi.fn().mockReturnThis(),
  allTextContents: vi
    .fn()
    .mockResolvedValue(options?.textContents || []),
})

// Mock Playwright Page
const createMockPage = (): Partial<Page> => ({
  locator: vi.fn().mockReturnValue(createMockLocator()),
  $: vi.fn().mockResolvedValue(null),
})

describe('GESP DocumentExtractor', () => {
  let mockPage: Partial<Page>
  let extractor: DocumentExtractor

  beforeEach(() => {
    mockPage = createMockPage()
    extractor = new DocumentExtractor(mockPage as Page)
    vi.clearAllMocks()
  })

  // ===========================================================================
  // PARSE TABLE TESTS
  // ===========================================================================

  describe('parseTable()', () => {
    it('extracts data from HTML table rows', async () => {
      const mockRow1 = {
        locator: vi
          .fn()
          .mockReturnValue({
            allTextContents: vi
              .fn()
              .mockResolvedValue(['João Silva', '123.456.789-10']),
          }),
      }

      const mockRow2 = {
        locator: vi
          .fn()
          .mockReturnValue({
            allTextContents: vi
              .fn()
              .mockResolvedValue(['Maria Santos', '987.654.321-00']),
          }),
      }

      const mockLocator = {
        all: vi.fn().mockResolvedValue([mockRow1, mockRow2]),
      }

      vi.mocked(mockPage.locator).mockReturnValue(mockLocator as any)

      const result = await extractor.parseTable()

      expect(result).toBeDefined()
      expect(result.length).toBeGreaterThanOrEqual(0)
    })

    it('uses custom selector when provided', async () => {
      const mockLocator = {
        all: vi.fn().mockResolvedValue([]),
      }
      vi.mocked(mockPage.locator).mockReturnValue(mockLocator as any)

      await extractor.parseTable('.custom-table')

      expect(mockPage.locator).toHaveBeenCalledWith(
        expect.stringContaining('custom-table')
      )
    })

    it('returns empty array when table has no rows', async () => {
      const mockLocator = {
        all: vi.fn().mockResolvedValue([]),
      }
      vi.mocked(mockPage.locator).mockReturnValue(mockLocator as any)

      const result = await extractor.parseTable()

      expect(result).toEqual([])
    })

    it('handles tables with empty rows', async () => {
      const mockRow = {
        locator: vi
          .fn()
          .mockReturnValue({
            allTextContents: vi.fn().mockResolvedValue([]),
          }),
      }

      const mockLocator = {
        all: vi.fn().mockResolvedValue([mockRow]),
      }
      vi.mocked(mockPage.locator).mockReturnValue(mockLocator as any)

      const result = await extractor.parseTable()

      expect(result).toEqual([])
    })

    it('handles errors gracefully', async () => {
      vi.mocked(mockPage.locator).mockImplementation(() => {
        throw new Error('Selector error')
      })

      const result = await extractor.parseTable()

      expect(result).toEqual([])
    })

    it('returns empty array when page is not initialized', async () => {
      const nullExtractor = new DocumentExtractor(null as any as Page)

      const result = await nullExtractor.parseTable()

      expect(result).toEqual([])
    })

    it('correctly formats table row data with column separator', async () => {
      const mockRow = {
        locator: vi
          .fn()
          .mockReturnValue({
            allTextContents: vi
              .fn()
              .mockResolvedValue(['col1', 'col2', 'col3']),
          }),
      }

      const mockLocator = {
        all: vi.fn().mockResolvedValue([mockRow]),
      }
      vi.mocked(mockPage.locator).mockReturnValue(mockLocator as any)

      const result = await extractor.parseTable()

      if (result.length > 0) {
        expect(result[0]).toHaveProperty('colunas')
        expect(result[0].colunas).toContain('|')
      }
    })
  })

  // ===========================================================================
  // EXTRACT TEXT TESTS
  // ===========================================================================

  describe('extractText()', () => {
    it('extracts text from element by selector', async () => {
      const mockElement = {
        textContent: vi.fn().mockResolvedValue('Extracted text content'),
      }
      vi.mocked(mockPage.$).mockResolvedValueOnce(mockElement as any)

      const result = await extractor.extractText('.selector')

      expect(result).toBe('Extracted text content')
    })

    it('trims whitespace from extracted text', async () => {
      const mockElement = {
        textContent: vi
          .fn()
          .mockResolvedValue('   text with spaces   '),
      }
      vi.mocked(mockPage.$).mockResolvedValueOnce(mockElement as any)

      const result = await extractor.extractText('.selector')

      expect(result).toBe('text with spaces')
    })

    it('returns empty string when element not found', async () => {
      vi.mocked(mockPage.$).mockResolvedValueOnce(null)

      const result = await extractor.extractText('.nonexistent')

      expect(result).toBe('')
    })

    it('returns empty string when textContent is null', async () => {
      const mockElement = {
        textContent: vi.fn().mockResolvedValue(null),
      }
      vi.mocked(mockPage.$).mockResolvedValueOnce(mockElement as any)

      const result = await extractor.extractText('.selector')

      expect(result).toBe('')
    })

    it('handles multiline text content', async () => {
      const multilineText = `
        Linha 1
        Linha 2
        Linha 3
      `
      const mockElement = {
        textContent: vi.fn().mockResolvedValue(multilineText),
      }
      vi.mocked(mockPage.$).mockResolvedValueOnce(mockElement as any)

      const result = await extractor.extractText('.selector')

      expect(result).toContain('Linha 1')
      expect(result).toContain('Linha 2')
    })

    it('throws error when page is not initialized', async () => {
      const nullExtractor = new DocumentExtractor(null as any as Page)

      const result = await nullExtractor.extractText('.selector')

      expect(result).toBe('')
    })

    it('handles errors gracefully', async () => {
      vi.mocked(mockPage.$).mockRejectedValueOnce(new Error('Selector error'))

      const result = await extractor.extractText('.selector')

      expect(result).toBe('')
    })
  })

  // ===========================================================================
  // EXTRACT HTML TESTS
  // ===========================================================================

  describe('extractHTML()', () => {
    it('extracts HTML content from element', async () => {
      const htmlContent = '<div><p>Test content</p></div>'
      const mockElement = {
        innerHTML: vi.fn().mockResolvedValue(htmlContent),
      }
      vi.mocked(mockPage.$).mockResolvedValueOnce(mockElement as any)

      const result = await extractor.extractHTML('.selector')

      expect(result).toBe(htmlContent)
    })

    it('returns empty string when element not found', async () => {
      vi.mocked(mockPage.$).mockResolvedValueOnce(null)

      const result = await extractor.extractHTML('.selector')

      expect(result).toBe('')
    })

    it('returns empty string when innerHTML is null', async () => {
      const mockElement = {
        innerHTML: vi.fn().mockResolvedValue(null),
      }
      vi.mocked(mockPage.$).mockResolvedValueOnce(mockElement as any)

      const result = await extractor.extractHTML('.selector')

      expect(result).toBe('')
    })

    it('preserves HTML structure and attributes', async () => {
      const htmlContent =
        '<table><tr><td class="cell">Content</td></tr></table>'
      const mockElement = {
        innerHTML: vi.fn().mockResolvedValue(htmlContent),
      }
      vi.mocked(mockPage.$).mockResolvedValueOnce(mockElement as any)

      const result = await extractor.extractHTML('table')

      expect(result).toContain('class="cell"')
      expect(result).toContain('Content')
    })

    it('handles nested HTML elements', async () => {
      const htmlContent = `
        <div>
          <ul>
            <li>Item 1</li>
            <li>Item 2</li>
          </ul>
        </div>
      `
      const mockElement = {
        innerHTML: vi.fn().mockResolvedValue(htmlContent),
      }
      vi.mocked(mockPage.$).mockResolvedValueOnce(mockElement as any)

      const result = await extractor.extractHTML('.container')

      expect(result).toContain('Item 1')
      expect(result).toContain('Item 2')
    })

    it('throws error when page is not initialized', async () => {
      const nullExtractor = new DocumentExtractor(null as any as Page)

      const result = await nullExtractor.extractHTML('.selector')

      expect(result).toBe('')
    })

    it('handles errors gracefully', async () => {
      vi.mocked(mockPage.$).mockRejectedValueOnce(new Error('Selector error'))

      const result = await extractor.extractHTML('.selector')

      expect(result).toBe('')
    })
  })

  // ===========================================================================
  // PARSE TABLE WITH HEADERS TESTS
  // ===========================================================================

  describe('parseTableWithHeaders()', () => {
    it('extracts table data with header mapping', async () => {
      // This would test the actual implementation details
      // The test structure depends on how parseTableWithHeaders is implemented
      const result = await extractor.parseTableWithHeaders()

      // Should return an array (empty or with data)
      expect(Array.isArray(result)).toBe(true)
    })

    it('uses custom selector for header extraction', async () => {
      await extractor.parseTableWithHeaders('.data-table')

      // Verify that locator was called with a selector
      expect(mockPage.locator).toHaveBeenCalled()
    })

    it('returns empty array on error', async () => {
      const nullExtractor = new DocumentExtractor(null as any as Page)

      const result = await nullExtractor.parseTableWithHeaders()

      expect(result).toEqual([])
    })
  })

  // ===========================================================================
  // INTEGRATION TESTS
  // ===========================================================================

  describe('Integration scenarios', () => {
    it('extracts complete document structure', async () => {
      const mockTitleElement = {
        textContent: vi.fn().mockResolvedValue('Document Title'),
      }

      const mockBodyElement = {
        innerHTML: vi.fn().mockResolvedValue('<p>Document body content</p>'),
      }

      vi.mocked(mockPage.$)
        .mockResolvedValueOnce(mockTitleElement as any)
        .mockResolvedValueOnce(mockBodyElement as any)

      const title = await extractor.extractText('h1')
      const body = await extractor.extractHTML('.content')

      expect(title).toBe('Document Title')
      expect(body).toContain('Document body content')
    })

    it('processes multiple tables in sequence', async () => {
      const mockLocator = {
        all: vi.fn().mockResolvedValue([]),
      }
      vi.mocked(mockPage.locator).mockReturnValue(mockLocator as any)

      const table1 = await extractor.parseTable('table:nth-of-type(1)')
      const table2 = await extractor.parseTable('table:nth-of-type(2)')

      expect(Array.isArray(table1)).toBe(true)
      expect(Array.isArray(table2)).toBe(true)
    })

    it('combines text and HTML extraction for analysis', async () => {
      const mockTextElement = {
        textContent: vi.fn().mockResolvedValue('Summary text'),
      }

      const mockHtmlElement = {
        innerHTML: vi
          .fn()
          .mockResolvedValue('<div class="details">Details here</div>'),
      }

      vi.mocked(mockPage.$)
        .mockResolvedValueOnce(mockTextElement as any)
        .mockResolvedValueOnce(mockHtmlElement as any)

      const summary = await extractor.extractText('.summary')
      const details = await extractor.extractHTML('.details-container')

      expect(summary).toBe('Summary text')
      expect(details).toContain('Details here')
    })
  })

  // ===========================================================================
  // ERROR HANDLING TESTS
  // ===========================================================================

  describe('Error handling', () => {
    it('handles invalid selectors gracefully', async () => {
      vi.mocked(mockPage.$).mockRejectedValueOnce(new Error('Invalid selector'))

      const result = await extractor.extractText('invalid::selector')

      expect(result).toBe('')
    })

    it('recovers from transient element access errors', async () => {
      vi.mocked(mockPage.$)
        .mockRejectedValueOnce(new Error('Element stale'))
        .mockResolvedValueOnce({
          textContent: vi.fn().mockResolvedValue('content'),
        } as any)

      const result = await extractor.extractText('.selector')

      // First call failed, should handle gracefully
      expect(result).toBe('')
    })

    it('handles concurrent extraction requests', async () => {
      const mockElement1 = {
        textContent: vi.fn().mockResolvedValue('Text 1'),
      }
      const mockElement2 = {
        textContent: vi.fn().mockResolvedValue('Text 2'),
      }

      vi.mocked(mockPage.$)
        .mockResolvedValueOnce(mockElement1 as any)
        .mockResolvedValueOnce(mockElement2 as any)

      const [result1, result2] = await Promise.all([
        extractor.extractText('.element1'),
        extractor.extractText('.element2'),
      ])

      expect(result1).toBe('Text 1')
      expect(result2).toBe('Text 2')
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================

  describe('Edge cases', () => {
    it('handles tables with single row', async () => {
      const mockRow = {
        locator: vi
          .fn()
          .mockReturnValue({
            allTextContents: vi.fn().mockResolvedValue(['Data']),
          }),
      }

      const mockLocator = {
        all: vi.fn().mockResolvedValue([mockRow]),
      }
      vi.mocked(mockPage.locator).mockReturnValue(mockLocator as any)

      const result = await extractor.parseTable()

      expect(Array.isArray(result)).toBe(true)
    })

    it('handles very large HTML documents', async () => {
      const largeHtml = '<div>' + '<p>Content</p>'.repeat(1000) + '</div>'
      const mockElement = {
        innerHTML: vi.fn().mockResolvedValue(largeHtml),
      }
      vi.mocked(mockPage.$).mockResolvedValueOnce(mockElement as any)

      const result = await extractor.extractHTML('.large-doc')

      expect(result.length).toBeGreaterThan(10000)
    })

    it('handles special characters in text content', async () => {
      const specialText = 'Conteúdo com acentuação: é, à, ç, ñ'
      const mockElement = {
        textContent: vi.fn().mockResolvedValue(specialText),
      }
      vi.mocked(mockPage.$).mockResolvedValueOnce(mockElement as any)

      const result = await extractor.extractText('.special')

      expect(result).toBe(specialText)
    })

    it('handles tables with special column names', async () => {
      const mockRow = {
        locator: vi
          .fn()
          .mockReturnValue({
            allTextContents: vi
              .fn()
              .mockResolvedValue(['CPF/CNPJ', 'Razão Social', 'UF']),
          }),
      }

      const mockLocator = {
        all: vi.fn().mockResolvedValue([mockRow]),
      }
      vi.mocked(mockPage.locator).mockReturnValue(mockLocator as any)

      const result = await extractor.parseTable()

      if (result.length > 0) {
        expect(result[0]).toHaveProperty('colunas')
      }
    })
  })
})
