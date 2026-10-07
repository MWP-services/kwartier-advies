import type { AnnualBillInput } from '@/lib/analysis';
import type { AnnualBillValidationIssue } from './schema';
import { isUsableAnnualTariff, tariffFields, MAX_ABS_ANNUAL_TARIFF, annualBillPriceWarnings } from './tariffs';
import { resolveAnnualBillEnergyBasis } from './energyBasis';

export function validateAnnualBillExtract(input: AnnualBillInput): AnnualBillValidationIssue[] {
  const issues: AnnualBillValidationIssue[] = [];
  if (!input.contractType || input.contractType === 'unknown') issues.push({ field: 'contractType', severity: 'warning', message: 'Elektriciteitscontract niet eenduidig herkend; controleer vast, variabel of dynamisch.' });
  for (const field of tariffFields) {
    if (input[field] != null && !isUsableAnnualTariff(input[field])) issues.push({ field, severity: 'warning', message: `Tarief ${input[field]} EUR/kWh valt buiten het controlebereik (-${MAX_ABS_ANNUAL_TARIFF} tot ${MAX_ABS_ANNUAL_TARIFF}); controleer eenheid en bedrag. Dit tarief wordt niet gebruikt.` });
  }
  if (input.contractType !== 'dynamic' && !isUsableAnnualTariff(input.normalTariffEurPerKwh) && !isUsableAnnualTariff(input.offPeakTariffEurPerKwh)) issues.push({ field: 'normalTariffEurPerKwh', severity: 'warning', message: 'Geen bruikbaar afnametarief gevonden; de berekening gebruikt expliciet een schatting van EUR 0,30/kWh.' });
  for (const message of input.contractType === 'dynamic' ? [] : annualBillPriceWarnings(input)) issues.push({ field: 'normalTariffEurPerKwh', severity: 'warning', message });
  const basis = resolveAnnualBillEnergyBasis(input);
  for (const [field, value] of [['totalUsageKwh', basis.originalImportKwh], ['totalFeedInKwh', basis.originalExportKwh]] as const) {
    if (value == null || !Number.isFinite(value) || value < 0) issues.push({ field, message: 'Fysieke netafname en netteruglevering zijn beide vereist; ontbrekende energie wordt niet geschat.', severity: 'missing' });
  }
  if (basis.status === 'insufficient_data') issues.push({ field: 'energyTotalsConfirmed', message: basis.warnings.join(' '), severity: 'warning' });
  if (!input.periodStart || !input.periodEnd) {
    issues.push({ field: 'periodStart', message: 'Factuurperiode is niet volledig herkend.', severity: 'warning' });
  }
  if ((input.extractionConfidence ?? 0) < 0.55) {
    issues.push({ field: 'extractionConfidence', message: 'Extractiezekerheid is laag; controleer de velden zorgvuldig.', severity: 'warning' });
  }

  return issues;
}
