import { readFileSync } from 'node:fs';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { extractAnnualBillData } from '../src/lib/annual-bill/extractAnnualBillData';
import { normalizeAnnualBillData } from '../src/lib/annual-bill/normalizeAnnualBillData';
import { resolveAnnualBillPrices } from '../src/lib/annual-bill/tariffs';
import { buildAnnualBillIndicativeAnalysis } from '../lib/annualBillAdvice';
import { defaultAnalysisSettings } from '../lib/analysis';
import { generateAnnualBillReportHtml } from '../lib/annualBillReportHtml';
const supply = readFileSync('tests/fixtures/annual-bill-column-text.txt', 'utf8');
const tax = readFileSync('tests/fixtures/annual-bill-tax-text.txt', 'utf8');
beforeEach(() => { vi.spyOn(console, 'info').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

describe('electricity tax and VAT', () => {
  it('extracts the six supplied electricity tax rows without gas or fixed reductions', () => {
    const input = normalizeAnnualBillData(extractAnnualBillData(`${supply}\n${tax}`));
    expect(input.energyTaxElectricityEur).toBe(1762.51);
    expect(input.energyTaxWeightKwh).toBe(19005);
    expect(input.energyTaxEurPerKwh).toBeCloseTo(1762.51 / 19005, 10);
    expect(input.electricityVatPercent).toBe(21);
    expect(input.supplyTariffVat).toBe('excluded');
    expect(input.energyTaxVat).toBe('excluded');
    expect(input.electricityVatEur).toBeUndefined(); // The 1,150.74 total also includes gas.
    const price = resolveAnnualBillPrices(input);
    expect(price.missingComponents).toEqual([]);
    expect(price.importPrice).toBeCloseTo((0.1535681020784004 + 1762.51 / 19005) * 1.21, 8);
  });
  it('does not add VAT twice or tax twice to an explicitly all-in tariff', () => {
    expect(resolveAnnualBillPrices({ normalTariffEurPerKwh: 0.3, tariffBasis: 'all_in', energyTaxEurPerKwh: 0.1, electricityVatPercent: 21, supplyTariffVat: 'included', energyTaxVat: 'excluded' }).importPrice).toBe(0.3);
    const mixed = resolveAnnualBillPrices({ normalTariffEurPerKwh: 0.242, tariffBasis: 'supply_only', supplyTariffVat: 'included', energyTaxEurPerKwh: 0.1, energyTaxVat: 'excluded', electricityVatPercent: 21 });
    expect(mixed.importPrice).toBeCloseTo(0.363, 8);
    expect(mixed.components.vatOnSupply).toBe(0);
  });
  it('does not invent missing VAT or use combined annual tax as a per-kWh rate', () => {
    const price = resolveAnnualBillPrices({ normalTariffEurPerKwh: 0.2, tariffBasis: 'supply_only', energyTaxElectricityEur: 5479.7 });
    expect(price.importPrice).toBe(0.2);
    expect(price.missingComponents).toContain('energy_tax_rate');
    expect(price.missingComponents).toContain('supply_vat_inclusion');
  });
  it('rejects unverified tax rows instead of using a partial tax sum', () => {
    const input = normalizeAnnualBillData(extractAnnualBillData(tax.replace('148,62', '248,62')));
    expect(input.energyTaxEurPerKwh).toBeUndefined();
  });
  it('handles explicitly inclusive simple tariffs without grossing them up again', () => {
    const input = normalizeAnnualBillData(extractAnnualBillData('Normaaltarief 0,30 EUR/kWh inclusief 21% btw en energiebelasting\nEnergiebelasting stroom 0,10 EUR/kWh excl. 21% btw'));
    expect(input.tariffBasis).toBe('all_in');
    expect(resolveAnnualBillPrices(input).importPrice).toBe(0.3);
  });
  it('uses the same tax-inclusive price in advice and report', () => {
    const input = normalizeAnnualBillData(extractAnnualBillData(`Totaal teruglevering 1338 kWh\n${supply}\n${tax}`));
    const result = buildAnnualBillIndicativeAnalysis(input, { ...defaultAnalysisSettings, analysisType: 'PV_SELF_CONSUMPTION', pvInputMode: 'annualBill' })!;
    const option = result.annualBillAdvice!.options[0];
    expect(option.estimatedAnnualSavingsEur).toBeCloseTo(option.estimatedAnnualStoredSolarKwh * (resolveAnnualBillPrices(input).importPrice - 0.06), 1);
    const html = generateAnnualBillReportHtml({ input: result.annualBillInput!, advice: result.annualBillAdvice! }, null, null);
    expect(html).toContain('0,29803');
    expect(html).toContain('Energiebelasting per kWh');
    expect(html).not.toMatch(/Terugverdientijd|Betrouwbaarheid/);
  });
});
