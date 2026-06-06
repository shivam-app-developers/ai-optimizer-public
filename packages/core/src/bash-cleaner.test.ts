import { describe, it, expect } from 'vitest';
import { cleanBashOutput } from './bash-cleaner.js';

describe('cleanBashOutput', () => {
  it('strips ANSI color escapes', () => {
    const input = '\x1b[32mok\x1b[0m\n\x1b[31merror\x1b[0m';
    const r = cleanBashOutput(input);
    expect(r.cleaned).toBe('ok\nerror');
    expect(r.estimatedTokensSaved).toBeGreaterThanOrEqual(0);
  });

  it('collapses carriage-return progress updates to the final segment', () => {
    const input = 'building\rbuilding... 50%\rbuilding... 100%\nDONE';
    const r = cleanBashOutput(input);
    expect(r.cleaned.split('\n')[0]).toBe('building... 100%');
    expect(r.cleaned).toContain('DONE');
  });

  it('removes npm WARN, npm notice, and npm fund noise', () => {
    const input = [
      'npm WARN deprecated foo@1',
      'npm notice New version of npm available',
      'npm fund packages are looking for funding',
      'real output line',
      'added 42 packages in 3s',
    ].join('\n');
    const r = cleanBashOutput(input);
    expect(r.cleaned).toBe('real output line');
    expect(r.removedLineCount).toBeGreaterThanOrEqual(4);
  });

  it('removes JVM illegal-access warnings', () => {
    const input = [
      'WARNING: An illegal reflective access operation has occurred',
      'WARNING: Please consider reporting this to the maintainers of foo',
      'WARNING: Use --illegal-access=warn to enable warnings',
      'WARNING: All illegal access operations will be denied in a future release',
      'BUILD SUCCESSFUL',
    ].join('\n');
    const r = cleanBashOutput(input);
    expect(r.cleaned).toBe('BUILD SUCCESSFUL');
  });

  it('removes Maven download progress', () => {
    const input = [
      'Downloading from central: https://repo.maven.org/foo.jar',
      'Downloaded from central: https://repo.maven.org/foo.jar (1.2 MB at 5.0 MB/s)',
      'Tests passed.',
    ].join('\n');
    const r = cleanBashOutput(input);
    expect(r.cleaned).toBe('Tests passed.');
  });

  it('collapses consecutive duplicate lines by default', () => {
    const input = ['same', 'same', 'same', 'different'].join('\n');
    const r = cleanBashOutput(input);
    expect(r.cleaned).toBe('same\ndifferent');
  });

  it('respects keepLines patterns over noise patterns', () => {
    const input = ['npm WARN keep this one', 'npm WARN drop this'].join('\n');
    const r = cleanBashOutput(input, { keepLines: [/keep this/] });
    expect(r.cleaned).toContain('npm WARN keep this one');
    expect(r.cleaned).not.toContain('drop this');
  });

  it('reports accurate char counts', () => {
    const input = 'npm WARN noisy\nuseful';
    const r = cleanBashOutput(input);
    expect(r.originalChars).toBe(input.length);
    expect(r.cleanedChars).toBe('useful'.length);
  });

  it('returns empty string and reports savings when input is all noise', () => {
    const input = 'npm WARN one\nnpm WARN two\nnpm notice three';
    const r = cleanBashOutput(input);
    expect(r.cleaned).toBe('');
    expect(r.removedLineCount).toBe(3);
  });
});
