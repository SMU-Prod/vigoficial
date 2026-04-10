/**
 * Unit Tests - GESP PageNavigator
 *
 * Tests the PageNavigator class from @/lib/gesp/page-navigator:
 * - delay() function behavior
 * - Navigation methods (navigateToGesp, navigateMenu, verifyLoggedIn, etc.)
 * - Error handling and retries
 * - Page state management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PageNavigator, delay } from '@/lib/gesp/page-navigator'
import type { Page } from 'playwright'

// Mock Playwright Page
const createMockPage = (): Partial<Page> => ({
  goto: vi.fn().mockResolvedValue(null),
  url: vi.fn().mockReturnValue('https://servicos.dpf.gov.br/gesp/'),
  $: vi.fn().mockResolvedValue(null),
  waitForLoadState: vi.fn().mockResolvedValue(null),
  click: vi.fn().mockResolvedValue(null),
})

describe('GESP PageNavigator', () => {
  let mockPage: Partial<Page>
  let navigator: PageNavigator

  beforeEach(() => {
    mockPage = createMockPage()
    navigator = new PageNavigator(mockPage as Page)
  })

  // ===========================================================================
  // DELAY FUNCTION TESTS
  // ===========================================================================

  describe('delay() function', () => {
    it('returns a promise that resolves', async () => {
      const result = delay(100)
      expect(result).toBeInstanceOf(Promise)
      await expect(result).resolves.toBeUndefined()
    })

    it('resolves with specified milliseconds', async () => {
      const startTime = Date.now()
      await delay(50)
      const elapsed = Date.now() - startTime
      expect(elapsed).toBeGreaterThanOrEqual(40) // Allow 10ms margin
    })

    it('uses random delay when no parameter provided', async () => {
      const startTime = Date.now()
      await delay()
      const elapsed = Date.now() - startTime
      // Random delay is between 1500 and 4000ms
      expect(elapsed).toBeGreaterThanOrEqual(1400)
      expect(elapsed).toBeLessThan(4100)
    })

    it('handles zero milliseconds', async () => {
      const startTime = Date.now()
      await delay(0)
      const elapsed = Date.now() - startTime
      expect(elapsed).toBeLessThan(50)
    })
  })

  // ===========================================================================
  // PAGE NAVIGATION TESTS
  // ===========================================================================

  describe('navigateToGesp()', () => {
    it('navigates to GESP URL with networkidle wait', async () => {
      await navigator.navigateToGesp()

      expect(mockPage.goto).toHaveBeenCalledWith(
        expect.stringContaining('servicos.dpf.gov.br/gesp/'),
        expect.objectContaining({
          waitUntil: 'networkidle',
          timeout: 45000,
        })
      )
    })

    it('applies delay after navigation', async () => {
      const delaySpy = vi.spyOn(global, 'setTimeout')
      await navigator.navigateToGesp()

      expect(delaySpy).toHaveBeenCalled()
      delaySpy.mockRestore()
    })

    it('throws error when page is not initialized', async () => {
      const nullNavigator = new PageNavigator(null as any as Page)

      await expect(nullNavigator.navigateToGesp()).rejects.toThrow(
        'Página não inicializada'
      )
    })

    it('propagates network errors', async () => {
      const gotoError = new Error('Network timeout')
      vi.mocked(mockPage.goto).mockRejectedValueOnce(gotoError)

      await expect(navigator.navigateToGesp()).rejects.toThrow('Network timeout')
    })
  })

  // ===========================================================================
  // CURRENT URL TESTS
  // ===========================================================================

  describe('getCurrentUrl()', () => {
    it('returns current page URL', () => {
      const testUrl = 'https://servicos.dpf.gov.br/gesp/empresa'
      vi.mocked(mockPage.url).mockReturnValueOnce(testUrl)

      const url = navigator.getCurrentUrl()
      expect(url).toBe(testUrl)
    })

    it('returns empty string when page is not initialized', () => {
      const nullNavigator = new PageNavigator(null as any as Page)

      const url = nullNavigator.getCurrentUrl()
      expect(url).toBe('')
    })

    it('handles page URL changes', () => {
      vi.mocked(mockPage.url)
        .mockReturnValueOnce('https://servicos.dpf.gov.br/gesp/inicio')
        .mockReturnValueOnce('https://servicos.dpf.gov.br/gesp/empresa')

      expect(navigator.getCurrentUrl()).toBe('https://servicos.dpf.gov.br/gesp/inicio')
      expect(navigator.getCurrentUrl()).toBe('https://servicos.dpf.gov.br/gesp/empresa')
    })
  })

  // ===========================================================================
  // LOGIN VERIFICATION TESTS
  // ===========================================================================

  describe('verifyLoggedIn()', () => {
    it('returns true when menu elements are found', async () => {
      const mockElement = { click: vi.fn() }
      vi.mocked(mockPage.$).mockResolvedValueOnce(mockElement as any)

      const isLoggedIn = await navigator.verifyLoggedIn()
      expect(isLoggedIn).toBe(true)
    })

    it('returns true when user info element is found', async () => {
      vi.mocked(mockPage.$)
        .mockResolvedValueOnce(null) // First call returns null
        .mockResolvedValueOnce({ click: vi.fn() } as any) // Second call returns user info

      const isLoggedIn = await navigator.verifyLoggedIn()
      expect(isLoggedIn).toBe(true)
    })

    it('returns false when no authentication elements found', async () => {
      vi.mocked(mockPage.$).mockResolvedValue(null)

      const isLoggedIn = await navigator.verifyLoggedIn()
      expect(isLoggedIn).toBe(false)
    })

    it('returns false when page is not initialized', async () => {
      const nullNavigator = new PageNavigator(null as any as Page)

      const isLoggedIn = await nullNavigator.verifyLoggedIn()
      expect(isLoggedIn).toBe(false)
    })

    it('waits for network idle before verification', async () => {
      await navigator.verifyLoggedIn()

      expect(mockPage.waitForLoadState).toHaveBeenCalledWith('networkidle')
    })

    it('handles errors gracefully', async () => {
      vi.mocked(mockPage.waitForLoadState).mockRejectedValueOnce(
        new Error('Timeout')
      )

      const isLoggedIn = await navigator.verifyLoggedIn()
      expect(isLoggedIn).toBe(false)
    })
  })

  // ===========================================================================
  // MENU NAVIGATION TESTS
  // ===========================================================================

  describe('navigateMenu()', () => {
    it('clicks menu button and sub-item in sequence', async () => {
      const mockMenuBtn = { click: vi.fn().mockResolvedValue(null) }
      const mockSubBtn = { click: vi.fn().mockResolvedValue(null) }

      vi.mocked(mockPage.$)
        .mockResolvedValueOnce(mockMenuBtn as any) // Menu button
        .mockResolvedValueOnce(mockSubBtn as any) // Sub-item button

      await navigator.navigateMenu('Empresa', 'Dados da Empresa')

      expect(mockMenuBtn.click).toHaveBeenCalled()
      expect(mockSubBtn.click).toHaveBeenCalled()
    })

    it('waits for network idle after clicking sub-item', async () => {
      const mockBtn = { click: vi.fn().mockResolvedValue(null) }
      vi.mocked(mockPage.$).mockResolvedValue(mockBtn as any)

      await navigator.navigateMenu('Empresa', 'Dados da Empresa')

      expect(mockPage.waitForLoadState).toHaveBeenCalledWith('networkidle')
    })

    it('applies delay after menu navigation', async () => {
      const mockBtn = { click: vi.fn().mockResolvedValue(null) }
      vi.mocked(mockPage.$).mockResolvedValue(mockBtn as any)

      const delaySpy = vi.spyOn(global, 'setTimeout')
      await navigator.navigateMenu('Empresa', 'Dados da Empresa')

      expect(delaySpy).toHaveBeenCalled()
      delaySpy.mockRestore()
    })

    it('handles missing menu button gracefully', async () => {
      const mockSubBtn = { click: vi.fn().mockResolvedValue(null) }
      vi.mocked(mockPage.$)
        .mockResolvedValueOnce(null) // Menu not found
        .mockResolvedValueOnce(mockSubBtn as any) // Sub-item found

      // Should not throw
      await expect(
        navigator.navigateMenu('NonExistent', 'SubItem')
      ).resolves.toBeUndefined()
    })

    it('throws error when page is not initialized', async () => {
      const nullNavigator = new PageNavigator(null as any as Page)

      await expect(
        nullNavigator.navigateMenu('Empresa', 'Dados da Empresa')
      ).rejects.toThrow('Página não inicializada')
    })
  })

  // ===========================================================================
  // ERROR HANDLING TESTS
  // ===========================================================================

  describe('Error handling', () => {
    it('handles navigation timeout gracefully', async () => {
      const timeoutError = new Error('Timeout')
      vi.mocked(mockPage.goto).mockRejectedValueOnce(timeoutError)

      await expect(navigator.navigateToGesp()).rejects.toThrow('Timeout')
    })

    it('handles menu click failures', async () => {
      vi.mocked(mockPage.$).mockRejectedValueOnce(new Error('Element not found'))

      await expect(
        navigator.navigateMenu('Empresa', 'Dados da Empresa')
      ).rejects.toThrow()
    })

    it('recovers from temporary connection issues', async () => {
      vi.mocked(mockPage.goto)
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockResolvedValueOnce(null)

      // First call fails, second succeeds
      await expect(navigator.navigateToGesp()).rejects.toThrow(
        'Connection refused'
      )

      // Retry succeeds
      await expect(navigator.navigateToGesp()).resolves.toBeUndefined()
    })
  })

  // ===========================================================================
  // STATE MANAGEMENT TESTS
  // ===========================================================================

  describe('State management', () => {
    it('maintains page reference across multiple operations', async () => {
      const mockBtn = { click: vi.fn().mockResolvedValue(null) }
      vi.mocked(mockPage.$).mockResolvedValue(mockBtn as any)

      await navigator.navigateToGesp()
      await navigator.navigateMenu('Empresa', 'Dados')
      const url = navigator.getCurrentUrl()

      expect(url).toBeDefined()
      expect(mockPage.goto).toHaveBeenCalled()
      expect(mockPage.$).toHaveBeenCalled()
    })

    it('handles page recreation', async () => {
      const firstPage = mockPage
      const secondPage = createMockPage()

      const firstNavigator = new PageNavigator(firstPage as Page)
      const secondNavigator = new PageNavigator(secondPage as Page)

      firstNavigator.getCurrentUrl()
      secondNavigator.getCurrentUrl()

      expect(firstPage.url).toHaveBeenCalled()
      expect(secondPage.url).toHaveBeenCalled()
    })
  })
})
