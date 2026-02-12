import { describe, expect, it } from 'vitest';
import {
  buildDayProfile,
  computeSizing,
  findMaxObserved,
  groupPeakEvents,
  processIntervals,
  selectTopExceededIntervals
} from '@/lib/calculations';

const rows = Array.from({ length: 12 }, (_, idx) => ({
  timestamp: new Date(Date.UTC(2024, 0, 1, 0, idx * 15)).toISOString(),
  consumptionKwh: idx >= 2 && idx <= 4 ? 200 : idx >= 8 && idx <= 10 ? 160 : 100
}));

describe('calculations', () => {
  it('groups peak events correctly', () => {
    const intervals = processIntervals(rows, 500);
    const events = groupPeakEvents(intervals);
    expect(events).toHaveLength(2);
    expect(events[0].durationIntervals).toBe(3);
    expect(events[1].durationIntervals).toBe(3);
  });

  it('P95 falls back to MAX_PEAK when fewer than 20 events', () => {
    const intervals = processIntervals(rows, 500);
    const events = groupPeakEvents(intervals);
    const result = computeSizing({
      intervals,
      events,
      method: 'P95',
      compliance: 1,
      safetyFactor: 1,
      efficiency: 1
    });
    const max = computeSizing({
      intervals,
      events,
      method: 'MAX_PEAK',
      compliance: 1,
      safetyFactor: 1,
      efficiency: 1
    });

    expect(result.kWhNeededRaw).toBe(max.kWhNeededRaw);
    expect(result.kWNeededRaw).toBe(max.kWNeededRaw);
  });

  it('applies compliance to raw sizing', () => {
    const intervals = processIntervals(rows, 500);
    const events = groupPeakEvents(intervals);
    const full = computeSizing({
      intervals,
      events,
      method: 'MAX_PEAK',
      compliance: 1,
      safetyFactor: 1,
      efficiency: 1
    });
    const partial = computeSizing({
      intervals,
      events,
      method: 'MAX_PEAK',
      compliance: 0.8,
      safetyFactor: 1,
      efficiency: 1
    });

    expect(partial.kWhNeededRaw).toBeCloseTo(full.kWhNeededRaw * 0.8, 5);
    expect(partial.kWNeededRaw).toBeCloseTo(full.kWNeededRaw * 0.8, 5);
  });

  it('selects earliest timestamp when max observed kW ties', () => {
    const tieRows = [
      { timestamp: '2024-01-01T00:00:00.000Z', consumptionKwh: 200 },
      { timestamp: '2024-01-01T00:15:00.000Z', consumptionKwh: 200 },
      { timestamp: '2024-01-01T00:30:00.000Z', consumptionKwh: 100 }
    ];
    const intervals = processIntervals(tieRows, 500);
    const result = findMaxObserved(intervals);

    expect(result.maxObservedKw).toBeCloseTo(800, 5);
    expect(result.maxObservedTimestamp).toBe('2024-01-01T00:00:00.000Z');
  });

  it('returns top 20 exceeded intervals sorted by excess desc then timestamp asc', () => {
    const manyRows = Array.from({ length: 25 }, (_, idx) => {
      const consumptionKw = 510 + idx;
      return {
        timestamp: new Date(Date.UTC(2024, 0, 2, 0, idx * 15)).toISOString(),
        consumptionKwh: consumptionKw * 0.25
      };
    });
    manyRows[20].consumptionKwh = manyRows[21].consumptionKwh;

    const intervals = processIntervals(manyRows, 500);
    const top20 = selectTopExceededIntervals(intervals, '2024-01-02', 20);

    expect(top20).toHaveLength(20);
    expect(top20[0].excess_kW).toBeGreaterThanOrEqual(top20[1].excess_kW);
    const tsA = new Date(Date.UTC(2024, 0, 2, 5, 0)).toISOString();
    const tsB = new Date(Date.UTC(2024, 0, 2, 5, 15)).toISOString();
    expect(top20.findIndex((interval) => interval.timestamp === tsA)).toBeLessThan(
      top20.findIndex((interval) => interval.timestamp === tsB)
    );
  });

  it('stores one peak timestamp per event based on max excess and earliest tie', () => {
    const eventRows = [
      { timestamp: '2024-01-01T00:00:00.000Z', consumptionKwh: 140 },
      { timestamp: '2024-01-01T00:15:00.000Z', consumptionKwh: 180 },
      { timestamp: '2024-01-01T00:30:00.000Z', consumptionKwh: 180 },
      { timestamp: '2024-01-01T00:45:00.000Z', consumptionKwh: 100 }
    ];
    const intervals = processIntervals(eventRows, 500);
    const events = groupPeakEvents(intervals);

    expect(events).toHaveLength(1);
    expect(events[0].maxExcessKw).toBeCloseTo(220, 5);
    expect(events[0].peakTimestamp).toBe('2024-01-01T00:15:00.000Z');
  });

  it('builds a full 96-point day profile and fills missing quarters with 0', () => {
    const sparseRows = [
      { timestamp: '2024-01-03T00:15:00+01:00', consumptionKwh: 25 },
      { timestamp: '2024-01-03T12:30:00+01:00', consumptionKwh: 50 },
      { timestamp: '2024-01-03T23:45:00+01:00', consumptionKwh: 75 },
      { timestamp: '2024-01-04T00:00:00+01:00', consumptionKwh: 100 }
    ];
    const intervals = processIntervals(sparseRows, 500);
    const profile = buildDayProfile(intervals, '2024-01-03');

    expect(profile).toHaveLength(96);
    expect(profile[0]).toEqual({
      timestamp: new Date(2024, 0, 3, 0, 0, 0, 0).toISOString(),
      observedKw: 0
    });
    expect(profile[1].observedKw).toBeCloseTo(100, 5);
    expect(profile[50].observedKw).toBeCloseTo(200, 5);
    expect(profile[95]).toEqual({
      timestamp: new Date(2024, 0, 3, 23, 45, 0, 0).toISOString(),
      observedKw: 300
    });
  });

  it('maps local winter midnight interval to slot 0 for Amsterdam day profile', () => {
    const winterRows = [{ timestamp: '2024-11-20T00:00:00+01:00', consumptionKwh: 25 }];
    const intervals = processIntervals(winterRows, 500);
    const profile = buildDayProfile(intervals, '2024-11-20');

    expect(profile).toHaveLength(96);
    expect(profile[0].observedKw).toBe(100);
    expect(profile.slice(1).every((point) => point.observedKw === 0)).toBe(true);
  });
});
