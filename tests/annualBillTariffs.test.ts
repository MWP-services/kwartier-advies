import { readFileSync } from 'node:fs';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { extractAnnualBillData } from '../src/lib/annual-bill/extractAnnualBillData';
import { normalizeAnnualBillData } from '../src/lib/annual-bill/normalizeAnnualBillData';
import { resolveAverageImportPrice } from '../src/lib/annual-bill/annualBillUx';
import { calculateAnnualBillAdvice } from '../src/lib/annual-bill/calculateAnnualBillAdvice';
import { buildAnnualBillIndicativeAnalysis } from '../lib/annualBillAdvice';
import { defaultAnalysisSettings } from '../lib/analysis';

const fixture = readFileSync('tests/fixtures/annual-bill-column-text.txt', 'utf8');
beforeEach(() => { vi.spyOn(console, 'info').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

describe('annual bill tariff regressions', () => {
  it('recovers the supplied column-oriented bill and weights tariffs by billed kWh', () => {
    const input = normalizeAnnualBillData(extractAnnualBillData(fixture));
    expect(input.usageOffPeakKwh).toBe(15679);
    expect(input.usageNormalKwh).toBe(3326);
    expect(input.totalUsageKwh).toBe(19005);
    expect(input.totalFeedInKwh).toBeUndefined();
    expect(input.compensatedFeedInKwh).toBe(0);
    expect(input.offPeakTariffEurPerKwh).toBeCloseTo((3496 * 0.14689 + 12183 * 0.14824) / 15679, 8);
    expect(input.normalTariffEurPerKwh).toBeCloseTo((1533 * 0.18515 + 1793 * 0.17579) / 3326, 8);
    expect(resolveAverageImportPrice(input)).toBeCloseTo((3496 * 0.14689 + 12183 * 0.14824 + 1533 * 0.18515 + 1793 * 0.17579) / 19005 * 1.21, 8);
    expect(input.tariffBasis).toBe('supply_only');
  });

  it('rejects a table when quantity times tariff does not match the billed amount', () => {
    const raw = extractAnnualBillData(fixture.replace('513,53', '913,53'));
    expect(raw.normalTariffEurPerKwh).toBeUndefined();
    expect(raw.offPeakTariffEurPerKwh).toBeUndefined();
  });

  it('does not truncate numbers or confuse delivery with feed-in', () => {
    const raw = extractAnnualBillData('Teruglevering normaal 899 kWh\nTeruglevering dal 439 kWh\nTotaal verbruik 16237 kWh');
    expect(raw.usageNormalKwh).toBeUndefined();
    expect(raw.usageOffPeakKwh).toBeUndefined();
    expect(raw.feedInNormalKwh?.value).toBe(899);
    expect(raw.totalUsageKwh?.value).toBe(16237);
  });

  it('requires a unit, preserves decimal tariffs and converts only explicit cents', () => {
    expect(extractAnnualBillData('Normaaltarief 162,37 EUR').normalTariffEurPerKwh).toBeUndefined();
    expect(extractAnnualBillData('Normaaltarief 162 EUR/kWh').normalTariffEurPerKwh).toBeUndefined();
    expect(extractAnnualBillData('Normaaltarief 0.14689 EUR/kWh').normalTariffEurPerKwh?.value).toBe(0.14689);
    expect(extractAnnualBillData('Normaaltarief 14,689 cent/kWh').normalTariffEurPerKwh?.value).toBeCloseTo(0.14689, 8);
    expect(extractAnnualBillData('Normaaltarief 899 kWh 0,14689 EUR/kWh 132 EUR').normalTariffEurPerKwh?.value).toBe(0.14689);
  });

  it('rejects legacy implausible prices in normalization, display and calculation', () => {
    const legacy = { usageNormalKwh: 899, usageOffPeakKwh: 439, normalTariffEurPerKwh: 162, offPeakTariffEurPerKwh: 23 };
    expect(resolveAverageImportPrice(legacy)).toBe(0.3);
    expect(normalizeAnnualBillData({ normalTariffEurPerKwh: { value: 162, confidence: 0.9 } }).normalTariffEurPerKwh).toBeUndefined();
    const advice = calculateAnnualBillAdvice({ totalUsageKwh: 4200, totalFeedInKwh: 1800, averageImportPriceEurPerKwh: 116.39 });
    expect(advice.warnings.some((warning) => warning.includes('0,30'))).toBe(true);
    expect(advice.annualSavingsRangeEur.expected).toBeLessThan(1000);
  });

  it('actually uses the supplied average price in the advice calculation', () => {
    const base = { totalUsageKwh: 4200, totalFeedInKwh: 1800, averageFeedInPriceEurPerKwh: 0.06 };
    const low = calculateAnnualBillAdvice({ ...base, averageImportPriceEurPerKwh: 0.2 });
    const high = calculateAnnualBillAdvice({ ...base, averageImportPriceEurPerKwh: 0.4 });
    expect(high.options[0].estimatedAnnualSavingsEur / low.options[0].estimatedAnnualSavingsEur).toBeCloseTo(0.34 / 0.14, 3);
  });

  it('preserves explicit zero feed-in and gives no storage recommendation', () => {
    const input = normalizeAnnualBillData(extractAnnualBillData(`Totaal teruglevering 0 kWh\n${fixture}`));
    const result = buildAnnualBillIndicativeAnalysis(input, { ...defaultAnalysisSettings, analysisType: 'PV_SELF_CONSUMPTION', pvInputMode: 'annualBill' });
    expect(result).not.toBeNull();
    expect(result?.annualBillInput?.totalFeedInKwh).toBe(0);
    expect(result?.annualBillAdvice?.recommendedBatteryKwh).toBeNull();
    expect(result?.annualBillAdvice?.annualSavingsRangeEur.expected).toBe(0);
    expect(result?.pvWarnings?.some((warning) => warning.includes('teruglevering geschat'))).toBe(false);
  });

  it('does not overwrite physical feed-in with zero compensated export', () => {
    const input = normalizeAnnualBillData(extractAnnualBillData(`Teruglevering normaal 899 kWh\nTeruglevering dal 439 kWh\n${fixture}`));
    expect(input.totalFeedInKwh).toBe(1338);
    expect(input.compensatedFeedInKwh).toBe(0);
  });

  it('preserves separate meter totals while using billing-row weights for tariffs', () => {
    const input = normalizeAnnualBillData(extractAnnualBillData(`Totaal verbruik 16237 kWh\n${fixture}`));
    expect(input.totalUsageKwh).toBe(16237);
    expect(input.usageNormalKwh).toBeUndefined();
    expect(input.tariffWeightNormalKwh).toBe(3326);
    expect(resolveAverageImportPrice(input)).toBeCloseTo(0.1535681020784004 * 1.21, 8);
  });
});
