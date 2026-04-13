"use client";

import { useState, useMemo } from "react";
import { DataTable } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { BillingBadge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Pagination } from "@/components/ui/pagination";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { useFetch } from "@/hooks/use-fetch";
import { useDebounce } from "@/hooks/useDebounce";
import { formatDateBr } from "@/lib/utils";
import { formatCNPJ, formatCurrency } from "@/lib/formatters";
import { PageHeader } from "@/components/ui/page-header";
import { FilterBar, FilterConfig } from "@/components/ui/filter-bar";
import { ExportButton } from "@/components/ui/export-button";
import { Drawer } from "@/components/ui/drawer";
import { Timeline, TimelineItem } from "@/components/ui/timeline";
import { StatCard } from "@/components/ui/stat-card";
import { PLANO_VALORES } from "@/lib/constants/planos";
import type { Company } from "@/types/database";

const UFS = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
  "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
].map((uf) => ({ value: uf, label: uf }));

const PLANO_OPTIONS = [
  { value: "essencial", label: "Essencial" },
  { value: "profissional", label: "Profissional" },
  { value: "enterprise", label: "Enterprise" },
  { value: "custom", label: "Custom" },
];

const STATUS_OPTIONS = [
  { value: "ativa", label: "Ativa" },
  { value: "inativa", label: "Inativa" },
  { value: "suspensa", label: "Suspensa" },
];

export default function EmpresasPage() {
  const toast = useToast();
  const { data: allCompanies = [], loading, refetch } = useFetch<Company[]>("/api/companies");
  const [modalOpen, setModalOpen] = useState<"new" | "edit" | false>(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmData, setConfirmData] = useState<{ id: string; acao: "habilitar" | "desabilitar" } | null>(null);

  // Filter bar state
  const [filterValues, setFilterValues] = useState<Record<string, string>>({
    search: "",
    status: "",
    plano: "",
    uf: "",
  });
  const debouncedSearch = useDebounce(filterValues.search, 300);

  // Drawer state for detail view
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Get unique UFs from companies
  const availableUFs = useMemo(() => {
    const ufs = new Set((allCompanies ?? []).map(c => c.uf_sede).filter(Boolean));
    return Array.from(ufs).sort().map(uf => ({ value: uf, label: uf }));
  }, [allCompanies]);

  // Filter companies based on all filters
  const filteredCompanies = useMemo(() => {
    return (allCompanies ?? []).filter(c => {
      const matchesSearch = debouncedSearch === "" ||
        c.razao_social?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        c.cnpj?.includes(debouncedSearch) ||
        c.nome_fantasia?.toLowerCase().includes(debouncedSearch.toLowerCase());

      const matchesStatus = filterValues.status === "" ||
        (filterValues.status === "ativa" && c.habilitada) ||
        (filterValues.status === "inativa" && !c.habilitada);

      const matchesPlano = filterValues.plano === "" || c.plano === filterValues.plano;

      const matchesUF = filterValues.uf === "" || c.uf_sede === filterValues.uf;

      return matchesSearch && matchesStatus && matchesPlano && matchesUF;
    });
  }, [allCompanies, debouncedSearch, filterValues]);

  const companies = filteredCompanies;

  // Options for matriz select (only show companies that are "matriz" type)
  const matrizOptions = (allCompanies ?? [])
    .filter((c) => c.tipo_unidade !== "filial" && (!editing || c.id !== editing.id))
    .map((c) => ({ value: c.id, label: `${c.razao_social} (${formatCNPJ(c.cnpj)})` }));

  // Calculate statistics
  const stats = useMemo(() => {
    const list = allCompanies ?? [];
    const totalEmpresas = list.length;
    const ativas = list.filter(c => c.habilitada).length;
    const inadimplentes = list.filter(c => c.billing_status === "inadimplente").length;
    const mrrTotal = list.reduce((sum, c) => sum + (c.valor_mensal || 0), 0);

    return {
      totalEmpresas,
      ativas,
      inadimplentes,
      mrrTotal,
    };
  }, [allCompanies]);

  const totalPages = Math.ceil((companies ?? []).length / pageSize);
  const paginatedCompanies = (companies ?? []).slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Build filter configurations
  const filterConfigs: FilterConfig[] = [
    {
      key: "search",
      label: "Buscar",
      type: "search",
      placeholder: "Por nome, CNPJ ou nome fantasia...",
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: STATUS_OPTIONS,
    },
    {
      key: "plano",
      label: "Plano",
      type: "select",
      options: PLANO_OPTIONS,
    },
    {
      key: "uf",
      label: "UF",
      type: "select",
      options: availableUFs,
    },
  ];

  // Generate mock timeline data for drawer
  const getCompanyTimeline = (company: Company): TimelineItem[] => {
    const items: TimelineItem[] = [];

    if (company.created_at) {
      items.push({
        id: "created",
        title: "Empresa criada",
        timestamp: formatDateBr(company.created_at),
        variant: "default",
      });
    }

    if (company.alvara_validade) {
      items.push({
        id: "alvara",
        title: "Alvará válido até",
        description: `Alvará número ${company.alvara_numero}`,
        timestamp: formatDateBr(company.alvara_validade),
        variant: company.habilitada ? "success" : "warning",
      });
    }

    if (company.billing_status === "inadimplente") {
      items.push({
        id: "billing",
        title: "Pagamento inadimplente",
        description: `Plano ${company.plano} - ${formatCurrency(company.valor_mensal)}`,
        timestamp: "Últimas 24h",
        variant: "danger",
      });
    }

    return items.length > 0 ? items : [{
      id: "no-events",
      title: "Sem eventos",
      timestamp: "---",
      variant: "info",
    }];
  };

  function openEditModal(company: Company) {
    setEditing(company);
    setError("");
    setModalOpen("edit");
  }

  function openDetailDrawer(company: Company) {
    setSelectedCompany(company);
    setDrawerOpen(true);
  }

  function handleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedIds(new Set(paginatedCompanies.map(c => c.id)));
    } else {
      setSelectedIds(new Set());
    }
  }

  function handleSelectRow(id: string, checked: boolean) {
    const newIds = new Set(selectedIds);
    if (checked) {
      newIds.add(id);
    } else {
      newIds.delete(id);
    }
    setSelectedIds(newIds);
  }

  function handleExportSelected() {
    const selectedCompanies = paginatedCompanies.filter(c => selectedIds.has(c.id));

    if (selectedCompanies.length > 0) {
      toast.success(`${selectedCompanies.length} empresa(s) selecionada(s) para exportação`);
    }
  }

  function handleBulkActivate() {
    const selectedCompanies = paginatedCompanies.filter(c => selectedIds.has(c.id));
    // Placeholder for bulk activation logic
    toast.info(`Ativando ${selectedCompanies.length} empresa(s)...`);
    setSelectedIds(new Set());
  }

  function handleBulkDeactivate() {
    const selectedCompanies = paginatedCompanies.filter(c => selectedIds.has(c.id));
    // Placeholder for bulk deactivation logic
    toast.info(`Desativando ${selectedCompanies.length} empresa(s)...`);
    setSelectedIds(new Set());
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const form = new FormData(e.currentTarget);
    const plano = form.get("plano") as string;
    const tipoUnidade = form.get("tipo_unidade") as string || "matriz";
    const matrizId = form.get("matriz_id") as string || null;
    const body: Record<string, unknown> = {
      cnpj: form.get("cnpj") as string,
      razao_social: form.get("razao_social") as string,
      nome_fantasia: form.get("nome_fantasia") as string,
      email_operacional: form.get("email_operacional") as string,
      email_responsavel: form.get("email_responsavel") as string,
      telefone: form.get("telefone") as string,
      uf_sede: form.get("uf_sede") as string,
      plano,
      valor_mensal: plano === "custom"
        ? parseFloat(form.get("valor_mensal") as string) || 0
        : PLANO_VALORES[plano],
      alvara_numero: form.get("alvara_numero") as string,
      alvara_validade: form.get("alvara_validade") as string || undefined,
      tipo_unidade: tipoUnidade,
      matriz_id: tipoUnidade === "filial" && matrizId ? matrizId : null,
    };

    try {
      const url = editing ? `/api/companies/${editing.id}` : "/api/companies";
      const method = editing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erro ao salvar");
        toast.error(data.error || "Erro ao salvar empresa");
        return;
      }

      setModalOpen(false);
      toast.success(editing ? "Empresa atualizada com sucesso" : "Empresa cadastrada com sucesso");
      refetch();
    } catch (_err) {
      const message = "Erro de conexão";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleHabilitar() {
    if (!confirmData) return;
    try {
      const res = await fetch(`/api/companies/${confirmData.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: confirmData.acao }),
      });
      if (res.ok) {
        toast.success(confirmData.acao === "habilitar" ? "Empresa habilitada" : "Empresa desabilitada");
        refetch();
      } else {
        toast.error("Erro ao atualizar empresa");
      }
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setConfirmOpen(false);
      setConfirmData(null);
    }
  }

  const columns = [
    {
      key: "select",
      header: (
        <input
          type="checkbox"
          checked={selectedIds.size === paginatedCompanies.length && paginatedCompanies.length > 0}
          onChange={(e) => handleSelectAll(e.target.checked)}
          className="w-4 h-4 rounded border-[var(--border-primary)] cursor-pointer"
          aria-label="Selecionar todas as empresas"
        />
      ),
      render: (c: Company) => (
        <input
          type="checkbox"
          checked={selectedIds.has(c.id)}
          onChange={(e) => handleSelectRow(c.id, e.target.checked)}
          className="w-4 h-4 rounded border-[var(--border-primary)] cursor-pointer"
          aria-label={`Selecionar ${c.razao_social}`}
        />
      ),
    },
    {
      key: "razao_social",
      header: "Razão Social",
      render: (c: Company) => (
        <button
          onClick={() => openDetailDrawer(c)}
          className="text-left hover:text-[var(--ds-primary)] transition-colors"
        >
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium text-[var(--vigi-navy)]">{c.razao_social}</p>
              {c.tipo_unidade === "filial" && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--ds-primary-light)] text-[var(--ds-primary)] font-medium">
                  Filial
                </span>
              )}
            </div>
            {c.nome_fantasia && (
              <p className="text-xs text-[var(--text-tertiary)]">{c.nome_fantasia}</p>
            )}
          </div>
        </button>
      ),
    },
    {
      key: "cnpj",
      header: "CNPJ",
      render: (c: Company) => <span className="text-[var(--text-primary)]">{formatCNPJ(c.cnpj)}</span>,
    },
    {
      key: "plano",
      header: "Plano",
      render: (c: Company) => (
        <span className="capitalize text-[var(--text-primary)]">{c.plano}</span>
      ),
    },
    {
      key: "valor_mensal",
      header: "Valor",
      render: (c: Company) => <span className="text-[var(--text-primary)]">{formatCurrency(c.valor_mensal)}</span>,
    },
    {
      key: "billing_status",
      header: "Status",
      render: (c: Company) => <BillingBadge status={c.billing_status} />,
    },
    {
      key: "alvara_validade",
      header: "Alvará",
      render: (c: Company) => <span className="text-[var(--text-primary)]">{formatDateBr(c.alvara_validade)}</span>,
    },
    {
      key: "acoes",
      header: "",
      render: (c: Company) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              openEditModal(c);
            }}
          >
            Editar
          </Button>
          {!c.habilitada ? (
            <Button
              size="sm"
              aria-label={`Habilitar empresa ${c.razao_social}`}
              onClick={(e) => {
                e.stopPropagation();
                setConfirmData({ id: c.id, acao: "habilitar" });
                setConfirmOpen(true);
              }}
            >
              Habilitar
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Desabilitar empresa ${c.razao_social}`}
              onClick={(e) => {
                e.stopPropagation();
                setConfirmData({ id: c.id, acao: "desabilitar" });
                setConfirmOpen(true);
              }}
            >
              Desabilitar
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      {/* Page Header with Actions */}
      <PageHeader
        title="Empresas"
        subtitle="Gerenciamento de empresas"
        actions={
          <div className="flex items-center gap-2">
            <ExportButton
              data={companies}
              filename="empresas"
              columns={[
                { key: "razao_social", label: "Razão Social" },
                { key: "cnpj", label: "CNPJ" },
                { key: "plano", label: "Plano" },
                { key: "valor_mensal", label: "Valor Mensal" },
                { key: "billing_status", label: "Status" },
              ]}
            />
            <Button
              aria-label="Criar nova empresa"
              onClick={() => { setEditing(null); setError(""); setModalOpen("new"); }}
            >
              Nova Empresa
            </Button>
          </div>
        }
      />

      {/* Statistics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total de Empresas"
          value={stats.totalEmpresas}
          variant="default"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m4 0h5M9 7h.01M9 11h.01M9 15h.01" />
            </svg>
          }
        />
        <StatCard
          label="Empresas Ativas"
          value={stats.ativas}
          variant="success"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Inadimplentes"
          value={stats.inadimplentes}
          variant={stats.inadimplentes > 0 ? "danger" : "default"}
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="MRR Total"
          value={formatCurrency(stats.mrrTotal)}
          variant="info"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      {/* Filter Bar */}
      <FilterBar
        filters={filterConfigs}
        values={filterValues}
        onChange={(key, value) => {
          setFilterValues(prev => ({ ...prev, [key]: value }));
          setCurrentPage(1);
        }}
        onClear={() => {
          setFilterValues({ search: "", status: "", plano: "", uf: "" });
          setCurrentPage(1);
        }}
      />

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="vigi-card p-4 mb-4 bg-[var(--ds-primary-light)] border border-[var(--ds-primary)]">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-[var(--text-primary)]">
              {selectedIds.size} empresa(s) selecionada(s)
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={handleBulkActivate}
              >
                Ativar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleBulkDeactivate}
              >
                Desativar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleExportSelected}
              >
                Exportar Selecionados
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedIds(new Set())}
              >
                Limpar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Empty States */}
      {!loading && (companies ?? []).length === 0 && filterValues.search && (
        <EmptyState
          icon="🔍"
          title="Nenhuma empresa encontrada"
          description={`Nenhuma empresa encontrada para "${filterValues.search}". Tente outro termo de busca.`}
        />
      )}

      {!loading && (companies ?? []).length === 0 && !filterValues.search && (
        <EmptyState
          icon="🏢"
          title="Nenhuma empresa encontrada"
          description="Cadastre uma nova empresa para começar."
          actionLabel="Nova Empresa"
          onAction={() => setModalOpen("new")}
        />
      )}

      {/* Data Table */}
      {(companies ?? []).length > 0 && (
        <div className="vigi-card p-6 mb-6">
          <div className="overflow-x-auto">
            <DataTable
              columns={columns}
              data={paginatedCompanies}
              loading={loading}
              emptyMessage="Nenhuma empresa cadastrada."
            />
          </div>
        </div>
      )}

      {/* Pagination */}
      {!loading && (companies ?? []).length > 0 && (
        <div className="mt-6">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalCount={(companies ?? []).length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setCurrentPage(1);
            }}
          />
        </div>
      )}

      {/* Detail Drawer */}
      {selectedCompany && (
        <Drawer
          open={drawerOpen}
          onClose={() => {
            setDrawerOpen(false);
            setSelectedCompany(null);
          }}
          title={selectedCompany.razao_social}
          subtitle={formatCNPJ(selectedCompany.cnpj)}
        >
          <div className="space-y-6">
            {/* Company Info */}
            <div className="space-y-3">
              <div>
                <p className="text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1">
                  Nome Fantasia
                </p>
                <p className="text-[13px] text-[var(--text-primary)]">
                  {selectedCompany.nome_fantasia || "---"}
                </p>
              </div>
              <div>
                <p className="text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1">
                  Plano
                </p>
                <p className="text-[13px] text-[var(--text-primary)] capitalize">
                  {selectedCompany.plano}
                </p>
              </div>
              <div>
                <p className="text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1">
                  Valor Mensal
                </p>
                <p className="text-[13px] text-[var(--text-primary)]">
                  {formatCurrency(selectedCompany.valor_mensal)}
                </p>
              </div>
              <div>
                <p className="text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1">
                  Status Cobrança
                </p>
                <div className="mt-1">
                  <BillingBadge status={selectedCompany.billing_status} />
                </div>
              </div>
              <div>
                <p className="text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1">
                  UF Sede
                </p>
                <p className="text-[13px] text-[var(--text-primary)]">
                  {selectedCompany.uf_sede}
                </p>
              </div>
            </div>

            {/* Timeline */}
            <div className="border-t border-[var(--border-primary)] pt-6">
              <h3 className="text-[13px] font-semibold text-[var(--text-primary)] mb-4">
                Eventos
              </h3>
              <Timeline items={getCompanyTimeline(selectedCompany)} maxItems={5} />
            </div>

            {/* Actions */}
            <div className="border-t border-[var(--border-primary)] pt-6 flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                onClick={() => {
                  openEditModal(selectedCompany);
                  setDrawerOpen(false);
                }}
              >
                Editar
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="flex-1"
                onClick={() => setDrawerOpen(false)}
              >
                Fechar
              </Button>
            </div>
          </div>
        </Drawer>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => {
          setConfirmOpen(false);
          setConfirmData(null);
        }}
        title={confirmData?.acao === "habilitar" ? "Habilitar Empresa" : "Desabilitar Empresa"}
        message={confirmData?.acao === "habilitar"
          ? "Tem certeza que deseja habilitar esta empresa?"
          : "Tem certeza que deseja desabilitar esta empresa?"}
        confirmLabel={confirmData?.acao === "habilitar" ? "Habilitar" : "Desabilitar"}
        onConfirm={handleHabilitar}
        variant={confirmData?.acao === "desabilitar" ? "danger" : "default"}
      />

      <Modal
        open={modalOpen !== false}
        onClose={() => setModalOpen(false)}
        title={editing ? "Editar Empresa" : "Nova Empresa"}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              id="cnpj"
              name="cnpj"
              label="CNPJ"
              required
              placeholder="00.000.000/0000-00"
              defaultValue={editing?.cnpj || ""}
              disabled={!!editing}
            />
            <Input
              id="razao_social"
              name="razao_social"
              label="Razão Social"
              required
              defaultValue={editing?.razao_social || ""}
            />
            <Input
              id="nome_fantasia"
              name="nome_fantasia"
              label="Nome Fantasia"
              defaultValue={editing?.nome_fantasia || ""}
            />
            <Select
              id="uf_sede"
              name="uf_sede"
              label="UF Sede"
              required
              options={UFS}
              placeholder="Selecione..."
              defaultValue={editing?.uf_sede || ""}
            />
            <Input
              id="email_operacional"
              name="email_operacional"
              label="Email Operacional"
              type="email"
              required
              defaultValue={editing?.email_operacional || ""}
            />
            <Input
              id="email_responsavel"
              name="email_responsavel"
              label="Email Responsável"
              type="email"
              required
              defaultValue={editing?.email_responsavel || ""}
            />
            <Input
              id="telefone"
              name="telefone"
              label="Telefone"
              defaultValue={editing?.telefone || ""}
            />
            <Select
              id="plano"
              name="plano"
              label="Plano"
              required
              options={PLANO_OPTIONS}
              defaultValue={editing?.plano || "essencial"}
            />
            <Input
              id="valor_mensal"
              name="valor_mensal"
              label="Valor Mensal (Custom)"
              type="number"
              step="0.01"
              defaultValue={editing?.valor_mensal?.toString() || ""}
            />
            <Input
              id="alvara_numero"
              name="alvara_numero"
              label="Nº Alvará"
              defaultValue={editing?.alvara_numero || ""}
            />
            <Input
              id="alvara_validade"
              name="alvara_validade"
              label="Validade Alvará"
              type="date"
              defaultValue={editing?.alvara_validade || ""}
            />
          </div>

          {/* Vínculo Matriz / Filial */}
          <div className="border-t border-[var(--border-primary)] pt-4 mt-2">
            <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-3">Vínculo Matriz / Filial</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                id="tipo_unidade"
                name="tipo_unidade"
                label="Tipo de Unidade"
                options={[
                  { value: "matriz", label: "Matriz" },
                  { value: "filial", label: "Filial" },
                ]}
                defaultValue={editing?.tipo_unidade || "matriz"}
              />
              <Select
                id="matriz_id"
                name="matriz_id"
                label="Empresa Matriz (se filial)"
                options={matrizOptions}
                placeholder="Selecione a matriz..."
                defaultValue={editing?.matriz_id || ""}
              />
            </div>
          </div>

          {error && <p className="text-sm text-[var(--status-danger)] bg-[var(--status-danger-bg)] p-2 rounded">{error}</p>}

          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-primary)]">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? "Salvar" : "Cadastrar"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
