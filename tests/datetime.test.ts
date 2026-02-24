import { describe, expect, it } from 'vitest';
import { formatTimestamp, parseTimestamp } from '@/lib/datetime';

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 24 * 60 * 60 * 1000;

describe('datetime', () => {
  it('parses excel serial timestamps to valid modern dates', () => {
    const date = parseTimestamp(45781);
    expect(formatTimestamp(date).endsWith('00:00')).toBe(true);
  });

  it('parses ISO timestamps and formats as DD-MM-YYYY HH:mm', () => {
    const date = parseTimestamp('2025-05-04T12:30:00.000Z');
    expect(Number.isNaN(date.getTime())).toBe(false);
    expect(formatTimestamp(date)).toMatch(/^\d{2}-\d{2}-\d{4} \d{2}:\d{2}$/);
  });

  it('parses NL Excel-export timestamp strings as Europe/Amsterdam local time in summer (DST)', () => {
    const date = parseTimestamp('19-04-2025 13:15');

    expect(formatTimestamp(date)).toContain('13:15');
  });

  it('parses NL Excel-export timestamp strings as Europe/Amsterdam local time in winter', () => {
    const date = parseTimestamp('15-01-2025 13:15');

    expect(formatTimestamp(date)).toContain('13:15');
  });

  it('snaps Excel serial timestamps to quarter-hour boundaries to avoid xx:59 formatting', () => {
    const excelLocalMs = Date.UTC(2024, 0, 1, 16, 0, 0, 0);
    const serialWithDrift = (excelLocalMs - EXCEL_EPOCH_MS) / DAY_MS - 1e-12;

    const parsed = parseTimestamp(serialWithDrift);
    const formatted = formatTimestamp(parsed);

    expect(formatted.endsWith('16:00')).toBe(true);
  });

  it('parses Excel serial timestamps as Europe/Amsterdam local wall time without DST shift', () => {
    const excelLocalMs = Date.UTC(2025, 3, 19, 13, 15, 0, 0);
    const serial = (excelLocalMs - EXCEL_EPOCH_MS) / DAY_MS;
    const parsed = parseTimestamp(serial);

    expect(formatTimestamp(parsed)).toContain('13:15');
  });
});
