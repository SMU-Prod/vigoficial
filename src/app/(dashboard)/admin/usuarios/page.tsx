"use client";

import { useState, useMemo } from "react";
import { DataTable } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { useFetch } from "@/hooks/use-fetch";
import { formatDate } from "@/lib/formatters";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { FilterBar, FilterConfig } from "@/components/ui/filter-bar";
import { ExportButton } from "@/components/ui/export-button";

interface UserRow {
  id: string;
  email: string;
  nome: string;
  role: string;
  company_ids: string[];
  mfa_enabled: boolean;
  created_at: string;
  ativo: boolean;
}

interface CompanyRow {
  id: string;
  razao_social: string;
}

export default function UsuariosPage() {
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [filterValues, setFilterValues] = useState({
    search: "",
    role: "todos",
    status: "todos",
  });

  const { data: users = [], loading: usersLoading, refetch: refetchUsers } =
    useFetch<UserRow[]>("/api/auth/users");

  const { data: companies = [] } = useFetch<CompanyRow[]>(
    "/api/companies"
  );

  // Filter users by search, role, and status
  const filteredUsers = useMemo(() => {
    let result = users ?? [];

    if (filterValues.search.trim()) {
      const searchLower = filterValues.search.toLowerCase();
      result = result.filter(
        (u) =>
          u.nome.toLowerCase().includes(searchLower) ||
          u.email.toLowerCase().includes(searchLower)
      );
    }

    if (filterValues.role !== "todos") {
      result = result.filter((u) => u.role === filterValues.role);
    }

    if (filterValues.status !== "todos") {
      result = result.filter((u) =>
        filterValues.status === "ativo" ? u.ativo : !u.ativo
      );
    }

    return result;
  }, [users, filterValues]);

  // Calculate stats
  const stats = useMemo(() => {
    const total = users?.length || 0;
    const admins = users?.filter(u => u.role === "admin").length || 0;
    const operadores = users?.filter(u => u.role === "operador").length || 0;
    const ultimoLogin = (users?.length ?? 0) > 0
      ? new Date(Math.max(...users!.map(u => new Date(u.created_at).getTime()))).toLocaleDateString('pt-BR')
      : "-";
    return { total, admins, operadores, ultimoLogin };
  }, [users]);

  async function handleCreateUser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const form = new FormData(e.currentTarget);
    const emailPrefix = form.get("email_prefix");
    const email = `${emailPrefix}@vigiconsultoria.com`;

    const body = {
      email,
      nome: form.get("nome"),
      password: form.get("password"),
      role: form.get("role"),
      company_ids: form.getAll("companies"),
    };

    try {
      const res = await fetch("/api/auth/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error);
        toast.error(data.error || "Erro ao criar usuário");
        return;
      }

      setModalOpen(false);
      toast.success("Usuário criado com sucesso");
      refetchUsers();
    } catch (_err) {
      const message = "Erro de conexão";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      admin: "Admin",
      operador: "Operador",
      viewer: "Visualizador",
      consultor: "Consultor",
    };
    return labels[role] || role;
  };

  const getRoleBadgeVariant = (role: string): "gold" | "blue" | "gray" => {
    if (role === "admin") return "gold";
    if (role === "operador") return "blue";
    if (role === "consultor") return "blue";
    return "gray";
  };

  const filterConfigs: FilterConfig[] = [
    {
      key: "search",
      label: "Buscar",
      type: "search",
      placeholder: "Nome ou email...",
    },
    {
      key: "role",
      label: "Permissão",
      type: "select",
      options: [
        { value: "todos", label: "Todas" },
        { value: "admin", label: "Admin" },
        { value: "operador", label: "Operador" },
        { value: "consultor", label: "Consultor" },
        { value: "viewer", label: "Visualizador" },
      ],
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "todos", label: "Todos" },
        { value: "ativo", label: "Ativo" },
        { value: "inativo", label: "Inativo" },
      ],
    },
  ];

  const exportColumns = [
    { key: "nome", label: "Nome" },
    { key: "email", label: "Email" },
    { key: "role", label: "Permissão" },
    { key: "company_ids", label: "Empresas" },
    { key: "mfa_enabled", label: "MFA" },
    { key: "ativo", label: "Status" },
    { key: "created_at", label: "Data de Criação" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuários"
        subtitle="Gerenciamento de usuários do sistema"
        actions={
          <Button
            onClick={() => {
              setError("");
              setModalOpen(true);
            }}
            aria-label="Criar novo usuário"
          >
            Novo Usuário
          </Button>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total de Usuários"
          value={stats.total}
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.856-1.487M15 10a3 3 0 11-6 0 3 3 0 016 0zM6 20a9 9 0 0118 0v2h2v-2a11 11 0 10-20 0v2h2v-2z" />
            </svg>
          }
          variant="default"
          loading={usersLoading}
        />
        <StatCard
          label="Admins"
          value={stats.admins}
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          }
          variant="info"
          loading={usersLoading}
        />
        <StatCard
          label="Operadores"
          value={stats.operadores}
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
          variant="success"
          loading={usersLoading}
        />
        <StatCard
          label="Último Login"
          value={stats.ultimoLogin}
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          variant="warning"
          loading={usersLoading}
        />
      </div>

      {/* Filter Bar */}
      <FilterBar
        filters={filterConfigs}
        values={filterValues}
        onChange={(key, value) => setFilterValues(prev => ({ ...prev, [key]: value }))}
        onClear={() => setFilterValues({ search: "", role: "todos", status: "todos" })}
      />

      {/* Users table */}
      {!usersLoading && filteredUsers.length === 0 ? (
        <div className="vigi-card">
          <EmptyState
            icon="👤"
            title="Nenhum usuário encontrado"
            description="Crie usuários para gerenciar acesso ao sistema"
            actionLabel="Novo Usuário"
            onAction={() => {
              setError("");
              setModalOpen(true);
            }}
          />
        </div>
      ) : (
        <div className="vigi-card p-6 overflow-x-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              {filteredUsers.length} usuário{filteredUsers.length !== 1 ? "s" : ""}
            </h2>
            <ExportButton
              data={filteredUsers}
              filename="usuarios"
              columns={exportColumns}
              formats={["csv", "excel"]}
            />
          </div>
          <DataTable
            columns={[
              { key: "nome", header: "Nome" },
              {
                key: "email",
                header: "Email Oficial",
                render: (u: UserRow) => (
                  <span className="text-sm text-[var(--text-secondary)]">{u.email}</span>
                ),
              },
              {
                key: "role",
                header: "Permissão",
                render: (u: UserRow) => (
                  <Badge variant={getRoleBadgeVariant(u.role)}>
                    {getRoleLabel(u.role)}
                  </Badge>
                ),
              },
              {
                key: "company_ids",
                header: "Empresas Atribuídas",
                render: (u: UserRow) => (
                  <span className="text-sm">{u.company_ids.length}</span>
                ),
              },
              {
                key: "mfa_enabled",
                header: "MFA",
                render: (u: UserRow) => (
                  <Badge variant={u.mfa_enabled ? "green" : "gray"}>
                    {u.mfa_enabled ? "Ativado" : "Desativado"}
                  </Badge>
                ),
              },
              {
                key: "ativo",
                header: "Status",
                render: (u: UserRow) => (
                  <Badge variant={u.ativo ? "green" : "gray"}>
                    {u.ativo ? "Ativo" : "Inativo"}
                  </Badge>
                ),
              },
              {
                key: "created_at",
                header: "Criado em",
                render: (u: UserRow) => (
                  <span className="text-sm">{formatDate(u.created_at)}</span>
                ),
              },
            ]}
            data={filteredUsers}
            loading={usersLoading}
          />
        </div>
      )}

      {/* Modal novo usuário */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Novo Usuário"
        size="md"
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          <Input
            id="nome"
            name="nome"
            label="Nome Completo"
            required
            aria-label="Nome completo do novo usuário"
          />

          <div>
            <label htmlFor="email_prefix" className="block text-sm font-medium text-[var(--vigi-navy)] mb-1.5">
              Email Oficial <span className="text-[var(--status-danger)]">*</span>
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="email_prefix"
                name="email_prefix"
                placeholder="nome.sobrenome"
                required
                aria-label="Prefixo do email do novo usuário"
                className="flex-1"
              />
              <span className="text-[var(--text-secondary)] font-medium">
                @vigiconsultoria.com
              </span>
            </div>
          </div>

          <Input
            id="password"
            name="password"
            label="Senha"
            type="password"
            required
            placeholder="Mín. 12 chars"
            aria-label="Senha do novo usuário"
          />

          <Select
            id="role"
            name="role"
            label="Nível de Acesso"
            required
            aria-label="Selecione o nível de acesso"
            options={[
              { value: "viewer", label: "Visualizador" },
              { value: "operador", label: "Operador" },
              { value: "consultor", label: "Consultor" },
              { value: "admin", label: "Admin" },
            ]}
            defaultValue="viewer"
          />

          <div>
            <label className="block text-sm font-medium text-[var(--vigi-navy)] mb-1.5">
              Empresas Atribuídas
            </label>
            <div className="space-y-2 bg-[var(--bg-tertiary)] p-3 rounded-[var(--radius-md)] max-h-48 overflow-y-auto">
              {(companies ?? []).map((company) => (
                <label
                  key={company.id}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    name="companies"
                    value={company.id}
                    className="w-4 h-4 rounded-[var(--radius-xs)] border-[var(--border-primary)]"
                    aria-label={`Atribuir empresa ${company.razao_social}`}
                  />
                  <span className="text-sm">{company.razao_social}</span>
                </label>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-[var(--status-danger)] bg-[var(--status-danger-bg)] p-2 rounded-[var(--radius-sm)]">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-primary)]">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setModalOpen(false)}
              aria-label="Cancelar criação de usuário"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              loading={saving}
              aria-label="Criar novo usuário"
            >
              Criar
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
