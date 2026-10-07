import { describe, expect, it } from 'vitest';
import { extractAnnualBillData } from '../src/lib/annual-bill/extractAnnualBillData';
import { normalizeAnnualBillData } from '../src/lib/annual-bill/normalizeAnnualBillData';
import { prepareDynamicAnnualContext, simulateDynamicBattery, type SimulatedHour } from '../src/lib/annual-bill/simulateDynamicAnnualBill';
import { fetchRecentMarketYear, validateMarketYear, type MarketYear } from '../src/lib/annual-bill/recentDynamicPrices';
import { calculateAnnualBillAdvice } from '../src/lib/annual-bill/calculateAnnualBillAdvice';
import { buildAnnualBillIndicativeAnalysis } from '../lib/annualBillAdvice';
import { defaultAnalysisSettings } from '../lib/analysis';
import { generateAnnualBillReportHtml } from '../lib/annualBillReportHtml';

function marketYear(): MarketYear {
  const start = '2025-09-30T00:00:00.000Z';
  return { start, end: '2026-09-30T00:00:00.000Z', fetchedAt: '2026-09-30T10:00:00.000Z', source: 'EnergyZero test', hours: Array.from({ length: 8760 }, (_, i) => ({ start: new Date(Date.parse(start) + i * 3600000).toISOString(), marketPriceEurPerKwh: i % 24 < 6 ? -0.02 : i % 24 >= 16 ? 0.3 : 0.07 })) };
}
const costs = { dynamicImportMarkupEurPerKwh: 0.02, dynamicExportDeductionEurPerKwh: 0.01, energyTaxEurPerKwh: 0.12, energyTaxVat: 'excluded' as const, electricityVatPercent: 21 };

describe('annual bill contract recognition', () => {
  it.each([
    ['Uw elektriciteit: dynamisch contract', 'dynamic'],
    ['Contracttype: vast', 'fixed'],
    ['Stroom variabel tarief', 'variable'],
    ['Vaste leveringskosten 12 EUR\nLeverancier Tibber', 'unknown'],
    ['Gas: vast contract\nElektriciteit: dynamisch contract', 'dynamic'],
    ['Gas\nVast contract\nElektriciteit\nDynamisch contract', 'dynamic'],
    ['Kies een dynamisch contract\nUw vast contract', 'fixed'],
    ['Vast contract januari\nDynamisch contract februari', 'unknown'],
    ['Geen dynamisch contract', 'unknown']
  ])('recognizes only contract evidence: %s', (text, expected) => {
    expect(normalizeAnnualBillData(extractAnnualBillData(text)).contractType).toBe(expected);
  });
});

describe('dynamic year source', () => {
  it('fetches a complete rolling year using the real API shape, preserving negative prices and EUR/kWh', async () => {
    let active = 0;
    let maxActive = 0;
    const fetchImpl = async (url: URL | RequestInfo): Promise<Response> => {
      active++;
      maxActive = Math.max(maxActive, active);
      const params = new URL(String(url)).searchParams;
      expect(params.get('interval')).toBe('INTERVAL_HOUR');
      const [day, month, year] = params.get('date')!.split('-').map(Number);
      const time = Date.UTC(year, month - 1, day) - 86400000;
      await Promise.resolve();
      active--;
      return { ok: true, json: async () => ({ base: Array.from({ length: 72 }, (_, i) => ({ start: new Date(time + i * 3600000).toISOString(), end: new Date(time + (i + 1) * 3600000).toISOString(), price: { value: i % 2 ? '-0.15' : '6.5' } })) }) } as Response;
    };
    // Overlapping requests must agree; use a timestamp-dependent price.
    const stableFetch = async (url: URL | RequestInfo) => {
      const response = await fetchImpl(url);
      const payload = await response.json();
      payload.base.forEach((row: { start: string; price: { value: string } }) => { row.price.value = Date.parse(row.start) / 3600000 % 2 ? '-0.15' : '6.5'; });
      return { ok: true, json: async () => payload } as Response;
    };
    const result = await fetchRecentMarketYear(new Date('2026-09-30T12:00:00Z'), stableFetch as typeof fetch);
    expect(result.hours).toHaveLength(8760);
    expect(result.start).toBe('2025-09-30T00:00:00.000Z');
    expect(result.end).toBe('2026-09-30T00:00:00.000Z');
    expect(result.hours.some((hour) => hour.marketPriceEurPerKwh === 6.5)).toBe(true);
    expect(result.hours.some((hour) => hour.marketPriceEurPerKwh === -0.15)).toBe(true);
    expect(maxActive).toBeLessThanOrEqual(4);
  });
  it('rejects gaps and duplicate hours instead of inventing prices', () => {
    const year = marketYear();
    expect(() => validateMarketYear(year.hours.slice(1), year.start, year.end)).toThrow();
    year.hours[100] = year.hours[99];
    expect(() => validateMarketYear(year.hours, year.start, year.end)).toThrow();
  });
  it('rejects an empty provider response without a tariff fallback', async () => {
    await expect(fetchRecentMarketYear(new Date('2026-09-30'), (async () => ({ ok: true, json: async () => ({ base: [] }) })) as unknown as typeof fetch)).rejects.toThrow('geen gemiddelde prijs');
  });
});

describe('dynamic annual consumption and battery simulation', () => {
  it('limits a 40 kWh battery to a 20 kW inverter in both directions', () => {
    const hours: SimulatedHour[] = [
      { start: '2026-01-01T12:00:00Z', importKwh: 0, exportKwh: 100, importPrice: 0.1, exportPrice: 0.06 },
      { start: '2026-01-01T13:00:00Z', importKwh: 100, exportKwh: 0, importPrice: 0.4, exportPrice: 0.06 }
    ];
    const charged = simulateDynamicBattery(hours, 40, 0.9);
    expect(charged.inverterPowerKw).toBe(20);
    expect(charged.chargedSolarKwh + charged.chargedFromGridKwh).toBe(20);
    expect(charged.deliveredSolarKwh).toBeCloseTo(19);
    const discharged = simulateDynamicBattery([hours[0], { ...hours[0], start: '2026-01-01T13:00:00Z' }, { ...hours[1], start: '2026-01-01T14:00:00Z' }], 40, 0.9);
    expect(discharged.deliveredSolarKwh + discharged.deliveredGridKwh).toBe(20);
  });
  it('allows more than 365 cycles when repeated daily price opportunities and demand permit them', () => {
    const hours: SimulatedHour[] = Array.from({ length: 8760 }, (_, i) => ({
      start: new Date(Date.UTC(2025, 0, 1) + i * 3600000).toISOString(),
      importKwh: i % 12 >= 6 ? 40 : 0, exportKwh: 0,
      importPrice: i % 12 >= 6 ? 0.4 : 0.05, exportPrice: 0
    }));
    const result = simulateDynamicBattery(hours, 40, 0.9);
    expect(result.equivalentFullCycles).toBeGreaterThan(700);
    expect(result.equivalentFullCycles).toBeLessThanOrEqual(730);
    expect(result.equivalentFullCycles).toBeCloseTo((result.deliveredSolarKwh + result.deliveredGridKwh) / 36);
    expect(result.chargedFromGridKwh).toBeCloseTo(result.deliveredGridKwh + result.lossesKwh + result.finalStoredKwh, 6);
  });
  it('preserves annual totals across DST and applies tax and VAT exactly once', () => {
    const context = prepareDynamicAnnualContext(costs, marketYear(), 4200, 1800);
    expect(context.hours.reduce((sum, hour) => sum + hour.importKwh, 0)).toBeCloseTo(4200, 7);
    expect(context.hours.reduce((sum, hour) => sum + hour.exportKwh, 0)).toBeCloseTo(1800, 7);
    expect(context.hours[0].importPrice).toBeCloseTo((-0.02 + 0.02 + 0.12) * 1.21, 8);
    expect(context.hours[0].exportPrice).toBeCloseTo((-0.02 - 0.01) * 1.21, 8);
    const inclusive = prepareDynamicAnnualContext({ ...costs, energyTaxVat: 'included', energyTaxEurPerKwh: 0.12 * 1.21 }, marketYear(), 4200, 1800);
    expect(inclusive.hours[0].importPrice).toBeCloseTo(context.hours[0].importPrice, 8);
    const business = prepareDynamicAnnualContext({ ...costs, consumptionProfile: 'business' }, marketYear(), 4200, 1800);
    expect(business.metadata.averageImportPrice).not.toBeCloseTo(context.metadata.averageImportPrice, 4);
  });
  it('accounts for losses, grid charging and missed export exactly once', () => {
    const context = prepareDynamicAnnualContext(costs, marketYear(), 4200, 1800);
    const result = simulateDynamicBattery(context.hours, 10, 0.8);
    expect(result.chargedFromGridKwh).toBeGreaterThan(0);
    expect(result.savingsEur).toBeCloseTo(result.avoidedImportCostEur - result.lostExportRevenueEur, 7);
    expect(result.baselineCostEur - result.batteryCostEur).toBeCloseTo(result.savingsEur, 7);
    expect(result.chargedSolarKwh + result.chargedFromGridKwh).toBeCloseTo(result.deliveredSolarKwh + result.deliveredGridKwh + result.lossesKwh + result.finalStoredKwh, 7);
    expect(result.importAfterKwh).toBeCloseTo(4200 + result.chargedFromGridKwh - result.deliveredSolarKwh - result.deliveredGridKwh, 7);
    expect(result.exportAfterKwh).toBeCloseTo(1800 - result.chargedSolarKwh, 7);
    expect(result.finalStoredKwh).toBeLessThanOrEqual(8 + 1e-8);
  });
  it('uses prices at the actual simulated hour and accounts for lost export on charging energy', () => {
    const hours: SimulatedHour[] = [
      { start: '2026-01-01T12:00:00Z', importKwh: 0, exportKwh: 10, importPrice: 0.1, exportPrice: 0.06 },
      { start: '2026-01-01T13:00:00Z', importKwh: 10, exportKwh: 0, importPrice: 0.4, exportPrice: 0.06 }
    ];
    const result = simulateDynamicBattery(hours, 20, 0.9, 0.95);
    expect(result.deliveredSolarKwh).toBeCloseTo(9.5);
    expect(result.savingsEur).toBeCloseTo(9.5 * 0.4 - 10 * 0.06);
    const cheaper = simulateDynamicBattery([hours[0], { ...hours[1], importPrice: 0.2 }], 20, 0.9);
    expect(cheaper.savingsEur).toBeLessThan(result.savingsEur);
  });
  it('does not recommend a battery with flat prices and no solar', () => {
    const year = marketYear();
    year.hours.forEach((hour) => { hour.marketPriceEurPerKwh = 0.2; });
    const dynamicContext = prepareDynamicAnnualContext(costs, year, 4200, 0);
    const result = calculateAnnualBillAdvice({ totalUsageKwh: 4200, totalFeedInKwh: 0, dynamicContext });
    expect(result.recommendedBatteryKwh).toBeNull();
    expect(result.annualSavingsRangeEur.expected).toBe(0);
    expect(result.paybackRangeYears.expected).toBeNull();
  });
  it('preserves dynamic simulation but selects by solar kWh independently of investment', () => {
    const dynamicContext = prepareDynamicAnnualContext(costs, marketYear(), 4200, 1800);
    const input = { totalUsageKwh: 4200, totalFeedInKwh: 1800, batteryOptionsKwh: [5, 10, 15], dynamicContext };
    const result = calculateAnnualBillAdvice(input);
    for (const option of result.options) {
      const simulated = simulateDynamicBattery(dynamicContext.hours, option.batteryKwh, 0.9, 0.95);
      expect(option.dynamicSimulation).toEqual(simulated);
      expect(option.estimatedInvestmentEur).toBe(option.batteryKwh * 900);
      expect(option.estimatedPaybackYears).toBe(Math.round(option.estimatedInvestmentEur / simulated.savingsEur * 100) / 100);
    }
    const maxSolar = Math.max(...result.options.map(option => option.estimatedAnnualStoredSolarKwh));
    const expected = result.options.find(option => option.estimatedAnnualStoredSolarKwh / maxSolar >= 0.9)!;
    expect(result.recommendedBatteryKwh).toBe(expected.batteryKwh);
    const extremePrices = calculateAnnualBillAdvice({ ...input, batteryInvestmentsEurByKwh: { 5: 0.01, 10: 1e12, 15: 1e15 } });
    expect(extremePrices.recommendedBatteryKwh).toBe(result.recommendedBatteryKwh);
    const ambiguousQuote = calculateAnnualBillAdvice({ ...input, batteryInvestmentEur: 7000 });
    expect(ambiguousQuote.options).toEqual(result.options);
    expect(ambiguousQuote.recommendedBatteryKwh).toBe(result.recommendedBatteryKwh);
  });
  it('does not recommend a battery for trading profit alone when there is no solar shift', () => {
    const dynamicContext = prepareDynamicAnnualContext(costs, marketYear(), 4200, 0);
    const result = calculateAnnualBillAdvice({ totalUsageKwh: 4200, totalFeedInKwh: 0, dynamicContext });
    expect(result.options).toEqual([]);
    expect(result.options.every(option => option.percentOfMaximumSavings === 0)).toBe(true);
    expect(result.recommendedBatteryKwh).toBeNull();
  });

  it('integrates dynamic results and report provenance using the solar energy selection', () => {
    const input = { ...costs, contractType: 'dynamic' as const, totalUsageKwh: 4200, totalFeedInKwh: 1800 };
    const withoutPrices = buildAnnualBillIndicativeAnalysis(input, defaultAnalysisSettings)!;
    const result = buildAnnualBillIndicativeAnalysis(input, defaultAnalysisSettings, marketYear())!;
    expect(result.annualBillAdvice!.annualSavingsRangeEur.expected).toBeGreaterThan(0);
    const html = generateAnnualBillReportHtml({ input, advice: result.annualBillAdvice! }, null, null);
    expect(html).toContain('Dynamische prijssimulatie');
    expect(html).toContain('2025-09-30');
    expect(html).toContain('8760 uurprijzen');
    expect(html).toContain('Gemiste terugleveropbrengst');
    expect(withoutPrices.annualBillAdvice!.recommendedBatteryKwh).toBe(result.annualBillAdvice!.recommendedBatteryKwh);
    expect(withoutPrices.annualBillAdvice!.warnings.join(' ')).toContain('marktprijzen ontbreken');
  });

  it('fixed, variable, dynamic and a different market year have exactly the same technical advice', () => {
    const input = { ...costs, source: 'manual' as const, totalUsageKwh: 4200, totalFeedInKwh: 1800, consumptionProfile: 'home' as const };
    const otherYear = marketYear();
    otherYear.start = '2024-09-30T00:00:00.000Z'; otherYear.end = '2025-09-30T00:00:00.000Z';
    otherYear.hours = otherYear.hours.map((hour, i) => ({ start: new Date(Date.parse(otherYear.start) + i * 3600000).toISOString(), marketPriceEurPerKwh: -hour.marketPriceEurPerKwh }));
    const results = (['fixed', 'variable', 'dynamic', 'dynamic'] as const).map((contractType, i) => buildAnnualBillIndicativeAnalysis({ ...input, contractType }, defaultAnalysisSettings, i === 3 ? otherYear : marketYear())!.annualBillAdvice!);
    for (const result of results.slice(1)) {
      expect([result.recommendedBatteryKwh, result.conservativeBatteryKwh, result.spaciousBatteryKwh, result.confidence]).toEqual([results[0].recommendedBatteryKwh, results[0].conservativeBatteryKwh, results[0].spaciousBatteryKwh, results[0].confidence]);
      expect(result.options.map(o => o.technicalSimulation)).toEqual(results[0].options.map(o => o.technicalSimulation));
    }
    const invalidFinance = buildAnnualBillIndicativeAnalysis({ ...input, contractType: 'dynamic', electricityVatPercent: -1 }, defaultAnalysisSettings, marketYear())!.annualBillAdvice!;
    expect(invalidFinance.recommendedBatteryKwh).toBe(results[0].recommendedBatteryKwh);
    expect(invalidFinance.warnings.join(' ')).toContain('financieel model niet beschikbaar');
  });
});
