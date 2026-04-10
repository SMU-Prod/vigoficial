"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Global Error] Error:", error);
  }, [error]);

  return (
    <html>
      <body>
        <div className="flex flex-col items-center justify-center min-h-screen px-4 bg-gradient-to-br from-[#0B1F3A] to-[#0B1F3A]/90">
          <div className="bg-[var(--bg-secondary)] rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
            <div className="w-16 h-16 bg-[var(--status-danger-bg)] rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-[var(--status-danger)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-[var(--vigi-navy)] mb-2">
              Erro Crítico
            </h2>
            <p className="text-[var(--text-secondary)] mb-6 text-sm">
              Ocorreu um erro inesperado. Tente recarregar a página ou contate o
              suporte.
            </p>
            {process.env.NODE_ENV === "development" && error?.message && (
              <pre className="bg-[var(--border-primary)] text-[var(--status-danger)] text-xs p-3 rounded-lg mb-4 text-left overflow-auto max-h-32">
                {error.message}
              </pre>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={reset}
                className="px-5 py-2.5 bg-[var(--btn-primary)] text-white rounded-lg hover:bg-[var(--btn-primary-hover)] transition-colors text-sm font-medium"
              >
                Recarregar
              </button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/"
                className="px-5 py-2.5 border border-[var(--border-primary)] text-[var(--text-primary)] rounded-lg hover:bg-[var(--border-primary)] transition-colors text-sm font-medium"
              >
                Voltar ao início
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
