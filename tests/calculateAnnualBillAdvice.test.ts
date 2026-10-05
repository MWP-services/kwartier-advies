import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { STACK_BATTERY_OPTIONS_KWH, batteryBrochureKey } from '../lib/batteryAdviceOptions';
import { calculateAnnualBillAdvice, selectAnnualBillBatteryByEnergy } from '@/src/lib/annual-bill/calculateAnnualBillAdvice';

describe('annual energy selection', () => {
  const example = [
    { batteryKwh: 20.48, estimatedAnnualStoredSolarKwh: 2190 },
    { batteryKwh: 64, estimatedAnnualStoredSolarKwh: 5080 },
    { batteryKwh: 96, estimatedAnnualStoredSolarKwh: 6261 },
    { batteryKwh: 232, estimatedAnnualStoredSolarKwh: 6700 },
    { batteryKwh: 5015, estimatedAnnualStoredSolarKwh: 6850 }
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
      { batteryKwh: 10, estimatedAnnualStoredSolarKwh: energy },
      { batteryKwh: 20, estimatedAnnualStoredSolarKwh: 1000 }
    ]);
    expect(result.recommended?.batteryKwh).toBe(capacity);
  });

  it('selects the smallest capacity on a plateau and returns no recommendation for empty or zero results', () => {
    expect(selectAnnualBillBatteryByEnergy([
      { batteryKwh: 20, estimatedAnnualStoredSolarKwh: 1000 },
      { batteryKwh: 10, estimatedAnnualStoredSolarKwh: 1000 }
    ]).recommended?.batteryKwh).toBe(10);
    expect(selectAnnualBillBatteryByEnergy([]).recommended).toBeNull();
    const zero = selectAnnualBillBatteryByEnergy(example.map(option => ({ ...option, estimatedAnnualStoredSolarKwh: 0 })));
    expect(zero.recommended).toBeNull();
    expect(zero.options.every(option => option.percentOfMaximumSavings === 0)).toBe(true);
  });
});

describe('calculate annual bill battery advice', () => {
  it('compares supported systems and selects the smallest one reaching 90 percent of maximum solar shift', () => {
    // Legacy 5/10/15/20 kWh placeholders are replaced by the exact stack systems.
    const capacities = [30, 40, 64, 96, 232, 261, 2090, 5015];
    const result = calculateAnnualBillAdvice({ totalUsageKwh: 4200, totalFeedInKwh: 1800 });
    expect(result.options.map((option) => option.batteryKwh)).toEqual([...capacities, ...STACK_BATTERY_OPTIONS_KWH].sort((a, b) => a - b));
    result.options.forEach((option) => expect(existsSync(`public/assets/${batteryBrochureKey(option.batteryKwh)}.pdf`)).toBe(true));
    expect(result.recommendedBatteryKwh).toBe(20.48);
    expect(result.options.find(option => option.batteryKwh === result.recommendedBatteryKwh)?.percentOfMaximumSavings).toBeGreaterThanOrEqual(0.9);
    expect(result.options.filter(option => option.batteryKwh < result.recommendedBatteryKwh!).every(option => option.percentOfMaximumSavings < 0.9)).toBe(true);
    expect(result.warnings.join(' ')).toContain('geen uitspraak over rendabiliteit');
  });

  it('calculates recommendation, savings range and payback from annual bill totals', () => {
    const result = calculateAnnualBillAdvice({
      totalUsageKwh: 4200,
      totalFeedInKwh: 1800,
      annualPvProductionKwh: 5200,
      averageImportPriceEurPerKwh: 0.32,
      averageFeedInPriceEurPerKwh: 0.08,
      batteryInvestmentsEurByKwh: { 5: 7000, 10: 8000, 15: 13000 },
      batteryOptionsKwh: [5, 10, 15],
      periodStart: '2025-01-01',
      periodEnd: '2025-12-31'
    });

    expect(result.recommendedBatteryKwh).not.toBeNull();
    expect(result.totalUsageKwh).toBe(4200);
    expect(result.totalFeedInKwh).toBe(1800);
    expect(result.annualSavingsRangeEur.expected).toBeGreaterThan(0);
    expect(result.paybackRangeYears.expected).toBeGreaterThan(0);
    expect(result.confidence).toBe('medium');
    expect(result.minimumSocPercent).toBe(10);
    expect(result.efficiencyPercent).toBe(95);
  });

  const pricedInput = {
    totalUsageKwh: 4200, totalFeedInKwh: 1800,
    averageImportPriceEurPerKwh: 0.32, averageFeedInPriceEurPerKwh: 0.08,
    batteryOptionsKwh: [5, 10, 15]
  };

  it('ignores investment differences and payback in the actual annual calculation', () => {
    const input = { ...pricedInput, batteryInvestmentsEurByKwh: { 5: 7000, 10: 8000, 15: 13000 } };
    const result = calculateAnnualBillAdvice(input);
    const [small, medium, large] = result.options;
    expect(small.utilizationScore).toBeGreaterThan(medium.utilizationScore);
    expect(small.estimatedAnnualSavingsEur).toBeGreaterThan(medium.estimatedAnnualSavingsEur - small.estimatedAnnualSavingsEur);
    expect(medium.estimatedPaybackYears).toBeLessThan(small.estimatedPaybackYears!);
    expect(medium.estimatedPaybackYears).toBeLessThan(large.estimatedPaybackYears!);
    expect(result.recommendedBatteryKwh).toBe(15);
    expect(medium.percentOfMaximumSavings).toBeLessThan(0.9);
    expect(large.percentOfMaximumSavings).toBe(1);
    // Financial fields still change, but neither very cheap small nor very expensive large batteries affect selection.
    const extreme = calculateAnnualBillAdvice({ ...input, batteryInvestmentsEurByKwh: { 5: 0.01, 10: 1, 15: 1e12 } });
    expect(extreme.recommendedBatteryKwh).toBe(15);
    expect(extreme.options[2].estimatedPaybackYears).not.toBe(large.estimatedPaybackYears);
    expect(extreme.options.map(option => option.percentOfMaximumSavings)).toEqual(result.options.map(option => option.percentOfMaximumSavings));
    const extended = calculateAnnualBillAdvice({ ...input, batteryOptionsKwh: [2, 5, 10, 15], batteryInvestmentsEurByKwh: { ...input.batteryInvestmentsEurByKwh, 2: 9000 } });
    expect(extended.recommendedBatteryKwh).toBe(15);
  });

  it('does not apply a single unbound investment to every capacity or let it determine the recommendation', () => {
    const baseline = calculateAnnualBillAdvice(pricedInput);
    for (const batteryInvestmentEur of [1000, 70000]) {
      const result = calculateAnnualBillAdvice({ ...pricedInput, batteryInvestmentEur });
      expect(result.options).toEqual(baseline.options);
      expect(result.recommendedBatteryKwh).toBe(baseline.recommendedBatteryKwh);
      expect(result.warnings.join(' ')).toContain('investeringsbedrag is niet gebruikt');
      expect(new Set(result.options.map(option => option.estimatedInvestmentEur)).size).toBe(3);
    }
  });

  it('binds a quote only to its specified capacity, with per-option quotes taking precedence', () => {
    const result = calculateAnnualBillAdvice({ ...pricedInput, batteryInvestmentEur: 7000, batteryInvestmentCapacityKwh: 10 });
    expect(result.options.map(option => [option.estimatedInvestmentEur, option.investmentSource]))
      .toEqual([[4500, 'estimated'], [7000, 'quoted'], [13500, 'estimated']]);
    const specific = calculateAnnualBillAdvice({ ...pricedInput, batteryInvestmentEur: 7000, batteryInvestmentCapacityKwh: 10, batteryInvestmentsEurByKwh: { 10: 6000 } });
    expect(specific.options[1].estimatedInvestmentEur).toBe(6000);
    const single = calculateAnnualBillAdvice({ ...pricedInput, batteryOptionsKwh: [10], batteryInvestmentEur: 7000 });
    expect(single.options[0].investmentSource).toBe('quoted');
    expect(single.options[0].estimatedInvestmentEur).toBe(7000);
  });

  it('discloses estimated costs and lowers confidence even when tariffs and annual data are present', () => {
    const result = calculateAnnualBillAdvice({ ...pricedInput, annualPvProductionKwh: 5200, periodStart: '2025-01-01', periodEnd: '2025-12-31' });
    expect(result.confidence).toBe('low');
    expect(result.warnings.join(' ')).toContain('EUR 900/kWh');
    expect(result.warnings.join(' ')).toContain('EUR 775/kWh');
    expect(result.warnings.join(' ')).toContain('EUR 625/kWh');
    expect(result.options.every(option => option.investmentSource === 'estimated' && option.confidence === 'low')).toBe(true);
    expect(result.options[0].explanation).toContain('geen offerte');
  });

  it('rejects invalid or unmatched investment inputs and states the replacement assumption', () => {
    const result = calculateAnnualBillAdvice({ ...pricedInput, batteryInvestmentEur: 1000, batteryInvestmentCapacityKwh: 99,
      batteryInvestmentsEurByKwh: { 5: 0, 10: -1, 15: Number.NaN } });
    expect(result.options.every(option => option.investmentSource === 'estimated')).toBe(true);
    expect(result.warnings.join(' ')).toContain('investeringsbedrag is niet gebruikt');
    expect(result.warnings.join(' ')).toContain('investeringen per optie zijn ongeldig');
  });

  it('selects on kWh even when tariffs produce zero euro savings', () => {
    const result = calculateAnnualBillAdvice({ ...pricedInput, averageImportPriceEurPerKwh: 0.08 });
    expect(result.options[0].utilizationScore).toBeGreaterThan(0);
    expect(result.recommendedBatteryKwh).toBe(15);
    expect(result.annualSavingsRangeEur.expected).toBe(0);
    expect(result.paybackRangeYears.expected).toBeNull();
    expect(result.options[2].percentOfMaximumSavings).toBe(1);
  });

  it.each([{ totalUsageKwh: 0 }, { totalFeedInKwh: 0 }])('does not recommend a battery when all annual energy results are zero (%j)', (missingEnergy) => {
    const result = calculateAnnualBillAdvice({ ...pricedInput, ...missingEnergy });
    expect(result.recommendedBatteryKwh).toBeNull();
    expect(result.options.every(option => option.estimatedAnnualStoredSolarKwh === 0 && option.percentOfMaximumSavings === 0)).toBe(true);
    expect(result.warnings.join(' ')).toContain('geen positieve jaarlijkse verschuiving van zonnestroom');
  });

  it('uses fallback prices and lowers confidence when tariffs are missing', () => {
    const result = calculateAnnualBillAdvice({
      totalUsageKwh: 4200,
      totalFeedInKwh: 1800
    });

    expect(result.confidence).toBe('low');
    expect(result.warnings.some((warning) => warning.includes('Importprijs ontbreekt'))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes('Terugleververgoeding ontbreekt'))).toBe(true);
  });

  it('keeps 10 percent minimum SOC and applies an extra emergency reserve', () => {
    const normal = calculateAnnualBillAdvice({
      totalUsageKwh: 4200,
      totalFeedInKwh: 1800,
      batteryOptionsKwh: [64]
    });
    const emergency = calculateAnnualBillAdvice({
      totalUsageKwh: 4200,
      totalFeedInKwh: 1800,
      batteryOptionsKwh: [64],
      emergencyPowerEnabled: true,
      emergencyPowerReservePercent: 10
    });

    expect(normal.options[0].usableCapacityKwh).toBe(57.6);
    expect(emergency.options[0].usableCapacityKwh).toBe(51.2);
    expect(emergency.options[0].estimatedAnnualStoredSolarKwh).toBeLessThan(normal.options[0].estimatedAnnualStoredSolarKwh);
  });
});
