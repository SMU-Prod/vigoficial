"use client";

import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [requireMfa, setRequireMfa] = useState(false);
  const [tempToken, setTempToken] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erro ao fazer login");
        return;
      }

      // Check if MFA is required
      if (data.requireMfa) {
        setRequireMfa(true);
        setTempToken(data.tempToken);
        setPassword(""); // Clear password for security
        return;
      }

      // Navega para /auth/callback — o middleware intercepta,
      // seta o cookie vigi_token, e redireciona para o dashboard
      if (data.token) {
        const redirect = data.redirect || "/dashboard";
        window.location.href = `/auth/callback?token=${encodeURIComponent(data.token)}&redirect=${encodeURIComponent(redirect)}`;
        return;
      }

      setError("Resposta inesperada do servidor");
      return;
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function handleMfaSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/mfa/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempToken, mfaToken: mfaCode }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Código MFA inválido");
        return;
      }

      // MFA success: navega para /auth/callback — middleware seta o cookie
      if (data.token) {
        const redirect = data.redirect || "/dashboard";
        window.location.href = `/auth/callback?token=${encodeURIComponent(data.token)}&redirect=${encodeURIComponent(redirect)}`;
        return;
      }

      setError("Resposta inesperada do servidor");
      return;
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B1F3A]">
      <div className="w-full max-w-md p-8 bg-[var(--bg-secondary)] rounded-lg shadow-xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[var(--vigi-navy)]">VIG PRO</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Compliance &middot; Automação &middot; Segurança
          </p>
        </div>

        {requireMfa ? (
          <form onSubmit={handleMfaSubmit} className="space-y-5">
            <div className="bg-[var(--status-info-bg)] border border-[var(--status-info)] rounded-lg p-4 mb-6">
              <p className="text-sm text-[var(--status-info)]">
                Entre com o código de 6 dígitos do seu aplicativo de autenticação
              </p>
            </div>

            <div>
              <label htmlFor="mfaCode" className="block text-sm font-medium text-[var(--text-primary)]">
                Código de Autenticação
              </label>
              <input
                id="mfaCode"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                required
                autoFocus
                className="mt-1 block w-full rounded-md border border-[var(--border-primary)] px-3 py-2 text-center text-2xl tracking-widest shadow-sm text-[var(--text-primary)] bg-[var(--bg-secondary)] focus:border-[var(--vigi-gold)] focus:outline-none focus:ring-1 focus:ring-[var(--vigi-gold)]"
                placeholder="000000"
              />
            </div>

            {error && (
              <p className="text-sm text-[var(--status-danger)] bg-[var(--status-danger-bg)] p-2 rounded">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || mfaCode.length !== 6}
              className="w-full rounded-md bg-[var(--btn-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vigi-gold)] disabled:opacity-50"
            >
              {loading ? "Verificando..." : "Verificar"}
            </button>

            <button
              type="button"
              onClick={() => {
                setRequireMfa(false);
                setMfaCode("");
                setError("");
              }}
              className="w-full text-sm text-[var(--vigi-navy)] hover:underline"
            >
              Voltar
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-[var(--text-primary)]">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border border-[var(--border-primary)] px-3 py-2 shadow-sm text-[var(--text-primary)] bg-[var(--bg-secondary)] focus:border-[var(--vigi-gold)] focus:outline-none focus:ring-1 focus:ring-[var(--vigi-gold)]"
              placeholder="seu.email@vigconsultoria.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-[var(--text-primary)]">
              Senha
            </label>
            <div className="relative mt-1">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="block w-full rounded-md border border-[var(--border-primary)] px-3 py-2 pr-10 shadow-sm text-[var(--text-primary)] bg-[var(--bg-secondary)] focus:border-[var(--vigi-gold)] focus:outline-none focus:ring-1 focus:ring-[var(--vigi-gold)]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                    <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                    <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-[var(--status-danger)] bg-[var(--status-danger-bg)] p-2 rounded">{error}</p>
          )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-[var(--btn-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vigi-gold)] disabled:opacity-50"
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
