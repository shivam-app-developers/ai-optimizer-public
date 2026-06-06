import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir, platform } from 'node:os';
import type { BudgetCaps } from './config.js';

export interface BudgetSnapshot {
  sessionUsed: number;
  dayUsed: number;
  perSessionTokens?: number;
  perDayTokens?: number;
  /** True iff a cap is currently breached. */
  exceeded: boolean;
  /** Set when exceeded — describes which cap. */
  exceededReason?: string;
  /** UTC date of the dayUsed counter, formatted yyyy-mm-dd. */
  dayKey: string;
}

export interface BudgetTrackerOptions {
  caps?: BudgetCaps;
  /** Override storage path (mostly for tests). */
  storagePath?: string;
  /** Override clock (mostly for tests). Returns ms epoch. */
  now?: () => number;
}

/**
 * Per-session + per-day token budget enforcer. Session count is in-memory and
 * resets on process restart. Day count persists to a small JSON file under the
 * user's config dir so it survives across sessions; resets at UTC midnight.
 *
 * Pairs with the scheduler: a long-running scheduled task that exhausts the
 * day cap will see consume() return exceeded=true and the calling tool can
 * refuse, hard-killing the agent before more spend accrues.
 */
export class BudgetTracker {
  private sessionUsed = 0;
  private dayUsed = 0;
  private dayKey: string;
  private readonly caps: BudgetCaps;
  private readonly storagePath: string;
  private readonly nowFn: () => number;

  constructor(opts: BudgetTrackerOptions = {}) {
    this.caps = opts.caps ?? {};
    this.storagePath = opts.storagePath ?? defaultBudgetStoragePath();
    this.nowFn = opts.now ?? Date.now;
    this.dayKey = utcDayKey(this.nowFn());
    this.loadDayFromDisk();
  }

  /**
   * Records `tokens` as consumed and returns the post-consume snapshot.
   * Caller decides what to do with `exceeded`. Negative inputs ignored.
   */
  consume(tokens: number): BudgetSnapshot {
    if (tokens > 0) {
      this.rollDayIfNeeded();
      this.sessionUsed += tokens;
      this.dayUsed += tokens;
      this.persistDay();
    }
    return this.snapshot();
  }

  /** Returns true iff adding `tokens` would breach a configured cap. */
  wouldExceed(tokens: number): boolean {
    this.rollDayIfNeeded();
    if (this.caps.perSessionTokens !== undefined) {
      if (this.sessionUsed + tokens > this.caps.perSessionTokens) return true;
    }
    if (this.caps.perDayTokens !== undefined) {
      if (this.dayUsed + tokens > this.caps.perDayTokens) return true;
    }
    return false;
  }

  /** Reason string describing which cap is breached, or undefined. */
  reasonIfExceeded(prospective = 0): string | undefined {
    this.rollDayIfNeeded();
    if (this.caps.perSessionTokens !== undefined) {
      const after = this.sessionUsed + prospective;
      if (after > this.caps.perSessionTokens) {
        return `per-session cap reached (${after} > ${this.caps.perSessionTokens} tokens)`;
      }
    }
    if (this.caps.perDayTokens !== undefined) {
      const after = this.dayUsed + prospective;
      if (after > this.caps.perDayTokens) {
        return `per-day cap reached (${after} > ${this.caps.perDayTokens} tokens for ${this.dayKey} UTC)`;
      }
    }
    return undefined;
  }

  snapshot(): BudgetSnapshot {
    this.rollDayIfNeeded();
    const reason = this.reasonIfExceeded();
    return {
      sessionUsed: this.sessionUsed,
      dayUsed: this.dayUsed,
      perSessionTokens: this.caps.perSessionTokens,
      perDayTokens: this.caps.perDayTokens,
      exceeded: reason !== undefined,
      exceededReason: reason,
      dayKey: this.dayKey,
    };
  }

  /** Reset everything — exposed mainly for tests and an explicit user reset. */
  reset(): void {
    this.sessionUsed = 0;
    this.dayUsed = 0;
    this.dayKey = utcDayKey(this.nowFn());
    this.persistDay();
  }

  private loadDayFromDisk(): void {
    if (!existsSync(this.storagePath)) return;
    try {
      const raw = readFileSync(this.storagePath, 'utf-8');
      const parsed = JSON.parse(raw) as { date?: string; tokens?: number };
      if (parsed.date === this.dayKey && typeof parsed.tokens === 'number' && parsed.tokens >= 0) {
        this.dayUsed = parsed.tokens;
      }
    } catch {
      // Corrupt file — reset on next persist.
    }
  }

  private persistDay(): void {
    try {
      mkdirSync(dirname(this.storagePath), { recursive: true });
      writeFileSync(
        this.storagePath,
        JSON.stringify({ date: this.dayKey, tokens: this.dayUsed }) + '\n',
        'utf-8',
      );
    } catch {
      // Persistence failure must not crash the agent.
    }
  }

  private rollDayIfNeeded(): void {
    const today = utcDayKey(this.nowFn());
    if (today !== this.dayKey) {
      this.dayKey = today;
      this.dayUsed = 0;
      this.persistDay();
    }
  }
}

function utcDayKey(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function defaultBudgetStoragePath(
  home: string = homedir(),
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (platform() === 'win32') {
    const appData = env.APPDATA ?? join(home, 'AppData', 'Roaming');
    return join(appData, 'ai-optimizer', 'budget-day.json');
  }
  const xdg = env.XDG_CONFIG_HOME ?? join(home, '.config');
  return join(xdg, 'ai-optimizer', 'budget-day.json');
}
