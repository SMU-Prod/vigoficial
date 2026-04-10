"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

interface UserProfile {
  id: string;
  nome: string;
  email: string;
  avatar?: string;
  theme?: string;
  notifications?: {
    email: boolean;
    push: boolean;
    inapp: boolean;
  };
}

export default function PerfilPage() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  // MFA state
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaSetupStarted, setMfaSetupStarted] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [mfaSecret, setMfaSecret] = useState<string | null>(null);
  const [mfaVerifyCode, setMfaVerifyCode] = useState("");
  const [mfaDisableCode, setMfaDisableCode] = useState("");
  const [showMfaDisable, setShowMfaDisable] = useState(false);

  // Preferences state
  const [theme, setTheme] = useState("sistema");
  const [notifications, setNotifications] = useState({
    email: true,
    push: true,
    inapp: true,
  });

  // Active sessions mock data
  const [activeSessions] = useState([
    {
      id: "1",
      device: "Chrome on Windows",
      ip: "192.168.1.100",
      lastActive: "2 minutes ago",
    },
    {
      id: "2",
      device: "Safari on macOS",
      ip: "192.168.1.101",
      lastActive: "1 hour ago",
    },
    {
      id: "3",
      device: "Mobile Safari on iOS",
      ip: "192.168.1.102",
      lastActive: "3 hours ago",
    },
  ]);

  useEffect(() => {
    // Fetch user profile
    fetchUserProfile();
    // Check MFA status on mount
    checkMfaStatus();
  }, []);

  async function fetchUserProfile() {
    try {
      const res = await fetch("/api/auth/user", {
        method: "GET",
      });
      if (res.ok) {
        const data = await res.json();
        setUserProfile(data);
      }
    } catch {
      // User info will be available from the API or session
    }
  }

  async function checkMfaStatus() {
    try {
      const res = await fetch("/api/auth/user", {
        method: "GET",
      });
      if (res.ok) {
        const data = await res.json();
        setMfaEnabled(data.mfa_ativo || false);
      }
    } catch {
      // User info will be available from the API or session
    }
  }

  // Get initials from name
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setError("");

    if (novaSenha !== confirmar) {
      setError("Senhas não conferem");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senhaAtual, novaSenha }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao trocar senha");
        return;
      }
      setMsg("Senha alterada com sucesso!");
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmar("");
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(false);
    }
  }

  async function handleMfaSetup() {
    setMfaLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/mfa/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao configurar MFA");
        return;
      }
      setQrCode(data.qrCodeDataUrl);
      setMfaSecret(data.secret);
      setMfaSetupStarted(true);
    } catch {
      setError("Erro de conexão");
    } finally {
      setMfaLoading(false);
    }
  }

  async function handleMfaVerify() {
    if (!mfaVerifyCode) {
      setError("Código obrigatório");
      return;
    }

    setMfaLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: mfaVerifyCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Código inválido");
        return;
      }
      setMsg("MFA ativado com sucesso!");
      setMfaEnabled(true);
      setMfaSetupStarted(false);
      setQrCode(null);
      setMfaSecret(null);
      setMfaVerifyCode("");
    } catch {
      setError("Erro de conexão");
    } finally {
      setMfaLoading(false);
    }
  }

  async function handleMfaDisable() {
    if (!mfaDisableCode) {
      setError("Código obrigatório");
      return;
    }

    setMfaLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/mfa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: mfaDisableCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Código inválido");
        return;
      }
      setMsg("MFA desativado com sucesso!");
      setMfaEnabled(false);
      setShowMfaDisable(false);
      setMfaDisableCode("");
    } catch {
      setError("Erro de conexão");
    } finally {
      setMfaLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Meu Perfil"
        subtitle="Configurações pessoais e segurança"
      />

      <Tabs defaultValue="dados">
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="dados">Dados Pessoais</TabsTrigger>
          <TabsTrigger value="seguranca">Segurança</TabsTrigger>
          <TabsTrigger value="preferencias">Preferências</TabsTrigger>
        </TabsList>

        {/* Dados Pessoais Tab */}
        <TabsContent value="dados" className="space-y-6">
          <div className="vigi-card p-6">
            <div className="space-y-6">
              {/* Avatar Section */}
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Foto de Perfil</h3>
                <div className="flex items-center gap-6">
                  <div className="w-20 h-20 rounded-full bg-[var(--ds-primary-light)] flex items-center justify-center flex-shrink-0 border-2 border-[var(--ds-primary)]">
                    <span className="text-xl font-bold text-[var(--ds-primary)]">
                      {userProfile ? getInitials(userProfile.nome) : "NA"}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-[var(--text-secondary)] mb-3">
                      Alterar foto
                    </p>
                    <Button variant="secondary" size="sm">
                      Escolher arquivo
                    </Button>
                  </div>
                </div>
              </div>

              <hr className="border-[var(--border-primary)]" />

              {/* Name and Email */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-[var(--text-primary)] block mb-1.5">
                    Nome Completo
                  </label>
                  <Input
                    type="text"
                    value={userProfile?.nome || ""}
                    readOnly
                    className="bg-[var(--bg-input)] text-[var(--text-secondary)]"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-[var(--text-primary)] block mb-1.5">
                    Email
                  </label>
                  <Input
                    type="email"
                    value={userProfile?.email || ""}
                    readOnly
                    className="bg-[var(--bg-input)] text-[var(--text-secondary)]"
                  />
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Segurança Tab */}
        <TabsContent value="seguranca" className="space-y-6">
          {/* Password Section */}
          <div className="vigi-card p-6">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Alterar Senha</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <Input
                  id="senhaAtual"
                  label="Senha Atual"
                  type={showSenha ? "text" : "password"}
                  value={senhaAtual}
                  onChange={(e) => setSenhaAtual(e.target.value)}
                  required
                />
              </div>
              <Input
                id="novaSenha"
                label="Nova Senha"
                type={showSenha ? "text" : "password"}
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                required
              />
              <Input
                id="confirmar"
                label="Confirmar Nova Senha"
                type={showSenha ? "text" : "password"}
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                required
              />

              <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={showSenha}
                  onChange={() => setShowSenha(!showSenha)}
                  className="rounded border-[var(--border-primary)]"
                />
                Mostrar senhas
              </label>

              <p className="text-xs text-[var(--text-tertiary)] bg-[var(--status-info-bg)] p-3 rounded-[var(--radius-md)] border border-[var(--status-info)]">
                Mínimo 12 caracteres, 1 maiúscula, 1 número, 1 caractere especial
              </p>

              {error && (
                <p className="text-sm text-[var(--status-danger)] bg-[var(--status-danger-bg)] p-3 rounded-[var(--radius-md)]">
                  {error}
                </p>
              )}
              {msg && (
                <p className="text-sm text-[var(--status-success)] bg-[var(--status-success-bg)] p-3 rounded-[var(--radius-md)]">
                  {msg}
                </p>
              )}

              <Button type="submit" loading={loading} className="w-full">
                Alterar Senha
              </Button>
            </form>
          </div>

          {/* MFA Section */}
          <div className="vigi-card p-6">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">
              Autenticação de Dois Fatores (MFA)
            </h3>

            {!mfaSetupStarted && (
              <div>
                <p className="text-sm text-[var(--text-secondary)] mb-4">
                  {mfaEnabled
                    ? "MFA está ativado. Você pode desativar inserindo seu código de autenticação."
                    : "Ative MFA para adicionar uma camada extra de segurança à sua conta."}
                </p>
                <div className="flex items-center gap-3">
                  {mfaEnabled && (
                    <Badge variant="green" className="text-xs">
                      Ativado
                    </Badge>
                  )}

                  {mfaEnabled ? (
                    <Button
                      variant="danger"
                      onClick={() => setShowMfaDisable(!showMfaDisable)}
                    >
                      {showMfaDisable ? "Cancelar" : "Desativar MFA"}
                    </Button>
                  ) : (
                    <Button
                      onClick={handleMfaSetup}
                      loading={mfaLoading}
                    >
                      Ativar MFA
                    </Button>
                  )}
                </div>
              </div>
            )}

            {mfaSetupStarted && !mfaEnabled && (
              <div className="space-y-4">
                <div className="bg-[var(--status-info-bg)] border border-[var(--status-info)] rounded-lg p-4">
                  <p className="text-sm font-medium text-[var(--status-info)] mb-3">
                    1. Escaneie o código QR com seu aplicativo de autenticação:
                  </p>
                  {qrCode && (
                    <div className="flex justify-center mb-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={qrCode}
                        alt="QR Code MFA"
                        className="w-48 h-48 border border-[var(--border-primary)] rounded"
                      />
                    </div>
                  )}
                  <p className="text-sm text-[var(--status-info)] mb-2">
                    Ou entre manualmente com o código:
                  </p>
                  <code className="block bg-[var(--bg-secondary)] p-2 rounded border border-[var(--border-primary)] text-center font-mono text-sm break-all">
                    {mfaSecret}
                  </code>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                    2. Digite o código de 6 dígitos:
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={mfaVerifyCode}
                    onChange={(e) =>
                      setMfaVerifyCode(
                        e.target.value
                          .replace(/\D/g, "")
                          .slice(0, 6)
                      )
                    }
                    className="block w-full rounded-md border border-[var(--border-primary)] px-3 py-2 text-center text-2xl tracking-widest shadow-sm text-[var(--text-primary)] bg-[var(--bg-secondary)] focus:border-[var(--vigi-gold)] focus:outline-none focus:ring-1 focus:ring-[var(--vigi-gold)]"
                    placeholder="000000"
                  />
                </div>

                {error && (
                  <p className="text-sm text-[var(--status-danger)] bg-[var(--status-danger-bg)] p-2 rounded">
                    {error}
                  </p>
                )}
                {msg && (
                  <p className="text-sm text-[var(--status-success)] bg-[var(--status-success-bg)] p-2 rounded">
                    {msg}
                  </p>
                )}

                <div className="flex gap-3">
                  <Button
                    onClick={handleMfaVerify}
                    loading={mfaLoading}
                    disabled={mfaVerifyCode.length !== 6}
                    className="flex-1"
                  >
                    Verificar e Ativar
                  </Button>
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => {
                      setMfaSetupStarted(false);
                      setQrCode(null);
                      setMfaSecret(null);
                      setMfaVerifyCode("");
                      setError("");
                      setMsg("");
                    }}
                    className="flex-1"
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            )}

            {showMfaDisable && mfaEnabled && (
              <div className="space-y-4 bg-[var(--status-danger-bg)] border border-[var(--status-danger)] rounded-lg p-4">
                <p className="text-sm text-[var(--status-danger)]">
                  Digite seu código de autenticação para desativar MFA:
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={mfaDisableCode}
                  onChange={(e) =>
                    setMfaDisableCode(
                      e.target.value
                        .replace(/\D/g, "")
                        .slice(0, 6)
                    )
                  }
                  className="block w-full rounded-md border border-[var(--border-primary)] px-3 py-2 text-center text-2xl tracking-widest shadow-sm text-[var(--text-primary)] bg-[var(--bg-secondary)] focus:border-[var(--status-danger)] focus:outline-none focus:ring-1 focus:ring-[var(--status-danger)]"
                  placeholder="000000"
                />

                {error && (
                  <p className="text-sm text-[var(--status-danger)] bg-[var(--bg-secondary)] p-2 rounded">
                    {error}
                  </p>
                )}

                <div className="flex gap-3">
                  <Button
                    variant="danger"
                    onClick={handleMfaDisable}
                    loading={mfaLoading}
                    disabled={mfaDisableCode.length !== 6}
                    className="flex-1"
                  >
                    Desativar
                  </Button>
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => {
                      setShowMfaDisable(false);
                      setMfaDisableCode("");
                      setError("");
                    }}
                    className="flex-1"
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Active Sessions */}
          <div className="vigi-card p-6">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Sessões Ativas</h3>
            <div className="space-y-3">
              {activeSessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-3 border border-[var(--border-primary)] rounded-[var(--radius-md)]"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      {session.device}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">
                      {session.ip} - Última atividade: {session.lastActive}
                    </p>
                  </div>
                  <Button variant="secondary" size="sm">
                    Desconectar
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Preferências Tab */}
        <TabsContent value="preferencias" className="space-y-6">
          <div className="vigi-card p-6">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Tema</h3>
            <div className="space-y-3">
              {["claro", "escuro", "sistema"].map((themeOption) => (
                <label key={themeOption} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="theme"
                    value={themeOption}
                    checked={theme === themeOption}
                    onChange={(e) => setTheme(e.target.value)}
                    className="w-4 h-4 border-[var(--border-primary)]"
                  />
                  <span className="text-sm text-[var(--text-primary)] capitalize">
                    {themeOption === "claro"
                      ? "Claro"
                      : themeOption === "escuro"
                        ? "Escuro"
                        : "Seguir sistema"}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="vigi-card p-6">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Notificações</h3>
            <div className="space-y-3">
              {[
                { key: "email", label: "Notificações por Email" },
                { key: "push", label: "Notificações Push" },
                { key: "inapp", label: "Notificações no App" },
              ].map((notif) => (
                <label
                  key={notif.key}
                  className="flex items-center gap-3 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={
                      notifications[notif.key as keyof typeof notifications]
                    }
                    onChange={(e) =>
                      setNotifications({
                        ...notifications,
                        [notif.key]: e.target.checked,
                      })
                    }
                    className="w-4 h-4 rounded border-[var(--border-primary)]"
                  />
                  <span className="text-sm text-[var(--text-primary)]">
                    {notif.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="vigi-card p-6">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Idioma</h3>
            <select className="w-full px-3 py-2 border border-[var(--border-primary)] rounded-[var(--radius-md)] bg-[var(--bg-input)] text-[var(--text-primary)] text-sm">
              <option value="pt-BR">Português (Brasil)</option>
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => setMsg("Preferências salvas com sucesso!")}>
              Salvar Preferências
            </Button>
          </div>
          {msg && (
            <p className="text-sm text-[var(--status-success)] bg-[var(--status-success-bg)] p-3 rounded-[var(--radius-md)]">
              {msg}
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
