import { describe, it, expect } from 'vitest';
import { translate } from './translator.js';

describe('translate', () => {
  it('maps ignore[] to extraIgnoreGlobs', () => {
    const r = translate({ ignore: ['build/**', 'dist/**'] });
    expect(r.patch.extraIgnoreGlobs).toEqual(['build/**', 'dist/**']);
    expect(r.notes.some((n) => n.includes('2 pattern(s)'))).toBe(true);
  });

  it('falls back to exclude[] when ignore is missing', () => {
    const r = translate({ exclude: ['target/**'] });
    expect(r.patch.extraIgnoreGlobs).toEqual(['target/**']);
  });

  it('emits a Pro-pack hint for react / flutter / java / kotlin / go', () => {
    for (const fw of ['react', 'flutter', 'java', 'kotlin', 'go', 'next', 'android']) {
      const r = translate({ framework: fw });
      expect(r.notes.some((n) => /Pro pack/.test(n))).toBe(true);
    }
  });

  it('emits a free-pack note for python / javascript / typescript', () => {
    for (const fw of ['python', 'javascript', 'typescript', 'node']) {
      const r = translate({ framework: fw });
      expect(r.notes.some((n) => /free pack/.test(n))).toBe(true);
    }
  });

  it('reports an unknown framework rather than guessing', () => {
    const r = translate({ framework: 'cobol' });
    expect(r.notes.some((n) => /no equivalent/.test(n))).toBe(true);
  });

  it('honours `language` when `framework` is missing', () => {
    const r = translate({ language: 'kotlin' });
    expect(r.notes.some((n) => /Pro pack/.test(n))).toBe(true);
  });

  it('translates maxTokens to budgetCaps.perSessionTokens', () => {
    const r = translate({ maxTokens: 12345 });
    expect(r.patch.budgetCaps).toEqual({ perSessionTokens: 12345 });
  });

  it('falls back to tokenLimit', () => {
    const r = translate({ tokenLimit: 5000 });
    expect(r.patch.budgetCaps).toEqual({ perSessionTokens: 5000 });
  });

  it('coerces a numeric string for budget cap', () => {
    const r = translate({ maxTokens: '8000' as unknown as number });
    expect(r.patch.budgetCaps).toEqual({ perSessionTokens: 8000 });
  });

  it('reports unrecognised fields in the notes', () => {
    const r = translate({ thingyConfig: 'oh hi', anotherThing: 42 });
    expect(r.notes.some((n) => /unrecognised field/.test(n))).toBe(true);
  });

  it('returns an empty patch + helpful note when input is empty', () => {
    const r = translate({});
    expect(r.patch).toEqual({});
    expect(r.notes.some((n) => /Nothing to translate/.test(n))).toBe(true);
  });

  it('ignores non-string entries in ignore[]', () => {
    const r = translate({ ignore: ['build/**', 42 as unknown as string, '', 'dist/**'] });
    expect(r.patch.extraIgnoreGlobs).toEqual(['build/**', 'dist/**']);
  });
});
