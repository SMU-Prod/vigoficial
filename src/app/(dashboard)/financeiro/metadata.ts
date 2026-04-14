/**
 * FE-06: Financeiro (Billing) Page Metadata
 * Provides SEO metadata for the billing and financial management page
 */

import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Financeiro — VIGI PRO",
  description: "Gerenciamento de faturamento e subscriptions. Consulte faturas, pagamentos, planos e relatórios financeiros.",
  robots: {
    index: false, // Authenticated page, don't index
    follow: false,
  },
};
