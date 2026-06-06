import type { TelemetryEvent, SessionStartEvent, ToolCallEvent } from './events.js';

export type FetchLike = (
  input: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number }>;

export const DEFAULT_TELEMETRY_ENDPOINT = 'https://telemetry.ai-optimizer.dev/v1/events';

export interface TelemetryClientOptions {
  /** Whether to actually send. 'off' and 'opt-in' both no-op; only 'on' sends. */
  mode: 'off' | 'opt-in' | 'on';
  installId: string;
  /** ai-optimizer server version embedded in every event. */
  version: string;
  /** HTTP endpoint to POST events to. */
  endpoint?: string;
  /** Override fetch (used by tests). */
  fetchFn?: FetchLike;
  /** Periodic flush interval. Default 30s. Pass 0 to disable. */
  flushIntervalMs?: number;
  /** Buffer cap before triggering an early flush. Default 100. */
  maxBufferSize?: number;
}

/**
 * Buffered event sender with hard guarantees:
 *   - no-op unless mode === 'on'
 *   - never throws — telemetry must not crash the agent
 *   - drops events on send failure (we'd rather lose telemetry than retry forever)
 */
export class TelemetryClient {
  private buffer: TelemetryEvent[] = [];
  private timer?: ReturnType<typeof setInterval>;
  private readonly enabled: boolean;
  private readonly endpoint: string;
  private readonly fetchFn: FetchLike | undefined;
  private readonly maxBuf: number;

  constructor(private readonly opts: TelemetryClientOptions) {
    this.enabled = opts.mode === 'on';
    this.endpoint = opts.endpoint ?? DEFAULT_TELEMETRY_ENDPOINT;
    this.fetchFn = opts.fetchFn ?? (globalThis.fetch as FetchLike | undefined);
    this.maxBuf = opts.maxBufferSize ?? 100;
    const interval = opts.flushIntervalMs ?? 30_000;
    if (this.enabled && interval > 0) {
      this.timer = setInterval(() => {
        void this.flush();
      }, interval);
      // Don't keep the process alive just for telemetry.
      this.timer.unref?.();
    }
  }

  recordSessionStart(body: Omit<SessionStartEvent, 'type'>): void {
    this.append({ type: 'session_start', ...body });
  }

  recordToolCall(body: Omit<ToolCallEvent, 'type'>): void {
    this.append({ type: 'tool_call', ...body });
  }

  private append(body: SessionStartEvent | ToolCallEvent): void {
    if (!this.enabled) return;
    const event: TelemetryEvent = {
      ts: Date.now(),
      installId: this.opts.installId,
      version: this.opts.version,
      ...body,
    };
    this.buffer.push(event);
    if (this.buffer.length >= this.maxBuf) {
      void this.flush();
    }
  }

  /**
   * Flush buffered events. Returns the count attempted and whether the POST
   * succeeded. Drains the buffer regardless of outcome (no retry).
   */
  async flush(): Promise<{ sent: number; ok: boolean }> {
    if (!this.enabled || this.buffer.length === 0) return { sent: 0, ok: true };
    if (!this.fetchFn) return { sent: 0, ok: false };
    const events = this.buffer.splice(0, this.buffer.length);
    try {
      const res = await this.fetchFn(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ events }),
      });
      return { sent: events.length, ok: res.ok };
    } catch {
      return { sent: events.length, ok: false };
    }
  }

  pendingCount(): number {
    return this.buffer.length;
  }

  async shutdown(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    await this.flush();
  }
}
