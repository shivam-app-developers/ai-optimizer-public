import type { SavingsSnapshot } from './types.js';

const CHARS_PER_TOKEN = 4;

export class SavingsCounter {
  private tokensSaved = 0;
  private operations = 0;

  record(saved: number): void {
    if (saved > 0) {
      this.tokensSaved += saved;
      this.operations += 1;
    }
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  estimateTokensFromBytes(bytes: number): number {
    return Math.ceil(bytes / CHARS_PER_TOKEN);
  }

  snapshot(): SavingsSnapshot {
    return {
      tokensSaved: this.tokensSaved,
      operations: this.operations,
    };
  }

  reset(): void {
    this.tokensSaved = 0;
    this.operations = 0;
  }
}
