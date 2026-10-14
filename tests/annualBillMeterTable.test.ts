import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractMeterTable } from '../src/lib/annual-bill/extractMeterTable';
import { extractAnnualBillData } from '../src/lib/annual-bill/extractAnnualBillData';
import { normalizeAnnualBillData } from '../src/lib/annual-bill/normalizeAnnualBillData';
import { resolveAnnualBillEnergyBasis } from '../src/lib/annual-bill/energyBasis';
import { updateAnnualBillEnergyInput } from '../src/lib/annual-bill/annualBillUx';
import { resolveAnnualBillPrices } from '../src/lib/annual-bill/tariffs';
import { calculateAnnualBillAdvice } from '../src/lib/annual-bill/calculateAnnualBillAdvice';
import { mergeRawExtracts } from '../src/lib/annual-bill';

const fixture = readFileSync('tests/fixtures/eneco-meter-registers.txt', 'utf8');
const billing = readFileSync('tests/fixtures/annual-bill-column-text.txt', 'utf8');
const header = 'Verbruik Meternummer Van Tot Beginstand Eindstand Factor Verbruik\n';
const row = (direction: string, start = '01-01-2025', end = '01-01-2026', readings = '0 100 1 100', meter = 'TEST') => `Stroom ${direction} (kWh) ${meter} ${start} ${end} ${readings}\n`;
const valid = header + row('enkeltarief') + row('teruglevering enkeltarief', undefined, undefined, '0 50 1 50');
const parse = (text: string) => normalizeAnnualBillData(extractAnnualBillData(text));
beforeEach(() => { vi.spyOn(console, 'info').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

describe('physical meter table provenance', () => {
  it('checks all Eneco registers and periods while retaining billed quantities independently', () => {
    const input = parse(fixture + '\n' + billing);
    expect(input.physicalEnergy).toMatchObject({ gridImportKwh: 35444, gridExportKwh: 16439, periodStart: '2024-10-01', periodEnd: '2025-09-29', periodEndInclusive: false,
      registers: { 'import:normal': 16084, 'import:offPeak': 19360, 'export:normal': 10991, 'export:offPeak': 5448 } });
    expect(input.billingEnergy).toMatchObject({ gridImportKwh: 19005, normalKwh: 3326, offPeakKwh: 15679, compensatedFeedInKwh: 0 });
    expect(input.physicalEnergy!.gridImportKwh - input.physicalEnergy!.gridExportKwh).toBe(input.billingEnergy!.gridImportKwh);
    expect(input.annualizedEnergy).toBeUndefined();
    const basis = resolveAnnualBillEnergyBasis(input);
    expect(basis).toMatchObject({ status: 'usable', source: 'physical_meter', originalImportKwh: 35444, originalExportKwh: 16439, periodDays: 363 });
    expect(basis.gridImportKwh).toBeCloseTo(35444 * 365 / 363);
    expect(basis.gridExportKwh).toBeCloseTo(16439 * 365 / 363);
    expect(resolveAnnualBillPrices(input).weightsKwh).toEqual({ normal: 3326, offPeak: 15679 });
    expect(resolveAnnualBillPrices(input).importPrice).toBeCloseTo(resolveAnnualBillPrices(parse(billing)).importPrice, 10);
    const advice = calculateAnnualBillAdvice(input);
    expect(advice.recommendationStatus).toBe('recommended');
    expect(advice.totalUsageKwh).toBeCloseTo(basis.gridImportKwh);
    expect(input.consumptionProfile).toBeUndefined();
    expect(advice.sizingPolicy).toBe('spacious');
    expect(advice.options.some(o => o.batteryKwh === advice.recommendedBatteryKwh)).toBe(true);
  });
  it('deduplicates identical rows but counts equal quantities in different adjacent periods', () => {
    const text = header + row('enkeltarief', '01-01-2025', '01-07-2025') + row('enkeltarief', '01-07-2025', '01-01-2026', '100 200 1 100') + row('enkeltarief', '01-01-2025', '01-07-2025') + row('teruglevering enkeltarief', undefined, undefined, '0 0 1 0');
    expect(extractMeterTable(text).physicalEnergy?.energyPair).toMatchObject({ gridImportKwh: 200, gridExportKwh: 0 });
  });
  it.each([
    valid + row('enkeltarief', '01-06-2025', '01-01-2026'),
    header + row('enkeltarief', '01-01-2025', '01-06-2025') + row('enkeltarief', '01-07-2025', '01-01-2026', '100 200 1 100') + row('teruglevering enkeltarief'),
    valid.replace('0 100 1 100', '0 150 1 100'),
    valid.replace('0 100 1 100', '0 100 - 100'),
    valid.replace('0 100 1 100', '0 100 100'),
    valid.replace('teruglevering enkeltarief (kWh) TEST', 'teruglevering enkeltarief (kWh) OTHER'),
    header + row('normaaltarief') + row('teruglevering normaaltarief'),
    header + row('enkeltarief'),
  ])('blocks real physical inconsistencies without accepting a confirmation checkbox', text => {
    const input = parse(text);
    expect(input.physicalEnergy).toBeUndefined();
    expect(input.energyConflicts!.length).toBeGreaterThan(0);
    expect(resolveAnnualBillEnergyBasis({ ...input, totalUsageKwh: 100, totalFeedInKwh: 50, energyTotalsConfirmed: true }).status).toBe('insufficient_data');
  });
  it('never invents a missing factor from a numeric reading footnote', () => {
    const text = fixture.replace('98413 101909 1 1 3496', '98413 101909 1 3496');
    expect(extractMeterTable(text).energyConflicts?.energyConflicts?.join(' ')).toContain('Factor of voetnoot');
  });
  it('accepts explicitly attached superscript notes only with a definition', () => {
    expect(extractMeterTable(fixture.replace('101909 1 1 3496', '101909¹ 1 3496')).physicalEnergy?.energyPair?.gridImportKwh).toBe(35444);
    expect(extractMeterTable(valid.replace('100 1 100', '100¹ 1 100')).physicalEnergy).toBeUndefined();
  });
  it('rejects multiple electricity connections without mixing them', () => {
    const text = 'EAN-code Stroom : 870000000000000001\n' + valid + '\n-- 1 of 2 --\nEAN-code Stroom : 870000000000000002\n' + valid;
    expect(extractMeterTable(text).physicalEnergy).toBeUndefined();
    expect(extractMeterTable(text).energyConflicts?.energyConflicts?.join(' ')).toContain('aansluitingen');
  });
  it('validates explicit scaling factors and tolerates only printed-unit rounding', () => {
    expect(extractMeterTable(valid.replace('0 100 1 100', '0 100 2 200')).physicalEnergy?.energyPair?.gridImportKwh).toBe(200);
    expect(extractMeterTable(valid.replace('0 100 1 100', '0,0 100,0 1 100,1')).physicalEnergy).toBeDefined();
    expect(extractMeterTable(valid.replace('0 100 1 100', '0,0 100,0 1 100,3')).physicalEnergy).toBeUndefined();
  });
  it('supports deterministic column-ordered tables and excludes gas from the physical pair', () => {
    const text = header + 'Stroom enkeltarief (kWh)\nStroom teruglevering enkeltarief (kWh)\nGas (m3)\nTEST\nTEST\nGAS\n01-01-2025\n01-01-2025\n01-01-2025\n01-01-2026\n01-01-2026\n01-01-2026\n0\n0\n0\n100\n50\n999\n1\n1\n1\n100\n50\n999';
    expect(extractMeterTable(text).physicalEnergy?.energyPair).toMatchObject({ gridImportKwh: 100, gridExportKwh: 50 });
  });
  it('does not accept historical columns or an undated comparative summary as an annual physical pair', () => {
    expect(parse('Jaaroverzicht elektriciteit\nProduct Deze periode Vorige periode\nNetafname 4200 kWh 5000 kWh\nNetteruglevering 1800 kWh 2000 kWh').annualizedEnergy).toBeUndefined();
    expect(parse('Geannualiseerd jaaroverzicht elektriciteit\nNetafname 4200 kWh\nNetteruglevering 1800 kWh').annualizedEnergy).toBeUndefined();
    expect(parse('Geannualiseerd jaaroverzicht elektriciteit 2025\nNetafname 4200 kWh\nNetteruglevering 1800 kWh').annualizedEnergy).toMatchObject({ gridImportKwh: 4200, gridExportKwh: 1800, annualized: true });
    expect(extractMeterTable('Historische meterstanden\n' + valid).physicalEnergy).toBeUndefined();
  });
  it('does not let AI mix billing, comparative exports or periods into verified meter energy', () => {
    const raw = extractAnnualBillData(fixture + '\n' + billing);
    const merged = mergeRawExtracts(raw, { totalUsageKwh: { value: 19005, confidence: 1, source: 'ai' }, totalFeedInKwh: { value: 13388, confidence: 1, source: 'ai' }, periodEnd: { value: '2023-01-01', confidence: 1, source: 'ai' } });
    expect(resolveAnnualBillEnergyBasis(normalizeAnnualBillData(merged.raw))).toMatchObject({ source: 'physical_meter', status: 'usable', originalImportKwh: 35444, originalExportKwh: 16439 });
    const partial = mergeRawExtracts({ totalUsageKwh: { value: 19005, confidence: 0.9 } }, { totalFeedInKwh: { value: 13388, confidence: 1 } });
    expect(partial.raw.totalFeedInKwh).toBeUndefined();
  });
  it('recovers unknown layouts and real conflicts through explicit corrections and confirmation', () => {
    for (const input of [parse('Onbekend formaat'), parse(valid.replace('0 100 1 100', '0 100 1 999'))]) {
      const corrected = updateAnnualBillEnergyInput(input, { totalUsageKwh: 4200, totalFeedInKwh: 1800, periodStart: '2025-01-01', periodEnd: '2026-01-01' });
      expect(resolveAnnualBillEnergyBasis(corrected).status).toBe('insufficient_data');
      const confirmed = updateAnnualBillEnergyInput(corrected, { energyTotalsConfirmed: true });
      expect(resolveAnnualBillEnergyBasis(confirmed)).toMatchObject({ status: 'usable', source: 'manual', gridImportKwh: 4200, gridExportKwh: 1800 });
      // A stale extracted pair cannot replace the current explicit correction.
      expect(resolveAnnualBillEnergyBasis({ ...confirmed, physicalEnergy: { gridImportKwh: 999, gridExportKwh: 999 } }).gridImportKwh).toBe(4200);
      expect(confirmed.energyConflicts).toEqual([]);
    }
  });
});
