"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useCallback, useMemo, useEffect } from "react";
import { useTheme } from "@/components/theme-provider";
import { useAuth } from "@/hooks/useAuth";
import { NotificationBell } from "@/components/ui/notification-bell";
import { useNotifications } from "@/hooks/useNotifications";
import { CommandPalette, type CommandItem } from "@/components/ui/command-palette";

// ─── Navigation structure ───

interface NavItem {
  href: string;
  label: string;
  roles?: string[];
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: "Principal",
    items: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/meus-threads", label: "Meus Threads" },
      { href: "/minhas-tarefas", label: "Minhas Tarefas" },
    ],
  },
  {
    title: "Operacional",
    items: [
      { href: "/empresas", label: "Empresas" },
      { href: "/financeiro", label: "Financeiro" },
      { href: "/frota", label: "Frota" },
      { href: "/processos", label: "Processos GESP" },
      { href: "/vigilantes", label: "Vigilantes" },
    ],
  },
  {
    title: "Inteligência",
    items: [
      { href: "/inteligencia-dou", label: "Inteligência DOU" },
      { href: "/monitoramento", label: "Monitoramento" },
      { href: "/prospeccao", label: "Prospecção" },
      { href: "/relatorios", label: "Relatórios" },
    ],
  },
  {
    title: "Administração",
    items: [
      { href: "/admin/agentes", label: "Agentes IA", roles: ["admin"] },
      { href: "/admin/gesp-approvals", label: "🔐 Aprovações GESP", roles: ["admin"] },
      { href: "/admin/audit", label: "Audit Log", roles: ["admin"] },
      { href: "/admin/filas", label: "Filas", roles: ["admin"] },
      { href: "/admin/usuarios", label: "Usuários", roles: ["admin"] },
    ],
  },
];

const pageNames: Record<string, string> = {};
navSections.forEach((s) => s.items.forEach((i) => { pageNames[i.href] = i.label; }));

// ─── Icons ───

function IconSun({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function IconMoon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function IconMonitor({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function IconChevron({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg className={`${className} transition-transform duration-200 ${open ? "rotate-90" : ""}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function IconMenu({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function IconX({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ─── Theme Switcher ───

function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();

  const options = [
    { value: "light" as const, icon: <IconSun />, title: "Claro" },
    { value: "dark" as const, icon: <IconMoon />, title: "Escuro" },
    { value: "system" as const, icon: <IconMonitor />, title: "Sistema" },
  ];

  return (
    <div
      className="flex items-center gap-0.5 rounded-[var(--radius-full)] p-0.5"
      style={{ border: "1px solid var(--border-primary)", background: "var(--bg-input)" }}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setTheme(opt.value)}
          title={opt.title}
          className="p-1.5 rounded-full transition-all duration-150"
          style={{
            background: theme === opt.value ? "var(--bg-secondary)" : "transparent",
            color: theme === opt.value ? "var(--ds-primary)" : "var(--text-tertiary)",
            boxShadow: theme === opt.value ? "var(--shadow-sm)" : "none",
          }}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  );
}

// ─── Main Layout ───

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading: authLoading, isAdmin: _isAdmin, logout } = useAuth({ redirectOnFail: true });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const { notifications, markRead, markAllRead, clearAll } = useNotifications();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const currentPageName = pageNames[pathname] || "Dashboard";

  // Notifications are now fetched from the real database via useNotifications hook

  // Keyboard listener for Command Palette
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Filtra seções de navegação baseado na role do usuário
  const filteredSections = useMemo(() => {
    if (!user) return [];
    return navSections
      .map((section) => ({
        ...section,
        items: section.items.filter(
          (item) => !item.roles || item.roles.includes(user.role)
        ),
      }))
      .filter((section) => section.items.length > 0);
  }, [user]);

  // Build command palette items
  const commandItems: CommandItem[] = useMemo(() => {
    const items: CommandItem[] = [];

    // Navigation items
    navSections.forEach((section) => {
      section.items.forEach((item) => {
        if (!item.roles || (user && item.roles.includes(user.role))) {
          items.push({
            id: item.href,
            label: item.label,
            category: section.title,
            action: () => router.push(item.href),
          });
        }
      });
    });

    // Action items
    items.push(
      {
        id: "new-empresa",
        label: "Nova Empresa",
        description: "Adicionar uma nova empresa ao sistema",
        category: "Ações",
        action: () => router.push("/empresas?action=new"),
      },
      {
        id: "new-relatorio",
        label: "Novo Relatório",
        description: "Criar um novo relatório",
        category: "Ações",
        action: () => router.push("/relatorios?action=new"),
      },
      {
        id: "new-deal",
        label: "Novo Deal",
        description: "Criar um novo deal",
        category: "Ações",
        action: () => router.push("/dashboard?action=new-deal"),
      }
    );

    return items;
  }, [user, router]);

  const toggleSection = useCallback((title: string) => {
    setCollapsedSections((prev) => ({ ...prev, [title]: !prev[title] }));
  }, []);

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  // Notification handlers — connected to real database via useNotifications
  const handleMarkRead = useCallback((id: string) => { markRead(id); }, [markRead]);
  const handleMarkAllRead = useCallback(() => { markAllRead(); }, [markAllRead]);
  const handleClearNotifications = useCallback(() => { clearAll(); }, [clearAll]);

  // Loading state enquanto verifica auth
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-primary)" }}>
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: "var(--ds-primary)", borderTopColor: "transparent" }}
          />
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Verificando sessão...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg-primary)" }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:sticky top-0 left-0 z-50 h-screen w-60 flex flex-col
          transition-transform duration-300 lg:translate-x-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
        style={{
          background: "var(--bg-sidebar)",
          borderRight: "1px solid var(--border-primary)",
        }}
      >
        {/* Brand */}
        <div
          className="px-5 py-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--border-primary)" }}
        >
          <div>
            <h1 className="text-lg font-semibold tracking-[0.12em]" style={{ color: "var(--ds-primary-text)" }}>
              VIG PRO
            </h1>
            <p className="text-[10px] font-medium tracking-wider" style={{ color: "var(--text-tertiary)" }}>
              COMPLIANCE &middot; INTELLIGENCE
            </p>
          </div>
          <button
            className="lg:hidden p-1 rounded-[var(--radius-sm)]"
            style={{ color: "var(--text-tertiary)" }}
            onClick={() => setSidebarOpen(false)}
          >
            <IconX />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-3">
          {filteredSections.map((section) => {
            const isCollapsed = collapsedSections[section.title] ?? false;
            return (
              <div key={section.title} className="mb-1">
                <button
                  onClick={() => toggleSection(section.title)}
                  className="w-full flex items-center justify-between px-2 py-2 text-[11px] font-semibold uppercase tracking-wider rounded-[var(--radius-sm)] transition-colors duration-150"
                  style={{ color: "var(--text-tertiary)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <span>{section.title}</span>
                  <IconChevron open={!isCollapsed} />
                </button>

                {!isCollapsed && (
                  <div className="mt-0.5 space-y-0.5">
                    {section.items.map((item) => {
                      const active = isActive(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setSidebarOpen(false)}
                          className="block px-3 py-2 text-[13px] rounded-[var(--radius-md)] transition-all duration-150"
                          style={{
                            color: active ? "var(--ds-primary-text)" : "var(--text-secondary)",
                            background: active ? "var(--bg-active)" : "transparent",
                            fontWeight: active ? 500 : 400,
                          }}
                          onMouseEnter={(e) => {
                            if (!active) {
                              e.currentTarget.style.background = "var(--bg-hover)";
                              e.currentTarget.style.color = "var(--text-primary)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!active) {
                              e.currentTarget.style.background = "transparent";
                              e.currentTarget.style.color = "var(--text-secondary)";
                            }
                          }}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 space-y-3" style={{ borderTop: "1px solid var(--border-primary)" }}>
          <ThemeSwitcher />
          {user && (
            <div className="flex items-center gap-2 py-1">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                style={{ background: "var(--bg-badge)", color: "var(--ds-primary-text)" }}
              >
                {user.email.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium truncate" style={{ color: "var(--text-primary)" }}>
                  {user.email}
                </p>
                <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                  {user.role}
                </p>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <Link
              href="/admin/perfil"
              className="text-[12px] transition-colors duration-150"
              style={{ color: "var(--text-tertiary)" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-link)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-tertiary)"; }}
            >
              Configurações
            </Link>
            <button
              onClick={logout}
              className="text-[12px] transition-colors duration-150"
              style={{ color: "var(--text-tertiary)" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--status-danger)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-tertiary)"; }}
            >
              Sair
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Top bar */}
        <header
          className="sticky top-0 z-30 flex items-center justify-between h-14 px-6"
          style={{
            background: "var(--bg-secondary)",
            borderBottom: "1px solid var(--border-primary)",
          }}
        >
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden p-1.5 rounded-[var(--radius-md)]"
              onClick={() => setSidebarOpen(true)}
              style={{ color: "var(--text-secondary)" }}
            >
              <IconMenu />
            </button>
            <nav className="flex items-center gap-1.5 text-[13px]">
              <Link href="/dashboard" className="hover:underline" style={{ color: "var(--text-tertiary)" }}>
                VIG PRO
              </Link>
              <span style={{ color: "var(--border-primary)" }}>/</span>
              <span style={{ color: "var(--text-primary)" }} className="font-medium">
                {currentPageName}
              </span>
            </nav>
          </div>

          {/* Right section: Command Palette hint + Notifications + User Avatar */}
          <div className="flex items-center gap-3">
            {/* Cmd+K hint badge */}
            <button
              onClick={() => setCommandPaletteOpen(true)}
              className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-md)] text-[12px]"
              style={{
                background: "var(--bg-input)",
                color: "var(--text-tertiary)",
                border: "1px solid var(--border-primary)",
              }}
              title="Abrir paleta de comandos (Cmd+K)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span>Cmd+K</span>
            </button>

            {/* Notification Bell */}
            <NotificationBell
              notifications={notifications}
              onMarkRead={handleMarkRead}
              onMarkAllRead={handleMarkAllRead}
              onClear={handleClearNotifications}
            />

            {/* User Avatar/Profile */}
            {user && (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold cursor-pointer"
                style={{ background: "var(--bg-badge)", color: "var(--ds-primary-text)" }}
                title={user.email}
              >
                {user.email.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 lg:p-8">
          {children}
        </main>
      </div>

      {/* Command Palette */}
      <CommandPalette
        items={commandItems}
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />
    </div>
  );
}
