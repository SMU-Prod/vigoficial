"use client";

import { useState, useMemo } from "react";
import { DataTable } from "@/components/ui/table";
import { SemaforoBadge, Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { FilterBar, FilterConfig } from "@/components/ui/filter-bar";
import { ExportButton } from "@/components/ui/export-button";
import { Drawer } from "@/components/ui/drawer";
import { Timeline, TimelineItem } from "@/components/ui/timeline";
import { Button } from "@/components/ui/button";
import { useFetch } from "@/hooks/use-fetch";
import { formatDate } from "@/lib/formatters";

interface Processo {
  id: string;
  company_id: string;
  razao_social: string;
  tipo_demanda: string;
  prioridade: string;
  status: string;
  created_at: string;
  dias_aberto: number;
  semaforo: string;
}

interface Note {
  id: string;
  text: string;
  timestamp: string;
}

export default function ProcessosPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [selectedProcesso, setSelectedProcesso] = useState<Processo | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState("");

  const { data: allProcessos = [], loading } = useFetch<Processo[]>("/api/processos");

  // Calculate statistics
  const stats = useMemo(() => {
    const processos = allProcessos ?? [];
    const emAndamento = processos.filter(p => p.status === "em_andamento").length;
    const concluidos = processos.filter(p => p.status === "concluido").length;
    const comErro = processos.filter(p => p.status === "erro" || p.semaforo === "vermelho").length;

    return {
      total: processos.length,
      emAndamento,
      concluidos,
      comErro,
    };
  }, [allProcessos]);

  // Filter configuration
  const filterConfigs: FilterConfig[] = [
    {
      key: "search",
      label: "Buscar",
      type: "search",
      placeholder: "Empresa ou processo...",
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { label: "Pendente", value: "pendente" },
        { label: "Em Andamento", value: "em_andamento" },
        { label: "Concluído", value: "concluido" },
        { label: "Erro", value: "erro" },
      ],
    },
    {
      key: "prioridade",
      label: "Prioridade",
      type: "select",
      options: [
        { label: "Alta", value: "alta" },
        { label: "Média", value: "media" },
        { label: "Baixa", value: "baixa" },
      ],
    },
    {
      key: "periodo",
      label: "Período",
      type: "date",
    },
  ];

  // Filter and sort processes
  const filteredProcessos = useMemo(() => {
    let filtered = allProcessos ?? [];

    if (filterValues.search) {
      const searchLower = filterValues.search.toLowerCase();
      filtered = filtered.filter(p =>
        p.razao_social.toLowerCase().includes(searchLower) ||
        p.tipo_demanda.toLowerCase().includes(searchLower)
      );
    }

    if (filterValues.status) {
      filtered = filtered.filter(p => p.status === filterValues.status);
    }

    if (filterValues.prioridade) {
      filtered = filtered.filter(p => p.prioridade === filterValues.prioridade);
    }

    if (filterValues.periodo) {
      filtered = filtered.filter(p =>
        new Date(p.created_at).toISOString().split("T")[0] === filterValues.periodo
      );
    }

    return filtered;
  }, [allProcessos, filterValues]);

  const totalPages = Math.ceil(filteredProcessos.length / pageSize);
  const processos = filteredProcessos.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Handle filter changes
  const handleFilterChange = (key: string, value: string) => {
    setFilterValues(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setFilterValues({});
    setCurrentPage(1);
  };

  // Handle drawer open
  const handleOpenDetail = (processo: Processo) => {
    setSelectedProcesso(processo);
    setNotes([
      {
        id: "1",
        text: "Processo iniciado com sucesso",
        timestamp: "2024-01-15 10:30",
      },
      {
        id: "2",
        text: "Aguardando documentação da empresa",
        timestamp: "2024-01-15 14:20",
      },
    ]);
    setDrawerOpen(true);
  };

  const handleAddNote = () => {
    if (newNote.trim()) {
      const timestamp = new Date().toLocaleString("pt-BR");
      setNotes(prev => [
        {
          id: Date.now().toString(),
          text: newNote,
          timestamp,
        },
        ...prev,
      ]);
      setNewNote("");
    }
  };

  // Build timeline items from process history
  const timelineItems: TimelineItem[] = selectedProcesso ? [
    {
      id: "created",
      title: "Processo criado",
      description: selectedProcesso.razao_social,
      timestamp: formatDate(selectedProcesso.created_at),
      variant: "info",
    },
    {
      id: "status",
      title: `Status: ${selectedProcesso.status.replace(/_/g, " ")}`,
      description: `Tipo: ${selectedProcesso.tipo_demanda.replace(/_/g, " ")}`,
      timestamp: "Última atualização",
      variant: selectedProcesso.semaforo === "verde" ? "success" : selectedProcesso.semaforo === "vermelho" ? "danger" : "warning",
    },
  ] : [];

  const columns = [
    {
      key: "semaforo",
      header: "",
      className: "w-4",
      render: (p: Processo) => <SemaforoBadge semaforo={p.semaforo} aria-label={`Status semáforo: ${p.semaforo}`} />,
    },
    {
      key: "razao_social",
      header: "Empresa",
      render: (p: Processo) => (
        <button
          onClick={() => handleOpenDetail(p)}
          className="text-[var(--text-link)] hover:underline font-medium transition-colors"
          aria-label={`Abrir detalhes de ${p.razao_social}`}
        >
          {p.razao_social}
        </button>
      ),
    },
    {
      key: "tipo_demanda",
      header: "Tipo",
      render: (p: Processo) => (
        <span className="capitalize" aria-label={`Tipo de demanda: ${p.tipo_demanda.replace(/_/g, " ")}`}>{p.tipo_demanda.replace(/_/g, " ")}</span>
      ),
    },
    {
      key: "prioridade",
      header: "Prioridade",
      render: (p: Processo) => (
        <Badge
          variant={
            p.prioridade === "alta"
              ? "red"
              : p.prioridade === "media"
              ? "yellow"
              : "gray"
          }
          aria-label={`Prioridade: ${p.prioridade}`}
        >
          {p.prioridade.charAt(0).toUpperCase() + p.prioridade.slice(1)}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (p: Processo) => (
        <span className="capitalize text-xs" aria-label={`Status: ${p.status.replace(/_/g, " ")}`}>{p.status.replace(/_/g, " ")}</span>
      ),
    },
    {
      key: "dias_aberto",
      header: "Dias",
      render: (p: Processo) => <span aria-label={`${Math.round(p.dias_aberto)} dias aberto`}>{Math.round(p.dias_aberto)}d</span>,
    },
    {
      key: "created_at",
      header: "Criado em",
      render: (p: Processo) => <span aria-label={`Criado em ${formatDate(p.created_at)}`}>{formatDate(p.created_at)}</span>,
    },
  ];

  const exportColumns = [
    { key: "razao_social", label: "Empresa" },
    { key: "tipo_demanda", label: "Tipo" },
    { key: "prioridade", label: "Prioridade" },
    { key: "status", label: "Status" },
    { key: "dias_aberto", label: "Dias Aberto" },
    { key: "created_at", label: "Criado em" },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Processos GESP"
        subtitle="Acompanhamento de processos no GESP"
        actions={
          <ExportButton
            data={filteredProcessos}
            filename="processos-gesp"
            columns={exportColumns}
          />
        }
      />

      {/* Statistics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total de Processos"
          value={stats.total}
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
          variant="default"
        />
        <StatCard
          label="Em Andamento"
          value={stats.emAndamento}
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
          variant="info"
        />
        <StatCard
          label="Concluídos"
          value={stats.concluidos}
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          variant="success"
        />
        <StatCard
          label="Com Erro/Atenção"
          value={stats.comErro}
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          variant="danger"
        />
      </div>

      {/* Filter Bar */}
      {!loading && (
        <FilterBar
          filters={filterConfigs}
          values={filterValues}
          onChange={handleFilterChange}
          onClear={handleClearFilters}
        />
      )}

      {/* Data Table */}
      {!loading && filteredProcessos.length === 0 && !Object.values(filterValues).some(v => v) ? (
        <EmptyState
          icon="⚖️"
          title="Nenhum processo ativo"
          description="Tudo em dia! Nenhum processo pendente no momento."
        />
      ) : !loading && filteredProcessos.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="Nenhum resultado"
          description="Nenhum processo encontrado com os filtros aplicados."
        />
      ) : (
        <>
          <div className="vigi-card p-6 overflow-x-auto">
            <DataTable
              columns={columns}
              data={processos}
              loading={loading}
              emptyMessage="Nenhum processo ativo."
            />
          </div>

          {!loading && filteredProcessos.length > 0 && (
            <div className="mt-6">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalCount={filteredProcessos.length}
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

      {/* Detail Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selectedProcesso?.razao_social || "Detalhes do Processo"}
        subtitle={`ID: ${selectedProcesso?.id}`}
        width="lg"
      >
        {selectedProcesso && (
          <div className="space-y-6">
            {/* Process Info Section */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[12px] font-medium text-[var(--text-secondary)] mb-1">
                    Tipo de Demanda
                  </p>
                  <p className="text-[13px] text-[var(--text-primary)] capitalize">
                    {selectedProcesso.tipo_demanda.replace(/_/g, " ")}
                  </p>
                </div>
                <div>
                  <p className="text-[12px] font-medium text-[var(--text-secondary)] mb-1">
                    Prioridade
                  </p>
                  <div>
                    <Badge
                      variant={
                        selectedProcesso.prioridade === "alta"
                          ? "red"
                          : selectedProcesso.prioridade === "media"
                          ? "yellow"
                          : "gray"
                      }
                    >
                      {selectedProcesso.prioridade.charAt(0).toUpperCase() +
                        selectedProcesso.prioridade.slice(1)}
                    </Badge>
                  </div>
                </div>
                <div>
                  <p className="text-[12px] font-medium text-[var(--text-secondary)] mb-1">
                    Status
                  </p>
                  <p className="text-[13px] text-[var(--text-primary)] capitalize">
                    {selectedProcesso.status.replace(/_/g, " ")}
                  </p>
                </div>
                <div>
                  <p className="text-[12px] font-medium text-[var(--text-secondary)] mb-1">
                    Dias Aberto
                  </p>
                  <p className="text-[13px] text-[var(--text-primary)]">
                    {Math.round(selectedProcesso.dias_aberto)} dias
                  </p>
                </div>
              </div>
            </div>

            <hr className="border-[var(--border-secondary)]" />

            {/* Timeline Section */}
            <div>
              <h3 className="text-[13px] font-semibold text-[var(--text-primary)] mb-4">
                Histórico do Processo
              </h3>
              <Timeline items={timelineItems} />
            </div>

            <hr className="border-[var(--border-secondary)]" />

            {/* Notes Section */}
            <div>
              <h3 className="text-[13px] font-semibold text-[var(--text-primary)] mb-4">
                Anotações
              </h3>

              {/* Add Note Form */}
              <div className="mb-4 space-y-2">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Adicionar uma anotação..."
                  className="w-full vigi-input bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-primary)] rounded-[var(--radius-md)] px-3 py-2 text-[13px] focus:border-[var(--border-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)] focus:ring-opacity-20 resize-none"
                  rows={3}
                />
                <Button
                  onClick={handleAddNote}
                  disabled={!newNote.trim()}
                  size="sm"
                  className="w-full"
                >
                  Adicionar Anotação
                </Button>
              </div>

              {/* Notes List */}
              {notes.length > 0 ? (
                <div className="space-y-3">
                  {notes.map(note => (
                    <div
                      key={note.id}
                      className="p-3 bg-[var(--bg-tertiary)] rounded-[var(--radius-md)] border border-[var(--border-secondary)]"
                    >
                      <p className="text-[12px] text-[var(--text-secondary)] mb-1">
                        {note.timestamp}
                      </p>
                      <p className="text-[13px] text-[var(--text-primary)]">
                        {note.text}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] text-[var(--text-tertiary)] italic">
                  Nenhuma anotação ainda
                </p>
              )}
            </div>

            {/* Retry Button for Failed Processes */}
            {selectedProcesso.status === "erro" && (
              <>
                <hr className="border-[var(--border-secondary)]" />
                <Button
                  onClick={() => {
                    console.log("Retry processo:", selectedProcesso.id);
                  }}
                  className="w-full"
                  variant="secondary"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Tentar Novamente
                </Button>
              </>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
