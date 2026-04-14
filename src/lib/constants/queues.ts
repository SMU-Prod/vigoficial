/**
 * Constantes de Filas BullMQ
 * Configurações e labels para monitoramento de filas
 */

export const QUEUE_LABELS: Record<
  string,
  { label: string; description: string; icon: string }
> = {
  dou: {
    label: "DOU Parser",
    description: "Scraping do Diário Oficial",
    icon: "📰",
  },
  "email-read": {
    label: "Leitura de Emails",
    description: "Gmail API polling + classificação",
    icon: "📨",
  },
  "gesp-sync": {
    label: "GESP Sync",
    description: "Sincronização com portal GESP",
    icon: "🔄",
  },
  "gesp-action": {
    label: "GESP Ações",
    description: "Execução de tarefas GESP",
    icon: "⚡",
  },
  compliance: {
    label: "Compliance",
    description: "Verificação de validades",
    icon: "✅",
  },
  fleet: {
    label: "Frota",
    description: "Rastreamento GPS e manutenção",
    icon: "🚗",
  },
  "email-send": {
    label: "Envio de Emails",
    description: "Resend API (5 req/s)",
    icon: "📤",
  },
  billing: {
    label: "Faturamento",
    description: "Ciclo de cobrança Asaas",
    icon: "💰",
  },
  "comunicador-alerts": {
    label: "Alertas",
    description: "Despacho de alertas do Comunicador",
    icon: "🔔",
  },
  "insight-distill": {
    label: "Pattern Distiller",
    description: "Extração diária de padrões IML",
    icon: "🧠",
  },
  prospector: {
    label: "Prospector",
    description: "Prospecção B2B via DOU",
    icon: "🎯",
  },
  dlq: {
    label: "Dead Letter Queue",
    description: "Jobs que falharam após retries",
    icon: "💀",
  },
};

export function getQueueMeta(name: string) {
  return (
    QUEUE_LABELS[name] || { label: name, description: "", icon: "📋" }
  );
}
