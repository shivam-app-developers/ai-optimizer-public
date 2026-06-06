import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const ignoreFactory = require('ignore') as () => {
  add: (patterns: string) => { add: unknown; ignores: (path: string) => boolean };
  ignores: (path: string) => boolean;
};

export type IgnoreCheck = (relPath: string) => boolean;

export function loadGitignoreMatcher(rootDir: string): IgnoreCheck | undefined {
  const gitignorePath = join(rootDir, '.gitignore');
  if (!existsSync(gitignorePath)) return undefined;

  try {
    const content = readFileSync(gitignorePath, 'utf-8');
    const ig = ignoreFactory();
    ig.add(content);
    ig.add('.git');
    return (relPath) => {
      if (!relPath || relPath === '.') return false;
      return ig.ignores(toPosix(relPath));
    };
  } catch {
    return undefined;
  }
}

function toPosix(p: string): string {
  return p.split('\\').join('/');
}
