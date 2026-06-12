import { describe, expect, it } from 'vitest';
import {
  annualBillConfidenceLabel,
  formatEuro,
  formatKwh,
  formatYears,
  resolveAverageFeedInPrice,
  resolveAverageImportPrice,
  resolveAnnualFeedInKwh,
  resolveAnnualUsageKwh,
  validateAnnualBillRequiredFields
} from '@/src/lib/annual-bill/annualBillUx';

describe('annual bill UX helpers', () => {
  it('formats kWh, euros and years for Dutch display', () => {
    expect(formatKwh(16237)).toBe('16.237 kWh');
    expect(formatEuro(1250.5)).toBe('€ 1.251');
    expect(formatYears(7.842)).toBe('7,8 jaar');
  });

  it('derives totals and default prices', () => {
    expect(resolveAnnualUsageKwh({ usageNormalKwh: 1000, usageOffPeakKwh: 500 })).toBe(1500);
    expect(resolveAnnualFeedInKwh({ feedInNormalKwh: 700, feedInOffPeakKwh: 300 })).toBe(1000);
    expect(resolveAverageImportPrice({ usageNormalKwh: 1000, usageOffPeakKwh: 1000, normalTariffEurPerKwh: 0.34, offPeakTariffEurPerKwh: 0.24 })).toBeCloseTo(0.29, 5);
    expect(resolveAverageFeedInPrice({})).toBe(0.06);
  });

  it('labels confidence and validates only critical missing energy data', () => {
    expect(
      annualBillConfidenceLabel({
        totalUsageKwh: 4000,
        totalFeedInKwh: 1500,
        periodStart: '2025-01-01',
        periodEnd: '2025-12-31',
        normalTariffEurPerKwh: 0.3
      })
    ).toBe('medium');
    expect(annualBillConfidenceLabel({ totalFeedInKwh: 1500 })).toBe('low');
    expect(validateAnnualBillRequiredFields({})).toEqual(['verbruik of teruglevering']);
    expect(validateAnnualBillRequiredFields({ totalFeedInKwh: 1500 })).toEqual([]);
  });
});

