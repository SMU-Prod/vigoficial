"use client";

import { useState } from "react";

// ─── Portal do Cliente: Suporte ───
// Abre threads de email diretamente com a consultoria

export default function SuportePage() {
  const [assunto, setAssunto] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!assunto.trim() || !mensagem.trim()) return;

    setEnviando(true);
    try {
      // TODO(portal-v1): POST /api/portal/suporte para criar thread de suporte
      await new Promise((r) => setTimeout(r, 1000));
      setEnviado(true);
      setAssunto("");
      setMensagem("");
    } catch {
      alert("Erro ao enviar mensagem");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
        Envie uma mensagem para nossa equipe. Responderemos por email em até 24 horas úteis.
      </p>

      {enviado && (
        <div className="rounded-lg p-4" style={{ background: "var(--status-success-bg)", border: "1px solid var(--status-success)" }}>
          <p className="text-sm font-medium" style={{ color: "var(--status-success)" }}>
            Mensagem enviada com sucesso. Você receberá uma resposta por email.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>
            Assunto
          </label>
          <input
            type="text"
            value={assunto}
            onChange={(e) => setAssunto(e.target.value)}
            placeholder="Ex: Dúvida sobre renovação de alvará"
            className="w-full px-3 py-2 text-sm rounded-md"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-primary)",
              color: "var(--text-primary)",
            }}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>
            Mensagem
          </label>
          <textarea
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            placeholder="Descreva sua solicitação..."
            rows={6}
            className="w-full px-3 py-2 text-sm rounded-md resize-none"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-primary)",
              color: "var(--text-primary)",
            }}
            required
          />
        </div>

        <button
          type="submit"
          disabled={enviando}
          className="px-5 py-2 text-sm font-medium rounded-md transition-colors disabled:opacity-50"
          style={{ background: "var(--vigi-gold)", color: "var(--vigi-navy)" }}
        >
          {enviando ? "Enviando..." : "Enviar Mensagem"}
        </button>
      </form>
    </div>
  );
}
