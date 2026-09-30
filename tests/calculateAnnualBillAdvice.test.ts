import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { STACK_BATTERY_OPTIONS_KWH, batteryBrochureKey } from '../lib/batteryAdviceOptions';
import { calculateAnnualBillAdvice } from '@/src/lib/annual-bill/calculateAnnualBillAdvice';

describe('calculate annual bill battery advice', () => {
  it('compares the supported systems with matching brochures using relative economic return', () => {
    // Legacy 5/10/15/20 kWh placeholders are replaced by the exact stack systems.
    const capacities = [30, 40, 64, 96, 232, 261, 2090, 5015];
    const result = calculateAnnualBillAdvice({ totalUsageKwh: 4200, totalFeedInKwh: 1800 });
    expect(result.options.map((option) => option.batteryKwh)).toEqual([...capacities, ...STACK_BATTERY_OPTIONS_KWH].sort((a, b) => a - b));
    result.options.forEach((option) => expect(existsSync(`public/assets/${batteryBrochureKey(option.batteryKwh)}.pdf`)).toBe(true));
    const bestReturn = [...result.options].sort((a, b) => b.estimatedAnnualSavingsEur / b.estimatedInvestmentEur - a.estimatedAnnualSavingsEur / a.estimatedInvestmentEur)[0];
    expect(result.recommendedBatteryKwh).toBe(bestReturn.batteryKwh);
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

  it('can prefer a larger investment despite the smallest option having the highest utilization and initial marginal savings', () => {
    const input = { ...pricedInput, batteryInvestmentsEurByKwh: { 5: 7000, 10: 8000, 15: 13000 } };
    const result = calculateAnnualBillAdvice(input);
    const [small, medium, large] = result.options;
    expect(small.utilizationScore).toBeGreaterThan(medium.utilizationScore);
    expect(small.estimatedAnnualSavingsEur).toBeGreaterThan(medium.estimatedAnnualSavingsEur - small.estimatedAnnualSavingsEur);
    expect(medium.estimatedPaybackYears).toBeLessThan(small.estimatedPaybackYears!);
    expect(medium.estimatedPaybackYears).toBeLessThan(large.estimatedPaybackYears!);
    expect(result.recommendedBatteryKwh).toBe(10);
    // Inserting a dominated smaller option cannot change the comparison between these investments.
    const extended = calculateAnnualBillAdvice({ ...input, batteryOptionsKwh: [2, 5, 10, 15], batteryInvestmentsEurByKwh: { ...input.batteryInvestmentsEurByKwh, 2: 9000 } });
    expect(extended.recommendedBatteryKwh).toBe(10);
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

  it('does not recommend a battery on utilization alone when savings are zero', () => {
    const result = calculateAnnualBillAdvice({ ...pricedInput, averageImportPriceEurPerKwh: 0.08 });
    expect(result.options[0].utilizationScore).toBeGreaterThan(0);
    expect(result.recommendedBatteryKwh).toBeNull();
    expect(result.paybackRangeYears.expected).toBeNull();
    expect(result.warnings.join(' ')).toContain('geen positieve jaarlijkse besparing');
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
