import type { AnnualBillInput } from '@/lib/analysis';
import type { AnnualBillAdviceInput } from './calculateAnnualBillAdvice';

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

export function resolveAnnualUsageKwh(input: Pick<AnnualBillInput, 'totalUsageKwh' | 'usageNormalKwh' | 'usageOffPeakKwh'>): number {
  const split = (input.usageNormalKwh ?? 0) + (input.usageOffPeakKwh ?? 0);
  return input.totalUsageKwh ?? (split > 0 ? split : 0);
}

export function resolveAnnualFeedInKwh(input: Pick<AnnualBillInput, 'totalFeedInKwh' | 'feedInNormalKwh' | 'feedInOffPeakKwh'>): number {
  const split = (input.feedInNormalKwh ?? 0) + (input.feedInOffPeakKwh ?? 0);
  return input.totalFeedInKwh ?? (split > 0 ? split : 0);
}

export function resolveAverageImportPrice(input: Pick<AnnualBillInput, 'usageNormalKwh' | 'usageOffPeakKwh' | 'normalTariffEurPerKwh' | 'offPeakTariffEurPerKwh'>): number {
  const normalUsage = input.usageNormalKwh ?? 0;
  const offPeakUsage = input.usageOffPeakKwh ?? 0;
  const total = normalUsage + offPeakUsage;
  if (total > 0 && input.normalTariffEurPerKwh != null && input.offPeakTariffEurPerKwh != null) {
    return (normalUsage * input.normalTariffEurPerKwh + offPeakUsage * input.offPeakTariffEurPerKwh) / total;
  }
  return input.normalTariffEurPerKwh ?? input.offPeakTariffEurPerKwh ?? 0.3;
}

export function resolveAverageFeedInPrice(input: Pick<AnnualBillInput, 'feedInTariffEurPerKwh'>): number {
  return input.feedInTariffEurPerKwh ?? 0.06;
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
  const usage = resolveAnnualUsageKwh(input);
  const feedIn = resolveAnnualFeedInKwh(input);
  if (usage <= 0 && feedIn <= 0) return ['verbruik of teruglevering'];
  return [];
}

export function annualBillConfidenceLabel(input: AnnualBillInput): AnnualBillConfidenceLabel {
  const usage = resolveAnnualUsageKwh(input);
  const feedIn = resolveAnnualFeedInKwh(input);
  const hasLogicalPeriod = Boolean(input.periodStart && input.periodEnd && input.periodStart <= input.periodEnd);
  const hasPrices = input.normalTariffEurPerKwh != null || input.offPeakTariffEurPerKwh != null || input.feedInTariffEurPerKwh != null;
  const hasPv = (input.annualPvProductionKwh ?? 0) > 0 || ((input.solarPanelCount ?? 0) > 0 && (input.solarPanelWp ?? 0) > 0);

  if (usage > 0 && feedIn > 0 && hasLogicalPeriod && (hasPrices || hasPv)) return 'medium';
  return 'low';
}

export function annualBillMissingDetails(input: AnnualBillInput): string[] {
  const missing: string[] = [];
  if (!input.periodStart || !input.periodEnd) missing.push('periode');
  if (input.normalTariffEurPerKwh == null && input.offPeakTariffEurPerKwh == null) missing.push('stroomprijs');
  if (input.feedInTariffEurPerKwh == null) missing.push('terugleververgoeding');
  if (!resolveEstimatedPvProduction(input)) missing.push('PV-opwek');
  if (input.batteryInvestmentEur == null) missing.push('batterij-investering');
  return missing;
}
