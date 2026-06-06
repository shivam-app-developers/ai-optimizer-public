import { resolve } from 'node:path';
import { writeProjectConfig } from '@ai-optimizer/core';
import { findContextModeConfig, parseContextModeFile } from './parser.js';
import { translate } from './translator.js';

export interface CliOptions {
  rootDir: string;
  inputPath?: string;
  dryRun: boolean;
}

export function parseArgs(argv: string[]): CliOptions {
  let rootDir = process.cwd();
  let inputPath: string | undefined;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root' && argv[i + 1]) {
      rootDir = resolve(argv[++i] as string);
    } else if (a === '--input' && argv[i + 1]) {
      inputPath = resolve(argv[++i] as string);
    } else if (a === '--dry-run' || a === '--preview-only') {
      dryRun = true;
    } else if (a === '-h' || a === '--help') {
      printHelp();
      process.exit(0);
    }
  }
  return { rootDir, inputPath, dryRun };
}

function printHelp(): void {
  process.stdout.write(
    [
      'Usage: ai-optimizer-import-context-mode [--root <dir>] [--input <file>] [--dry-run]',
      '',
      'Reads a context-mode config from the project root (or --input <file>),',
      'translates it into an ai-optimizer config patch, and merges that patch into',
      '.optimizerrc.json. Pass --dry-run to print the patch without writing.',
      '',
      'Recognised context-mode files (auto-discovery, in order):',
      '  .contextmode.json',
      '  .contextmode.yml / .contextmode.yaml',
      '  contextmode.config.json',
      '  .context-mode.json',
      '  context-mode.json',
      '',
    ].join('\n'),
  );
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const opts = parseArgs(argv);
  const inputPath = opts.inputPath ?? findContextModeConfig(opts.rootDir);
  if (!inputPath) {
    process.stderr.write(
      `[import] No context-mode config found in ${opts.rootDir} — pass --input <file> if it lives elsewhere.\n`,
    );
    return 1;
  }

  let cfg;
  try {
    cfg = parseContextModeFile(inputPath);
  } catch (err) {
    process.stderr.write(`[import] ${(err as Error).message}\n`);
    return 1;
  }

  const { patch, notes } = translate(cfg);

  process.stdout.write(`[import] Source:  ${inputPath}\n`);
  process.stdout.write(`[import] Target:  ${opts.rootDir}/.optimizerrc.json\n\n`);
  for (const n of notes) process.stdout.write(`  - ${n}\n`);
  process.stdout.write(`\n[import] Patch to merge:\n${JSON.stringify(patch, null, 2)}\n`);

  if (opts.dryRun) {
    process.stdout.write('\n[import] --dry-run set — not writing.\n');
    return 0;
  }

  if (Object.keys(patch).length === 0) {
    process.stdout.write('\n[import] Patch is empty — nothing to write.\n');
    return 0;
  }

  const written = writeProjectConfig(opts.rootDir, patch);
  process.stdout.write(`\n[import] Wrote ${written}.\n`);
  return 0;
}
