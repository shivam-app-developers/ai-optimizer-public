import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { extname, isAbsolute, resolve, sep } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import {
  readSymbol as readSymbolImpl,
  lspSymbolKindToString,
  type SymbolFinder,
  type SymbolMatch,
  type SymbolReadOptions,
  type SymbolReadResult,
} from './symbol.js';

export type LspSeverity = 'error' | 'warning' | 'info' | 'hint';

export interface LspDiagnostic {
  line: number;
  endLine: number;
  character: number;
  endCharacter: number;
  severity: LspSeverity;
  message: string;
  source?: string;
  code?: string | number;
}

export interface LspServerConfig {
  id: string;
  command: string;
  args: string[];
  fileExtensions: string[];
  languageId: string;
  initializationOptions?: unknown;
  diagnosticTimeoutMs?: number;
}

export interface ErrorContextSlice {
  startLine: number;
  endLine: number;
  text: string;
}

export interface ErrorContextResult {
  filePath: string;
  diagnostics: LspDiagnostic[];
  slices: ErrorContextSlice[];
  fullLineCount: number;
  contextLineCount: number;
  estimatedTokensSaved: number;
}

interface PendingResponse {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

const SEVERITY_MAP: Record<number, LspSeverity> = {
  1: 'error',
  2: 'warning',
  3: 'info',
  4: 'hint',
};

const DEFAULT_DIAGNOSTIC_TIMEOUT_MS = 4000;
const DEFAULT_CONTEXT_LINES = 10;

export const DEFAULT_LSP_SERVERS: LspServerConfig[] = [
  {
    id: 'pyright',
    command: process.platform === 'win32' ? 'pyright-langserver.cmd' : 'pyright-langserver',
    args: ['--stdio'],
    fileExtensions: ['.py'],
    languageId: 'python',
  },
  {
    id: 'typescript-language-server',
    command:
      process.platform === 'win32'
        ? 'typescript-language-server.cmd'
        : 'typescript-language-server',
    args: ['--stdio'],
    fileExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
    languageId: 'typescript',
  },
];

export class LspClient {
  private proc?: ChildProcessWithoutNullStreams;
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private pending = new Map<number, PendingResponse>();
  private diagnosticsByUri = new Map<string, LspDiagnostic[]>();
  private diagnosticListeners = new Map<string, Set<(d: LspDiagnostic[]) => void>>();
  private startError?: Error;
  private started = false;
  private shuttingDown = false;
  private openDocVersions = new Map<string, number>();

  constructor(
    public readonly config: LspServerConfig,
    private readonly rootDir: string,
  ) {}

  async start(): Promise<void> {
    if (this.started) return;
    try {
      this.proc = spawn(this.config.command, this.config.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: this.rootDir,
        shell: false,
      });
    } catch (err) {
      this.startError = err as Error;
      throw err;
    }

    this.proc.on('error', (err) => {
      this.startError = err;
      this.failAllPending(err);
    });
    this.proc.on('exit', () => {
      if (!this.shuttingDown) {
        this.failAllPending(new Error(`${this.config.id} exited unexpectedly`));
      }
    });
    this.proc.stdout.on('data', (chunk: Buffer) => this.onData(chunk));
    this.proc.stderr.on('data', () => {
      // swallow — language servers spam stderr with progress
    });

    const initResult = (await this.request('initialize', {
      processId: process.pid,
      rootUri: pathToFileURL(this.rootDir).toString(),
      workspaceFolders: [
        {
          uri: pathToFileURL(this.rootDir).toString(),
          name: 'workspace',
        },
      ],
      capabilities: {
        textDocument: {
          publishDiagnostics: { relatedInformation: false },
          synchronization: { didSave: false, willSave: false, willSaveWaitUntil: false },
        },
        workspace: { workspaceFolders: true },
      },
      initializationOptions: this.config.initializationOptions,
    })) as { capabilities?: unknown };

    if (!initResult || typeof initResult !== 'object') {
      throw new Error(`${this.config.id} returned no initialize result`);
    }
    this.notify('initialized', {});
    this.started = true;
  }

  async openAndWaitForDiagnostics(
    absFilePath: string,
    content?: string,
    timeoutMs = DEFAULT_DIAGNOSTIC_TIMEOUT_MS,
  ): Promise<LspDiagnostic[]> {
    if (!this.started) await this.start();
    const text = content ?? (await fs.readFile(absFilePath, 'utf-8'));
    const uri = pathToFileURL(absFilePath).toString();

    const version = (this.openDocVersions.get(uri) ?? 0) + 1;
    this.openDocVersions.set(uri, version);

    const cached = this.diagnosticsByUri.get(uri);
    const startCount = cached ? cached.length : -1;

    const waiter = new Promise<LspDiagnostic[]>((resolveDiag) => {
      const listener = (d: LspDiagnostic[]): void => {
        const set = this.diagnosticListeners.get(uri);
        set?.delete(listener);
        resolveDiag(d);
      };
      let set = this.diagnosticListeners.get(uri);
      if (!set) {
        set = new Set();
        this.diagnosticListeners.set(uri, set);
      }
      set.add(listener);

      if (startCount === -1 && cached) {
        // Already had diagnostics from before — resolve immediately
        set.delete(listener);
        resolveDiag(cached);
      }
    });

    if (version === 1) {
      this.notify('textDocument/didOpen', {
        textDocument: {
          uri,
          languageId: this.config.languageId,
          version,
          text,
        },
      });
    } else {
      this.notify('textDocument/didChange', {
        textDocument: { uri, version },
        contentChanges: [{ text }],
      });
    }

    return await Promise.race([
      waiter,
      new Promise<LspDiagnostic[]>((res) =>
        setTimeout(() => res(this.diagnosticsByUri.get(uri) ?? []), timeoutMs),
      ),
    ]);
  }

  async workspaceSymbol(query: string, timeoutMs = 4000): Promise<SymbolMatch[]> {
    if (!this.started) await this.start();
    const result = await Promise.race([
      this.request('workspace/symbol', { query }),
      new Promise<unknown>((_, rej) =>
        setTimeout(() => rej(new Error('workspace/symbol timeout')), timeoutMs),
      ),
    ]);
    if (!Array.isArray(result)) return [];
    return result
      .map((raw) => toSymbolMatch(raw))
      .filter((m): m is SymbolMatch => m !== undefined);
  }

  async shutdown(): Promise<void> {
    if (!this.proc || this.shuttingDown) return;
    this.shuttingDown = true;
    const proc = this.proc;
    const exited = new Promise<void>((res) => {
      proc.once('exit', () => res());
      proc.once('close', () => res());
    });
    try {
      await Promise.race([
        this.request('shutdown', null),
        new Promise((res) => setTimeout(res, 500)),
      ]);
      this.notify('exit', null);
    } catch {
      // ignore
    }
    if (!proc.killed) proc.kill();
    await Promise.race([exited, new Promise<void>((res) => setTimeout(res, 1500))]);
    this.proc = undefined;
  }

  isStarted(): boolean {
    return this.started;
  }

  getStartError(): Error | undefined {
    return this.startError;
  }

  private request(method: string, params: unknown): Promise<unknown> {
    if (!this.proc) return Promise.reject(new Error(`${this.config.id} not running`));
    const id = this.nextId++;
    return new Promise((resolveResp, rejectResp) => {
      this.pending.set(id, { resolve: resolveResp, reject: rejectResp });
      this.send({ jsonrpc: '2.0', id, method, params });
    });
  }

  private notify(method: string, params: unknown): void {
    if (!this.proc) return;
    this.send({ jsonrpc: '2.0', method, params });
  }

  private send(message: unknown): void {
    if (!this.proc) return;
    const body = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(body, 'utf-8')}\r\n\r\n`;
    try {
      this.proc.stdin.write(header + body);
    } catch (err) {
      this.failAllPending(err as Error);
    }
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;
      const header = this.buffer.slice(0, headerEnd).toString('utf-8');
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) {
        // Bad framing — drop everything up to header end and continue
        this.buffer = this.buffer.slice(headerEnd + 4);
        continue;
      }
      const len = Number(match[1]);
      const total = headerEnd + 4 + len;
      if (this.buffer.length < total) return;
      const body = this.buffer.slice(headerEnd + 4, total).toString('utf-8');
      this.buffer = this.buffer.slice(total);
      try {
        const msg = JSON.parse(body);
        this.dispatch(msg);
      } catch {
        // malformed — skip
      }
    }
  }

  private dispatch(msg: Record<string, unknown>): void {
    if (typeof msg.id === 'number' && (msg.result !== undefined || msg.error !== undefined)) {
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);
      if (msg.error) {
        const err = msg.error as { message?: string; code?: number };
        pending.reject(new Error(err.message ?? `LSP error ${err.code ?? '?'}`));
      } else {
        pending.resolve(msg.result);
      }
      return;
    }
    if (msg.method === 'textDocument/publishDiagnostics') {
      const params = msg.params as { uri: string; diagnostics: unknown[] };
      const diagnostics = (params.diagnostics ?? []).map(toDiagnostic);
      this.diagnosticsByUri.set(params.uri, diagnostics);
      const set = this.diagnosticListeners.get(params.uri);
      if (set) {
        for (const listener of Array.from(set)) listener(diagnostics);
      }
    }
    // Other server-initiated messages (window/logMessage, $/progress) ignored on purpose
  }

  private failAllPending(err: Error): void {
    for (const [id, p] of this.pending) {
      p.reject(err);
      this.pending.delete(id);
    }
  }
}

export interface LspBridgeOptions {
  rootDir: string;
  servers?: LspServerConfig[];
}

export class LspBridge {
  private clientsByExt = new Map<string, LspClient>();
  private allClients: LspClient[] = [];

  constructor(private readonly opts: LspBridgeOptions) {
    const servers = opts.servers ?? DEFAULT_LSP_SERVERS;
    for (const cfg of servers) {
      const client = new LspClient(cfg, opts.rootDir);
      this.allClients.push(client);
      for (const ext of cfg.fileExtensions) {
        this.clientsByExt.set(ext.toLowerCase(), client);
      }
    }
  }

  hasServerFor(filePath: string): boolean {
    return this.clientsByExt.has(extname(filePath).toLowerCase());
  }

  async getDiagnostics(filePath: string, content?: string): Promise<LspDiagnostic[]> {
    const client = this.pickClient(filePath);
    if (!client) return [];
    const abs = isAbsolute(filePath) ? filePath : resolve(this.opts.rootDir, filePath);
    try {
      return await client.openAndWaitForDiagnostics(abs, content);
    } catch {
      return [];
    }
  }

  async errorContext(
    filePath: string,
    opts?: { contextLines?: number; estimateTokens?: (s: string) => number },
  ): Promise<ErrorContextResult> {
    const abs = isAbsolute(filePath) ? filePath : resolve(this.opts.rootDir, filePath);
    const fullText = await fs.readFile(abs, 'utf-8');
    const fullLines = fullText.split('\n');
    const diagnostics = await this.getDiagnostics(abs, fullText);
    const errorDiagnostics = diagnostics.filter(
      (d) => d.severity === 'error' || d.severity === 'warning',
    );
    const slices = collapseRanges(errorDiagnostics, fullLines.length, opts?.contextLines);

    const sliceTexts: ErrorContextSlice[] = slices.map(({ startLine, endLine }) => ({
      startLine,
      endLine,
      text: fullLines.slice(startLine - 1, endLine).join('\n'),
    }));

    const estimate = opts?.estimateTokens ?? defaultEstimate;
    const fullTokens = estimate(fullText);
    const sliceTokens = sliceTexts.reduce((sum, s) => sum + estimate(s.text), 0);
    const contextLineCount = sliceTexts.reduce((sum, s) => sum + (s.endLine - s.startLine + 1), 0);

    return {
      filePath: toPosix(filePath),
      diagnostics: errorDiagnostics,
      slices: sliceTexts,
      fullLineCount: fullLines.length,
      contextLineCount,
      estimatedTokensSaved: Math.max(0, fullTokens - sliceTokens),
    };
  }

  async workspaceSymbol(query: string): Promise<SymbolMatch[]> {
    const all: SymbolMatch[] = [];
    for (const client of this.allClients) {
      try {
        const matches = await client.workspaceSymbol(query);
        all.push(...matches);
      } catch {
        // ignore — server may not implement workspace/symbol
      }
    }
    return all;
  }

  async readSymbol(query: string, opts?: SymbolReadOptions): Promise<SymbolReadResult> {
    const finder: SymbolFinder = {
      workspaceSymbol: (q) => this.workspaceSymbol(q),
    };
    return readSymbolImpl(
      finder,
      query,
      async (path: string) => {
        const abs = isAbsolute(path) ? path : resolve(this.opts.rootDir, path);
        return fs.readFile(abs, 'utf-8');
      },
      opts,
    );
  }

  async shutdown(): Promise<void> {
    await Promise.all(this.allClients.map((c) => c.shutdown()));
  }

  private pickClient(filePath: string): LspClient | undefined {
    return this.clientsByExt.get(extname(filePath).toLowerCase());
  }
}

function toSymbolMatch(raw: unknown): SymbolMatch | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as {
    name?: string;
    kind?: number;
    containerName?: string;
    location?: {
      uri?: string;
      range?: {
        start: { line: number; character: number };
        end: { line: number; character: number };
      };
    };
  };
  if (!r.name || !r.location?.uri || !r.location.range) return undefined;
  let filePath: string;
  try {
    filePath = fileURLToPath(r.location.uri);
  } catch {
    return undefined;
  }
  return {
    name: r.name,
    containerName: r.containerName,
    filePath,
    range: {
      startLine: r.location.range.start.line + 1,
      endLine: r.location.range.end.line + 1,
    },
    kind: lspSymbolKindToString(r.kind ?? 0),
  };
}

function toDiagnostic(raw: unknown): LspDiagnostic {
  const d = raw as {
    range: { start: { line: number; character: number }; end: { line: number; character: number } };
    severity?: number;
    message?: string;
    source?: string;
    code?: string | number;
  };
  return {
    line: d.range.start.line + 1,
    endLine: d.range.end.line + 1,
    character: d.range.start.character,
    endCharacter: d.range.end.character,
    severity: SEVERITY_MAP[d.severity ?? 1] ?? 'error',
    message: d.message ?? '',
    source: d.source,
    code: d.code,
  };
}

function collapseRanges(
  diagnostics: LspDiagnostic[],
  totalLines: number,
  contextLines = DEFAULT_CONTEXT_LINES,
): { startLine: number; endLine: number }[] {
  if (diagnostics.length === 0) return [];
  const ranges = diagnostics
    .map((d) => ({
      startLine: Math.max(1, d.line - contextLines),
      endLine: Math.min(totalLines, d.endLine + contextLines),
    }))
    .sort((a, b) => a.startLine - b.startLine);

  const merged: { startLine: number; endLine: number }[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.startLine <= last.endLine + 1) {
      last.endLine = Math.max(last.endLine, r.endLine);
    } else {
      merged.push({ ...r });
    }
  }
  return merged;
}

function defaultEstimate(text: string): number {
  return Math.ceil(text.length / 4);
}

function toPosix(p: string): string {
  return p.split(sep).join('/').split('\\').join('/');
}
