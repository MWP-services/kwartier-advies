// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { extractPdfText } from '../src/lib/annual-bill/extractPdfText';
import { extractAnnualBillFromPdf } from '../src/lib/annual-bill';
import { resolveAnnualBillEnergyBasis } from '../src/lib/annual-bill/energyBasis';
import { readFileSync } from 'node:fs';

it('extracts selectable text from a real PDF with the native parser', async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage().drawText('Jaarnota test: 3500 kWh', { font, size: 16 });
  const text = await extractPdfText(Buffer.from(await pdf.save()), 'integration-test');
  expect(text).toContain('Jaarnota test: 3500 kWh');
}, 30000);

it('preserves physical provenance through a real PDF and the complete rules pipeline', async () => {
  vi.stubEnv('OPENAI_API_KEY', '');
  try {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    pdf.addPage().drawText(readFileSync('tests/fixtures/annual-bill-physical-text.txt', 'utf8'), { font, size: 12, x: 30, y: 750, lineHeight: 18 });
    const extracted = await extractAnnualBillFromPdf(Buffer.from(await pdf.save()));
    expect(resolveAnnualBillEnergyBasis(extracted.input)).toMatchObject({ source: 'physical_meter', gridImportKwh: 35444, gridExportKwh: 16439, status: 'usable' });
    expect(extracted.input.totalUsageKwh).toBe(19005);
    expect(extracted.input.energyTotalsConfirmed).not.toBe(true);
  } finally { vi.unstubAllEnvs(); }
}, 30000);
