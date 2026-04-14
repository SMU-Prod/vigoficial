import { type Page } from "playwright";

export interface TabelaRow {
  [key: string]: string;
}

/**
 * Gerencia extração de dados de documentos e páginas HTML
 */
export class DocumentExtractor {
  constructor(private page: Page) {}

  /**
   * Extrai dados de tabela HTML
   */
  async parseTable(selector: string = "table"): Promise<TabelaRow[]> {
    if (!this.page) return [];

    try {
      const rows = await this.page.locator(`${selector} tbody tr`).all();
      const result: TabelaRow[] = [];

      for (const row of rows) {
        const cells = await row.locator("td").allTextContents();
        if (cells.length > 0) {
          result.push({
            colunas: cells.join(" | "),
          });
        }
      }

      return result;
    } catch {
      return [];
    }
  }

  /**
   * Extrai conteúdo de texto de um seletor
   */
  async extractText(selector: string): Promise<string> {
    if (!this.page) return "";

    try {
      const element = await this.page.$(selector);
      if (element) {
        const text = await element.textContent();
        return text?.trim() || "";
      }
      return "";
    } catch {
      return "";
    }
  }

  /**
   * Extrai conteúdo HTML de um seletor
   */
  async extractHTML(selector: string): Promise<string> {
    if (!this.page) return "";

    try {
      const element = await this.page.$(selector);
      if (element) {
        const html = await element.innerHTML();
        return html || "";
      }
      return "";
    } catch {
      return "";
    }
  }

  /**
   * Extrai todos os textos de uma tabela com cabeçalhos
   */
  async parseTableWithHeaders(selector: string = "table"): Promise<TabelaRow[]> {
    if (!this.page) return [];

    try {
      // Extrai cabeçalhos
      const headers = await this.page.locator(`${selector} thead th, ${selector} thead td`).allTextContents();

      if (headers.length === 0) {
        // Fallback: usa primeira linha como cabeçalho
        return this.parseTable(selector);
      }

      // Extrai linhas
      const rows = await this.page.locator(`${selector} tbody tr`).all();
      const result: TabelaRow[] = [];

      for (const row of rows) {
        const cells = await row.locator("td").allTextContents();
        if (cells.length > 0) {
          const rowData: TabelaRow = {};
          headers.forEach((header, index) => {
            rowData[header.trim()] = cells[index]?.trim() || "";
          });
          result.push(rowData);
        }
      }

      return result;
    } catch {
      // Fallback para método simples
      return this.parseTable(selector);
    }
  }

  /**
   * Verifica se um elemento existe na página
   */
  async elementExists(selector: string): Promise<boolean> {
    if (!this.page) return false;

    try {
      const element = await this.page.$(selector);
      return element !== null;
    } catch {
      return false;
    }
  }

  /**
   * Extrai atributo de um elemento
   */
  async getAttribute(selector: string, attribute: string): Promise<string | null> {
    if (!this.page) return null;

    try {
      const element = await this.page.$(selector);
      if (element) {
        return await element.getAttribute(attribute);
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Extrai valores de todos os inputs de um formulário
   */
  async extractFormData(formSelector: string): Promise<Record<string, string>> {
    if (!this.page) return {};

    try {
      const inputs = await this.page.locator(`${formSelector} input, ${formSelector} select, ${formSelector} textarea`).all();
      const data: Record<string, string> = {};

      for (const input of inputs) {
        const name = await input.getAttribute("name");
        const value = await input.inputValue();
        if (name) {
          data[name] = value || "";
        }
      }

      return data;
    } catch {
      return {};
    }
  }
}
