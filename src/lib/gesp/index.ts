/**
 * GESP Browser Automation Module
 *
 * Exports the main GespBrowser class and types for GESP interaction.
 * The module is decomposed into focused sub-modules:
 *
 * - PageNavigator: Page navigation, URLs, wait states
 * - FormFiller: Form input, dropdowns, button clicks, dialogs
 * - DocumentExtractor: Table parsing, data extraction, HTML content
 * - ScreenshotManager: Screenshot capture and management
 *
 * The GespBrowser class acts as a facade coordinating all sub-modules.
 */

// Main class
export { GespBrowser } from "./browser";

// Types
export type { ProcessoResult, CertificadoConfig, CertificadoTipo } from "./browser";
export type { TabelaRow } from "./document-extractor";

// Sub-modules (for advanced usage)
export { PageNavigator, delay } from "./page-navigator";
export { FormFiller } from "./form-filler";
export { DocumentExtractor } from "./document-extractor";
export { ScreenshotManager } from "./screenshot-manager";
