import type { AnnualBillExtractionResult } from './schema';
import { extractAnnualBillData } from './extractAnnualBillData';
import { extractAnnualBillWithAi, isAnnualBillAiConfigured } from './extractAnnualBillWithAi';
import { extractPdfText } from './extractPdfText';
import { normalizeAnnualBillData } from './normalizeAnnualBillData';
import { validateAnnualBillExtract } from './validateAnnualBillExtract';
import type { AnnualBillAiReport, AnnualBillRawExtract, AnnualBillValidationIssue } from './schema';
import { logAnnualBill, annualBillLogFields, annualBillLogValues, annualBillErrorDetails } from './logging';

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

export async function extractAnnualBillFromPdf(buffer: Buffer, traceId = crypto.randomUUID()): Promise<AnnualBillExtractionResult> {
  const startedAt = performance.now();
  logAnnualBill('pdf.text.started', traceId, { bytes: buffer.byteLength });
  let text: string;
  try {
    text = await extractPdfText(buffer);
  } catch (error) {
    logAnnualBill('pdf.text.failed', traceId, annualBillErrorDetails(error), 'error');
    throw error;
  }
  logAnnualBill('pdf.text.completed', traceId, { textLength: text.length, durationMs: Math.round(performance.now() - startedAt) });
  const rulesRaw = extractAnnualBillData(text);
  logAnnualBill('rules.completed', traceId, { fields: annualBillLogFields(rulesRaw) });
  const aiWarnings: string[] = [];
  let aiReport: AnnualBillAiReport | undefined;
  let aiModel: string | undefined;
  let aiUsed = false;
  let raw = rulesRaw;
  let mergeIssues: AnnualBillValidationIssue[] = [];

  if (isAnnualBillAiConfigured()) {
    try {
      const ai = await extractAnnualBillWithAi(text, traceId);
      aiUsed = true;
      aiModel = ai.model;
      aiReport = ai.report;
      aiWarnings.push(...ai.warnings);
      const merged = mergeRawExtracts(rulesRaw, ai.raw);
      raw = merged.raw;
      mergeIssues = merged.issues;
      logAnnualBill('merge.completed', traceId, {
        addedByAi: Object.keys(ai.raw).filter((field) => !rulesRaw[field as keyof typeof rulesRaw]),
        conflictingFields: mergeIssues.map((issue) => issue.field),
        fields: annualBillLogFields(raw)
      }, mergeIssues.length ? 'warn' : 'info');
    } catch (error) {
      aiWarnings.push(error instanceof Error ? error.message : String(error));
      logAnnualBill('ai.fallback_to_rules', traceId, { ...annualBillErrorDetails(error), aiUsed: false }, 'warn');
    }
  } else {
    logAnnualBill('ai.skipped', traceId, { reason: 'OPENAI_API_KEY_missing', aiUsed: false }, 'warn');
  }

  const input = normalizeAnnualBillData(raw);
  const issues = [...validateAnnualBillExtract(input), ...mergeIssues];
  const missingFields = issues.filter((issue) => issue.severity === 'missing').map((issue) => issue.field);
  logAnnualBill('extraction.completed', traceId, {
    aiEnabled: isAnnualBillAiConfigured(), aiUsed, aiModel,
    aiWarningCount: aiWarnings.length, values: annualBillLogValues(input),
    issues: issues.map(({ field, severity }) => ({ field, severity })),
    durationMs: Math.round(performance.now() - startedAt)
  }, issues.length || aiWarnings.length ? 'warn' : 'info');

  return {
    input: {
      ...input,
      traceId,
      missingFields
    },
    raw,
    issues,
    textPreview: text.slice(0, 1200),
    diagnostics: {
      traceId,
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
