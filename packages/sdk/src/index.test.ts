import { describe, it, expect } from 'vitest';
import { definePack, validatePack, InvalidPluginPackError } from './index.js';

describe('definePack', () => {
  it('returns the pack unchanged on valid input', () => {
    const pack = definePack({
      id: 'demo',
      name: 'Demo',
      detect: async () => true,
      ignoreGlobs: ['target/**'],
      generatedFilePatterns: [/\.gen\.go$/],
    });
    expect(pack.id).toBe('demo');
    expect(pack.ignoreGlobs).toEqual(['target/**']);
  });

  it('throws on bad id', () => {
    expect(() =>
      definePack({
        id: 'bad id with spaces',
        name: 'X',
        detect: async () => true,
        ignoreGlobs: [],
      }),
    ).toThrow(InvalidPluginPackError);
  });

  it('throws when detect is missing', () => {
    expect(() =>
      definePack({
        id: 'x',
        name: 'X',
        // @ts-expect-error testing runtime guard
        detect: undefined,
        ignoreGlobs: [],
      }),
    ).toThrow(InvalidPluginPackError);
  });

  it('throws when generatedFilePatterns has non-regex', () => {
    expect(() =>
      validatePack({
        id: 'x',
        name: 'X',
        detect: async () => true,
        ignoreGlobs: [],
        generatedFilePatterns: ['not-a-regex'],
      }),
    ).toThrow(InvalidPluginPackError);
  });
});

describe('validatePack', () => {
  it('rejects null', () => {
    expect(() => validatePack(null)).toThrow(InvalidPluginPackError);
  });
  it('rejects empty id', () => {
    expect(() =>
      validatePack({
        id: '',
        name: 'X',
        detect: async () => true,
        ignoreGlobs: [],
      }),
    ).toThrow(InvalidPluginPackError);
  });
});
