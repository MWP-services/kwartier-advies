import { describe, expect, it } from 'vitest';
import { computeSizing, groupPeakEvents, processIntervals } from '@/lib/calculations';

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
});
