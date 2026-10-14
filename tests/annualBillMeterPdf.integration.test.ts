// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { extractAnnualBillFromPdf } from '../src/lib/annual-bill';
import { resolveAnnualBillEnergyBasis } from '../src/lib/annual-bill/energyBasis';
import { buildAnnualBillIndicativeAnalysis } from '../lib/annualBillAdvice';
import { defaultAnalysisSettings } from '../lib/analysis';

afterEach(() => vi.unstubAllEnvs());
it('validates meter provenance through the native PDF chain (local customer PDF when explicitly supplied)', async () => {
  vi.stubEnv('OPENAI_API_KEY', ''); // Never send a customer PDF to an external service in tests.
  let buffer: Buffer;
  if (process.env.ANNUAL_BILL_PDF_FIXTURE) buffer = readFileSync(process.env.ANNUAL_BILL_PDF_FIXTURE);
  else {
    const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica);
    pdf.addPage([700, 1500]).drawText(readFileSync('tests/fixtures/eneco-meter-registers.txt', 'utf8').replace(/\r\n/g, '\n'), { font, size: 10, x: 20, y: 1470, lineHeight: 12 });
    buffer = Buffer.from(await pdf.save());
  }
  const extracted = await extractAnnualBillFromPdf(buffer);
  const basis = resolveAnnualBillEnergyBasis(extracted.input);
  expect(basis).toMatchObject({ source: 'physical_meter', originalImportKwh: 35444, originalExportKwh: 16439,
    periodStart: '2024-10-01', periodEnd: '2025-09-29', periodDays: 363, status: 'usable' });
  expect(basis.gridImportKwh).toBeCloseTo(35444 * 365 / 363);
  expect(basis.gridExportKwh).toBeCloseTo(16439 * 365 / 363);
  expect(extracted.input.consumptionProfile).toBeUndefined();
  if (process.env.ANNUAL_BILL_PDF_FIXTURE) expect(extracted.input.billingEnergy).toMatchObject({ gridImportKwh: 19005, compensatedFeedInKwh: 0 });
  const analysis = buildAnnualBillIndicativeAnalysis(extracted.input, defaultAnalysisSettings)!;
  expect(analysis.annualBillAdvice!.recommendationStatus).toBe('recommended');
  expect(analysis.annualBillAdvice!.totalUsageKwh).toBeCloseTo(basis.gridImportKwh);
  expect(analysis.sizing.recommendedProduct!.capacityKwh).toBe(analysis.annualBillAdvice!.recommendedBatteryKwh);
}, 30000);
