import type { AnnualBillInput } from '@/lib/analysis';
import type { AnnualBillRawExtract } from './schema';

function numeric(raw: AnnualBillRawExtract, field: keyof AnnualBillInput): number | undefined {
  const value = raw[field]?.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function text(raw: AnnualBillRawExtract, field: keyof AnnualBillInput): string | undefined {
  const value = raw[field]?.value;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function confidence(raw: AnnualBillRawExtract): number {
  const values = Object.values(raw).map((entry) => entry?.confidence).filter((value): value is number => Number.isFinite(value));
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function normalizeAnnualBillData(raw: AnnualBillRawExtract): AnnualBillInput {
  const usageNormalKwh = numeric(raw, 'usageNormalKwh');
  const usageOffPeakKwh = numeric(raw, 'usageOffPeakKwh');
  const feedInNormalKwh = numeric(raw, 'feedInNormalKwh');
  const feedInOffPeakKwh = numeric(raw, 'feedInOffPeakKwh');
  const totalUsageKwh = numeric(raw, 'totalUsageKwh') ?? (
    usageNormalKwh != null || usageOffPeakKwh != null ? (usageNormalKwh ?? 0) + (usageOffPeakKwh ?? 0) : undefined
  );
  const totalFeedInKwh = numeric(raw, 'totalFeedInKwh') ?? (
    feedInNormalKwh != null || feedInOffPeakKwh != null ? (feedInNormalKwh ?? 0) + (feedInOffPeakKwh ?? 0) : undefined
  );

  return {
    supplierName: text(raw, 'supplierName'),
    invoiceDate: text(raw, 'invoiceDate'),
    periodStart: text(raw, 'periodStart'),
    periodEnd: text(raw, 'periodEnd'),
    eanElectricity: text(raw, 'eanElectricity'),
    usageNormalKwh,
    usageOffPeakKwh,
    feedInNormalKwh,
    feedInOffPeakKwh,
    totalUsageKwh,
    totalFeedInKwh,
    annualPvProductionKwh: numeric(raw, 'annualPvProductionKwh'),
    normalTariffEurPerKwh: numeric(raw, 'normalTariffEurPerKwh'),
    offPeakTariffEurPerKwh: numeric(raw, 'offPeakTariffEurPerKwh'),
    feedInTariffEurPerKwh: numeric(raw, 'feedInTariffEurPerKwh'),
    totalElectricityCostEur: numeric(raw, 'totalElectricityCostEur'),
    energyTaxElectricityEur: numeric(raw, 'energyTaxElectricityEur'),
    gridCostElectricityEur: numeric(raw, 'gridCostElectricityEur'),
    extractionConfidence: confidence(raw),
    source: 'pdf'
  };
}

