// @vitest-environment node
import { expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { extractPdfText } from '../src/lib/annual-bill/extractPdfText';

it('extracts selectable text from a real PDF with the native parser', async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage().drawText('Jaarnota test: 3500 kWh', { font, size: 16 });
  const text = await extractPdfText(Buffer.from(await pdf.save()), 'integration-test');
  expect(text).toContain('Jaarnota test: 3500 kWh');
}, 30000);
