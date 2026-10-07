import { resolveAnnualBillEnergyBasis, type EnergyBasisInput, type AnnualBillEnergyBasis } from './energyBasis';
import { buildAnnualBillSyntheticProfile, dailyStorageStatistics } from './buildAnnualBillSyntheticProfile';
import { simulateAnnualBillBattery, type AnnualBillBatterySimulation } from './simulateAnnualBillBattery';
import { getBatterySpecForCapacity } from '../../../lib/batterySpecs';
import { logAnnualBill } from './logging';
import { simulateDynamicBattery, type DynamicAnnualContext, type DynamicSimulation } from './simulateDynamicAnnualBill';
import { BATTERY_ADVICE_OPTIONS_KWH } from '../../../lib/batteryAdviceOptions';
import { isUsableAnnualTariff, DEFAULT_IMPORT_PRICE, DEFAULT_FEED_IN_PRICE } from './tariffs';

export type AnnualBillAdviceInput = EnergyBasisInput & {
  consumptionProfile?: 'home' | 'business';
  dynamicContext?: DynamicAnnualContext;
  traceId?: string;
  usageNormalKwh?: number;
  usageOffPeakKwh?: number;
  feedInNormalKwh?: number;
  feedInOffPeakKwh?: number;
  totalUsageKwh?: number;
  totalFeedInKwh?: number;
  annualPvProductionKwh?: number;
  averageImportPriceEurPerKwh?: number;
  averageFeedInPriceEurPerKwh?: number;
  batteryInvestmentEur?: number;
  /** Capacity covered by batteryInvestmentEur; an unbound quote cannot price multiple options. */
  batteryInvestmentCapacityKwh?: number;
  /** Total installed investment per capacity (EUR), on the same tax/cost basis. */
  batteryInvestmentsEurByKwh?: Record<string, number>;
  batteryOptionsKwh?: number[];
  emergencyPowerEnabled?: boolean;
  emergencyPowerReservePercent?: number;
  periodStart?: string;
  periodEnd?: string;
  solarPanelCount?: number;
  solarPanelWp?: number;
  roofOrientation?: 'south' | 'east_west' | 'east' | 'west' | 'other';
};

export type AnnualBillBatteryOptionResult = {
  technicalSimulation?: AnnualBillBatterySimulation;
  annualGridImportReductionKwh?: number;
  annualExportReductionKwh?: number;
  marginalGainKwh?: number;
  marginalGainPerAddedKwh?: number;
  specSource?: 'product' | 'fallback';
  dynamicSimulation?: DynamicSimulation;
  batteryKwh: number;
  usableCapacityKwh: number;
  estimatedAnnualStoredSolarKwh: number;
  /** Fraction 0..1 of the maximum modeled annual solar shift across the compared options. */
  percentOfMaximumSavings: number;
  estimatedAnnualSavingsEur: number;
  /** Informational financial fields, retained for compatibility; never used for selection. */
  estimatedInvestmentEur: number;
  investmentSource: 'quoted' | 'estimated';
  estimatedPaybackYears: number | null;
  utilizationScore: number;
  confidence: 'low' | 'medium';
  explanation: string;
};

export type AnnualBillAdviceResult = {
  energyBasis?: AnnualBillEnergyBasis;
  consumptionProfile?: 'home' | 'business';
  storageStatistics?: { p50: number; p75: number; p90: number };
  conservativeBatteryKwh?: number | null;
  spaciousBatteryKwh?: number | null;
  recommendationStatus?: 'recommended' | 'no_solar_shift' | 'insufficient_data';
  dynamicPricing?: DynamicAnnualContext['metadata'];
  recommendedBatteryKwh: number | null;
  totalUsageKwh: number;
  totalFeedInKwh: number;
  estimatedPvProductionKwh?: number;
  options: AnnualBillBatteryOptionResult[];
  annualSavingsRangeEur: {
    min: number;
    expected: number;
    max: number;
  };
  paybackRangeYears: {
    min: number | null;
    expected: number | null;
    max: number | null;
  };
  confidence: 'low' | 'medium';
  minimumSocPercent: number;
  efficiencyPercent: number;
  emergencyPowerReservePercent: number;
  warnings: string[];
  explanation: string;
};

const ROUND_TRIP_EFFICIENCY = 0.95;
const MINIMUM_SOC_FRACTION = 0.1;
const ANNUAL_ENERGY_SAVINGS_TARGET = 0.90;

/** Compare energy results only. Prices, costs and payback are deliberately not selection inputs. */
export function selectAnnualBillBatteryByEnergy<T extends Pick<AnnualBillBatteryOptionResult, 'batteryKwh' | 'estimatedAnnualStoredSolarKwh'>>(
  options: readonly T[]
) {
  const maxAnnualSavingsKwh = options.reduce((max, option) =>
    Number.isFinite(option.estimatedAnnualStoredSolarKwh) ? Math.max(max, option.estimatedAnnualStoredSolarKwh) : max, 0);
  const compared = [...options].sort((a, b) => a.batteryKwh - b.batteryKwh).map((option) => ({
    ...option,
    percentOfMaximumSavings: maxAnnualSavingsKwh > 0 && Number.isFinite(option.estimatedAnnualStoredSolarKwh)
      ? Math.max(0, option.estimatedAnnualStoredSolarKwh) / maxAnnualSavingsKwh : 0
  }));
  const recommended = maxAnnualSavingsKwh > 0
    ? compared.find((option) => option.percentOfMaximumSavings >= ANNUAL_ENERGY_SAVINGS_TARGET) ?? null
    : null;
  return { options: compared, maxAnnualSavingsKwh, recommended };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function resolveImportPrice(input: AnnualBillAdviceInput): { value: number; usedFallback: boolean } {
  return {
    value: isUsableAnnualTariff(input.averageImportPriceEurPerKwh) ? input.averageImportPriceEurPerKwh : DEFAULT_IMPORT_PRICE,
    usedFallback: !isUsableAnnualTariff(input.averageImportPriceEurPerKwh)
  };
}

function resolveFeedInPrice(input: AnnualBillAdviceInput): { value: number; usedFallback: boolean } {
  return {
    value: isUsableAnnualTariff(input.averageFeedInPriceEurPerKwh) ? input.averageFeedInPriceEurPerKwh : DEFAULT_FEED_IN_PRICE,
    usedFallback: !isUsableAnnualTariff(input.averageFeedInPriceEurPerKwh)
  };
}

function positiveFinite(value: number | undefined): value is number {
  return value != null && Number.isFinite(value) && value > 0;
}

function resolveBatteryInvestment(optionKwh: number, input: AnnualBillAdviceInput, optionCount: number) {
  const quote = input.batteryInvestmentsEurByKwh?.[String(optionKwh)];
  if (positiveFinite(quote)) return { estimatedInvestmentEur: quote, investmentSource: 'quoted' as const };
  const quoteApplies = input.batteryInvestmentCapacityKwh === optionKwh
    || (input.batteryInvestmentCapacityKwh == null && optionCount === 1);
  if (positiveFinite(input.batteryInvestmentEur) && quoteApplies) {
    return { estimatedInvestmentEur: input.batteryInvestmentEur, investmentSource: 'quoted' as const };
  }
  // Legacy financial estimate only; not supplier quotations and never a sizing/selection input.
  const eurPerKwh = optionKwh <= 20 ? 900 : optionKwh <= 40 ? 775 : 625;
  return { estimatedInvestmentEur: optionKwh * eurPerKwh, investmentSource: 'estimated' as const };
}

function resolveUsableFraction(input: Pick<AnnualBillAdviceInput, 'emergencyPowerEnabled' | 'emergencyPowerReservePercent'>): number {
  const emergencyReserve = input.emergencyPowerEnabled
    ? Math.max(0, Math.min(1 - MINIMUM_SOC_FRACTION, (input.emergencyPowerReservePercent ?? 0) / 100))
    : 0;
  return Math.max(0, 1 - MINIMUM_SOC_FRACTION - emergencyReserve);
}

function paybackYears(investmentEur: number, annualSavingsEur: number): number | null {
  return investmentEur > 0 && annualSavingsEur > 0 ? round2(investmentEur / annualSavingsEur) : null;
}

function rangePayback(investmentEur: number, savings: AnnualBillAdviceResult['annualSavingsRangeEur']): AnnualBillAdviceResult['paybackRangeYears'] {
  return {
    min: paybackYears(investmentEur, savings.max),
    expected: paybackYears(investmentEur, savings.expected),
    max: paybackYears(investmentEur, savings.min)
  };
}

/** Bound the plateau reference to daily storage demand; only two neighbours above the range. */
export function practicalAnnualBillOptions(options: readonly number[], p90: number, usableFraction: number) {
  const sorted = [...new Set(options)].filter(n => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  const limit = usableFraction > 0 ? p90 / usableFraction * 1.25 : 0;
  const within = sorted.filter(n => n <= limit);
  return [...within, ...sorted.filter(n => n > limit).slice(0, 2)];
}
export function calculateAnnualBillAdvice(input: AnnualBillAdviceInput): AnnualBillAdviceResult {
  const energyBasis = resolveAnnualBillEnergyBasis(input);
  const totalUsageKwh = energyBasis.gridImportKwh;
  const totalFeedInKwh = energyBasis.gridExportKwh;
  const warnings = [...energyBasis.warnings];
  const consumptionProfile = input.consumptionProfile ?? 'home';
  let baseConfidence = energyBasis.confidence;
  if (!input.consumptionProfile) { baseConfidence = 'low'; warnings.push('Verbruiksprofiel niet bevestigd: huishouden aangenomen.'); }
  if (input.annualPvProductionKwh != null && input.annualPvProductionKwh > 0 && input.annualPvProductionKwh < totalFeedInKwh) {
    baseConfidence = 'low'; warnings.push('PV-opwek is lager dan netteruglevering: controleer energiegrondslag en periode.');
  }
  const profile = buildAnnualBillSyntheticProfile(totalUsageKwh, totalFeedInKwh, consumptionProfile);
  const storageStatistics = dailyStorageStatistics(profile);
  const usableFraction = resolveUsableFraction(input);
  const emergencyReserveFraction = 1 - MINIMUM_SOC_FRACTION - usableFraction;
  const batteryOptions = energyBasis.status === 'usable' && totalUsageKwh > 0 && totalFeedInKwh > 0
    ? practicalAnnualBillOptions(input.batteryOptionsKwh ?? BATTERY_ADVICE_OPTIONS_KWH, storageStatistics.p90, usableFraction) : [];
  const importPrice = resolveImportPrice(input);
  const feedInPrice = resolveFeedInPrice(input);
  if (!input.dynamicContext && importPrice.usedFallback) warnings.push('Importprijs ontbreekt; informatieve berekening gebruikt EUR 0,30/kWh.');
  if (!input.dynamicContext && feedInPrice.usedFallback) warnings.push('Terugleververgoeding ontbreekt; informatieve berekening gebruikt EUR 0,06/kWh.');
  if (input.dynamicContext) warnings.push(...input.dynamicContext.metadata.warnings,
    'Dynamische euroberekening is een apart legacy handelsmodel met 0,5C en 95% rendement; dit bepaalt de technische capaciteit niet.');
  if (input.batteryInvestmentEur != null && (!positiveFinite(input.batteryInvestmentEur) ||
    (input.batteryInvestmentCapacityKwh == null ? batteryOptions.length !== 1 : !batteryOptions.includes(input.batteryInvestmentCapacityKwh)))) {
    warnings.push('Het investeringsbedrag is niet gebruikt: koppel een positief bedrag aan de bijbehorende capaciteit.');
  }
  if (Object.values(input.batteryInvestmentsEurByKwh ?? {}).some(n => !positiveFinite(n))) warnings.push('Ongeldige investeringen per optie: indicatieve prijsraming gebruikt.');
  const simulatedOptions = batteryOptions.map((batteryKwh) => {
    const spec = getBatterySpecForCapacity(batteryKwh);
    const technicalSimulation = simulateAnnualBillBattery(profile, spec, { minimumSocFraction: MINIMUM_SOC_FRACTION, emergencyReserveFraction });
    if (spec.fallback) warnings.push(`${batteryKwh} kWh: fallback-specificatie (0,5C, 90% rendement); productspecificatie ontbreekt.`);
    const investment = resolveBatteryInvestment(batteryKwh, input, batteryOptions.length);
    // Finance is evaluated after the technical physics and cannot influence its output.
    const dynamicSimulation = input.dynamicContext ? simulateDynamicBattery(input.dynamicContext.hours, batteryKwh, usableFraction, ROUND_TRIP_EFFICIENCY) : undefined;
    const savings = dynamicSimulation?.savingsEur ?? (technicalSimulation.annualGridImportReductionKwh * importPrice.value - technicalSimulation.annualExportReductionKwh * feedInPrice.value);
    return {
      batteryKwh, technicalSimulation, dynamicSimulation,
      annualGridImportReductionKwh: technicalSimulation.annualGridImportReductionKwh,
      annualExportReductionKwh: technicalSimulation.annualExportReductionKwh,
      // Compatibility alias: delivered solar energy / avoided grid import, not charge input.
      estimatedAnnualStoredSolarKwh: technicalSimulation.annualGridImportReductionKwh,
      usableCapacityKwh: technicalSimulation.usableCapacityKwh,
      estimatedAnnualSavingsEur: round2(savings), ...investment,
      estimatedPaybackYears: paybackYears(investment.estimatedInvestmentEur, savings),
      utilizationScore: Math.min(1, technicalSimulation.equivalentCyclesPerYear / 365),
      confidence: spec.fallback ? 'low' as const : baseConfidence,
      specSource: spec.fallback ? 'fallback' as const : 'product' as const,
      explanation: `Fysiek gesimuleerd: ${round2(technicalSimulation.annualGridImportReductionKwh)} kWh minder netafname per jaar. Financi?n uitsluitend informatief.`
    };
  });
  const selection = selectAnnualBillBatteryByEnergy(simulatedOptions);
  const options = selection.options.map((option, index, all) => {
    const previous = all[index - 1];
    const marginalGainKwh = previous ? option.annualGridImportReductionKwh - previous.annualGridImportReductionKwh : option.annualGridImportReductionKwh;
    return { ...option, marginalGainKwh, marginalGainPerAddedKwh: marginalGainKwh / (option.batteryKwh - (previous?.batteryKwh ?? 0)) };
  });
  const recommended = options.find(x => x.batteryKwh === selection.recommended?.batteryKwh);
  const threshold = (target: number) => selection.maxAnnualSavingsKwh > 0 ? options.find(x => x.percentOfMaximumSavings + 1e-12 >= target)?.batteryKwh ?? null : null;
  if (options.some(x => x.investmentSource === 'estimated')) warnings.push('Investering is een indicatieve prijsraming, geen offerte; uitsluitend gebruikt voor informatieve terugverdientijd.');
  warnings.push('Indicatief advies op basis van jaarnota; kwartierdata geeft een nauwkeuriger dimensionering.',
    'Geschatte seizoen- en weekpatronen; kwartiergemiddelden kunnen zowel import als export bevatten. P75 is uitsluitend een basisindicatie. Geen degradatie of gemeten pieken; financi?le band ?25% is een modelaanname.');
  const expected = recommended?.estimatedAnnualSavingsEur ?? 0;
  const annualSavingsRangeEur = { min: round2(Math.min(expected * 0.75, expected * 1.25)), expected, max: round2(Math.max(expected * 0.75, expected * 1.25)) };
  const recommendationStatus = energyBasis.status === 'insufficient_data' ? 'insufficient_data' : recommended ? 'recommended' : 'no_solar_shift';
  logAnnualBill('calculation.ranking', input.traceId, { recommendedBatteryKwh: recommended?.batteryKwh ?? null, recommendationStatus, rankingMethod: 'smallest_capacity_at_90_percent_energy', maxAnnualSavingsKwh: selection.maxAnnualSavingsKwh });
  return {
    energyBasis, consumptionProfile, storageStatistics, recommendationStatus,
    conservativeBatteryKwh: threshold(0.8), spaciousBatteryKwh: threshold(0.95),
    dynamicPricing: input.dynamicContext?.metadata,
    recommendedBatteryKwh: recommended?.batteryKwh ?? null,
    totalUsageKwh, totalFeedInKwh, estimatedPvProductionKwh: input.annualPvProductionKwh,
    options, annualSavingsRangeEur, paybackRangeYears: rangePayback(recommended?.estimatedInvestmentEur ?? 0, annualSavingsRangeEur),
    confidence: recommended?.confidence ?? baseConfidence,
    minimumSocPercent: 10, efficiencyPercent: recommended ? getBatterySpecForCapacity(recommended.batteryKwh).roundTripEfficiency * 100 : 90,
    emergencyPowerReservePercent: emergencyReserveFraction * 100,
    warnings,
    explanation: recommendationStatus === 'insufficient_data' ? 'Geen betrouwbaar batterijcapaciteitsadvies mogelijk: controleer de energiegrondslag.'
      : recommended ? `${recommended.batteryKwh} kWh is de kleinste relevante batterij die minimaal 90% van de maximaal praktisch haalbare reductie van netafname realiseert. Een grotere batterij levert volgens het geschatte jaarprofiel relatief weinig extra energiebesparing op. Prijzen, investering en terugverdientijd wijzigen de capaciteit niet.`
      : 'Geen batterij aanbevolen: geen positieve reductie van netafname door opgeslagen zonnestroom.'
  };
}
