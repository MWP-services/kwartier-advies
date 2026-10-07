import type { AnnualBillInput } from '@/lib/analysis';
import type { AnnualBillAdviceInput } from './calculateAnnualBillAdvice';
import { resolveAnnualBillPrices } from './tariffs';
import { resolveAnnualBillEnergyBasis } from './energyBasis';
import { calculateAnnualBillAdvice } from './calculateAnnualBillAdvice';

export type AnnualBillConfidenceLabel = 'low' | 'medium';

export function formatKwh(value: number | undefined): string {
  if (!Number.isFinite(value)) return '-';
  return `${Math.round(value as number).toLocaleString('nl-NL')} kWh`;
}

export function formatEuro(value: number | undefined): string {
  if (!Number.isFinite(value)) return '-';
  return `€ ${Math.round(value as number).toLocaleString('nl-NL')}`;
}

export function formatYears(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'n.v.t.';
  return `${value.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} jaar`;
}

export function maskEan(ean: string | undefined): string {
  if (!ean) return '-';
  const lastFour = ean.replace(/\D/g, '').slice(-4);
  return lastFour ? `•••• ${lastFour}` : '-';
}

export function resolveAnnualUsageKwh(input: AnnualBillInput): number | undefined {
  return resolveAnnualBillEnergyBasis(input).originalImportKwh;
}

export function resolveAnnualFeedInKwh(input: AnnualBillInput): number | undefined {
  return resolveAnnualBillEnergyBasis(input).originalExportKwh;
}

export function resolveAverageImportPrice(input: AnnualBillInput): number {
  return resolveAnnualBillPrices(input).importPrice;
}

export function resolveAverageFeedInPrice(input: Pick<AnnualBillInput, 'feedInTariffEurPerKwh'>): number {
  return resolveAnnualBillPrices(input).feedInPrice;
}

export function resolveEstimatedPvProduction(input: Pick<AnnualBillInput, 'annualPvProductionKwh' | 'solarPanelCount' | 'solarPanelWp' | 'roofOrientation'>): number | undefined {
  if ((input.annualPvProductionKwh ?? 0) > 0) return input.annualPvProductionKwh;
  if (!input.solarPanelCount || !input.solarPanelWp) return undefined;

  const orientationFactor: Record<NonNullable<AnnualBillInput['roofOrientation']>, number> = {
    south: 0.9,
    east_west: 0.78,
    east: 0.72,
    west: 0.72,
    other: 0.68
  };
  return input.solarPanelCount * input.solarPanelWp * (orientationFactor[input.roofOrientation ?? 'other'] ?? 0.68);
}

export function toAnnualBillAdviceInput(input: AnnualBillInput): AnnualBillAdviceInput {
  return {
    ...input,
    usageNormalKwh: input.usageNormalKwh,
    usageOffPeakKwh: input.usageOffPeakKwh,
    feedInNormalKwh: input.feedInNormalKwh,
    feedInOffPeakKwh: input.feedInOffPeakKwh,
    totalUsageKwh: resolveAnnualUsageKwh(input),
    totalFeedInKwh: resolveAnnualFeedInKwh(input),
    annualPvProductionKwh: resolveEstimatedPvProduction(input),
    averageImportPriceEurPerKwh: resolveAverageImportPrice(input),
    averageFeedInPriceEurPerKwh: resolveAverageFeedInPrice(input),
    batteryInvestmentEur: input.batteryInvestmentEur,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    solarPanelCount: input.solarPanelCount,
    solarPanelWp: input.solarPanelWp,
    roofOrientation: input.roofOrientation
  };
}

export function validateAnnualBillRequiredFields(input: AnnualBillInput): string[] {
  const basis = resolveAnnualBillEnergyBasis(input);
  return basis.status === 'insufficient_data' ? basis.warnings : [];
}

export function annualBillConfidenceLabel(input: AnnualBillInput): AnnualBillConfidenceLabel {
  return calculateAnnualBillAdvice(toAnnualBillAdviceInput(input)).confidence;
}

export function annualBillMissingDetails(input: AnnualBillInput): string[] {
  return validateAnnualBillRequiredFields(input);
}

/** Editing displayed energy invalidates extracted provenance. Never silently keep
 * using the old PDF pair after a user corrects a value or its period. */
export function updateAnnualBillEnergyInput(input: AnnualBillInput, patch: Partial<AnnualBillInput>): AnnualBillInput {
  const energyFields = ['totalUsageKwh', 'totalFeedInKwh', 'usageNormalKwh', 'usageOffPeakKwh', 'feedInNormalKwh', 'feedInOffPeakKwh', 'periodStart', 'periodEnd', 'periodEndInclusive'];
  if (!energyFields.some(field => field in patch)) return { ...input, ...patch };
  const basis = resolveAnnualBillEnergyBasis(input);
  const result = { ...input, totalUsageKwh: basis.originalImportKwh, totalFeedInKwh: basis.originalExportKwh,
    periodStart: basis.periodStart, periodEnd: basis.periodEnd, periodEndInclusive: basis.periodEndInclusive,
    ...patch, physicalEnergy: undefined, annualizedEnergy: undefined, confirmedEnergy: undefined,
    energyTotalsConfirmed: false, energyConflicts: [], extractionConfidence: undefined };
  if ('usageNormalKwh' in patch || 'usageOffPeakKwh' in patch) result.totalUsageKwh = undefined;
  if ('feedInNormalKwh' in patch || 'feedInOffPeakKwh' in patch) result.totalFeedInKwh = undefined;
  return result;
}
