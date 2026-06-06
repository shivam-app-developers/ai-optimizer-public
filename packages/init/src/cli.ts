import { resolve } from 'node:path';
import { writeUserConfig, loadConfig } from '@ai-optimizer/core';
import { computePreview, formatPreviewLines } from './preview.js';
import { applyMcpConfig, type ApplyOutcome } from './writer.js';
import { confirm } from './prompt.js';
import { planTargets, KNOWN_MANUAL_AGENTS, type AgentTarget } from './agents.js';

export interface CliOptions {
  rootDir: string;
  yes: boolean;
  no: boolean;
  preview: boolean;
}

export function parseArgs(argv: string[]): CliOptions {
  let rootDir = process.cwd();
  let yes = false;
  let no = false;
  let preview = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root' && argv[i + 1]) {
      rootDir = resolve(argv[++i] as string);
    } else if (a === '--yes' || a === '-y') {
      yes = true;
    } else if (a === '--no') {
      no = true;
    } else if (a === '--preview-only' || a === '--dry-run') {
      preview = true;
    }
  }
  return { rootDir, yes, no, preview };
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const opts = parseArgs(argv);
  const out = process.stdout;
  out.write('ai-optimizer setup\n');
  out.write('==================\n\n');

  const preview = await computePreview({ rootDir: opts.rootDir });
  for (const line of formatPreviewLines(preview)) out.write(line + '\n');
  out.write('\n');

  if (opts.preview) {
    out.write('(--preview-only) Stopping before writing config.\n');
    return;
  }

  const targets = planTargets({ rootDir: opts.rootDir });
  out.write(`Plan: ${targets.length} agent target(s)\n`);
  for (const t of targets) {
    out.write(`  - ${t.displayName}: ${t.configPath}  (${t.reason})\n`);
  }
  out.write('\n');

  const preset = opts.yes ? true : opts.no ? false : undefined;
  const written: ApplyOutcome[] = [];
  for (const t of targets) {
    const ok = await confirm(`Install ai-optimizer in ${t.displayName}?`, {
      defaultYes: true,
      preset,
    });
    if (!ok) {
      out.write(`  ${t.displayName}: skipped.\n`);
      continue;
    }
    const r = applyMcpConfig(t.configPath);
    written.push(r);
    out.write(`  ${t.displayName}: ${describeOutcome(r, t)}\n`);
  }
  out.write('\n');

  if (written.length === 0) {
    out.write('No changes written. Re-run with `--yes` to install in all detected targets.\n');
  } else {
    out.write(
      `Configured ${written.length} target(s). Restart your agent to load the MCP server.\n`,
    );
  }

  // Telemetry first-run prompt — only shown when the user-global config has
  // not yet recorded a choice. Keeping this off the per-target loop because
  // it's a one-time decision, not per-install.
  await maybePromptTelemetry(out, preset);

  out.write('\nManual setup needed for these agents (we do not autoconfigure them):\n');
  for (const a of KNOWN_MANUAL_AGENTS) {
    out.write(`  - ${a.name}: ${a.configHint}\n`);
  }

  out.write(
    '\nPro packs: set AI_OPTIMIZER_LICENSE in your shell or in the env block of the MCP config to enable.\n',
  );
}

async function maybePromptTelemetry(
  out: NodeJS.WriteStream,
  preset: boolean | undefined,
): Promise<void> {
  // Skip if the user has already recorded a choice (telemetry is on or off
  // in their user-global config). Default 'opt-in' + no user config = first run.
  const { config, sources } = loadConfig();
  if (config.telemetry !== 'opt-in' && sources.userConfigPath) return;

  out.write('\nAnonymous usage stats?\n');
  out.write(
    '  We collect framework ids, pack ids, tokens-saved counts, and an anonymous\n' +
      '  install UUID. We never collect file paths, file contents, prompts, or repo\n' +
      '  names. You can change this any time via set_optimizer_config.\n',
  );

  // Privacy decisions never auto-yes. In non-interactive mode (--yes / --no /
  // not a TTY), we default to OFF and tell the user how to opt in later.
  let chosen: boolean;
  const interactive = preset === undefined && process.stdin.isTTY;
  if (interactive) {
    chosen = await confirm('Send anonymous usage stats?', { defaultYes: false });
  } else {
    chosen = false;
  }
  try {
    writeUserConfig({ telemetry: chosen ? 'on' : 'off' });
    if (interactive) {
      out.write(`  Telemetry: ${chosen ? 'on' : 'off'} (saved to user-global config).\n`);
    } else {
      out.write(
        '  Telemetry: off (default in non-interactive mode). To opt in: set telemetry=on via set_optimizer_config or AI_OPTIMIZER_TELEMETRY=on.\n',
      );
    }
  } catch (err) {
    out.write(`  Telemetry: could not write user config (${(err as Error).message}).\n`);
  }
}

function describeOutcome(r: ApplyOutcome, t: AgentTarget): string {
  if (r.action === 'created') return `created ${t.configPath}`;
  if (r.action === 'unchanged') return `${t.configPath} already had the same entry`;
  return r.beforeHadServer
    ? `updated ai-optimizer entry in ${t.configPath}`
    : `added ai-optimizer to ${t.configPath}`;
}
