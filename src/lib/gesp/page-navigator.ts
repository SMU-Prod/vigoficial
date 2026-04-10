import { type Page } from "playwright";
import { logger } from "@/lib/observability/logger";

const GESP_URL = "https://servicos.dpf.gov.br/gesp/";

// Utility functions for timing/delay
function randomDelay(): number {
  return 1500 + Math.random() * 2500;
}

export async function delay(ms?: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms || randomDelay()));
}

/**
 * Gerencia navegação de páginas, URLs e esperas
 */
export class PageNavigator {
  constructor(private page: Page) {}

  /**
   * Navega para a URL do GESP
   */
  async navigateToGesp(): Promise<void> {
    if (!this.page) throw new Error("Página não inicializada");

    try {
      await this.page.goto(GESP_URL, { waitUntil: "networkidle", timeout: 45_000 });
      await delay();
    } catch (err) {
      logger.error("Erro ao navegar para GESP", err as Error);
      throw err;
    }
  }

  /**
   * Retorna a URL atual da página
   */
  getCurrentUrl(): string {
    if (!this.page) return "";
    return this.page.url();
  }

  /**
   * Verifica se estamos logados no painel principal do GESP
   */
  async verifyLoggedIn(): Promise<boolean> {
    if (!this.page) return false;

    try {
      await this.page.waitForLoadState("networkidle");
      const hasMenu = await this.page.$('text="Empresa", text="Processo Autorizativo", text="Processo Punitivo"');
      const hasUserInfo = await this.page.$('.user-info, [class*="usuario"], [class*="perfil"]');
      return hasMenu !== null || hasUserInfo !== null;
    } catch {
      return false;
    }
  }

  /**
   * Navega em menu dropdown do GESP
   * Padrão: clica menu principal, depois sub-item
   */
  async navigateMenu(menuText: string, subItemText: string): Promise<void> {
    if (!this.page) throw new Error("Página não inicializada");

    try {
      // Clica no menu principal
      const menuBtn = await this.page.$(`text="${menuText}"`);
      if (menuBtn) {
        await menuBtn.click();
        await delay(300);
      }

      // Clica no sub-item
      const subBtn = await this.page.$(`text="${subItemText}"`);
      if (subBtn) {
        await subBtn.click();
        await this.page.waitForLoadState("networkidle");
        await delay();
      }
    } catch (err) {
      logger.error("Erro ao navegar menu", { menuText, subItemText, error: err as Error });
      throw err;
    }
  }

  /**
   * Aguarda carregamento de página GESP
   */
  async waitForGespPage(): Promise<void> {
    if (!this.page) throw new Error("Página não inicializada");

    try {
      await this.page.waitForLoadState("networkidle");
      await delay();
    } catch {
      logger.warn("Timeout esperando carregamento de página");
    }
  }

  /**
   * Aguarda que a URL mude para um padrão específico
   */
  async waitForURL(urlPattern: (url: URL) => boolean, timeout: number = 30_000): Promise<void> {
    if (!this.page) throw new Error("Página não inicializada");
    await this.page.waitForURL(urlPattern, { timeout });
  }

  /**
   * Aguarda o carregamento de um estado de página
   */
  async waitForLoadState(state: "load" | "domcontentloaded" | "networkidle"): Promise<void> {
    if (!this.page) throw new Error("Página não inicializada");
    await this.page.waitForLoadState(state);
  }
}
