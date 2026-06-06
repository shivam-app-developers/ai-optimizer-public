import { describe, it, expect } from 'vitest';
import {
  parseSymbolQuery,
  pickMatches,
  extractLeadingImports,
  readSymbol,
  lspSymbolKindToString,
  type SymbolFinder,
  type SymbolMatch,
} from './symbol.js';

describe('parseSymbolQuery', () => {
  it('parses bare name', () => {
    expect(parseSymbolQuery('getUser')).toEqual({ name: 'getUser' });
  });
  it('parses dotted', () => {
    expect(parseSymbolQuery('UserRepository.getUser')).toEqual({
      container: 'UserRepository',
      name: 'getUser',
    });
  });
  it('parses double-colon (Rust / C++)', () => {
    expect(parseSymbolQuery('users::repository::get')).toEqual({
      container: 'users.repository',
      name: 'get',
    });
  });
  it('parses Ruby # method syntax', () => {
    expect(parseSymbolQuery('User#find')).toEqual({ container: 'User', name: 'find' });
  });
  it('handles whitespace', () => {
    expect(parseSymbolQuery('  Foo.bar  ')).toEqual({ container: 'Foo', name: 'bar' });
  });
  it('handles empty string', () => {
    expect(parseSymbolQuery('')).toEqual({ name: '' });
  });
});

describe('pickMatches', () => {
  const m = (name: string, container?: string): SymbolMatch => ({
    name,
    containerName: container,
    filePath: 'x.ts',
    range: { startLine: 1, endLine: 5 },
    kind: 'method',
  });

  it('returns exact-name matches when no container', () => {
    const matches = [m('getUser', 'UserRepo'), m('getOther'), m('getUser', 'AdminRepo')];
    expect(pickMatches(matches, { name: 'getUser' })).toHaveLength(2);
  });
  it('filters by container when supplied', () => {
    const matches = [m('getUser', 'UserRepo'), m('getUser', 'AdminRepo')];
    expect(pickMatches(matches, { container: 'UserRepo', name: 'getUser' })).toEqual([
      matches[0],
    ]);
  });
  it('matches container by trailing segment when full path has no hit', () => {
    const matches = [m('getUser', 'UserRepo')];
    expect(pickMatches(matches, { container: 'app.repos.UserRepo', name: 'getUser' })).toEqual([
      matches[0],
    ]);
  });
  it('falls back to all exact matches when container filter empties the list', () => {
    const matches = [m('getUser', 'AdminRepo')];
    expect(pickMatches(matches, { container: 'UserRepo', name: 'getUser' })).toEqual([
      matches[0],
    ]);
  });
});

describe('extractLeadingImports', () => {
  it('captures TS-style imports + leading docstring', () => {
    const text = `// Header doc

import { foo } from 'bar';
import baz from 'qux';

export function hello() {}`;
    expect(extractLeadingImports(text.split('\n'))).toContain("import { foo } from 'bar';");
  });
  it('captures Python imports', () => {
    const text = `from typing import Optional
import os

def hello():
    pass`;
    const out = extractLeadingImports(text.split('\n'));
    expect(out).toContain('from typing import Optional');
    expect(out).toContain('import os');
  });
  it('stops at the first real code line', () => {
    const text = `import x
const a = 1
import y`;
    const out = extractLeadingImports(text.split('\n'));
    expect(out).toContain('import x');
    expect(out).not.toContain('import y');
  });
  it('returns empty string when no imports', () => {
    expect(extractLeadingImports(['function foo() {}'])).toBe('');
  });
});

describe('readSymbol', () => {
  const userRepoSource = `import { db } from './db';

export class UserRepository {
  async getUser(id: string) {
    return db.query('SELECT * FROM users WHERE id = $1', [id]);
  }

  async deleteUser(id: string) {
    return db.query('DELETE FROM users WHERE id = $1', [id]);
  }
}
`;

  function makeFinder(matches: SymbolMatch[]): SymbolFinder {
    return {
      workspaceSymbol: async () => matches,
    };
  }

  it('returns a slice of the matched symbol body, saving most of the file', async () => {
    const finder = makeFinder([
      {
        name: 'getUser',
        containerName: 'UserRepository',
        filePath: '/x/UserRepository.ts',
        range: { startLine: 4, endLine: 6 },
        kind: 'method',
      },
    ]);
    const result = await readSymbol(finder, 'UserRepository.getUser', async () => userRepoSource);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]!.text).toContain("db.query('SELECT * FROM users");
    expect(result.matches[0]!.text).not.toContain('deleteUser');
    expect(result.estimatedTokensSaved).toBeGreaterThan(0);
  });

  it('respects contextLines and includeImports', async () => {
    const finder = makeFinder([
      {
        name: 'getUser',
        containerName: 'UserRepository',
        filePath: '/x.ts',
        range: { startLine: 4, endLine: 6 },
        kind: 'method',
      },
    ]);
    const result = await readSymbol(finder, 'UserRepository.getUser', async () => userRepoSource, {
      contextLines: 1,
      includeImports: true,
    });
    expect(result.matches[0]!.text.startsWith("import { db }")).toBe(true);
  });

  it('returns empty result when no match', async () => {
    const finder = makeFinder([]);
    const result = await readSymbol(finder, 'doesNotExist', async () => userRepoSource);
    expect(result.matches).toEqual([]);
    expect(result.estimatedTokensSaved).toBe(0);
  });

  it('caps to maxMatches', async () => {
    const finder = makeFinder([
      { name: 'foo', filePath: '/a.ts', range: { startLine: 1, endLine: 1 }, kind: 'function' },
      { name: 'foo', filePath: '/b.ts', range: { startLine: 1, endLine: 1 }, kind: 'function' },
      { name: 'foo', filePath: '/c.ts', range: { startLine: 1, endLine: 1 }, kind: 'function' },
    ]);
    const result = await readSymbol(finder, 'foo', async () => 'foo()\n', { maxMatches: 2 });
    expect(result.matches).toHaveLength(2);
  });

  it('skips files that fail to read instead of throwing', async () => {
    const finder = makeFinder([
      { name: 'foo', filePath: '/missing.ts', range: { startLine: 1, endLine: 1 }, kind: 'function' },
    ]);
    const result = await readSymbol(finder, 'foo', async () => {
      throw new Error('ENOENT');
    });
    expect(result.matches).toEqual([]);
  });
});

describe('lspSymbolKindToString', () => {
  it('maps known LSP kinds', () => {
    expect(lspSymbolKindToString(5)).toBe('class');
    expect(lspSymbolKindToString(12)).toBe('function');
    expect(lspSymbolKindToString(6)).toBe('method');
  });
  it('falls back to "other" for unknown', () => {
    expect(lspSymbolKindToString(999)).toBe('other');
  });
});
