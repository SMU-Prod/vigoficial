"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useFetch } from "@/hooks/use-fetch";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { ChartCard } from "@/components/ui/chart-card";
import { Button } from "@/components/ui/button";

import type { DashboardKpi } from "@/types/database";

type PeriodType = "7d" | "30d" | "90d";

export default function DashboardPage() {
  const router = useRouter();
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>("30d");

  const { data: kpis, loading } = useFetch<DashboardKpi & { total_veiculos_ativos?: number; divergencias_abertas?: number }>(
    "/api/dashboard",
    {
      refetchInterval: 60_000, // Atualiza a cada 1 min
    }
  );

  // Map KPI data to stat cards with appropriate variants
  const statCards = useMemo(() => {
    if (!kpis) return [];

    const getVariant = (label: string, value: number): "default" | "success" | "warning" | "danger" | "info" => {
      if (label === "Empresas Ativas" || label === "Vigilantes Ativos") return "success";
      if (label === "Emails Hoje") return "info";
      if (value > 0) {
        if (label === "Urgentes" || label === "Validades Críticas" || label === "Divergências") return "danger";
        if (label === "Workflows Abertos" || label === "GESP Pendentes") return "warning";
      }
      return "default";
    };

    return [
      {
        label: "Empresas Ativas",
        value: kpis.total_empresas_ativas,
        variant: getVariant("Empresas Ativas", kpis.total_empresas_ativas),
      },
      {
        label: "Vigilantes Ativos",
        value: kpis.total_vigilantes_ativos,
        variant: getVariant("Vigilantes Ativos", kpis.total_vigilantes_ativos),
      },
      {
        label: "Workflows Abertos",
        value: kpis.workflows_abertos,
        variant: getVariant("Workflows Abertos", kpis.workflows_abertos),
      },
      {
        label: "Urgentes",
        value: kpis.workflows_urgentes,
        variant: getVariant("Urgentes", kpis.workflows_urgentes),
      },
      {
        label: "Validades Críticas",
        value: kpis.validades_criticas,
        variant: getVariant("Validades Críticas", kpis.validades_criticas),
      },
      {
        label: "GESP Pendentes",
        value: kpis.gesp_tasks_pendentes,
        variant: getVariant("GESP Pendentes", kpis.gesp_tasks_pendentes),
      },
      {
        label: "Emails Hoje",
        value: kpis.emails_enviados_hoje,
        variant: getVariant("Emails Hoje", kpis.emails_enviados_hoje),
      },
      {
        label: "Divergências",
        value: kpis.divergencias_abertas ?? 0,
        variant: getVariant("Divergências", kpis.divergencias_abertas ?? 0),
      },
    ];
  }, [kpis]);

  // Period selector actions for header
  const periodActions = (
    <div className="flex gap-2">
      {(["7d", "30d", "90d"] as const).map((period) => (
        <Button
          key={period}
          variant={selectedPeriod === period ? "primary" : "secondary"}
          size="sm"
          onClick={() => setSelectedPeriod(period)}
        >
          {period === "7d" ? "7 dias" : period === "30d" ? "30 dias" : "90 dias"}
        </Button>
      ))}
    </div>
  );

  const handleNavigate = (path: string) => {
    router.push(path);
  };

  return (
    <div>
      {/* Page Header with Period Selector */}
      <PageHeader
        title="Dashboard"
        subtitle="Visão geral do sistema"
        actions={periodActions}
      />

      {/* KPI Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[...Array(8)].map((_, i) => (
            <StatCard key={i} label="" value="" loading={true} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {statCards.map((card) => (
            <StatCard
              key={card.label}
              label={card.label}
              value={card.value}
              variant={card.variant}
            />
          ))}
        </div>
      )}

      {/* Info Panels and Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Status do Ciclo Automático */}
        <div className="vigi-card p-6">
          <h2 className="text-base font-semibold text-[var(--text-primary)] mb-4">
            Status do Ciclo Automático
          </h2>
          <div className="space-y-3 text-sm text-[var(--text-secondary)]">
            <div className="flex justify-between">
              <span>Horários do ciclo</span>
              <span className="font-mono text-[var(--text-primary)]">06h · 10h · 14h · 18h · 22h</span>
            </div>
            <div className="flex justify-between">
              <span>Max browsers GESP</span>
              <span className="font-mono text-[var(--text-primary)]">3</span>
            </div>
            <div className="flex justify-between">
              <span>Filas BullMQ</span>
              <span className="font-mono text-[var(--text-primary)]">8 ativas</span>
            </div>
          </div>
        </div>

        {/* Ações Rápidas */}
        <div className="vigi-card p-6 lg:col-span-2">
          <h2 className="text-base font-semibold text-[var(--text-primary)] mb-4">
            Ações Rápidas
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleNavigate("/empresas")}
            >
              Cadastrar nova empresa
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleNavigate("/vigilantes")}
            >
              Cadastrar novo vigilante
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleNavigate("/processos")}
            >
              Ver processos ativos
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleNavigate("/admin")}
            >
              Gerenciar usuários
            </Button>
          </div>
        </div>
      </div>

      {/* Recent Activity Chart */}
      <ChartCard
        title="Atividade Recente"
        subtitle={`Últimos ${selectedPeriod === "7d" ? "7 dias" : selectedPeriod === "30d" ? "30 dias" : "90 dias"}`}
      >
        <div className="flex items-center justify-center h-80 text-[var(--text-secondary)]">
          <p>Gráfico de atividade será renderizado com recharts</p>
        </div>
      </ChartCard>
    </div>
  );
}
