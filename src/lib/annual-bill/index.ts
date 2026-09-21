import type { AnnualBillExtractionResult } from './schema';
import { extractAnnualBillData } from './extractAnnualBillData';
import { extractAnnualBillWithAi, isAnnualBillAiConfigured } from './extractAnnualBillWithAi';
import { extractPdfText } from './extractPdfText';
import { normalizeAnnualBillData } from './normalizeAnnualBillData';
import { validateAnnualBillExtract } from './validateAnnualBillExtract';
import type { AnnualBillAiReport, AnnualBillRawExtract, AnnualBillValidationIssue } from './schema';
import { logAnnualBill, annualBillLogFields, annualBillLogValues, annualBillErrorDetails } from './logging';
import { isUsableAnnualTariff, tariffFields, resolveAnnualBillPrices } from './tariffs';

function valuesConflict(left: string | number | undefined, right: string | number | undefined): boolean {
  if (left == null || right == null) return false;
  if (typeof left === 'number' && typeof right === 'number') {
    const tolerance = Math.max(1, Math.abs(left) * 0.02);
    return Math.abs(left - right) > tolerance;
  }
  return String(left).trim().toLowerCase() !== String(right).trim().toLowerCase();
}

function mergeRawExtracts(rulesRaw: AnnualBillRawExtract, aiRaw: AnnualBillRawExtract, traceId?: string): { raw: AnnualBillRawExtract; issues: AnnualBillValidationIssue[] } {
  const raw: AnnualBillRawExtract = { ...rulesRaw };
  const issues: AnnualBillValidationIssue[] = [];

  Object.entries(aiRaw).forEach(([field, aiValue]) => {
    if (!aiValue) return;
    const typedField = field as keyof AnnualBillRawExtract;
    const rulesValue = raw[typedField];
    const verifiedComponent = ['normalTariffEurPerKwh', 'offPeakTariffEurPerKwh', 'supplyTariffVat', 'tariffBasis', 'energyTaxElectricityEur', 'energyTaxEurPerKwh', 'energyTaxWeightKwh', 'energyTaxVat', 'electricityVatPercent'].includes(field);
    if (verifiedComponent && rulesValue && (rulesRaw.tariffWeightNormalKwh || rulesRaw.energyTaxWeightKwh)) {
      if (valuesConflict(rulesValue.value, aiValue.value)) {
        logAnnualBill('merge.verified_tax_component.retained', traceId, { field, rulesValue: rulesValue.value, aiValue: typeof aiValue.value === 'number' ? aiValue.value : undefined }, 'warn');
        issues.push({ field: typedField, severity: 'warning', message: 'AI wijkt af van de gecontroleerde factuurberekening; de gecontroleerde waarde is behouden.' });
      }
      return;
    }
    if (tariffFields.includes(typedField as typeof tariffFields[number]) && !isUsableAnnualTariff(aiValue.value)) {
      logAnnualBill('merge.ai_tariff.rejected', traceId, { field, value: typeof aiValue.value === 'number' ? aiValue.value : undefined, retainedRulesValue: rulesValue?.value, reason: 'outside_annual_average_review_range' }, 'warn');
      issues.push({ field: typedField, severity: 'warning', message: 'AI-tarief buiten het controlebereik; dit tarief is niet overgenomen.' });
      return;
    }
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
  const rulesRaw = extractAnnualBillData(text, traceId);
  logAnnualBill('rules.completed', traceId, { fields: annualBillLogFields(rulesRaw) });
  const aiWarnings: string[] = [];
  let aiReport: AnnualBillAiReport | undefined;
  let aiModel: string | undefined;
  let aiUsed = false;
  let aiFailureCode: string | undefined;
  let raw = rulesRaw;
  let mergeIssues: AnnualBillValidationIssue[] = [];

  if (isAnnualBillAiConfigured()) {
    try {
      const ai = await extractAnnualBillWithAi(text, traceId);
      aiUsed = true;
      aiModel = ai.model;
      aiReport = ai.report;
      aiWarnings.push(...ai.warnings);
      const merged = mergeRawExtracts(rulesRaw, ai.raw, traceId);
      raw = merged.raw;
      mergeIssues = merged.issues;
      logAnnualBill('merge.completed', traceId, {
        addedByAi: Object.keys(ai.raw).filter((field) => !rulesRaw[field as keyof typeof rulesRaw]),
        conflictingFields: mergeIssues.map((issue) => issue.field),
        fields: annualBillLogFields(raw)
      }, mergeIssues.length ? 'warn' : 'info');
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? error.code : undefined;
      aiFailureCode = typeof code === 'string' && /^[a-z_]{1,64}$/.test(code) ? code : undefined;
      aiWarnings.push(error instanceof Error ? error.message : String(error));
      logAnnualBill('ai.fallback_to_rules', traceId, { ...annualBillErrorDetails(error), aiUsed: false, aiFailureCode }, 'warn');
    }
  } else {
    logAnnualBill('ai.skipped', traceId, { reason: 'OPENAI_API_KEY_missing', aiUsed: false }, 'warn');
  }

  const input = normalizeAnnualBillData(raw, traceId);
  const issues = [...validateAnnualBillExtract(input), ...mergeIssues];
  for (const field of tariffFields) {
    const entry = raw[field];
    if (entry && !isUsableAnnualTariff(entry.value)) {
      entry.requiresReview = true;
      issues.push({ field, severity: 'warning', message: `Uitgelezen tarief ${entry.value} is afgewezen; controleer het bedrag en de eenheid in de nota.` });
    }
  }
  logAnnualBill('pricing.resolved', traceId, { ...resolveAnnualBillPrices(input), tariffBasis: input.tariffBasis ?? 'unspecified' });
  const missingFields = issues.filter((issue) => issue.severity === 'missing').map((issue) => issue.field);
  logAnnualBill('extraction.completed', traceId, {
    aiEnabled: isAnnualBillAiConfigured(), aiUsed, aiModel, aiFailureCode,
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
      aiWarnings,
      aiFailureCode
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
