/**
 * FE-06: Dashboard Page Metadata
 * Provides SEO metadata for the main dashboard page
 */

import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard — VIGI PRO",
  description: "Visão geral de empresas, vigilantes, workflows e KPIs. Monitor em tempo real do sistema.",
  robots: {
    index: false, // Dashboard is authenticated, don't index
    follow: false,
  },
};
