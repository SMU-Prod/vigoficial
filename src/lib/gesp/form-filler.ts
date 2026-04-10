import { type Page } from "playwright";
import { logger } from "@/lib/observability/logger";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { delay } from "./page-navigator";

/**
 * Gerencia preenchimento de formulários e interações com elementos
 */
export class FormFiller {
  constructor(private page: Page) {}

  /**
   * Preenche campo de formulário por rótulo (label text)
   */
  async fillFormField(labelText: string, value: string): Promise<void> {
    if (!this.page) throw new Error("Página não inicializada");

    try {
      const input = await this.page.locator(`label:has-text("${labelText}") >> .. >> input, label:has-text("${labelText}") >> .. >> textarea`).first();
      if (input) {
        await input.fill(value);
      }
    } catch (err) {
      logger.error("Erro ao preencher campo", { labelText, error: err as Error });
    }
  }

  /**
   * Seleciona opção em dropdown por label
   */
  async selectDropdown(labelText: string, optionText: string): Promise<void> {
    if (!this.page) throw new Error("Página não inicializada");

    try {
      const select = await this.page.locator(`label:has-text("${labelText}") >> .. >> select`).first();
      if (select) {
        await select.selectOption({ label: optionText });
      }
    } catch (err) {
      logger.error("Erro ao selecionar dropdown", { labelText, error: err as Error });
    }
  }

  /**
   * Clica em aba do formulário (painel esquerdo)
   */
  async clickTab(tabName: string): Promise<void> {
    if (!this.page) throw new Error("Página não inicializada");

    try {
      const tab = await this.page.$(`text="${tabName}"`);
      if (tab) {
        await tab.click();
        await this.page.waitForLoadState("networkidle");
        await delay();
      }
    } catch (err) {
      logger.error("Erro ao clicar aba", { tabName, error: err as Error });
    }
  }

  /**
   * Faz upload de arquivo em formulário JSF
   */
  async uploadFile(buffer: Buffer, filename: string, inputSelector: string): Promise<void> {
    if (!this.page) throw new Error("Página não inicializada");

    try {
      const tmpPath = path.join(os.tmpdir(), filename);
      fs.writeFileSync(tmpPath, buffer);

      const input = await this.page.$(inputSelector);
      if (input) {
        await input.setInputFiles(tmpPath);
        await delay();
      }

      fs.unlinkSync(tmpPath);
    } catch (err) {
      logger.error("Erro ao fazer upload de arquivo", err as Error);
      throw err;
    }
  }

  /**
   * Trata dialog de confirmação do GESP
   * Padrão: "Confirma [ação]?" → Sim / Não
   */
  async handleGespConfirmation(): Promise<string | null> {
    if (!this.page) return null;

    try {
      const simBtn = await this.page.$('button:has-text("Sim"), input[value="Sim"]');
      if (simBtn) {
        await simBtn.click();
        await this.page.waitForLoadState("networkidle");
        await delay();

        const successMsg = await this.page.$('.message, .alert-success, .msg-sucesso, .info-message');
        if (successMsg) {
          const text = (await successMsg.textContent())?.trim() || "";
          const match = text.match(/N[ºo°]\s*(?:Processo|Protocolo)[:.]?\s*(\d{4}\/\d+)/i);
          if (match) return match[1];
          return text;
        }
      }
    } catch {
      // Dialog pode não ter aparecido
    }

    return null;
  }

  /**
   * Clica em botão de ação universal: EXCLUIR | VERIFICAR | ENVIAR
   */
  async clickGespActionButton(action: "EXCLUIR" | "VERIFICAR" | "ENVIAR"): Promise<string | null> {
    if (!this.page) return null;

    try {
      await this.page.click(`button:has-text("${action}"), input[value="${action}"], a:has-text("${action}")`);
      await this.page.waitForLoadState("networkidle");
      await delay();

      return await this.handleGespConfirmation();
    } catch (err) {
      logger.error(`Erro ao clicar ${action}`, err as Error);
      return null;
    }
  }
}
