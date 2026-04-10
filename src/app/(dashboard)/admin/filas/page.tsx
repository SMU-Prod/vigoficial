"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { getQueueMeta } from "@/lib/constants/queues";

interface QueueStatus {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
  error?: string;
}

function getQueueHealthVariant(queue: QueueStatus): "green" | "yellow" | "red" | "gray" {
  if (queue.error === "Redis offline") return "gray";
  if (queue.failed > 5) return "red";
  if (queue.failed > 0 || queue.delayed > 3) return "yellow";
  return "green";
}

function getQueueHealthLabel(queue: QueueStatus): string {
  if (queue.error === "Redis offline") return "Offline";
  if (queue.paused) return "Pausada";
  if (queue.failed > 5) return "Crítico";
  if (queue.failed > 0) return "Alerta";
  if (queue.active > 0) return "Processando";
  return "Saudável";
}

export default function FilasPage() {
  const [queues, setQueues] = useState<QueueStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [redisStatus, setRedisStatus] = useState<"online" | "offline" | "unknown">("unknown");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [cleanTarget, setCleanTarget] = useState<string | null>(null);
  const [cleanLoading, setCleanLoading] = useState(false);

  const toast = useToast();

  const fetchQueues = useCallback(async () => {
    try {
      setError("");
      const res = await fetch("/api/admin/queues");
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Erro ao buscar filas");
        return;
      }
      const data = await res.json();
      setQueues(data.queues || []);
      setRedisStatus(data.redisStatus || "unknown");
    } catch {
      setError("Erro de conexão com o servidor");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueues();
    if (autoRefresh) {
      const interval = setInterval(fetchQueues, 10000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, fetchQueues]);

  async function handleCleanQueue() {
    if (!cleanTarget) return;
    setCleanLoading(true);
    try {
      const res = await fetch(`/api/admin/queues/${cleanTarget}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clean" }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Erro ao limpar fila");
        return;
      }
      toast.success(`Fila "${cleanTarget}" limpa com sucesso`);
      await fetchQueues();
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setCleanLoading(false);
      setCleanTarget(null);
    }
  }

  // Computed stats
  const totalJobs = queues.reduce((sum, q) => sum + q.waiting + q.active + q.completed + q.failed + q.delayed, 0);
  const totalActive = queues.reduce((sum, q) => sum + q.active, 0);
  const totalFailed = queues.reduce((sum, q) => sum + q.failed, 0);
  const totalWaiting = queues.reduce((sum, q) => sum + q.waiting, 0);
  const healthyQueues = queues.filter((q) => q.failed === 0 && !q.error).length;
  const problematicQueues = queues.filter((q) => q.failed > 0 || q.error);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton width="260px" height="32px" />
          <div className="flex gap-3">
            <Skeleton width="120px" height="36px" />
            <Skeleton width="140px" height="36px" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height="80px" className="rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-[var(--vigi-navy)]">Monitoramento de Filas</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {queues.length} filas BullMQ {redisStatus === "online" && <Badge variant="green">Redis Online</Badge>}
            {redisStatus === "offline" && <Badge variant="red">Redis Offline</Badge>}
            {redisStatus === "unknown" && <Badge variant="gray">Redis Desconhecido</Badge>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-[var(--border-primary)] text-[var(--vigi-gold)] focus:ring-[var(--vigi-gold)]"
            />
            Auto-refresh 10s
          </label>
          <Button variant="secondary" size="sm" onClick={fetchQueues}>
            Atualizar
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="vigi-card border-l-4 border-[var(--status-danger)] p-4 flex items-center gap-3">
          <svg className="w-5 h-5 text-[var(--status-danger)] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <p className="text-sm text-[var(--status-danger)] font-medium">{error}</p>
        </div>
      )}

      {/* Redis Offline Warning */}
      {redisStatus === "offline" && (
        <div className="vigi-card border-l-4 border-[var(--status-warning)] p-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-[var(--status-warning)] flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-[var(--status-warning)]">Redis Offline</p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              O Redis n&atilde;o est&aacute; dispon&iacute;vel. As filas est&atilde;o em modo degradado. Inicie o Redis para gerenciar jobs.
            </p>
          </div>
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="vigi-card p-4">
          <p className="text-xs text-[var(--text-secondary)] uppercase tracking-wide font-medium">Total de Jobs</p>
          <p className="text-2xl font-bold text-[var(--vigi-navy)] mt-1">{totalJobs.toLocaleString()}</p>
        </div>
        <div className="vigi-card p-4">
          <p className="text-xs text-[var(--text-secondary)] uppercase tracking-wide font-medium">Processando</p>
          <p className="text-2xl font-bold text-[var(--status-info)] mt-1">{totalActive}</p>
        </div>
        <div className="vigi-card p-4">
          <p className="text-xs text-[var(--text-secondary)] uppercase tracking-wide font-medium">Aguardando</p>
          <p className="text-2xl font-bold text-[var(--status-warning)] mt-1">{totalWaiting}</p>
        </div>
        <div className="vigi-card p-4">
          <p className="text-xs text-[var(--text-secondary)] uppercase tracking-wide font-medium">Com Erro</p>
          <p className="text-2xl font-bold text-[var(--status-danger)] mt-1">{totalFailed}</p>
          {totalFailed > 0 && (
            <p className="text-[10px] text-[var(--status-danger)] mt-0.5">
              em {problematicQueues.length} fila{problematicQueues.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>

      {/* Tabs: All Queues / With Problems */}
      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">
            Todas as Filas
            <Badge variant="gray" className="ml-2">{queues.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="problems">
            Com Problemas
            {problematicQueues.length > 0 ? (
              <Badge variant="red" className="ml-2">{problematicQueues.length}</Badge>
            ) : (
              <Badge variant="green" className="ml-2">0</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          {queues.length === 0 ? (
            <EmptyState
              icon="📋"
              title="Nenhuma fila disponível"
              description="As filas BullMQ serão exibidas quando o Redis estiver conectado e os workers estiverem ativos."
              actionLabel="Atualizar"
              onAction={fetchQueues}
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
              {queues.map((queue) => (
                <QueueCard
                  key={queue.name}
                  queue={queue}
                  onClean={() => setCleanTarget(queue.name)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="problems">
          {problematicQueues.length === 0 ? (
            <EmptyState
              icon="✅"
              title="Todas as filas saudáveis"
              description={`${healthyQueues} fila${healthyQueues !== 1 ? "s" : ""} operando normalmente sem erros.`}
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
              {problematicQueues.map((queue) => (
                <QueueCard
                  key={queue.name}
                  queue={queue}
                  onClean={() => setCleanTarget(queue.name)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Clean Confirmation Dialog */}
      <ConfirmDialog
        open={cleanTarget !== null}
        onClose={() => setCleanTarget(null)}
        title="Limpar Jobs Completados"
        message={`Tem certeza que deseja limpar todos os jobs completados da fila "${cleanTarget}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Limpar"
        cancelLabel="Cancelar"
        onConfirm={handleCleanQueue}
        loading={cleanLoading}
        variant="danger"
      />
    </div>
  );
}

// ─── Queue Card Component ──────────────────────────────────────────────────────

function QueueCard({ queue, onClean }: { queue: QueueStatus; onClean: () => void }) {
  const meta = getQueueMeta(queue.name);
  const healthVariant = getQueueHealthVariant(queue);
  const healthLabel = getQueueHealthLabel(queue);
  const total = queue.waiting + queue.active + queue.completed + queue.failed + queue.delayed;

  const segments = [
    { value: queue.active, color: "var(--status-info)", label: "Ativo" },
    { value: queue.waiting, color: "var(--status-warning)", label: "Aguardando" },
    { value: queue.completed, color: "var(--status-success)", label: "Concluído" },
    { value: queue.failed, color: "var(--status-danger)", label: "Erro" },
    { value: queue.delayed, color: "var(--text-tertiary)", label: "Atrasado" },
  ];

  return (
    <div className="vigi-card p-5 transition-all hover:shadow-[var(--shadow-md)]">
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl" role="img" aria-label={meta.label}>{meta.icon}</span>
          <div>
            <h3 className="text-[15px] font-semibold text-[var(--vigi-navy)]">{meta.label}</h3>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{meta.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {queue.paused && <Badge variant="yellow">Pausada</Badge>}
          <Badge variant={healthVariant}>{healthLabel}</Badge>
        </div>
      </div>

      {/* Segmented Progress Bar */}
      <div className="mb-4">
        <div className="h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden flex">
          {total > 0 && segments.map((seg, i) => (
            seg.value > 0 && (
              <div
                key={i}
                className="h-full transition-all duration-300"
                style={{
                  width: `${(seg.value / total) * 100}%`,
                  backgroundColor: seg.color,
                }}
                title={`${seg.label}: ${seg.value}`}
              />
            )
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-2">
        {segments.map((seg, i) => (
          <div key={i} className="text-center">
            <p className="text-lg font-semibold" style={{ color: seg.color }}>
              {seg.value.toLocaleString()}
            </p>
            <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide">{seg.label}</p>
          </div>
        ))}
      </div>

      {/* Total + Actions */}
      <div className="flex justify-between items-center mt-4 pt-3 border-t border-[var(--border-primary)]">
        <p className="text-xs text-[var(--text-secondary)]">
          Total: <span className="font-semibold text-[var(--vigi-navy)]">{total.toLocaleString()}</span> jobs
        </p>
        <div className="flex gap-2">
          {queue.completed > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onClean();
              }}
            >
              Limpar completados
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
