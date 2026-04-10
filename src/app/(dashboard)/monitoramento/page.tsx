"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SearchInput } from "@/components/ui/search-input";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { useDebounce } from "@/hooks/useDebounce";
import { formatDate, formatDateTime } from "@/lib/formatters";
import type { DouAlvara, DouAlerta, ItemLiberado } from "@/types/database";

// =============================================================================
// VIGI — Monitoramento DOU (Diário Oficial da União)
// Raspagem da Seção 1, alvarás da Polícia Federal
// =============================================================================

interface Stats {
  totalPublicacoes: number;
  totalAlvaras: number;
  alvarasHoje: number;
  alertasPendentes: number;
  empresasVinculadas: number;
  prospectsVinculados: number;
  ultimaExecucao: string | null;
  ultimoStatus: string | null;
}

interface Run {
  id: string;
  data_alvo: string;
  status: string;
  publicacoes_encontradas: number;
  alvaras_extraidos: number;
  alertas_gerados: number;
  empresas_vinculadas: number;
  erro: string | null;
  duracao_ms: number | null;
  iniciado_em: string;
  finalizado_em: string | null;
}

type Tab = "alvaras" | "alertas" | "execucoes";

// DouAlvara já inclui publicacao?: DouPublicacao via join do Supabase
type AlvaraComPublicacao = DouAlvara;

export default function MonitoramentoDOUPage() {
  const [tab, setTab] = useState<Tab>("alvaras");
  const [stats, setStats] = useState<Stats | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [alvaras, setAlvaras] = useState<DouAlvara[]>([]);
  const [alertas, setAlertas] = useState<DouAlerta[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [filterUf, setFilterUf] = useState("");
  const [filterTipo, setFilterTipo] = useState("");
  const [selectedAlvara, setSelectedAlvara] = useState<DouAlvara | null>(null);
  const [scrapeDate, setScrapeDate] = useState("");
  // Pagination
  const [alvarasPage, setAlvarasPage] = useState(1);
  const [alvarasPageSize, setAlvarasPageSize] = useState(25);
  const [alvarasTotal, setAlvarasTotal] = useState(0);
  const [alertasPage, setAlertasPage] = useState(1);
  const [alertasPageSize, setAlertasPageSize] = useState(25);
  const [alertasTotal, setAlertasTotal] = useState(0);
  const headersRef = useRef({ "Content-Type": "application/json" });
  const abortControllersRef = useRef<Record<string, AbortController>>({});

  const authFetch = useCallback(async (url: string, opts?: RequestInit) => {
    const res = await fetch(url, opts);
    if (res.status === 401) {
      setAuthError(true);
      return null;
    }
    return res;
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      // Cancel previous request if it exists
      abortControllersRef.current["stats"]?.abort();
      const controller = new AbortController();
      abortControllersRef.current["stats"] = controller;

      const res = await authFetch("/api/dou/stats", { signal: controller.signal });
      if (!res) return;
      const json = await res.json();
      if (json.success) {
        setStats(json.data.stats);
        setRuns(json.data.runs || []);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        console.error(e);
      }
    }
  }, [authFetch]);

  const fetchAlvaras = useCallback(async () => {
    try {
      // Cancel previous request if it exists
      abortControllersRef.current["alvaras"]?.abort();
      const controller = new AbortController();
      abortControllersRef.current["alvaras"] = controller;

      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (filterUf) params.set("uf", filterUf);
      if (filterTipo) params.set("tipo", filterTipo);
      params.set("limit", alvarasPageSize.toString());
      params.set("offset", ((alvarasPage - 1) * alvarasPageSize).toString());
      const res = await authFetch(`/api/dou/alvaras?${params}`, { signal: controller.signal });
      if (!res) return;
      const json = await res.json();
      if (json.success) {
        setAlvaras(json.data || []);
        setAlvarasTotal(json.total || 0);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        console.error(e);
      }
    }
  }, [debouncedSearch, filterUf, filterTipo, alvarasPage, alvarasPageSize, authFetch]);

  const fetchAlertas = useCallback(async () => {
    try {
      // Cancel previous request if it exists
      abortControllersRef.current["alertas"]?.abort();
      const controller = new AbortController();
      abortControllersRef.current["alertas"] = controller;

      const params = new URLSearchParams();
      params.set("limit", alertasPageSize.toString());
      params.set("offset", ((alertasPage - 1) * alertasPageSize).toString());
      const res = await authFetch(`/api/dou/alertas?${params}`, { signal: controller.signal });
      if (!res) return;
      const json = await res.json();
      if (json.success) {
        setAlertas(json.data || []);
        setAlertasTotal(json.total || 0);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        console.error(e);
      }
    }
  }, [alertasPage, alertasPageSize, authFetch]);

  useEffect(() => {
    Promise.all([fetchStats(), fetchAlvaras(), fetchAlertas()]).finally(() => setLoading(false));
  }, [fetchStats, fetchAlvaras, fetchAlertas]);

  useEffect(() => { fetchAlvaras(); }, [fetchAlvaras]);
  useEffect(() => { fetchAlertas(); }, [fetchAlertas]);

  // Reset to page 1 when filters change
  useEffect(() => { setAlvarasPage(1); }, [debouncedSearch, filterUf, filterTipo]);

  // Cleanup abort controllers on unmount
  useEffect(() => {
    const controllers = abortControllersRef.current;
    return () => {
      Object.values(controllers).forEach(controller => controller.abort());
    };
  }, []);

  const handleScrape = async () => {
    setScraping(true);
    setScrapeResult(null);
    try {
      const body = scrapeDate ? { date: scrapeDate } : {};
      const res = await authFetch("/api/dou/scrape", {
        method: "POST",
        headers: headersRef.current,
        body: JSON.stringify(body),
      });
      if (!res) return;
      const json = await res.json();
      if (json.success) {
        setScrapeResult(`${json.data.alvaras} alvarás extraídos | ${json.data.alertas} alertas gerados | ${json.data.vinculados} vinculados`);
        fetchStats();
        fetchAlvaras();
        fetchAlertas();
      } else {
        setScrapeResult(`Erro: ${json.error}`);
      }
    } catch (e) {
      setScrapeResult(`Erro: ${(e as Error).message}`);
    } finally {
      setScraping(false);
    }
  };

  const handleMarcarEnviado = async (alertaId: string) => {
    try {
      await authFetch("/api/dou/alertas", {
        method: "PATCH",
        headers: headersRef.current,
        body: JSON.stringify({ alertaId, canal: "manual" }),
      });
      fetchAlertas();
      fetchStats();
    } catch (e) { console.error(e); }
  };


  const UF_LIST = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <svg className="animate-spin h-8 w-8 mx-auto mb-3 text-[var(--vigi-gold)]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-[var(--text-secondary)]">Carregando monitoramento DOU...</p>
        </div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--status-danger-bg)] flex items-center justify-center">
            <svg className="w-8 h-8 text-[var(--status-danger)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m12-6a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-[var(--vigi-navy)] mb-2">Sessão expirada</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            Sua sessão expirou ou você não está autenticado. Faça login novamente para acessar o monitoramento DOU.
          </p>
          <a
            href="/login"
            className="inline-block px-6 py-2 bg-[var(--btn-primary)] text-white text-sm font-medium rounded-md hover:bg-[var(--btn-primary-hover)]"
          >
            Fazer Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--vigi-navy)]">Monitoramento DOU</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Raspagem automática da Seção 1 — Alvarás da Polícia Federal
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={scrapeDate}
            onChange={(e) => setScrapeDate(e.target.value)}
            className="border border-[var(--border-primary)] rounded-md px-3 py-2 text-sm text-[var(--text-primary)] bg-[var(--bg-secondary)]"
            title="Data para raspar (vazio = ontem)"
            aria-label="Data para raspar do DOU"
          />
          <button
            onClick={handleScrape}
            disabled={scraping}
            className="px-4 py-2 bg-[var(--btn-primary)] text-white text-sm font-medium rounded-md hover:bg-[var(--btn-primary-hover)] disabled:opacity-50 flex items-center gap-2"
            aria-label={scraping ? "Raspando dados do DOU" : "Raspar dados do DOU agora"}
          >
            {scraping ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Raspando...
              </>
            ) : (
              "Raspar DOU Agora"
            )}
          </button>
        </div>
      </div>

      {/* Resultado da raspagem */}
      {scrapeResult && (
        <div className={`p-3 rounded-lg text-sm ${scrapeResult.startsWith("Erro") ? "bg-[var(--status-danger-bg)] text-[var(--status-danger)] border border-[var(--status-danger)]" : "bg-[var(--status-success-bg)] text-[var(--status-success)] border border-[var(--status-success)]"}`}>
          {scrapeResult}
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: "Publicações", value: stats?.totalPublicacoes || 0, color: "var(--vigi-navy)" },
          { label: "Alvarás Total", value: stats?.totalAlvaras || 0, color: "var(--status-info)" },
          { label: "Alvarás Hoje", value: stats?.alvarasHoje || 0, color: "var(--status-success)" },
          { label: "Alertas Pendentes", value: stats?.alertasPendentes || 0, color: "var(--status-warning)" },
          { label: "Clientes Vinculados", value: stats?.empresasVinculadas || 0, color: "var(--status-info)" },
          { label: "Prospects Vinculados", value: stats?.prospectsVinculados || 0, color: "var(--vigi-gold)" },
          { label: "Última Execução", value: stats?.ultimaExecucao ? formatDateTime(stats.ultimaExecucao) : "Nunca", isText: true, color: stats?.ultimoStatus === "success" ? "var(--status-success)" : "var(--status-danger)" },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-primary)] p-3 text-center">
            <p className="text-[10px] font-medium text-[var(--text-secondary)] uppercase tracking-wider">{kpi.label}</p>
            {"isText" in kpi ? (
              <p className="text-xs font-bold mt-1" style={{ color: kpi.color }}>{kpi.value}</p>
            ) : (
              <p className="text-xl font-bold mt-1" style={{ color: kpi.color }}>{kpi.value}</p>
            )}
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="border-b border-[var(--border-primary)]" role="tablist">
        <div className="flex gap-1">
          {([
            { id: "alvaras" as Tab, label: "Alvarás", count: alvarasTotal || alvaras.length },
            { id: "alertas" as Tab, label: "Alertas", count: alertasTotal || alertas.length },
            { id: "execucoes" as Tab, label: "Execuções", count: runs.length },
          ]).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? "border-[var(--vigi-gold)] text-[var(--vigi-navy)]"
                  : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {t.label} <span className="text-xs ml-1 opacity-60">({t.count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab: Alvarás */}
      {tab === "alvaras" && (
        <div className="space-y-4" id="panel-alvaras" role="tabpanel" aria-labelledby="alvaras-tab">
          {/* Filtros */}
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <SearchInput
                placeholder="Buscar por empresa, CNPJ..."
                onSearch={setSearch}
                aria-label="Buscar alvarás por empresa ou CNPJ"
              />
            </div>
            <select
              value={filterUf}
              onChange={(e) => setFilterUf(e.target.value)}
              className="border border-[var(--border-primary)] rounded-md px-3 py-2 text-sm text-[var(--text-primary)] bg-[var(--bg-secondary)]"
              aria-label="Filtrar alvarás por estado"
            >
              <option value="">Todas UFs</option>
              {UF_LIST.map((uf) => (
                <option key={uf} value={uf}>{uf}</option>
              ))}
            </select>
            <select
              value={filterTipo}
              onChange={(e) => setFilterTipo(e.target.value)}
              className="border border-[var(--border-primary)] rounded-md px-3 py-2 text-sm text-[var(--text-primary)] bg-[var(--bg-secondary)]"
              aria-label="Filtrar alvarás por tipo"
            >
              <option value="">Todos os tipos</option>
              <option value="autorizacao">Autorização</option>
              <option value="renovacao">Renovação</option>
              <option value="cancelamento">Cancelamento</option>
              <option value="revisao">Revisão</option>
            </select>
          </div>

          {/* Lista de Alvarás */}
          {alvaras.length === 0 ? (
            <EmptyState
              icon="📰"
              title="Nenhum alvará encontrado"
              description="Execute uma varredura do DOU para encontrar alvarás."
            />
          ) : (
            <div className="space-y-2">
              {alvaras.map((a) => (
                <div
                  key={a.id}
                  onClick={() => setSelectedAlvara(selectedAlvara?.id === a.id ? null : a)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedAlvara(selectedAlvara?.id === a.id ? null : a);
                    }
                  }}
                  className={`bg-[var(--bg-secondary)] rounded-lg border p-4 cursor-pointer transition-all hover:shadow-md ${
                    selectedAlvara?.id === a.id ? "border-[var(--vigi-gold)] shadow-md" : "border-[var(--border-primary)]"
                  } ${a.tipo_alvara === "cancelamento" ? "border-l-4 border-l-[var(--status-danger)]" : a.company_id ? "border-l-4 border-l-[var(--status-success)]" : a.prospect_id ? "border-l-4 border-l-[var(--vigi-gold)]" : ""}`}
                  aria-expanded={selectedAlvara?.id === a.id}
                  aria-label={`Detalhes do alvará de ${a.razao_social}, CNPJ ${a.cnpj}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-[var(--vigi-navy)] text-sm truncate">{a.razao_social}</h3>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          a.tipo_alvara === "autorizacao" ? "bg-[var(--status-info-bg)] text-[var(--status-info)]" :
                          a.tipo_alvara === "cancelamento" ? "bg-[var(--status-danger-bg)] text-[var(--status-danger)]" :
                          a.tipo_alvara === "renovacao" ? "bg-[var(--status-success-bg)] text-[var(--status-success)]" :
                          "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
                        }`}>
                          {a.tipo_alvara}
                        </span>
                        {a.subtipo && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--status-info-bg)] text-[var(--status-info)] font-medium">
                            {(a.subtipo as string).replace(/_/g, " ")}
                          </span>
                        )}
                        {a.company_id && <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--status-success-bg)] text-[var(--status-success)] font-medium">Cliente VIG</span>}
                        {a.prospect_id && <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--vigi-gold)]/10 text-[var(--vigi-gold)] font-medium">Prospect</span>}
                      </div>
                      <div className="flex items-center gap-4 mt-1.5 text-xs text-[var(--text-secondary)] flex-wrap">
                        {/* DATA DE PUBLICAÇÃO — informação mais importante */}
                        {(a as AlvaraComPublicacao).publicacao?.data_publicacao && (
                          <span className="flex items-center gap-1 font-medium text-[var(--vigi-navy)]">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            Publicado em {formatDate((a as AlvaraComPublicacao).publicacao!.data_publicacao)}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                          CNPJ: {a.cnpj}
                        </span>
                        {a.uf && <span>UF: {a.uf}</span>}
                        {a.municipio && <span>{a.municipio}</span>}
                        {a.delegacia && <span>{a.delegacia}</span>}
                        {a.numero_processo && <span>Proc: {a.numero_processo}</span>}
                      </div>
                      {a.itens_liberados && a.itens_liberados.length > 0 && (
                        <div className="flex gap-2 mt-2 flex-wrap">
                          {(a.itens_liberados as ItemLiberado[]).slice(0, 6).map((item, i) => (
                            <span key={i} className="text-[10px] px-2 py-1 rounded bg-[var(--bg-tertiary)] text-[var(--text-primary)]">
                              {item.quantidade}x {item.descricao}{item.calibre ? ` (cal. ${item.calibre})` : ""}
                            </span>
                          ))}
                          {a.itens_liberados.length > 6 && (
                            <span className="text-[10px] px-2 py-1 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                              +{a.itens_liberados.length - 6} itens
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-right ml-4 flex-shrink-0">
                      {a.validade_dias && (
                        <div className="text-[10px] text-[var(--text-secondary)]">
                          <span className="font-medium">Validade: {a.validade_dias} dias</span>
                          {a.data_validade && <div className="text-[var(--text-tertiary)]">até {formatDate(a.data_validade)}</div>}
                        </div>
                      )}
                      {a.notificado ? (
                        <div className="mt-1 text-[10px] text-[var(--status-success)] font-medium">Notificado</div>
                      ) : (
                        <div className="mt-1 text-[10px] text-[var(--status-warning)] font-medium">Pendente</div>
                      )}
                    </div>
                  </div>

                  {/* Detalhes expandidos */}
                  {selectedAlvara?.id === a.id && (
                    <div className="mt-4 pt-4 border-t border-[var(--border-primary)]">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                        {/* Coluna 1: Publicação */}
                        <div>
                          <p className="font-semibold text-[var(--vigi-navy)] mb-2 flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg>
                            Dados da Publicação
                          </p>
                          <div className="space-y-1.5 text-[var(--text-secondary)]">
                            <p><span className="font-medium text-[var(--text-primary)]">Título:</span> {(a as AlvaraComPublicacao).publicacao?.titulo || "—"}</p>
                            <p><span className="font-medium text-[var(--text-primary)]">Data Publicação:</span>{" "}
                              {(a as AlvaraComPublicacao).publicacao?.data_publicacao
                                ? formatDate((a as AlvaraComPublicacao).publicacao!.data_publicacao)
                                : "—"}
                            </p>
                            <p><span className="font-medium text-[var(--text-primary)]">Seção:</span> {(a as AlvaraComPublicacao).publicacao?.secao || 1} | <span className="font-medium text-[var(--text-primary)]">Edição:</span> {(a as AlvaraComPublicacao).publicacao?.edicao || "—"} | <span className="font-medium text-[var(--text-primary)]">Página:</span> {(a as AlvaraComPublicacao).publicacao?.pagina || "—"}</p>
                            <p><span className="font-medium text-[var(--text-primary)]">Assinante:</span> {(a as AlvaraComPublicacao).publicacao?.assinante || "—"}</p>
                            <p><span className="font-medium text-[var(--text-primary)]">Cargo:</span> {(a as AlvaraComPublicacao).publicacao?.cargo_assinante || "—"}</p>
                          </div>
                        </div>
                        {/* Coluna 2: Detalhes do Alvará */}
                        <div>
                          <p className="font-semibold text-[var(--vigi-navy)] mb-2 flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                            Detalhes do Alvará
                          </p>
                          <div className="space-y-1.5 text-[var(--text-secondary)]">
                            <p><span className="font-medium text-[var(--text-primary)]">Tipo:</span> {a.tipo_alvara}{a.subtipo ? ` → ${(a.subtipo as string).replace(/_/g, " ")}` : ""}</p>
                            <p><span className="font-medium text-[var(--text-primary)]">Processo:</span> {a.numero_processo || "N/A"}</p>
                            <p><span className="font-medium text-[var(--text-primary)]">Delegacia:</span> {a.delegacia || "N/A"}</p>
                            <p><span className="font-medium text-[var(--text-primary)]">Empresa:</span> {a.razao_social}</p>
                            <p><span className="font-medium text-[var(--text-primary)]">CNPJ:</span> {a.cnpj}</p>
                            <p><span className="font-medium text-[var(--text-primary)]">Município/UF:</span> {a.municipio || "N/A"} / {a.uf || "N/A"}</p>
                            {a.validade_dias && (
                              <p><span className="font-medium text-[var(--text-primary)]">Validade:</span> {a.validade_dias} dias (até {a.data_validade ? formatDate(a.data_validade) : "—"})</p>
                            )}
                          </div>
                        </div>
                        {/* Coluna 3: Itens Liberados */}
                        <div>
                          <p className="font-semibold text-[var(--vigi-navy)] mb-2 flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                            Itens Liberados ({a.itens_liberados.length})
                          </p>
                          <div className="space-y-1 text-[var(--text-secondary)] max-h-48 overflow-y-auto">
                            {(a.itens_liberados as ItemLiberado[]).map((item, i) => (
                              <div key={i} className="flex items-start gap-2 py-0.5">
                                <span className="font-mono font-bold text-[var(--vigi-navy)] min-w-[40px] text-right">{item.quantidade}x</span>
                                <span>{item.descricao}{item.calibre ? <span className="ml-1 text-[var(--text-tertiary)]">(cal. {item.calibre})</span> : ""}</span>
                              </div>
                            ))}
                            {a.itens_liberados.length === 0 && <p className="text-[var(--text-tertiary)] italic">Sem itens especificados (alvará de funcionamento/revisão)</p>}
                          </div>
                        </div>
                      </div>
                      {/* Texto Original */}
                      <div className="mt-4">
                        <p className="font-semibold text-[var(--vigi-navy)] mb-1 text-xs flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>
                          Texto Original da Publicação
                        </p>
                        <div className="bg-[var(--bg-tertiary)] rounded p-3 text-xs text-[var(--text-secondary)] max-h-40 overflow-y-auto whitespace-pre-wrap border border-[var(--border-primary)]">
                          {a.texto_original}
                        </div>
                      </div>
                      {/* Ações */}
                      <div className="mt-3 flex items-center gap-3">
                        {(a as AlvaraComPublicacao).publicacao?.url_publicacao && (
                          <a
                            href={(a as AlvaraComPublicacao).publicacao!.url_publicacao!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[var(--btn-primary)] text-white hover:bg-[var(--btn-primary-hover)]"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                            Ver no DOU
                          </a>
                        )}
                        {!a.notificado && (
                          <span className="inline-flex items-center gap-1 text-xs text-[var(--status-warning)] bg-[var(--status-warning-bg)] px-2 py-1 rounded">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                            Alerta pendente de envio
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {alvarasTotal > 0 && (
            <div className="mt-4">
              <Pagination
                currentPage={alvarasPage}
                totalPages={Math.ceil(alvarasTotal / alvarasPageSize)}
                totalCount={alvarasTotal}
                pageSize={alvarasPageSize}
                onPageChange={(p) => { setAlvarasPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                onPageSizeChange={(s) => { setAlvarasPageSize(s); setAlvarasPage(1); }}
              />
            </div>
          )}
        </div>
      )}

      {/* Tab: Alertas */}
      {tab === "alertas" && (
        <div className="space-y-2" id="panel-alertas" role="tabpanel" aria-labelledby="alertas-tab">
          {alertas.length === 0 ? (
            <EmptyState
              icon="🔔"
              title="Nenhum alerta gerado"
              description="Alertas são gerados automaticamente ao encontrar publicações relevantes."
            />
          ) : (
            alertas.map((al) => (
              <div key={al.id} className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-primary)] p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${
                        al.prioridade === "urgente" ? "bg-[var(--status-danger)]" :
                        al.prioridade === "alta" ? "bg-[var(--status-warning)]" :
                        "bg-[var(--status-info)]"
                      }`} />
                      <h3 className="font-medium text-sm text-[var(--vigi-navy)]">{al.titulo}</h3>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                        al.status === "pendente" ? "bg-[var(--status-warning-bg)] text-[var(--status-warning)]" :
                        al.status === "enviado" ? "bg-[var(--status-success-bg)] text-[var(--status-success)]" :
                        "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
                      }`}>
                        {al.status}
                      </span>
                    </div>
                    <pre className="mt-2 text-xs text-[var(--text-secondary)] whitespace-pre-wrap font-sans">{al.mensagem}</pre>
                    <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">{formatDateTime(al.created_at)}</p>
                  </div>
                  <div className="flex gap-2 ml-4">
                    {al.status === "pendente" && (
                      <button
                        onClick={() => handleMarcarEnviado(al.id)}
                        className="px-3 py-1.5 text-xs font-medium rounded-md bg-[var(--btn-primary)] text-white hover:bg-[var(--btn-primary-hover)]"
                        aria-label={`Marcar alerta "${al.titulo}" como enviado`}
                      >
                        Marcar Enviado
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
          {alertasTotal > 0 && (
            <div className="mt-4">
              <Pagination
                currentPage={alertasPage}
                totalPages={Math.ceil(alertasTotal / alertasPageSize)}
                totalCount={alertasTotal}
                pageSize={alertasPageSize}
                onPageChange={(p) => { setAlertasPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                onPageSizeChange={(s) => { setAlertasPageSize(s); setAlertasPage(1); }}
              />
            </div>
          )}
        </div>
      )}

      {/* Tab: Execuções */}
      {tab === "execucoes" && (
        <div className="space-y-2" id="panel-execucoes" role="tabpanel" aria-labelledby="execucoes-tab">
          {runs.length === 0 ? (
            <EmptyState
              icon="⚙️"
              title="Nenhuma execução registrada"
              description="Execute o scraper para iniciar o monitoramento."
            />
          ) : (
            <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-primary)] overflow-hidden">
              <table className="min-w-full divide-y divide-[var(--border-primary)]" aria-label="Histórico de execuções de raspagem">
                <thead className="bg-[var(--bg-tertiary)]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase" scope="col">Data Alvo</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase" scope="col">Status</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-secondary)] uppercase" scope="col">Publicações</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-secondary)] uppercase" scope="col">Alvarás</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-secondary)] uppercase" scope="col">Alertas</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--text-secondary)] uppercase" scope="col">Vinculados</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase" scope="col">Duração</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase" scope="col">Executado em</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-primary)]">
                  {runs.map((run) => (
                    <tr key={run.id} className="hover:bg-[var(--bg-hover)]">
                      <td className="px-4 py-3 text-sm text-[var(--text-primary)] font-medium">{formatDate(run.data_alvo)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          run.status === "success" ? "bg-[var(--status-success-bg)] text-[var(--status-success)]" :
                          run.status === "error" ? "bg-[var(--status-danger-bg)] text-[var(--status-danger)]" :
                          run.status === "running" ? "bg-[var(--status-info-bg)] text-[var(--status-info)]" :
                          "bg-[var(--status-warning-bg)] text-[var(--status-warning)]"
                        }`}>
                          {run.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-center text-[var(--text-primary)]">{run.publicacoes_encontradas}</td>
                      <td className="px-4 py-3 text-sm text-center font-bold text-[var(--vigi-navy)]">{run.alvaras_extraidos}</td>
                      <td className="px-4 py-3 text-sm text-center text-[var(--text-primary)]">{run.alertas_gerados}</td>
                      <td className="px-4 py-3 text-sm text-center text-[var(--text-primary)]">{run.empresas_vinculadas}</td>
                      <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">{run.duracao_ms ? `${(run.duracao_ms / 1000).toFixed(1)}s` : "—"}</td>
                      <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">{formatDateTime(run.iniciado_em)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
