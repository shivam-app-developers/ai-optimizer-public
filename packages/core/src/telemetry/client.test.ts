import { describe, it, expect, vi } from 'vitest';
import { TelemetryClient, type FetchLike } from './client.js';

function makeFetchSpy(): { fn: FetchLike; calls: Array<{ url: string; body: unknown }> } {
  const calls: Array<{ url: string; body: unknown }> = [];
  const fn: FetchLike = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200 };
  };
  return { fn, calls };
}

describe('TelemetryClient', () => {
  it('does not send anything when mode is off', async () => {
    const { fn, calls } = makeFetchSpy();
    const c = new TelemetryClient({
      mode: 'off',
      installId: 'inst',
      version: '0.0.0',
      fetchFn: fn,
      flushIntervalMs: 0,
    });
    c.recordSessionStart({
      frameworks: ['javascript'],
      packs: ['javascript'],
      proLoaded: false,
      schedulerEnabled: false,
      lspEnabled: false,
    });
    c.recordToolCall({ tool: 'optimized_read_file', durationMs: 5, tokensSaved: 100, ok: true });
    expect(c.pendingCount()).toBe(0);
    const r = await c.flush();
    expect(r).toEqual({ sent: 0, ok: true });
    expect(calls).toEqual([]);
    await c.shutdown();
  });

  it('does not send anything when mode is opt-in (the soft default)', async () => {
    const { fn, calls } = makeFetchSpy();
    const c = new TelemetryClient({
      mode: 'opt-in',
      installId: 'inst',
      version: '0.0.0',
      fetchFn: fn,
      flushIntervalMs: 0,
    });
    c.recordToolCall({ tool: 'x', durationMs: 1, tokensSaved: 0, ok: true });
    await c.flush();
    expect(calls).toEqual([]);
  });

  it('buffers events and POSTs them on flush when mode is on', async () => {
    const { fn, calls } = makeFetchSpy();
    const c = new TelemetryClient({
      mode: 'on',
      installId: 'inst-abc',
      version: '0.1.0',
      fetchFn: fn,
      flushIntervalMs: 0,
    });
    c.recordSessionStart({
      frameworks: ['javascript', 'python'],
      packs: ['javascript', 'python'],
      proLoaded: true,
      schedulerEnabled: false,
      lspEnabled: true,
    });
    c.recordToolCall({ tool: 'optimized_grep', durationMs: 17, tokensSaved: 500, ok: true });
    expect(c.pendingCount()).toBe(2);

    const r = await c.flush();
    expect(r).toEqual({ sent: 2, ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain('/v1/events');
    const body = calls[0]!.body as { events: Array<Record<string, unknown>> };
    expect(body.events).toHaveLength(2);
    expect(body.events[0]).toMatchObject({
      type: 'session_start',
      installId: 'inst-abc',
      version: '0.1.0',
      frameworks: ['javascript', 'python'],
      packs: ['javascript', 'python'],
      proLoaded: true,
      lspEnabled: true,
    });
    expect(body.events[1]).toMatchObject({
      type: 'tool_call',
      tool: 'optimized_grep',
      tokensSaved: 500,
    });
    expect(c.pendingCount()).toBe(0);
  });

  it('drains the buffer when the fetch fn rejects, but does not throw', async () => {
    const fn: FetchLike = async () => {
      throw new Error('network boom');
    };
    const c = new TelemetryClient({
      mode: 'on',
      installId: 'i',
      version: '0',
      fetchFn: fn,
      flushIntervalMs: 0,
    });
    c.recordToolCall({ tool: 't', durationMs: 1, tokensSaved: 0, ok: true });
    const r = await c.flush();
    expect(r).toEqual({ sent: 1, ok: false });
    expect(c.pendingCount()).toBe(0);
  });

  it('triggers an early flush when the buffer hits maxBufferSize', async () => {
    const { fn, calls } = makeFetchSpy();
    const c = new TelemetryClient({
      mode: 'on',
      installId: 'i',
      version: '0',
      fetchFn: fn,
      flushIntervalMs: 0,
      maxBufferSize: 3,
    });
    c.recordToolCall({ tool: 'a', durationMs: 1, tokensSaved: 0, ok: true });
    c.recordToolCall({ tool: 'b', durationMs: 1, tokensSaved: 0, ok: true });
    c.recordToolCall({ tool: 'c', durationMs: 1, tokensSaved: 0, ok: true });
    // The third record() triggers an async flush. Wait one tick.
    await new Promise((r) => setImmediate(r));
    expect(calls).toHaveLength(1);
    const body = calls[0]!.body as { events: unknown[] };
    expect(body.events).toHaveLength(3);
  });

  it('uses the default endpoint when none is provided', async () => {
    const { fn, calls } = makeFetchSpy();
    const c = new TelemetryClient({
      mode: 'on',
      installId: 'i',
      version: '0',
      fetchFn: fn,
      flushIntervalMs: 0,
    });
    c.recordToolCall({ tool: 't', durationMs: 1, tokensSaved: 0, ok: true });
    await c.flush();
    expect(calls[0]!.url).toMatch(/^https:\/\/telemetry\.ai-optimizer\.dev\//);
  });

  it('shutdown clears the timer and flushes any remaining events', async () => {
    const { fn, calls } = makeFetchSpy();
    const c = new TelemetryClient({
      mode: 'on',
      installId: 'i',
      version: '0',
      fetchFn: fn,
      flushIntervalMs: 0,
    });
    c.recordToolCall({ tool: 't', durationMs: 1, tokensSaved: 0, ok: true });
    await c.shutdown();
    expect(calls).toHaveLength(1);
  });
});
