import type { AnnualBillExtractionResult } from './schema';
import { extractAnnualBillData } from './extractAnnualBillData';
import { extractPdfText } from './extractPdfText';
import { normalizeAnnualBillData } from './normalizeAnnualBillData';
import { validateAnnualBillExtract } from './validateAnnualBillExtract';

export async function extractAnnualBillFromPdf(buffer: Buffer): Promise<AnnualBillExtractionResult> {
  const text = await extractPdfText(buffer);
  const raw = extractAnnualBillData(text);
  const input = normalizeAnnualBillData(raw);
  const issues = validateAnnualBillExtract(input);

  return {
    input: {
      ...input,
      missingFields: issues.filter((issue) => issue.severity === 'missing').map((issue) => issue.field)
    },
    raw,
    issues,
    textPreview: text.slice(0, 1200)
  };
}

export * from './schema';
export { extractPdfText } from './extractPdfText';
export { extractAnnualBillData } from './extractAnnualBillData';
export { normalizeAnnualBillData } from './normalizeAnnualBillData';
export { validateAnnualBillExtract } from './validateAnnualBillExtract';

