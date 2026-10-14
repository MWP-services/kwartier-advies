import { SIZING_CONFIG, SIZING_POLICIES } from './sizingPolicy';
import { resolveAnnualBillEnergyBasis, type EnergyBasisInput, type AnnualBillEnergyBasis } from './energyBasis';
import { buildAnnualBillSyntheticProfile, dailyStorageStatistics } from './buildAnnualBillSyntheticProfile';
import { simulateAnnualBillBattery, type AnnualBillBatterySimulation } from './simulateAnnualBillBattery';
import { getBatterySpecForCapacity } from '../../../lib/batterySpecs';
import { logAnnualBill } from './logging';
import { simulateDynamicBattery, type DynamicAnnualContext, type DynamicSimulation } from './simulateDynamicAnnualBill';
import { BATTERY_ADVICE_OPTIONS_KWH } from '../../../lib/batteryAdviceOptions';
import { isUsableAnnualTariff, DEFAULT_IMPORT_PRICE, DEFAULT_FEED_IN_PRICE } from './tariffs';

export type AnnualBillAdviceInput = EnergyBasisInput & {
  consumptionProfile?: import('@/src/lib/annual-bill/buildAnnualBillSyntheticProfile').ConsumptionProfile;
  sizingPolicy?: import('@/src/lib/annual-bill/sizingPolicy').SizingPolicy;
  customConsumption?: import('@/src/lib/annual-bill/buildAnnualBillSyntheticProfile').CustomConsumption;
  futureAdditionalImportKwh?: number;
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
  scenarioImportReductionKwh?: number[];
  selectionEnergyKwh?: number;
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
  targetAchieved?: boolean;
  scenarioPotentialFraction?: number;
  scenarioLabels?: string[];
  practicalMaximumReliable?: boolean;
  scenarioCapacityRange?: { min: number; max: number };
  selectionExplanation?: string;
  energyBasis?: AnnualBillEnergyBasis;
  consumptionProfile?: import('@/src/lib/annual-bill/buildAnnualBillSyntheticProfile').ConsumptionProfile;
  sizingPolicy?: import('@/src/lib/annual-bill/sizingPolicy').SizingPolicy;
  customConsumption?: import('@/src/lib/annual-bill/buildAnnualBillSyntheticProfile').CustomConsumption;
  futureAdditionalImportKwh?: number;
  storageStatistics?: { p50: number; p75: number; p90: number };
  conservativeBatteryKwh?: number | null;
  spaciousBatteryKwh?: number | null;
  recommendationStatus?: 'recommended' | 'no_solar_shift' | 'insufficient_data';
  /** Compatibility numeric ranges remain present; consumers must respect this status. */
  savingsCalculationStatus?: 'calculated' | 'not_calculated';
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
const ANNUAL_ENERGY_SAVINGS_TARGET = SIZING_POLICIES.spacious.target;

/** Compare energy results only. Prices, costs and payback are deliberately not selection inputs. */
export function selectAnnualBillBatteryByEnergy<T extends { batteryKwh: number; annualGridImportReductionKwh: number }>(
  options: readonly T[], target: number = ANNUAL_ENERGY_SAVINGS_TARGET
) {
  const maxAnnualSavingsKwh = options.reduce((max, option) =>
    Number.isFinite(option.annualGridImportReductionKwh) ? Math.max(max, option.annualGridImportReductionKwh) : max, 0);
  const compared = [...options].sort((a, b) => a.batteryKwh - b.batteryKwh).map((option) => ({
    ...option,
    percentOfMaximumSavings: maxAnnualSavingsKwh > 0 && Number.isFinite(option.annualGridImportReductionKwh)
      ? Math.max(0, option.annualGridImportReductionKwh) / maxAnnualSavingsKwh : 0
  }));
  const recommended = maxAnnualSavingsKwh > 0
    ? compared.find((option) => option.percentOfMaximumSavings + 1e-12 >= target) ?? null
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

/** Compatibility helper: broad daily-energy envelope; never stop at two neighbours. */
export function practicalAnnualBillOptions(options: readonly number[], p90: number, usableFraction: number, physicalLimit = Infinity) {
  if (!(p90 > 0) || !Number.isFinite(p90) || !(usableFraction > 0)) return [];
  const limit = Number.isFinite(physicalLimit) ? physicalLimit : p90 * 4 / usableFraction;
  return [...new Set(options)].filter(n => Number.isFinite(n) && n > 0 && n <= limit).sort((a,b) => a-b);
}
export function calculateAnnualBillAdvice(input: AnnualBillAdviceInput): AnnualBillAdviceResult {
  const energyBasis = resolveAnnualBillEnergyBasis(input);
  const totalUsageKwh = energyBasis.gridImportKwh;
  const totalFeedInKwh = energyBasis.gridExportKwh;
  const warnings = [...energyBasis.warnings];
  const consumptionProfile = input.consumptionProfile && ['home', 'business', 'office', 'agricultural', 'continuous', 'custom', 'unknown'].includes(input.consumptionProfile) ? input.consumptionProfile : 'unknown';
  const customConsumption = input.customConsumption ?? { dayPercent: 50, nightPercent: 50, weekendPercent: 28.57 };
  let baseConfidence = energyBasis.confidence;
  if (consumptionProfile === 'unknown') { baseConfidence = 'low'; warnings.push('Verbruiksprofiel onbekend: kantoor, continu en avondgericht verbruik worden vergeleken.'); }
  if (input.annualPvProductionKwh != null && input.annualPvProductionKwh > 0 && input.annualPvProductionKwh < totalFeedInKwh) {
    energyBasis.status = 'insufficient_data'; baseConfidence = 'low'; warnings.push('PV-opwek is lager dan netteruglevering: controleer energiegrondslag en periode.');
  }
  if (consumptionProfile === 'custom' && input.customConsumption && (![input.customConsumption.dayPercent, input.customConsumption.nightPercent, input.customConsumption.weekendPercent].every(n => Number.isFinite(n) && n >= 0 && n <= 100) || Math.abs(input.customConsumption.dayPercent + input.customConsumption.nightPercent - 100) > 0.01)) { energyBasis.status = 'insufficient_data'; warnings.push('Maatwerkverdeling ongeldig: dag en nacht moeten samen 100% zijn.'); }
  const profile = energyBasis.status === 'usable' ? buildAnnualBillSyntheticProfile(totalUsageKwh, totalFeedInKwh, consumptionProfile, 0, customConsumption) : [];
  const storageStatistics = energyBasis.status === 'usable' ? dailyStorageStatistics(profile) : undefined;
  const usableFraction = resolveUsableFraction(input);
  const emergencyReserveFraction = 1 - MINIMUM_SOC_FRACTION - usableFraction;
  const sizingPolicy = input.sizingPolicy && Object.prototype.hasOwnProperty.call(SIZING_POLICIES, input.sizingPolicy) ? input.sizingPolicy : SIZING_CONFIG.defaultPolicy;
  const target = SIZING_POLICIES[sizingPolicy].target;
  const scenarioProfiles = energyBasis.status !== 'usable' ? [] : consumptionProfile === 'unknown'
    ? (['office', 'continuous', 'home'] as const).map(p => buildAnnualBillSyntheticProfile(totalUsageKwh, totalFeedInKwh, p))
    : [-SIZING_CONFIG.scenarioVariation, 0, SIZING_CONFIG.scenarioVariation].map(v => buildAnnualBillSyntheticProfile(totalUsageKwh, totalFeedInKwh, consumptionProfile, v, customConsumption));
  const scenarioLabels = consumptionProfile === 'unknown' ? ['Kantoor', 'Continu', 'Woning/avond'] : ['Meer dagverbruik', 'Verwacht', 'Meer avond/nacht'];
  if (energyBasis.status === 'usable' && sizingPolicy === 'future' && input.futureAdditionalImportKwh != null) {
    if (!Number.isFinite(input.futureAdditionalImportKwh) || input.futureAdditionalImportKwh < 0 || input.futureAdditionalImportKwh > totalUsageKwh * SIZING_CONFIG.maximumFutureGrowthFraction) {
      warnings.push('Toekomstige groei ongeldig of groter dan 50%; afzonderlijke analyse nodig.'); baseConfidence = 'low';
    } else { scenarioLabels.push('Expliciete toekomstige groei'); scenarioProfiles.push(buildAnnualBillSyntheticProfile(totalUsageKwh + input.futureAdditionalImportKwh, totalFeedInKwh, consumptionProfile, SIZING_CONFIG.scenarioVariation, customConsumption)); }
  }
  const scenarioStats = scenarioProfiles.map(dailyStorageStatistics);
  const dailyNeed = Math.max(0, ...scenarioStats.map(s => Math.max(s.p90, s.p75 * 1.25, s.p50 * 1.5)));
  const physicalLimit = usableFraction > 0 ? SIZING_CONFIG.maxStorageDays * Math.min(totalUsageKwh, totalFeedInKwh) / 365 / usableFraction : 0;
  const batteryOptions = energyBasis.status === 'usable' && totalUsageKwh > 0 && totalFeedInKwh > 0
    ? practicalAnnualBillOptions(input.batteryOptionsKwh ?? BATTERY_ADVICE_OPTIONS_KWH, dailyNeed, usableFraction, physicalLimit) : [];
  if (dailyNeed > 0 && !batteryOptions.length) warnings.push('Geen catalogusbatterij binnen de fysieke bovengrens; een kleinere opslagoplossing kan passend zijn.');
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
    if (spec.fallback) warnings.push(`${batteryKwh} kWh: fallback-specificatie; ${spec.assumptions ?? '0,5C en 90% rendement aangenomen wegens ontbrekende productspecificatie.'}`);
    const investment = resolveBatteryInvestment(batteryKwh, input, batteryOptions.length);
    // Finance is evaluated after the technical physics and cannot influence its output.
    const dynamicSimulation = input.dynamicContext ? simulateDynamicBattery(input.dynamicContext.hours, batteryKwh, usableFraction, ROUND_TRIP_EFFICIENCY) : undefined;
    const savings = dynamicSimulation?.savingsEur ?? (technicalSimulation.annualGridImportReductionKwh * importPrice.value - technicalSimulation.annualExportReductionKwh * feedInPrice.value);
    const scenarioImportReductionKwh = scenarioProfiles.map(p => simulateAnnualBillBattery(p, spec, { minimumSocFraction: MINIMUM_SOC_FRACTION, emergencyReserveFraction }).annualGridImportReductionKwh);
    // Equal scenario weights, with no automatic worst-case capacity selection.
    const selectionEnergyKwh = scenarioImportReductionKwh.reduce((a,b) => a+b, 0) / Math.max(1, scenarioImportReductionKwh.length);
    return {
      scenarioImportReductionKwh, selectionEnergyKwh,
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
      explanation: `Fysiek gesimuleerd: ${round2(technicalSimulation.annualGridImportReductionKwh)} kWh minder netafname per jaar. Financiën uitsluitend informatief.`
    };
  });
  const selection = selectAnnualBillBatteryByEnergy(simulatedOptions, target);
  const maximum = Math.max(0, ...simulatedOptions.map(o => o.selectionEnergyKwh));
  let best = 0; let flatSteps = 0;
  for (const o of simulatedOptions) {
    const gain = Math.max(0, o.selectionEnergyKwh - best);
    flatSteps = gain <= maximum * SIZING_CONFIG.plateauRelativeGain ? flatSteps + 1 : 0;
    best = Math.max(best, o.selectionEnergyKwh);
  }
  const practicalMaximumReliable = flatSteps >= SIZING_CONFIG.plateauSteps;
  if (maximum > 0 && !practicalMaximumReliable) { baseConfidence = 'low'; warnings.push('Praktisch maximum niet betrouwbaar vastgesteld binnen de technische bovengrens/catalogus; percentages gelden uitsluitend voor onderzochte opties.'); }
  const choose = (fraction: number, energies = simulatedOptions.map(o => o.selectionEnergyKwh)) => {
    const max = Math.max(0, ...energies); if (!max) return undefined;
    let chosen = simulatedOptions.findIndex((o,i) => energies[i] >= fraction * max - 1e-9);
    // Reject capacity jumps for negligible incremental energy, even near a percentage boundary.
    while (chosen > 0) {
      const prev = chosen - 1; const gain = energies[chosen] - energies[prev];
      const added = simulatedOptions[chosen].batteryKwh - simulatedOptions[prev].batteryKwh;
      if (gain >= SIZING_CONFIG.minimumAnnualGainKwh && gain / added >= SIZING_CONFIG.minimumGainPerAddedKwh) break;
      chosen--;
    }
    return simulatedOptions[chosen];
  };
  const scenarioCapacities = scenarioProfiles.map((_,i) => choose(target, simulatedOptions.map(o => o.scenarioImportReductionKwh[i]))?.batteryKwh).filter((n): n is number => n != null);
  const chooseWithReserve = (fraction: number) => {
    const selected = choose(fraction);
    if (!selected || fraction <= SIZING_POLICIES.compact.target) return selected;
    const next = simulatedOptions[simulatedOptions.indexOf(selected) + 1];
    const gain = next ? next.selectionEnergyKwh - selected.selectionEnergyKwh : 0;
    const scenarioNeedsMore = scenarioProfiles.some((_,i) => (choose(fraction, simulatedOptions.map(o => o.scenarioImportReductionKwh[i]))?.batteryKwh ?? 0) > selected.batteryKwh);
    return next && scenarioNeedsMore && next.batteryKwh / selected.batteryKwh <= SIZING_CONFIG.maxReserveCapacityRatio
      && gain >= SIZING_CONFIG.minimumAnnualGainKwh && gain / (next.batteryKwh-selected.batteryKwh) >= SIZING_CONFIG.minimumGainPerAddedKwh
      && next.technicalSimulation.equivalentCyclesPerYear >= SIZING_CONFIG.minimumCycles ? next : selected;
  };
  const selected = chooseWithReserve(target);
  const compact = choose(SIZING_POLICIES.compact.target);
  const scenarioPotentialFraction = maximum > 0 && selected ? selected.selectionEnergyKwh / maximum : 0;
  const targetAchieved = scenarioPotentialFraction + 1e-12 >= target;
  const selectionExplanation = `${SIZING_POLICIES[sizingPolicy].label}: doel ${target*100}% van het onderzochte opslagpotentieel, op basis van gelijk gewogen plausibele scenarios. Extra capaciteit vereist minstens ${SIZING_CONFIG.minimumAnnualGainKwh} kWh/jaar en ${SIZING_CONFIG.minimumGainPerAddedKwh} kWh/jaar per extra kWh capaciteit. Een extra scenariostap is beperkt tot 50% meer capaciteit en minimaal 40 cycli/jaar. Geen vaste capaciteitsopslag; noodstroomreserve is afzonderlijk afgetrokken. Geselecteerd scenariogemiddelde: ${(scenarioPotentialFraction * 100).toFixed(1)}% van het onderzochte maximum. ${targetAchieved ? 'Het procentdoel binnen de onderzochte opties is gehaald.' : 'Het procentdoel is niet gehaald: verdere vergroting heeft onvoldoende marginale technische waarde of er is geen passende optie.'}`;
  const options = selection.options.map((option, index, all) => {
    const previous = all[index - 1];
    const marginalGainKwh = previous ? option.annualGridImportReductionKwh - previous.annualGridImportReductionKwh : option.annualGridImportReductionKwh;
    return { ...option, marginalGainKwh, marginalGainPerAddedKwh: marginalGainKwh / (option.batteryKwh - (previous?.batteryKwh ?? 0)) };
  });
  const recommended = options.find(x => x.batteryKwh === selected?.batteryKwh);
  if (options.some(x => x.investmentSource === 'estimated')) warnings.push('Investering is een indicatieve prijsraming, geen offerte; uitsluitend gebruikt voor informatieve terugverdientijd.');
  warnings.push('Indicatief advies op basis van jaarnota; kwartierdata geeft een nauwkeuriger dimensionering.',
    'Geschatte seizoen- en weekpatronen; alleen netto kwartieroverschot of -tekort is beschikbaar voor de batterij. Bruto jaartotalen blijven behouden. P75 is uitsluitend een basisindicatie. Geen degradatie of gemeten pieken; financiële band ±25% is een modelaanname.');
  const expected = recommended?.estimatedAnnualSavingsEur ?? 0;
  const annualSavingsRangeEur = { min: round2(Math.min(expected * 0.75, expected * 1.25)), expected, max: round2(Math.max(expected * 0.75, expected * 1.25)) };
  const recommendationStatus = energyBasis.status === 'insufficient_data' ? 'insufficient_data' : recommended ? 'recommended' : 'no_solar_shift';
  logAnnualBill('calculation.ranking', input.traceId, { recommendedBatteryKwh: recommended?.batteryKwh ?? null, recommendationStatus, rankingMethod: 'scenario_energy_v3', maxAnnualSavingsKwh: selection.maxAnnualSavingsKwh });
  return {
    energyBasis, consumptionProfile, storageStatistics, recommendationStatus,
    savingsCalculationStatus: recommendationStatus === 'insufficient_data' ? 'not_calculated' : 'calculated',
    sizingPolicy, targetAchieved, scenarioPotentialFraction, scenarioLabels, practicalMaximumReliable, selectionExplanation, scenarioCapacityRange: scenarioCapacities.length ? { min: Math.min(...scenarioCapacities), max: Math.max(...scenarioCapacities) } : undefined,
    conservativeBatteryKwh: compact?.batteryKwh ?? null, spaciousBatteryKwh: chooseWithReserve(0.95)?.batteryKwh ?? null,
    dynamicPricing: input.dynamicContext?.metadata,
    recommendedBatteryKwh: recommended?.batteryKwh ?? null,
    totalUsageKwh, totalFeedInKwh, estimatedPvProductionKwh: input.annualPvProductionKwh,
    options, annualSavingsRangeEur, paybackRangeYears: rangePayback(recommended?.estimatedInvestmentEur ?? 0, annualSavingsRangeEur),
    confidence: energyBasis.status === 'insufficient_data' || !practicalMaximumReliable ? 'low' : recommended?.confidence ?? baseConfidence,
    minimumSocPercent: 10, efficiencyPercent: recommended ? getBatterySpecForCapacity(recommended.batteryKwh).roundTripEfficiency * 100 : 90,
    emergencyPowerReservePercent: emergencyReserveFraction * 100,
    warnings,
    explanation: recommendationStatus === 'insufficient_data' ? 'Geen betrouwbaar batterijcapaciteitsadvies mogelijk: controleer de energiegrondslag.'
      : recommended ? `${recommended.batteryKwh} kWh is geselecteerd. ${selectionExplanation} Deze batterij benut ${(recommended.percentOfMaximumSavings * 100).toFixed(1)}% van de verwachte reductie binnen de onderzochte opties. ${practicalMaximumReliable ? 'De marginale winst vlakt over meerdere capaciteiten af.' : 'Het praktische maximum is onzeker; geen gegarandeerde doelrealisatie.'} Financi�n bepalen de capaciteit niet.`
      : dailyNeed > 0 && !batteryOptions.length ? 'Geen passende catalogusbatterij binnen de technische bovengrens. Dit betekent niet dat opslagpotentieel ontbreekt.' : 'Op basis van de beschikbare teruglevering is geen PV-opslagbatterij aanbevolen.'
  };
}
