import { cn } from "@/lib/utils";

type BadgeVariant = "green" | "yellow" | "red" | "blue" | "gray" | "gold";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  green: "bg-[var(--status-success-bg)] text-[var(--status-success)]",
  yellow: "bg-[var(--status-warning-bg)] text-[var(--status-warning)]",
  red: "bg-[var(--status-danger-bg)] text-[var(--status-danger)]",
  blue: "bg-[var(--status-info-bg)] text-[var(--status-info)]",
  gray: "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]",
  gold: "bg-[var(--bg-badge)] text-[var(--ds-primary-text)]",
};

export function Badge({ children, variant = "gray", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium",
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

/** Badge de status de billing */
export function BillingBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    trial: { label: "Trial", variant: "blue" },
    ativo: { label: "Ativo", variant: "green" },
    inadimplente: { label: "Inadimplente", variant: "yellow" },
    suspenso: { label: "Suspenso", variant: "red" },
    cancelado: { label: "Cancelado", variant: "gray" },
  };
  const { label, variant } = map[status] || { label: status, variant: "gray" as BadgeVariant };
  return <Badge variant={variant}>{label}</Badge>;
}

/** Badge de status do vigilante */
export function EmployeeBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    ativo: { label: "Ativo", variant: "green" },
    inativo: { label: "Inativo", variant: "gray" },
    afastado: { label: "Afastado", variant: "yellow" },
    demitido: { label: "Demitido", variant: "red" },
  };
  const { label, variant } = map[status] || { label: status, variant: "gray" as BadgeVariant };
  return <Badge variant={variant}>{label}</Badge>;
}

/** Badge de semáforo (processos e validades) */
export function SemaforoBadge({ semaforo, ..._rest }: { semaforo: string } & React.HTMLAttributes<HTMLSpanElement>) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    verde: { label: "No prazo", variant: "green" },
    amarelo: { label: "Atenção", variant: "yellow" },
    vermelho: { label: "Urgente", variant: "red" },
    ok: { label: "OK", variant: "green" },
    informativo: { label: "Informativo", variant: "blue" },
    atencao: { label: "Atenção", variant: "yellow" },
    urgente: { label: "Urgente", variant: "red" },
    critico: { label: "Crítico", variant: "red" },
  };
  const { label, variant } = map[semaforo] || { label: semaforo, variant: "gray" as BadgeVariant };
  return <Badge variant={variant}>{label}</Badge>;
}
