"use client";

import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "./button";

interface Props {
  children: ReactNode;
  fallback?: (error: Error, retry: () => void) => ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.props.onError?.(error, errorInfo);

    if (process.env.NODE_ENV === "development") {
      console.error("Error caught by boundary:", error, errorInfo);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleReset);
      }

      return (
        <div className="flex items-center justify-center min-h-screen bg-[var(--bg-tertiary)] p-4">
          <div className="max-w-md w-full bg-[var(--bg-secondary)] rounded-lg shadow-lg p-8 text-center">
            <svg
              className="mx-auto h-12 w-12 text-[var(--status-danger)] mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>

            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Algo deu errado</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-6">
              Desculpe, ocorreu um erro inesperado. Por favor, tente novamente.
            </p>

            {process.env.NODE_ENV === "development" && (
              <details className="mb-6 text-left bg-[var(--status-danger-bg)] p-3 rounded border border-[var(--status-danger)]">
                <summary className="cursor-pointer font-medium text-[var(--status-danger)] mb-2">Detalhes do erro</summary>
                <pre className="text-xs text-[var(--status-danger)] overflow-auto max-h-40 font-mono whitespace-pre-wrap break-words">
                  {this.state.error.message}
                  {"\n\n"}
                  {this.state.error.stack}
                </pre>
              </details>
            )}

            <div className="flex gap-3 justify-center">
              <Button variant="secondary" onClick={this.handleReset}>
                Tentar novamente
              </Button>
              <Button
                variant="primary"
                onClick={() => (window.location.href = "/")}
              >
                Voltar ao início
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
