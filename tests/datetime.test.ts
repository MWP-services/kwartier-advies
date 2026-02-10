import { describe, expect, it } from 'vitest';
import { formatTimestamp, parseTimestamp } from '@/lib/datetime';

describe('datetime parsing', () => {
  it('parses excel serial timestamps to valid modern dates', () => {
    const date = parseTimestamp(45781);
    expect(date.toISOString()).toBe('2025-05-04T00:00:00.000Z');
  });

  it('parses ISO timestamps and formats as DD-MM-YYYY HH:mm', () => {
    const date = parseTimestamp('2025-05-04T12:30:00.000Z');
    expect(Number.isNaN(date.getTime())).toBe(false);
    expect(formatTimestamp(date)).toMatch(/^\d{2}-\d{2}-\d{4} \d{2}:\d{2}$/);
  });
});
