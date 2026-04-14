"use client";

import { useState, useCallback } from "react";
import { DataTable } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { useFetch } from "@/hooks/use-fetch";
import { useDebounce } from "@/hooks/useDebounce";
import { formatCNPJ, formatDate } from "@/lib/formatters";
import { Pagination } from "@/components/ui/pagination";

interface Task {
  id: string;
  status: "pendente" | "executando" | "concluido" | "erro";
  tipo: string;
  company_id: string;
  company_name: string;
  cnpj: string;
  prioridade: "urgente" | "normal";
  created_at: string;
  prazo?: string;
}

const STATUS_BADGES: Record<string, "yellow" | "blue" | "green" | "red"> = {
  pendente: "yellow",
  executando: "blue",
  concluido: "green",
  erro: "red",
};

const PRIORITY_BADGES: Record<string, "red" | "gray"> = {
  urgente: "red",
  normal: "gray",
};

const FILTER_TABS = [
  { value: "pendente", label: "Pendentes" },
  { value: "executando", label: "Em Andamento" },
  { value: "concluido", label: "Concluídas" },
];

export default function MinhasTarefasPage() {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [activeTab, setActiveTab] = useState("pendente");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [executingTasks, setExecutingTasks] = useState<Set<string>>(new Set());

  const { data: allTasks = [], loading, refetch } = useFetch<Task[]>(
    "/api/tasks"
  );

  // Filter by search and status
  const filteredTasks = (allTasks ?? []).filter((task) => {
    const matchesSearch =
      !debouncedSearch ||
      task.tipo.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      task.company_name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      task.cnpj.includes(debouncedSearch);

    const matchesStatus = task.status === activeTab;

    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil((filteredTasks ?? []).length / pageSize);
  const paginatedTasks = (filteredTasks ?? []).slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
      setCurrentPage(1);
    },
    []
  );

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    setCurrentPage(1);
  }, []);

  const handleExecuteTask = useCallback(
    async (task: Task) => {
      if (!window.confirm(
        `Deseja executar a tarefa "${task.tipo}" para ${task.company_name}?`
      )) {
        return;
      }

      setExecutingTasks((prev) => new Set(prev).add(task.id));
      try {
        const res = await fetch("/api/agents/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task_id: task.id }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Erro ao executar tarefa");
        }

        toast.success("Tarefa iniciada com sucesso");
        refetch();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Erro ao executar tarefa"
        );
      } finally {
        setExecutingTasks((prev) => {
          const next = new Set(prev);
          next.delete(task.id);
          return next;
        });
      }
    },
    [toast, refetch]
  );

  const columns = [
    {
      key: "status",
      header: "Status",
      className: "w-24",
      render: (task: Task) => (
        <Badge
          variant={STATUS_BADGES[task.status]}
          aria-label={`Status: ${task.status}`}
        >
          {task.status.charAt(0).toUpperCase() + task.status.slice(1)}
        </Badge>
      ),
    },
    {
      key: "tipo",
      header: "Tipo",
      render: (task: Task) => (
        <span className="capitalize" aria-label={`Tipo: ${task.tipo}`}>
          {task.tipo.replace(/_/g, " ")}
        </span>
      ),
    },
    {
      key: "company_name",
      header: "Empresa",
      render: (task: Task) => (
        <span aria-label={`Empresa: ${task.company_name}`}>
          {task.company_name}
        </span>
      ),
    },
    {
      key: "cnpj",
      header: "CNPJ",
      render: (task: Task) => (
        <span aria-label={`CNPJ: ${formatCNPJ(task.cnpj)}`}>
          {formatCNPJ(task.cnpj)}
        </span>
      ),
    },
    {
      key: "prioridade",
      header: "Prioridade",
      render: (task: Task) => (
        <Badge
          variant={PRIORITY_BADGES[task.prioridade]}
          aria-label={`Prioridade: ${task.prioridade}`}
        >
          {task.prioridade}
        </Badge>
      ),
    },
    {
      key: "created_at",
      header: "Criado em",
      render: (task: Task) => (
        <span aria-label={`Criado em ${formatDate(task.created_at)}`}>
          {formatDate(task.created_at)}
        </span>
      ),
    },
    {
      key: "prazo",
      header: "Prazo",
      render: (task: Task) => (
        <span aria-label={`Prazo: ${task.prazo ? formatDate(task.prazo) : "Sem prazo"}`}>
          {task.prazo ? formatDate(task.prazo) : "—"}
        </span>
      ),
    },
    {
      key: "acoes",
      header: "",
      className: "w-32",
      render: (task: Task) => (
        <>
          {task.status === "pendente" && (
            <Button
              size="sm"
              loading={executingTasks.has(task.id)}
              onClick={(e) => {
                e.stopPropagation();
                handleExecuteTask(task);
              }}
              aria-label={`Executar tarefa ${task.tipo}`}
            >
              Executar
            </Button>
          )}
        </>
      ),
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--vigi-navy)] mb-6">Minhas Tarefas</h1>

      <div className="mb-4">
        <SearchInput
          aria-label="Buscar tarefas por tipo, empresa ou CNPJ"
          placeholder="Buscar por tipo, empresa ou CNPJ..."
          value={search}
          onChange={handleSearchChange}
        />
      </div>

      <div className="flex gap-2 mb-6 border-b border-[var(--border-primary)] overflow-x-auto">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => handleTabChange(tab.value)}
            role="tab"
            aria-label={`Filtrar por ${tab.label}`}
            aria-selected={activeTab === tab.value}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.value
                ? "text-[var(--vigi-gold)] border-b-2 border-[var(--vigi-gold)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {!loading && filteredTasks.length === 0 && debouncedSearch && (
        <EmptyState
          icon="🔍"
          title="Nenhuma tarefa encontrada"
          description={`Nenhuma tarefa encontrada para "${debouncedSearch}". Tente outro termo de busca.`}
        />
      )}

      {!loading && filteredTasks.length === 0 && !debouncedSearch && (
        <EmptyState
          icon="✓"
          title={`Nenhuma tarefa ${activeTab}`}
          description={`Você não tem tarefas com status ${activeTab} no momento.`}
        />
      )}

      {filteredTasks.length > 0 && (
        <div className="overflow-x-auto">
          <DataTable
            columns={columns}
            data={paginatedTasks}
            loading={loading}
            emptyMessage="Nenhuma tarefa encontrada."
            aria-label="Lista de tarefas"
          />
        </div>
      )}

      {!loading && filteredTasks.length > 0 && (
        <div className="mt-6">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalCount={filteredTasks.length}
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
  );
}
