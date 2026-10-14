// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { extractAnnualBillFromPdf } from '../src/lib/annual-bill';
import { resolveAnnualBillEnergyBasis } from '../src/lib/annual-bill/energyBasis';
import { buildAnnualBillIndicativeAnalysis } from '../lib/annualBillAdvice';
import { defaultAnalysisSettings } from '../lib/analysis';
import { generateAnnualBillReportHtml } from '../lib/annualBillReportHtml';

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it('validates the anonymized Eneco reference through PDF extraction, advice, and report data', async () => {
  vi.stubEnv('OPENAI_API_KEY', ''); // Never send a customer PDF to an external service in tests.
  let buffer: Buffer;
  if (process.env.ANNUAL_BILL_PDF_FIXTURE) buffer = readFileSync(process.env.ANNUAL_BILL_PDF_FIXTURE);
  else {
    const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica);
    const text = [
      readFileSync('tests/fixtures/eneco-meter-registers.txt', 'utf8'),
      readFileSync('tests/fixtures/annual-bill-column-text.txt', 'utf8')
    ].join('\n');
    let page = pdf.addPage([800, 1200]); let y = 1160;
    for (const line of text.split(/\r?\n/)) {
      if (y < 24) { page = pdf.addPage([800, 1200]); y = 1160; }
      if (line) page.drawText(line, { font, size: 8, x: 20, y });
      y -= 14;
    }
    buffer = Buffer.from(await pdf.save());
  }
  const extracted = await extractAnnualBillFromPdf(buffer);
  const basis = resolveAnnualBillEnergyBasis(extracted.input);
  expect(extracted.input.physicalEnergy?.registers).toMatchObject({
    'import:offPeak': 19360, 'import:normal': 16084,
    'export:offPeak': 5448, 'export:normal': 10991
  });
  expect(basis).toMatchObject({ source: 'physical_meter', originalImportKwh: 35444, originalExportKwh: 16439,
    periodStart: '2024-10-01', periodEnd: '2025-09-29', periodDays: 363, status: 'usable' });
  expect(basis.annualizationFactor).toBe(365 / 363);
  expect(basis.gridImportKwh).toBeCloseTo(35444 * 365 / 363, 8);
  expect(basis.gridExportKwh).toBeCloseTo(16439 * 365 / 363, 8);
  expect(extracted.input.totalUsageKwh).toBe(19005);
  expect(extracted.input.billingEnergy).toMatchObject({ gridImportKwh: 19005, normalKwh: 3326, offPeakKwh: 15679, compensatedFeedInKwh: 0 });
  expect(extracted.input.energyConflicts ?? []).toEqual([]);
  expect(extracted.input.consumptionProfile).toBeUndefined();
  const analysis = buildAnnualBillIndicativeAnalysis(extracted.input, defaultAnalysisSettings)!;
  expect(analysis.annualBillAdvice!.recommendationStatus).toBe('recommended');
  expect(analysis.annualBillAdvice!.totalUsageKwh).toBeCloseTo(basis.gridImportKwh, 8);
  expect(analysis.annualBillAdvice!.energyBasis?.originalImportKwh).toBe(35444);
  expect(analysis.annualBillAdvice!.energyBasis?.originalExportKwh).toBe(16439);
  expect(analysis.sizing.recommendedProduct!.capacityKwh).toBe(analysis.annualBillAdvice!.recommendedBatteryKwh);
  const report = generateAnnualBillReportHtml({ input: analysis.annualBillInput!, advice: analysis.annualBillAdvice! }, null, null);
  expect(report).toContain('35.444 / 16.439 kWh');
  expect(report).toContain('19.005');
  expect(report).toContain(`${analysis.annualBillAdvice!.recommendedBatteryKwh!.toLocaleString('nl-NL')} kWh`);
}, 30000);
