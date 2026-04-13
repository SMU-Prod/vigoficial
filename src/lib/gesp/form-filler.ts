import { type Page } from "playwright";
import { logger } from "@/lib/observability/logger";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { delay } from "./page-navigator";

/**
 * Limite de caracteres por campo texto no GESP.
 * Campos de observação/justificativa aceitam no máximo 999 caracteres.
 * Textos maiores devem ser divididos com referência a documento complementar.
 */
export const GESP_FIELD_CHAR_LIMIT = 999;

/**
 * Divide texto longo em blocos de até 999 caracteres para campos GESP.
 * Se o texto excede o limite, o primeiro bloco inclui aviso de continuação
 * e os blocos restantes são retornados para envio como documento complementar.
 *
 * @returns { principal: string; complementares: string[] }
 */
export function splitGespField(text: string): { principal: string; complementares: string[] } {
  if (text.length <= GESP_FIELD_CHAR_LIMIT) {
    return { principal: text, complementares: [] };
  }

  const SUFFIX = "\n[CONTINUA EM DOCUMENTO COMPLEMENTAR]";
  const maxPrincipal = GESP_FIELD_CHAR_LIMIT - SUFFIX.length;

  // Corta no último espaço antes do limite para não quebrar palavras
  let cutPoint = text.lastIndexOf(" ", maxPrincipal);
  if (cutPoint <= 0) cutPoint = maxPrincipal;

  const principal = text.slice(0, cutPoint).trimEnd() + SUFFIX;
  const restante = text.slice(cutPoint).trim();

  // Divide restante em blocos de até 999 chars
  const complementares: string[] = [];
  let offset = 0;
  while (offset < restante.length) {
    const bloco = restante.slice(offset, offset + GESP_FIELD_CHAR_LIMIT);
    complementares.push(bloco);
    offset += GESP_FIELD_CHAR_LIMIT;
  }

  return { principal, complementares };
}

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
   * Preenche campo de texto GESP com limite de 999 caracteres.
   * Se o texto exceder, preenche o campo principal com aviso e retorna
   * os blocos complementares para upload como documento anexo.
   */
  async fillGespTextField(
    labelText: string,
    fullText: string
  ): Promise<{ complementares: string[] }> {
    const { principal, complementares } = splitGespField(fullText);
    await this.fillFormField(labelText, principal);

    if (complementares.length > 0) {
      logger.info(
        `[GESP] Campo "${labelText}" excedeu 999 chars. ` +
        `${complementares.length} bloco(s) complementar(es) gerado(s).`
      );
    }

    return { complementares };
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
