import { describe, expect, it } from 'vitest';
import { formatTimestamp, parseTimestamp } from '@/lib/datetime';

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 24 * 60 * 60 * 1000;

describe('datetime', () => {
  it('parses excel serial timestamps to valid modern dates', () => {
    const date = parseTimestamp(45781);
    expect(date.toISOString()).toBe('2025-05-04T00:00:00.000Z');
  });

  it('parses ISO timestamps and formats as DD-MM-YYYY HH:mm', () => {
    const date = parseTimestamp('2025-05-04T12:30:00.000Z');
    expect(Number.isNaN(date.getTime())).toBe(false);
    expect(formatTimestamp(date)).toMatch(/^\d{2}-\d{2}-\d{4} \d{2}:\d{2}$/);
  });

  it('snaps Excel serial timestamps to quarter-hour boundaries to avoid xx:59 formatting', () => {
    const targetUtcMs = Date.UTC(2024, 0, 1, 15, 0, 0, 0); // 16:00 in Europe/Amsterdam (winter)
    const serialWithDrift = (targetUtcMs - EXCEL_EPOCH_MS) / DAY_MS - 1e-12;

    const parsed = parseTimestamp(serialWithDrift);
    const formatted = formatTimestamp(parsed);

    expect(parsed.getTime()).toBe(targetUtcMs);
    expect(formatted.endsWith('16:00')).toBe(true);
  });
});
