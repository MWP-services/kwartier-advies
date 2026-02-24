import { describe, expect, it } from 'vitest';
import {
  buildDayKwSeries,
  buildDayProfile,
  buildDataQualityReport,
  computeSizing,
  findMaxObserved,
  groupPeakEvents,
  processIntervals,
  selectMinimumCostBatteryOptions,
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
      timestampLabel: '00:00',
      timestampIso: new Date(2024, 0, 3, 0, 0, 0, 0).toISOString(),
      observedKw: 0
    });
    expect(profile[1].observedKw).toBeCloseTo(100, 5);
    expect(profile[50].observedKw).toBeCloseTo(200, 5);
    expect(profile[95]).toEqual({
      timestampLabel: '23:45',
      timestampIso: new Date(2024, 0, 3, 23, 45, 0, 0).toISOString(),
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

  it('maps 22:00Z to slot 0 of next Amsterdam day during DST', () => {
    const dstRows = [{ timestamp: '2024-09-12T22:00:00.000Z', consumptionKwh: 25 }];
    const intervals = processIntervals(dstRows, 500);
    const profile = buildDayProfile(intervals, '2024-09-13', 15, 'Europe/Amsterdam');

    expect(profile).toHaveLength(96);
    expect(profile[0].timestampLabel).toBe('00:00');
    expect(profile[0].observedKw).toBe(100);
    expect(profile.slice(1).every((point) => point.observedKw === 0)).toBe(true);
  });

  it('buildDayKwSeries aligns with buildDayProfile on 96 HH:mm slots', () => {
    const rows = [
      { timestamp: '2024-09-12T22:00:00.000Z', consumptionKwh: 25 },
      { timestamp: '2024-09-13T10:15:00+02:00', consumptionKwh: 30 }
    ];
    const intervals = processIntervals(rows, 500);
    const dayIso = '2024-09-13';
    const profile = buildDayProfile(intervals, dayIso, 15, 'Europe/Amsterdam');
    const daySeries = buildDayKwSeries(
      intervals.map((interval) => ({ timestamp: interval.timestamp, consumptionKw: interval.consumptionKw })),
      dayIso,
      15,
      'Europe/Amsterdam'
    );

    expect(daySeries).toHaveLength(96);
    expect(daySeries[0].timeLabel).toBe('00:00');
    expect(daySeries[0].consumptionKw).toBe(profile[0].observedKw);
    expect(daySeries[0].timeLabel).toBe(profile[0].timestampLabel);
    expect(daySeries[41].timeLabel).toBe('10:15');
    expect(daySeries[41].consumptionKw).toBe(profile[41].observedKw);
  });

  it('chooses 2x261 kWh for R=500 as lowest cost valid configuration', () => {
    const result = selectMinimumCostBatteryOptions(500);
    expect(result.recommendedProduct.label).toBe('2x 261 kWh (modulair)');
    expect(result.recommendedProduct.capacityKwh).toBe(522);
    expect(result.recommendedProduct.totalPriceEur).toBeCloseTo(87991.92, 2);
  });

  it('chooses 2.09 MWh for R=2000 when cheaper than modular alternatives', () => {
    const result = selectMinimumCostBatteryOptions(2000);
    expect(result.recommendedProduct.label).toBe('WattsNext All-in-one Container 2.09 MWh');
    expect(result.recommendedProduct.capacityKwh).toBe(2090);
    expect(result.recommendedProduct.totalPriceEur).toBeCloseTo(318658.06, 2);
  });

  it('chooses modular 261 kWh stack for R=2600 because it is cheaper than 5.015 MWh', () => {
    const result = selectMinimumCostBatteryOptions(2600);
    expect(result.recommendedProduct.label).toBe('10x 261 kWh (modulair)');
    expect(result.recommendedProduct.capacityKwh).toBe(2610);
    expect(result.recommendedProduct.totalPriceEur).toBeCloseTo(439959.6, 2);
  });

  it('chooses 1x96 over 2x64 for R=70 by total price', () => {
    const result = selectMinimumCostBatteryOptions(70);
    expect(result.recommendedProduct.label).toBe('1x 96 kWh (modulair)');
    expect(result.recommendedProduct.capacityKwh).toBe(96);
    expect(result.recommendedProduct.totalPriceEur).toBeCloseTo(22225.98, 2);
  });

  it('treats near-15-minute timestamp deltas as valid in data quality report', () => {
    const startMs = Date.UTC(2024, 0, 1, 0, 0, 0, 0);
    const rows = [
      { timestamp: new Date(startMs).toISOString(), consumptionKwh: 1 },
      { timestamp: new Date(startMs + 899_999).toISOString(), consumptionKwh: 1 }, // 14.999983 min
      { timestamp: new Date(startMs + 1_800_000).toISOString(), consumptionKwh: 1 }, // +15.000017 min
    ];

    const report = buildDataQualityReport(rows);

    expect(report.non15MinIntervals).toBe(0);
    expect(report.missingIntervalsCount).toBe(0);
  });
});
