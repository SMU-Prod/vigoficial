import { type Page } from "playwright";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

/**
 * Gerencia capturas de screenshots para diagnóstico
 */
export class ScreenshotManager {
  constructor(private page: Page) {}

  /**
   * Captura screenshot de diagnóstico
   */
  async screenshot(label: string): Promise<Buffer> {
    if (!this.page) return Buffer.alloc(0);

    try {
      const buffer = await this.page.screenshot({ fullPage: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `${label}-${timestamp}.png`;
      const filepath = path.join(os.tmpdir(), filename);
      fs.writeFileSync(filepath, buffer);
      return buffer;
    } catch (err) {
      console.error("[GESP] Erro ao capturar screenshot:", err);
      return Buffer.alloc(0);
    }
  }
}
