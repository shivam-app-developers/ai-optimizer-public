import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computePreview, formatPreviewLines } from './preview.js';

describe('computePreview', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aiopt-init-preview-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('detects javascript pack and counts what would be filtered', async () => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'demo', dependencies: {} }),
      'utf-8',
    );
    writeFileSync(join(dir, 'app.ts'), '// real source', 'utf-8');

    mkdirSync(join(dir, 'node_modules', 'left-pad'), { recursive: true });
    writeFileSync(
      join(dir, 'node_modules', 'left-pad', 'index.js'),
      'module.exports = function(){};\n'.repeat(40),
      'utf-8',
    );

    mkdirSync(join(dir, 'dist'), { recursive: true });
    writeFileSync(join(dir, 'dist', 'app.js'), 'compiled\n'.repeat(40), 'utf-8');

    const p = await computePreview({ rootDir: dir });

    expect(p.detectedFrameworks).toContain('javascript');
    expect(p.activePackNames.some((n) => /javascript|js|typescript/i.test(n))).toBe(true);
    expect(p.totalFiltered).toBeGreaterThan(0);
    expect(p.estimatedTokensSaved).toBeGreaterThan(0);
    // dollar value formatting always returns a string
    expect(p.dollarsSavedFormatted).toMatch(/\$|< \$/);
  });

  it('reports zero filtered on a project with nothing to skip', async () => {
    writeFileSync(join(dir, 'README.md'), '# tiny', 'utf-8');
    const p = await computePreview({ rootDir: dir });
    expect(p.totalFiltered).toBe(0);
    expect(p.estimatedTokensSaved).toBe(0);
  });

  it('formatPreviewLines includes the headline savings sentence', async () => {
    writeFileSync(join(dir, 'README.md'), '# tiny', 'utf-8');
    const p = await computePreview({ rootDir: dir });
    const lines = formatPreviewLines(p);
    expect(lines.join('\n')).toMatch(/Would skip [\d,]+ of [\d,]+ files/);
    expect(lines.join('\n')).toMatch(/Estimated tokens kept out of context/);
  });
});
