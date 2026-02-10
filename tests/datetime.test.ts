import { describe, expect, it } from 'vitest';
import { parseTimestamp } from '@/lib/datetime';

describe('datetime parsing', () => {
  it('parses excel serial timestamps to valid modern dates', () => {
    const date = parseTimestamp(45781);
    expect(Number.isNaN(date.getTime())).toBe(false);
    expect(date.getUTCFullYear()).toBeGreaterThan(2020);
    expect(date.getUTCFullYear()).toBeLessThan(2035);
  });
});
