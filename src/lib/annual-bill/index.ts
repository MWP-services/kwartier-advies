import type { AnnualBillExtractionResult } from './schema';
import { extractAnnualBillData } from './extractAnnualBillData';
import { extractAnnualBillWithAi, isAnnualBillAiConfigured } from './extractAnnualBillWithAi';
import { extractPdfText } from './extractPdfText';
import { normalizeAnnualBillData } from './normalizeAnnualBillData';
import { validateAnnualBillExtract } from './validateAnnualBillExtract';
import type { AnnualBillAiReport, AnnualBillRawExtract, AnnualBillValidationIssue } from './schema';

function valuesConflict(left: string | number | undefined, right: string | number | undefined): boolean {
  if (left == null || right == null) return false;
  if (typeof left === 'number' && typeof right === 'number') {
    const tolerance = Math.max(1, Math.abs(left) * 0.02);
    return Math.abs(left - right) > tolerance;
  }
  return String(left).trim().toLowerCase() !== String(right).trim().toLowerCase();
}

function mergeRawExtracts(rulesRaw: AnnualBillRawExtract, aiRaw: AnnualBillRawExtract): { raw: AnnualBillRawExtract; issues: AnnualBillValidationIssue[] } {
  const raw: AnnualBillRawExtract = { ...rulesRaw };
  const issues: AnnualBillValidationIssue[] = [];

  Object.entries(aiRaw).forEach(([field, aiValue]) => {
    if (!aiValue) return;
    const typedField = field as keyof AnnualBillRawExtract;
    const rulesValue = raw[typedField];
    if (!rulesValue) {
      raw[typedField] = aiValue;
      return;
    }

    if (valuesConflict(rulesValue.value, aiValue.value)) {
      issues.push({
        field: typedField,
        message: `AI en regelparser vinden verschillende waarden voor ${field}; controleer dit veld.`,
        severity: 'warning'
      });
      raw[typedField] = {
        ...(aiValue.confidence >= rulesValue.confidence ? aiValue : rulesValue),
        requiresReview: true,
        source: 'merged'
      };
      return;
    }

    raw[typedField] = {
      ...aiValue,
      confidence: Math.min(1, Math.max(aiValue.confidence, rulesValue.confidence) + 0.08),
      source: 'merged',
      requiresReview: aiValue.requiresReview || rulesValue.requiresReview
    };
  });

  return { raw, issues };
}

export async function extractAnnualBillFromPdf(buffer: Buffer): Promise<AnnualBillExtractionResult> {
  const text = await extractPdfText(buffer);
  const rulesRaw = extractAnnualBillData(text);
  const aiWarnings: string[] = [];
  let aiReport: AnnualBillAiReport | undefined;
  let aiModel: string | undefined;
  let aiUsed = false;
  let raw = rulesRaw;
  let mergeIssues: AnnualBillValidationIssue[] = [];

  if (isAnnualBillAiConfigured()) {
    try {
      const ai = await extractAnnualBillWithAi(text);
      aiUsed = true;
      aiModel = ai.model;
      aiReport = ai.report;
      aiWarnings.push(...ai.warnings);
      const merged = mergeRawExtracts(rulesRaw, ai.raw);
      raw = merged.raw;
      mergeIssues = merged.issues;
    } catch (error) {
      aiWarnings.push(error instanceof Error ? error.message : String(error));
    }
  }

  const input = normalizeAnnualBillData(raw);
  const issues = [...validateAnnualBillExtract(input), ...mergeIssues];
  const missingFields = issues.filter((issue) => issue.severity === 'missing').map((issue) => issue.field);

  return {
    input: {
      ...input,
      missingFields
    },
    raw,
    issues,
    textPreview: text.slice(0, 1200),
    diagnostics: {
      pdfBytes: buffer.byteLength,
      textLength: text.length,
      recognizedFields: Object.keys(raw) as Array<keyof typeof input>,
      missingFields,
      issueCount: issues.length,
      parser: 'pdf-parse',
      aiEnabled: isAnnualBillAiConfigured(),
      aiUsed,
      aiModel,
      aiWarnings
    },
    aiReport
  };
}

export * from './schema';
export { extractPdfText } from './extractPdfText';
export { extractAnnualBillData } from './extractAnnualBillData';
export { normalizeAnnualBillData } from './normalizeAnnualBillData';
export { validateAnnualBillExtract } from './validateAnnualBillExtract';
export { extractAnnualBillWithAi, isAnnualBillAiConfigured } from './extractAnnualBillWithAi';
