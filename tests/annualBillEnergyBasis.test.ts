import { describe, expect, it } from 'vitest';
import { resolveAnnualBillEnergyBasis as resolve, type EnergyBasisInput, type EnergyPair } from '../src/lib/annual-bill/energyBasis';
import { extractAnnualBillData } from '../src/lib/annual-bill/extractAnnualBillData';
import { normalizeAnnualBillData } from '../src/lib/annual-bill/normalizeAnnualBillData';
import { readFileSync } from 'node:fs';
import { buildAnnualBillIndicativeAnalysis } from '../lib/annualBillAdvice';
import { defaultAnalysisSettings } from '../lib/analysis';

const pair: EnergyPair = { gridImportKwh: 35444, gridExportKwh: 16439, periodStart: '2025-01-01', periodEnd: '2026-01-01' };
describe('energy basis and annualization', () => {
  it('selects complete pairs in physical, annualized, confirmed priority without mixing billing', () => {
    const input = { source: 'pdf' as const, physicalEnergy: pair, annualizedEnergy: { ...pair, gridImportKwh: 30000 }, confirmedEnergy: { ...pair, gridImportKwh: 20000 }, totalUsageKwh: 19005 };
    expect(resolve(input)).toMatchObject({ source: 'physical_meter', gridImportKwh: 35444, status: 'usable' });
    expect(resolve({ ...input, physicalEnergy: undefined })).toMatchObject({ source: 'annualized_summary', gridImportKwh: 30000 });
    expect(resolve({ ...input, physicalEnergy: undefined, annualizedEnergy: undefined })).toMatchObject({ source: 'manual', gridImportKwh: 20000 });
    expect(resolve({ ...input, physicalEnergy: { ...pair, gridImportKwh: undefined } as unknown as EnergyPair }).status).toBe('insufficient_data');
  });
  it.each([300, 365, 400, 270, 450])('annualizes %i days once', days => {
    const periodEnd = new Date(Date.parse(pair.periodStart!) + days * 86400000).toISOString().slice(0, 10);
    const result = resolve({ physicalEnergy: { ...pair, periodEnd } });
    expect(result.status).toBe('usable');
    expect(result.periodDays).toBe(days);
    expect(result.gridImportKwh).toBeCloseTo(35444 * 365 / days);
    expect(result.confidence).toBe(days < 330 || days > 400 ? 'low' : 'medium');
  });
  it.each([1, 269, 451, 730])('rejects %i days unless explicitly annualized', days => {
    const periodEnd = new Date(Date.parse(pair.periodStart!) + days * 86400000).toISOString().slice(0, 10);
    expect(resolve({ physicalEnergy: { ...pair, periodEnd } }).status).toBe('insufficient_data');
    expect(resolve({ annualizedEnergy: { ...pair, periodEnd } })).toMatchObject({ status: 'usable', annualizationFactor: 1, gridImportKwh: 35444 });
  });
  it('distinguishes inclusive from exclusive ends and handles leap years', () => {
    expect(resolve({ physicalEnergy: pair }).periodDays).toBe(365);
    expect(resolve({ physicalEnergy: { ...pair, periodEnd: '2025-12-31', periodEndInclusive: true } }).periodDays).toBe(365);
    expect(resolve({ physicalEnergy: { ...pair, periodEnd: '2025-12-31' } }).periodDays).toBe(364);
    expect(resolve({ physicalEnergy: { ...pair, periodStart: '2024-01-01', periodEnd: '2025-01-01' } }).periodDays).toBe(366);
  });
  it.each(['invalid', '2025-02-30', '2024-01-01'])('rejects invalid/reversed date %s', periodEnd => {
    expect(resolve({ physicalEnergy: { ...pair, periodEnd } }).status).toBe('insufficient_data');
  });
  it('requires a full period for physical data, but permits explicit manual year values', () => {
    expect(resolve({ physicalEnergy: { gridImportKwh: 4200, gridExportKwh: 1800 } }).status).toBe('insufficient_data');
    expect(resolve({ source: 'manual', totalUsageKwh: 4200, totalFeedInKwh: 1800 }).status).toBe('usable');
    expect(resolve({ source: 'manual', totalUsageKwh: 4200, totalFeedInKwh: 1800, periodStart: '2025-01-01' }).status).toBe('insufficient_data');
  });
  it('does not accept generic PDF billing until explicitly confirmed and keeps confidence low', () => {
    const input: EnergyBasisInput = { source: 'pdf', totalUsageKwh: 19005, totalFeedInKwh: 16439 };
    expect(resolve(input).status).toBe('insufficient_data');
    expect(resolve({ ...input, energyTotalsConfirmed: true })).toMatchObject({ status: 'usable', confidence: 'low', source: 'billing' });
  });
  it.each([{ totalUsageKwh: 4200 }, { totalFeedInKwh: 1800 }, {}, { usageNormalKwh: 4200, totalFeedInKwh: 0 }, { totalUsageKwh: NaN, totalFeedInKwh: 0 }])('rejects incomplete energy %j', input => {
    expect(resolve({ ...input, source: 'manual' }).status).toBe('insufficient_data');
  });
  it('accepts zero export and rejects unresolved conflicts', () => {
    expect(resolve({ physicalEnergy: { ...pair, gridExportKwh: 0 } }).status).toBe('usable');
    expect(resolve({ physicalEnergy: pair, energyConflicts: ['Twee verschillende fysieke totalen'] }).status).toBe('insufficient_data');
    expect(resolve({ physicalEnergy: pair, extractionConfidence: 0.3 }).confidence).toBe('low');
  });
});

describe('PDF provenance through normalization and advice', () => {
  const parse = (text: string) => normalizeAnnualBillData(extractAnnualBillData(text));
  it('uses paired physical meter values from the Eneco-like synthetic fixture, never billed net import', () => {
    const input = parse(readFileSync('tests/fixtures/annual-bill-physical-text.txt', 'utf8'));
    expect(input.totalUsageKwh).toBe(19005);
    expect(input.physicalEnergy).toMatchObject({ gridImportKwh: 35444, gridExportKwh: 16439, periodStart: '2025-01-01', periodEnd: '2025-12-31', periodEndInclusive: true });
    expect(input.energyTotalsConfirmed).not.toBe(true);
    const analysis = buildAnnualBillIndicativeAnalysis({ ...input, consumptionProfile: 'business' }, defaultAnalysisSettings)!;
    expect(analysis.annualBillAdvice?.energyBasis).toMatchObject({ source: 'physical_meter', gridImportKwh: 35444, gridExportKwh: 16439, periodDays: 365, status: 'usable' });
    expect(analysis.annualBillAdvice?.energyBasis?.evidence).toContain('35.444');
  });
  it('recognizes an explicit annualized pair without double scaling', () => {
    const input = parse('Geannualiseerd jaaroverzicht elektriciteit\nPeriode 01-01-2025 tot 28-10-2025\nNetafname 4200 kWh\nNetteruglevering 1800 kWh');
    expect(resolve(input)).toMatchObject({ source: 'annualized_summary', annualizationFactor: 1, gridImportKwh: 4200 });
  });
  it.each([
    'Fysieke import 35444 kWh 01-01-2025 tot 01-01-2026\nFysieke export 16439 kWh 01-02-2025 tot 01-02-2026',
    'Totaal verbruik na saldering 19005 kWh\nFysieke export 16439 kWh 01-01-2025 tot 01-01-2026',
    'Totaal verbruik 19005 kWh\nTotale teruglevering 16439 kWh',
    'Meteroverzicht\n01-01-2025 tot 01-01-2026\nNetto afname 19005 kWh\nTeruglevering 16439 kWh'
  ])('never pairs different periods or semantics: %s', text => {
    const input = parse(text);
    expect(input.physicalEnergy).toBeUndefined();
    expect(input.energyTotalsConfirmed).not.toBe(true);
    expect(resolve(input).status).toBe('insufficient_data');
  });
  it('requires correction for contradictory meter readings', () => {
    const input = parse('Meteroverzicht\n01-01-2025 tot 01-01-2026\nAfname 35444 kWh\nAfname 19005 kWh\nTeruglevering 16439 kWh');
    expect(input.energyConflicts?.length).toBeGreaterThan(0);
    expect(resolve({ ...input, energyTotalsConfirmed: true }).status).toBe('insufficient_data');
  });
  it('does not lower technical extraction confidence because a tariff is uncertain', () => {
    const raw = extractAnnualBillData('Totaal verbruik 4200 kWh\nTotale teruglevering 1800 kWh');
    const base = parse('Totaal verbruik 4200 kWh\nTotale teruglevering 1800 kWh');
    expect(normalizeAnnualBillData({ ...raw, normalTariffEurPerKwh: { value: 0.3, confidence: 0 } }).extractionConfidence).toBe(base.extractionConfidence);
  });
});
