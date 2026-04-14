/**
 * VIGI CognitiveEngine — Document Processor
 *
 * Transforma conteúdo bruto (HTML, email, PDF) em ContentUnit
 * estruturado com links, botões e anexos descobertos.
 */

import {
  ContentUnit,
  ContentType,
  ContentSource,
  DiscoveredLink,
  DiscoveredAttachment,
} from "./types";

export class DocumentProcessor {
  /**
   * Processa conteúdo bruto e extrai estrutura (links, botões, anexos).
   */
  async process(
    rawContent: string,
    contentType: ContentType,
    source: ContentSource,
    metadata: Record<string, unknown> = {},
    depth: number = 0,
    parentId?: string
  ): Promise<ContentUnit> {
    const id = `cu_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    let rawText = rawContent;
    let rawHtml: string | undefined;
    let discoveredLinks: DiscoveredLink[] = [];
    let discoveredAttachments: DiscoveredAttachment[] = [];

    switch (contentType) {
      case "email":
        rawHtml = metadata.bodyHtml as string | undefined;
        rawText = metadata.bodyText as string || this.stripHtml(rawContent);
        discoveredLinks = this.extractLinksFromHtml(rawHtml || rawContent);
        discoveredAttachments = this.extractAttachmentsFromMetadata(metadata);
        break;

      case "html_page":
      case "gesp_page":
        rawHtml = rawContent;
        rawText = this.stripHtml(rawContent);
        discoveredLinks = this.extractLinksFromHtml(rawContent);
        break;

      case "dou_publication":
        rawHtml = rawContent;
        rawText = this.stripHtml(rawContent);
        discoveredLinks = this.extractLinksFromHtml(rawContent);
        break;

      case "pdf":
        // PDF text já vem extraído pelo PageNavigator
        rawText = rawContent;
        discoveredLinks = this.extractLinksFromText(rawContent);
        break;

      default:
        rawText = rawContent;
        discoveredLinks = this.extractLinksFromText(rawContent);
        break;
    }

    // Extrair botões de formulário de páginas HTML
    if (rawHtml) {
      const buttons = this.extractButtonsFromHtml(rawHtml);
      discoveredLinks.push(...buttons);
    }

    // Título do conteúdo
    const title = this.extractTitle(rawHtml || rawText, contentType, metadata);

    return {
      id,
      type: contentType,
      source,
      url: metadata.url as string | undefined,
      title,
      rawText,
      rawHtml,
      metadata,
      discoveredLinks,
      discoveredAttachments,
      processedAt: new Date().toISOString(),
      depth,
      parentId,
    };
  }

  /**
   * Extrai links <a href="..."> de HTML.
   */
  private extractLinksFromHtml(html: string): DiscoveredLink[] {
    const links: DiscoveredLink[] = [];
    // Regex para extrair <a href="...">text</a>
    const anchorRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;

    while ((match = anchorRegex.exec(html)) !== null) {
      const url = match[1].trim();
      const text = this.stripHtml(match[2]).trim();

      // Ignorar links vazios, anchors internos e javascript:
      if (
        !url ||
        url.startsWith("#") ||
        url.startsWith("javascript:") ||
        url.startsWith("mailto:") ||
        !text
      ) {
        continue;
      }

      links.push({
        text: text.slice(0, 200),
        url,
        type: "anchor",
      });
    }

    return links;
  }

  /**
   * Extrai botões e form actions de HTML.
   */
  private extractButtonsFromHtml(html: string): DiscoveredLink[] {
    const buttons: DiscoveredLink[] = [];

    // Buttons com onclick contendo URL
    const buttonRegex =
      /<button\s+[^>]*onclick=["'](?:window\.)?(?:location\.href|location|open)\s*[=(]\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/button>/gi;
    let match;

    while ((match = buttonRegex.exec(html)) !== null) {
      buttons.push({
        text: this.stripHtml(match[2]).trim().slice(0, 200),
        url: match[1].trim(),
        type: "button",
      });
    }

    // Form actions
    const formRegex = /<form\s+[^>]*action=["']([^"']+)["'][^>]*>/gi;
    while ((match = formRegex.exec(html)) !== null) {
      const action = match[1].trim();
      if (action && !action.startsWith("#") && !action.startsWith("javascript:")) {
        buttons.push({
          text: `Form → ${action}`,
          url: action,
          type: "form_action",
        });
      }
    }

    return buttons;
  }

  /**
   * Extrai URLs de texto plano (ex: PDFs).
   */
  private extractLinksFromText(text: string): DiscoveredLink[] {
    const links: DiscoveredLink[] = [];
    const urlRegex = /https?:\/\/[^\s<>"')\]]+/gi;
    let match;

    while ((match = urlRegex.exec(text)) !== null) {
      const url = match[0].replace(/[.,;:!?)]+$/, ""); // Remove trailing punctuation
      links.push({
        text: url.slice(0, 80),
        url,
        type: "anchor",
      });
    }

    return links;
  }

  /**
   * Extrai informações de anexos dos metadados do email.
   */
  private extractAttachmentsFromMetadata(
    metadata: Record<string, unknown>
  ): DiscoveredAttachment[] {
    const attachments = metadata.attachments as
      | Array<{ name: string; url?: string; type?: string; size?: number }>
      | undefined;

    if (!attachments || !Array.isArray(attachments)) return [];

    return attachments.map((a) => ({
      name: a.name,
      type: this.inferAttachmentType(a.name, a.type),
      url: a.url,
      size: a.size,
    }));
  }

  /**
   * Infere o tipo de anexo pelo nome/mime type.
   */
  private inferAttachmentType(
    name: string,
    mimeType?: string
  ): DiscoveredAttachment["type"] {
    const lower = name.toLowerCase();
    if (lower.endsWith(".pdf") || mimeType?.includes("pdf")) return "pdf";
    if (/\.(png|jpg|jpeg|gif|bmp|webp)$/.test(lower) || mimeType?.includes("image"))
      return "image";
    if (/\.(doc|docx|odt|rtf)$/.test(lower) || mimeType?.includes("word"))
      return "document";
    if (/\.(xls|xlsx|csv)$/.test(lower) || mimeType?.includes("spreadsheet"))
      return "spreadsheet";
    return "other";
  }

  /**
   * Extrai título do conteúdo.
   */
  private extractTitle(
    content: string,
    type: ContentType,
    metadata: Record<string, unknown>
  ): string {
    if (type === "email" && metadata.subject) {
      return metadata.subject as string;
    }

    // Tenta extrair <title> de HTML
    const titleMatch = content.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch) return titleMatch[1].trim().slice(0, 200);

    // Tenta extrair primeiro <h1>
    const h1Match = content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1Match) return this.stripHtml(h1Match[1]).trim().slice(0, 200);

    // Primeira linha do texto
    const firstLine = content.split("\n").find((l) => l.trim().length > 0);
    return firstLine?.trim().slice(0, 100) || `Conteúdo ${type}`;
  }

  /**
   * Remove tags HTML e decodifica entities básicas.
   */
  stripHtml(html: string): string {
    return html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }
}
