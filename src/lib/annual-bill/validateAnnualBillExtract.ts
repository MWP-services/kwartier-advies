import type { AnnualBillInput } from '@/lib/analysis';
import type { AnnualBillValidationIssue } from './schema';

export function validateAnnualBillExtract(input: AnnualBillInput): AnnualBillValidationIssue[] {
  const issues: AnnualBillValidationIssue[] = [];
  const usage = (input.totalUsageKwh ?? 0) || (input.usageNormalKwh ?? 0) + (input.usageOffPeakKwh ?? 0);
  const feedIn = (input.totalFeedInKwh ?? 0) || (input.feedInNormalKwh ?? 0) + (input.feedInOffPeakKwh ?? 0);

  if (usage <= 0 && feedIn <= 0) {
    issues.push({ field: 'totalUsageKwh', message: 'Verbruik en teruglevering ontbreken allebei.', severity: 'missing' });
  } else {
    if (usage <= 0) issues.push({ field: 'totalUsageKwh', message: 'Verbruik ontbreekt; dit wordt indicatief geschat.', severity: 'warning' });
    if (feedIn <= 0) issues.push({ field: 'totalFeedInKwh', message: 'Teruglevering ontbreekt; dit wordt indicatief geschat.', severity: 'warning' });
  }
  if (!input.periodStart || !input.periodEnd) {
    issues.push({ field: 'periodStart', message: 'Factuurperiode is niet volledig herkend.', severity: 'warning' });
  }
  if ((input.extractionConfidence ?? 0) < 0.55) {
    issues.push({ field: 'extractionConfidence', message: 'Extractiezekerheid is laag; controleer de velden zorgvuldig.', severity: 'warning' });
  }

  return issues;
}
