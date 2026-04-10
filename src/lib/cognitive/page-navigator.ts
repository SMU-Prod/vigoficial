/**
 * VIGI CognitiveEngine — Page Navigator
 *
 * Busca conteúdo de URLs (páginas HTML, PDFs) para o CognitiveEngine.
 * Separa a lógica de fetch/download do processamento cognitivo.
 *
 * Para GESP usa Playwright (via GespBrowser), para demais usa fetch nativo.
 */

export class PageNavigator {
  private timeoutMs: number;

  constructor(timeoutMs: number = 30_000) {
    this.timeoutMs = timeoutMs;
  }

  /**
   * Busca conteúdo de uma URL.
   * Retorna o texto/HTML do conteúdo, ou null se falhar.
   */
  async fetch(url: string): Promise<string | null> {
    try {
      // Determinar tipo de conteúdo esperado
      const isPdf = url.toLowerCase().endsWith(".pdf") || url.includes("/pdf/");
      const isGesp =
        url.includes("servicos.dpf.gov.br") || url.includes("gesp");

      if (isGesp) {
        // GESP requer autenticação via Playwright — retorna null aqui,
        // o agente Operacional lida com GESP via GespBrowser
        console.warn(
          "[PageNavigator] GESP URL detected — requires GespBrowser, skipping direct fetch"
        );
        return null;
      }

      if (isPdf) {
        return this.fetchPdf(url);
      }

      return this.fetchHtml(url);
    } catch (err) {
      console.warn(`[PageNavigator] Failed to fetch ${url}:`, err);
      return null;
    }
  }

  /**
   * Busca página HTML.
   */
  private async fetchHtml(url: string): Promise<string | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      let response: Response;
      try {
        response = await globalThis.fetch(url, {
          signal: controller.signal,
          headers: {
            "User-Agent":
              "VIG-PRO-Compliance-Bot/1.0 (compliance automation; contato@vigconsultoria.com)",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
          },
          redirect: "follow",
        });
      } catch (fetchErr) {
        console.warn(`[PageNavigator] Fetch error for ${url}:`, fetchErr);
        return null;
      }

      if (!response.ok) {
        console.warn(
          `[PageNavigator] HTTP ${response.status} for ${url}`
        );
        return null;
      }

      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("application/pdf")) {
        // Redirect chegou num PDF — processar como tal
        const buffer = await response.arrayBuffer();
        return this.extractTextFromPdfBuffer(Buffer.from(buffer));
      }

      return await response.text();
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Busca e extrai texto de PDF.
   */
  private async fetchPdf(url: string): Promise<string | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await globalThis.fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "VIG-PRO-Compliance-Bot/1.0",
          Accept: "application/pdf,*/*",
        },
        redirect: "follow",
      });

      if (!response.ok) return null;

      const buffer = await response.arrayBuffer();
      return this.extractTextFromPdfBuffer(Buffer.from(buffer));
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Extrai texto de um buffer PDF.
   * Usa abordagem simples sem dependência externa pesada.
   * Para PDFs complexos, cai no fallback de extrair strings visíveis.
   */
  private async extractTextFromPdfBuffer(
    buffer: Buffer
  ): Promise<string | null> {
    try {
      // Tentar usar pdf-parse se disponível
      const pdfParse = await this.tryImportPdfParse();
      if (pdfParse) {
        const data = await pdfParse(buffer);
        return data.text || null;
      }

      // Fallback: extração básica de strings do PDF
      return this.basicPdfTextExtraction(buffer);
    } catch (err) {
      console.warn("[PageNavigator] PDF text extraction failed:", err);
      return this.basicPdfTextExtraction(buffer);
    }
  }

  /**
   * Tenta importar pdf-parse dinamicamente.
   */
  private async tryImportPdfParse(): Promise<
    ((buffer: Buffer) => Promise<{ text: string }>) | null
  > {
    try {
      // Dynamic require to avoid TS error when pdf-parse is not installed
      const mod = await (Function('return import("pdf-parse")')() as Promise<{ default?: unknown }>);
      return (mod.default || mod) as (buffer: Buffer) => Promise<{ text: string }>;
    } catch {
      return null;
    }
  }

  /**
   * Extração básica de texto de PDF sem dependências.
   * Busca strings entre parênteses em streams de conteúdo PDF.
   */
  private basicPdfTextExtraction(buffer: Buffer): string | null {
    const content = buffer.toString("latin1");
    const texts: string[] = [];

    // Extrair texto entre parênteses (operador Tj do PDF)
    const regex = /\(([^)]{2,})\)\s*Tj/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      const decoded = match[1]
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\\(/g, "(")
        .replace(/\\\)/g, ")")
        .replace(/\\\\/g, "\\");
      texts.push(decoded);
    }

    // Também extrair texto em arrays TJ
    const tjRegex = /\[((?:\([^)]*\)|[^[\]])*)\]\s*TJ/gi;
    while ((match = tjRegex.exec(content)) !== null) {
      const inner = match[1];
      const innerRegex = /\(([^)]*)\)/g;
      let innerMatch;
      while ((innerMatch = innerRegex.exec(inner)) !== null) {
        if (innerMatch[1].trim()) {
          texts.push(innerMatch[1]);
        }
      }
    }

    const result = texts.join(" ").trim();
    return result.length > 10 ? result : null;
  }

  /**
   * Verifica se uma URL é acessível (HEAD request).
   */
  async isAccessible(url: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await globalThis.fetch(url, {
        method: "HEAD",
        signal: controller.signal,
        redirect: "follow",
      });

      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  }
}
