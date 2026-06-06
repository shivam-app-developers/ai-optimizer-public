import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { detectProject } from './detector.js';
import { loadFreePacks } from './pack-loader.js';
import { loadPluginPacks } from './plugin-loader.js';
import { SavingsCounter } from './counter.js';
import { Interceptor } from './interceptor.js';
import { LspBridge } from './lsp-bridge.js';
import { cleanBashOutput } from './bash-cleaner.js';
import {
  loadConfig,
  writeProjectConfig,
  formatDollars,
  formatTokensWithDollars,
  tokensToDollars,
  type ConfigPatch,
  type OptimizerConfig,
} from './config.js';
import { TelemetryClient, getOrCreateInstallId } from './telemetry/index.js';
import { BudgetTracker } from './budget.js';
import { StatusFileWriter } from './status-file.js';

const SERVER_NAME = 'ai-optimizer';
const SERVER_VERSION = '0.1.0';

export interface CompactedHistory {
  compacted: Array<{ role: string; content: string }>;
  originalMessageCount: number;
  compactedMessageCount: number;
  summarizedMessageCount: number;
  estimatedTokensSaved: number;
}

export interface SchedulerListItem {
  id: string;
  cron: string;
  prompt: string;
  label?: string;
  agent?: string;
  nextFireAt: string;
  lastFiredAt?: string;
  fireCount: number;
}

export interface SchedulerExtensionLike {
  schedule(input: { cron: string; prompt: string; label?: string; agent?: string }): {
    id: string;
    nextFireAt: string;
  };
  list(): SchedulerListItem[];
  cancel(id: string): boolean;
  getStatus(): { queued: number; nextFireAt?: string; nextLabel?: string };
  stop(): Promise<void>;
}

export interface AuditLogEntryLike {
  ts: number;
  tool: string;
  path: string;
  tokensReturned: number;
  redactionsByKind: Record<string, number>;
  allowed: boolean;
  blockedReason?: string;
}

export interface AuditExtensionLike {
  redactContent(content: string): {
    redacted: string;
    replacements: Array<{ kind: string; count: number }>;
  };
  checkPath(path: string, tool: string): { allowed: boolean; reason?: string };
  log(entry: AuditLogEntryLike): void;
  describe(): {
    policy: { denyPaths: string[]; allowPaths: string[]; perToolDeny: Record<string, string[]> };
    logFile?: string;
    redactDisableKinds: string[];
  };
}

export interface ProExtensions {
  compactHistory?: (
    messages: Array<{ role: string; content: string }>,
    opts?: { keepLastMessages?: number; maxTopicsInSummary?: number },
  ) => CompactedHistory;
  scheduler?: SchedulerExtensionLike;
  audit?: AuditExtensionLike;
}

export interface StartOptions {
  rootDir: string;
  enableLsp?: boolean;
  extraPacks?: import('./types.js').FrameworkPack[];
  proExtensions?: ProExtensions;
}

export async function startServer(options: StartOptions): Promise<void> {
  let configState = loadConfig({ rootDir: options.rootDir }).config;
  const pluginResult = await loadPluginPacks(configState.plugins, options.rootDir);
  for (const e of pluginResult.errors) {
    process.stderr.write(`[ai-optimizer] failed to load plugin "${e.spec}": ${e.message}\n`);
  }
  const packs = [
    ...loadFreePacks(),
    ...(options.extraPacks ?? []),
    ...pluginResult.packs,
  ];
  const context = await detectProject(options.rootDir, packs);
  const counter = new SavingsCounter();
  const interceptor = new Interceptor(context, counter);

  // Explicit option override wins (used by callers that bypass config files entirely)
  const enableLsp = options.enableLsp ?? configState.features.lsp;
  const lsp = enableLsp ? new LspBridge({ rootDir: context.rootDir }) : undefined;

  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  const detectedSummary = context.detectedFrameworks.join(', ') || 'none';
  const gitignoreNote = context.gitignoreMatcher ? ' (.gitignore active)' : '';

  const scheduler =
    configState.features.scheduling && options.proExtensions?.scheduler
      ? options.proExtensions.scheduler
      : undefined;

  const audit =
    configState.features.audit && options.proExtensions?.audit
      ? options.proExtensions.audit
      : undefined;

  // Telemetry — no-op unless config.telemetry === 'on'. The install id is only
  // generated/persisted when telemetry is actually on, so users on the default
  // 'opt-in' setting never have a UUID written to disk.
  const telemetry =
    configState.telemetry === 'on'
      ? new TelemetryClient({
          mode: 'on',
          installId: getOrCreateInstallId(),
          version: SERVER_VERSION,
        })
      : undefined;
  telemetry?.recordSessionStart({
    frameworks: context.detectedFrameworks,
    packs: context.activePacks.map((p) => p.id),
    proLoaded: Boolean(options.proExtensions?.compactHistory || options.proExtensions?.scheduler),
    schedulerEnabled: Boolean(scheduler),
    lspEnabled: Boolean(lsp),
  });

  function recordToolEvent(
    tool: string,
    t0: number,
    tokensSaved: number,
    ok: boolean,
    errorCategory?: string,
  ): void {
    telemetry?.recordToolCall({
      tool,
      durationMs: Date.now() - t0,
      tokensSaved,
      ok,
      errorCategory,
    });
  }

  // Per-conversation + per-day budget caps. Tracks tokens we hand back to the
  // agent. When a cap is breached, data-returning tools refuse before doing the
  // work — hard-killing the agent's spend at the boundary.
  const budget = new BudgetTracker({ caps: configState.budgetCaps });

  // Status snapshot writer — drives the VS Code extension status bar and any
  // future dashboard agent. Always on (writes to user config dir; payload has
  // no file paths or content).
  const statusWriter = new StatusFileWriter();
  function updateStatusFile(): void {
    const snapshot = counter.snapshot();
    const dollars = configState.features.showDollarValues
      ? tokensToDollars(snapshot.tokensSaved, configState.modelPricing, 'input')
      : 0;
    const bs = budget.snapshot();
    const includeBudget =
      bs.perSessionTokens !== undefined || bs.perDayTokens !== undefined || bs.dayUsed > 0;
    statusWriter.update({
      ts: Date.now(),
      tokensSaved: snapshot.tokensSaved,
      operations: snapshot.operations,
      frameworks: context.detectedFrameworks,
      packs: context.activePacks.map((p) => p.id),
      dollarsSaved: dollars,
      rootDir: context.rootDir,
      ...(includeBudget
        ? {
            budget: {
              sessionUsed: bs.sessionUsed,
              dayUsed: bs.dayUsed,
              perSessionTokens: bs.perSessionTokens,
              perDayTokens: bs.perDayTokens,
              exceeded: bs.exceeded,
            },
          }
        : {}),
    });
  }
  updateStatusFile();
  function budgetGuard(tool: string, t0: number): { isError: true; content: { type: 'text'; text: string }[] } | undefined {
    const reason = budget.reasonIfExceeded();
    if (!reason) return undefined;
    recordToolEvent(tool, t0, 0, false, 'budget_exceeded');
    return {
      isError: true,
      content: [{ type: 'text', text: `Refused: ${reason}. Reset with budget_reset or raise the cap in .optimizerrc.json.` }],
    };
  }

  server.registerTool(
    'optimized_read_file',
    {
      title: 'Read file (token-optimized)',
      description: [
        'Read a file from the workspace with framework-aware filtering.',
        'Skips files matching framework ignore patterns or .gitignore.',
        'Use this instead of the built-in Read tool to reduce token usage.',
        'Optionally pass startLine/endLine (1-indexed, inclusive) to read only a slice.',
        `Detected frameworks: ${detectedSummary}${gitignoreNote}`,
      ].join(' '),
      inputSchema: {
        path: z.string().describe('Path to the file, relative to the project root'),
        startLine: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('1-indexed start line (inclusive)'),
        endLine: z.number().int().positive().optional().describe('1-indexed end line (inclusive)'),
      },
    },
    async ({ path, startLine, endLine }) => {
      const t0 = Date.now();
      const blocked = budgetGuard('optimized_read_file', t0);
      if (blocked) return blocked;
      // Team-tier audit: enforce policy BEFORE reading. Failed checks log
      // a blocked entry so the audit trail captures the attempt itself.
      if (audit) {
        const check = audit.checkPath(path, 'optimized_read_file');
        if (!check.allowed) {
          audit.log({
            ts: Date.now(),
            tool: 'optimized_read_file',
            path,
            tokensReturned: 0,
            redactionsByKind: {},
            allowed: false,
            blockedReason: check.reason,
          });
          recordToolEvent('optimized_read_file', t0, 0, false, 'audit_blocked');
          return {
            isError: true,
            content: [
              { type: 'text', text: `Blocked by audit policy: ${check.reason ?? 'denied'}` },
            ],
          };
        }
      }

      const result = await interceptor.readFile(path, { startLine, endLine });
      let displayContent = result.content;
      let redactionsByKind: Record<string, number> = {};
      if (audit && !result.skipped && displayContent.length > 0) {
        const r = audit.redactContent(displayContent);
        displayContent = r.redacted;
        redactionsByKind = Object.fromEntries(r.replacements.map((x) => [x.kind, x.count]));
      }
      audit?.log({
        ts: Date.now(),
        tool: 'optimized_read_file',
        path,
        tokensReturned: result.estimatedTokens,
        redactionsByKind,
        allowed: true,
      });

      const redactionNote =
        Object.keys(redactionsByKind).length > 0
          ? `\n[audit] redactions: ${JSON.stringify(redactionsByKind)}`
          : '';
      const text = result.skipped
        ? `[skipped] ${result.reason ?? ''}\nEstimated tokens saved: ${formatTokensWithDollars(result.estimatedTokensSaved, configState)}`
        : `${displayContent}\n\n---\nEstimated tokens used: ${result.estimatedTokens}, saved: ${formatTokensWithDollars(result.estimatedTokensSaved, configState)}${redactionNote}`;
      budget.consume(result.estimatedTokens);
      recordToolEvent('optimized_read_file', t0, result.estimatedTokensSaved, true);
      updateStatusFile();
      return { content: [{ type: 'text', text }] };
    },
  );

  server.registerTool(
    'optimized_list_files',
    {
      title: 'List files (token-optimized)',
      description: [
        'List files in a directory with framework-aware ignore filtering.',
        'Skips node_modules, .venv, build/, dist/, generated files, etc.',
        'Optionally pass a glob pattern to narrow results.',
        `Detected frameworks: ${detectedSummary}${gitignoreNote}`,
      ].join(' '),
      inputSchema: {
        directory: z.string().default('.').describe('Directory to list, relative to project root'),
        pattern: z
          .string()
          .optional()
          .describe('Optional glob pattern to filter results, e.g. "**/*.ts"'),
      },
    },
    async ({ directory, pattern }) => {
      const t0 = Date.now();
      const blocked = budgetGuard('optimized_list_files', t0);
      if (blocked) return blocked;
      const result = await interceptor.listFiles(directory, { pattern });
      const text = [
        `Listed ${result.paths.length} files (filtered ${result.totalFiltered} of ${result.totalScanned} scanned).`,
        `Estimated tokens saved by filtering: ${formatTokensWithDollars(result.estimatedTokensSaved, configState)}`,
        '',
        ...result.paths,
      ].join('\n');
      budget.consume(counter.estimateTokens(text));
      recordToolEvent('optimized_list_files', t0, result.estimatedTokensSaved, true);
      updateStatusFile();
      return { content: [{ type: 'text', text }] };
    },
  );

  server.registerTool(
    'optimized_grep',
    {
      title: 'Grep across files (token-optimized)',
      description: [
        'Search file contents for a regex, scoped by directory and optional file glob, applying framework-aware ignore filters.',
        'Skips files larger than 2MB and caps at 100 matches.',
        `Detected frameworks: ${detectedSummary}${gitignoreNote}`,
      ].join(' '),
      inputSchema: {
        pattern: z.string().describe('Regex pattern to search for'),
        directory: z
          .string()
          .default('.')
          .describe('Directory to search, relative to project root'),
        flags: z.string().optional().describe('Regex flags, e.g. "i" for case-insensitive'),
        filePattern: z
          .string()
          .optional()
          .describe('Optional glob pattern to filter files, e.g. "**/*.ts"'),
      },
    },
    async ({ pattern, directory, flags, filePattern }) => {
      const t0 = Date.now();
      const blocked = budgetGuard('optimized_grep', t0);
      if (blocked) return blocked;
      try {
        const result = await interceptor.grep(pattern, { directory, flags, filePattern });
        const truncatedNote = result.truncated ? ' (truncated at 100)' : '';
        const lines = [
          `Found ${result.matches.length} matches across ${result.filesSearched} files${truncatedNote}.`,
          `Estimated tokens saved: ${formatTokensWithDollars(result.estimatedTokensSaved, configState)}`,
          '',
          ...result.matches.map((m) => `${m.path}:${m.line}: ${m.text}`),
        ];
        const text = lines.join('\n');
        budget.consume(counter.estimateTokens(text));
        recordToolEvent('optimized_grep', t0, result.estimatedTokensSaved, true);
        updateStatusFile();
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        const msg = (err as Error).message;
        const cat = /regex|invalid|syntax/i.test(msg) ? 'regex_invalid' : 'io_error';
        recordToolEvent('optimized_grep', t0, 0, false, cat);
        return {
          isError: true,
          content: [{ type: 'text', text: `Error: ${msg}` }],
        };
      }
    },
  );

  if (lsp) {
    server.registerTool(
      'optimized_diagnostics',
      {
        title: 'Get LSP diagnostics for a file (token-optimized)',
        description: [
          'Returns errors and warnings from the language server for a single file, plus narrow code slices around each diagnostic.',
          'Use this BEFORE calling optimized_read_file when the agent is trying to fix an error — it returns ~10 lines of context around each issue instead of the whole file.',
          `Detected frameworks: ${detectedSummary}${gitignoreNote}`,
        ].join(' '),
        inputSchema: {
          path: z.string().describe('Path to the file, relative to project root'),
          contextLines: z
            .number()
            .int()
            .min(0)
            .max(50)
            .optional()
            .describe('Lines of context around each diagnostic (default 10)'),
        },
      },
      async ({ path, contextLines }) => {
        const t0 = Date.now();
        const blocked = budgetGuard('optimized_diagnostics', t0);
        if (blocked) return blocked;
        try {
          if (!lsp.hasServerFor(path)) {
            recordToolEvent('optimized_diagnostics', t0, 0, true, 'no_lsp_server');
            return {
              content: [
                {
                  type: 'text',
                  text: `No LSP server registered for this file extension. Falling back to optimized_read_file is recommended.`,
                },
              ],
            };
          }
          const result = await lsp.errorContext(path, {
            contextLines,
            estimateTokens: (s) => counter.estimateTokens(s),
          });
          counter.record(result.estimatedTokensSaved);
          if (result.diagnostics.length === 0) {
            recordToolEvent('optimized_diagnostics', t0, result.estimatedTokensSaved, true);
            return {
              content: [
                {
                  type: 'text',
                  text: `No diagnostics for ${result.filePath}. File has ${result.fullLineCount} lines.`,
                },
              ],
            };
          }
          const lines = [
            `${result.diagnostics.length} diagnostic(s) in ${result.filePath} (${result.fullLineCount} lines, returning ${result.contextLineCount} lines of context).`,
            `Estimated tokens saved vs full read: ${formatTokensWithDollars(result.estimatedTokensSaved, configState)}`,
            '',
            ...result.diagnostics.map(
              (d) =>
                `[${d.severity}] L${d.line}:${d.character + 1} ${d.source ? `(${d.source}${d.code ? ` ${d.code}` : ''}) ` : ''}${d.message}`,
            ),
            '',
            ...result.slices.flatMap((s) => [`--- L${s.startLine}-${s.endLine} ---`, s.text]),
          ];
          const text = lines.join('\n');
          budget.consume(counter.estimateTokens(text));
          recordToolEvent('optimized_diagnostics', t0, result.estimatedTokensSaved, true);
          updateStatusFile();
          return { content: [{ type: 'text', text }] };
        } catch (err) {
          recordToolEvent('optimized_diagnostics', t0, 0, false, 'lsp_error');
          return {
            isError: true,
            content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
          };
        }
      },
    );

    server.registerTool(
      'read_symbol',
      {
        title: 'Read a symbol body via LSP (no whole-file read)',
        description: [
          'Resolves a symbol name (e.g. "UserRepository.getUser", "users::repository::get") via the language server\'s workspace/symbol API and returns just the symbol body.',
          'Use this when you need a function or class definition but not the rest of the file. Falls back to no-match when the LSP can\'t resolve the symbol.',
          `Detected frameworks: ${detectedSummary}${gitignoreNote}`,
        ].join(' '),
        inputSchema: {
          query: z
            .string()
            .min(1)
            .describe('Symbol name, optionally container-qualified (Foo.bar / Foo::bar / Foo#bar)'),
          contextLines: z
            .number()
            .int()
            .min(0)
            .max(50)
            .optional()
            .describe('Lines of context to include before + after each symbol body'),
          includeImports: z
            .boolean()
            .optional()
            .describe('Prepend leading imports / package / use lines from the file'),
          maxMatches: z
            .number()
            .int()
            .min(1)
            .max(20)
            .optional()
            .describe('Cap on number of symbol matches returned (default 5)'),
        },
      },
      async ({ query, contextLines, includeImports, maxMatches }) => {
        const t0 = Date.now();
        const blocked = budgetGuard('read_symbol', t0);
        if (blocked) return blocked;
        try {
          const result = await lsp.readSymbol(query, {
            contextLines,
            includeImports,
            maxMatches,
          });
          counter.record(result.estimatedTokensSaved);
          if (result.matches.length === 0) {
            recordToolEvent('read_symbol', t0, 0, true, 'lsp_error');
            return {
              content: [
                {
                  type: 'text',
                  text: `No symbol matched "${query}". The LSP server may not have indexed this workspace yet, or the symbol does not exist.`,
                },
              ],
            };
          }
          const header = [
            `Found ${result.matches.length} match(es) for "${query}".`,
            `Estimated tokens saved vs full file reads: ${formatTokensWithDollars(result.estimatedTokensSaved, configState)}`,
            '',
          ];
          const body = result.matches.flatMap((m) => [
            `--- ${m.filePath} L${m.range.startLine}-${m.range.endLine}${
              m.containerName ? ` (in ${m.containerName})` : ''
            } [${m.kind}] ---`,
            m.text,
            '',
          ]);
          const text = [...header, ...body].join('\n');
          budget.consume(counter.estimateTokens(text));
          recordToolEvent('read_symbol', t0, result.estimatedTokensSaved, true);
          updateStatusFile();
          return { content: [{ type: 'text', text }] };
        } catch (err) {
          recordToolEvent('read_symbol', t0, 0, false, 'lsp_error');
          return {
            isError: true,
            content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
          };
        }
      },
    );
  }

  server.registerTool(
    'strip_bash_noise',
    {
      title: 'Strip noise from shell command output (token-optimized)',
      description: [
        'Removes ANSI color codes, npm/maven/gradle progress lines, JVM reflective-access warnings, and collapses carriage-return progress bars.',
        'Pass the raw stdout/stderr from a Bash tool call here BEFORE keeping it in context.',
      ].join(' '),
      inputSchema: {
        output: z.string().describe('Raw shell output to clean'),
      },
    },
    async ({ output }) => {
      const t0 = Date.now();
      const result = cleanBashOutput(output);
      counter.record(result.estimatedTokensSaved);
      const text = [
        `Removed ${result.removedLineCount} noise line(s). ${result.originalChars} -> ${result.cleanedChars} chars (~${formatTokensWithDollars(result.estimatedTokensSaved, configState)} tokens saved).`,
        '',
        result.cleaned,
      ].join('\n');
      recordToolEvent('strip_bash_noise', t0, result.estimatedTokensSaved, true);
      updateStatusFile();
      return { content: [{ type: 'text', text }] };
    },
  );

  if (options.proExtensions?.compactHistory) {
    const compactFn = options.proExtensions.compactHistory;
    server.registerTool(
      'compact_chat_history',
      {
        title: 'Compact chat history (Pro, token-optimized)',
        description: [
          'Compresses an earlier portion of a chat transcript into a structured summary, keeping the system prompt and the trailing N messages verbatim.',
          'Use BEFORE forwarding a long history back to the model so the older turns become a one-line topic summary instead of full text.',
          'Returns the compacted message array and an estimate of tokens saved.',
        ].join(' '),
        inputSchema: {
          messages: z
            .array(
              z.object({
                role: z.enum(['system', 'user', 'assistant', 'tool']),
                content: z.string(),
              }),
            )
            .describe('Full chat history to compact (oldest first)'),
          keepLastMessages: z
            .number()
            .int()
            .min(1)
            .max(50)
            .optional()
            .describe('How many trailing non-system messages to keep verbatim (default 6)'),
        },
      },
      async ({ messages, keepLastMessages }) => {
        const t0 = Date.now();
        const result = compactFn(messages, { keepLastMessages });
        counter.record(result.estimatedTokensSaved);
        const summary = [
          `Compacted ${result.summarizedMessageCount} of ${result.originalMessageCount} messages.`,
          `Tokens saved (estimate): ${formatTokensWithDollars(result.estimatedTokensSaved, configState)}`,
          '',
          JSON.stringify(result.compacted),
        ].join('\n');
        recordToolEvent('compact_chat_history', t0, result.estimatedTokensSaved, true);
        updateStatusFile();
        return { content: [{ type: 'text', text: summary }] };
      },
    );
  }

  if (scheduler) {
    server.registerTool(
      'schedule_task',
      {
        title: 'Schedule a task (Pro, cron-driven)',
        description: [
          'Queue a prompt for periodic dispatch to Claude Code in headless mode (`claude -p ...`).',
          'Cron expression uses the standard 5-field format: minute hour dom month dow.',
          'This tool is only registered when features.scheduling === true; enable via set_optimizer_config patch {features:{scheduling:true}} and restart the MCP server.',
          'Returns the task id and the ISO timestamp of the next fire.',
        ].join(' '),
        inputSchema: {
          cron: z.string().describe('Cron expression, e.g. "*/5 * * * *" or "0 9 * * 1-5"'),
          prompt: z.string().describe('Prompt forwarded to claude -p when the task fires'),
          label: z.string().optional().describe('Optional human-readable label'),
          agent: z
            .string()
            .optional()
            .describe('Optional Claude Code agent name passed via --agent'),
        },
      },
      async ({ cron, prompt, label, agent }) => {
        try {
          const r = scheduler.schedule({ cron, prompt, label, agent });
          return {
            content: [
              {
                type: 'text',
                text: `Scheduled task ${r.id}; next fire at ${r.nextFireAt}.`,
              },
            ],
          };
        } catch (err) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
          };
        }
      },
    );

    server.registerTool(
      'list_scheduled',
      {
        title: 'List scheduled tasks (Pro)',
        description: [
          'Returns active scheduled tasks with their cron expressions and next fire times.',
          'Only registered when features.scheduling === true.',
        ].join(' '),
        inputSchema: {},
      },
      async () => {
        const tasks = scheduler.list();
        if (tasks.length === 0) {
          return { content: [{ type: 'text', text: 'No scheduled tasks.' }] };
        }
        const lines = tasks.map((t) => {
          const labelPart = t.label ? ` "${t.label}"` : '';
          const lastPart = t.lastFiredAt ? ` (last: ${t.lastFiredAt})` : '';
          return `${t.id}${labelPart}: ${t.cron} → next ${t.nextFireAt}${lastPart} [fired ${t.fireCount}x]`;
        });
        return { content: [{ type: 'text', text: lines.join('\n') }] };
      },
    );

    server.registerTool(
      'cancel_scheduled',
      {
        title: 'Cancel a scheduled task (Pro)',
        description: [
          'Removes a scheduled task by id. Idempotent — returns whether a task was actually removed.',
          'Only registered when features.scheduling === true.',
        ].join(' '),
        inputSchema: {
          id: z.string().describe('Task id returned by schedule_task / list_scheduled'),
        },
      },
      async ({ id }) => {
        const removed = scheduler.cancel(id);
        return {
          content: [
            {
              type: 'text',
              text: removed ? `Cancelled ${id}.` : `No task with id ${id}.`,
            },
          ],
        };
      },
    );
  }

  server.registerTool(
    'get_optimizer_config',
    {
      title: 'Get optimizer config',
      description: [
        'Returns the merged effective configuration: defaults overridden by user-global config, then project .optimizerrc.json, then env vars.',
        'Use to check whether scheduling, work-stealing, telemetry, etc. are currently enabled.',
      ].join(' '),
      inputSchema: {},
    },
    async () => {
      return {
        content: [{ type: 'text', text: JSON.stringify(configState, null, 2) }],
      };
    },
  );

  server.registerTool(
    'set_optimizer_config',
    {
      title: 'Set optimizer config (writes to project .optimizerrc.json)',
      description: [
        'Writes a partial config patch to the project-level .optimizerrc.json (merging with whatever is already there).',
        'User-global config and env vars are NOT modified — those are managed out-of-band.',
        'Behavior-changing flags (scheduling, workStealing, telemetry) require explicit opt-in via this tool — they are off by default.',
      ].join(' '),
      inputSchema: {
        patch: z
          .object({
            features: z
              .object({
                lsp: z.boolean().optional(),
                bashCleaner: z.boolean().optional(),
                compactor: z.boolean().optional(),
                scheduling: z.boolean().optional(),
                workStealing: z.boolean().optional(),
                audit: z.boolean().optional(),
                showDollarValues: z.boolean().optional(),
              })
              .optional(),
            team: z
              .object({
                audit: z
                  .object({
                    logFile: z.string().optional(),
                    denyPaths: z.array(z.string()).optional(),
                    allowPaths: z.array(z.string()).optional(),
                    perToolDeny: z.record(z.string(), z.array(z.string())).optional(),
                    redactDisableKinds: z.array(z.string()).optional(),
                    rotateBytes: z.number().int().nonnegative().optional(),
                  })
                  .optional(),
              })
              .optional(),
            telemetry: z.enum(['off', 'opt-in', 'on']).optional(),
            modelPricing: z
              .object({
                inputPerMillion: z.number().nonnegative().optional(),
                outputPerMillion: z.number().nonnegative().optional(),
                modelLabel: z.string().optional(),
              })
              .optional(),
            budgetCaps: z
              .object({
                perSessionTokens: z.number().int().positive().optional(),
                perDayTokens: z.number().int().positive().optional(),
              })
              .optional(),
            extraIgnoreGlobs: z.array(z.string()).optional(),
          })
          .describe('Partial OptimizerConfig to merge into project config'),
      },
    },
    async ({ patch }) => {
      try {
        const path = writeProjectConfig(context.rootDir, patch as ConfigPatch);
        // Re-load so subsequent reads in this session reflect the change.
        // Some flags (LSP) are wired at startServer time and won't take effect until the
        // next process start — the response calls this out.
        configState = loadConfig({ rootDir: context.rootDir }).config;
        const restartNote =
          patch.features?.lsp !== undefined
            ? '\nNote: lsp toggle takes effect on next MCP server restart.'
            : '';
        return {
          content: [
            {
              type: 'text',
              text: `Wrote project config: ${path}${restartNote}\n\nEffective config now:\n${JSON.stringify(
                configState,
                null,
                2,
              )}`,
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
        };
      }
    },
  );

  server.registerTool(
    'budget_status',
    {
      title: 'Show conversation/day budget status',
      description: [
        'Reports the current per-session and per-day token consumption against configured caps.',
        'Caps are set via budgetCaps in .optimizerrc.json or AI_OPTIMIZER_BUDGET_PER_SESSION / AI_OPTIMIZER_BUDGET_PER_DAY env vars.',
        'When a cap is exceeded, optimized_read_file / list_files / grep / diagnostics refuse new calls until reset or until UTC midnight (day cap).',
      ].join(' '),
      inputSchema: {},
    },
    async () => {
      const s = budget.snapshot();
      const lines = [
        `Session used: ${s.sessionUsed}${s.perSessionTokens !== undefined ? ` / ${s.perSessionTokens}` : ' (no cap)'}`,
        `Day used (${s.dayKey} UTC): ${s.dayUsed}${s.perDayTokens !== undefined ? ` / ${s.perDayTokens}` : ' (no cap)'}`,
        s.exceeded ? `Status: EXCEEDED — ${s.exceededReason}` : 'Status: ok',
      ];
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  );

  server.registerTool(
    'budget_reset',
    {
      title: 'Reset budget counters',
      description:
        'Zeroes the per-session and per-day token counters. Use after intentionally clearing a budget breach.',
      inputSchema: {},
    },
    async () => {
      budget.reset();
      return { content: [{ type: 'text', text: 'Budget counters reset.' }] };
    },
  );

  server.registerTool(
    'optimizer_status',
    {
      title: 'Optimizer status',
      description:
        'Returns active framework packs, detected project type, gitignore status, and cumulative token savings for this session.',
      inputSchema: {},
    },
    async () => {
      const snapshot = counter.snapshot();
      const lines = [
        `Project root: ${context.rootDir}`,
        `Detected frameworks: ${detectedSummary}`,
        `Active packs: ${context.activePacks.map((p) => p.name).join(', ') || '(none)'}`,
        `.gitignore: ${context.gitignoreMatcher ? 'active' : 'not found'}`,
        `LSP bridge: ${lsp ? 'enabled' : 'disabled'}`,
        `Pro extensions: ${formatProExtensionList(options.proExtensions)}`,
        `Telemetry: ${configState.telemetry}`,
        `Scheduler: ${configState.features.scheduling ? 'enabled' : 'disabled (opt-in)'}`,
        `Work-stealing: ${configState.features.workStealing ? 'enabled' : 'disabled (opt-in)'}`,
        `Audit: ${audit ? `enabled (log: ${audit.describe().logFile ?? 'in-memory'})` : 'disabled (opt-in, Team)'}`,
        '',
        `Tokens saved this session: ${snapshot.tokensSaved}`,
      ];
      if (configState.features.showDollarValues) {
        const dollars = tokensToDollars(snapshot.tokensSaved, configState.modelPricing, 'input');
        lines.push(
          `≈ ${formatDollars(dollars)} saved (input tokens, ${configState.modelPricing.modelLabel})`,
        );
      }
      if (scheduler) {
        const status = scheduler.getStatus();
        if (status.queued > 0) {
          const labelPart = status.nextLabel ? ` "${status.nextLabel}"` : '';
          lines.push(
            `Queued tasks: ${status.queued} (next fires ${status.nextFireAt}${labelPart})`,
          );
        } else {
          lines.push('Queued tasks: 0');
        }
      }
      const bs = budget.snapshot();
      const sessionPart = bs.perSessionTokens !== undefined ? ` / ${bs.perSessionTokens}` : '';
      const dayPart = bs.perDayTokens !== undefined ? ` / ${bs.perDayTokens}` : '';
      if (bs.perSessionTokens !== undefined || bs.perDayTokens !== undefined || bs.dayUsed > 0) {
        lines.push(`Budget: session ${bs.sessionUsed}${sessionPart}, day ${bs.dayUsed}${dayPart}${bs.exceeded ? ' [EXCEEDED]' : ''}`);
      }
      lines.push(`Operations: ${snapshot.operations}`);
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  );

  function formatProExtensionList(ext?: ProExtensions): string {
    if (!ext) return 'none';
    const parts: string[] = [];
    if (ext.compactHistory) parts.push('compactor');
    if (ext.scheduler) parts.push('scheduler');
    if (ext.audit) parts.push('audit');
    return parts.length === 0 ? 'none' : parts.join(', ');
  }

  const transport = new StdioServerTransport();
  const shutdown = async (): Promise<void> => {
    try {
      await lsp?.shutdown();
    } catch {
      // ignore
    }
    try {
      await scheduler?.stop();
    } catch {
      // ignore
    }
    try {
      await telemetry?.shutdown();
    } catch {
      // ignore
    }
    try {
      statusWriter.shutdown();
    } catch {
      // ignore
    }
  };
  process.on('SIGINT', () => {
    void shutdown().then(() => process.exit(0));
  });
  process.on('SIGTERM', () => {
    void shutdown().then(() => process.exit(0));
  });
  await server.connect(transport);
}
