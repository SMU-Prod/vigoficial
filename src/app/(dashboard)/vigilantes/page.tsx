"use client";

import { useState, useMemo } from "react";
import { DataTable } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { EmployeeBadge, Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

import { Pagination } from "@/components/ui/pagination";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/empty-state";
import { useFetch } from "@/hooks/use-fetch";
import { useDebounce } from "@/hooks/useDebounce";
import { formatDateBr, diasRestantes, cn } from "@/lib/utils";
import { formatCPF } from "@/lib/formatters";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { FilterBar, type FilterConfig } from "@/components/ui/filter-bar";
import { ExportButton } from "@/components/ui/export-button";
import { Drawer } from "@/components/ui/drawer";
import { Timeline, type TimelineItem } from "@/components/ui/timeline";

import { FUNCOES_PF } from "@/lib/constants/funcoes";
import type { Employee } from "@/types/database";

const UFS = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
  "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
].map((uf) => ({ value: uf, label: uf }));

const STATUS_OPTIONS = [
  { value: "ativo", label: "Ativo" },
  { value: "inativo", label: "Inativo" },
  { value: "afastado", label: "Férias" },
  { value: "demitido", label: "Treinamento" },
];

const VALIDADE_OPTIONS = [
  { value: "valido", label: "Válido" },
  { value: "vencendo", label: "Vencendo" },
  { value: "vencido", label: "Vencido" },
];

export default function VigilantesPage() {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterFuncao, setFilterFuncao] = useState("");
  const [filterValidade, setFilterValidade] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<(Employee & { companies?: { razao_social: string } }) | null>(null);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmData, setConfirmData] = useState<{ id: string; nome: string } | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const params = new URLSearchParams();
  if (debouncedSearch) params.set("search", debouncedSearch);
  if (filterStatus) params.set("status", filterStatus);
  if (filterFuncao) params.set("funcao", filterFuncao);

  const { data: employees = [], loading, refetch } = useFetch<(Employee & { companies?: { razao_social: string } })[]>(
    `/api/employees?${params.toString()}`,
    { skip: false }
  );

  // Calculate stats
  const stats = useMemo(() => {
    const total = (employees ?? []).length;
    const ativos = (employees ?? []).filter(e => e.status === "ativo").length;
    const cnvVencendo = (employees ?? []).filter(e => {
      const dias = diasRestantes(e.cnv_data_validade);
      return dias !== null && dias > 0 && dias <= 30;
    }).length;
    const documentosPendentes = 0; // TODO(sprint-3): integrar com API de documentos pendentes

    return { total, ativos, cnvVencendo, documentosPendentes };
  }, [employees]);

  // Filter by validade
  const filteredEmployees = useMemo(() => {
    const list = employees ?? [];
    if (!filterValidade) return list;
    return list.filter(e => {
      const dias = diasRestantes(e.cnv_data_validade);
      if (filterValidade === "valido") return dias !== null && dias > 30;
      if (filterValidade === "vencendo") return dias !== null && dias > 0 && dias <= 30;
      if (filterValidade === "vencido") return dias !== null && dias <= 0;
      return true;
    });
  }, [employees, filterValidade]);

  const totalPages = Math.ceil(filteredEmployees.length / pageSize);
  const paginatedEmployees = filteredEmployees.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Build timeline for drawer
  const buildTimeline = (emp: Employee): TimelineItem[] => {
    const items: TimelineItem[] = [];

    if (emp.data_admissao) {
      items.push({
        id: "admissao",
        title: "Data de Admissão",
        timestamp: formatDateBr(emp.data_admissao),
        variant: "success",
      });
    }

    if (emp.cnv_data_validade) {
      const dias = diasRestantes(emp.cnv_data_validade);
      let variant: "default" | "success" | "warning" | "danger" | "info" = "default";
      if (dias !== null && dias <= 7) variant = "danger";
      else if (dias !== null && dias <= 15) variant = "warning";
      else if (dias !== null && dias > 0) variant = "success";

      items.push({
        id: "cnv",
        title: "CNV Vencimento",
        timestamp: formatDateBr(emp.cnv_data_validade),
        variant,
      });
    }

    if (emp.reciclagem_data_validade) {
      const dias = diasRestantes(emp.reciclagem_data_validade);
      let variant: "default" | "success" | "warning" | "danger" | "info" = "default";
      if (dias !== null && dias <= 7) variant = "danger";
      else if (dias !== null && dias <= 15) variant = "warning";
      else if (dias !== null && dias > 0) variant = "success";

      items.push({
        id: "reciclagem",
        title: "Reciclagem Vencimento",
        timestamp: formatDateBr(emp.reciclagem_data_validade),
        variant,
      });
    }

    return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setValidationErrors({});

    const form = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {};
    const errors: Record<string, string> = {};

    form.forEach((value, key) => {
      if (value !== "") body[key] = value;
    });

    // Client-side validation
    if (!body.nome_completo || typeof body.nome_completo !== "string" || !body.nome_completo.trim()) {
      errors.nome_completo = "Nome completo é obrigatório";
    }
    if (!body.cpf || typeof body.cpf !== "string" || !body.cpf.trim()) {
      errors.cpf = "CPF é obrigatório";
    } else if (body.cpf.replace(/\D/g, "").length !== 11) {
      errors.cpf = "CPF inválido (deve ter 11 dígitos)";
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      setSaving(false);
      return;
    }

    try {
      const url = editing ? `/api/employees/${editing.id}` : "/api/employees";
      const method = editing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        const errorMsg = data.error || JSON.stringify(data.details?.[0]?.message || "Erro ao salvar");
        setError(errorMsg);
        toast.error(errorMsg);
        return;
      }

      setModalOpen(false);
      toast.success(editing ? "Vigilante atualizado com sucesso" : "Vigilante cadastrado com sucesso");
      refetch();
    } catch (_err) {
      const message = "Erro de conexão";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!confirmData) return;
    try {
      const res = await fetch(`/api/employees/${confirmData.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Vigilante removido com sucesso");
        refetch();
      } else {
        toast.error("Erro ao remover vigilante");
      }
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setConfirmOpen(false);
      setConfirmData(null);
    }
  }

  type EmployeeRow = Employee & { companies?: { razao_social: string } };

  const columns = [
    {
      key: "nome_completo",
      header: "Nome",
      render: (e: EmployeeRow) => (
        <div>
          <p className="font-medium text-[var(--vigi-navy)]">{e.nome_completo}</p>
          <p className="text-xs text-[var(--text-tertiary)]">{e.companies?.razao_social}</p>
        </div>
      ),
    },
    {
      key: "cpf",
      header: "CPF",
      render: (e: EmployeeRow) => formatCPF(e.cpf),
    },
    {
      key: "funcao_principal",
      header: "Função",
      render: (e: EmployeeRow) => (
        <span className="text-xs">{e.funcao_principal}</span>
      ),
    },
    {
      key: "cnv_data_validade",
      header: "CNV Validade",
      render: (e: EmployeeRow) => {
        const dias = diasRestantes(e.cnv_data_validade);
        let badgeVariant: "green" | "yellow" | "red" | "gray" = "green";

        if (dias === null) badgeVariant = "gray";
        else if (dias <= 7) badgeVariant = "red";
        else if (dias <= 30) badgeVariant = "yellow";

        return (
          <div className="flex items-center gap-2">
            <span>{formatDateBr(e.cnv_data_validade)}</span>
            {dias !== null && dias <= 30 && (
              <Badge variant={badgeVariant}>
                {dias > 0 ? `${dias}d` : "Vencida"}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      render: (e: EmployeeRow) => <EmployeeBadge status={e.status} />,
    },
  ];

  const filterConfigs: FilterConfig[] = [
    {
      key: "search",
      label: "Nome ou CPF",
      type: "search",
      placeholder: "Buscar...",
    },
    {
      key: "funcao",
      label: "Função",
      type: "select",
      options: FUNCOES_PF,
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: STATUS_OPTIONS,
    },
    {
      key: "validade",
      label: "Validade CNV",
      type: "select",
      options: VALIDADE_OPTIONS,
    },
  ];

  const filterValues = {
    search: debouncedSearch,
    funcao: filterFuncao,
    status: filterStatus,
    validade: filterValidade,
  };

  const handleFilterChange = (key: string, value: string) => {
    if (key === "search") setSearch(value);
    else if (key === "funcao") setFilterFuncao(value);
    else if (key === "status") setFilterStatus(value);
    else if (key === "validade") setFilterValidade(value);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSearch("");
    setFilterFuncao("");
    setFilterStatus("");
    setFilterValidade("");
    setCurrentPage(1);
  };

  // Export columns mapping
  const exportColumns = [
    { key: "nome_completo", label: "Nome" },
    { key: "cpf", label: "CPF" },
    { key: "funcao_principal", label: "Função" },
    { key: "status", label: "Status" },
    { key: "cnv_numero", label: "CNV Número" },
    { key: "cnv_data_validade", label: "CNV Validade" },
    { key: "email", label: "Email" },
    { key: "telefone1", label: "Telefone" },
  ];

  // Prepare export data with formatted values
  const exportData = paginatedEmployees.map(e => ({
    nome_completo: e.nome_completo,
    cpf: formatCPF(e.cpf),
    funcao_principal: e.funcao_principal,
    status: e.status,
    cnv_numero: e.cnv_numero,
    cnv_data_validade: formatDateBr(e.cnv_data_validade),
    email: e.email,
    telefone1: e.telefone1,
  }));

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Vigilantes"
        subtitle="Gestão de vigilantes e documentação"
        actions={
          <div className="flex gap-2">
            <ExportButton
              data={exportData}
              filename={`vigilantes_${new Date().toISOString().split('T')[0]}`}
              columns={exportColumns}
            />
            <Button
              onClick={() => {
                setEditing(null);
                setError("");
                setModalOpen(true);
              }}
              aria-label="Adicionar novo vigilante"
            >
              Novo Vigilante
            </Button>
          </div>
        }
      />

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total de Vigilantes"
          value={stats.total}
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 12H9m6 0a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
          variant="info"
          loading={loading}
        />
        <StatCard
          label="Ativos"
          value={stats.ativos}
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          variant="success"
          loading={loading}
        />
        <StatCard
          label="CNV Vencendo"
          value={stats.cnvVencendo}
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          variant="warning"
          loading={loading}
        />
        <StatCard
          label="Documentos Pendentes"
          value={stats.documentosPendentes}
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
          variant="danger"
          loading={loading}
        />
      </div>

      {/* Filter Bar */}
      <FilterBar
        filters={filterConfigs}
        values={filterValues}
        onChange={handleFilterChange}
        onClear={handleClearFilters}
      />

      {/* Data Table */}
      <div className="vigi-card p-6">
        {!loading && filteredEmployees.length === 0 && (employees?.length ?? 0) === 0 ? (
          <EmptyState
            icon="👮"
            title="Nenhum vigilante encontrado"
            description="Cadastre vigilantes para gerenciar sua equipe."
            actionLabel="Novo Vigilante"
            onAction={() => {
              setEditing(null);
              setError("");
              setModalOpen(true);
            }}
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              data={paginatedEmployees}
              loading={loading}
              onRowClick={(e) => {
                setSelectedEmployee(e);
                setDrawerOpen(true);
              }}
              emptyMessage="Nenhum vigilante encontrado."
            />

            {!loading && filteredEmployees.length > 0 && (
              <div className="mt-6 border-t border-[var(--border-primary)] pt-6">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalCount={filteredEmployees.length}
                  pageSize={pageSize}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={(newSize) => {
                    setPageSize(newSize);
                    setCurrentPage(1);
                  }}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selectedEmployee?.nome_completo ?? ""}
        subtitle={selectedEmployee?.funcao_principal ?? ""}
        width="lg"
      >
        {selectedEmployee && (
          <div className="space-y-6">
            {/* Personal Info */}
            <section>
              <h3 className="text-sm font-semibold text-[var(--vigi-navy)] mb-3">Informações Pessoais</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">CPF:</span>
                  <span className="font-medium text-[var(--text-primary)]">{formatCPF(selectedEmployee.cpf)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">Data Nascimento:</span>
                  <span className="font-medium text-[var(--text-primary)]">{formatDateBr(selectedEmployee.data_nascimento)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">Email:</span>
                  <span className="font-medium text-[var(--text-primary)]">{selectedEmployee.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">Telefone:</span>
                  <span className="font-medium text-[var(--text-primary)]">{selectedEmployee.telefone1}</span>
                </div>
              </div>
            </section>

            {/* Document Status */}
            <section>
              <h3 className="text-sm font-semibold text-[var(--vigi-navy)] mb-3">Status de Documentos</h3>
              <div className="space-y-3">
                {/* CNV */}
                <div className="vigi-card p-3 bg-[var(--bg-tertiary)]">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-xs font-medium text-[var(--text-secondary)]">CNV</p>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{selectedEmployee.cnv_numero}</p>
                    </div>
                    {(() => {
                      const dias = diasRestantes(selectedEmployee.cnv_data_validade);
                      if (dias === null) return <Badge variant="gray">Sem data</Badge>;
                      if (dias <= 0) return <Badge variant="red">Vencida</Badge>;
                      if (dias <= 7) return <Badge variant="red">{dias}d restante</Badge>;
                      if (dias <= 15) return <Badge variant="yellow">{dias}d restante</Badge>;
                      return <Badge variant="green">Válida</Badge>;
                    })()}
                  </div>
                  <p className="text-xs text-[var(--text-secondary)]">Validade: {formatDateBr(selectedEmployee.cnv_data_validade)}</p>
                </div>

                {/* Reciclagem */}
                {selectedEmployee.reciclagem_data_validade && (
                  <div className="vigi-card p-3 bg-[var(--bg-tertiary)]">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-xs font-medium text-[var(--text-secondary)]">Reciclagem</p>
                        <p className="text-sm font-semibold text-[var(--text-primary)]">{selectedEmployee.reciclagem_escola || "Não informado"}</p>
                      </div>
                      {(() => {
                        const dias = diasRestantes(selectedEmployee.reciclagem_data_validade!);
                        if (dias === null) return <Badge variant="gray">Sem data</Badge>;
                        if (dias <= 0) return <Badge variant="red">Vencida</Badge>;
                        if (dias <= 7) return <Badge variant="red">{dias}d restante</Badge>;
                        if (dias <= 15) return <Badge variant="yellow">{dias}d restante</Badge>;
                        return <Badge variant="green">Válida</Badge>;
                      })()}
                    </div>
                    <p className="text-xs text-[var(--text-secondary)]">Validade: {formatDateBr(selectedEmployee.reciclagem_data_validade)}</p>
                  </div>
                )}

                {/* Porte de Arma */}
                {selectedEmployee.porte_arma_validade && (
                  <div className="vigi-card p-3 bg-[var(--bg-tertiary)]">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-xs font-medium text-[var(--text-secondary)]">Porte de Arma</p>
                        <p className="text-sm font-semibold text-[var(--text-primary)]">{selectedEmployee.arma_numero_serie || "Não informado"}</p>
                      </div>
                      {(() => {
                        const dias = diasRestantes(selectedEmployee.porte_arma_validade!);
                        if (dias === null) return <Badge variant="gray">Sem data</Badge>;
                        if (dias <= 0) return <Badge variant="red">Vencida</Badge>;
                        if (dias <= 7) return <Badge variant="red">{dias}d restante</Badge>;
                        if (dias <= 15) return <Badge variant="yellow">{dias}d restante</Badge>;
                        return <Badge variant="green">Válida</Badge>;
                      })()}
                    </div>
                    <p className="text-xs text-[var(--text-secondary)]">Validade: {formatDateBr(selectedEmployee.porte_arma_validade)}</p>
                  </div>
                )}
              </div>
            </section>

            {/* Upload Area */}
            <section>
              <h3 className="text-sm font-semibold text-[var(--vigi-navy)] mb-3">Documentos</h3>
              <div className={cn(
                "border-2 border-dashed border-[var(--border-primary)]",
                "rounded-[var(--radius-md)]",
                "p-6 text-center",
                "bg-[var(--bg-tertiary)]",
                "hover:bg-[var(--bg-hover)] transition-colors duration-150",
                "cursor-pointer"
              )}>
                <svg className="w-8 h-8 mx-auto mb-2 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <p className="text-sm font-medium text-[var(--text-secondary)]">Upload documentos</p>
                <p className="text-xs text-[var(--text-tertiary)] mt-1">Arraste arquivos ou clique para selecionar</p>
              </div>
            </section>

            {/* Timeline */}
            {buildTimeline(selectedEmployee).length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-[var(--vigi-navy)] mb-3">Histórico</h3>
                <Timeline items={buildTimeline(selectedEmployee)} maxItems={3} />
              </section>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-4 border-t border-[var(--border-primary)]">
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={() => {
                  setDrawerOpen(false);
                  setEditing(selectedEmployee as Employee);
                  setError("");
                  setModalOpen(true);
                }}
              >
                Editar
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="flex-1 text-[var(--status-danger)]"
                onClick={() => {
                  setDrawerOpen(false);
                  setConfirmData({ id: selectedEmployee.id, nome: selectedEmployee.nome_completo });
                  setConfirmOpen(true);
                }}
              >
                Remover
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => {
          setConfirmOpen(false);
          setConfirmData(null);
        }}
        title="Remover Vigilante"
        message={`Tem certeza que deseja remover ${confirmData?.nome}? Esta ação não pode ser desfeita.`}
        confirmLabel="Remover"
        cancelLabel="Cancelar"
        onConfirm={handleDeleteConfirm}
        variant="danger"
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Editar — ${editing.nome_completo}` : "Novo Vigilante"}
        size="xl"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Bloco 1 — Identificação Civil */}
          <fieldset>
            <legend className="text-sm font-semibold text-[var(--vigi-navy)] border-b border-[var(--border-primary)] pb-1 mb-3">
              Identificação Civil
            </legend>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {!editing && (
                <Input id="company_id" name="company_id" label="ID da Empresa" required defaultValue="" aria-label="ID da Empresa" />
              )}
              <div className="md:col-span-2">
                <Input id="nome_completo" name="nome_completo" label="Nome Completo" required defaultValue={editing?.nome_completo || ""} aria-label="Nome Completo" aria-describedby={validationErrors.nome_completo ? "nome_completo_error" : undefined} />
                {validationErrors.nome_completo && <p id="nome_completo_error" className="text-xs text-[var(--status-danger)] mt-1">{validationErrors.nome_completo}</p>}
              </div>
              <div>
                <Input id="cpf" name="cpf" label="CPF" required defaultValue={editing?.cpf || ""} placeholder="000.000.000-00" aria-label="CPF" aria-describedby={validationErrors.cpf ? "cpf_error" : undefined} />
                {validationErrors.cpf && <p id="cpf_error" className="text-xs text-[var(--status-danger)] mt-1">{validationErrors.cpf}</p>}
              </div>
              <Input id="rg" name="rg" label="RG" required defaultValue={editing?.rg || ""} aria-label="RG" />
              <Input id="rg_orgao_emissor" name="rg_orgao_emissor" label="Órgão Emissor" required defaultValue={editing?.rg_orgao_emissor || ""} aria-label="Órgão Emissor do RG" />
              <Select id="rg_uf" name="rg_uf" label="UF RG" required options={UFS} defaultValue={editing?.rg_uf || ""} placeholder="UF" aria-label="UF do RG" />
              <Input id="data_nascimento" name="data_nascimento" label="Data Nascimento" type="date" required defaultValue={editing?.data_nascimento || ""} aria-label="Data de Nascimento" />
              <Select id="sexo" name="sexo" label="Sexo" required options={[{value:"M",label:"Masculino"},{value:"F",label:"Feminino"}]} defaultValue={editing?.sexo || ""} placeholder="Selecione" aria-label="Sexo" />
              <Input id="nome_mae" name="nome_mae" label="Nome da Mãe" required defaultValue={editing?.nome_mae || ""} aria-label="Nome da Mãe" />
              <Input id="nome_pai" name="nome_pai" label="Nome do Pai" defaultValue={editing?.nome_pai || ""} aria-label="Nome do Pai" />
            </div>
          </fieldset>

          {/* Bloco 2 — Contato */}
          <fieldset>
            <legend className="text-sm font-semibold text-[var(--vigi-navy)] border-b border-[var(--border-primary)] pb-1 mb-3">
              Contato e Endereço
            </legend>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input id="email" name="email" label="Email" type="email" required defaultValue={editing?.email || ""} aria-label="Email" />
              <Input id="telefone1" name="telefone1" label="Telefone 1" required defaultValue={editing?.telefone1 || ""} aria-label="Telefone Primário" />
              <Input id="telefone2" name="telefone2" label="Telefone 2" defaultValue={editing?.telefone2 || ""} aria-label="Telefone Secundário" />
              <Input id="cep" name="cep" label="CEP" defaultValue={editing?.cep || ""} aria-label="CEP" />
              <Input id="logradouro" name="logradouro" label="Logradouro" defaultValue={editing?.logradouro || ""} className="md:col-span-2" aria-label="Logradouro" />
              <Input id="numero" name="numero" label="Número" defaultValue={editing?.numero || ""} aria-label="Número do Endereço" />
              <Input id="bairro" name="bairro" label="Bairro" defaultValue={editing?.bairro || ""} aria-label="Bairro" />
              <Input id="cidade" name="cidade" label="Cidade" defaultValue={editing?.cidade || ""} aria-label="Cidade" />
              <Select id="uf" name="uf" label="UF" options={UFS} defaultValue={editing?.uf || ""} placeholder="UF" aria-label="Estado" />
            </div>
          </fieldset>

          {/* Bloco 3 — Situação Funcional */}
          <fieldset>
            <legend className="text-sm font-semibold text-[var(--vigi-navy)] border-b border-[var(--border-primary)] pb-1 mb-3">
              Situação Funcional
            </legend>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Select id="funcao_principal" name="funcao_principal" label="Função PF" required options={FUNCOES_PF} defaultValue={editing?.funcao_principal || ""} placeholder="Selecione" aria-label="Função Principal" />
              <Select id="tipo_vinculo" name="tipo_vinculo" label="Vínculo" required options={[{value:"CLT",label:"CLT"},{value:"Terceirizado",label:"Terceirizado"}]} defaultValue={editing?.tipo_vinculo || "CLT"} aria-label="Tipo de Vínculo" />
              <Select id="status" name="status" label="Status" required options={[{value:"ativo",label:"Ativo"},{value:"inativo",label:"Inativo"},{value:"afastado",label:"Afastado"},{value:"demitido",label:"Demitido"}]} defaultValue={editing?.status || "ativo"} aria-label="Status do Vigilante" />
              <Input id="data_admissao" name="data_admissao" label="Data Admissão" type="date" required defaultValue={editing?.data_admissao || ""} aria-label="Data de Admissão" />
              <Input id="data_desligamento" name="data_desligamento" label="Data Desligamento" type="date" defaultValue={editing?.data_desligamento || ""} aria-label="Data de Desligamento" />
            </div>
          </fieldset>

          {/* Bloco 4 — CNV */}
          <fieldset>
            <legend className="text-sm font-semibold text-[var(--vigi-navy)] border-b border-[var(--border-primary)] pb-1 mb-3">
              CNV — Carteira Nacional de Vigilante
            </legend>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input id="cnv_numero" name="cnv_numero" label="Nº CNV" required defaultValue={editing?.cnv_numero || ""} aria-label="Número da CNV" />
              <Select id="cnv_uf_emissora" name="cnv_uf_emissora" label="UF Emissora" required options={UFS} defaultValue={editing?.cnv_uf_emissora || ""} placeholder="UF" aria-label="UF Emissora da CNV" />
              <Input id="cnv_data_emissao" name="cnv_data_emissao" label="Data Emissão" type="date" required defaultValue={editing?.cnv_data_emissao || ""} aria-label="Data de Emissão da CNV" />
              <Input id="cnv_data_validade" name="cnv_data_validade" label="Data Validade" type="date" required defaultValue={editing?.cnv_data_validade || ""} aria-label="Data de Validade da CNV" />
              <Select id="cnv_situacao" name="cnv_situacao" label="Situação" required options={[{value:"valida",label:"Válida"},{value:"vencida",label:"Vencida"},{value:"suspensa",label:"Suspensa"},{value:"cancelada",label:"Cancelada"}]} defaultValue={editing?.cnv_situacao || "valida"} aria-label="Situação da CNV" />
            </div>
          </fieldset>

          {/* Bloco 5/6/7 — Reciclagem, Formação, Armamento */}
          <fieldset>
            <legend className="text-sm font-semibold text-[var(--vigi-navy)] border-b border-[var(--border-primary)] pb-1 mb-3">
              Reciclagem, Formação e Armamento
            </legend>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input id="reciclagem_data_validade" name="reciclagem_data_validade" label="Reciclagem Validade" type="date" defaultValue={editing?.reciclagem_data_validade || ""} aria-label="Data de Validade da Reciclagem" />
              <Input id="reciclagem_escola" name="reciclagem_escola" label="Escola Reciclagem" defaultValue={editing?.reciclagem_escola || ""} aria-label="Escola de Reciclagem" />
              <Input id="arma_numero_serie" name="arma_numero_serie" label="Arma Nº Série" defaultValue={editing?.arma_numero_serie || ""} aria-label="Número de Série da Arma" />
              <Input id="porte_arma_validade" name="porte_arma_validade" label="Porte Arma Validade" type="date" defaultValue={editing?.porte_arma_validade || ""} aria-label="Data de Validade do Porte de Arma" />
              <Input id="colete_numero_serie" name="colete_numero_serie" label="Colete Nº Série" defaultValue={editing?.colete_numero_serie || ""} aria-label="Número de Série do Colete" />
              <Input id="colete_data_validade" name="colete_data_validade" label="Colete Validade" type="date" defaultValue={editing?.colete_data_validade || ""} aria-label="Data de Validade do Colete" />
            </div>
          </fieldset>

          {error && <p className="text-sm text-[var(--status-danger)] bg-[var(--bg-error)] p-2 rounded">{error}</p>}

          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-primary)]">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)} aria-label="Cancelar formulário">
              Cancelar
            </Button>
            <Button type="submit" loading={saving} aria-label={editing ? "Salvar alterações do vigilante" : "Cadastrar novo vigilante"}>
              {editing ? "Salvar" : "Cadastrar"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
