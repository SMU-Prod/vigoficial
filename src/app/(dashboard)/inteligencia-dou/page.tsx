"use client";

import { useCallback, useEffect, useState } from "react";
import type { ItemLiberado } from "@/types/database";
import { useDebounce } from "@/hooks/useDebounce";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCNPJ, formatDate, formatDateTime } from "@/lib/formatters";

// =============================================================================
// VIGI — Inteligencia DOU (Painel Completo)
// Empresas do DOU com alvaras, armas, municoes, publicacoes, outreach, etc.
// =============================================================================

// -- Types --
interface ProspectDOU {
  id: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnae_principal: string | null;
  cnae_descricao: string | null;
  data_abertura: string | null;
  capital_social: number | null;
  porte: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cep: string | null;
  municipio: string | null;
  uf: string | null;
  telefone1: string | null;
  telefone2: string | null;
  email: string | null;
  contato_nome: string | null;
  contato_cargo: string | null;
  contato_telefone: string | null;
  contato_email: string | null;
  status: string;
  source: string;
  segmento: string | null;
  temperatura: string;
  score: number;
  plano_interesse: string | null;
  valor_estimado: number | null;
  ultimo_contato: string | null;
  proximo_followup: string | null;
  notas: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  alvaras: AlvaraDOU[];
  alertas: AlertaDOU[];
  atividades: AtividadeDOU[];
  emails: EmailDOU[];
  resumo: {
    total_alvaras: number;
    total_alertas: number;
    total_atividades: number;
    total_emails: number;
    emails_enviados: number;
    itens_liberados: Record<string, number>;
    itens_detalhados: Array<{ tipo: string; descricao: string; quantidade: number; calibre?: string; modelo?: string }>;
    armas: number;
    municoes: number;
    coletes: number;
    ultimo_alvara: string | null;
    primeiro_alvara: string | null;
    proximo_vencimento: string | null;
    tipos_alvara: string[];
    delegacias: string[];
  };
}

interface AlvaraDOU {
  id: string;
  tipo_alvara: string;
  subtipo: string | null;
  numero_processo: string | null;
  delegacia: string | null;
  itens_liberados: ItemLiberado[];
  validade_dias: number | null;
  data_validade: string | null;
  texto_original: string;
  notificado: boolean;
  created_at: string;
  publicacao: {
    id: string;
    titulo: string;
    tipo_ato: string;
    numero_ato: string | null;
    data_publicacao: string;
    secao: number;
    pagina: string | null;
    url_publicacao: string | null;
    orgao_principal: string | null;
    orgao_subordinado: string | null;
    resumo: string | null;
    assinante: string | null;
    cargo_assinante: string | null;
  } | null;
}

interface AlertaDOU {
  id: string;
  tipo_alerta: string;
  titulo: string;
  mensagem: string;
  prioridade: string;
  status: string;
  created_at: string;
}

interface AtividadeDOU {
  id: string;
  tipo: string;
  descricao: string;
  resultado: string | null;
  created_at: string;
  realizado_por: string;
}

interface EmailDOU {
  id: string;
  to_email: string;
  template_id: string;
  subject: string;
  status: string;
  erro_detalhe: string | null;
  created_at: string;
  sent_at: string | null;
}

interface ResumoGeral {
  total: number;
  novos: number;
  contatados: number;
  qualificados: number;
  comAlvara: number;
  semEmail: number;
  totalAlvaras: number;
  totalAlertas: number;
  emailsEnviados: number;
  armasTotal: number;
  municoesTotal: number;
  coleteTotal: number;
  equipamentosTotal: number;
  porTipoAlvara: Record<string, number>;
  porUf: Record<string, number>;
  porTemperatura: Record<string, number>;
  ufs: string[];
}

type TabView = "empresas" | "estatisticas";

// -- Constants --
const TIPO_ALVARA: Record<string, string> = {
  autorizacao: "Autorizacao", renovacao: "Renovacao", cancelamento: "Cancelamento",
  suspensao: "Suspensao", revisao: "Revisao", transferencia: "Transferencia",
};
const STATUS_BADGE: Record<string, string> = {
  novo: "bg-[var(--status-info)]/20 text-[var(--status-info)] border-[var(--status-info)]",
  contatado: "bg-[var(--status-warning)]/20 text-[var(--status-warning)] border-[var(--status-warning)]",
  qualificado: "bg-[var(--status-success)]/20 text-[var(--status-success)] border-[var(--status-success)]",
  proposta_enviada: "bg-[var(--vigi-gold)]/20 text-[var(--vigi-gold)] border-[var(--vigi-gold)]",
  ganho: "bg-[var(--status-success)]/20 text-[var(--status-success)] border-[var(--status-success)]",
  perdido: "bg-[var(--status-danger)]/20 text-[var(--status-danger)] border-[var(--status-danger)]",
};
const TEMP_BADGE: Record<string, { bg: string; icon: string }> = {
  frio: { bg: "bg-[var(--status-info)]/20 text-[var(--status-info)] border-[var(--status-info)]", icon: "●" },
  morno: { bg: "bg-[var(--status-warning)]/20 text-[var(--status-warning)] border-[var(--status-warning)]", icon: "●" },
  quente: { bg: "bg-[var(--status-danger)]/20 text-[var(--status-danger)] border-[var(--status-danger)]", icon: "●" },
};

// -- Helpers --
function fmtCNPJSafe(cnpj: string): string {
  return formatCNPJ(cnpj || "");
}
function fmtDate(d: string | null): string {
  if (!d) return "—";
  return formatDate(d);
}
function fmtDateTime(d: string | null): string {
  if (!d) return "—";
  return formatDateTime(d);
}
function fmtMoney(v: number | null): string {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function daysUntil(d: string | null): number | null {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

// =============================================================================
// Page Component
// =============================================================================
export default function InteligenciaDOUPage() {
  const [prospects, setProspects] = useState<ProspectDOU[]>([]);
  const [resumo, setResumo] = useState<ResumoGeral | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedTab, setExpandedTab] = useState<string>("alvaras");
  const [tabView, setTabView] = useState<TabView>("empresas");

  // Filtros
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [filterUf, setFilterUf] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterTipo, setFilterTipo] = useState("");
  const [filterTemp, setFilterTemp] = useState("");

  // AbortController for race condition prevention
  const abortControllerRef = useCallback(() => new AbortController(), []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const controller = abortControllerRef();
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (filterUf) params.set("uf", filterUf);
      if (filterStatus) params.set("status", filterStatus);
      if (filterTipo) params.set("tipo_alvara", filterTipo);
      if (filterTemp) params.set("temperatura", filterTemp);
      params.set("limit", "100");

      const res = await fetch(`/api/prospects/dou-painel?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const data = await res.json();
      setProspects(data.prospects || []);
      setResumo(data.resumo || null);
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err instanceof Error ? err.message : "Erro desconhecido");
      }
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filterUf, filterStatus, filterTipo, filterTemp, abortControllerRef]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    return () => {};
  }, []);

  return (
    <div className="space-y-6">
      {/* ========== HEADER ========== */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--vigi-navy)]">Inteligencia DOU</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Painel completo de empresas de seguranca privada detectadas no Diario Oficial da Uniao
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setTabView(tabView === "empresas" ? "estatisticas" : "empresas")}
            aria-label={tabView === "empresas" ? "Ver estatísticas" : "Ver empresas"}
            className="px-4 py-2 border border-[var(--vigi-navy)] text-[var(--vigi-navy)] rounded-lg text-sm hover:bg-[var(--bg-hover)]"
          >
            {tabView === "empresas" ? "Ver Estatisticas" : "Ver Empresas"}
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            aria-label="Atualizar dados"
            className="px-4 py-2 bg-[var(--btn-primary)] text-white rounded-lg text-sm hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Carregando..." : "Atualizar"}
          </button>
        </div>
      </div>

      {/* ========== KPI GRID ========== */}
      {resumo && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <KPICard label="Empresas DOU" value={resumo.total} color="var(--vigi-navy)" icon="🏢" />
          <KPICard label="Com Alvara" value={resumo.comAlvara} color="var(--vigi-gold)" icon="📋" />
          <KPICard label="Armas" value={resumo.armasTotal} color="var(--status-danger)" icon="🔫" />
          <KPICard label="Municoes" value={resumo.municoesTotal} color="var(--status-warning)" icon="💥" />
          <KPICard label="Coletes" value={resumo.coleteTotal} color="var(--status-info)" icon="🛡" />
          <KPICard label="Total Alvaras" value={resumo.totalAlvaras} color="var(--vigi-gold)" icon="📄" />
          <KPICard label="Novos" value={resumo.novos} color="var(--status-info)" icon="🆕" />
          <KPICard label="Contatados" value={resumo.contatados} color="var(--status-warning)" icon="📞" />
          <KPICard label="Qualificados" value={resumo.qualificados} color="var(--status-success)" icon="✓" />
          <KPICard label="Emails Enviados" value={resumo.emailsEnviados} color="var(--vigi-gold)" icon="📧" />
          <KPICard label="Sem Email" value={resumo.semEmail} color="var(--status-danger)" icon="⚠" />
          <KPICard label="Alertas" value={resumo.totalAlertas} color="var(--status-danger)" icon="🔔" />
        </div>
      )}

      {/* ========== FILTROS ========== */}
      <div className="bg-[var(--bg-secondary)] rounded-xl shadow-sm border border-[var(--border-primary)] p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <input
            type="text"
            placeholder="Buscar razao social, CNPJ ou fantasia..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchData()}
            aria-label="Buscar por razão social, CNPJ ou nome fantasia"
            className="border border-[var(--border-primary)] rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--vigi-gold)] focus:outline-none bg-[var(--bg-secondary)] text-[var(--text-primary)]"
          />
          <select value={filterUf} onChange={(e) => { setFilterUf(e.target.value); }} aria-label="Filtrar por estado" className="border border-[var(--border-primary)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-secondary)] text-[var(--text-primary)]">
            <option value="">Todos os Estados</option>
            {(resumo?.ufs || []).map((uf) => <option key={uf} value={uf}>{uf}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} aria-label="Filtrar por status" className="border border-[var(--border-primary)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-secondary)] text-[var(--text-primary)]">
            <option value="">Todos os Status</option>
            <option value="novo">Novo</option>
            <option value="contatado">Contatado</option>
            <option value="qualificado">Qualificado</option>
            <option value="proposta_enviada">Proposta Enviada</option>
            <option value="ganho">Ganho</option>
            <option value="perdido">Perdido</option>
          </select>
          <select value={filterTemp} onChange={(e) => setFilterTemp(e.target.value)} aria-label="Filtrar por temperatura" className="border border-[var(--border-primary)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-secondary)] text-[var(--text-primary)]">
            <option value="">Todas Temperaturas</option>
            <option value="frio">Frio</option>
            <option value="morno">Morno</option>
            <option value="quente">Quente</option>
          </select>
          <select value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)} aria-label="Filtrar por tipo de alvará" className="border border-[var(--border-primary)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-secondary)] text-[var(--text-primary)]">
            <option value="">Todos Tipos Alvara</option>
            {Object.entries(TIPO_ALVARA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-[var(--status-danger)]/10 border border-[var(--status-danger)] rounded-xl p-4 text-[var(--status-danger)] text-sm">{error}</div>
      )}

      {/* ========== LOADING ========== */}
      {loading && (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-[var(--bg-secondary)] rounded-xl shadow-sm border border-[var(--border-primary)] p-6 animate-pulse">
              <div className="h-5 bg-[var(--border-primary)] rounded w-1/3 mb-3" />
              <div className="h-4 bg-[var(--bg-tertiary)] rounded w-2/3 mb-2" />
              <div className="h-4 bg-[var(--bg-tertiary)] rounded w-1/2" />
            </div>
          ))}
        </div>
      )}

      {/* ========== ESTATISTICAS TAB ========== */}
      {!loading && tabView === "estatisticas" && resumo && (
        <div className="space-y-6">
          {/* Por UF */}
          <div className="bg-[var(--bg-secondary)] rounded-xl shadow-sm border border-[var(--border-primary)] p-6">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Empresas por Estado</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {Object.entries(resumo.porUf).sort((a, b) => b[1] - a[1]).map(([uf, count]) => (
                <div key={uf} className="bg-[var(--bg-tertiary)] rounded-lg p-3 text-center cursor-pointer hover:bg-[var(--vigi-gold-muted)]"
                  onClick={() => { setFilterUf(uf); setTabView("empresas"); }}>
                  <div className="text-xl font-bold text-[var(--text-primary)]">{count}</div>
                  <div className="text-xs text-[var(--text-secondary)] font-medium">{uf}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Por Tipo de Alvará */}
          <div className="bg-[var(--bg-secondary)] rounded-xl shadow-sm border border-[var(--border-primary)] p-6">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Alvaras por Tipo</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {Object.entries(resumo.porTipoAlvara).sort((a, b) => b[1] - a[1]).map(([tipo, count]) => (
                <div key={tipo} className="bg-[var(--bg-tertiary)] rounded-lg p-4 text-center cursor-pointer hover:bg-[var(--vigi-gold-muted)]"
                  onClick={() => { setFilterTipo(tipo); setTabView("empresas"); }}>
                  <div className="text-2xl font-bold text-[var(--vigi-gold)]">{count}</div>
                  <div className="text-xs text-[var(--text-secondary)]">{TIPO_ALVARA[tipo] || tipo}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Por Temperatura */}
          <div className="bg-[var(--bg-secondary)] rounded-xl shadow-sm border border-[var(--border-primary)] p-6">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Pipeline por Temperatura</h3>
            <div className="grid grid-cols-3 gap-4">
              {Object.entries(resumo.porTemperatura).map(([temp, count]) => (
                <div key={temp} className={`rounded-xl p-6 text-center border ${TEMP_BADGE[temp]?.bg || "bg-[var(--bg-tertiary)] border-[var(--border-primary)]"}`}>
                  <div className="text-3xl font-bold text-[var(--text-primary)]">{count}</div>
                  <div className="text-sm font-medium mt-1 capitalize text-[var(--text-secondary)]">{temp}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Arsenal Global */}
          <div className="bg-[var(--bg-secondary)] rounded-xl shadow-sm border border-[var(--border-primary)] p-6">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Arsenal Total Rastreado</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-xl p-5 text-center border border-[var(--status-danger)] bg-[var(--status-danger)]/10">
                <div className="text-3xl font-bold text-[var(--status-danger)]">{resumo.armasTotal}</div>
                <div className="text-sm text-[var(--status-danger)] mt-1 opacity-80">Armas de Fogo</div>
              </div>
              <div className="rounded-xl p-5 text-center border border-[var(--status-warning)] bg-[var(--status-warning)]/10">
                <div className="text-3xl font-bold text-[var(--status-warning)]">{resumo.municoesTotal}</div>
                <div className="text-sm text-[var(--status-warning)] mt-1 opacity-80">Municoes</div>
              </div>
              <div className="rounded-xl p-5 text-center border border-[var(--status-info)] bg-[var(--status-info)]/10">
                <div className="text-3xl font-bold text-[var(--status-info)]">{resumo.coleteTotal}</div>
                <div className="text-sm text-[var(--status-info)] mt-1 opacity-80">Coletes Balisticos</div>
              </div>
              <div className="rounded-xl p-5 text-center border border-[var(--border-primary)] bg-[var(--bg-tertiary)]">
                <div className="text-3xl font-bold text-[var(--text-primary)]">{resumo.equipamentosTotal}</div>
                <div className="text-sm text-[var(--text-secondary)] mt-1">Outros Equipamentos</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========== EMPRESAS TAB ========== */}
      {!loading && tabView === "empresas" && prospects.length === 0 && (
        <div className="bg-[var(--bg-secondary)] rounded-xl shadow-sm border border-[var(--border-primary)]">
          <EmptyState
            icon="🧠"
            title="Nenhum dado de inteligência encontrado"
            description="Execute uma raspagem do DOU ou ajuste os filtros para encontrar empresas"
          />
        </div>
      )}

      {!loading && tabView === "empresas" && prospects.map((p) => (
        <div key={p.id} className="bg-[var(--bg-secondary)] rounded-xl shadow-sm border border-[var(--border-primary)] overflow-hidden">
          {/* ===== CARD HEADER ===== */}
          <div className="p-5 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors" onClick={() => {
            setExpandedId(expandedId === p.id ? null : p.id);
            setExpandedTab("alvaras");
          }}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                {/* Linha 1: Nome + badges */}
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="text-lg font-semibold text-[var(--text-primary)] truncate">{p.razao_social}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_BADGE[p.status] || "bg-[var(--bg-tertiary)]"}`}>
                    {p.status.replace(/_/g, " ")}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${TEMP_BADGE[p.temperatura]?.bg || ""}`}>
                    {TEMP_BADGE[p.temperatura]?.icon} {p.temperatura}
                  </span>
                  {p.source === "dou" && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--status-info-bg)] text-[var(--status-info)] border border-[var(--status-info)]">
                      Auto-DOU
                    </span>
                  )}
                </div>

                {/* Linha 2: CNPJ + Localização + Contato */}
                <div className="flex items-center gap-4 text-sm text-[var(--text-secondary)] flex-wrap">
                  <span className="font-mono text-xs bg-[var(--bg-tertiary)] px-2 py-0.5 rounded">{fmtCNPJSafe(p.cnpj)}</span>
                  {p.municipio && p.uf && <span>{p.municipio}/{p.uf}</span>}
                  {!p.municipio && p.uf && <span>{p.uf}</span>}
                  {(p.email || p.contato_email) && (
                    <span className="text-[var(--status-info)] text-xs">{p.email || p.contato_email}</span>
                  )}
                  {p.telefone1 && <span className="text-xs">{p.telefone1}</span>}
                  {p.nome_fantasia && <span className="text-xs text-[var(--text-tertiary)] italic">{p.nome_fantasia}</span>}
                </div>

                {/* Linha 3: CNAE + Capital + Score */}
                <div className="flex items-center gap-4 text-xs text-[var(--text-tertiary)] mt-1 flex-wrap">
                  {p.cnae_descricao && <span>CNAE: {p.cnae_descricao}</span>}
                  {p.capital_social && <span>Capital: {fmtMoney(p.capital_social)}</span>}
                  {p.porte && <span>Porte: {p.porte}</span>}
                  {p.data_abertura && <span>Abertura: {fmtDate(p.data_abertura)}</span>}
                  <span className="text-[var(--vigi-gold)] font-semibold">Score: {p.score}</span>
                </div>
              </div>

              {/* Resumo numérico à direita */}
              <div className="flex items-center gap-3 shrink-0">
                {p.resumo.armas > 0 && (
                  <NumBox value={p.resumo.armas} label="Armas" color="var(--status-danger)" />
                )}
                {p.resumo.municoes > 0 && (
                  <NumBox value={p.resumo.municoes} label="Municoes" color="var(--status-warning)" />
                )}
                {p.resumo.coletes > 0 && (
                  <NumBox value={p.resumo.coletes} label="Coletes" color="var(--status-info)" />
                )}
                <NumBox value={p.resumo.total_alvaras} label="Alvaras" color="var(--vigi-gold)" />
                {p.resumo.total_emails > 0 && (
                  <NumBox value={p.resumo.emails_enviados} label="Emails" color="var(--vigi-gold)" />
                )}
                <span className="text-[var(--text-tertiary)] text-lg ml-2">
                  {expandedId === p.id ? "▲" : "▼"}
                </span>
              </div>
            </div>

            {/* Tags + Delegacias + Próximo vencimento */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {p.resumo.delegacias.map((d, i) => (
                <span key={i} className="text-xs bg-[var(--vigi-navy)]/10 text-[var(--vigi-navy)] px-2 py-0.5 rounded font-mono">{d}</span>
              ))}
              {p.resumo.proximo_vencimento && (() => {
                const days = daysUntil(p.resumo.proximo_vencimento);
                const urgent = days !== null && days <= 30;
                return (
                  <span className={`text-xs px-2 py-0.5 rounded ${urgent ? "bg-[var(--status-danger)]/20 text-[var(--status-danger)]" : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"}`}>
                    Vence: {fmtDate(p.resumo.proximo_vencimento)} {days !== null && `(${days}d)`}
                  </span>
                );
              })()}
              {p.tags?.slice(0, 5).map((t, i) => (
                <span key={i} className="text-xs bg-[var(--bg-tertiary)] text-[var(--text-secondary)] px-1.5 py-0.5 rounded">{t}</span>
              ))}
            </div>
          </div>

          {/* ===== EXPANDED DETAILS ===== */}
          {expandedId === p.id && (
            <div className="border-t border-[var(--border-primary)]">
              {/* Sub-tabs */}
              <div className="flex bg-[var(--bg-tertiary)] border-b border-[var(--border-primary)] overflow-x-auto">
                {[
                  { key: "alvaras", label: `Alvaras (${p.alvaras.length})` },
                  { key: "itens", label: `Itens Liberados (${p.resumo.itens_detalhados.length})` },
                  { key: "publicacoes", label: "Publicacoes DOU" },
                  { key: "cadastro", label: "Dados Cadastrais" },
                  { key: "alertas", label: `Alertas (${p.alertas.length})` },
                  { key: "emails", label: `Emails (${p.emails.length})` },
                  { key: "timeline", label: `Timeline (${p.resumo.total_atividades})` },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setExpandedTab(tab.key)}
                    aria-label={`Aba ${tab.label}`}
                    aria-selected={expandedTab === tab.key}
                    role="tab"
                    className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                      expandedTab === tab.key
                        ? "border-[var(--vigi-gold)] text-[var(--text-primary)] bg-[var(--bg-secondary)]"
                        : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="p-5">
                {/* ---------- TAB: ALVARÁS ---------- */}
                {expandedTab === "alvaras" && (
                  <div className="space-y-4">
                    {p.alvaras.length === 0 ? (
                      <p className="text-sm text-[var(--text-tertiary)] text-center py-6">Nenhum alvara vinculado</p>
                    ) : p.alvaras.map((a) => (
                      <div key={a.id} className="bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-primary)] p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <span className="text-sm font-semibold text-[var(--text-primary)]">
                              {TIPO_ALVARA[a.tipo_alvara] || a.tipo_alvara}
                            </span>
                            {a.subtipo && <span className="ml-2 text-xs text-[var(--text-secondary)]">({a.subtipo.replace(/_/g, " ")})</span>}
                            {a.notificado && <span className="ml-2 text-xs text-[var(--status-success)]">Notificado</span>}
                          </div>
                          <span className="text-xs text-[var(--text-tertiary)]">{fmtDate(a.created_at)}</span>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-3">
                          <InfoField label="Processo" value={a.numero_processo} />
                          <InfoField label="Delegacia" value={a.delegacia} />
                          <InfoField label="Validade" value={a.validade_dias ? `${a.validade_dias} dias` : null} />
                          <InfoField label="Vencimento" value={a.data_validade ? fmtDate(a.data_validade) : null} />
                        </div>

                        {a.itens_liberados?.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-3">
                            {a.itens_liberados.map((item: ItemLiberado, idx: number) => (
                              <span key={idx} className="inline-flex items-center gap-1 bg-[var(--vigi-gold-muted)] border border-[var(--vigi-gold)] text-[var(--vigi-gold)] text-xs px-2.5 py-1 rounded-lg">
                                <strong>{item.quantidade}x</strong> {item.descricao}
                                {item.calibre && <span className="font-mono">({item.calibre})</span>}
                                {item.modelo && <span className="italic">{item.modelo}</span>}
                              </span>
                            ))}
                          </div>
                        )}

                        {a.publicacao && (
                          <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-primary)] p-3 text-xs mt-2">
                            <div className="flex items-start justify-between">
                              <div>
                                <span className="text-[var(--text-tertiary)]">DOU Secao {a.publicacao.secao}</span>
                                <span className="text-[var(--text-tertiary)] mx-1">•</span>
                                <span className="text-[var(--text-secondary)]">{fmtDate(a.publicacao.data_publicacao)}</span>
                                {a.publicacao.pagina && <span className="text-[var(--text-tertiary)] ml-1">p.{a.publicacao.pagina}</span>}
                              </div>
                              {a.publicacao.url_publicacao && (
                                <a href={a.publicacao.url_publicacao} target="_blank" rel="noopener noreferrer"
                                  className="text-[var(--status-info)] hover:underline font-medium">
                                  Ver no DOU →
                                </a>
                              )}
                            </div>
                            <p className="text-[var(--text-primary)] mt-1 font-medium">{a.publicacao.titulo}</p>
                            {a.publicacao.orgao_principal && (
                              <p className="text-[var(--text-tertiary)] mt-0.5">{a.publicacao.orgao_principal} {a.publicacao.orgao_subordinado ? `/ ${a.publicacao.orgao_subordinado}` : ""}</p>
                            )}
                            {a.publicacao.assinante && (
                              <p className="text-[var(--text-tertiary)] mt-0.5">Assinante: {a.publicacao.assinante} {a.publicacao.cargo_assinante ? `(${a.publicacao.cargo_assinante})` : ""}</p>
                            )}
                          </div>
                        )}

                        {a.texto_original && (
                          <details className="mt-2">
                            <summary className="text-xs text-[var(--text-tertiary)] cursor-pointer hover:text-[var(--text-secondary)]">Ver texto original</summary>
                            <p className="text-xs text-[var(--text-secondary)] mt-2 whitespace-pre-wrap bg-[var(--bg-secondary)] rounded p-3 border border-[var(--border-primary)] max-h-40 overflow-y-auto">
                              {a.texto_original}
                            </p>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* ---------- TAB: ITENS LIBERADOS ---------- */}
                {expandedTab === "itens" && (
                  <div>
                    {p.resumo.itens_detalhados.length === 0 ? (
                      <p className="text-sm text-[var(--text-tertiary)] text-center py-6">Nenhum item liberado registrado</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-[var(--border-primary)] text-left">
                              <th className="pb-2 text-xs text-[var(--text-tertiary)] font-medium">Tipo</th>
                              <th className="pb-2 text-xs text-[var(--text-tertiary)] font-medium">Descricao</th>
                              <th className="pb-2 text-xs text-[var(--text-tertiary)] font-medium">Qtd</th>
                              <th className="pb-2 text-xs text-[var(--text-tertiary)] font-medium">Calibre</th>
                              <th className="pb-2 text-xs text-[var(--text-tertiary)] font-medium">Modelo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {p.resumo.itens_detalhados.map((item, idx) => (
                              <tr key={idx} className="border-b border-[var(--border-primary)]">
                                <td className="py-2">
                                  <span className={`text-xs px-2 py-0.5 rounded ${
                                    item.tipo.includes("arma") ? "bg-[var(--status-danger)]/10 text-[var(--status-danger)]" :
                                    item.tipo.includes("munic") ? "bg-[var(--status-warning)]/10 text-[var(--status-warning)]" :
                                    item.tipo.includes("colete") ? "bg-[var(--status-info)]/10 text-[var(--status-info)]" :
                                    "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
                                  }`}>
                                    {item.tipo}
                                  </span>
                                </td>
                                <td className="py-2 text-[var(--text-primary)]">{item.descricao}</td>
                                <td className="py-2 font-bold text-[var(--text-primary)]">{item.quantidade}</td>
                                <td className="py-2 text-[var(--text-secondary)] font-mono">{item.calibre || "—"}</td>
                                <td className="py-2 text-[var(--text-secondary)]">{item.modelo || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {/* Totais */}
                        <div className="flex gap-4 mt-4 pt-3 border-t border-[var(--border-primary)]">
                          {Object.entries(p.resumo.itens_liberados).map(([tipo, qtd]) => (
                            <span key={tipo} className="text-xs font-medium text-[var(--text-secondary)]">
                              {tipo}: <strong className="text-[var(--text-primary)]">{qtd}</strong>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ---------- TAB: PUBLICAÇÕES DOU ---------- */}
                {expandedTab === "publicacoes" && (
                  <div className="space-y-3">
                    {(() => {
                      const pubs = p.alvaras
                        .filter((a) => a.publicacao)
                        .map((a) => a.publicacao!)
                        .filter((pub, i, arr) => arr.findIndex((x) => x.id === pub.id) === i);
                      if (pubs.length === 0) return <p className="text-sm text-[var(--text-tertiary)] text-center py-6">Nenhuma publicacao vinculada</p>;
                      return pubs.map((pub) => (
                        <div key={pub.id} className="bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-primary)] p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <h5 className="text-sm font-medium text-[var(--text-primary)]">{pub.titulo}</h5>
                              <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)] mt-1">
                                <span>Tipo: {pub.tipo_ato}</span>
                                {pub.numero_ato && <span>N: {pub.numero_ato}</span>}
                                <span>Secao {pub.secao}</span>
                                <span>{fmtDate(pub.data_publicacao)}</span>
                                {pub.pagina && <span>Pag. {pub.pagina}</span>}
                              </div>
                            </div>
                            {pub.url_publicacao && (
                              <a href={pub.url_publicacao} target="_blank" rel="noopener noreferrer"
                                className="text-xs text-[var(--status-info)] hover:underline shrink-0">
                                Abrir no DOU →
                              </a>
                            )}
                          </div>
                          {pub.orgao_principal && (
                            <p className="text-xs text-[var(--text-tertiary)]">{pub.orgao_principal} {pub.orgao_subordinado ? `/ ${pub.orgao_subordinado}` : ""}</p>
                          )}
                          {pub.resumo && <p className="text-xs text-[var(--text-secondary)] mt-2">{pub.resumo}</p>}
                          {pub.assinante && (
                            <p className="text-xs text-[var(--text-tertiary)] mt-1">
                              Assinado por: {pub.assinante} {pub.cargo_assinante ? `— ${pub.cargo_assinante}` : ""}
                            </p>
                          )}
                        </div>
                      ));
                    })()}
                  </div>
                )}

                {/* ---------- TAB: DADOS CADASTRAIS ---------- */}
                {expandedTab === "cadastro" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-[var(--text-primary)] border-b border-[var(--border-primary)] pb-1">Dados da Empresa</h4>
                      <InfoRow label="Razao Social" value={p.razao_social} />
                      <InfoRow label="Nome Fantasia" value={p.nome_fantasia} />
                      <InfoRow label="CNPJ" value={fmtCNPJSafe(p.cnpj)} mono />
                      <InfoRow label="CNAE" value={p.cnae_principal ? `${p.cnae_principal} — ${p.cnae_descricao || ""}` : null} />
                      <InfoRow label="Capital Social" value={fmtMoney(p.capital_social)} />
                      <InfoRow label="Porte" value={p.porte} />
                      <InfoRow label="Data Abertura" value={fmtDate(p.data_abertura)} />
                      <InfoRow label="Source" value={p.source} />
                      <InfoRow label="Segmento" value={p.segmento} />
                    </div>
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-[var(--text-primary)] border-b border-[var(--border-primary)] pb-1">Endereco</h4>
                      <InfoRow label="Logradouro" value={p.logradouro ? `${p.logradouro}${p.numero ? `, ${p.numero}` : ""}${p.complemento ? ` — ${p.complemento}` : ""}` : null} />
                      <InfoRow label="Bairro" value={p.bairro} />
                      <InfoRow label="Municipio/UF" value={p.municipio ? `${p.municipio}/${p.uf}` : p.uf} />
                      <InfoRow label="CEP" value={p.cep} />

                      <h4 className="text-sm font-semibold text-[var(--text-primary)] border-b border-[var(--border-primary)] pb-1 mt-4">Contatos</h4>
                      <InfoRow label="Email" value={p.email} />
                      <InfoRow label="Telefone 1" value={p.telefone1} />
                      <InfoRow label="Telefone 2" value={p.telefone2} />
                      <InfoRow label="Contato" value={p.contato_nome ? `${p.contato_nome}${p.contato_cargo ? ` (${p.contato_cargo})` : ""}` : null} />
                      <InfoRow label="Email Contato" value={p.contato_email} />
                      <InfoRow label="Tel Contato" value={p.contato_telefone} />

                      <h4 className="text-sm font-semibold text-[var(--text-primary)] border-b border-[var(--border-primary)] pb-1 mt-4">Pipeline</h4>
                      <InfoRow label="Plano Interesse" value={p.plano_interesse} />
                      <InfoRow label="Valor Estimado" value={fmtMoney(p.valor_estimado)} />
                      <InfoRow label="Ultimo Contato" value={fmtDate(p.ultimo_contato)} />
                      <InfoRow label="Proximo Followup" value={fmtDate(p.proximo_followup)} />
                    </div>
                    {p.notas && (
                      <div className="md:col-span-2">
                        <h4 className="text-sm font-semibold text-[var(--text-primary)] border-b border-[var(--border-primary)] pb-1 mb-2">Notas</h4>
                        <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap bg-[var(--bg-tertiary)] rounded-lg p-3">{p.notas}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ---------- TAB: ALERTAS ---------- */}
                {expandedTab === "alertas" && (
                  <div className="space-y-2">
                    {p.alertas.length === 0 ? (
                      <p className="text-sm text-[var(--text-tertiary)] text-center py-6">Nenhum alerta gerado</p>
                    ) : p.alertas.map((al) => (
                      <div key={al.id} className="bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-primary)] p-3 flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-sm font-medium ${
                              al.prioridade === "urgente" ? "text-[var(--status-danger)]" :
                              al.prioridade === "alta" ? "text-[var(--status-warning)]" :
                              al.prioridade === "normal" ? "text-[var(--status-info)]" : "text-[var(--text-secondary)]"
                            }`}>
                              {al.titulo}
                            </span>
                            <span className="text-xs text-[var(--text-tertiary)]">{al.tipo_alerta.replace(/_/g, " ")}</span>
                          </div>
                          {al.mensagem && <p className="text-xs text-[var(--text-secondary)]">{al.mensagem}</p>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-4">
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            al.status === "pendente" ? "bg-[var(--status-warning)]/20 text-[var(--status-warning)]" :
                            al.status === "enviado" ? "bg-[var(--status-success)]/20 text-[var(--status-success)]" :
                            al.status === "lido" ? "bg-[var(--status-info)]/20 text-[var(--status-info)]" :
                            "bg-[var(--status-danger)]/20 text-[var(--status-danger)]"
                          }`}>{al.status}</span>
                          <span className="text-xs text-[var(--text-tertiary)]">{fmtDate(al.created_at)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ---------- TAB: EMAILS ---------- */}
                {expandedTab === "emails" && (
                  <div className="space-y-2">
                    {p.emails.length === 0 ? (
                      <p className="text-sm text-[var(--text-tertiary)] text-center py-6">Nenhum email enviado para esta empresa</p>
                    ) : p.emails.map((em) => (
                      <div key={em.id} className="bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-primary)] p-3">
                        <div className="flex items-start justify-between mb-1">
                          <div>
                            <span className="text-sm font-medium text-[var(--text-primary)]">{em.subject}</span>
                            <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] mt-0.5">
                              <span>Para: {em.to_email}</span>
                              <span>Template: {em.template_id}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              em.status === "enviado" ? "bg-[var(--status-success)]/20 text-[var(--status-success)]" :
                              em.status === "erro" ? "bg-[var(--status-danger)]/20 text-[var(--status-danger)]" :
                              "bg-[var(--status-warning)]/20 text-[var(--status-warning)]"
                            }`}>{em.status}</span>
                            <span className="text-xs text-[var(--text-tertiary)]">{fmtDateTime(em.sent_at || em.created_at)}</span>
                          </div>
                        </div>
                        {em.erro_detalhe && <p className="text-xs text-[var(--status-danger)] mt-1">{em.erro_detalhe}</p>}
                      </div>
                    ))}
                  </div>
                )}

                {/* ---------- TAB: TIMELINE ---------- */}
                {expandedTab === "timeline" && (
                  <div className="space-y-0">
                    {p.atividades.length === 0 ? (
                      <p className="text-sm text-[var(--text-tertiary)] text-center py-6">Nenhuma atividade registrada</p>
                    ) : p.atividades.map((at) => (
                      <div key={at.id} className="flex gap-3 py-2 border-l-2 border-[var(--border-primary)] pl-4 relative">
                        <div className="absolute -left-[5px] top-3 w-2 h-2 rounded-full bg-[var(--border-primary)]" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs text-[var(--text-tertiary)] min-w-[120px]">{fmtDateTime(at.created_at)}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              at.tipo === "email_enviado" || at.tipo === "email" ? "bg-[var(--vigi-gold)]/20 text-[var(--vigi-gold)]" :
                              at.tipo === "ligacao" ? "bg-[var(--status-success)]/20 text-[var(--status-success)]" :
                              at.tipo === "nota" ? "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]" :
                              at.tipo === "reuniao" ? "bg-[var(--status-info)]/20 text-[var(--status-info)]" :
                              "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
                            }`}>{at.tipo}</span>
                            <span className="text-xs text-[var(--text-tertiary)]">{at.realizado_por}</span>
                          </div>
                          <p className="text-xs text-[var(--text-primary)]">{at.descricao}</p>
                          {at.resultado && <p className="text-xs text-[var(--text-secondary)] mt-0.5 italic">{at.resultado}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================
function KPICard({ label, value, color, icon }: { label: string; value: number; color: string; icon: string }) {
  return (
    <div className="bg-[var(--bg-secondary)] rounded-xl shadow-sm border border-[var(--border-primary)] p-3 text-center">
      <div className="text-xs mb-1">{icon}</div>
      <div className="text-2xl font-bold" style={{ color }}>{value.toLocaleString("pt-BR")}</div>
      <div className="text-xs text-[var(--text-secondary)] mt-0.5">{label}</div>
    </div>
  );
}

function NumBox({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="text-center min-w-[50px]">
      <div className="text-xl font-bold" style={{ color }}>{value}</div>
      <div className="text-[10px] text-[var(--text-tertiary)] leading-tight">{label}</div>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <span className="text-[var(--text-tertiary)]">{label}:</span>{" "}
      <span className="text-[var(--text-primary)]">{value || "—"}</span>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="text-[var(--text-tertiary)] min-w-[120px] text-xs">{label}</span>
      <span className={`text-[var(--text-primary)] ${mono ? "font-mono text-xs" : ""}`}>{value || "—"}</span>
    </div>
  );
}
