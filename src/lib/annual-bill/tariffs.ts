import type { AnnualBillInput } from '../../../lib/analysis';

export const tariffFields = ['normalTariffEurPerKwh', 'offPeakTariffEurPerKwh', 'feedInTariffEurPerKwh'] as const;
// Review threshold for annual averages, not a legal or market price limit.
export const MAX_ABS_ANNUAL_TARIFF = 2;
export const DEFAULT_IMPORT_PRICE = 0.3;
export const DEFAULT_FEED_IN_PRICE = 0.06;
export function isUsableAnnualTariff(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_ABS_ANNUAL_TARIFF;
}
export function resolveAnnualBillPrices(input: AnnualBillInput) {
  const normal = isUsableAnnualTariff(input.normalTariffEurPerKwh) ? input.normalTariffEurPerKwh : undefined;
  const offPeak = isUsableAnnualTariff(input.offPeakTariffEurPerKwh) ? input.offPeakTariffEurPerKwh : undefined;
  const normalWeight = input.tariffWeightNormalKwh ?? input.usageNormalKwh;
  const offPeakWeight = input.tariffWeightOffPeakKwh ?? input.usageOffPeakKwh;
  const normalUsage = Number.isFinite(normalWeight) ? Math.max(0, normalWeight ?? 0) : 0;
  const offPeakUsage = Number.isFinite(offPeakWeight) ? Math.max(0, offPeakWeight ?? 0) : 0;
  const weighted = normal != null && offPeak != null && normalUsage + offPeakUsage > 0;
  const supplyPrice = weighted ? (normal! * normalUsage + offPeak! * offPeakUsage) / (normalUsage + offPeakUsage) : normal ?? offPeak ?? DEFAULT_IMPORT_PRICE;
  const isFallback = normal == null && offPeak == null;
  const vatPercent = typeof input.electricityVatPercent === 'number' && Number.isFinite(input.electricityVatPercent) && input.electricityVatPercent >= 0 && input.electricityVatPercent <= 100 ? input.electricityVatPercent : undefined;
  const hasTaxRate = isUsableAnnualTariff(input.energyTaxEurPerKwh) && input.energyTaxEurPerKwh >= 0;
  const compose = !isFallback && input.tariffBasis === 'supply_only';
  const energyTaxPrice = compose && hasTaxRate ? input.energyTaxEurPerKwh! : 0;
  const vatOnSupply = compose && input.supplyTariffVat === 'excluded' && vatPercent != null ? supplyPrice * vatPercent / 100 : 0;
  const vatOnEnergyTax = compose && hasTaxRate && input.energyTaxVat === 'excluded' && vatPercent != null ? energyTaxPrice * vatPercent / 100 : 0;
  const missingComponents = compose ? [
    ...(!hasTaxRate ? ['energy_tax_rate'] : []),
    ...(!input.supplyTariffVat ? ['supply_vat_inclusion'] : []),
    ...(hasTaxRate && !input.energyTaxVat ? ['energy_tax_vat_inclusion'] : []),
    ...((input.supplyTariffVat === 'excluded' || (hasTaxRate && input.energyTaxVat === 'excluded')) && vatPercent == null ? ['vat_percentage'] : [])
  ] : !isFallback && !input.tariffBasis && (hasTaxRate || input.supplyTariffVat != null) ? ['tariff_tax_inclusion'] : [];
  const composedPrice = supplyPrice + energyTaxPrice + vatOnSupply + vatOnEnergyTax;
  const totalRejected = !isUsableAnnualTariff(composedPrice);
  return {
    importPrice: totalRejected ? DEFAULT_IMPORT_PRICE : composedPrice,
    importSource: totalRejected ? 'fallback' : weighted ? 'weighted_normal_off_peak' : normal != null ? 'normal_tariff' : offPeak != null ? 'off_peak_tariff' : 'fallback',
    components: { supplyPrice, energyTaxPrice, vatOnSupply, vatOnEnergyTax, vatPercent, supplyVatTreatment: input.supplyTariffVat, energyTaxVatTreatment: input.energyTaxVat },
    missingComponents,
    totalRejected,
    feedInPrice: isUsableAnnualTariff(input.feedInTariffEurPerKwh) ? input.feedInTariffEurPerKwh : DEFAULT_FEED_IN_PRICE,
    feedInSource: isUsableAnnualTariff(input.feedInTariffEurPerKwh) ? 'feed_in_tariff' : 'fallback',
    weightsKwh: { normal: normalUsage, offPeak: offPeakUsage },
    weightSource: input.tariffWeightNormalKwh != null || input.tariffWeightOffPeakKwh != null ? 'billed_tariff_rows' : 'annual_usage_split',
    rejectedFields: tariffFields.filter((field) => input[field] != null && !isUsableAnnualTariff(input[field]))
  };
}

export function annualBillPriceWarnings(input: AnnualBillInput): string[] {
  const prices = resolveAnnualBillPrices(input);
  const labels: Record<string, string> = { energy_tax_rate: 'energiebelasting per kWh', supply_vat_inclusion: 'of het leveringstarief inclusief btw is', energy_tax_vat_inclusion: 'of de energiebelasting inclusief btw is', vat_percentage: 'het btw-percentage', tariff_tax_inclusion: 'of de opgegeven stroomprijs energiebelasting al bevat' };
  return [
    ...(prices.missingComponents.length ? [`Stroomprijs nog onvolledig: controleer ${prices.missingComponents.map((key) => labels[key]).join(', ')}. Alleen onderbouwde bedragen zijn meegenomen.`] : []),
    ...(prices.totalRejected ? ['Samengestelde stroomprijs buiten controlebereik; gerekend met EUR 0,30/kWh.'] : [])
  ];
}
