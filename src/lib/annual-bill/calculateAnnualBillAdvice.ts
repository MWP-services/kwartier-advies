import { annualBillConfidenceLabel, resolveAnnualFeedInKwh, resolveAnnualUsageKwh, resolveEstimatedPvProduction } from './annualBillUx';
import { logAnnualBill } from './logging';
import { simulateDynamicBattery, type DynamicAnnualContext, type DynamicSimulation } from './simulateDynamicAnnualBill';
import { BATTERY_ADVICE_OPTIONS_KWH } from '../../../lib/batteryAdviceOptions';
import { isUsableAnnualTariff, DEFAULT_IMPORT_PRICE, DEFAULT_FEED_IN_PRICE } from './tariffs';

export type AnnualBillAdviceInput = {
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
const DAYS_PER_YEAR = 365;
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

function resolveTotalUsageKwh(input: AnnualBillAdviceInput): number {
  return resolveAnnualUsageKwh(input);
}

function resolveTotalFeedInKwh(input: AnnualBillAdviceInput): number {
  return resolveAnnualFeedInKwh(input);
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

function estimatePvProduction(input: AnnualBillAdviceInput): number | undefined {
  return resolveEstimatedPvProduction(input);
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

function calculateStoredSolarKwh(optionKwh: number, totalUsageKwh: number, totalFeedInKwh: number, usableFraction: number): number {
  const usableCapacityKwh = optionKwh * usableFraction;
  const annualEveningDemandKwh = totalUsageKwh * 0.45;
  const practicalAnnualShiftableKwh = Math.min(totalFeedInKwh, annualEveningDemandKwh);
  const dailyFeedInKwh = totalFeedInKwh / DAYS_PER_YEAR;
  const dailyCoverageFactor = dailyFeedInKwh > 0 ? 1 - Math.exp(-usableCapacityKwh / Math.max(1, dailyFeedInKwh * 1.6)) : 0;
  const cycleLimitKwh = usableCapacityKwh * 230;

  return Math.min(practicalAnnualShiftableKwh * dailyCoverageFactor, cycleLimitKwh) * ROUND_TRIP_EFFICIENCY;
}

function resolveUsableFraction(input: Pick<AnnualBillAdviceInput, 'emergencyPowerEnabled' | 'emergencyPowerReservePercent'>): number {
  const emergencyReserve = input.emergencyPowerEnabled
    ? Math.max(0, Math.min(1 - MINIMUM_SOC_FRACTION, (input.emergencyPowerReservePercent ?? 0) / 100))
    : 0;
  return Math.max(0, 1 - MINIMUM_SOC_FRACTION - emergencyReserve);
}

function confidenceFor(input: AnnualBillAdviceInput, usedPriceFallback: boolean): 'low' | 'medium' {
  if (usedPriceFallback) return 'low';
  return annualBillConfidenceLabel(input);
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

export function calculateAnnualBillAdvice(input: AnnualBillAdviceInput): AnnualBillAdviceResult {
  const totalUsageKwh = resolveTotalUsageKwh(input);
  const totalFeedInKwh = resolveTotalFeedInKwh(input);
  const importPrice = resolveImportPrice(input);
  const feedInPrice = resolveFeedInPrice(input);
  const valuePerStoredKwh = Math.max(0, importPrice.value - feedInPrice.value);
  logAnnualBill('calculation.prices_used', input.traceId, { requestedImportPrice: input.averageImportPriceEurPerKwh, requestedFeedInPrice: input.averageFeedInPriceEurPerKwh, importPrice: importPrice.value, feedInPrice: feedInPrice.value, importPriceFallback: importPrice.usedFallback, feedInPriceFallback: feedInPrice.usedFallback, valuePerStoredKwh });
  const estimatedPvProductionKwh = estimatePvProduction(input);
  const warnings: string[] = [];

  if (totalUsageKwh <= 0) warnings.push('Totaal verbruik ontbreekt of is nul.');
  if (totalFeedInKwh <= 0) warnings.push('Totale teruglevering ontbreekt of is nul.');
  if (!input.dynamicContext && importPrice.usedFallback) warnings.push('Importprijs ontbreekt; gerekend met indicatieve fallback van EUR 0,30/kWh.');
  if (!input.dynamicContext && feedInPrice.usedFallback) warnings.push('Terugleververgoeding ontbreekt; gerekend met indicatieve fallback van EUR 0,06/kWh.');
  if (input.dynamicContext) warnings.push(...input.dynamicContext.metadata.warnings, 'Batterijmodel: 95% rendement, vermogen 0,5 maal capaciteit (kW), geen vaste jaargrens voor cycli en lege beginvoorraad boven de reserve. Het aantal equivalente cycli volgt uit de gesimuleerde ontlading gedeeld door de bruikbare capaciteit; extra slijtage wordt nog niet financieel doorgerekend.');
  if (!estimatedPvProductionKwh) warnings.push('Jaarlijkse PV-opwek ontbreekt; advies gebruikt alleen verbruik en teruglevering.');

  const baseConfidence = confidenceFor(input, importPrice.usedFallback || feedInPrice.usedFallback);
  const usableFraction = resolveUsableFraction(input);
  const batteryOptions = [...new Set(input.batteryOptionsKwh ?? BATTERY_ADVICE_OPTIONS_KWH)]
    .filter((option) => Number.isFinite(option) && option > 0)
    .sort((a, b) => a - b);

  if (input.batteryInvestmentEur != null && (!positiveFinite(input.batteryInvestmentEur)
    || (input.batteryInvestmentCapacityKwh == null ? batteryOptions.length !== 1 : !batteryOptions.includes(input.batteryInvestmentCapacityKwh)))) {
    warnings.push('Het opgegeven investeringsbedrag is niet gebruikt: vul een positief totaalbedrag met bijbehorende batterijcapaciteit in, of geef een investering per optie. Eén bedrag zonder capaciteit kan meerdere batterijen niet eerlijk vergelijken.');
  }
  if (Object.values(input.batteryInvestmentsEurByKwh ?? {}).some((value) => !positiveFinite(value))) {
    warnings.push('Een of meer investeringen per optie zijn ongeldig. Deze bedragen worden niet gebruikt; per capaciteit geldt een geldige gekoppelde offerte of de indicatieve prijsraming.');
  }

  const simulatedOptions = batteryOptions.map<Omit<AnnualBillBatteryOptionResult, 'percentOfMaximumSavings'>>((batteryKwh) => {
    const investment = resolveBatteryInvestment(batteryKwh, input, batteryOptions.length);
    const usableCapacityKwh = batteryKwh * usableFraction;
    const dynamicSimulation = input.dynamicContext ? simulateDynamicBattery(input.dynamicContext.hours, batteryKwh, usableFraction, ROUND_TRIP_EFFICIENCY) : undefined;
    const estimatedAnnualStoredSolarKwh = dynamicSimulation?.deliveredSolarKwh ?? (
      totalUsageKwh > 0 && totalFeedInKwh > 0 ? calculateStoredSolarKwh(batteryKwh, totalUsageKwh, totalFeedInKwh, usableFraction) : 0
    );
    const estimatedAnnualSavingsEur = dynamicSimulation?.savingsEur ?? estimatedAnnualStoredSolarKwh * valuePerStoredKwh;
    const utilizationScore = usableCapacityKwh > 0
      ? Math.min(1, (estimatedAnnualStoredSolarKwh + (dynamicSimulation?.deliveredGridKwh ?? 0)) / Math.max(1, usableCapacityKwh * 220))
      : 0;

    return {
      dynamicSimulation,
      batteryKwh,
      usableCapacityKwh: round2(usableCapacityKwh),
      estimatedAnnualStoredSolarKwh: round2(estimatedAnnualStoredSolarKwh),
      estimatedAnnualSavingsEur: round2(estimatedAnnualSavingsEur),
      ...investment,
      estimatedPaybackYears: paybackYears(investment.estimatedInvestmentEur, estimatedAnnualSavingsEur),
      utilizationScore: round2(utilizationScore),
      confidence: !input.dynamicContext && investment.investmentSource === 'estimated' ? 'low' : baseConfidence,
      explanation: (dynamicSimulation
        ? `Gesimuleerd verschil in jaarlijkse stroomkosten: EUR ${round2(dynamicSimulation.savingsEur)}, inclusief laden uit het net en gemiste terugleveropbrengst.`
        :
        `Deze optie kan indicatief ${round2(estimatedAnnualStoredSolarKwh)} kWh zonne-overschot per jaar verschuiven op basis van jaarvolumes.`)
        + ` Investering voor ${batteryKwh} kWh: EUR ${round2(investment.estimatedInvestmentEur)} (${investment.investmentSource === 'quoted' ? 'opgegeven voor deze capaciteit' : 'indicatieve prijsraming, geen offerte'}).`
    };
  });

  const { options, maxAnnualSavingsKwh, recommended } = selectAnnualBillBatteryByEnergy(simulatedOptions);
  const hasEstimatedInvestments = options.some((option) => option.investmentSource === 'estimated');
  if (hasEstimatedInvestments) warnings.push('Uitsluitend voor de informatieve terugverdientijd zijn investeringskosten geheel of gedeeltelijk geschat: t/m 20 kWh EUR 900/kWh, boven 20 t/m 40 kWh EUR 775/kWh, boven 40 kWh EUR 625/kWh. Dit zijn geen geverifieerde offertes. Investeringen, prijsstaffels en terugverdientijden hebben geen invloed op de aanbevolen capaciteit.');
  warnings.push('De batterijselectie gebruikt de verschoven zonnestroom in kWh, niet de eurobesparing. Dit is geen uitspraak over rendabiliteit. Onderhoud, degradatie, financiering en toekomstige tariefwijzigingen zijn niet doorgerekend. Het verbruiksprofiel is geschat uit jaarvolumes; de financiële besparingsband van -25% tot +25% is een modelaanname, geen statistisch betrouwbaarheidsinterval.');
  const confidence = !input.dynamicContext && hasEstimatedInvestments ? 'low' : baseConfidence;

  if (!recommended) warnings.push('Geen batterij aanbevolen: geen positieve jaarlijkse verschuiving van zonnestroom berekend. Eventuele eurobesparing door energiehandel is geen selectiecriterium.');
  logAnnualBill('calculation.ranking', input.traceId, {
    assumptions: { usableFraction, minimumSocFraction: MINIMUM_SOC_FRACTION, roundTripEfficiency: ROUND_TRIP_EFFICIENCY, emergencyPowerReservePercent: input.emergencyPowerEnabled ? input.emergencyPowerReservePercent ?? 0 : 0, eveningDemandFraction: 0.45, maxCycles: input.dynamicContext ? null : 230, daysPerYear: DAYS_PER_YEAR },
    rankingMethod: 'smallest_capacity_at_90_percent_energy',
    maxAnnualSavingsKwh,
    targetSavingsFraction: ANNUAL_ENERGY_SAVINGS_TARGET,
    ranking: options.map(({ batteryKwh, estimatedAnnualStoredSolarKwh, percentOfMaximumSavings }) => ({ batteryKwh, estimatedAnnualStoredSolarKwh, percentOfMaximumSavings })),
    recommendedBatteryKwh: recommended?.batteryKwh ?? null
  });

  const expectedSavings = recommended?.estimatedAnnualSavingsEur ?? 0;
  const annualSavingsRangeEur = {
    min: round2(expectedSavings * 0.75),
    expected: round2(expectedSavings),
    max: round2(expectedSavings * 1.25)
  };
  const investment = recommended?.estimatedInvestmentEur ?? 0;

  return {
    dynamicPricing: input.dynamicContext?.metadata,
    recommendedBatteryKwh: recommended?.batteryKwh ?? null,
    totalUsageKwh: round2(totalUsageKwh),
    totalFeedInKwh: round2(totalFeedInKwh),
    estimatedPvProductionKwh: estimatedPvProductionKwh == null ? undefined : round2(estimatedPvProductionKwh),
    options,
    annualSavingsRangeEur,
    paybackRangeYears: rangePayback(investment, annualSavingsRangeEur),
    confidence,
    minimumSocPercent: MINIMUM_SOC_FRACTION * 100,
    efficiencyPercent: ROUND_TRIP_EFFICIENCY * 100,
    emergencyPowerReservePercent: input.emergencyPowerEnabled ? Math.max(0, Math.min(80, input.emergencyPowerReservePercent ?? 0)) : 0,
    warnings,
    explanation: 'Dit is een indicatief batterijadvies op basis van jaarnota-totalen. De aanbevolen batterij is de kleinste beschikbare batterij die minimaal 90% van de maximaal haalbare jaarlijkse energiebesparing realiseert, gemeten als extra eigen gebruik van zonnestroom binnen de doorgerekende opties. Een grotere batterij levert volgens het model relatief weinig extra jaarlijkse energiebesparing op. Prijzen, investeringen en terugverdientijden bepalen de keuze niet. '
      + (input.dynamicContext
      ? 'Dynamisch contract: de jaarvolumes zijn verdeeld over een geschat uurprofiel. De laatste 365 volledige dagen marktprijzen bepalen de stroomkosten met en zonder batterij, inclusief verschoven zonnestroom, laden uit het net en batterijverlies. De besparing is het verschil tussen die kosten; vermeden afname telt eenmaal mee. Dit blijft een indicatie, geen gemeten verbruiksprofiel.'
      :
      'Zonder kwartierprofiel schat de app hoeveel jaarlijkse teruglevering praktisch naar avond/nachtverbruik kan worden verschoven. Dit is geen exacte dimensionering; controleer het werkelijke verbruiksprofiel met kwartierdata.')
  };
}
