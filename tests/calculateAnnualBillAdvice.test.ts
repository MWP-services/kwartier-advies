import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { BATTERY_ADVICE_OPTIONS_KWH, STACK_BATTERY_OPTIONS_KWH, batteryBrochureKey } from '../lib/batteryAdviceOptions';
import { calculateAnnualBillAdvice, practicalAnnualBillOptions, selectAnnualBillBatteryByEnergy } from '@/src/lib/annual-bill/calculateAnnualBillAdvice';

const base = { source: 'manual' as const, totalUsageKwh: 4200, totalFeedInKwh: 1800, consumptionProfile: 'home' as const,
  periodStart: '2025-01-01', periodEnd: '2026-01-01' };

describe('practical candidate set', () => {
  it('keeps capacities within the P90 bound and two catalog neighbours above it', () => {
    expect(practicalAnnualBillOptions([96, 40, 64, 30, 232, 261], 28.8, 0.9)).toEqual([30, 40, 64, 96]);
    expect(practicalAnnualBillOptions([10, 20, 30, 40, 50], 14.4, 0.9)).toEqual([10, 20, 30, 40]);
  });
  it('handles zero need, full reserve, tiny/huge demand and stack-only catalogs', () => {
    expect(practicalAnnualBillOptions(BATTERY_ADVICE_OPTIONS_KWH, 0, 0.9)).toEqual([]);
    expect(practicalAnnualBillOptions(BATTERY_ADVICE_OPTIONS_KWH, 10, 0)).toEqual([]);
    expect(practicalAnnualBillOptions(BATTERY_ADVICE_OPTIONS_KWH, 0.01, 0.9)).toEqual([7.68, 10.24]);
    expect(practicalAnnualBillOptions(BATTERY_ADVICE_OPTIONS_KWH, 10000, 0.9)).toEqual(BATTERY_ADVICE_OPTIONS_KWH);
    expect(practicalAnnualBillOptions(STACK_BATTERY_OPTIONS_KWH, 100, 0.9)).toEqual(STACK_BATTERY_OPTIONS_KWH);
    expect(practicalAnnualBillOptions([30, 40, 64, 96, 232], 25.6, 0.8)).toEqual([30, 40, 64, 96]);
  });
  it('an irrelevant 10 MWh catalog addition does not change small-customer advice', () => {
    expect(calculateAnnualBillAdvice({ ...base, batteryOptionsKwh: [...BATTERY_ADVICE_OPTIONS_KWH, 10000] })).toEqual(calculateAnnualBillAdvice(base));
  });
});

describe('V2 selection and finance', () => {
  it('selects the smallest relevant battery at 80/90/95% of practical import reduction', () => {
    const result = calculateAnnualBillAdvice(base);
    expect(result.recommendationStatus).toBe('recommended');
    expect(result.options.length).toBeLessThan(BATTERY_ADVICE_OPTIONS_KWH.length);
    for (const [target, capacity] of [[0.8, result.conservativeBatteryKwh], [0.9, result.recommendedBatteryKwh], [0.95, result.spaciousBatteryKwh]] as const) {
      expect(capacity).toBe(result.options.find(o => o.percentOfMaximumSavings >= target)?.batteryKwh);
    }
    result.options.forEach(o => expect(existsSync(`public/assets/${batteryBrochureKey(o.batteryKwh)}.pdf`)).toBe(true));
  });
  it('prices delivered and charged energy separately, including conversion losses', () => {
    const result = calculateAnnualBillAdvice({ ...base, averageImportPriceEurPerKwh: 0.32, averageFeedInPriceEurPerKwh: 0.08 });
    for (const option of result.options) {
      expect(option.estimatedAnnualSavingsEur).toBeCloseTo(option.annualGridImportReductionKwh! * 0.32 - option.annualExportReductionKwh! * 0.08, 2);
      expect(option.annualExportReductionKwh!).toBeGreaterThan(option.annualGridImportReductionKwh!);
    }
  });
  it('preserves technical results and confidence under extreme prices and investments', () => {
    const normal = calculateAnnualBillAdvice(base);
    for (const prices of [{ averageImportPriceEurPerKwh: 0.01, averageFeedInPriceEurPerKwh: 0.5 },
      { averageImportPriceEurPerKwh: 0.6, averageFeedInPriceEurPerKwh: -0.1 },
      { batteryInvestmentsEurByKwh: Object.fromEntries(BATTERY_ADVICE_OPTIONS_KWH.map((n, i) => [n, i % 2 ? 1e12 : 0.01])) }]) {
      const result = calculateAnnualBillAdvice({ ...base, ...prices });
      expect([result.conservativeBatteryKwh, result.recommendedBatteryKwh, result.spaciousBatteryKwh, result.confidence]).toEqual([normal.conservativeBatteryKwh, normal.recommendedBatteryKwh, normal.spaciousBatteryKwh, normal.confidence]);
      expect(result.options.map(o => o.technicalSimulation)).toEqual(normal.options.map(o => o.technicalSimulation));
    }
  });
  it('allows medium confidence with brochure specs and no financial input', () => {
    const result = calculateAnnualBillAdvice({ ...base, totalUsageKwh: 350000, totalFeedInKwh: 160000, consumptionProfile: 'business', batteryOptionsKwh: [232] });
    expect(result.confidence).toBe('medium');
    expect(calculateAnnualBillAdvice({ ...base, batteryOptionsKwh: [10.24] }).confidence).toBe('low');
    expect(calculateAnnualBillAdvice({ ...base, consumptionProfile: undefined }).confidence).toBe('low');
  });
  it('binds quotes to specific capacities only', () => {
    const options = { ...base, batteryOptionsKwh: [5, 10, 15] };
    const normal = calculateAnnualBillAdvice(options);
    expect(calculateAnnualBillAdvice({ ...options, batteryInvestmentEur: 7000 }).options).toEqual(normal.options);
    const bound = calculateAnnualBillAdvice({ ...options, batteryInvestmentEur: 7000, batteryInvestmentCapacityKwh: 10, batteryInvestmentsEurByKwh: { 10: 6000 } });
    expect(bound.options.find(o => o.batteryKwh === 10)?.estimatedInvestmentEur).toBe(6000);
    expect(bound.recommendedBatteryKwh).toBe(normal.recommendedBatteryKwh);
  });
  it.each([{ totalUsageKwh: undefined }, { totalFeedInKwh: undefined }])('requires both directions: %j', missing => {
    const result = calculateAnnualBillAdvice({ ...base, ...missing });
    expect(result.recommendationStatus).toBe('insufficient_data');
    expect(result.recommendedBatteryKwh).toBeNull();
    expect(result.options).toEqual([]);
  });
  it.each([{ totalUsageKwh: 0 }, { totalFeedInKwh: 0 }])('accepts explicit zero: %j', zero => {
    const result = calculateAnnualBillAdvice({ ...base, ...zero });
    expect(result.recommendationStatus).toBe('no_solar_shift');
    expect(result.recommendedBatteryKwh).toBeNull();
  });
  it('rejects conflicting generation/export and reports marginal physical gain', () => {
    expect(calculateAnnualBillAdvice({ ...base, annualPvProductionKwh: 1000 }).recommendationStatus).toBe('insufficient_data');
    const result = calculateAnnualBillAdvice(base);
    for (let i = 1; i < result.options.length; i++) {
      const previous = result.options[i - 1]; const current = result.options[i];
      expect(current.marginalGainKwh).toBeCloseTo(current.annualGridImportReductionKwh! - previous.annualGridImportReductionKwh!);
      expect(current.marginalGainPerAddedKwh).toBeCloseTo(current.marginalGainKwh! / (current.batteryKwh - previous.batteryKwh));
    }
  });
});

describe('annual energy selection', () => {
  it.each([0.8, 0.9, 0.95])('uses the exact %s energy threshold and picks the smallest matching option', target => {
    const options = [{ batteryKwh: 5, annualGridImportReductionKwh: target * 1000 - 0.001 }, { batteryKwh: 10, annualGridImportReductionKwh: target * 1000 }, { batteryKwh: 20, annualGridImportReductionKwh: 1000 }];
    expect(selectAnnualBillBatteryByEnergy(options, target).recommended?.batteryKwh).toBe(10);
  });
  const example = [
    { batteryKwh: 20.48, annualGridImportReductionKwh: 2190 },
    { batteryKwh: 64, annualGridImportReductionKwh: 5080 },
    { batteryKwh: 96, annualGridImportReductionKwh: 6261 },
    { batteryKwh: 232, annualGridImportReductionKwh: 6700 },
    { batteryKwh: 5015, annualGridImportReductionKwh: 6850 }
  ];

  it('selects 96 kWh in the supplied example, regardless of input ordering or financial values', () => {
    const comparison = selectAnnualBillBatteryByEnergy([...example].reverse());
    expect(comparison.maxAnnualSavingsKwh).toBe(6850);
    expect(comparison.recommended?.batteryKwh).toBe(96);
    expect(comparison.recommended?.percentOfMaximumSavings).toBeCloseTo(6261 / 6850);
    expect(comparison.options.at(-1)?.percentOfMaximumSavings).toBe(1);
    const extremePrices = example.map((option, index) => ({ ...option,
      estimatedInvestmentEur: index === 0 ? 0.01 : 1e12,
      estimatedAnnualSavingsEur: index === 0 ? 1e9 : 0,
      estimatedPaybackYears: index === 0 ? 0.01 : 1e9
    }));
    expect(selectAnnualBillBatteryByEnergy(extremePrices).recommended?.batteryKwh).toBe(96);
  });

  it.each([[899.999, 20], [900, 10], [900.001, 10]])('applies the exact 90 percent boundary without rounding (%s kWh)', (energy, capacity) => {
    const result = selectAnnualBillBatteryByEnergy([
      { batteryKwh: 10, annualGridImportReductionKwh: energy },
      { batteryKwh: 20, annualGridImportReductionKwh: 1000 }
    ]);
    expect(result.recommended?.batteryKwh).toBe(capacity);
  });

  it('selects the smallest capacity on a plateau and returns no recommendation for empty or zero results', () => {
    expect(selectAnnualBillBatteryByEnergy([
      { batteryKwh: 20, annualGridImportReductionKwh: 1000 },
      { batteryKwh: 10, annualGridImportReductionKwh: 1000 }
    ]).recommended?.batteryKwh).toBe(10);
    expect(selectAnnualBillBatteryByEnergy([]).recommended).toBeNull();
    const zero = selectAnnualBillBatteryByEnergy(example.map(option => ({ ...option, annualGridImportReductionKwh: 0 })));
    expect(zero.recommended).toBeNull();
    expect(zero.options.every(option => option.percentOfMaximumSavings === 0)).toBe(true);
  });
});
