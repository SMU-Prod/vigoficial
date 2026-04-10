/**
 * VIGI Core — Token Tracker
 * Shared token counting logic extracted from agents
 * Used by both agents and cognitive engine without circular dependencies
 */

export interface ITokenTracker {
  recordUsage(usage: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  }): void;
  track(usage: unknown): void;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly cacheCreationTokens: number;
  readonly cacheReadTokens: number;
  readonly total: number;
  readonly cost: number;
  readonly stats: {
    total: number;
    cost: number;
    cacheRead: number;
    cacheWrite: number;
    steps: number;
  };
}

export class TokenTracker implements ITokenTracker {
  private totalInput = 0;
  private totalOutput = 0;
  private cacheRead = 0;
  private cacheWrite = 0;
  private label: string;

  constructor(label?: string) {
    this.label = label || "default";
  }

  recordUsage(usage: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  }) {
    this.totalInput += usage.input_tokens || 0;
    this.totalOutput += usage.output_tokens || 0;
    this.cacheRead += usage.cache_read_input_tokens || 0;
    this.cacheWrite += usage.cache_creation_input_tokens || 0;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  track(usage: any) {
    this.recordUsage(usage as {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    });
  }

  get totalInputTokens(): number {
    return this.totalInput;
  }

  get totalOutputTokens(): number {
    return this.totalOutput;
  }

  get cacheCreationTokens(): number {
    return this.cacheWrite;
  }

  get cacheReadTokens(): number {
    return this.cacheRead;
  }

  get total(): number {
    return this.totalInput + this.totalOutput;
  }

  get cost(): number {
    // Approximate cost calculation (Haiku ~$0.25/M input, $1.25/M output; Sonnet ~$3/M input, $15/M output)
    // This is approximate; Langfuse will provide exact costs
    const inputCost = (this.totalInput - this.cacheRead) * 0.003 / 1000 + this.cacheRead * 0.0003 / 1000;
    const outputCost = this.totalOutput * 0.015 / 1000;
    return Math.round((inputCost + outputCost) * 1000000) / 1000000;
  }

  get stats() {
    return {
      total: this.total,
      cost: this.cost,
      cacheRead: this.cacheRead,
      cacheWrite: this.cacheWrite,
      steps: 0, // overridden by caller
    };
  }
}
