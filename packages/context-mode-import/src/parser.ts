import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The shape we extract from a context-mode config. We don't enforce a single
 * schema — context-mode itself has multiple supported file formats and
 * historical changes — so we accept any subset of these fields and ignore
 * the rest.
 */
export interface ContextModeConfig {
  /** Glob list to exclude from the context. */
  ignore?: string[];
  /** Some versions call this `exclude`. */
  exclude?: string[];
  /** Per-context-mode framework / language hint. */
  framework?: string;
  /** Some versions use `language` instead. */
  language?: string;
  /** Token cap per session, if set. */
  maxTokens?: number;
  /** Some versions use `tokenLimit`. */
  tokenLimit?: number;
  /** Pass-through: anything else context-mode supports we don't translate yet. */
  [key: string]: unknown;
}

/** Default search list, in priority order. */
export const KNOWN_CONTEXT_MODE_FILES = [
  '.contextmode.json',
  '.contextmode.yml',
  '.contextmode.yaml',
  'contextmode.config.json',
  '.context-mode.json',
  'context-mode.json',
];

export interface ResolvedConfig {
  path: string;
  config: ContextModeConfig;
}

export function findContextModeConfig(rootDir: string): string | undefined {
  for (const name of KNOWN_CONTEXT_MODE_FILES) {
    const candidate = join(rootDir, name);
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Parse a context-mode file. JSON is parsed natively. YAML is parsed via a
 * minimal recursive-descent reader sufficient for the small key/value/list
 * shape context-mode uses (no anchors / no flow style / no multi-line scalars).
 * If the file looks like JSON (starts with `{` or `[`) we always parse as JSON.
 */
export function parseContextModeFile(path: string): ContextModeConfig {
  const raw = readFileSync(path, 'utf-8');
  const trimmed = raw.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return parseJson(raw, path);
  }
  if (path.endsWith('.json')) return parseJson(raw, path);
  return parseSimpleYaml(raw);
}

function parseJson(raw: string, path: string): ContextModeConfig {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`expected object at top level`);
    }
    return parsed as ContextModeConfig;
  } catch (err) {
    throw new Error(`could not parse JSON at ${path}: ${(err as Error).message}`);
  }
}

/**
 * Minimal YAML reader supporting:
 *   - top-level `key: value` lines (string / number / boolean)
 *   - `key:` followed by `  - item` lines forming a string list
 *   - `#` comments and blank lines (ignored)
 * Anything else is skipped silently — we'd rather miss a field than reject
 * a slightly-non-standard file the user wrote.
 */
export function parseSimpleYaml(raw: string): ContextModeConfig {
  const out: ContextModeConfig = {};
  const lines = raw.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    const stripped = line.replace(/\s+#.*$/, '').trimEnd();
    if (stripped.trim() === '' || stripped.trim().startsWith('#')) {
      i++;
      continue;
    }
    if (line.startsWith(' ') || line.startsWith('\t')) {
      // Stray indented line at top level — skip.
      i++;
      continue;
    }
    const m = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(stripped);
    if (!m) {
      i++;
      continue;
    }
    const key = m[1]!;
    const valueRaw = (m[2] ?? '').trim();
    if (valueRaw === '') {
      // Either an empty scalar or the start of a block list.
      const items: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const next = lines[j] ?? '';
        const nstripped = next.replace(/\s+#.*$/, '').trimEnd();
        if (nstripped.trim() === '' || nstripped.trim().startsWith('#')) {
          j++;
          continue;
        }
        const listMatch = /^\s+-\s+(.+)$/.exec(nstripped);
        if (listMatch) {
          items.push(unquote((listMatch[1] ?? '').trim()));
          j++;
          continue;
        }
        break;
      }
      if (items.length > 0) {
        out[key] = items;
        i = j;
        continue;
      }
      out[key] = '';
      i++;
      continue;
    }
    out[key] = coerceScalar(valueRaw);
    i++;
  }
  return out;
}

function unquote(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function coerceScalar(raw: string): unknown {
  const v = unquote(raw);
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') return null;
  if (/^-?\d+$/.test(v)) return Number(v);
  if (/^-?\d+\.\d+$/.test(v)) return Number(v);
  return v;
}
