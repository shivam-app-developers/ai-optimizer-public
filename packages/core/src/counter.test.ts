import { describe, it, expect } from 'vitest';
import { SavingsCounter } from './counter.js';

describe('SavingsCounter', () => {
  it('starts empty', () => {
    const c = new SavingsCounter();
    expect(c.snapshot()).toEqual({ tokensSaved: 0, operations: 0 });
  });

  it('accumulates positive savings', () => {
    const c = new SavingsCounter();
    c.record(100);
    c.record(50);
    expect(c.snapshot()).toEqual({ tokensSaved: 150, operations: 2 });
  });

  it('ignores zero and negative savings', () => {
    const c = new SavingsCounter();
    c.record(0);
    c.record(-10);
    expect(c.snapshot()).toEqual({ tokensSaved: 0, operations: 0 });
  });

  it('estimates tokens at ~4 chars per token', () => {
    const c = new SavingsCounter();
    expect(c.estimateTokens('')).toBe(0);
    expect(c.estimateTokens('abcd')).toBe(1);
    expect(c.estimateTokens('abcde')).toBe(2);
    expect(c.estimateTokens('a'.repeat(400))).toBe(100);
  });

  it('resets to zero', () => {
    const c = new SavingsCounter();
    c.record(123);
    c.reset();
    expect(c.snapshot()).toEqual({ tokensSaved: 0, operations: 0 });
  });
});
