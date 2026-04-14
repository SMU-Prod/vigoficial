"use client";

import { useState } from "react";
import { DataTable } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge, EmployeeBadge, SemaforoBadge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Pagination } from "@/components/ui/pagination";
import { SearchInput } from "@/components/ui/search-input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { useFetch } from "@/hooks/use-fetch";
import { useDebounce } from "@/hooks/useDebounce";
import { formatCNPJ, formatCPF, formatCurrency, formatDate } from "@/lib/formatters";
import { formatDateBr, diasRestantes } from "@/lib/utils";
import type { Company, Employee, CompanyInstruction, InstructionCategoria } from "@/types/database";

/* ───── Constants ───── */

const UFS = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
  "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
].map((uf) => ({ value: uf, label: uf }));

const FUNCOES_PF = [
  { value: "Vigilante Patrimonial", label: "Vigilante Patrimonial" },
  { value: "Vigilante Armado", label: "Vigilante Armado" },
  { value: "Vigilante Desarmado", label: "Vigilante Desarmado" },
  { value: "Vigilante de Transporte de Valores", label: "Transporte de Valores" },
  { value: "Vigilante de Escolta Armada", label: "Escolta Armada" },
  { value: "Vigilante de Segurança Pessoal Privada", label: "Segurança Pessoal" },
  { value: "Vigilante de Grandes Eventos", label: "Grandes Eventos" },
];

const VEHICLE_TYPES = [
  { value: "operacional", label: "Operacional" },
  { value: "escolta", label: "Escolta" },
  { value: "transporte_valores", label: "Transporte de Valores" },
  { value: "administrativo", label: "Administrativo" },
];

/* ───── Types ───── */

interface VehicleRow {
  id: string;
  placa: string;
  modelo: string;
  marca: string;
  tipo: string;
  km_atual: number;
  status: string;
  licenciamento_validade: string | null;
  seguro_validade: string | null;
  gps_ultima_leitura: string | null;
}

type EmployeeRow = Employee & { companies?: { razao_social: string } };

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

type TabKey = "dados" | "frotas" | "vigilantes" | "processos" | "filiais" | "instrucoes";

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "dados", label: "Dados", icon: "🏢" },
  { key: "filiais", label: "Filiais", icon: "🔗" },
  { key: "frotas", label: "Frotas", icon: "🚗" },
  { key: "vigilantes", label: "Vigilantes", icon: "👮" },
  { key: "processos", label: "Processos GESP", icon: "⚖️" },
  { key: "instrucoes", label: "VIG PRO", icon: "📋" },
];

const INSTRUCTION_CATEGORIAS: { value: InstructionCategoria; label: string }[] = [
  { value: "geral", label: "Geral" },
  { value: "gesp", label: "GESP" },
  { value: "monitoramento", label: "Monitoramento" },
  { value: "financeiro", label: "Financeiro" },
  { value: "comunicacao", label: "Comunicação" },
];

/* ───── Main Component ───── */

interface CompanyDetailPanelProps {
  company: Company;
  onClose: () => void;
  onUpdated: () => void;
}

export function CompanyDetailPanel({ company, onClose, onUpdated }: CompanyDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("dados");

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-primary)] bg-[var(--bg-tertiary)]">
        <div>
          <h2 className="text-lg font-bold text-[var(--vigi-navy)]">{company.razao_social}</h2>
          <p className="text-sm text-[var(--text-tertiary)]">
            {company.nome_fantasia ? `${company.nome_fantasia} · ` : ""}
            {formatCNPJ(company.cnpj)} · {company.uf_sede}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Fechar detalhes">
          ✕ Fechar
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--border-primary)] px-4 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? "border-[var(--vigi-gold)] text-[var(--vigi-navy)]"
                : "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:border-[var(--border-secondary)]"
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {activeTab === "dados" && <DadosTab company={company} onUpdated={onUpdated} />}
        {activeTab === "filiais" && <FiliaisTab company={company} />}
        {activeTab === "frotas" && <FrotasTab companyId={company.id} />}
        {activeTab === "vigilantes" && <VigilantesTab companyId={company.id} />}
        {activeTab === "processos" && <ProcessosTab companyId={company.id} />}
        {activeTab === "instrucoes" && <InstrucoesTab companyId={company.id} />}
      </div>
    </div>
  );
}

/* ───── Dados Tab ───── */

function DadosTab({ company, onUpdated: _onUpdated }: { company: Company; onUpdated: () => void }) {
  const Field = ({ label, value }: { label: string; value: string | null | undefined }) => (
    <div>
      <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wide mb-1">{label}</p>
      <p className="text-sm font-medium text-[var(--text-primary)]">{value || "—"}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Field label="CNPJ" value={formatCNPJ(company.cnpj)} />
        <Field label="UF Sede" value={company.uf_sede} />
        <Field label="Tipo Unidade" value={company.tipo_unidade === "filial" ? "Filial" : "Matriz"} />
        <Field label="Plano" value={company.plano} />
        <Field label="Valor Mensal" value={formatCurrency(company.valor_mensal)} />
        <Field label="Email Operacional" value={company.email_operacional} />
        <Field label="Email Responsável" value={company.email_responsavel} />
        <Field label="Telefone" value={company.telefone} />
        <Field label="Billing Status" value={company.billing_status} />
        <Field label="Nº Alvará" value={company.alvara_numero} />
        <Field label="Validade Alvará" value={formatDateBr(company.alvara_validade)} />
        <Field label="Validade e-CPF" value={formatDateBr(company.ecpf_validade)} />
        <Field label="Habilitada" value={company.habilitada ? "Sim" : "Não"} />
      </div>
    </div>
  );
}

/* ───── Frotas Tab ───── */

function FrotasTab({ companyId }: { companyId: string }) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmData, setConfirmData] = useState<{ id: string; placa: string } | null>(null);

  const { data: allVehicles = [], loading, refetch } = useFetch<VehicleRow[]>(
    `/api/fleet?company_id=${companyId}`
  );

  const vehicles = debouncedSearch
    ? (allVehicles ?? []).filter(
        (v) =>
          v.placa?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
          v.modelo?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
          v.marca?.toLowerCase().includes(debouncedSearch.toLowerCase())
      )
    : (allVehicles ?? []);

  const totalPages = Math.ceil(vehicles.length / pageSize);
  const paginated = vehicles.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const body: Record<string, unknown> = { company_id: companyId };
    form.forEach((v, k) => {
      if (v !== "") body[k] = k === "km_atual" || k === "ano" ? Number(v) : v;
    });

    try {
      const res = await fetch("/api/fleet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Erro ao cadastrar");
        toast.error(d.error || "Erro ao cadastrar veículo");
        return;
      }
      setModalOpen(false);
      toast.success("Veículo cadastrado");
      refetch();
    } catch {
      setError("Erro de conexão");
      toast.error("Erro de conexão");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmData) return;
    try {
      const res = await fetch(`/api/fleet/${confirmData.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Veículo removido");
        refetch();
      } else {
        toast.error("Erro ao remover veículo");
      }
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setConfirmOpen(false);
      setConfirmData(null);
    }
  }

  const columns = [
    { key: "placa", header: "Placa", render: (v: VehicleRow) => <span className="font-mono font-bold text-[var(--text-primary)]">{v.placa}</span> },
    { key: "modelo", header: "Veículo", render: (v: VehicleRow) => <span className="text-[var(--text-primary)]">{`${v.marca || ""} ${v.modelo}`.trim()}</span> },
    { key: "tipo", header: "Tipo", render: (v: VehicleRow) => <span className="capitalize text-xs text-[var(--text-secondary)]">{v.tipo?.replace(/_/g, " ")}</span> },
    { key: "km_atual", header: "KM", render: (v: VehicleRow) => <span className="text-[var(--text-primary)]">{(v.km_atual || 0).toLocaleString("pt-BR")} km</span> },
    { key: "licenciamento_validade", header: "Licenciamento", render: (v: VehicleRow) => <span className="text-[var(--text-primary)]">{v.licenciamento_validade ? formatDate(v.licenciamento_validade) : "—"}</span> },
    { key: "status", header: "Status", render: (v: VehicleRow) => <Badge variant={v.status === "ativo" ? "green" : "yellow"}>{v.status}</Badge> },
    {
      key: "acoes",
      header: "",
      render: (v: VehicleRow) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            setConfirmData({ id: v.id, placa: v.placa });
            setConfirmOpen(true);
          }}
          className="text-[var(--status-danger)] hover:bg-[var(--status-danger-bg)]"
        >
          Remover
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <SearchInput
          placeholder="Buscar placa, modelo ou marca..."
          onSearch={(value) => { setSearch(value); setCurrentPage(1); }}
        />
        <Button size="sm" onClick={() => { setError(""); setModalOpen(true); }}>
          Novo Veículo
        </Button>
      </div>

      {!loading && vehicles.length === 0 ? (
        <EmptyState
          icon="🚗"
          title="Nenhum veículo"
          description="Esta empresa não possui veículos cadastrados."
          actionLabel="Novo Veículo"
          onAction={() => { setError(""); setModalOpen(true); }}
        />
      ) : (
        <DataTable columns={columns} data={paginated} loading={loading} emptyMessage="Nenhum veículo encontrado." />
      )}

      {vehicles.length > pageSize && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={vehicles.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }}
        />
      )}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => { setConfirmOpen(false); setConfirmData(null); }}
        title="Remover Veículo"
        message={`Tem certeza que deseja remover o veículo ${confirmData?.placa}?`}
        confirmLabel="Remover"
        onConfirm={handleDelete}
        variant="danger"
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Novo Veículo" size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input id="v-placa" name="placa" label="Placa" required placeholder="ABC-1D23" />
            <Input id="v-modelo" name="modelo" label="Modelo" required />
            <Input id="v-marca" name="marca" label="Marca" />
            <Input id="v-ano" name="ano" label="Ano" type="number" />
            <Select id="v-tipo" name="tipo" label="Tipo" required options={VEHICLE_TYPES} defaultValue="operacional" />
            <Input id="v-km" name="km_atual" label="KM Atual" type="number" defaultValue="0" />
            <Input id="v-gps-prov" name="gps_provider" label="GPS Provider" />
            <Input id="v-gps-dev" name="gps_device_id" label="GPS Device ID" />
            <Input id="v-lic" name="licenciamento_validade" label="Licenciamento" type="date" />
            <Input id="v-seg" name="seguro_validade" label="Seguro" type="date" />
          </div>
          {error && <p className="text-sm text-[var(--status-danger)] bg-[var(--status-danger-bg)] p-2 rounded">{error}</p>}
          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-primary)]">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit" loading={saving}>Cadastrar</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

/* ───── Vigilantes Tab ───── */

function VigilantesTab({ companyId }: { companyId: string }) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [filterStatus, setFilterStatus] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmData, setConfirmData] = useState<{ id: string; nome: string } | null>(null);

  const params = new URLSearchParams({ company_id: companyId });
  if (debouncedSearch) params.set("search", debouncedSearch);
  if (filterStatus) params.set("status", filterStatus);

  const { data: employees = [], loading, refetch } = useFetch<EmployeeRow[]>(
    `/api/employees?${params.toString()}`
  );

  const totalPages = Math.ceil((employees ?? []).length / pageSize);
  const paginated = (employees ?? []).slice((currentPage - 1) * pageSize, currentPage * pageSize);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const body: Record<string, unknown> = { company_id: companyId };
    form.forEach((v, k) => { if (v !== "") body[k] = v; });

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
        setError(data.error || "Erro ao salvar");
        toast.error(data.error || "Erro ao salvar");
        return;
      }
      setModalOpen(false);
      toast.success(editing ? "Vigilante atualizado" : "Vigilante cadastrado");
      refetch();
    } catch {
      setError("Erro de conexão");
      toast.error("Erro de conexão");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmData) return;
    try {
      const res = await fetch(`/api/employees/${confirmData.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Vigilante removido");
        refetch();
      } else {
        toast.error("Erro ao remover");
      }
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setConfirmOpen(false);
      setConfirmData(null);
    }
  }

  const columns = [
    {
      key: "nome_completo",
      header: "Nome",
      render: (e: EmployeeRow) => <p className="font-medium text-[var(--text-primary)]">{e.nome_completo}</p>,
    },
    { key: "cpf", header: "CPF", render: (e: EmployeeRow) => <span className="text-[var(--text-primary)]">{formatCPF(e.cpf)}</span> },
    { key: "funcao_principal", header: "Função", render: (e: EmployeeRow) => <span className="text-xs text-[var(--text-secondary)]">{e.funcao_principal}</span> },
    {
      key: "cnv_data_validade",
      header: "CNV Validade",
      render: (e: EmployeeRow) => {
        const dias = diasRestantes(e.cnv_data_validade);
        const color = dias === null ? "" : dias <= 30 ? "text-[var(--status-danger)] font-semibold" : dias <= 90 ? "text-[var(--status-warning)]" : "text-[var(--status-success)]";
        return <span className={color}>{formatDateBr(e.cnv_data_validade)}</span>;
      },
    },
    { key: "status", header: "Status", render: (e: EmployeeRow) => <EmployeeBadge status={e.status} /> },
    {
      key: "acoes",
      header: "",
      render: (e: EmployeeRow) => (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={(ev) => { ev.stopPropagation(); setEditing(e); setError(""); setModalOpen(true); }}>
            Editar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={(ev) => { ev.stopPropagation(); setConfirmData({ id: e.id, nome: e.nome_completo }); setConfirmOpen(true); }}
            className="text-[var(--status-danger)] hover:bg-[var(--status-danger-bg)]"
          >
            Remover
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <SearchInput
            placeholder="Buscar por nome ou CPF..."
            onSearch={(value) => { setSearch(value); setCurrentPage(1); }}
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }}
          className="rounded-md border border-[var(--border-primary)] px-3 py-2 text-sm text-[var(--text-primary)] bg-[var(--bg-secondary)]"
        >
          <option value="">Todos</option>
          <option value="ativo">Ativo</option>
          <option value="inativo">Inativo</option>
          <option value="afastado">Afastado</option>
          <option value="demitido">Demitido</option>
        </select>
        <Button size="sm" onClick={() => { setEditing(null); setError(""); setModalOpen(true); }}>
          Novo Vigilante
        </Button>
      </div>

      {!loading && (employees ?? []).length === 0 ? (
        <EmptyState
          icon="👮"
          title="Nenhum vigilante"
          description="Esta empresa não possui vigilantes cadastrados."
          actionLabel="Novo Vigilante"
          onAction={() => { setEditing(null); setError(""); setModalOpen(true); }}
        />
      ) : (
        <DataTable columns={columns} data={paginated} loading={loading} emptyMessage="Nenhum vigilante encontrado." />
      )}

      {(employees ?? []).length > pageSize && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={(employees ?? []).length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }}
        />
      )}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => { setConfirmOpen(false); setConfirmData(null); }}
        title="Remover Vigilante"
        message={`Tem certeza que deseja remover ${confirmData?.nome}?`}
        confirmLabel="Remover"
        onConfirm={handleDelete}
        variant="danger"
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `Editar — ${editing.nome_completo}` : "Novo Vigilante"} size="xl">
        <form onSubmit={handleSubmit} className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
          {/* Bloco 1 — Identificação Civil */}
          <fieldset>
            <legend className="text-sm font-semibold text-[var(--vigi-navy)] border-b border-[var(--border-primary)] pb-1 mb-3">
              Identificação Civil
            </legend>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <Input id="e-nome" name="nome_completo" label="Nome Completo" required defaultValue={editing?.nome_completo || ""} />
              </div>
              <Input id="e-cpf" name="cpf" label="CPF" required defaultValue={editing?.cpf || ""} placeholder="000.000.000-00" />
              <Input id="e-rg" name="rg" label="RG" defaultValue={editing?.rg || ""} />
              <Input id="e-rg-orgao" name="rg_orgao_emissor" label="Órgão Emissor" defaultValue={editing?.rg_orgao_emissor || ""} />
              <Select id="e-rg-uf" name="rg_uf" label="UF RG" options={UFS} defaultValue={editing?.rg_uf || ""} placeholder="UF" />
              <Input id="e-nasc" name="data_nascimento" label="Data Nascimento" type="date" defaultValue={editing?.data_nascimento || ""} />
              <Select id="e-sexo" name="sexo" label="Sexo" options={[{value:"M",label:"Masculino"},{value:"F",label:"Feminino"}]} defaultValue={editing?.sexo || ""} placeholder="Selecione" />
              <Input id="e-mae" name="nome_mae" label="Nome da Mãe" defaultValue={editing?.nome_mae || ""} />
            </div>
          </fieldset>

          {/* Bloco 2 — Contato */}
          <fieldset>
            <legend className="text-sm font-semibold text-[var(--vigi-navy)] border-b border-[var(--border-primary)] pb-1 mb-3">
              Contato e Endereço
            </legend>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input id="e-email" name="email" label="Email" type="email" defaultValue={editing?.email || ""} />
              <Input id="e-tel1" name="telefone1" label="Telefone 1" defaultValue={editing?.telefone1 || ""} />
              <Input id="e-tel2" name="telefone2" label="Telefone 2" defaultValue={editing?.telefone2 || ""} />
              <Input id="e-cep" name="cep" label="CEP" defaultValue={editing?.cep || ""} />
              <Input id="e-logr" name="logradouro" label="Logradouro" defaultValue={editing?.logradouro || ""} className="md:col-span-2" />
              <Input id="e-num" name="numero" label="Número" defaultValue={editing?.numero || ""} />
              <Input id="e-bairro" name="bairro" label="Bairro" defaultValue={editing?.bairro || ""} />
              <Input id="e-cidade" name="cidade" label="Cidade" defaultValue={editing?.cidade || ""} />
              <Select id="e-uf" name="uf" label="UF" options={UFS} defaultValue={editing?.uf || ""} placeholder="UF" />
            </div>
          </fieldset>

          {/* Bloco 3 — Situação Funcional */}
          <fieldset>
            <legend className="text-sm font-semibold text-[var(--vigi-navy)] border-b border-[var(--border-primary)] pb-1 mb-3">
              Situação Funcional
            </legend>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Select id="e-func" name="funcao_principal" label="Função PF" required options={FUNCOES_PF} defaultValue={editing?.funcao_principal || ""} placeholder="Selecione" />
              <Select id="e-vinc" name="tipo_vinculo" label="Vínculo" options={[{value:"CLT",label:"CLT"},{value:"Terceirizado",label:"Terceirizado"}]} defaultValue={editing?.tipo_vinculo || "CLT"} />
              <Select id="e-st" name="status" label="Status" options={[{value:"ativo",label:"Ativo"},{value:"inativo",label:"Inativo"},{value:"afastado",label:"Afastado"},{value:"demitido",label:"Demitido"}]} defaultValue={editing?.status || "ativo"} />
              <Input id="e-adm" name="data_admissao" label="Data Admissão" type="date" defaultValue={editing?.data_admissao || ""} />
              <Input id="e-desl" name="data_desligamento" label="Desligamento" type="date" defaultValue={editing?.data_desligamento || ""} />
            </div>
          </fieldset>

          {/* Bloco 4 — CNV */}
          <fieldset>
            <legend className="text-sm font-semibold text-[var(--vigi-navy)] border-b border-[var(--border-primary)] pb-1 mb-3">
              CNV — Carteira Nacional de Vigilante
            </legend>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input id="e-cnv" name="cnv_numero" label="Nº CNV" defaultValue={editing?.cnv_numero || ""} />
              <Select id="e-cnv-uf" name="cnv_uf_emissora" label="UF Emissora" options={UFS} defaultValue={editing?.cnv_uf_emissora || ""} placeholder="UF" />
              <Input id="e-cnv-emi" name="cnv_data_emissao" label="Emissão" type="date" defaultValue={editing?.cnv_data_emissao || ""} />
              <Input id="e-cnv-val" name="cnv_data_validade" label="Validade" type="date" defaultValue={editing?.cnv_data_validade || ""} />
              <Select id="e-cnv-sit" name="cnv_situacao" label="Situação" options={[{value:"valida",label:"Válida"},{value:"vencida",label:"Vencida"},{value:"suspensa",label:"Suspensa"},{value:"cancelada",label:"Cancelada"}]} defaultValue={editing?.cnv_situacao || "valida"} />
            </div>
          </fieldset>

          {/* Bloco 5 — Reciclagem e Armamento */}
          <fieldset>
            <legend className="text-sm font-semibold text-[var(--vigi-navy)] border-b border-[var(--border-primary)] pb-1 mb-3">
              Reciclagem e Armamento
            </legend>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input id="e-rec-val" name="reciclagem_data_validade" label="Reciclagem Validade" type="date" defaultValue={editing?.reciclagem_data_validade || ""} />
              <Input id="e-rec-esc" name="reciclagem_escola" label="Escola" defaultValue={editing?.reciclagem_escola || ""} />
              <Input id="e-arma" name="arma_numero_serie" label="Arma Nº Série" defaultValue={editing?.arma_numero_serie || ""} />
              <Input id="e-porte" name="porte_arma_validade" label="Porte Validade" type="date" defaultValue={editing?.porte_arma_validade || ""} />
              <Input id="e-col-ser" name="colete_numero_serie" label="Colete Nº Série" defaultValue={editing?.colete_numero_serie || ""} />
              <Input id="e-col-val" name="colete_data_validade" label="Colete Validade" type="date" defaultValue={editing?.colete_data_validade || ""} />
            </div>
          </fieldset>

          {error && <p className="text-sm text-[var(--status-danger)] bg-[var(--status-danger-bg)] p-2 rounded">{error}</p>}

          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-primary)]">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit" loading={saving}>{editing ? "Salvar" : "Cadastrar"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

/* ───── Processos GESP Tab ───── */

function ProcessosTab({ companyId }: { companyId: string }) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const { data: allProcessos = [], loading } = useFetch<Processo[]>("/api/processos");

  // Filter processes for this company
  const companyProcessos = (allProcessos ?? []).filter((p) => p.company_id === companyId);
  const totalPages = Math.ceil(companyProcessos.length / pageSize);
  const paginated = companyProcessos.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const columns = [
    {
      key: "semaforo",
      header: "",
      className: "w-4",
      render: (p: Processo) => <SemaforoBadge semaforo={p.semaforo} />,
    },
    {
      key: "tipo_demanda",
      header: "Tipo",
      render: (p: Processo) => <span className="capitalize text-[var(--text-primary)]">{p.tipo_demanda.replace(/_/g, " ")}</span>,
    },
    {
      key: "prioridade",
      header: "Prioridade",
      render: (p: Processo) => <Badge variant={p.prioridade === "urgente" ? "red" : "gray"}>{p.prioridade}</Badge>,
    },
    {
      key: "status",
      header: "Status",
      render: (p: Processo) => <span className="capitalize text-xs text-[var(--text-secondary)]">{p.status.replace(/_/g, " ")}</span>,
    },
    {
      key: "dias_aberto",
      header: "Dias",
      render: (p: Processo) => <span className="text-[var(--text-primary)]">{Math.round(p.dias_aberto)}d</span>,
    },
    {
      key: "created_at",
      header: "Criado em",
      render: (p: Processo) => <span className="text-[var(--text-primary)]">{formatDate(p.created_at)}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      {!loading && companyProcessos.length === 0 ? (
        <EmptyState
          icon="⚖️"
          title="Nenhum processo ativo"
          description="Esta empresa não possui processos GESP pendentes."
        />
      ) : (
        <DataTable columns={columns} data={paginated} loading={loading} emptyMessage="Nenhum processo encontrado." />
      )}

      {companyProcessos.length > pageSize && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={companyProcessos.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }}
        />
      )}
    </div>
  );
}

/* ───── Filiais Tab ───── */

function FiliaisTab({ company }: { company: Company }) {
  const _toast = useToast();
  const { data: filiaisRaw, loading: _loading, refetch: _refetch } = useFetch<Company[]>(
    `/api/companies/${company.id}/filiais`
  );
  const filiais = filiaisRaw ?? [];

  // Se for filial, busca dados da matriz
  const { data: matrizData } = useFetch<Company>(
    company.matriz_id ? `/api/companies/${company.matriz_id}` : null
  );

  if (company.tipo_unidade === "filial") {
    return (
      <div className="space-y-4">
        <div className="p-4 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-tertiary)]">
          <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wide mb-1">Esta empresa é uma filial de:</p>
          {matrizData ? (
            <div className="flex items-center gap-3 mt-2">
              <span className="text-2xl">🏢</span>
              <div>
                <p className="font-semibold text-[var(--text-primary)]">{matrizData.razao_social}</p>
                <p className="text-sm text-[var(--text-secondary)]">
                  {formatCNPJ(matrizData.cnpj)} · {matrizData.uf_sede}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-secondary)] mt-1">Carregando dados da matriz...</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--text-secondary)]">
          {filiais.length === 0
            ? "Nenhuma filial cadastrada para esta empresa."
            : `${filiais.length} filial(is) vinculada(s).`}
        </p>
      </div>

      {filiais.length === 0 ? (
        <EmptyState
          icon="🔗"
          title="Nenhuma filial"
          description="Para cadastrar uma filial, crie uma nova empresa e selecione esta como Matriz no campo 'Tipo de Unidade'."
        />
      ) : (
        <div className="space-y-3">
          {filiais.map((filial) => (
            <div
              key={filial.id}
              className="flex items-center justify-between p-4 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">🏬</span>
                <div>
                  <p className="font-medium text-[var(--text-primary)]">{filial.razao_social}</p>
                  <p className="text-sm text-[var(--text-secondary)]">
                    {formatCNPJ(filial.cnpj)} · {filial.uf_sede}
                    {filial.nome_fantasia && ` · ${filial.nome_fantasia}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={filial.habilitada ? "green" : "gray"}>
                  {filial.habilitada ? "Ativa" : "Inativa"}
                </Badge>
                <span className="text-xs text-[var(--text-tertiary)]">
                  Alvará: {formatDateBr(filial.alvara_validade) || "—"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───── Instruções VIG PRO Tab ───── */

function InstrucoesTab({ companyId }: { companyId: string }) {
  const toast = useToast();
  const { data: instructionsRaw, loading, refetch } = useFetch<CompanyInstruction[]>(
    `/api/companies/${companyId}/instructions`
  );
  const instructions = instructionsRaw ?? [];
  const [modalOpen, setModalOpen] = useState(false);
  const [editingInstruction, setEditingInstruction] = useState<CompanyInstruction | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<CompanyInstruction | null>(null);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);

    const form = new FormData(e.currentTarget);
    const body = {
      titulo: form.get("titulo") as string,
      conteudo: form.get("conteudo") as string,
      categoria: form.get("categoria") as string,
      ativo: true,
    };

    try {
      const url = editingInstruction
        ? `/api/companies/${companyId}/instructions/${editingInstruction.id}`
        : `/api/companies/${companyId}/instructions`;
      const method = editingInstruction ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Erro ao salvar instrução");
        return;
      }

      toast.success(editingInstruction ? "Instrução atualizada" : "Instrução criada");
      setModalOpen(false);
      setEditingInstruction(null);
      refetch();
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteConfirm) return;
    try {
      const res = await fetch(`/api/companies/${companyId}/instructions/${deleteConfirm.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Instrução excluída");
        refetch();
      } else {
        toast.error("Erro ao excluir");
      }
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setDeleteConfirm(null);
    }
  }

  const categoriaLabel = (cat: string) =>
    INSTRUCTION_CATEGORIAS.find((c) => c.value === cat)?.label || cat;

  const categoriaColor = (cat: string): string => {
    const map: Record<string, string> = {
      geral: "bg-[var(--bg-badge)] text-[var(--text-secondary)]",
      gesp: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
      monitoramento: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
      financeiro: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
      comunicacao: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    };
    return map[cat] || map.geral;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-[var(--text-secondary)]">
            Instruções customizadas de execução para o VIG PRO sobre como proceder com este cliente.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => { setEditingInstruction(null); setModalOpen(true); }}
        >
          Nova Instrução
        </Button>
      </div>

      {loading && <p className="text-sm text-[var(--text-tertiary)]">Carregando...</p>}

      {!loading && instructions.length === 0 && (
        <EmptyState
          icon="📋"
          title="Nenhuma instrução cadastrada"
          description="Adicione instruções para descrever como o VIG PRO deve proceder com este cliente e suas filiais."
          actionLabel="Nova Instrução"
          onAction={() => setModalOpen(true)}
        />
      )}

      {instructions.length > 0 && (
        <div className="space-y-3">
          {instructions.map((instr) => (
            <div
              key={instr.id}
              className="p-4 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)]"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium text-[var(--text-primary)]">{instr.titulo}</h4>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${categoriaColor(instr.categoria)}`}>
                    {categoriaLabel(instr.categoria)}
                  </span>
                  {instr.company_id !== companyId && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--ds-primary-light)] text-[var(--ds-primary)] font-medium">
                      Herdada da Matriz
                    </span>
                  )}
                </div>
                {instr.company_id === companyId && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setEditingInstruction(instr); setModalOpen(true); }}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteConfirm(instr)}
                    >
                      Excluir
                    </Button>
                  </div>
                )}
              </div>
              <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">
                {instr.conteudo}
              </p>
              <p className="text-[11px] text-[var(--text-tertiary)] mt-2">
                Atualizado em {formatDateBr(instr.updated_at)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Modal de criação/edição */}
      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingInstruction(null); }}
        title={editingInstruction ? "Editar Instrução VIG PRO" : "Nova Instrução VIG PRO"}
        size="lg"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <Input
            id="titulo"
            name="titulo"
            label="Título"
            required
            placeholder="Ex: Procedimento de envio GESP para filiais"
            defaultValue={editingInstruction?.titulo || ""}
          />
          <Select
            id="categoria"
            name="categoria"
            label="Categoria"
            options={INSTRUCTION_CATEGORIAS}
            defaultValue={editingInstruction?.categoria || "geral"}
          />
          <div>
            <label htmlFor="conteudo" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              Conteúdo / Instruções
            </label>
            <textarea
              id="conteudo"
              name="conteudo"
              required
              rows={8}
              placeholder="Descreva detalhadamente como o VIG PRO deve proceder com este cliente..."
              defaultValue={editingInstruction?.conteudo || ""}
              className="w-full px-3 py-2 text-sm border border-[var(--border-primary)] rounded-[var(--radius-md)] bg-[var(--bg-input)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-focus)] focus:ring-2 focus:ring-[var(--border-focus)]/12 resize-y"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-primary)]">
            <Button variant="secondary" type="button" onClick={() => { setModalOpen(false); setEditingInstruction(null); }}>
              Cancelar
            </Button>
            <Button type="submit" loading={saving}>
              {editingInstruction ? "Salvar" : "Criar Instrução"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Confirm delete */}
      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Excluir Instrução"
        message={`Tem certeza que deseja excluir a instrução "${deleteConfirm?.titulo}"?`}
        confirmLabel="Excluir"
        onConfirm={handleDelete}
        variant="danger"
      />
    </div>
  );
}
