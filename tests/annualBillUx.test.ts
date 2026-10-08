import { describe, expect, it } from 'vitest';
import { resolveAnnualBillEnergyBasis } from '../src/lib/annual-bill/energyBasis';
import {
  annualBillConfidenceLabel,
  formatEuro,
  formatKwh,
  formatYears,
  resolveAverageFeedInPrice,
  resolveAverageImportPrice,
  resolveAnnualFeedInKwh,
  resolveAnnualUsageKwh,
  validateAnnualBillRequiredFields, annualBillMissingDetails, toAnnualBillAdviceInput, updateAnnualBillEnergyInput
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
    ).toBe('low'); // Default profile and fallback product, irrespective of tariffs.
    expect(annualBillConfidenceLabel({ totalFeedInKwh: 1500 })).toBe('low');
    expect(validateAnnualBillRequiredFields({}).join(' ')).toContain('netafname');
    expect(validateAnnualBillRequiredFields({ totalFeedInKwh: 1500 }).join(' ')).toContain('netafname');
    expect(validateAnnualBillRequiredFields({ source: 'manual', totalUsageKwh: 4200, totalFeedInKwh: 0 })).toEqual([]);
  });

  it('does not require financial fields or replace missing export with zero in the adapter', () => {
    expect(toAnnualBillAdviceInput({ totalUsageKwh: 4200 }).totalFeedInKwh).toBeUndefined();
    expect(annualBillMissingDetails({ source: 'manual', totalUsageKwh: 4200, totalFeedInKwh: 1800 })).toEqual([]);
    expect(annualBillMissingDetails({ contractType: 'dynamic', source: 'manual', totalUsageKwh: 4200, totalFeedInKwh: 0 })).toEqual([]);
  });
  it('shows extracted meter values and clears obsolete provenance on a manual energy correction', () => {
    const input = { source: 'pdf' as const, totalUsageKwh: 19005, physicalEnergy: { gridImportKwh: 35444, gridExportKwh: 16439, periodStart: '2025-01-01', periodEnd: '2026-01-01' } };
    expect(resolveAnnualUsageKwh(input)).toBe(35444);
    expect(updateAnnualBillEnergyInput(input, { normalTariffEurPerKwh: 0.3 }).physicalEnergy).toEqual(input.physicalEnergy);
    const corrected = updateAnnualBillEnergyInput(input, { totalUsageKwh: 35000 });
    expect(corrected.physicalEnergy).toBeUndefined();
    expect(corrected.totalFeedInKwh).toBe(16439);
    expect(corrected.totalUsageKwh).toBe(35000);
    expect(corrected.energyTotalsConfirmed).toBe(false);
    expect(validateAnnualBillRequiredFields(corrected).length).toBeGreaterThan(0);
    expect(validateAnnualBillRequiredFields({ ...corrected, energyTotalsConfirmed: true })).toEqual([]);
  });
  it('does not double-annualize an edited explicit annual summary', () => {
    const edited = updateAnnualBillEnergyInput({ source: 'pdf', annualizedEnergy: { gridImportKwh: 4200, gridExportKwh: 1800, periodStart: '2025-01-01', periodEnd: '2025-10-28' } }, { totalUsageKwh: 4500 });
    expect(resolveAnnualBillEnergyBasis({ ...edited, energyTotalsConfirmed: true })).toMatchObject({ status: 'usable', annualizationFactor: 1, gridImportKwh: 4500 });
  });
});

