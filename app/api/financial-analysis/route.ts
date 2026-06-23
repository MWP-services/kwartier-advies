import { NextResponse } from 'next/server';
import type { AnalysisSettings } from '@/lib/analysis';
import type {
  ProcessedInterval,
  PvBatterySimulationResult,
  PvSelfConsumptionAdviceResult,
  PvStorageFormulaAdviceResult
} from '@/lib/calculations';
import { buildPvAdviceChartsData, computePvSelfConsumptionAdvice } from '@/lib/calculations';
import { attachPricesToIntervals, type PriceInterval } from '@/lib/pricing';
import { fetchHistoricalDynamicPricesForRange } from '@/src/lib/dynamicPrices';
import { getAnalysisResult } from '@/lib/serverDataStore';
import { getAnalysisJobStore } from '@/lib/analysisJobStore';

export const runtime = 'nodejs';

interface FinancialAnalysisRequestBody {
  analysisId?: string;
  intervals?: ProcessedInterval[];
  formulaAdvice?: PvStorageFormulaAdviceResult | null;
  settings?: AnalysisSettings;
  priceIntervals?: PriceInterval[];
}

function compactPvBatterySimulationResult(scenario: PvBatterySimulationResult): PvBatterySimulationResult {
  const compactScenario = { ...scenario };
  delete compactScenario.valueByInterval;
  delete compactScenario.socSeries;
  return compactScenario;
}

function compactPvSelfConsumptionAdvice(advice: PvSelfConsumptionAdviceResult): PvSelfConsumptionAdviceResult {
  return {
    ...advice,
    simulationAdvice: {
      conservative: compactPvBatterySimulationResult(advice.simulationAdvice.conservative),
      recommended: compactPvBatterySimulationResult(advice.simulationAdvice.recommended),
      spacious: compactPvBatterySimulationResult(advice.simulationAdvice.spacious),
      allScenarios: advice.simulationAdvice.allScenarios.map(compactPvBatterySimulationResult)
    }
  };
}

function getIntervalRange(intervals: ProcessedInterval[]): { start: string; end: string } | null {
  const timestamps = intervals
    .map((interval) => interval.timestamp)
    .filter((timestamp): timestamp is string => typeof timestamp === 'string')
    .sort();
  if (timestamps.length === 0) return null;

  const start = timestamps[0];
  const last = new Date(timestamps[timestamps.length - 1]);
  if (Number.isNaN(last.getTime())) return null;

  return {
    start,
    end: new Date(last.getTime() + 15 * 60 * 1000).toISOString()
  };
}

async function resolveDynamicPriceIntervals(
  intervals: ProcessedInterval[],
  settings: AnalysisSettings,
  submittedPriceIntervals: PriceInterval[]
): Promise<PriceInterval[]> {
  if (settings.pvPricingMode !== 'dynamic' || submittedPriceIntervals.length > 0) {
    return submittedPriceIntervals;
  }

  const range = getIntervalRange(intervals);
  if (!range) return submittedPriceIntervals;

  try {
    const dynamicPoints = await fetchHistoricalDynamicPricesForRange(range.start, range.end);
    return dynamicPoints.map((point) => ({
      ts: point.start,
      startTs: point.start,
      endTs: point.end,
      importPriceEurPerKwh: point.importPriceEurPerKwh,
      exportPriceEurPerKwh: point.exportPriceEurPerKwh,
      source: 'dynamic_exact' as const
    }));
  } catch {
    return submittedPriceIntervals;
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as FinancialAnalysisRequestBody;

    if ((!Array.isArray(body.intervals) && !body.analysisId) || !body.settings) {
      return NextResponse.json({ error: 'Ongeldige financiele analyse-aanvraag.' }, { status: 400 });
    }

    if (body.settings.analysisType !== 'PV_SELF_CONSUMPTION') {
      return NextResponse.json({ error: 'Financiele analyse is alleen beschikbaar voor PV self consumption.' }, { status: 400 });
    }

    const persistedJob = body.analysisId ? await getAnalysisJobStore().getJob(body.analysisId) : null;
    const persistedAnalysis = persistedJob?.status === 'completed' ? persistedJob.result ?? null : null;
    const storedAnalysis = body.analysisId ? getAnalysisResult(body.analysisId) ?? persistedAnalysis : null;
    const intervals = storedAnalysis?.intervals ?? body.intervals;
    const formulaAdvice = storedAnalysis?.sizing.pvFormulaAdvice ?? body.formulaAdvice ?? null;

    if (!intervals) {
      return NextResponse.json({ error: 'Analyse niet gevonden. Voer de analyse opnieuw uit.' }, { status: 404 });
    }

    const priceIntervals = await resolveDynamicPriceIntervals(
      intervals,
      body.settings,
      body.priceIntervals ?? []
    );
    const pricingAttachment =
      body.settings.pvPricingMode === 'average'
        ? null
        : attachPricesToIntervals(intervals, priceIntervals, {
            pricingMode: body.settings.pvPricingMode,
            averageImportPriceEurPerKwh: body.settings.pvImportPriceEurPerKwh,
            averageExportPriceEurPerKwh: body.settings.pvExportCompensationEurPerKwh,
            averageFeedInCostEurPerKwh: body.settings.pvFeedInCostEurPerKwh,
            priceIntervals,
            fallbackToAveragePrices: body.settings.pvFallbackToAveragePrices
          });

    const pricedIntervals = pricingAttachment?.intervalsWithPrices ?? intervals;
    const financialAdvice = computePvSelfConsumptionAdvice(pricedIntervals, {
      customerType: body.settings.pvCustomerType,
      economics: {
        importPriceEurPerKwh: body.settings.pvImportPriceEurPerKwh,
        exportCompensationEurPerKwh: body.settings.pvExportCompensationEurPerKwh,
        feedInCostEurPerKwh: body.settings.pvFeedInCostEurPerKwh,
        installationCostEur: body.settings.pvInstallationCostEur,
        yearlyMaintenanceEur: body.settings.pvYearlyMaintenanceEur,
        pricingMode: body.settings.pvPricingMode,
        fallbackToAveragePrices: body.settings.pvFallbackToAveragePrices,
        priceIntervals,
        pricingStats: pricingAttachment?.pricingStats
      }
    });
    const charts = formulaAdvice
      ? buildPvAdviceChartsData(formulaAdvice, intervals, financialAdvice)
      : null;

    return NextResponse.json({ financialAdvice: compactPvSelfConsumptionAdvice(financialAdvice), charts });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Financiele analyse op de server is mislukt.' },
      { status: 500 }
    );
  }
}
