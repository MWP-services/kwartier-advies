import { describe, expect, it } from 'vitest';
import { computePvSelfConsumptionAdvice, processIntervals } from '@/lib/calculations';
import { attachDynamicPricesToIntervals } from '@/lib/pricing';

describe('dynamic pricing', () => {
  it('matches exact and hourly prices and falls back when needed', () => {
    const rows = [
      { timestamp: '2025-01-01T00:00:00.000Z', consumptionKwh: 2, exportKwh: 0 },
      { timestamp: '2025-01-01T00:15:00.000Z', consumptionKwh: 0, exportKwh: 2 },
      { timestamp: '2025-01-01T01:00:00.000Z', consumptionKwh: 2, exportKwh: 0 }
    ];
    const intervals = processIntervals(rows, 500);
    const attached = attachDynamicPricesToIntervals(
      intervals,
      [
        {
          ts: '2025-01-01T00:00:00.000Z',
          importPriceEurPerKwh: 0.4,
          exportPriceEurPerKwh: 0.05
        },
        {
          ts: '2025-01-01T00:30:00.000Z',
          importPriceEurPerKwh: 0.3,
          exportPriceEurPerKwh: 0.06
        }
      ],
      {
        pricingMode: 'dynamic',
        averageImportPriceEurPerKwh: 0.25,
        averageExportPriceEurPerKwh: 0.04,
        fallbackToAveragePrices: true
      }
    );

    expect(attached.pricingStats.totalIntervals).toBe(3);
    expect(attached.pricingStats.exactMatches).toBe(1);
    expect(attached.pricingStats.hourlyMatches).toBe(1);
    expect(attached.pricingStats.fallbackMatches).toBe(1);
    expect(attached.intervalsWithPrices[0].priceSource).toBe('dynamic_exact');
    expect(attached.intervalsWithPrices[1].priceSource).toBe('dynamic_hour');
    expect(attached.intervalsWithPrices[2].priceSource).toBe('average_fallback');
  });

  it('uses interval-based value when pricing mode is dynamic', () => {
    const rows = Array.from({ length: 40 }, (_, dayIndex) => {
      const base = Date.UTC(2025, 5, 1 + dayIndex, 0, 0);
      return [
        { timestamp: new Date(base + 12 * 60 * 60 * 1000).toISOString(), consumptionKwh: 0, exportKwh: 4 },
        { timestamp: new Date(base + 12.25 * 60 * 60 * 1000).toISOString(), consumptionKwh: 0, exportKwh: 4 },
        { timestamp: new Date(base + 19 * 60 * 60 * 1000).toISOString(), consumptionKwh: 4, exportKwh: 0 },
        { timestamp: new Date(base + 19.25 * 60 * 60 * 1000).toISOString(), consumptionKwh: 4, exportKwh: 0 }
      ];
    }).flat();
    const intervals = processIntervals(rows, 500).map((interval) => ({
      ...interval,
      importPriceEurPerKwh: interval.timestamp.includes('T19:') ? 0.45 : 0.2,
      exportPriceEurPerKwh: 0.05,
      priceSource: 'dynamic_exact' as const
    }));

    const hybrid = computePvSelfConsumptionAdvice(intervals, {
      customerType: 'home',
      economics: {
        pricingMode: 'dynamic',
        fallbackToAveragePrices: true,
        importPriceEurPerKwh: 0.3,
        exportCompensationEurPerKwh: 0.05,
        pricingStats: {
          totalIntervals: intervals.length,
          exactMatches: intervals.length,
          hourlyMatches: 0,
          variablePeriodMatches: 0,
          fallbackMatches: 0,
          missingPrices: 0,
          matchedShare: 1
        }
      }
    });

    const recommended = hybrid.simulationAdvice.recommended;
    expect(hybrid.configUsed.pricingMode).toBe('dynamic');
    expect(recommended.dynamicValueEur).toBeDefined();
    expect(recommended.baselineEnergyCostEur).toBeDefined();
    expect(recommended.batteryEnergyCostEur).toBeDefined();
    expect(recommended.annualValueEur).toBe(recommended.dynamicValueEur);
    expect((recommended.valueByInterval ?? []).length).toBe(intervals.length);
  });

  it('accepts import-only price rows and falls back for export-related values', () => {
    const rows = [
      { timestamp: '2025-01-01T12:00:00.000Z', consumptionKwh: 0, exportKwh: 3 },
      { timestamp: '2025-01-01T19:00:00.000Z', consumptionKwh: 3, exportKwh: 0 }
    ];
    const intervals = processIntervals(rows, 500);
    const attached = attachDynamicPricesToIntervals(
      intervals,
      [
        {
          ts: '2025-01-01T12:00:00.000Z',
          importPriceEurPerKwh: 0.31
        },
        {
          ts: '2025-01-01T19:00:00.000Z',
          importPriceEurPerKwh: 0.42
        }
      ],
      {
        pricingMode: 'dynamic',
        averageImportPriceEurPerKwh: 0.3,
        averageExportPriceEurPerKwh: 0.05,
        averageFeedInCostEurPerKwh: 0.01,
        fallbackToAveragePrices: true
      }
    );

    expect(attached.intervalsWithPrices[0].importPriceEurPerKwh).toBe(0.31);
    expect(attached.intervalsWithPrices[0].exportPriceEurPerKwh).toBe(0.05);
    expect(attached.intervalsWithPrices[0].feedInCostEurPerKwh).toBe(0.01);
    expect(attached.intervalsWithPrices[0].pricingIndicative).toBe(true);
  });
});
