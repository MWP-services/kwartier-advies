import type { AnnualBillInput } from '@/lib/analysis';
import type { AnnualBillValidationIssue } from './schema';
import { isUsableAnnualTariff, tariffFields, MAX_ABS_ANNUAL_TARIFF, annualBillPriceWarnings } from './tariffs';

export function validateAnnualBillExtract(input: AnnualBillInput): AnnualBillValidationIssue[] {
  const issues: AnnualBillValidationIssue[] = [];
  for (const field of tariffFields) {
    if (input[field] != null && !isUsableAnnualTariff(input[field])) issues.push({ field, severity: 'warning', message: `Tarief ${input[field]} EUR/kWh valt buiten het controlebereik (-${MAX_ABS_ANNUAL_TARIFF} tot ${MAX_ABS_ANNUAL_TARIFF}); controleer eenheid en bedrag. Dit tarief wordt niet gebruikt.` });
  }
  if (!isUsableAnnualTariff(input.normalTariffEurPerKwh) && !isUsableAnnualTariff(input.offPeakTariffEurPerKwh)) issues.push({ field: 'normalTariffEurPerKwh', severity: 'warning', message: 'Geen bruikbaar afnametarief gevonden; de berekening gebruikt expliciet een schatting van EUR 0,30/kWh.' });
  for (const message of annualBillPriceWarnings(input)) issues.push({ field: 'normalTariffEurPerKwh', severity: 'warning', message });
  const usage = (input.totalUsageKwh ?? 0) || (input.usageNormalKwh ?? 0) + (input.usageOffPeakKwh ?? 0);
  const feedIn = (input.totalFeedInKwh ?? 0) || (input.feedInNormalKwh ?? 0) + (input.feedInOffPeakKwh ?? 0);

  if (usage <= 0 && feedIn <= 0) {
    issues.push({ field: 'totalUsageKwh', message: 'Verbruik en teruglevering ontbreken allebei.', severity: 'missing' });
  } else {
    if (usage <= 0) issues.push({ field: 'totalUsageKwh', message: 'Verbruik ontbreekt; dit wordt indicatief geschat.', severity: 'warning' });
    if (feedIn <= 0 && input.totalFeedInKwh == null && input.feedInNormalKwh == null && input.feedInOffPeakKwh == null) issues.push({ field: 'totalFeedInKwh', message: 'Teruglevering ontbreekt; dit wordt indicatief geschat.', severity: 'warning' });
  }
  if (!input.periodStart || !input.periodEnd) {
    issues.push({ field: 'periodStart', message: 'Factuurperiode is niet volledig herkend.', severity: 'warning' });
  }
  if ((input.extractionConfidence ?? 0) < 0.55) {
    issues.push({ field: 'extractionConfidence', message: 'Extractiezekerheid is laag; controleer de velden zorgvuldig.', severity: 'warning' });
  }

  return issues;
}
