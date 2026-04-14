"use client";

import { useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { useFetch } from "@/hooks/use-fetch";
import { formatCNPJ, formatDate } from "@/lib/formatters";

interface EmailMessage {
  id: string;
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  date: string;
  direction: "inbound" | "outbound";
}

interface Participant {
  email: string;
  type: "interno" | "externo";
  name?: string;
}

interface ThreadDetail {
  id: string;
  subject: string;
  status: "PENDENTE" | "EM_ANDAMENTO" | "FINALIZADO";
  company_id: string;
  company_name: string;
  cnpj: string;
  created_at: string;
  participants: Participant[];
  emails: EmailMessage[];
}

const STATUS_COLORS: Record<string, "yellow" | "blue" | "green"> = {
  PENDENTE: "yellow",
  EM_ANDAMENTO: "blue",
  FINALIZADO: "green",
};

export default function ThreadDetailPage() {
  const params = useParams();
  const _router = useRouter();
  const toast = useToast();
  const threadId = params.id as string;

  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [expandedEmails, setExpandedEmails] = useState<Set<string>>(new Set());
  const [finalizing, setFinalizing] = useState(false);

  const { data: thread, loading, refetch } = useFetch<ThreadDetail>(
    `/api/threads/${threadId}`
  );

  const handleToggleExpand = useCallback((emailId: string) => {
    setExpandedEmails((prev) => {
      const next = new Set(prev);
      if (next.has(emailId)) {
        next.delete(emailId);
      } else {
        next.add(emailId);
      }
      return next;
    });
  }, []);

  const handleReply = useCallback(async () => {
    if (!replyText.trim()) {
      toast.error("Digite uma resposta");
      return;
    }

    setReplySending(true);
    try {
      const res = await fetch(`/api/threads/${threadId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyText }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao enviar resposta");
      }

      toast.success("Resposta enviada com sucesso");
      setReplyText("");
      refetch();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao enviar resposta"
      );
    } finally {
      setReplySending(false);
    }
  }, [replyText, threadId, toast, refetch]);

  const handleFinalize = useCallback(async () => {
    if (!window.confirm("Tem certeza que deseja finalizar este thread?")) {
      return;
    }

    setFinalizing(true);
    try {
      const res = await fetch(`/api/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "FINALIZADO" }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao finalizar thread");
      }

      toast.success("Thread finalizado com sucesso");
      refetch();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao finalizar thread"
      );
    } finally {
      setFinalizing(false);
    }
  }, [threadId, toast, refetch]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-[var(--border-primary)] rounded w-1/2" />
        <div className="grid grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-12 bg-[var(--border-primary)] rounded" />
          ))}
        </div>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-32 bg-[var(--border-primary)] rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (!thread) {
    return (
      <EmptyState
        icon="📧"
        title="Thread não encontrado"
        description="O thread que você está procurando não existe ou foi removido."
      />
    );
  }

  const activeParticipants = thread.participants.filter(
    (p) => !expandedEmails.has(p.email)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--vigi-navy)] mb-4">
            {thread.subject}
          </h1>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-[var(--text-secondary)] uppercase mb-1">Empresa</p>
              <p className="font-medium text-[var(--vigi-navy)]">{thread.company_name}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-secondary)] uppercase mb-1">CNPJ</p>
              <p className="font-medium text-[var(--vigi-navy)]">
                {formatCNPJ(thread.cnpj)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-secondary)] uppercase mb-1">Status</p>
              <Badge
                variant={STATUS_COLORS[thread.status]}
                aria-label={`Status: ${thread.status}`}
              >
                {thread.status}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-[var(--text-secondary)] uppercase mb-1">Criado em</p>
              <p className="font-medium text-[var(--vigi-navy)]">
                {formatDate(thread.created_at)}
              </p>
            </div>
          </div>
        </div>
        {thread.status !== "FINALIZADO" && (
          <Button
            variant="danger"
            size="sm"
            loading={finalizing}
            onClick={handleFinalize}
            aria-label="Finalizar thread"
          >
            Finalizar Thread
          </Button>
        )}
      </div>

      <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-primary)] p-4">
        <h2 className="font-semibold text-[var(--vigi-navy)] mb-3">Participantes</h2>
        <div className="flex flex-wrap gap-2">
          {thread.participants.map((participant) => (
            <Badge
              key={participant.email}
              variant={participant.type === "interno" ? "blue" : "gray"}
              aria-label={`${participant.type === "interno" ? "Interno" : "Externo"}: ${participant.name || participant.email}`}
            >
              {participant.name || participant.email}
              <span className="ml-1 text-xs">
                ({participant.type})
              </span>
            </Badge>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="font-semibold text-[var(--vigi-navy)]">Conversa</h2>
        {thread.emails.length === 0 ? (
          <EmptyState
            icon="📧"
            title="Sem emails"
            description="Nenhum email neste thread."
          />
        ) : (
          thread.emails.map((email) => (
            <div
              key={email.id}
              className={`rounded-lg border ${
                email.direction === "inbound"
                  ? "border-[var(--border-primary)] bg-[var(--bg-tertiary)] mr-0 ml-0"
                  : "border-[var(--vigi-gold)] bg-[var(--vigi-gold-muted)] ml-8"
              } p-4`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-medium text-[var(--vigi-navy)]">{email.from}</p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {formatDate(email.date)}
                  </p>
                </div>
                <button
                  onClick={() => handleToggleExpand(email.id)}
                  aria-label={`${expandedEmails.has(email.id) ? "Recolher" : "Expandir"} email de ${email.from}`}
                  className="text-xs text-[var(--vigi-navy)] hover:text-[var(--vigi-gold)] font-medium"
                >
                  {expandedEmails.has(email.id) ? "Recolher" : "Expandir"}
                </button>
              </div>

              {email.to && email.to.length > 0 && (
                <p className="text-xs text-[var(--text-secondary)] mb-2">
                  Para: {email.to.join(", ")}
                </p>
              )}
              {email.cc && email.cc.length > 0 && (
                <p className="text-xs text-[var(--text-secondary)] mb-2">
                  CC: {email.cc.join(", ")}
                </p>
              )}

              {expandedEmails.has(email.id) && (
                <div className="mt-3 text-sm text-[var(--text-primary)] whitespace-pre-wrap break-words">
                  {email.body}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {thread.status !== "FINALIZADO" && (
        <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-primary)] p-4 space-y-3">
          <h2 className="font-semibold text-[var(--vigi-navy)]">Responder</h2>
          <p className="text-xs text-[var(--text-secondary)]">
            Respondendo para:{" "}
            {activeParticipants.map((p) => p.email).join(", ")}
          </p>
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Digite sua resposta..."
            aria-label="Campo para digitar resposta do email"
            className="w-full p-3 border border-[var(--border-primary)] rounded-lg resize-none focus:ring-2 focus:ring-[var(--vigi-gold)] focus:border-transparent"
            rows={6}
          />
          <div className="flex justify-end">
            <Button
              loading={replySending}
              onClick={handleReply}
              aria-label="Enviar resposta"
            >
              Enviar Resposta
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
