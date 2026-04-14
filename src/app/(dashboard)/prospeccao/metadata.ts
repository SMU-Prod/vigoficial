/**
 * FE-06: Prospeccao (Sales Pipeline) Page Metadata
 * Provides SEO metadata for the prospecting/CRM page
 */

import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Prospecção — VIGI PRO",
  description: "Gerenciamento de pipeline de vendas. Acompanhe leads, oportunidades e prospectos com análise de probabilidade de conversão.",
  robots: {
    index: false, // Authenticated page, don't index
    follow: false,
  },
};
