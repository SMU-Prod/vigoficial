/**
 * Mock DOU Server for Testing
 * Serves sample DOU HTML and JSON for testing the parser without hitting the real site
 * Simulates https://www.in.gov.br with realistic endpoints and responses
 *
 * Usage:
 *   const server = new MockDOUServer({ port: 3334 })
 *   await server.start()
 *   // ... run tests ...
 *   await server.close()
 */

import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import * as url from "url";

interface MockDOUServerOptions {
  port?: number;
  htmlFixturePath?: string;
  emptyFixturePath?: string;
}

export class MockDOUServer {
  private server: http.Server | null = null;
  private port: number;
  private htmlFixturePath: string;
  private emptyFixturePath: string;
  private requestLog: Array<{ method: string; path: string; timestamp: string }> = [];

  constructor(options: MockDOUServerOptions = {}) {
    this.port = options.port || 3334;
    this.htmlFixturePath =
      options.htmlFixturePath ||
      path.join(__dirname, "../fixtures/dou-secao1-sample.html");
    this.emptyFixturePath =
      options.emptyFixturePath ||
      path.join(__dirname, "../fixtures/dou-secao1-empty.html");
  }

  /**
   * Start the mock server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      const onError = (err: any) => {
        console.error("[MockDOU] Server error:", err);
        reject(err);
      };

      const onListen = () => {
        console.log(`[MockDOU] Server listening on port ${this.port}`);
        // Remove error listener after successful startup to avoid handling lingering errors
        this.server?.removeListener("error", onError);
        resolve();
      };

      this.server.once("error", onError);
      this.server.once("listening", onListen);

      this.server.listen(this.port, "127.0.0.1");
    });
  }

  /**
   * Close the mock server
   */
  async close(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }

      // Force close all connections after timeout
      const timeout = setTimeout(() => {
        console.warn('[MockDOU] Forced close after timeout');
        resolve();
      }, 5000);

      this.server.close((err) => {
        clearTimeout(timeout);
        if (err) {
          console.error('[MockDOU] Error during close:', err);
        } else {
          console.log("[MockDOU] Server closed");
        }
        resolve();
      });

      // Destroy all connections to ensure clean shutdown
      this.server.closeAllConnections?.();
    });
  }

  /**
   * Handle incoming HTTP requests
   */
  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const method = req.method || "GET";
    const urlPath = req.url || "/";

    // Log request
    const timestamp = new Date().toISOString();
    this.requestLog.push({
      method,
      path: urlPath,
      timestamp,
    });
    console.log(`[MockDOU] ${method} ${urlPath}`);

    // Health check endpoint
    if (urlPath === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", port: this.port }));
      return;
    }

    // Parse URL and query params
    const parsedUrl = new URL(urlPath, `http://localhost:${this.port}`);
    const query = Object.fromEntries(parsedUrl.searchParams);

    // Homepage
    if (urlPath === "/" || urlPath === "/inicio") {
      res.writeHead(200, { "Content-Type": "text/html; charset=UTF-8" });
      res.end(this.renderHomepage());
      return;
    }

    // Advanced search page
    if (urlPath.startsWith("/consulta")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=UTF-8" });
      res.end(this.renderSearchPage());
      return;
    }

    // Leiturajornal (legacy endpoint)
    if (urlPath.startsWith("/leiturajornal")) {
      const fixtureData = this.getFixtureForDate(query.data as string | undefined);
      try {
        const html = fs.readFileSync(fixtureData.path, "utf-8");
        res.writeHead(200, {
          "Content-Type": "text/html; charset=UTF-8",
          "Content-Length": Buffer.byteLength(html),
        });
        res.end(html);
        return;
      } catch (err) {
        console.error("[MockDOU] Error reading fixture:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Failed to load fixture" }));
        return;
      }
    }

    // Main DOU page
    if (urlPath === "/web/dou/-/diario-oficial-da-uniao") {
      res.writeHead(200, { "Content-Type": "text/html; charset=UTF-8" });
      res.end(this.renderMainPage());
      return;
    }

    // Section endpoints by date
    if (urlPath.startsWith("/servicos/diario-oficial/")) {
      const section = urlPath.match(/secao-([123])/)?.[1];

      // For empty results when requested
      const useEmpty = (query.empty === "true");

      const fixtureData = useEmpty ? { path: this.emptyFixturePath } : this.getFixtureForDate(query.data as string | undefined);

      try {
        const html = fs.readFileSync(fixtureData.path, "utf-8");
        const dateStr = query.data || this.formatTodayDate();
        const modifiedHtml = html
          .replace(/{{DATE}}/g, dateStr)
          .replace(/{{SECTION}}/g, section || "1");

        res.writeHead(200, {
          "Content-Type": "text/html; charset=UTF-8",
          "Content-Length": Buffer.byteLength(modifiedHtml),
        });
        res.end(modifiedHtml);
        return;
      } catch (err) {
        console.error("[MockDOU] Error reading fixture:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Failed to load fixture" }));
        return;
      }
    }

    // Search API endpoint (JSON)
    if (urlPath.startsWith("/api/search")) {
      const q = query.q as string | undefined;
      const s = query.s as string | undefined;
      const exactDate = query.exactDate as string | undefined;

      const results = this.generateSearchResults(q, s, exactDate);
      res.writeHead(200, {
        "Content-Type": "application/json; charset=UTF-8",
      });
      res.end(JSON.stringify(results));
      return;
    }

    // Default 404
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }

  /**
   * Get the correct fixture path for a given date
   */
  private getFixtureForDate(
    dateStr?: string
  ): { path: string; date: string } {
    // If no date specified, use today
    const dateToUse = dateStr || this.formatTodayDate();

    // For testing, always use the sample fixture unless empty is explicitly requested
    return {
      path: this.htmlFixturePath,
      date: dateToUse,
    };
  }

  /**
   * Format today's date as YYYY-MM-DD
   */
  private formatTodayDate(): string {
    const today = new Date();
    return today.toISOString().split("T")[0];
  }

  /**
   * Format today's date as DD/MM/YYYY for display
   */
  private formatTodayDisplayDate(): string {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, "0");
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const year = today.getFullYear();
    return `${day}/${month}/${year}`;
  }

  /**
   * Render DOU homepage
   */
  private renderHomepage(): string {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Diário Oficial da União</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .header { background: #003366; color: white; padding: 20px; text-align: center; }
        .container { max-width: 1200px; margin: 20px auto; background: white; padding: 20px; }
        .nav { margin: 20px 0; }
        .nav a { margin-right: 20px; text-decoration: none; color: #003366; font-weight: bold; }
    </style>
</head>
<body>
    <div class="header">
        <h1>DIÁRIO OFICIAL DA UNIÃO</h1>
        <p>Publicações da Imprensa Nacional</p>
    </div>
    <div class="container">
        <h2>Bem-vindo ao DOU</h2>
        <p>Acesse as edições do Diário Oficial da União:</p>
        <div class="nav">
            <a href="/servicos/diario-oficial/secao-1">Seção 1 (Hoje)</a>
            <a href="/servicos/diario-oficial/secao-2">Seção 2</a>
            <a href="/servicos/diario-oficial/secao-3">Seção 3</a>
            <a href="/consulta">Buscar</a>
        </div>
    </div>
</body>
</html>`;
  }

  /**
   * Render main DOU page
   */
  private renderMainPage(): string {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>Diário Oficial da União</title>
</head>
<body>
    <h1>Diário Oficial da União</h1>
    <p><a href="/servicos/diario-oficial/secao-1">Edição de hoje - Seção 1</a></p>
</body>
</html>`;
  }

  /**
   * Render search page
   */
  private renderSearchPage(): string {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>Busca - Diário Oficial da União</title>
</head>
<body>
    <h1>Buscar no DOU</h1>
    <form action="/api/search" method="GET">
        <input type="text" name="q" placeholder="Termos de busca" required>
        <select name="s">
            <option value="">Qualquer seção</option>
            <option value="do1">Seção 1</option>
            <option value="do2">Seção 2</option>
            <option value="do3">Seção 3</option>
        </select>
        <input type="date" name="exactDate">
        <button type="submit">Buscar</button>
    </form>
</body>
</html>`;
  }

  /**
   * Generate mock search results based on keywords
   */
  private generateSearchResults(
    q?: string,
    section?: string,
    exactDate?: string
  ): Record<string, unknown> {
    const date = exactDate || this.formatTodayDisplayDate();
    const query = (q || "").toLowerCase();

    // Security-related keywords that yield results
    const keywords = ["segurança", "vigilância", "alvará", "cnv", "delesp", "vigilante"];
    const isSecuritySearch = keywords.some((kw) => query.includes(kw));

    if (!isSecuritySearch) {
      return {
        jsonArray: [],
        totalHits: 0,
      };
    }

    return {
      jsonArray: [
        {
          title: "RENOVAÇÃO DE ALVARÁ DE FUNCIONAMENTO - SECURITEC VIGILÂNCIA LTDA",
          abstract:
            "Renova-se o alvará de funcionamento para empresa de segurança privada conforme Lei 7.102/83",
          href: "/web/dou/-/diario-oficial-da-uniao/2026/03/31/secao-1/12345678",
          date: date,
          pubName: "DO1",
          artCategory: "Ministério da Justiça",
        },
        {
          title: "CARTEIRA NACIONAL DE VIGILANTE - JOÃO CARLOS SILVA SANTOS",
          abstract: "Publicação de CNV válida conforme Circular 18.045/DELESP",
          href: "/web/dou/-/diario-oficial-da-uniao/2026/03/31/secao-1/12345679",
          date: date,
          pubName: "DO1",
          artCategory: "Departamento de Entidades de Segurança Privada",
        },
        {
          title: "AUTO DE INFRAÇÃO - VIGILÂNCIA EXPRESSA EIRELI",
          abstract:
            "Auto de infração por operação sem alvará válido e funcionários sem CNV registrada",
          href: "/web/dou/-/diario-oficial-da-uniao/2026/03/31/secao-1/12345680",
          date: date,
          pubName: "DO1",
          artCategory: "Ministério da Justiça",
        },
        {
          title: "RENOVAÇÃO DE ALVARÁ - VIGILÂNCIA BRASIL SEGURANÇA S.A.",
          abstract: "Renovação de alvará para vigilância armada e transporte de valores",
          href: "/web/dou/-/diario-oficial-da-uniao/2026/03/31/secao-1/12345681",
          date: date,
          pubName: "DO1",
          artCategory: "Ministério da Justiça",
        },
        {
          title: "PORTARIA Nº 1.247/MJ/2026 - REGULAMENTAÇÃO SEGURANÇA PRIVADA",
          abstract:
            "Estabelece diretrizes para equipamentos de segurança em empresas de vigilância privada",
          href: "/web/dou/-/diario-oficial-da-uniao/2026/03/31/secao-1/12345682",
          date: date,
          pubName: "DO1",
          artCategory: "Ministério da Justiça",
        },
      ],
      totalHits: 5,
    };
  }

  /**
   * Get the server URL
   */
  getBaseUrl(): string {
    return `http://localhost:${this.port}`;
  }

  /**
   * Get request log
   */
  getRequestLog(): Array<{ method: string; path: string; timestamp: string }> {
    return [...this.requestLog];
  }

  /**
   * Clear request log
   */
  clearRequestLog(): void {
    this.requestLog = [];
  }
}

/**
 * Convenience function to create and start a server
 */
export async function startMockDOUServer(
  port: number = 3334
): Promise<MockDOUServer> {
  const server = new MockDOUServer({ port });
  await server.start();
  return server;
}
