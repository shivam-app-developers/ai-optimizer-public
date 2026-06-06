export type SymbolKind =
  | 'class'
  | 'function'
  | 'method'
  | 'variable'
  | 'interface'
  | 'enum'
  | 'struct'
  | 'constructor'
  | 'property'
  | 'other';

export interface SymbolMatch {
  name: string;
  containerName?: string;
  filePath: string;
  /** 1-based, inclusive. */
  range: { startLine: number; endLine: number };
  kind: SymbolKind;
}

export interface SymbolFinder {
  workspaceSymbol(name: string): Promise<SymbolMatch[]>;
}

export interface SymbolQuery {
  name: string;
  container?: string;
}

/**
 * Parse "UserRepository.getUser", "UserRepository::getUser",
 * "UserRepository#getUser" or plain "getUser" into a structured query.
 * The container can itself be dotted ("foo.bar.Baz.method").
 */
export function parseSymbolQuery(input: string): SymbolQuery {
  const trimmed = input.trim();
  const parts = trimmed.split(/[.:#]+/).filter((p) => p.length > 0);
  if (parts.length === 0) return { name: '' };
  if (parts.length === 1) return { name: parts[0]! };
  return { container: parts.slice(0, -1).join('.'), name: parts[parts.length - 1]! };
}

/**
 * Filter `matches` against a parsed query. Exact-name matches are preferred
 * over fuzzy ones; when a container is specified we only return matches
 * whose `containerName` equals it (or is the trailing segment of it, since
 * LSPs often return only the immediate parent class without the full path).
 *
 * Falls back to the unfiltered exact matches when the container filter
 * eliminates everything — better to show the wrong class than nothing.
 */
export function pickMatches(matches: SymbolMatch[], query: SymbolQuery): SymbolMatch[] {
  const exact = matches.filter((m) => m.name === query.name);
  if (!query.container) return exact;
  const containerTail = query.container.split(/[.:]+/).pop()!;
  const byContainer = exact.filter(
    (m) => m.containerName === query.container || m.containerName === containerTail,
  );
  return byContainer.length > 0 ? byContainer : exact;
}

export interface SymbolReadOptions {
  /** Include leading `import`/`use`/`from`/`package`/`using` lines from the file. */
  includeImports?: boolean;
  /** Lines to add before + after each symbol range. */
  contextLines?: number;
  /** Cap how many matching symbols we return. */
  maxMatches?: number;
}

export interface SymbolSlice {
  filePath: string;
  range: { startLine: number; endLine: number };
  containerName?: string;
  kind: SymbolKind;
  text: string;
}

export interface SymbolReadResult {
  query: string;
  matches: SymbolSlice[];
  fullFileBytes: number;
  sliceBytes: number;
  estimatedTokensSaved: number;
}

const CHARS_PER_TOKEN = 4;

export async function readSymbol(
  finder: SymbolFinder,
  query: string,
  readFile: (path: string) => Promise<string>,
  opts: SymbolReadOptions = {},
): Promise<SymbolReadResult> {
  const parsed = parseSymbolQuery(query);
  if (!parsed.name) {
    return { query, matches: [], fullFileBytes: 0, sliceBytes: 0, estimatedTokensSaved: 0 };
  }
  const all = await finder.workspaceSymbol(parsed.name);
  const picked = pickMatches(all, parsed).slice(0, opts.maxMatches ?? 5);

  const slices: SymbolSlice[] = [];
  let fullFileBytes = 0;
  let sliceBytes = 0;
  const ctx = opts.contextLines ?? 0;

  for (const match of picked) {
    let content: string;
    try {
      content = await readFile(match.filePath);
    } catch {
      continue;
    }
    fullFileBytes += content.length;
    const lines = content.split('\n');
    const startLine = Math.max(1, match.range.startLine - ctx);
    const endLine = Math.min(lines.length, match.range.endLine + ctx);
    let text = lines.slice(startLine - 1, endLine).join('\n');
    if (opts.includeImports) {
      const imports = extractLeadingImports(lines);
      if (imports) text = imports + '\n\n' + text;
    }
    sliceBytes += text.length;
    slices.push({
      filePath: match.filePath,
      range: { startLine, endLine },
      containerName: match.containerName,
      kind: match.kind,
      text,
    });
  }

  return {
    query,
    matches: slices,
    fullFileBytes,
    sliceBytes,
    estimatedTokensSaved: Math.ceil(Math.max(0, fullFileBytes - sliceBytes) / CHARS_PER_TOKEN),
  };
}

/**
 * Pull leading lines that look like imports, package declarations, or
 * file-level doc comments from a source file. Stops at the first line that
 * looks like real code so we don't accidentally drag the whole file in.
 */
export function extractLeadingImports(lines: string[]): string {
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (
      t === '' ||
      t.startsWith('//') ||
      t.startsWith('#') ||
      t.startsWith('/*') ||
      t.startsWith('*')
    ) {
      out.push(line);
      continue;
    }
    if (
      t.startsWith('import ') ||
      t.startsWith('from ') ||
      t.startsWith('use ') ||
      t.startsWith('require(') ||
      t.startsWith('require ') ||
      t.startsWith('package ') ||
      t.startsWith('using ') ||
      t.startsWith('namespace ') ||
      t.startsWith('@import') ||
      t.startsWith('extern crate')
    ) {
      out.push(line);
      continue;
    }
    break;
  }
  return out.join('\n').replace(/\n+$/, '');
}

const LSP_KIND_TO_STRING: Record<number, SymbolKind> = {
  5: 'class',
  6: 'method',
  9: 'constructor',
  11: 'interface',
  12: 'function',
  13: 'variable',
  10: 'enum',
  23: 'struct',
  7: 'property',
};

export function lspSymbolKindToString(kind: number): SymbolKind {
  return LSP_KIND_TO_STRING[kind] ?? 'other';
}
