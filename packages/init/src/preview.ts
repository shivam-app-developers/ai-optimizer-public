import { promises as fs } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import {
  detectProject,
  loadFreePacks,
  Interceptor,
  SavingsCounter,
  loadConfig,
  tokensToDollars,
  formatDollars,
  type FrameworkPack,
  type ProjectContext,
} from '@ai-optimizer/core';

export interface PreviewResult {
  rootDir: string;
  detectedFrameworks: string[];
  activePackNames: string[];
  totalScanned: number;
  totalFiltered: number;
  estimatedTokensSaved: number;
  dollarsSaved: number;
  dollarsSavedFormatted: string;
  modelLabel: string;
  gitignoreActive: boolean;
}

export interface ComputePreviewOptions {
  rootDir: string;
  /** Override the framework packs (used by tests). */
  packs?: FrameworkPack[];
}

/**
 * Walks the repo at rootDir, applies all detected free framework packs +
 * .gitignore, and returns the savings preview the init CLI shows the user.
 *
 * "Savings" here is "tokens we'd avoid sending into the agent on a single
 * full project scan" — the same number the live MCP server's
 * optimized_list_files reports. It's a reasonable per-session proxy.
 */
export async function computePreview(opts: ComputePreviewOptions): Promise<PreviewResult> {
  const packs = opts.packs ?? loadFreePacks();
  const context: ProjectContext = await detectProject(opts.rootDir, packs);
  const counter = new SavingsCounter();
  const interceptor = new Interceptor(context, counter);

  const stats = await deepWalk(context.rootDir, interceptor, counter);

  const cfg = loadConfig({ rootDir: opts.rootDir }).config;
  const dollars = tokensToDollars(stats.estimatedTokensSaved, cfg.modelPricing, 'input');

  return {
    rootDir: context.rootDir,
    detectedFrameworks: context.detectedFrameworks,
    activePackNames: context.activePacks.map((p) => p.name),
    totalScanned: stats.totalScanned,
    totalFiltered: stats.totalFiltered,
    estimatedTokensSaved: stats.estimatedTokensSaved,
    dollarsSaved: dollars,
    dollarsSavedFormatted: formatDollars(dollars),
    modelLabel: cfg.modelPricing.modelLabel,
    gitignoreActive: Boolean(context.gitignoreMatcher),
  };
}

interface DeepWalkStats {
  totalScanned: number;
  totalFiltered: number;
  estimatedTokensSaved: number;
}

/**
 * Walks the entire tree (including into ignored directories) so the
 * preview can show the *real* saved-tokens number — i.e. the byte size
 * of every file we'd skip, not just the top-level dir entries. The live
 * MCP server's listFiles() stops at ignored dirs because that's what the
 * agent observes; the init preview wants the bigger underlying number.
 */
async function deepWalk(
  rootDir: string,
  interceptor: Interceptor,
  counter: SavingsCounter,
): Promise<DeepWalkStats> {
  const stats: DeepWalkStats = {
    totalScanned: 0,
    totalFiltered: 0,
    estimatedTokensSaved: 0,
  };
  await walkDir(rootDir, rootDir, interceptor, counter, stats, false);
  return stats;
}

async function walkDir(
  rootDir: string,
  dir: string,
  interceptor: Interceptor,
  counter: SavingsCounter,
  stats: DeepWalkStats,
  inIgnored: boolean,
): Promise<void> {
  let items;
  try {
    items = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const item of items) {
    const full = resolve(dir, item.name);
    const rel = relative(rootDir, full).split(sep).join('/');
    const isIgnoredHere = inIgnored || interceptor.isIgnored(rel);

    if (item.isDirectory()) {
      // Skip the .git directory entirely — its contents are noise even on
      // an "honest preview" (millions of objects, not user-visible).
      if (item.name === '.git' && !inIgnored) continue;
      stats.totalScanned += 1;
      if (isIgnoredHere) stats.totalFiltered += 1;
      await walkDir(rootDir, full, interceptor, counter, stats, isIgnoredHere);
      continue;
    }
    if (!item.isFile()) continue;
    stats.totalScanned += 1;
    if (!isIgnoredHere) continue;

    stats.totalFiltered += 1;
    try {
      const stat = await fs.stat(full);
      stats.estimatedTokensSaved += counter.estimateTokensFromBytes(stat.size);
    } catch {
      // ignore unreadable entries
    }
  }
}

export function formatPreviewLines(p: PreviewResult): string[] {
  const lines: string[] = [];
  lines.push(`Project: ${p.rootDir}`);
  lines.push(
    `Detected frameworks: ${p.detectedFrameworks.length ? p.detectedFrameworks.join(', ') : 'none'}`,
  );
  lines.push(`Active packs: ${p.activePackNames.length ? p.activePackNames.join(', ') : 'none'}`);
  lines.push(`.gitignore: ${p.gitignoreActive ? 'active' : 'not found'}`);
  lines.push('');
  lines.push(
    `Would skip ${formatNumber(p.totalFiltered)} of ${formatNumber(p.totalScanned)} files / dirs.`,
  );
  lines.push(
    `Estimated tokens kept out of context: ~${formatNumber(p.estimatedTokensSaved)} (${p.dollarsSavedFormatted} at ${p.modelLabel} input pricing if the agent tried to ingest the full repo).`,
  );
  return lines;
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}
