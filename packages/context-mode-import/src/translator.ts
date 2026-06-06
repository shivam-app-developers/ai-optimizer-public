import type { ContextModeConfig } from './parser.js';
import type { ConfigPatch } from '@ai-optimizer/core';

export interface TranslationResult {
  /** Patch ready to merge into .optimizerrc.json. */
  patch: ConfigPatch;
  /** Human-readable lines describing what we translated and what we skipped. */
  notes: string[];
}

/**
 * Map of context-mode `framework` / `language` values to ai-optimizer pack ids.
 * Free packs are surfaced as a no-op note (they're auto-detected anyway); Pro
 * packs are surfaced as a hint that the user should set AI_OPTIMIZER_LICENSE.
 */
const FRAMEWORK_TO_PACK: Record<string, { packId: string; pro: boolean }> = {
  python: { packId: 'python', pro: false },
  py: { packId: 'python', pro: false },
  javascript: { packId: 'javascript', pro: false },
  js: { packId: 'javascript', pro: false },
  typescript: { packId: 'javascript', pro: false },
  ts: { packId: 'javascript', pro: false },
  node: { packId: 'javascript', pro: false },
  react: { packId: 'react', pro: true },
  next: { packId: 'react', pro: true },
  nextjs: { packId: 'react', pro: true },
  flutter: { packId: 'flutter', pro: true },
  dart: { packId: 'flutter', pro: true },
  java: { packId: 'java', pro: true },
  kotlin: { packId: 'kotlin', pro: true },
  android: { packId: 'kotlin', pro: true },
  go: { packId: 'go', pro: true },
  golang: { packId: 'go', pro: true },
};

export function translate(cfg: ContextModeConfig): TranslationResult {
  const patch: ConfigPatch = {};
  const notes: string[] = [];

  const ignoreSrc = collectStrings(cfg.ignore) ?? collectStrings(cfg.exclude);
  if (ignoreSrc && ignoreSrc.length > 0) {
    patch.extraIgnoreGlobs = ignoreSrc;
    notes.push(`extraIgnoreGlobs: ${ignoreSrc.length} pattern(s) imported`);
  }

  const fwRaw = pickString(cfg.framework) ?? pickString(cfg.language);
  if (fwRaw) {
    const key = fwRaw.toLowerCase().trim();
    const mapped = FRAMEWORK_TO_PACK[key];
    if (mapped) {
      if (mapped.pro) {
        notes.push(
          `framework "${fwRaw}" maps to Pro pack "${mapped.packId}" — set AI_OPTIMIZER_LICENSE to load it`,
        );
      } else {
        notes.push(`framework "${fwRaw}" maps to free pack "${mapped.packId}" (auto-detected)`);
      }
    } else {
      notes.push(`framework "${fwRaw}" — no equivalent ai-optimizer pack; ignored`);
    }
  }

  const cap = pickInt(cfg.maxTokens) ?? pickInt(cfg.tokenLimit);
  if (cap !== undefined) {
    patch.budgetCaps = { perSessionTokens: cap };
    notes.push(`budgetCaps.perSessionTokens: ${cap} (from maxTokens / tokenLimit)`);
  }

  const passedThrough = Object.keys(cfg).filter(
    (k) =>
      ![
        'ignore',
        'exclude',
        'framework',
        'language',
        'maxTokens',
        'tokenLimit',
      ].includes(k),
  );
  if (passedThrough.length > 0) {
    notes.push(
      `${passedThrough.length} unrecognised field(s) skipped: ${passedThrough.slice(0, 8).join(', ')}${
        passedThrough.length > 8 ? '…' : ''
      }`,
    );
  }

  if (notes.length === 0) {
    notes.push('Nothing to translate — context-mode config was empty or had no recognised fields.');
  }

  return { patch, notes };
}

function collectStrings(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
  return out.length > 0 ? out : undefined;
}

function pickString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined;
}

function pickInt(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.floor(v);
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return undefined;
}
