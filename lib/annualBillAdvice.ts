import type { AnalysisResult, AnalysisSettings, AnnualBillInput } from './analysis';
import type { IntervalRecord } from './calculations';
import { runAnalysis } from './clientAnalysis';
import { calculateAnnualBillAdvice, type AnnualBillAdviceInput } from '../src/lib/annual-bill/calculateAnnualBillAdvice';

const DAYS_PER_YEAR = 365;
const SYNTHETIC_PROFILE_DAYS = 31;

function finiteOrZero(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, value as number) : 0;
}

function resolveTotalUsageKwh(input: AnnualBillInput): number {
  const splitTotal = finiteOrZero(input.usageNormalKwh) + finiteOrZero(input.usageOffPeakKwh);
  return finiteOrZero(input.totalUsageKwh) || splitTotal;
}

function resolveTotalFeedInKwh(input: AnnualBillInput): number {
  const splitTotal = finiteOrZero(input.feedInNormalKwh) + finiteOrZero(input.feedInOffPeakKwh);
  return finiteOrZero(input.totalFeedInKwh) || splitTotal;
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
  if (totalUsageKwh <= 0 && totalFeedInKwh > 0) {
    return {
      ...input,
      totalUsageKwh: totalFeedInKwh * 2.5,
      missingFields: [...(input.missingFields ?? []), 'totaal verbruik geschat']
    };
  }
  if (totalFeedInKwh <= 0 && totalUsageKwh > 0) {
    return {
      ...input,
      totalFeedInKwh: totalUsageKwh * 0.25,
      missingFields: [...(input.missingFields ?? []), 'totale teruglevering geschat']
    };
  }
  return input;
}

function weightedImportPrice(input: AnnualBillInput): number | undefined {
  const normalUsage = finiteOrZero(input.usageNormalKwh);
  const offPeakUsage = finiteOrZero(input.usageOffPeakKwh);
  const total = normalUsage + offPeakUsage;
  if (total > 0 && Number.isFinite(input.normalTariffEurPerKwh) && Number.isFinite(input.offPeakTariffEurPerKwh)) {
    return ((normalUsage * (input.normalTariffEurPerKwh as number)) + (offPeakUsage * (input.offPeakTariffEurPerKwh as number))) / total;
  }
  return input.normalTariffEurPerKwh ?? input.offPeakTariffEurPerKwh;
}

function toAnnualBillAdviceInput(input: AnnualBillInput): AnnualBillAdviceInput {
  return {
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
    solarPanelCount: input.solarPanelCount,
    solarPanelWp: input.solarPanelWp,
    roofOrientation: input.roofOrientation
  };
}

export function buildAnnualBillIndicativeAnalysis(
  input: AnnualBillInput,
  settings: AnalysisSettings
): AnalysisResult | null {
  const missingFields = getMissingFields(input);
  if (missingFields.includes('verbruik of teruglevering')) {
    return null;
  }

  const completedInput = completeAnnualBillInput(input);
  const completedMissingFields = [...new Set([...(completedInput.missingFields ?? []), ...missingFields])];
  const rows = buildSyntheticPvRows(completedInput);
  const result = runAnalysis(rows, {
    ...settings,
    analysisType: 'PV_SELF_CONSUMPTION',
    pvInputMode: settings.pvInputMode,
    interpretationMode: 'INTERVAL'
  });
  if (!result) return null;

  const warning =
    'Indicatief advies op basis van jaarnota: er is geen kwartierprofiel beschikbaar. Kwartierdata blijft leidend voor een nauwkeurig batterijadvies.';
  const annualBillAdvice = calculateAnnualBillAdvice(toAnnualBillAdviceInput(completedInput));

  return {
    ...result,
    quality: {
      ...result.quality,
      warnings: [...result.quality.warnings, warning]
    },
    pvWarnings: [...(result.pvWarnings ?? []), warning, ...annualBillAdvice.warnings, ...completedMissingFields.map((field) => `Ontbrekend veld: ${field}.`)],
    annualBillAdvice
  };
}
