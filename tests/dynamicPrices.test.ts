import { describe, expect, it } from 'vitest';
import {
  calculateDynamicIntervalPrices,
  fetchHistoricalDynamicPricesForRange,
  matchDynamicPriceToTimestamp,
  normalizeEnergyZeroPrices,
  normalizeEurPerKwh
} from '@/src/lib/dynamicPrices';

describe('dynamic prices', () => {
  it('normalizes EnergyZero rows to the internal price format', () => {
    const points = normalizeEnergyZeroPrices({
      Prices: [
        { readingDate: '2025-01-01T00:00:00.000Z', price: 120 },
        { readingDate: '2025-01-01T01:00:00.000Z', price: 0.08 }
      ]
    });

    expect(points).toHaveLength(2);
    expect(points[0]).toMatchObject({
      source: 'energyzero',
      zone: 'NL',
      start: '2025-01-01T00:00:00.000Z',
      end: '2025-01-01T01:00:00.000Z'
    });
    expect(points[0].marketPriceEurPerKwh).toBeCloseTo(0.12, 5);
    expect(points[1].marketPriceEurPerKwh).toBeCloseTo(0.08, 5);
  });

  it('converts €/MWh to €/kWh when needed', () => {
    expect(normalizeEurPerKwh(95, 'auto')).toBeCloseTo(0.095, 5);
    expect(normalizeEurPerKwh(0.22, 'auto')).toBeCloseTo(0.22, 5);
  });

  it('matches a customer timestamp to the active price period', () => {
    const points = normalizeEnergyZeroPrices([
      { start: '2025-01-01T00:00:00.000Z', end: '2025-01-01T01:00:00.000Z', price: 0.1 },
      { start: '2025-01-01T01:00:00.000Z', end: '2025-01-01T02:00:00.000Z', price: 0.2 }
    ]);

    const match = matchDynamicPriceToTimestamp('2025-01-01T01:15:00.000Z', points);

    expect(match?.marketPriceEurPerKwh).toBeCloseTo(0.2, 5);
  });

  it('calculates import and export prices from market price and configurable components', () => {
    const prices = calculateDynamicIntervalPrices(0.1, {
      importMarkupEurPerKwh: 0.02,
      exportMarkupEurPerKwh: 0.01,
      fixedEnergyTaxEurPerKwh: 0.03
    });

    expect(prices.importPriceEurPerKwh).toBeCloseTo(0.15, 5);
    expect(prices.exportPriceEurPerKwh).toBeCloseTo(0.09, 5);
  });

  it('fetches a date range and de-duplicates overlapping EnergyZero windows', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          prices: [
            { readingDate: '2025-01-01T00:00:00.000Z', price: 0.1 },
            { readingDate: '2025-01-01T01:00:00.000Z', price: 0.2 }
          ]
        }),
        { status: 200 }
      );

    const points = await fetchHistoricalDynamicPricesForRange(
      '2025-01-01T00:00:00.000Z',
      '2025-01-01T02:00:00.000Z',
      { fetchImpl }
    );

    expect(points.map((point) => point.start)).toEqual([
      '2025-01-01T00:00:00.000Z',
      '2025-01-01T01:00:00.000Z'
    ]);
  });
});

