import type { AnalysisResult, AnalysisSettings, AnnualBillInput } from './analysis';
import type { IntervalRecord } from './calculations';
import type { MarketYear } from '../src/lib/annual-bill/recentDynamicPrices';
import { prepareDynamicAnnualContext } from '../src/lib/annual-bill/simulateDynamicAnnualBill';
import { runAnalysis } from './clientAnalysis';
import { calculateAnnualBillAdvice, type AnnualBillAdviceInput } from '../src/lib/annual-bill/calculateAnnualBillAdvice';
import { logAnnualBill, annualBillLogValues } from '../src/lib/annual-bill/logging';
import { isUsableAnnualTariff, resolveAnnualBillPrices, tariffFields, annualBillPriceWarnings } from '../src/lib/annual-bill/tariffs';

const DAYS_PER_YEAR = 365;
const SYNTHETIC_PROFILE_DAYS = 31;

function finiteOrZero(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, value as number) : 0;
}

function resolveTotalUsageKwh(input: AnnualBillInput): number {
  const splitTotal = finiteOrZero(input.usageNormalKwh) + finiteOrZero(input.usageOffPeakKwh);
  return input.totalUsageKwh != null ? finiteOrZero(input.totalUsageKwh) : splitTotal;
}

function resolveTotalFeedInKwh(input: AnnualBillInput): number {
  const splitTotal = finiteOrZero(input.feedInNormalKwh) + finiteOrZero(input.feedInOffPeakKwh);
  return input.totalFeedInKwh != null ? finiteOrZero(input.totalFeedInKwh) : splitTotal;
}

function resolveEveningNightUsageKwh(input: AnnualBillInput, totalUsageKwh: number): number {
  if (Number.isFinite(input.usageOffPeakKwh)) return finiteOrZero(input.usageOffPeakKwh);
  return totalUsageKwh * 0.45;
}

function buildSyntheticPvRows(input: AnnualBillInput): IntervalRecord[] {
  const periodStart = input.periodStart ? new Date(input.periodStart) : new Date(Date.UTC(new Date().getUTCFullYear() - 1, 0, 1));
  const startMs = Number.isNaN(periodStart.getTime()) ? Date.UTC(new Date().getUTCFullYear() - 1, 0, 1) : periodStart.getTime();
  const totalUsageKwh = resolveTotalUsageKwh(input);
  const totalFeedInKwh = resolveTotalFeedInKwh(input);
  const eveningNightUsageKwh = resolveEveningNightUsageKwh(input, totalUsageKwh);
  const annualPvProductionKwh = finiteOrZero(input.annualPvProductionKwh);
  const dailyEveningImportKwh = eveningNightUsageKwh / SYNTHETIC_PROFILE_DAYS;
  const dailyExportKwh = totalFeedInKwh / SYNTHETIC_PROFILE_DAYS;
  const dailyPvKwh = annualPvProductionKwh > 0 ? annualPvProductionKwh / SYNTHETIC_PROFILE_DAYS : undefined;
  const rows: IntervalRecord[] = [];

  for (let dayIndex = 0; dayIndex < SYNTHETIC_PROFILE_DAYS; dayIndex += 1) {
    const dayOffset = Math.round((dayIndex * DAYS_PER_YEAR) / SYNTHETIC_PROFILE_DAYS);
    const dayStart = startMs + dayOffset * 24 * 60 * 60 * 1000;
    rows.push({
      timestamp: new Date(dayStart + 12 * 60 * 60 * 1000).toISOString(),
      consumptionKwh: 0,
      exportKwh: dailyExportKwh,
      pvKwh: dailyPvKwh
    });
    rows.push({
      timestamp: new Date(dayStart + 19 * 60 * 60 * 1000).toISOString(),
      consumptionKwh: dailyEveningImportKwh,
      exportKwh: 0,
      pvKwh: 0
    });
  }

  return rows;
}

function getMissingFields(input: AnnualBillInput): string[] {
  const missing: string[] = [];
  if (resolveTotalUsageKwh(input) <= 0 && resolveTotalFeedInKwh(input) <= 0) missing.push('verbruik of teruglevering');
  return [...new Set([...(input.missingFields ?? []), ...missing])];
}

function completeAnnualBillInput(input: AnnualBillInput): AnnualBillInput {
  const totalUsageKwh = resolveTotalUsageKwh(input);
  const totalFeedInKwh = resolveTotalFeedInKwh(input);

  if (totalUsageKwh > 0 && totalFeedInKwh > 0) return input;
  if (input.totalUsageKwh == null && input.usageNormalKwh == null && input.usageOffPeakKwh == null && totalFeedInKwh > 0) {
    return {
      ...input,
      totalUsageKwh: totalFeedInKwh * 2.5,
      missingFields: [...(input.missingFields ?? []), 'totaal verbruik geschat']
    };
  }
  if (input.totalFeedInKwh == null && input.feedInNormalKwh == null && input.feedInOffPeakKwh == null && totalUsageKwh > 0) {
    return {
      ...input,
      totalFeedInKwh: totalUsageKwh * 0.25,
      missingFields: [...(input.missingFields ?? []), 'totale teruglevering geschat']
    };
  }
  return input;
}

function weightedImportPrice(input: AnnualBillInput): number | undefined {
  const prices = resolveAnnualBillPrices(input);
  return prices.importSource === 'fallback' ? undefined : prices.importPrice;
}

function toAnnualBillAdviceInput(input: AnnualBillInput, settings: AnalysisSettings): AnnualBillAdviceInput {
  return {
    traceId: input.traceId,
    usageNormalKwh: input.usageNormalKwh,
    usageOffPeakKwh: input.usageOffPeakKwh,
    feedInNormalKwh: input.feedInNormalKwh,
    feedInOffPeakKwh: input.feedInOffPeakKwh,
    totalUsageKwh: input.totalUsageKwh,
    totalFeedInKwh: input.totalFeedInKwh,
    annualPvProductionKwh: input.annualPvProductionKwh,
    averageImportPriceEurPerKwh: weightedImportPrice(input),
    averageFeedInPriceEurPerKwh: input.feedInTariffEurPerKwh,
    batteryInvestmentEur: input.batteryInvestmentEur,
    batteryInvestmentCapacityKwh: input.batteryInvestmentCapacityKwh,
    batteryInvestmentsEurByKwh: input.batteryInvestmentsEurByKwh,
    emergencyPowerEnabled: settings.emergencyPowerEnabled,
    emergencyPowerReservePercent: settings.emergencyPowerReservePercent,
    solarPanelCount: input.solarPanelCount,
    solarPanelWp: input.solarPanelWp,
    roofOrientation: input.roofOrientation
  };
}

export function buildAnnualBillIndicativeAnalysis(
  input: AnnualBillInput,
  settings: AnalysisSettings,
  marketYear?: MarketYear
): AnalysisResult | null {
  if (input.contractType === 'dynamic' && !marketYear) throw new Error('Voor een dynamisch contract is een volledig jaar actuele marktprijzen nodig.');
  if (input.contractType === 'dynamic' && (
    (input.totalUsageKwh == null && input.usageNormalKwh == null && input.usageOffPeakKwh == null) ||
    (input.totalFeedInKwh == null && input.feedInNormalKwh == null && input.feedInOffPeakKwh == null)
  )) throw new Error('Vul voor de dynamische simulatie zowel netafname als teruglevering in. Geen teruglevering? Vul 0 in.');
  const startedAt = performance.now();
  logAnnualBill('calculation.started', input.traceId, { inputMode: settings.pvInputMode, values: annualBillLogValues(input) });
  const missingFields = getMissingFields(input);
  if (missingFields.includes('verbruik of teruglevering')) {
    logAnnualBill('calculation.rejected', input.traceId, { reason: 'usage_and_feed_in_missing' }, 'warn');
    return null;
  }

  const completedInput = { ...completeAnnualBillInput(input) };
  const tariffWarnings: string[] = [];
  for (const field of tariffFields) {
    if (completedInput[field] != null && !isUsableAnnualTariff(completedInput[field])) {
      logAnnualBill('calculation.tariff.rejected', input.traceId, { field, value: completedInput[field], reason: 'outside_annual_average_review_range' }, 'warn');
      tariffWarnings.push(`Tarief ${field} (${completedInput[field]} EUR/kWh) afgewezen; controleer de oorspronkelijke nota.`);
      completedInput[field] = undefined;
    }
  }
  if (input.contractType !== 'dynamic') tariffWarnings.push(...annualBillPriceWarnings(completedInput));
  const completedMissingFields = [...new Set([...(completedInput.missingFields ?? []), ...missingFields])];
  logAnnualBill('calculation.inputs_resolved', input.traceId, {
    original: annualBillLogValues(input), resolved: annualBillLogValues(completedInput),
    estimatedUsage: resolveTotalUsageKwh(input) !== resolveTotalUsageKwh(completedInput),
    estimatedFeedIn: resolveTotalFeedInKwh(input) !== resolveTotalFeedInKwh(completedInput),
    explicitZeroFeedIn: input.totalFeedInKwh === 0,
    priceResolution: resolveAnnualBillPrices(completedInput),
    importPrice: weightedImportPrice(completedInput) ?? 0.3,
    feedInPrice: completedInput.feedInTariffEurPerKwh ?? 0.06,
    importPriceFallback: weightedImportPrice(completedInput) == null,
    feedInPriceFallback: completedInput.feedInTariffEurPerKwh == null
  });
  const rows = buildSyntheticPvRows(completedInput);
  logAnnualBill('calculation.synthetic_profile', input.traceId, { rowCount: rows.length, sampleDays: SYNTHETIC_PROFILE_DAYS, measuredQuarterData: false, purpose: 'compatibility_analysis_not_annual_recommendation' });
  const result = runAnalysis(rows, {
    ...settings,
    analysisType: 'PV_SELF_CONSUMPTION',
    pvInputMode: settings.pvInputMode,
    interpretationMode: 'INTERVAL'
  });
  if (!result) {
    logAnnualBill('calculation.failed', input.traceId, { reason: 'synthetic_analysis_empty' }, 'error');
    return null;
  }

  const dynamicContext = input.contractType === 'dynamic' && marketYear
    ? prepareDynamicAnnualContext(completedInput, marketYear, resolveTotalUsageKwh(completedInput), resolveTotalFeedInKwh(completedInput)) : undefined;
  const annualBillAdvice = calculateAnnualBillAdvice({ ...toAnnualBillAdviceInput(completedInput, settings), dynamicContext });
  if (!input.contractType || input.contractType === 'unknown') annualBillAdvice.warnings.push('Contracttype onbekend: gerekend met gemiddelde notatarieven. Kies dynamisch als dit bij uw contract hoort.');
  annualBillAdvice.warnings.push(...tariffWarnings);
  const annualWarnings = [...new Set([
    ...annualBillAdvice.warnings,
    ...completedMissingFields.map((field) => `Ontbrekend veld: ${field}.`)
  ])];
  logAnnualBill('calculation.completed', input.traceId, {
    recommendedBatteryKwh: annualBillAdvice.recommendedBatteryKwh,
    annualSavingsRangeEur: annualBillAdvice.annualSavingsRangeEur,
    paybackRangeYears: annualBillAdvice.paybackRangeYears,
    confidence: annualBillAdvice.confidence,
    investmentEstimated: annualBillAdvice.options.some((option) => option.investmentSource === 'estimated'),
    options: annualBillAdvice.options.map(({ batteryKwh, estimatedAnnualStoredSolarKwh, percentOfMaximumSavings, estimatedAnnualSavingsEur, estimatedPaybackYears, utilizationScore }) => ({ batteryKwh, estimatedAnnualStoredSolarKwh, percentOfMaximumSavings, estimatedAnnualSavingsEur, estimatedPaybackYears, utilizationScore })),
    warningCount: annualBillAdvice.warnings.length,
    durationMs: Math.round(performance.now() - startedAt)
  });

  return {
    ...result,
    quality: {
      ...result.quality,
      warnings: []
    },
    // The synthetic compatibility profile has no measured-data warnings to show.
    pvWarnings: annualWarnings,
    annualBillAdvice,
    annualBillInput: completedInput
  };
}
