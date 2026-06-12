import { annualBillConfidenceLabel, resolveAverageImportPrice, resolveAnnualFeedInKwh, resolveAnnualUsageKwh, resolveEstimatedPvProduction } from './annualBillUx';

export type AnnualBillAdviceInput = {
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
  batteryOptionsKwh?: number[];
  periodStart?: string;
  periodEnd?: string;
  solarPanelCount?: number;
  solarPanelWp?: number;
  roofOrientation?: 'south' | 'east_west' | 'east' | 'west' | 'other';
};

export type AnnualBillBatteryOptionResult = {
  batteryKwh: number;
  usableCapacityKwh: number;
  estimatedAnnualStoredSolarKwh: number;
  estimatedAnnualSavingsEur: number;
  estimatedPaybackYears: number | null;
  utilizationScore: number;
  confidence: 'low' | 'medium';
  explanation: string;
};

export type AnnualBillAdviceResult = {
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
  warnings: string[];
  explanation: string;
};

const DEFAULT_BATTERY_OPTIONS_KWH = [5, 10, 15, 20, 30, 40, 64, 96];
const USABLE_FRACTION = 0.9;
const ROUND_TRIP_EFFICIENCY = 0.9;
const DAYS_PER_YEAR = 365;

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
    value: resolveAverageImportPrice(input),
    usedFallback: input.averageImportPriceEurPerKwh == null
  };
}

function resolveFeedInPrice(input: AnnualBillAdviceInput): { value: number; usedFallback: boolean } {
  return {
    value: input.averageFeedInPriceEurPerKwh ?? 0.06,
    usedFallback: input.averageFeedInPriceEurPerKwh == null
  };
}

function estimatePvProduction(input: AnnualBillAdviceInput): number | undefined {
  return resolveEstimatedPvProduction(input);
}

function estimateBatteryInvestment(optionKwh: number, input: AnnualBillAdviceInput): number {
  if (Number.isFinite(input.batteryInvestmentEur) && (input.batteryInvestmentEur ?? 0) > 0) {
    return input.batteryInvestmentEur as number;
  }
  const eurPerKwh = optionKwh <= 20 ? 900 : optionKwh <= 40 ? 775 : 625;
  return optionKwh * eurPerKwh;
}

function calculateStoredSolarKwh(optionKwh: number, totalUsageKwh: number, totalFeedInKwh: number): number {
  const usableCapacityKwh = optionKwh * USABLE_FRACTION;
  const annualEveningDemandKwh = totalUsageKwh * 0.45;
  const practicalAnnualShiftableKwh = Math.min(totalFeedInKwh, annualEveningDemandKwh);
  const dailyFeedInKwh = totalFeedInKwh / DAYS_PER_YEAR;
  const dailyCoverageFactor = dailyFeedInKwh > 0 ? 1 - Math.exp(-usableCapacityKwh / Math.max(1, dailyFeedInKwh * 1.6)) : 0;
  const cycleLimitKwh = usableCapacityKwh * 230;

  return Math.min(practicalAnnualShiftableKwh * dailyCoverageFactor, cycleLimitKwh) * ROUND_TRIP_EFFICIENCY;
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
  const estimatedPvProductionKwh = estimatePvProduction(input);
  const warnings: string[] = [];

  if (totalUsageKwh <= 0) warnings.push('Totaal verbruik ontbreekt of is nul.');
  if (totalFeedInKwh <= 0) warnings.push('Totale teruglevering ontbreekt of is nul.');
  if (importPrice.usedFallback) warnings.push('Importprijs ontbreekt; gerekend met indicatieve fallback van EUR 0,30/kWh.');
  if (feedInPrice.usedFallback) warnings.push('Terugleververgoeding ontbreekt; gerekend met indicatieve fallback van EUR 0,06/kWh.');
  if (!estimatedPvProductionKwh) warnings.push('Jaarlijkse PV-opwek ontbreekt; advies gebruikt alleen verbruik en teruglevering.');
  if (!input.batteryInvestmentEur) warnings.push('Batterij-investering ontbreekt; terugverdientijd gebruikt een geschatte investering per batterijgrootte.');

  const confidence = confidenceFor(input, importPrice.usedFallback || feedInPrice.usedFallback);
  const batteryOptions = [...new Set(input.batteryOptionsKwh ?? DEFAULT_BATTERY_OPTIONS_KWH)]
    .filter((option) => Number.isFinite(option) && option > 0)
    .sort((a, b) => a - b);

  const options = batteryOptions.map<AnnualBillBatteryOptionResult>((batteryKwh) => {
    const usableCapacityKwh = batteryKwh * USABLE_FRACTION;
    const estimatedAnnualStoredSolarKwh =
      totalUsageKwh > 0 && totalFeedInKwh > 0 ? calculateStoredSolarKwh(batteryKwh, totalUsageKwh, totalFeedInKwh) : 0;
    const estimatedAnnualSavingsEur = estimatedAnnualStoredSolarKwh * valuePerStoredKwh;
    const utilizationScore = usableCapacityKwh > 0
      ? Math.min(1, estimatedAnnualStoredSolarKwh / Math.max(1, usableCapacityKwh * 220))
      : 0;

    return {
      batteryKwh,
      usableCapacityKwh: round2(usableCapacityKwh),
      estimatedAnnualStoredSolarKwh: round2(estimatedAnnualStoredSolarKwh),
      estimatedAnnualSavingsEur: round2(estimatedAnnualSavingsEur),
      estimatedPaybackYears: paybackYears(estimateBatteryInvestment(batteryKwh, input), estimatedAnnualSavingsEur),
      utilizationScore: round2(utilizationScore),
      confidence,
      explanation:
        `Deze optie kan indicatief ${round2(estimatedAnnualStoredSolarKwh)} kWh zonne-overschot per jaar verschuiven op basis van jaarvolumes.`
    };
  });

  const recommended =
    options
      .filter((option) => option.estimatedAnnualStoredSolarKwh > 0)
      .map((option, index) => {
        const previous = index > 0 ? options[index - 1] : null;
        const marginalSavings = previous
          ? option.estimatedAnnualSavingsEur - previous.estimatedAnnualSavingsEur
          : option.estimatedAnnualSavingsEur;
        const paybackPenalty = option.estimatedPaybackYears == null ? 0.2 : Math.min(0.35, option.estimatedPaybackYears / 80);
        const score = option.utilizationScore * 0.45 + Math.min(1, marginalSavings / 150) * 0.35 - paybackPenalty;
        return { option, score };
      })
      .sort((a, b) => b.score - a.score || a.option.batteryKwh - b.option.batteryKwh)[0]?.option ?? null;

  const expectedSavings = recommended?.estimatedAnnualSavingsEur ?? 0;
  const annualSavingsRangeEur = {
    min: round2(expectedSavings * 0.75),
    expected: round2(expectedSavings),
    max: round2(expectedSavings * 1.25)
  };
  const investment = recommended ? estimateBatteryInvestment(recommended.batteryKwh, input) : 0;

  return {
    recommendedBatteryKwh: recommended?.batteryKwh ?? null,
    totalUsageKwh: round2(totalUsageKwh),
    totalFeedInKwh: round2(totalFeedInKwh),
    estimatedPvProductionKwh: estimatedPvProductionKwh == null ? undefined : round2(estimatedPvProductionKwh),
    options,
    annualSavingsRangeEur,
    paybackRangeYears: rangePayback(investment, annualSavingsRangeEur),
    confidence,
    warnings,
    explanation:
      'Dit is een indicatief batterijadvies op basis van jaarnota-totalen. Zonder kwartierprofiel schat de app hoeveel jaarlijkse teruglevering praktisch naar avond/nachtverbruik kan worden verschoven.'
  };
}
