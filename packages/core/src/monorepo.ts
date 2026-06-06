import { readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import type { FrameworkPack } from './types.js';

const MONOREPO_PARENT_DIRS = ['packages', 'apps', 'services', 'crates', 'modules', 'libs'];

const SKIP_DIRS = new Set([
  'node_modules',
  'target',
  'build',
  'dist',
  'out',
  '.git',
  '.venv',
  'venv',
  'vendor',
  '.next',
  '.nuxt',
  '__pycache__',
]);

export interface MonorepoLayout {
  rootPacks: FrameworkPack[];
  /** Each subdir entry detected at least one pack that wasn't already active at the root. */
  subdirs: { prefix: string; packs: FrameworkPack[] }[];
}

/**
 * Walk the immediate children of `rootDir` (and one level deeper inside the
 * common monorepo parents — `packages/`, `apps/`, etc.) running each pack's
 * detector. Subdir hits are reported separately from root hits so callers
 * can scope the pack's ignore globs to the matching prefix.
 *
 * Pure detection — no IO mutation, no globbing, no walking arbitrary depth.
 */
export async function detectMonorepoLayout(
  rootDir: string,
  availablePacks: FrameworkPack[],
): Promise<MonorepoLayout> {
  const rootPacks: FrameworkPack[] = [];
  for (const pack of availablePacks) {
    if (await pack.detect(rootDir)) rootPacks.push(pack);
  }

  const subdirs: MonorepoLayout['subdirs'] = [];
  for (const sub of collectCandidateSubdirs(rootDir)) {
    const subPath = join(rootDir, sub);
    const matched: FrameworkPack[] = [];
    for (const pack of availablePacks) {
      // Don't double-count a pack that's already active at the root — its
      // globs already cover the entire tree.
      if (rootPacks.includes(pack)) continue;
      if (await pack.detect(subPath)) matched.push(pack);
    }
    if (matched.length > 0) {
      subdirs.push({ prefix: toPosix(sub), packs: matched });
    }
  }

  return { rootPacks, subdirs };
}

/**
 * Wrap a pack so its ignore globs match only paths under `prefix`. Globs
 * already starting with `**\/` are global and pass through unchanged; absolute
 * patterns lose their leading slash before being prefixed.
 */
export function scopePackToPrefix(pack: FrameworkPack, prefix: string): FrameworkPack {
  const cleanPrefix = prefix.replace(/\/+$/, '');
  return {
    id: `${pack.id}@${cleanPrefix}`,
    name: `${pack.name} (${cleanPrefix})`,
    detect: pack.detect,
    ignoreGlobs: pack.ignoreGlobs.map((g) => prefixGlob(g, cleanPrefix)),
    generatedFilePatterns: pack.generatedFilePatterns,
    contextHints: pack.contextHints,
  };
}

function prefixGlob(glob: string, prefix: string): string {
  if (glob.startsWith('**/')) return glob;
  const stripped = glob.startsWith('/') ? glob.slice(1) : glob;
  return `${prefix}/${stripped}`;
}

function collectCandidateSubdirs(rootDir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(rootDir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name.startsWith('.')) continue;
    if (SKIP_DIRS.has(name)) continue;
    const full = join(rootDir, name);
    if (!isDir(full)) continue;
    if (MONOREPO_PARENT_DIRS.includes(name)) {
      let inner: string[];
      try {
        inner = readdirSync(full);
      } catch {
        continue;
      }
      for (const sub of inner) {
        if (sub.startsWith('.')) continue;
        if (SKIP_DIRS.has(sub)) continue;
        const subPath = join(full, sub);
        if (isDir(subPath)) out.push(`${name}/${sub}`);
      }
    } else {
      out.push(name);
    }
  }
  return out;
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function toPosix(p: string): string {
  return p.split(sep).join('/').split('\\').join('/');
}
