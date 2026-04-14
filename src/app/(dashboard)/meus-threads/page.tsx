"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { DataTable } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SearchInput } from "@/components/ui/search-input";
import { EmptyState } from "@/components/ui/empty-state";
import { useFetch } from "@/hooks/use-fetch";
import { useDebounce } from "@/hooks/useDebounce";
import { formatCNPJ, formatDate } from "@/lib/formatters";
import { Pagination } from "@/components/ui/pagination";

interface Thread {
  id: string;
  subject: string;
  status: "PENDENTE" | "EM_ANDAMENTO" | "FINALIZADO";
  company_id: string;
  company_name: string;
  cnpj: string;
  updated_at: string;
  participant_count: number;
}

const STATUS_BADGES: Record<string, "yellow" | "blue" | "green"> = {
  PENDENTE: "yellow",
  EM_ANDAMENTO: "blue",
  FINALIZADO: "green",
};

const FILTER_TABS = [
  { value: "todos", label: "Todos" },
  { value: "PENDENTE", label: "PENDENTE" },
  { value: "EM_ANDAMENTO", label: "EM ANDAMENTO" },
  { value: "FINALIZADO", label: "FINALIZADO" },
];

export default function MeusThreadsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [activeTab, setActiveTab] = useState("todos");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const { data: rawData, loading } = useFetch<{ threads: Thread[]; count: number } | Thread[]>("/api/threads");

  // API returns { threads: [...] } object — extract the array
  const allThreads: Thread[] = Array.isArray(rawData) ? rawData : (rawData?.threads ?? []);

  // Filter by search and status
  const filteredThreads = allThreads.filter((thread) => {
    const matchesSearch =
      !debouncedSearch ||
      thread.subject.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      thread.company_name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      thread.cnpj.includes(debouncedSearch);

    const matchesStatus = activeTab === "todos" || thread.status === activeTab;

    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil((filteredThreads ?? []).length / pageSize);
  const paginatedThreads = (filteredThreads ?? []).slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleRowClick = useCallback(
    (thread: Thread) => {
      router.push(`/meus-threads/${thread.id}`);
    },
    [router]
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

  const columns = [
    {
      key: "status",
      header: "Status",
      className: "w-24",
      render: (thread: Thread) => (
        <Badge
          variant={STATUS_BADGES[thread.status]}
          aria-label={`Status: ${thread.status}`}
        >
          {thread.status}
        </Badge>
      ),
    },
    {
      key: "subject",
      header: "Assunto",
      render: (thread: Thread) => (
        <span aria-label={`Assunto: ${thread.subject}`}>{thread.subject}</span>
      ),
    },
    {
      key: "company_name",
      header: "Empresa",
      render: (thread: Thread) => (
        <span aria-label={`Empresa: ${thread.company_name}`}>
          {thread.company_name}
        </span>
      ),
    },
    {
      key: "cnpj",
      header: "CNPJ",
      render: (thread: Thread) => (
        <span aria-label={`CNPJ: ${formatCNPJ(thread.cnpj)}`}>
          {formatCNPJ(thread.cnpj)}
        </span>
      ),
    },
    {
      key: "updated_at",
      header: "Última Atualização",
      render: (thread: Thread) => (
        <span aria-label={`Atualizado em ${formatDate(thread.updated_at)}`}>
          {formatDate(thread.updated_at)}
        </span>
      ),
    },
    {
      key: "participant_count",
      header: "Participantes",
      className: "w-24",
      render: (thread: Thread) => (
        <span aria-label={`${thread.participant_count} participantes`}>
          {thread.participant_count}
        </span>
      ),
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--vigi-navy)] mb-6">Meus Threads</h1>

      <div className="mb-4">
        <SearchInput
          aria-label="Buscar threads por assunto, empresa ou CNPJ"
          placeholder="Buscar por assunto, empresa ou CNPJ..."
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

      {!loading && filteredThreads.length === 0 && debouncedSearch && (
        <EmptyState
          icon="🔍"
          title="Nenhum thread encontrado"
          description={`Nenhum thread encontrado para "${debouncedSearch}". Tente outro termo de busca.`}
        />
      )}

      {!loading && filteredThreads.length === 0 && !debouncedSearch && (
        <EmptyState
          icon="📧"
          title={`Nenhum thread ${
            activeTab === "todos" ? "" : activeTab.toLowerCase()
          }`}
          description={`Você não tem threads ${
            activeTab === "todos" ? "no momento" : `com status ${activeTab}`
          }.`}
        />
      )}

      {filteredThreads.length > 0 && (
        <div className="overflow-x-auto">
          <DataTable
            columns={columns}
            data={paginatedThreads}
            loading={loading}
            onRowClick={handleRowClick}
            emptyMessage="Nenhum thread encontrado."
            aria-label="Lista de threads de email"
          />
        </div>
      )}

      {!loading && filteredThreads.length > 0 && (
        <div className="mt-6">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalCount={filteredThreads.length}
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
