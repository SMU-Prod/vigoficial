"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { DataTable } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SearchInput } from "@/components/ui/search-input";
import { Pagination } from "@/components/ui/pagination";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/empty-state";
import { useFetch } from "@/hooks/use-fetch";
import { useDebounce } from "@/hooks/useDebounce";

import { formatDate } from "@/lib/formatters";

// Dynamic import for Leaflet (doesn't work with SSR)
const GpsMap = dynamic(() => import("@/components/fleet/gps-map").then(mod => ({ default: mod.GpsMap })), {
  ssr: false,
  loading: () => <div className="w-full h-96 bg-[var(--bg-tertiary)] rounded-lg flex items-center justify-center">Carregando mapa...</div>,
});

interface VehicleRow {
  id: string;
  placa: string;
  modelo: string;
  marca: string | null;
  tipo: string;
  km_atual: number;
  status: string;
  licenciamento_validade: string | null;
  seguro_validade: string | null;
  gps_ultima_leitura: string | null;
}

export default function FrotaPage() {
  const toast = useToast();
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmData, setConfirmData] = useState<{ id: string; placa: string } | null>(null);

  const { data: allVehicles = [], loading, refetch } = useFetch<VehicleRow[]>("/api/fleet");

  // Filter vehicles based on search
  const vehicles = debouncedSearch
    ? (allVehicles ?? []).filter(
      (v) =>
        v.placa?.includes(debouncedSearch) ||
        v.modelo?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        v.marca?.toLowerCase().includes(debouncedSearch.toLowerCase())
    )
    : (allVehicles ?? []);

  const totalPages = Math.ceil((vehicles ?? []).length / pageSize);
  const paginatedVehicles = (vehicles ?? []).slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {};
    form.forEach((v, k) => { if (v !== "") body[k] = k === "km_atual" || k === "ano" ? Number(v) : v; });

    try {
      const res = await fetch("/api/fleet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error);
        toast.error(d.error || "Erro ao cadastrar veículo");
        return;
      }
      setModalOpen(false);
      toast.success("Veículo cadastrado com sucesso");
      refetch();
    } catch (_err) {
      const message = "Erro de conexão";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!confirmData) return;
    try {
      const res = await fetch(`/api/fleet/${confirmData.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Veículo removido com sucesso");
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
    { key: "placa", header: "Placa", render: (v: VehicleRow) => <span className="font-mono font-bold">{v.placa}</span> },
    { key: "modelo", header: "Veículo", render: (v: VehicleRow) => `${v.marca || ""} ${v.modelo}`.trim() },
    { key: "tipo", header: "Tipo", render: (v: VehicleRow) => <span className="capitalize text-xs">{v.tipo.replace(/_/g, " ")}</span> },
    { key: "km_atual", header: "KM", render: (v: VehicleRow) => `${(v.km_atual || 0).toLocaleString("pt-BR")} km` },
    { key: "licenciamento_validade", header: "Licenciamento", render: (v: VehicleRow) => v.licenciamento_validade ? formatDate(v.licenciamento_validade) : "—" },
    { key: "gps_ultima_leitura", header: "Último GPS", render: (v: VehicleRow) => v.gps_ultima_leitura ? formatDate(v.gps_ultima_leitura) : "—" },
    { key: "status", header: "Status", render: (v: VehicleRow) => <Badge variant={v.status === "ativo" ? "green" : "yellow"}>{v.status}</Badge> },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--vigi-navy)]">Frota</h1>
        <Button onClick={() => { setError(""); setModalOpen(true); }} aria-label="Adicionar novo veículo">Novo Veículo</Button>
      </div>

      {/* GPS Map */}
      <div className="mb-8 bg-[var(--bg-secondary)] p-6 rounded-lg shadow-sm border border-[var(--border-primary)]">
        <GpsMap />
      </div>

      <div className="mb-4">
        <SearchInput
          placeholder="Buscar por placa, modelo ou marca..."
          aria-label="Buscar veículos por placa, modelo ou marca"
          onSearch={(value) => {
            setSearch(value);
            setCurrentPage(1);
          }}
        />
      </div>

      {!loading && (allVehicles ?? []).length === 0 ? (
        <div className="bg-[var(--bg-secondary)] rounded-xl shadow-sm border">
          <EmptyState
            icon="🚗"
            title="Nenhum veículo cadastrado"
            description="Comece adicionando um novo veículo à sua frota"
            actionLabel="Novo Veículo"
            onAction={() => { setError(""); setModalOpen(true); }}
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <DataTable columns={columns} data={paginatedVehicles} loading={loading} emptyMessage="Nenhum veículo encontrado." />
        </div>
      )}

      {!loading && (vehicles ?? []).length > 0 && (
        <div className="mt-6">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalCount={(vehicles ?? []).length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setCurrentPage(1);
            }}
          />
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => {
          setConfirmOpen(false);
          setConfirmData(null);
        }}
        title="Remover Veículo"
        message={`Tem certeza que deseja remover o veículo ${confirmData?.placa}? Esta ação não pode ser desfeita.`}
        confirmLabel="Remover"
        cancelLabel="Cancelar"
        onConfirm={handleDeleteConfirm}
        variant="danger"
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Novo Veículo" size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input id="company_id" name="company_id" label="ID Empresa" required />
            <Input id="placa" name="placa" label="Placa" required placeholder="ABC-1D23" />
            <Input id="modelo" name="modelo" label="Modelo" required />
            <Input id="marca" name="marca" label="Marca" />
            <Input id="ano" name="ano" label="Ano" type="number" />
            <Select id="tipo" name="tipo" label="Tipo" required options={[
              { value: "operacional", label: "Operacional" },
              { value: "escolta", label: "Escolta" },
              { value: "transporte_valores", label: "Transporte de Valores" },
              { value: "administrativo", label: "Administrativo" },
            ]} defaultValue="operacional" />
            <Input id="km_atual" name="km_atual" label="KM Atual" type="number" defaultValue="0" />
            <Input id="gps_provider" name="gps_provider" label="GPS Provider" />
            <Input id="gps_device_id" name="gps_device_id" label="GPS Device ID" />
            <Input id="licenciamento_validade" name="licenciamento_validade" label="Licenciamento" type="date" />
            <Input id="seguro_validade" name="seguro_validade" label="Seguro" type="date" />
          </div>
          {error && <p className="text-sm text-[var(--status-danger)] bg-[var(--bg-danger-light)] p-2 rounded">{error}</p>}
          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-primary)]">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)} aria-label="Cancelar cadastro de veículo">Cancelar</Button>
            <Button type="submit" loading={saving} aria-label="Salvar novo veículo">Cadastrar</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
