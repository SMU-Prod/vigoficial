/**
 * FE-06: Monitoramento Page Metadata
 * Provides SEO metadata for the monitoring/GPS tracking page
 */

import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Monitoramento — VIGI PRO",
  description: "Monitoramento de veículos em tempo real. Visualize posicionamento GPS, alertas de segurança e histórico de rotas.",
  robots: {
    index: false, // Authenticated page, don't index
    follow: false,
  },
};
