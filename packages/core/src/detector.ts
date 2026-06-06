import type { FrameworkPack, ProjectContext } from './types.js';
import { loadGitignoreMatcher } from './gitignore.js';
import { detectMonorepoLayout, scopePackToPrefix } from './monorepo.js';

export interface DetectOptions {
  /**
   * Walk top-level subdirs (and one level inside `packages/`, `apps/`, etc.)
   * looking for additional packs whose ignore globs should be scoped to
   * those prefixes. Defaults to `true` — single-rooted projects pay only
   * one extra readdir for this.
   */
  monorepo?: boolean;
}

export async function detectProject(
  rootDir: string,
  availablePacks: FrameworkPack[],
  opts: DetectOptions = {},
): Promise<ProjectContext> {
  const detectedFrameworks: string[] = [];
  const activePacks: FrameworkPack[] = [];

  if (opts.monorepo === false) {
    for (const pack of availablePacks) {
      if (await pack.detect(rootDir)) {
        detectedFrameworks.push(pack.id);
        activePacks.push(pack);
      }
    }
  } else {
    const layout = await detectMonorepoLayout(rootDir, availablePacks);
    for (const pack of layout.rootPacks) {
      detectedFrameworks.push(pack.id);
      activePacks.push(pack);
    }
    for (const { prefix, packs } of layout.subdirs) {
      for (const pack of packs) {
        const scoped = scopePackToPrefix(pack, prefix);
        detectedFrameworks.push(scoped.id);
        activePacks.push(scoped);
      }
    }
  }

  const gitignoreMatcher = loadGitignoreMatcher(rootDir);

  return { rootDir, detectedFrameworks, activePacks, gitignoreMatcher };
}
