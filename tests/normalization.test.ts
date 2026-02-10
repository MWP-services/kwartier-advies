import { describe, expect, it } from 'vitest';
import { findMaxObserved, processIntervals, type IntervalRecord } from '@/lib/calculations';
import { normalizeConsumptionSeries } from '@/lib/normalization';

describe('normalization', () => {
  it('keeps interval data unchanged in INTERVAL mode', () => {
    const rows: IntervalRecord[] = [
      { timestamp: '2024-01-01T00:00:00.000Z', consumptionKwh: 10 },
      { timestamp: '2024-01-01T00:15:00.000Z', consumptionKwh: 12 },
      { timestamp: '2024-01-01T00:30:00.000Z', consumptionKwh: 8 }
    ];

    const result = normalizeConsumptionSeries(rows, { interpretationMode: 'INTERVAL' });

    expect(result.diagnostics.interpretationUsed).toBe('INTERVAL');
    expect(result.normalizedRows.map((row) => row.consumptionKwh)).toEqual([10, 12, 8]);
  });

  it('converts cumulative readings to interval deltas', () => {
    const rows: IntervalRecord[] = [
      { timestamp: '2024-01-01T00:00:00.000Z', consumptionKwh: 1000 },
      { timestamp: '2024-01-01T00:15:00.000Z', consumptionKwh: 1002 },
      { timestamp: '2024-01-01T00:30:00.000Z', consumptionKwh: 1005 }
    ];

    const result = normalizeConsumptionSeries(rows, { interpretationMode: 'CUMULATIVE_DELTA' });

    expect(result.normalizedRows.map((row) => row.consumptionKwh)).toEqual([0, 2, 3]);
  });

  it('AUTO selects cumulative delta when non-decreasing with huge values', () => {
    const rows: IntervalRecord[] = [
      { timestamp: '2024-01-01T00:00:00.000Z', consumptionKwh: 50000 },
      { timestamp: '2024-01-01T00:15:00.000Z', consumptionKwh: 50002 },
      { timestamp: '2024-01-01T00:30:00.000Z', consumptionKwh: 50005 }
    ];

    const result = normalizeConsumptionSeries(rows, { interpretationMode: 'AUTO' });

    expect(result.diagnostics.interpretationUsed).toBe('CUMULATIVE_DELTA');
    expect(result.normalizedRows.map((row) => row.consumptionKwh)).toEqual([0, 2, 3]);
  });

  it('excludes outliers and avoids million-scale max observed kW', () => {
    const rows: IntervalRecord[] = [
      { timestamp: '2024-01-01T00:00:00.000Z', consumptionKwh: 12 },
      { timestamp: '2024-01-01T00:15:00.000Z', consumptionKwh: 1428380 },
      { timestamp: '2024-01-01T00:30:00.000Z', consumptionKwh: 10 }
    ];

    const normalized = normalizeConsumptionSeries(rows, {
      interpretationMode: 'INTERVAL',
      outlierKwThreshold: 5000
    });
    const intervals = processIntervals(normalized.normalizedRows, 500);
    const { maxObservedKw } = findMaxObserved(intervals);

    expect(normalized.diagnostics.countOutliers).toBe(1);
    expect(normalized.diagnostics.firstOutlierTimestamp).toBe('2024-01-01T00:15:00.000Z');
    expect(maxObservedKw).toBeLessThan(5000);
  });

  it('parses Excel serial timestamps correctly through normalization', () => {
    const rows: IntervalRecord[] = [
      { timestamp: '45781', consumptionKwh: 10 },
      { timestamp: '45781.0104166667', consumptionKwh: 11 }
    ];

    const result = normalizeConsumptionSeries(rows, { interpretationMode: 'INTERVAL' });

    expect(result.normalizedRows[0].timestamp.startsWith('2025-05-04')).toBe(true);
    expect(result.normalizedRows[1].timestamp.startsWith('2025-05-04')).toBe(true);
  });
});
