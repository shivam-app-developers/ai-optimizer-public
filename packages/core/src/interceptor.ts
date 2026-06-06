import { promises as fs, statSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import picomatch from 'picomatch';
import type {
  GrepMatch,
  GrepResult,
  ListFilesResult,
  ProjectContext,
  ReadFileResult,
} from './types.js';
import type { SavingsCounter } from './counter.js';

const GREP_MAX_MATCHES = 100;
const GREP_LINE_PREVIEW_CHARS = 200;
const GREP_MAX_FILE_BYTES = 2_000_000;

export interface ListFilesOptions {
  pattern?: string;
}

export interface GrepOptions {
  directory?: string;
  flags?: string;
  filePattern?: string;
}

export class Interceptor {
  private packMatcher: (path: string) => boolean;

  constructor(
    private context: ProjectContext,
    private counter: SavingsCounter,
  ) {
    const allGlobs = context.activePacks.flatMap((p) => p.ignoreGlobs);
    this.packMatcher = allGlobs.length > 0 ? picomatch(allGlobs, { dot: true }) : () => false;
  }

  isIgnored(relPath: string): boolean {
    const posix = toPosix(relPath);
    if (!posix || posix === '.') return false;
    if (this.context.gitignoreMatcher?.(posix)) return true;
    return this.packMatcher(posix);
  }

  async readFile(
    path: string,
    opts?: { startLine?: number; endLine?: number },
  ): Promise<ReadFileResult> {
    const absPath = resolve(this.context.rootDir, path);
    const relPath = relative(this.context.rootDir, absPath);

    if (this.isIgnored(relPath)) {
      const saved = this.estimateFileTokensFromDisk(absPath);
      this.counter.record(saved);
      return {
        path,
        content: '',
        skipped: true,
        reason: `Skipped — matches framework or gitignore pattern (frameworks: ${
          this.context.detectedFrameworks.join(', ') || 'none'
        })`,
        estimatedTokens: 0,
        estimatedTokensSaved: saved,
      };
    }

    const fullContent = await fs.readFile(absPath, 'utf-8');

    if (opts?.startLine !== undefined || opts?.endLine !== undefined) {
      const allLines = fullContent.split('\n');
      const start = Math.max(1, opts.startLine ?? 1);
      const end = Math.min(allLines.length, opts.endLine ?? allLines.length);
      const slice = allLines.slice(start - 1, end);
      const content = slice.join('\n');
      const saved = this.counter.estimateTokens(fullContent) - this.counter.estimateTokens(content);
      this.counter.record(saved);
      return {
        path,
        content,
        skipped: false,
        estimatedTokens: this.counter.estimateTokens(content),
        estimatedTokensSaved: saved,
      };
    }

    return {
      path,
      content: fullContent,
      skipped: false,
      estimatedTokens: this.counter.estimateTokens(fullContent),
      estimatedTokensSaved: 0,
    };
  }

  async listFiles(directory: string, opts?: ListFilesOptions): Promise<ListFilesResult> {
    const absDir = resolve(this.context.rootDir, directory);
    const result: ListFilesResult = {
      paths: [],
      totalScanned: 0,
      totalFiltered: 0,
      estimatedTokensSaved: 0,
    };
    const patternMatcher = opts?.pattern ? picomatch(opts.pattern, { dot: true }) : undefined;
    await this.walk(absDir, result, patternMatcher);
    this.counter.record(result.estimatedTokensSaved);
    return result;
  }

  async grep(pattern: string, opts?: GrepOptions): Promise<GrepResult> {
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, opts?.flags ?? '');
    } catch (err) {
      throw new Error(`Invalid regex: ${(err as Error).message}`);
    }

    const directory = opts?.directory ?? '.';
    const filePatternMatcher = opts?.filePattern
      ? picomatch(opts.filePattern, { dot: true })
      : undefined;

    const listing = await this.listFiles(directory, { pattern: opts?.filePattern });
    const matches: GrepMatch[] = [];
    let filesSearched = 0;
    let estimatedSaved = 0;
    let truncated = false;

    for (const path of listing.paths) {
      if (filePatternMatcher && !filePatternMatcher(toPosix(path))) continue;

      const absPath = resolve(this.context.rootDir, path);
      let stats;
      try {
        stats = statSync(absPath);
      } catch {
        continue;
      }
      if (stats.size > GREP_MAX_FILE_BYTES) {
        estimatedSaved += this.counter.estimateTokensFromBytes(stats.size);
        continue;
      }

      let content: string;
      try {
        content = await fs.readFile(absPath, 'utf-8');
      } catch {
        continue;
      }
      filesSearched += 1;
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === undefined) continue;
        if (regex.test(line)) {
          matches.push({
            path,
            line: i + 1,
            text:
              line.length > GREP_LINE_PREVIEW_CHARS
                ? line.slice(0, GREP_LINE_PREVIEW_CHARS) + '…'
                : line,
          });
          if (matches.length >= GREP_MAX_MATCHES) {
            truncated = true;
            break;
          }
        }
      }
      if (truncated) break;
    }

    estimatedSaved += listing.estimatedTokensSaved;
    this.counter.record(estimatedSaved);

    return {
      matches,
      filesSearched,
      truncated,
      estimatedTokensSaved: estimatedSaved,
    };
  }

  private async walk(
    dir: string,
    result: ListFilesResult,
    patternMatcher?: (path: string) => boolean,
  ): Promise<void> {
    let items;
    try {
      items = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      const full = resolve(dir, item.name);
      const rel = relative(this.context.rootDir, full);
      const relPosix = toPosix(rel);
      result.totalScanned += 1;
      if (this.isIgnored(rel)) {
        result.totalFiltered += 1;
        result.estimatedTokensSaved += 5;
        continue;
      }
      if (item.isDirectory()) {
        await this.walk(full, result, patternMatcher);
      } else {
        if (!patternMatcher || patternMatcher(relPosix)) {
          result.paths.push(rel);
        }
      }
    }
  }

  private estimateFileTokensFromDisk(absPath: string): number {
    try {
      return this.counter.estimateTokensFromBytes(statSync(absPath).size);
    } catch {
      return 1000;
    }
  }
}

function toPosix(p: string): string {
  return p.split(sep).join('/').split('\\').join('/');
}
