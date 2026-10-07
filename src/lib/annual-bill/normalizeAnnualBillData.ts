import type { AnnualBillInput } from '@/lib/analysis';
import type { AnnualBillRawExtract } from './schema';
import { isUsableAnnualTariff, tariffFields } from './tariffs';
import { logAnnualBill, annualBillLogValues } from './logging';

function numeric(raw: AnnualBillRawExtract, field: keyof AnnualBillInput): number | undefined {
  const value = raw[field]?.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function text(raw: AnnualBillRawExtract, field: keyof AnnualBillInput): string | undefined {
  const value = raw[field]?.value;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function confidence(raw: AnnualBillRawExtract): number {
  // Technical confidence must not be affected by tariff, supplier or tax extraction.
  const fields = ['totalUsageKwh', 'totalFeedInKwh', 'usageNormalKwh', 'usageOffPeakKwh', 'feedInNormalKwh', 'feedInOffPeakKwh'] as const;
  const values = fields.map(field => raw[field]?.confidence).filter((value): value is number => Number.isFinite(value));
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function normalizeAnnualBillData(raw: AnnualBillRawExtract, traceId?: string): AnnualBillInput {
  const tariffs = Object.fromEntries(tariffFields.map((field) => {
    const value = numeric(raw, field);
    if (value != null && !isUsableAnnualTariff(value)) logAnnualBill('normalization.tariff.rejected', traceId, { field, value, reason: 'outside_annual_average_review_range' }, 'warn');
    return [field, isUsableAnnualTariff(value) ? value : undefined];
  }));
  const usageNormalKwh = numeric(raw, 'usageNormalKwh');
  const usageOffPeakKwh = numeric(raw, 'usageOffPeakKwh');
  const feedInNormalKwh = numeric(raw, 'feedInNormalKwh');
  const feedInOffPeakKwh = numeric(raw, 'feedInOffPeakKwh');
  const totalUsageKwh = numeric(raw, 'totalUsageKwh') ?? (
    usageNormalKwh != null && usageOffPeakKwh != null ? usageNormalKwh + usageOffPeakKwh : undefined
  );
  const totalFeedInKwh = numeric(raw, 'totalFeedInKwh') ?? (
    feedInNormalKwh != null && feedInOffPeakKwh != null ? feedInNormalKwh + feedInOffPeakKwh : undefined
  );

  const input: AnnualBillInput = {
    physicalEnergy: raw.physicalEnergy?.source === 'rules' ? raw.physicalEnergy.energyPair : undefined,
    annualizedEnergy: raw.annualizedEnergy?.source === 'rules' ? raw.annualizedEnergy.energyPair : undefined,
    energyConflicts: raw.energyConflicts?.energyConflicts ?? (['totalUsageKwh', 'totalFeedInKwh', 'usageNormalKwh', 'usageOffPeakKwh', 'feedInNormalKwh', 'feedInOffPeakKwh'] as const).filter(field => raw[field]?.requiresReview).map(field => `Conflicterende extractie voor ${field}: controleer fysieke waarden.`),
    periodEndInclusive: raw.periodEndInclusive?.value === 1,
    contractType: ['fixed', 'variable', 'dynamic', 'unknown'].includes(String(raw.contractType?.value)) ? raw.contractType!.value as AnnualBillInput['contractType'] : 'unknown',
    dynamicImportMarkupEurPerKwh: numeric(raw, 'dynamicImportMarkupEurPerKwh'),
    dynamicExportDeductionEurPerKwh: numeric(raw, 'dynamicExportDeductionEurPerKwh'),
    tariffBasis: raw.tariffBasis?.value === 'supply_only' || raw.tariffBasis?.value === 'all_in' ? raw.tariffBasis.value : undefined,
    electricityVatPercent: numeric(raw, 'electricityVatPercent'),
    electricityVatEur: numeric(raw, 'electricityVatEur'),
    supplyTariffVat: raw.supplyTariffVat?.value === 'included' || raw.supplyTariffVat?.value === 'excluded' ? raw.supplyTariffVat.value : undefined,
    energyTaxEurPerKwh: numeric(raw, 'energyTaxEurPerKwh'),
    energyTaxVat: raw.energyTaxVat?.value === 'included' || raw.energyTaxVat?.value === 'excluded' ? raw.energyTaxVat.value : undefined,
    energyTaxWeightKwh: numeric(raw, 'energyTaxWeightKwh'),
    compensatedFeedInKwh: numeric(raw, 'compensatedFeedInKwh'),
    tariffWeightNormalKwh: numeric(raw, 'tariffWeightNormalKwh'),
    tariffWeightOffPeakKwh: numeric(raw, 'tariffWeightOffPeakKwh'),
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
    ...tariffs,
    totalElectricityCostEur: numeric(raw, 'totalElectricityCostEur'),
    energyTaxElectricityEur: numeric(raw, 'energyTaxElectricityEur'),
    gridCostElectricityEur: numeric(raw, 'gridCostElectricityEur'),
    extractionConfidence: confidence(raw),
    source: 'pdf'
  };
  logAnnualBill('normalization.completed', traceId, { values: annualBillLogValues(input), usageSource: raw.totalUsageKwh ? 'explicit_total' : 'sum_normal_off_peak', feedInSource: raw.totalFeedInKwh ? 'explicit_total' : 'sum_normal_off_peak', explicitZeroFeedIn: totalFeedInKwh === 0 });
  return input;
}

