import type { AnnualBillInput } from '../../../lib/analysis';
import type { AnnualBillRawExtract } from './schema';

/** One searchable, single-line format in both the browser and Azure logs. */
export function logAnnualBill(event: string, traceId?: string, details: Record<string, unknown> = {}, level: 'info' | 'warn' | 'error' = 'info'): void {
  const line = `[annual-bill] ${JSON.stringify({ timestamp: new Date().toISOString(), event, traceId: traceId ?? 'untracked', ...details })}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
}

// Explicit allowlist: no names, EAN, PDF text, AI prose, prompts, or credentials.
const numericFields = [
  'usageNormalKwh', 'usageOffPeakKwh', 'feedInNormalKwh', 'feedInOffPeakKwh',
  'totalUsageKwh', 'totalFeedInKwh', 'annualPvProductionKwh',
  'normalTariffEurPerKwh', 'offPeakTariffEurPerKwh', 'feedInTariffEurPerKwh',
  'batteryInvestmentEur', 'solarPanelCount', 'solarPanelWp', 'extractionConfidence'
] as const;

export function annualBillLogValues(input: AnnualBillInput): Record<string, number> {
  return Object.fromEntries(numericFields.flatMap((field) => {
    const value = input[field];
    return typeof value === 'number' && Number.isFinite(value) ? [[field, value]] : [];
  }));
}

export function annualBillLogFields(raw: AnnualBillRawExtract) {
  return Object.entries(raw).map(([field, entry]) => ({
    field,
    value: numericFields.includes(field as typeof numericFields[number]) && typeof entry?.value === 'number' ? entry.value : undefined,
    confidence: entry?.confidence,
    source: entry?.source,
    requiresReview: entry?.requiresReview ?? false,
    hasEvidence: Boolean(entry?.evidenceSnippet || entry?.evidence)
  }));
}

export function annualBillErrorDetails(error: unknown): Record<string, unknown> {
  // Error messages can contain upstream response bodies or document text.
  return { errorType: error instanceof Error ? error.name : typeof error };
}
