"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SearchInput } from "@/components/ui/search-input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCNPJ, formatDate, formatDateTime, formatCurrency } from "@/lib/formatters";

// ─── Tipos ───
interface BrainItem {
  type: "company" | "prospect";
  id: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  uf: string | null;
  municipio: string | null;
  status: string | null;
  plano?: string | null;
  habilitada?: boolean | null;
  enriched?: boolean;
  temperatura?: string | null;
  score?: number | null;
  source?: string | null;
  converted?: boolean;
  created_at: string;
}

interface BrainListResponse {
  total: number;
  companies_count: number;
  prospects_count: number;
  items: BrainItem[];
}

interface BrainDetail {
  type: "company" | "prospect";
  base: Record<string, unknown>;
  cnpj: string | null;
  companyId: string | null;
  vigilantes: Array<Record<string, unknown>>;
  frota: { veiculos: Array<Record<string, unknown>>; manutencoes: Array<Record<string, unknown>> };
  armamento: { armas: Array<Record<string, unknown>>; coletes: Array<Record<string, unknown>> };
  gesp: {
    tasks: Array<Record<string, unknown>>;
    sessions: Array<Record<string, unknown>>;
    approvals: Array<Record<string, unknown>>;
    snapshots: Array<Record<string, unknown>>;
    procuracoes: Array<Record<string, unknown>>;
  };
  emails: {
    threads: Array<Record<string, unknown>>;
    inbound: Array<Record<string, unknown>>;
    outbound: Array<Record<string, unknown>>;
    workflows: Array<Record<string, unknown>>;
  };
  dou: { alvaras: Array<Record<string, unknown>>; alertas: Array<Record<string, unknown>> };
  billing: { history: Array<Record<string, unknown>> };
  ai: { runs: Array<Record<string, unknown>>; events: Array<Record<string, unknown>> };
  discrepancias: Array<Record<string, unknown>>;
  notifications: Array<Record<string, unknown>>;
  prospect: { activities: Array<Record<string, unknown>> };
  filiais: Array<Record<string, unknown>>;
  instructions: Array<Record<string, unknown>>;
}

// ─── Helpers ───
function safeStr(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  return JSON.stringify(v);
}

function pickString(obj: Record<string, unknown>, key: string): string {
  const v = obj?.[key];
  return v === null || v === undefined ? "—" : String(v);
}

// ─── Página ───
export default function CerebroPage() {
  const [items, setItems] = useState<BrainItem[]>([]);
  const [counts, setCounts] = useState({ companies: 0, prospects: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "company" | "prospect">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<"company" | "prospect" | null>(null);
  const [detail, setDetail] = useState<BrainDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Fetch list
  useEffect(() => {
    const ctrl = new AbortController();
    const url = new URL("/api/empresas/brain", window.location.origin);
    if (search) url.searchParams.set("q", search);
    if (typeFilter !== "all") url.searchParams.set("type", typeFilter);
    setLoading(true);
    fetch(url.toString(), { signal: ctrl.signal, credentials: "include" })
      .then((r) => r.json())
      .then((data: BrainListResponse) => {
        setItems(data.items || []);
        setCounts({ companies: data.companies_count || 0, prospects: data.prospects_count || 0 });
      })
      .catch((e) => {
        if (e.name !== "AbortError") console.error(e);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [search, typeFilter]);

  // Fetch detail
  useEffect(() => {
    if (!selectedId || !selectedType) return;
    const ctrl = new AbortController();
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    fetch(`/api/empresas/brain/${selectedType}/${selectedId}`, {
      signal: ctrl.signal,
      credentials: "include",
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setDetailError(data.error);
        } else {
          setDetail(data as BrainDetail);
        }
      })
      .catch((e) => {
        if (e.name !== "AbortError") setDetailError(e.message);
      })
      .finally(() => setDetailLoading(false));
    return () => ctrl.abort();
  }, [selectedId, selectedType]);

  const visibleItems = useMemo(() => items, [items]);

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">
      {/* ─── Sidebar lista ─── */}
      <aside className="w-[420px] flex-shrink-0 border-r flex flex-col" style={{ borderColor: "var(--border-primary)" }}>
        <div className="p-4 border-b" style={{ borderColor: "var(--border-primary)" }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-base font-semibold" style={{ color: "var(--vigi-navy)" }}>
                Cérebro Empresarial
              </h1>
              <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                {counts.companies} empresas · {counts.prospects} prospects
              </p>
            </div>
            <Link
              href="/empresas"
              className="text-[11px] underline"
              style={{ color: "var(--text-tertiary)" }}
            >
              ← lista clássica
            </Link>
          </div>

          <SearchInput
            onSearch={setSearch}
            onClear={() => setSearch("")}
            placeholder="CNPJ, razão social…"
          />

          <div className="flex gap-1 mt-2">
            {(["all", "company", "prospect"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className="text-[11px] px-2 py-1 rounded transition-colors"
                style={{
                  background: typeFilter === t ? "var(--vigi-navy)" : "var(--bg-tertiary)",
                  color: typeFilter === t ? "#fff" : "var(--text-secondary)",
                }}
              >
                {t === "all" ? "Tudo" : t === "company" ? "Empresas" : "Prospects"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-3 space-y-2">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} height={56} />
              ))}
            </div>
          ) : visibleItems.length === 0 ? (
            <EmptyState
              title="Nenhum CNPJ encontrado"
              description="Tente ajustar a busca ou o filtro de tipo."
            />
          ) : (
            <ul>
              {visibleItems.map((it) => {
                const isSelected = selectedId === it.id && selectedType === it.type;
                return (
                  <li key={`${it.type}-${it.id}`}>
                    <button
                      onClick={() => {
                        setSelectedId(it.id);
                        setSelectedType(it.type);
                      }}
                      className="w-full text-left px-4 py-3 transition-colors border-b"
                      style={{
                        background: isSelected ? "var(--vigi-gold-muted)" : "transparent",
                        borderColor: "var(--border-secondary)",
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <Badge variant={it.type === "company" ? "blue" : "yellow"}>
                              {it.type === "company" ? "Empresa" : "Prospect"}
                            </Badge>
                            {it.type === "prospect" && it.converted && (
                              <Badge variant="green">Convertido</Badge>
                            )}
                          </div>
                          <p
                            className="text-[13px] font-medium truncate"
                            style={{ color: "var(--text-primary)" }}
                            title={it.razao_social}
                          >
                            {it.razao_social}
                          </p>
                          <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                            {formatCNPJ(it.cnpj)} · {it.uf || "—"}
                          </p>
                        </div>
                        {it.type === "prospect" && it.score !== null && it.score !== undefined && (
                          <span
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                            style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
                          >
                            {it.score}
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* ─── Painel detalhes ─── */}
      <main className="flex-1 overflow-y-auto">
        {!selectedId ? (
          <div className="h-full flex items-center justify-center">
            <EmptyState
              title="Selecione um CNPJ"
              description="Clique em uma empresa ou prospect na lista à esquerda para ver tudo o que o sistema sabe sobre ela."
            />
          </div>
        ) : detailLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton height={48} width="50%" />
            <Skeleton height={128} />
            <Skeleton height={192} />
          </div>
        ) : detailError ? (
          <div className="p-6">
            <p style={{ color: "var(--status-danger)" }}>Erro ao carregar: {detailError}</p>
          </div>
        ) : detail ? (
          <DetailView detail={detail} />
        ) : null}
      </main>
    </div>
  );
}

// ─── Detail view ───
function DetailView({ detail }: { detail: BrainDetail }) {
  const base = detail.base;
  const isCompany = detail.type === "company";

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Badge variant={isCompany ? "blue" : "yellow"}>
            {isCompany ? "Empresa" : "Prospect"}
          </Badge>
          {!!base.habilitada && <Badge variant="green">Habilitada</Badge>}
          {!isCompany && base.temperatura ? (
            <Badge
              variant={
                base.temperatura === "quente"
                  ? "red"
                  : base.temperatura === "morno"
                  ? "yellow"
                  : "blue"
              }
            >
              {String(base.temperatura)}
            </Badge>
          ) : null}
        </div>
        <h2 className="text-xl font-semibold" style={{ color: "var(--vigi-navy)" }}>
          {String(base.razao_social || "—")}
        </h2>
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
          {detail.cnpj ? formatCNPJ(detail.cnpj) : "—"}
          {base.nome_fantasia ? ` · ${base.nome_fantasia}` : ""}
        </p>
      </div>

      {/* KPIs rápidas */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        <KpiCard label="Vigilantes" value={detail.vigilantes.length} />
        <KpiCard label="Veículos" value={detail.frota.veiculos.length} />
        <KpiCard label="GESP tasks" value={detail.gesp.tasks.length} />
        <KpiCard label="Threads" value={detail.emails.threads.length} />
        <KpiCard label="DOU" value={detail.dou.alvaras.length + detail.dou.alertas.length} />
      </div>

      <Tabs defaultValue="cadastrais">
        <TabsList>
          <TabsTrigger value="cadastrais">Cadastrais</TabsTrigger>
          <TabsTrigger value="pessoas">Vigilantes</TabsTrigger>
          <TabsTrigger value="frota">Frota</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
          <TabsTrigger value="emails">Emails</TabsTrigger>
          <TabsTrigger value="dou">DOU</TabsTrigger>
          <TabsTrigger value="ai">IA / IML</TabsTrigger>
          <TabsTrigger value="raw">Bruto</TabsTrigger>
        </TabsList>

        <TabsContent value="cadastrais">
          <Section title="Dados primários">
            <KV pairs={[
              ["CNPJ", detail.cnpj ? formatCNPJ(detail.cnpj) : "—"],
              ["Razão social", pickString(base, "razao_social")],
              ["Nome fantasia", pickString(base, "nome_fantasia")],
              ["UF", pickString(base, isCompany ? "uf_sede" : "uf")],
              ["Município", pickString(base, "municipio")],
            ]} />
          </Section>
          <Section title="Enriquecimento RFB">
            <KV pairs={[
              ["CNAE principal", pickString(base, "cnae_principal")],
              ["CNAE descrição", pickString(base, "cnae_descricao")],
              ["Porte", pickString(base, "porte")],
              ["Capital social", base.capital_social ? formatCurrency(Number(base.capital_social)) : "—"],
              ["Data abertura", pickString(base, "data_abertura")],
              ["Natureza jurídica", pickString(base, "natureza_juridica")],
              ["Situação cadastral", pickString(base, "situacao_cadastral")],
              ["Endereço", `${pickString(base, "logradouro")}, ${pickString(base, "numero")} ${pickString(base, "complemento") !== "—" ? "- " + pickString(base, "complemento") : ""}`],
              ["Bairro", pickString(base, "bairro")],
              ["CEP", pickString(base, "cep")],
              ["Telefone", pickString(base, "telefone") !== "—" ? pickString(base, "telefone") : pickString(base, "telefone1")],
              ["Email", pickString(base, "email_responsavel") !== "—" ? pickString(base, "email_responsavel") : pickString(base, "email")],
            ]} />
          </Section>
          {isCompany && (
            <Section title="Plano e billing">
              <KV pairs={[
                ["Plano", pickString(base, "plano")],
                ["Status billing", pickString(base, "billing_status")],
                ["Valor mensal", base.valor_mensal ? formatCurrency(Number(base.valor_mensal)) : "—"],
                ["Próxima cobrança", formatDate(base.data_proxima_cobranca as string)],
                ["Asaas customer", pickString(base, "asaas_customer_id")],
              ]} />
            </Section>
          )}
          {detail.filiais.length > 0 && (
            <Section title={`Filiais (${detail.filiais.length})`}>
              <ul className="space-y-1 text-sm">
                {detail.filiais.map((f) => (
                  <li key={String(f.id)} className="flex justify-between border-b py-1.5" style={{ borderColor: "var(--border-secondary)" }}>
                    <span>{String(f.razao_social)}</span>
                    <span style={{ color: "var(--text-tertiary)" }}>
                      {f.cnpj ? formatCNPJ(String(f.cnpj)) : "—"} · {String(f.municipio)}/{String(f.uf_sede)}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {detail.instructions.length > 0 && (
            <Section title={`Instruções customizadas (${detail.instructions.length})`}>
              <ul className="space-y-2">
                {detail.instructions.map((i) => (
                  <li key={String(i.id)} className="border rounded p-2" style={{ borderColor: "var(--border-secondary)" }}>
                    <p className="text-xs font-medium">{String(i.titulo)} <Badge variant="gray">{String(i.categoria)}</Badge></p>
                    <p className="text-[11px] mt-1" style={{ color: "var(--text-tertiary)" }}>{String(i.conteudo).slice(0, 200)}</p>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </TabsContent>

        <TabsContent value="pessoas">
          <Section title={`Vigilantes (${detail.vigilantes.length})`}>
            {detail.vigilantes.length === 0 ? (
              <EmptyState title="Sem vigilantes" description="Esta empresa ainda não tem funcionários cadastrados." />
            ) : (
              <SimpleTable
                headers={["Nome", "Função", "Status", "CNV", "Validade CNV", "Porte"]}
                rows={detail.vigilantes.map((e) => [
                  String(e.nome_completo),
                  String(e.funcao_principal || "—"),
                  String(e.status || "—"),
                  String(e.cnv_numero || "—"),
                  formatDate(e.cnv_data_validade as string),
                  formatDate(e.porte_arma_validade as string),
                ])}
              />
            )}
          </Section>
        </TabsContent>

        <TabsContent value="frota">
          <Section title={`Veículos (${detail.frota.veiculos.length})`}>
            {detail.frota.veiculos.length === 0 ? (
              <EmptyState title="Sem veículos" description="Frota ainda vazia." />
            ) : (
              <SimpleTable
                headers={["Placa", "Modelo", "Tipo", "KM", "Licenciamento", "Status"]}
                rows={detail.frota.veiculos.map((v) => [
                  String(v.placa),
                  `${String(v.marca || "")} ${String(v.modelo || "")}`.trim(),
                  String(v.tipo || "—"),
                  String(v.km_atual ?? 0),
                  formatDate(v.licenciamento_validade as string),
                  String(v.status || "—"),
                ])}
              />
            )}
          </Section>
          {detail.frota.manutencoes.length > 0 && (
            <Section title={`Manutenções (${detail.frota.manutencoes.length})`}>
              <SimpleTable
                headers={["Tipo", "Realizada em", "Valor"]}
                rows={detail.frota.manutencoes.map((m) => [
                  String(m.tipo),
                  formatDate(m.realizada_em as string),
                  m.valor ? formatCurrency(Number(m.valor)) : "—",
                ])}
              />
            </Section>
          )}
        </TabsContent>

        <TabsContent value="compliance">
          <div className="grid grid-cols-2 gap-4">
            <Section title="Alvará principal">
              <KV pairs={[
                ["Número", pickString(base, "alvara_numero")],
                ["Validade", formatDate(base.alvara_validade as string)],
              ]} />
            </Section>
            <Section title="Procurações">
              {detail.gesp.procuracoes.length === 0 ? (
                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Nenhuma procuração registrada.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {detail.gesp.procuracoes.map((p) => (
                    <li key={String(p.id)} className="flex justify-between border-b py-1.5" style={{ borderColor: "var(--border-secondary)" }}>
                      <span>{String(p.nome_procurador)}</span>
                      <Badge variant="gray">{String(p.status)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
          <Section title={`GESP tasks (${detail.gesp.tasks.length})`}>
            {detail.gesp.tasks.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Nenhuma task GESP.</p>
            ) : (
              <SimpleTable
                headers={["Tipo", "Status", "Tentativas", "Protocolo", "Criado", "Concluído"]}
                rows={detail.gesp.tasks.map((t) => [
                  String(t.tipo_acao),
                  String(t.status),
                  String(t.tentativas ?? 0),
                  String(t.protocolo_gesp || "—"),
                  formatDateTime(t.created_at as string),
                  formatDateTime(t.completed_at as string),
                ])}
              />
            )}
          </Section>
          {detail.armamento.armas.length > 0 && (
            <Section title={`Armas (${detail.armamento.armas.length})`}>
              <SimpleTable
                headers={["Tipo", "Calibre", "Série", "SINARM", "Status"]}
                rows={detail.armamento.armas.map((a) => [
                  String(a.tipo),
                  String(a.calibre),
                  String(a.numero_serie),
                  String(a.registro_sinarm || "—"),
                  String(a.status),
                ])}
              />
            </Section>
          )}
          {detail.armamento.coletes.length > 0 && (
            <Section title={`Coletes (${detail.armamento.coletes.length})`}>
              <SimpleTable
                headers={["Série", "Nível", "Validade", "Status"]}
                rows={detail.armamento.coletes.map((c) => [
                  String(c.numero_serie),
                  String(c.nivel_protecao),
                  formatDate(c.data_validade as string),
                  String(c.status),
                ])}
              />
            </Section>
          )}
          {detail.discrepancias.length > 0 && (
            <Section title={`Discrepâncias (${detail.discrepancias.length})`}>
              <SimpleTable
                headers={["Tipo", "Campo", "Sistema", "GESP", "Status"]}
                rows={detail.discrepancias.map((d) => [
                  String(d.tipo_incompatibilidade),
                  String(d.campo_divergente),
                  String(d.valor_sistema || "—"),
                  String(d.valor_gesp || "—"),
                  String(d.status),
                ])}
              />
            </Section>
          )}
        </TabsContent>

        <TabsContent value="emails">
          <Section title={`Threads (${detail.emails.threads.length})`}>
            {detail.emails.threads.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Nenhuma conversa.</p>
            ) : (
              <SimpleTable
                headers={["Assunto", "Status", "Tipo demanda", "Atualizada"]}
                rows={detail.emails.threads.map((t) => [
                  String(t.subject),
                  String(t.status),
                  String(t.tipo_demanda || "—"),
                  formatDateTime(t.updated_at as string),
                ])}
              />
            )}
          </Section>
          <Section title={`Emails recebidos (${detail.emails.inbound.length})`}>
            {detail.emails.inbound.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Nenhum email recebido.</p>
            ) : (
              <SimpleTable
                headers={["De", "Assunto", "Tipo", "Status", "Recebido"]}
                rows={detail.emails.inbound.map((e) => [
                  String(e.from_email),
                  String(e.subject).slice(0, 60),
                  String(e.tipo_demanda || "—"),
                  String(e.status),
                  formatDateTime(e.received_at as string),
                ])}
              />
            )}
          </Section>
          <Section title={`Emails enviados (${detail.emails.outbound.length})`}>
            {detail.emails.outbound.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Nenhum envio.</p>
            ) : (
              <SimpleTable
                headers={["Template", "De", "Para", "Assunto", "Status", "Enviado"]}
                rows={detail.emails.outbound.map((e) => [
                  String(e.template_id),
                  String(e.from_email),
                  String(e.to_email),
                  String(e.subject).slice(0, 50),
                  String(e.status),
                  formatDateTime((e.sent_at || e.created_at) as string),
                ])}
              />
            )}
          </Section>
          <Section title={`Workflows (${detail.emails.workflows.length})`}>
            {detail.emails.workflows.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Nenhum workflow.</p>
            ) : (
              <SimpleTable
                headers={["Tipo", "Prioridade", "Status", "Criado"]}
                rows={detail.emails.workflows.map((w) => [
                  String(w.tipo_demanda),
                  String(w.prioridade),
                  String(w.status),
                  formatDateTime(w.created_at as string),
                ])}
              />
            )}
          </Section>
        </TabsContent>

        <TabsContent value="dou">
          <Section title={`Alvarás no DOU (${detail.dou.alvaras.length})`}>
            {detail.dou.alvaras.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Nenhum alvará indexado.</p>
            ) : (
              <SimpleTable
                headers={["Tipo", "Subtipo", "Processo", "Delegacia", "UF", "Validade"]}
                rows={detail.dou.alvaras.map((a) => [
                  String(a.tipo_alvara),
                  String(a.subtipo || "—"),
                  String(a.numero_processo || "—"),
                  String(a.delegacia || "—"),
                  String(a.uf || "—"),
                  formatDate(a.data_validade as string),
                ])}
              />
            )}
          </Section>
          <Section title={`Alertas DOU (${detail.dou.alertas.length})`}>
            {detail.dou.alertas.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Sem alertas DOU.</p>
            ) : (
              <SimpleTable
                headers={["Tipo", "Título", "Prioridade", "Status", "Enviado"]}
                rows={detail.dou.alertas.map((a) => [
                  String(a.tipo_alerta),
                  String(a.titulo),
                  String(a.prioridade),
                  String(a.status),
                  formatDateTime(a.enviado_em as string),
                ])}
              />
            )}
          </Section>
        </TabsContent>

        <TabsContent value="ai">
          <Section title={`Runs de agente (${detail.ai.runs.length})`}>
            {detail.ai.runs.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Nenhuma execução de agente para este CNPJ.</p>
            ) : (
              <SimpleTable
                headers={["Agente", "Trigger", "Status", "Tokens", "Custo", "Iniciado"]}
                rows={detail.ai.runs.map((r) => [
                  String(r.agent_name),
                  String(r.trigger_type),
                  String(r.status),
                  String(r.total_tokens_used ?? 0),
                  r.total_cost_usd ? `$${Number(r.total_cost_usd).toFixed(4)}` : "$0",
                  formatDateTime(r.started_at as string),
                ])}
              />
            )}
          </Section>
          <Section title={`Eventos IML (${detail.ai.events.length})`}>
            {detail.ai.events.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Sem eventos IML.</p>
            ) : (
              <ul className="space-y-1.5">
                {detail.ai.events.slice(0, 20).map((e) => (
                  <li
                    key={String(e.id)}
                    className="flex items-start gap-2 text-xs border-l-2 pl-2 py-1"
                    style={{
                      borderColor:
                        e.severity === "critical" || e.severity === "high"
                          ? "var(--status-danger)"
                          : e.severity === "medium"
                          ? "var(--status-warning)"
                          : "var(--text-tertiary)",
                    }}
                  >
                    <span className="font-mono text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                      {formatDateTime(e.occurred_at as string)}
                    </span>
                    <span className="font-medium">{String(e.event_type)}</span>
                    <span style={{ color: "var(--text-tertiary)" }}>
                      {String(e.agent_name || "")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          {detail.type === "prospect" && detail.prospect.activities.length > 0 && (
            <Section title={`Atividades de prospecção (${detail.prospect.activities.length})`}>
              <ul className="space-y-2">
                {detail.prospect.activities.map((a) => (
                  <li key={String(a.id)} className="border rounded p-2" style={{ borderColor: "var(--border-secondary)" }}>
                    <div className="flex items-center justify-between mb-1">
                      <Badge variant="gray">{String(a.tipo)}</Badge>
                      <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                        {formatDateTime(a.created_at as string)}
                      </span>
                    </div>
                    <p className="text-xs">{String(a.descricao)}</p>
                    {a.resultado ? (
                      <p className="text-[11px] mt-1" style={{ color: "var(--text-tertiary)" }}>
                        Resultado: {String(a.resultado)}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </TabsContent>

        <TabsContent value="raw">
          <Section title="Payload bruto (debug)">
            <pre className="text-[11px] overflow-x-auto p-3 rounded" style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>
              {JSON.stringify(detail, null, 2)}
            </pre>
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Pequenos componentes ───
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-[12px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-tertiary)" }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: "var(--border-primary)", background: "var(--bg-secondary)" }}>
      <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
        {label}
      </p>
      <p className="text-xl font-semibold mt-0.5" style={{ color: "var(--vigi-navy)" }}>
        {value}
      </p>
    </div>
  );
}

function KV({ pairs }: { pairs: Array<[string, string]> }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
      {pairs.map(([k, v]) => (
        <div key={k} className="flex justify-between border-b py-1" style={{ borderColor: "var(--border-secondary)" }}>
          <dt style={{ color: "var(--text-tertiary)" }}>{k}</dt>
          <dd className="font-medium text-right" style={{ color: "var(--text-primary)" }}>
            {safeStr(v)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded border" style={{ borderColor: "var(--border-primary)" }}>
      <table className="w-full text-xs">
        <thead style={{ background: "var(--bg-tertiary)" }}>
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-2 py-1.5 text-left font-medium uppercase tracking-wide text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t" style={{ borderColor: "var(--border-secondary)" }}>
              {r.map((c, j) => (
                <td key={j} className="px-2 py-1.5" style={{ color: "var(--text-secondary)" }}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
