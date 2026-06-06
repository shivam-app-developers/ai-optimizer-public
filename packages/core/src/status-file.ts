import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir, platform } from 'node:os';

export interface StatusSnapshot {
  /** Updated wall-clock time in ms epoch. */
  ts: number;
  /** Token savings counter (cumulative this session). */
  tokensSaved: number;
  /** Operations counter. */
  operations: number;
  /** Detected frameworks for this project. */
  frameworks: string[];
  /** Active pack ids. */
  packs: string[];
  /** Approximate USD value of tokensSaved at the user's configured pricing. */
  dollarsSaved: number;
  /** Project root the snapshot is for. */
  rootDir: string;
  /** Optional budget snapshot when budget caps are configured. */
  budget?: {
    sessionUsed: number;
    dayUsed: number;
    perSessionTokens?: number;
    perDayTokens?: number;
    exceeded: boolean;
  };
}

export interface StatusFileWriterOptions {
  /** Path to write to. Defaults to <userConfigDir>/status.json. */
  path?: string;
  /**
   * Minimum interval between disk writes. Updates inside the window are
   * coalesced. Default 1000 ms — fast enough for an IDE status bar, light
   * enough not to thrash the disk on bursty tool calls.
   */
  minIntervalMs?: number;
}

/**
 * Coalescing snapshot writer. Reads consume the latest persisted snapshot;
 * other processes (the VS Code extension, a future dashboard agent) can fs.watch
 * this file to get push-style updates without speaking the MCP protocol.
 *
 * Write failures are silently swallowed — IDE telemetry must never crash the agent.
 */
export class StatusFileWriter {
  private readonly path: string;
  private readonly minIntervalMs: number;
  private latest?: StatusSnapshot;
  private timer?: ReturnType<typeof setTimeout>;
  private lastFlushAt = 0;
  private pending = false;

  constructor(opts: StatusFileWriterOptions = {}) {
    this.path = opts.path ?? defaultStatusFilePath();
    this.minIntervalMs = opts.minIntervalMs ?? 1000;
  }

  /** Update the latest snapshot. Triggers a (possibly delayed) flush. */
  update(snap: StatusSnapshot): void {
    this.latest = snap;
    this.scheduleFlush();
  }

  /** Force a synchronous flush of the latest snapshot. */
  flushNow(): void {
    if (!this.latest) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.writeNow();
  }

  /** Flush + stop. Idempotent. */
  shutdown(): void {
    this.flushNow();
  }

  filePath(): string {
    return this.path;
  }

  private scheduleFlush(): void {
    const now = Date.now();
    const elapsed = now - this.lastFlushAt;
    if (elapsed >= this.minIntervalMs) {
      this.writeNow();
      return;
    }
    if (!this.pending) {
      this.pending = true;
      const wait = this.minIntervalMs - elapsed;
      this.timer = setTimeout(() => this.writeNow(), wait);
      this.timer.unref?.();
    }
  }

  private writeNow(): void {
    if (!this.latest) {
      this.pending = false;
      this.timer = undefined;
      return;
    }
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      writeFileSync(this.path, JSON.stringify(this.latest) + '\n', 'utf-8');
    } catch {
      // ignore write failures
    }
    this.lastFlushAt = Date.now();
    this.pending = false;
    this.timer = undefined;
  }
}

export function defaultStatusFilePath(
  home: string = homedir(),
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (platform() === 'win32') {
    const appData = env.APPDATA ?? join(home, 'AppData', 'Roaming');
    return join(appData, 'ai-optimizer', 'status.json');
  }
  const xdg = env.XDG_CONFIG_HOME ?? join(home, '.config');
  return join(xdg, 'ai-optimizer', 'status.json');
}
