"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";

export default function RelatoriosPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  async function handleExport(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const tipo = form.get("tipo") as string;
    const mes = form.get("mes") as string;

    try {
      const res = await fetch(`/api/relatorios?tipo=${tipo}&mes=${mes}`);
      if (!res.ok) {
        toast.error("Erro ao gerar relatório");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vigi-${tipo}-${mes}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Relatório gerado com sucesso!");
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--vigi-navy)] mb-6">Relatórios</h1>

      <div className="space-y-6">
        <div className="bg-[var(--bg-secondary)] rounded-lg shadow p-6 max-w-lg">
          <h2 className="text-lg font-semibold text-[var(--vigi-navy)] mb-4">Gerar Relatório</h2>
          <form onSubmit={handleExport} className="space-y-4">
            <Select
              id="tipo"
              name="tipo"
              label="Tipo de Relatório"
              required
              aria-label="Selecione o tipo de relatório"
              options={[
                { value: "mensal", label: "Relatório Mensal Completo" },
                { value: "compliance", label: "Status de Compliance" },
                { value: "validades", label: "Validades Críticas" },
                { value: "gesp", label: "Operações GESP" },
                { value: "frota", label: "Frota e Manutenção" },
                { value: "billing", label: "Financeiro" },
              ]}
              placeholder="Selecione..."
            />
            <Input id="mes" name="mes" label="Mês de Referência" type="month" required aria-label="Selecione o mês de referência" />

            <Button type="submit" loading={loading} className="w-full" aria-label="Gerar e baixar relatório em PDF">
              Gerar e Baixar PDF
            </Button>
          </form>
        </div>

        <div className="bg-[var(--bg-secondary)] rounded-lg shadow border border-[var(--border-primary)]">
          <EmptyState
            icon="📊"
            title="Nenhum relatório disponível"
            description="Use o formulário acima para gerar relatórios em PDF"
          />
        </div>
      </div>
    </div>
  );
}
