import type { AnalysisResult, AnalysisSettings } from './analysis';
import {
  buildSizingResultFromPvSelfConsumptionAdvice,
  buildDataQualityReport,
  buildPvAdviceChartsData,
  computePvSelfConsumptionAdvice,
  computePvStorageFormulaAdvice,
  derivePvIntervalFlow,
  computeSizing,
  findMaxObserved,
  groupPeakEvents,
  listPeakMoments,
  processIntervals,
  selectTopExceededIntervals,
  toScenarioResult,
  type IntervalRecord
} from './calculations';
import { normalizeConsumptionSeries } from './normalization';
import { buildPvSummaryFromScenario, findHighestPeakDay, simulateAllScenarios } from './simulation';
import { determinePvAnalysisMode } from './pvSimulation';

export const OUTLIER_KW_THRESHOLD = 5000;

export function runAnalysis(
  mappedRows: IntervalRecord[],
  settings: AnalysisSettings
): AnalysisResult | null {
  if (mappedRows.length === 0) return null;

  const normalized = normalizeConsumptionSeries(mappedRows, {
    intervalMinutes: 15,
    interpretationMode: settings.interpretationMode,
    outlierKwThreshold: OUTLIER_KW_THRESHOLD,
    allowNegativeDeltas: false
  });
  if (normalized.normalizedRows.length === 0) return null;

  const baseIntervals = processIntervals(normalized.normalizedRows, settings.contractedPowerKw);
  const quality = buildDataQualityReport(normalized.normalizedRows);
  const intervals = baseIntervals;
  const { maxObservedKw, maxObservedTimestamp } = findMaxObserved(intervals);

  if (settings.analysisType === 'PV_SELF_CONSUMPTION') {
    const pvAnalysisMode = determinePvAnalysisMode(normalized.normalizedRows);
    if (!pvAnalysisMode) return null;
    const formulaAdvice = computePvStorageFormulaAdvice(intervals, {
      customerType: settings.pvCustomerType
    });
    const hybridAdvice = computePvSelfConsumptionAdvice(intervals, {
      customerType: settings.pvCustomerType
    });
    const sizing = buildSizingResultFromPvSelfConsumptionAdvice(formulaAdvice, hybridAdvice);
    const scenarios = hybridAdvice.simulationAdvice.allScenarios.map((scenario) =>
      toScenarioResult({
        ...scenario,
        optionLabel: `${scenario.capacityKwh} kWh / ${scenario.dischargePowerKw.toFixed(1)} kW`
      })
    );
    const pvAdviceCharts = buildPvAdviceChartsData(sizing.pvFormulaAdvice ?? formulaAdvice, intervals, hybridAdvice);
    const recommendedScenario =
      scenarios.find((scenario) => scenario.capacityKwh === sizing.recommendedProduct?.capacityKwh) ?? scenarios[0] ?? null;
    const pvSummary = buildPvSummaryFromScenario(recommendedScenario);
    const exportIntervals =
      recommendedScenario?.exceedanceIntervalsBefore ??
      intervals.filter((interval) => derivePvIntervalFlow(interval).surplusKwh > 0).length;

    return {
      analysisType: settings.analysisType,
      intervals,
      events: [],
      peakMoments: [],
      sizing,
      scenarios,
      highestPeakDay: null,
      maxObservedKw,
      maxObservedTimestamp,
      topExceededIntervals: [],
      normalizationDiagnostics: normalized.diagnostics,
      quality,
      exceedanceIntervals: exportIntervals,
      pvSummary,
      pvAdviceCharts,
      pvAnalysisMode,
      pvWarnings: hybridAdvice.warnings
    };
  }

  const events = groupPeakEvents(intervals);
  const peakMoments = listPeakMoments(intervals);
  const sizing = computeSizing({
    intervals,
    events,
    method: settings.method,
    compliance: settings.compliance,
    safetyFactor: settings.safetyFactor,
    efficiency: settings.efficiency
  });
  const scenarios = simulateAllScenarios(
    intervals,
    sizing.kWNeeded,
    sizing.recommendedProduct?.capacityKwh ?? 0,
    { dischargeEfficiency: settings.efficiency }
  );
  const highestPeakDay = findHighestPeakDay(intervals);
  const topExceededIntervals = highestPeakDay ? selectTopExceededIntervals(intervals, highestPeakDay, 20) : [];
  const exceedanceIntervals = peakMoments.length;

  return {
    analysisType: settings.analysisType,
    intervals,
    events,
    peakMoments,
    sizing,
    scenarios,
    highestPeakDay,
    maxObservedKw,
    maxObservedTimestamp,
    topExceededIntervals,
    normalizationDiagnostics: normalized.diagnostics,
    quality,
    exceedanceIntervals,
    pvSummary: null,
    pvAdviceCharts: null,
    pvAnalysisMode: null,
    pvWarnings: []
  };
}
