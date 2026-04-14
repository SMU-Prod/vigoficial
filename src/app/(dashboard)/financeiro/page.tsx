"use client";

import { useState } from "react";
import { DataTable } from "@/components/ui/table";
import { BillingBadge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { ChartCard } from "@/components/ui/chart-card";
import { FilterBar, FilterConfig } from "@/components/ui/filter-bar";
import { ExportButton } from "@/components/ui/export-button";
import { Timeline, TimelineItem } from "@/components/ui/timeline";
import { useFetch } from "@/hooks/use-fetch";

import { formatCurrency, formatDate } from "@/lib/formatters";

interface BillingRow {
  id: string;
  company_id: string;
  razao_social: string;
  plano: string;
  valor_mensal: number;
  billing_status: string;
  data_proxima_cobranca: string | null;
  vigilantes_ativos: number;
}

export default function FinanceiroPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({
    search: "",
    status: "",
    plano: "",
    periodo: "",
  });

  const { data: allData = [], loading } = useFetch<BillingRow[]>("/api/billing");

  // Calculate KPIs
  const activeData = (allData ?? []).filter((d) => d.billing_status === "ativo");
  const totalMrr = activeData.reduce((sum, d) => sum + d.valor_mensal, 0);
  const totalArr = totalMrr * 12;
  const overdueCount = (allData ?? []).filter((d) => d.billing_status === "atrasado").length;
  const churnRate = activeData.length > 0 ? ((overdueCount / activeData.length) * 100).toFixed(1) : "0.0";

  // Filter data
  const filteredData = (allData ?? []).filter((row) => {
    if (filterValues.search && !row.razao_social.toLowerCase().includes(filterValues.search.toLowerCase())) {
      return false;
    }
    if (filterValues.status && row.billing_status !== filterValues.status) {
      return false;
    }
    if (filterValues.plano && row.plano !== filterValues.plano) {
      return false;
    }
    return true;
  });

  const totalPages = Math.ceil(filteredData.length / pageSize);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Get unique planos for filter
  const uniquePlanos = Array.from(
    new Set((allData ?? []).map((d) => d.plano))
  );

  const filterConfig: FilterConfig[] = [
    {
      key: "search",
      label: "Empresa",
      type: "search",
      placeholder: "Buscar por empresa...",
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { label: "Pago", value: "pago" },
        { label: "Pendente", value: "pendente" },
        { label: "Atrasado", value: "atrasado" },
        { label: "Cancelado", value: "cancelado" },
        { label: "Ativo", value: "ativo" },
      ],
    },
    {
      key: "plano",
      label: "Plano",
      type: "select",
      options: uniquePlanos.map((plano) => ({ label: plano, value: plano })),
    },
    {
      key: "periodo",
      label: "Período",
      type: "date",
    },
  ];

  const handleFilterChange = (key: string, value: string) => {
    setFilterValues((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setFilterValues({
      search: "",
      status: "",
      plano: "",
      periodo: "",
    });
    setCurrentPage(1);
  };

  // Timeline data - populated from real events via API
  const timelineItems: TimelineItem[] = [];

  const columns = [
    { key: "razao_social", header: "Empresa" },
    { key: "plano", header: "Plano", render: (r: BillingRow) => <span className="capitalize">{r.plano}</span> },
    { key: "valor_mensal", header: "Valor", render: (r: BillingRow) => formatCurrency(r.valor_mensal) },
    { key: "billing_status", header: "Status", render: (r: BillingRow) => <BillingBadge status={r.billing_status} /> },
    { key: "data_proxima_cobranca", header: "Próx. Cobrança", render: (r: BillingRow) => r.data_proxima_cobranca ? formatDate(r.data_proxima_cobranca) : "—" },
    { key: "vigilantes_ativos", header: "Vigilantes" },
  ];

  const exportColumns = [
    { key: "razao_social", label: "Empresa" },
    { key: "plano", label: "Plano" },
    { key: "valor_mensal", label: "Valor Mensal" },
    { key: "billing_status", label: "Status" },
    { key: "data_proxima_cobranca", label: "Próx. Cobrança" },
    { key: "vigilantes_ativos", label: "Vigilantes Ativos" },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Financeiro"
        subtitle="Faturamento e cobrança"
        actions={
          <ExportButton
            data={filteredData}
            filename="financeiro"
            columns={exportColumns}
            formats={["csv", "excel"]}
          />
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="MRR"
          value={formatCurrency(totalMrr)}
          variant="success"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          loading={loading}
        />
        <StatCard
          label="ARR"
          value={formatCurrency(totalArr)}
          variant="success"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8L5.257 18.257a2 2 0 00.6 3.143l6.109 3.256a2 2 0 002.468-.434l10.905-16.457a2 2 0 00-.6-3.143L13.905 2.134a2 2 0 00-2.468.434L2.257 18.257" />
            </svg>
          }
          loading={loading}
        />
        <StatCard
          label="Inadimplência"
          value={overdueCount}
          variant="danger"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4v2m0 5v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          loading={loading}
        />
        <StatCard
          label="Churn Rate"
          value={`${churnRate}%`}
          variant="warning"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17H3v-2h10v2zm0-4H3v-2h10v2zm0-4H3V7h10v2z" />
            </svg>
          }
          loading={loading}
        />
      </div>

      {/* MRR Chart */}
      <ChartCard
        title="Evolução do MRR"
        subtitle="Últimos 12 meses"
        height={300}
        loading={loading}
      >
        <div className="flex items-center justify-center h-full text-[var(--text-secondary)]">
          Gráfico MRR com recharts (implementação futura)
        </div>
      </ChartCard>

      {/* Filters */}
      <FilterBar
        filters={filterConfig}
        values={filterValues}
        onChange={handleFilterChange}
        onClear={handleClearFilters}
      />

      {/* Main Content Area */}
      {!loading && filteredData.length === 0 ? (
        <div className="vigi-card">
          <EmptyState
            icon="💰"
            title="Nenhum registro encontrado"
            description="Tente ajustar seus filtros ou adicionar novos registros de faturamento"
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Data Table */}
          <div className="lg:col-span-2">
            <div className="vigi-card p-6 space-y-4">
              <div className="overflow-x-auto">
                <DataTable columns={columns} data={paginatedData} loading={loading} emptyMessage="Nenhum registro encontrado." />
              </div>

              {!loading && filteredData.length > 0 && (
                <div className="border-t border-[var(--border-primary)] pt-4">
                  <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalCount={filteredData.length}
                    pageSize={pageSize}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={(newSize) => {
                      setPageSize(newSize);
                      setCurrentPage(1);
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Timeline Sidebar */}
          <div className="lg:col-span-1">
            <Timeline items={timelineItems} maxItems={5} />
          </div>
        </div>
      )}
    </div>
  );
}
