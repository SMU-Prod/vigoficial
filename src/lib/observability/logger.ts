/**
 * OPS-06: Structured Logging for Production
 *
 * Provides a structured logger that outputs JSON in production for better:
 * - Log aggregation (Sentry, Datadog, CloudWatch)
 * - Searchability and filtering
 * - Monitoring and alerting
 * - Compliance and audit trails
 *
 * Usage:
 * import { logger } from "@/lib/observability/logger";
 *
 * logger.info("User logged in", { userId: "123", email: "user@example.com" });
 * logger.error("Payment failed", { error: err, amount: 100 }, { correlationId });
 * logger.warn("High latency detected", { duration: 5000 });
 * logger.debug("Cache miss", { key: "user:123" });
 */

import { env } from "@/lib/config/env";
import { v4 as uuidv4 } from "uuid";

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  correlationId?: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
  duration?: number; // milliseconds
  tags?: Record<string, string | number>;
}

interface LoggerOptions {
  correlationId?: string;
  tags?: Record<string, string | number>;
}

class StructuredLogger {
  private correlationId: string;
  private defaultTags: Record<string, string | number>;

  constructor(correlationId?: string, tags?: Record<string, string | number>) {
    this.correlationId = correlationId || uuidv4();
    this.defaultTags = {
      environment: env.NODE_ENV,
      service: "vigipro",
      ...tags,
    };
  }

  private formatEntry(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      correlationId: this.correlationId,
      context,
      tags: this.defaultTags,
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        code: (error as any).code,
      };
    }

    return entry;
  }

  private output(entry: LogEntry): void {
    const isProduction = env.NODE_ENV === "production";

    if (isProduction) {
      // Production: JSON output for log aggregation
      console.log(JSON.stringify(entry));
    } else {
      // Development: Pretty-printed with colors
      const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.correlationId}]`;
      const color = this.getColorCode(entry.level);
      const reset = "\x1b[0m";

      let output = `${color}${prefix}${reset} ${entry.message}`;

      if (entry.context && Object.keys(entry.context).length > 0) {
        output += `\n  Context: ${JSON.stringify(entry.context, null, 2)}`;
      }

      if (entry.error) {
        output += `\n  Error: ${entry.error.name}: ${entry.error.message}`;
        if (entry.error.stack) {
          output += `\n  Stack: ${entry.error.stack}`;
        }
      }

      console.log(output);
    }
  }

  private getColorCode(level: LogLevel): string {
    const colors: Record<LogLevel, string> = {
      debug: "\x1b[36m", // Cyan
      info: "\x1b[32m", // Green
      warn: "\x1b[33m", // Yellow
      error: "\x1b[31m", // Red
    };
    return colors[level];
  }

  debug(
    message: string,
    context?: Record<string, unknown>,
    _options?: LoggerOptions
  ): void {
    if (env.NODE_ENV === "production") return; // Skip debug in production
    this.output(this.formatEntry("debug", message, context));
  }

  info(
    message: string,
    context?: Record<string, unknown>,
    _options?: LoggerOptions
  ): void {
    this.output(this.formatEntry("info", message, context));
  }

  warn(
    message: string,
    context?: Record<string, unknown>,
    _options?: LoggerOptions
  ): void {
    this.output(this.formatEntry("warn", message, context));
  }

  error(
    message: string,
    contextOrError?: Record<string, unknown> | Error,
    _options?: LoggerOptions
  ): void {
    let context: Record<string, unknown> | undefined;
    let error: Error | undefined;

    if (contextOrError instanceof Error) {
      error = contextOrError;
    } else {
      context = contextOrError;
    }

    this.output(this.formatEntry("error", message, context, error));
  }

  /**
   * Create a child logger with additional context/correlation ID
   */
  child(correlationId?: string, tags?: Record<string, string | number>): StructuredLogger {
    return new StructuredLogger(
      correlationId || this.correlationId,
      { ...this.defaultTags, ...tags }
    );
  }

  /**
   * Log operation duration and result
   */
  async timed<T>(
    message: string,
    fn: () => Promise<T>,
    context?: Record<string, unknown>
  ): Promise<T> {
    const startTime = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - startTime;
      this.info(`${message} (${duration.toFixed(0)}ms)`, {
        ...context,
        duration: Math.round(duration),
      });
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      this.error(`${message} failed (${duration.toFixed(0)}ms)`, error as Error);
      throw error;
    }
  }

  /**
   * Set correlation ID for all subsequent logs
   */
  setCorrelationId(id: string): void {
    this.correlationId = id;
  }

  /**
   * Get current correlation ID
   */
  getCorrelationId(): string {
    return this.correlationId;
  }
}

// Default logger instance exported as singleton
export const logger = new StructuredLogger();

/**
 * Create a logger with custom correlation ID
 * Useful for request handlers
 */
export function createLogger(correlationId?: string, tags?: Record<string, string | number>): StructuredLogger {
  return new StructuredLogger(correlationId, tags);
}

/**
 * Extract or create correlation ID from request headers
 * For use in API routes/middleware
 */
export function getCorrelationIdFromHeaders(headers: Record<string, string | string[] | undefined>): string {
  const headerValue = headers["x-correlation-id"] || headers["x-request-id"];

  if (typeof headerValue === "string") {
    return headerValue;
  }

  if (Array.isArray(headerValue)) {
    return headerValue[0] || uuidv4();
  }

  return uuidv4();
}
