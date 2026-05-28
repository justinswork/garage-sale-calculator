import { describe, it, expect } from 'vitest';
import { formatMoney, parseMoney, sanitizeMoneyInput, suggestCashAmounts } from './money.js';

describe('formatMoney', () => {
  it('formats whole-dollar amounts', () => {
    expect(formatMoney(500)).toBe('$5.00');
    expect(formatMoney(0)).toBe('$0.00');
    expect(formatMoney(1)).toBe('$0.01');
  });

  it('formats sub-dollar amounts', () => {
    expect(formatMoney(99)).toBe('$0.99');
    expect(formatMoney(50)).toBe('$0.50');
  });

  it('formats negative amounts with leading minus', () => {
    expect(formatMoney(-500)).toBe('-$5.00');
    expect(formatMoney(-1)).toBe('-$0.01');
  });

  it('formats large numbers', () => {
    expect(formatMoney(1234567)).toBe('$12345.67');
  });

  it('coerces null/undefined/NaN to $0.00', () => {
    expect(formatMoney(null)).toBe('$0.00');
    expect(formatMoney(undefined)).toBe('$0.00');
    expect(formatMoney(NaN)).toBe('$0.00');
  });
});

describe('parseMoney', () => {
  it('parses plain numbers as cents', () => {
    expect(parseMoney('5')).toBe(500);
    expect(parseMoney('5.00')).toBe(500);
    expect(parseMoney('5.5')).toBe(550);
    expect(parseMoney('5.50')).toBe(550);
    expect(parseMoney('0')).toBe(0);
  });

  it('strips dollar signs, commas, and whitespace', () => {
    expect(parseMoney('$5')).toBe(500);
    expect(parseMoney('$5.50')).toBe(550);
    expect(parseMoney(' 5.50 ')).toBe(550);
    expect(parseMoney('1,234.56')).toBe(123456);
  });

  it('handles fractional cents by rounding', () => {
    expect(parseMoney('5.555')).toBe(556);
    expect(parseMoney('5.554')).toBe(555);
  });

  it('returns null for empty / invalid / nullish', () => {
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('   ')).toBeNull();
    expect(parseMoney(null)).toBeNull();
    expect(parseMoney(undefined)).toBeNull();
    expect(parseMoney('abc')).toBeNull();
  });
});

describe('sanitizeMoneyInput', () => {
  it('strips letters', () => {
    expect(sanitizeMoneyInput('5abc')).toBe('5');
    expect(sanitizeMoneyInput('abc5.5xyz')).toBe('5.5');
  });

  it('strips dollar signs and other punctuation', () => {
    expect(sanitizeMoneyInput('$5.50')).toBe('5.50');
    expect(sanitizeMoneyInput('1,234')).toBe('1234');
  });

  it('allows only one decimal point', () => {
    expect(sanitizeMoneyInput('5.5.5')).toBe('5.55');
    expect(sanitizeMoneyInput('5..5')).toBe('5.5');
    expect(sanitizeMoneyInput('1.2.3.4')).toBe('1.234');
  });

  it('preserves user partial input', () => {
    expect(sanitizeMoneyInput('5.')).toBe('5.');
    expect(sanitizeMoneyInput('.5')).toBe('.5');
    expect(sanitizeMoneyInput('5')).toBe('5');
  });

  it('returns empty string for null/undefined', () => {
    expect(sanitizeMoneyInput(null)).toBe('');
    expect(sanitizeMoneyInput(undefined)).toBe('');
  });
});

describe('suggestCashAmounts', () => {
  it('suggests exact + next two bills for small totals', () => {
    expect(suggestCashAmounts(300)).toEqual([300, 500, 1000]);
    expect(suggestCashAmounts(600)).toEqual([600, 1000, 2000]);
  });

  it('skips bills too far above the total', () => {
    // $10 should suggest just $20 (skips $50 — would be 5x)
    expect(suggestCashAmounts(1000)).toEqual([1000, 2000]);
    // $11 should suggest just $20 (skips $50 — would be ~4.5x)
    expect(suggestCashAmounts(1100)).toEqual([1100, 2000]);
  });

  it('always includes the first bill above, even if far away', () => {
    // $1 → $5 is 5x but still useful (no closer bill exists)
    expect(suggestCashAmounts(100)).toEqual([100, 500]);
  });

  it('handles totals that exactly equal a bill', () => {
    // $20 exact: suggest $50 ($50 is 2.5x, within range)
    expect(suggestCashAmounts(2000)).toEqual([2000, 5000]);
    // $50 exact: suggest $100
    expect(suggestCashAmounts(5000)).toEqual([5000, 10000]);
  });

  it('handles totals between bills', () => {
    expect(suggestCashAmounts(2500)).toEqual([2500, 5000, 10000]);
    expect(suggestCashAmounts(4500)).toEqual([4500, 5000, 10000]);
    expect(suggestCashAmounts(8000)).toEqual([8000, 10000]);
  });

  it('handles totals above all standard bills', () => {
    expect(suggestCashAmounts(15000)).toEqual([15000]);
  });

  it('handles fractional totals', () => {
    // $5.50 → $10 (1.8x), $20 (3.6x)
    expect(suggestCashAmounts(550)).toEqual([550, 1000, 2000]);
  });

  it('returns empty for zero or invalid totals', () => {
    expect(suggestCashAmounts(0)).toEqual([]);
    expect(suggestCashAmounts(-100)).toEqual([]);
    expect(suggestCashAmounts(null)).toEqual([]);
    expect(suggestCashAmounts(undefined)).toEqual([]);
  });
});
