/**
 * FE-06: Empresas Page Metadata
 * Provides SEO metadata for the companies management page
 */

import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Empresas — VIGI PRO",
  description: "Gerenciamento de empresas clientes. Consulte informações, planos de contratação e histórico de atividades.",
  robots: {
    index: false, // Authenticated page, don't index
    follow: false,
  },
};
