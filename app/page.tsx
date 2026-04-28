'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { AnalysisResult, AnalysisSettings } from '@/lib/analysis';
import { analysisSettingsEqual, defaultAnalysisSettings } from '@/lib/analysis';
import { Charts } from '@/components/Charts';
import { ColumnMapper } from '@/components/ColumnMapper';
import { ComplianceSlider } from '@/components/ComplianceSlider';
import { DataQualityPanel } from '@/components/DataQualityPanel';
import { KpiCards } from '@/components/KpiCards';
import { PvAdviceCharts } from '@/components/PvAdviceCharts';
import { ScenarioCharts } from '@/components/ScenarioCharts';
import { ScenarioTable } from '@/components/ScenarioTable';
import { Upload } from '@/components/Upload';
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
  toScenarioResult
} from '@/lib/calculations';
import {
  autoDetectColumns,
  mapRows,
  parseCsv,
  parseXlsx,
  type ColumnMapping
} from '@/lib/parsing';
import { attachPricesToIntervals, parsePriceFile, type PriceInterval } from '@/lib/pricing';
import { normalizeConsumptionSeries } from '@/lib/normalization';
import { buildPvSummaryFromScenario, findHighestPeakDay, simulateAllScenarios } from '@/lib/simulation';
import { determinePvAnalysisMode } from '@/lib/pvSimulation';

const OUTLIER_KW_THRESHOLD = 5000;

function mappingEqual(a: ColumnMapping | null, b: ColumnMapping): boolean {
  if (!a) return false;
  return (
    a.timestamp === b.timestamp &&
    a.consumptionKwh === b.consumptionKwh &&
    (a.exportKwh ?? '') === (b.exportKwh ?? '') &&
    (a.pvKwh ?? '') === (b.pvKwh ?? '')
  );
}

function runAnalysis(
  rawRows: Record<string, unknown>[],
  mapping: ColumnMapping,
  settings: AnalysisSettings,
  priceIntervals: PriceInterval[]
): AnalysisResult | null {
  const mappedRows = mapRows(rawRows, mapping);
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
  const pricingAttachment =
    settings.analysisType === 'PV_SELF_CONSUMPTION' && settings.pvPricingMode !== 'average'
      ? attachPricesToIntervals(baseIntervals, priceIntervals, {
          pricingMode: settings.pvPricingMode,
          averageImportPriceEurPerKwh: settings.pvImportPriceEurPerKwh,
          averageExportPriceEurPerKwh: settings.pvExportCompensationEurPerKwh,
          averageFeedInCostEurPerKwh: settings.pvFeedInCostEurPerKwh,
          priceIntervals,
          fallbackToAveragePrices: settings.pvFallbackToAveragePrices
        })
      : null;
  const intervals = pricingAttachment?.intervalsWithPrices ?? baseIntervals;
  const { maxObservedKw, maxObservedTimestamp } = findMaxObserved(intervals);

  if (settings.analysisType === 'PV_SELF_CONSUMPTION') {
    const pvAnalysisMode = determinePvAnalysisMode(normalized.normalizedRows);
    if (!pvAnalysisMode) return null;
    const formulaAdvice = computePvStorageFormulaAdvice(intervals, {
      customerType: settings.pvCustomerType
    });
    const hybridAdvice = computePvSelfConsumptionAdvice(intervals, {
      customerType: settings.pvCustomerType,
      economics: {
        importPriceEurPerKwh: settings.pvImportPriceEurPerKwh,
        exportCompensationEurPerKwh: settings.pvExportCompensationEurPerKwh,
        feedInCostEurPerKwh: settings.pvFeedInCostEurPerKwh,
        installationCostEur: settings.pvInstallationCostEur,
        yearlyMaintenanceEur: settings.pvYearlyMaintenanceEur,
        pricingMode: settings.pvPricingMode,
        fallbackToAveragePrices: settings.pvFallbackToAveragePrices,
        priceIntervals,
        pricingStats: pricingAttachment?.pricingStats
      }
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
    const exportIntervals = recommendedScenario?.exceedanceIntervalsBefore ?? intervals.filter((interval) => derivePvIntervalFlow(interval).surplusKwh > 0).length;

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
      pvWarnings: [...(pricingAttachment?.warnings ?? []), ...hybridAdvice.warnings]
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

export default function HomePage() {
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [draftMapping, setDraftMapping] = useState<ColumnMapping>({ timestamp: '', consumptionKwh: '' });
  const [appliedMapping, setAppliedMapping] = useState<ColumnMapping | null>(null);
  const [draftSettings, setDraftSettings] = useState<AnalysisSettings>(defaultAnalysisSettings);
  const [appliedSettings, setAppliedSettings] = useState<AnalysisSettings | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analyzedAt, setAnalyzedAt] = useState<string | null>(null);
  const [priceIntervals, setPriceIntervals] = useState<PriceInterval[]>([]);
  const [variablePricePeriods, setVariablePricePeriods] = useState<PriceInterval[]>([
    {
      startTs: '',
      endTs: '',
      importPriceEurPerKwh: 0.3,
      exportPriceEurPerKwh: 0.05,
      feedInCostEurPerKwh: 0,
      source: 'variable_period'
    }
  ]);
  const [priceFileName, setPriceFileName] = useState<string | null>(null);
  const [selectedScenario, setSelectedScenario] = useState(64);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const isPvMode = draftSettings.analysisType === 'PV_SELF_CONSUMPTION';
  const hasPvInputs = !!draftMapping.pvKwh || !!draftMapping.exportKwh;

  const canAnalyze =
    rawRows.length > 0 &&
    !!draftMapping.timestamp &&
    !!draftMapping.consumptionKwh &&
    draftSettings.efficiency > 0 &&
    (isPvMode || draftSettings.contractedPowerKw > 0) &&
    (isPvMode || (draftSettings.compliance >= 0.7 && draftSettings.compliance <= 1)) &&
    (draftSettings.analysisType === 'PEAK_SHAVING' || hasPvInputs) &&
    (draftSettings.analysisType !== 'PV_SELF_CONSUMPTION' ||
      draftSettings.pvPricingMode === 'average' ||
      (draftSettings.pvPricingMode === 'dynamic' &&
        (priceIntervals.length > 0 || draftSettings.pvFallbackToAveragePrices)) ||
      (draftSettings.pvPricingMode === 'variable' &&
        variablePricePeriods.some((period) => !!period.startTs && !!period.endTs)));

  const hasPendingChanges =
    !!appliedSettings &&
    (!analysisSettingsEqual(draftSettings, appliedSettings) || !mappingEqual(appliedMapping, draftMapping));

  const handleFile = async (file: File) => {
    setError(null);
    try {
      let detectedMapping: ColumnMapping | null = null;
      if (file.name.toLowerCase().endsWith('.csv')) {
        const content = await file.text();
        const result = parseCsv(content);
        setRawRows(result.rows);
        setHeaders(result.headers);
        detectedMapping = autoDetectColumns(result.headers);
      } else {
        const buffer = await file.arrayBuffer();
        const result = parseXlsx(buffer);
        setRawRows(result.rows);
        setHeaders(result.headers);
        detectedMapping = autoDetectColumns(result.headers);
      }
      if (detectedMapping) {
        setDraftMapping(detectedMapping);
      }
      setAppliedSettings(null);
      setAppliedMapping(null);
      setAnalysisResult(null);
      setAnalyzedAt(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bestand kon niet worden ingelezen');
    }
  };

  const handleAnalyze = async () => {
    setError(null);
    if (!draftMapping.timestamp || !draftMapping.consumptionKwh) {
      setError('Selecteer eerst timestamp- en consumption-kolommen.');
      return;
    }
    if (draftSettings.analysisType === 'PV_SELF_CONSUMPTION' && !hasPvInputs) {
      setError('Voor PV-analyse is een pv_kwh- of export_kwh-kolom nodig.');
      return;
    }
    if (
      draftSettings.analysisType === 'PV_SELF_CONSUMPTION' &&
      draftSettings.pvPricingMode === 'dynamic' &&
      priceIntervals.length === 0 &&
      !draftSettings.pvFallbackToAveragePrices
    ) {
      setError('Upload een prijsbestand of zet fallback naar gemiddelde prijzen aan.');
      return;
    }
    if (
      draftSettings.analysisType === 'PV_SELF_CONSUMPTION' &&
      draftSettings.pvPricingMode === 'variable' &&
      !variablePricePeriods.some((period) => !!period.startTs && !!period.endTs)
    ) {
      setError('Vul minimaal één geldige tariefperiode in.');
      return;
    }
    if (!canAnalyze) {
      setError('Controleer instellingen en data voordat je analyseert.');
      return;
    }

    setIsAnalyzing(true);
    // Yield once so the UI can paint the loading state before heavy synchronous analysis starts.
    await new Promise((resolve) => setTimeout(resolve, 0));

    try {
      const effectivePriceIntervals =
        draftSettings.pvPricingMode === 'variable'
          ? variablePricePeriods.filter((period) => period.startTs && period.endTs)
          : priceIntervals;
      const result = runAnalysis(rawRows, draftMapping, draftSettings, effectivePriceIntervals);
      if (!result) {
        setError('Geen bruikbare rijen na normalisatie of filtering.');
        return;
      }

      setAppliedSettings({ ...draftSettings });
      setAppliedMapping({ ...draftMapping });
      setAnalysisResult(result);
      setSelectedScenario(result.sizing.recommendedProduct?.capacityKwh ?? result.scenarios[0]?.capacityKwh ?? 64);
      setAnalyzedAt(new Date().toISOString());
    } finally {
      setIsAnalyzing(false);
    }
  };

  const updateVariablePricePeriod = (index: number, patch: Partial<PriceInterval>) => {
    setVariablePricePeriods((prev) => prev.map((period, periodIndex) => (periodIndex === index ? { ...period, ...patch } : period)));
    setAppliedSettings(null);
    setAnalysisResult(null);
  };

  const addVariablePricePeriod = () => {
    setVariablePricePeriods((prev) => [
      ...prev,
      {
        startTs: '',
        endTs: '',
        importPriceEurPerKwh: draftSettings.pvImportPriceEurPerKwh,
        exportPriceEurPerKwh: draftSettings.pvExportCompensationEurPerKwh,
        feedInCostEurPerKwh: draftSettings.pvFeedInCostEurPerKwh,
        source: 'variable_period'
      }
    ]);
    setAppliedSettings(null);
    setAnalysisResult(null);
  };

  const removeVariablePricePeriod = (index: number) => {
    setVariablePricePeriods((prev) => prev.filter((_, periodIndex) => periodIndex !== index));
    setAppliedSettings(null);
    setAnalysisResult(null);
  };

  const handlePriceFile = async (file: File) => {
    setError(null);
    try {
      const result = await parsePriceFile(file);
      setPriceIntervals(result.rows);
      setPriceFileName(file.name);
      setAppliedSettings(null);
      setAnalysisResult(null);
      setAnalyzedAt(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Prijsbestand kon niet worden ingelezen');
    }
  };

  const resetDraft = () => {
    if (!appliedSettings || !appliedMapping) return;
    setDraftSettings({ ...appliedSettings });
    setDraftMapping({ ...appliedMapping });
  };

  const downloadReport = async () => {
    if (!analysisResult || !appliedSettings) return;
    const reportScenarios = analysisResult.scenarios.map((scenario) => ({
      optionLabel: scenario.optionLabel,
      capacityKwh: scenario.capacityKwh,
      exceedanceIntervalsBefore: scenario.exceedanceIntervalsBefore,
      exceedanceIntervalsAfter: scenario.exceedanceIntervalsAfter,
      exceedanceEnergyKwhBefore: scenario.exceedanceEnergyKwhBefore,
      exceedanceEnergyKwhAfter: scenario.exceedanceEnergyKwhAfter,
      achievedComplianceDataset: scenario.achievedComplianceDataset,
      achievedComplianceDailyAverage: scenario.achievedComplianceDailyAverage,
      achievedCompliance: scenario.achievedCompliance,
      maxRemainingExcessKw: scenario.maxRemainingExcessKw,
      maxChargeKw: scenario.maxChargeKw,
      maxDischargeKw: scenario.maxDischargeKw,
      endingSocKwh: scenario.endingSocKwh,
      totalPvKwh: scenario.totalPvKwh,
      totalConsumptionKwh: scenario.totalConsumptionKwh,
      selfConsumptionBeforeKwh: scenario.selfConsumptionBeforeKwh,
      selfConsumptionAfterKwh: scenario.selfConsumptionAfterKwh,
      importedEnergyBeforeKwh: scenario.importedEnergyBeforeKwh,
      importedEnergyAfterKwh: scenario.importedEnergyAfterKwh,
      exportedEnergyBeforeKwh: scenario.exportedEnergyBeforeKwh,
      exportedEnergyAfterKwh: scenario.exportedEnergyAfterKwh,
      immediateExportedKwh: scenario.immediateExportedKwh,
      capturedExportEnergyKwh: scenario.capturedExportEnergyKwh,
      shiftedExportedLaterKwh: scenario.shiftedExportedLaterKwh,
      storedPvUsedOnsiteKwh: scenario.storedPvUsedOnsiteKwh,
      totalUsefulDischargedEnergyKwh: scenario.totalUsefulDischargedEnergyKwh,
      importReductionKwh: scenario.importReductionKwh,
      importReductionKwhAnnualized: scenario.importReductionKwhAnnualized,
      exportReductionKwhAnnualized: scenario.exportReductionKwhAnnualized,
      achievedSelfConsumption: scenario.achievedSelfConsumption,
      selfSufficiency: scenario.selfSufficiency,
      exportReduction: scenario.exportReduction,
      cyclesPerYear: scenario.cyclesPerYear,
      marginalGainPerAddedKwh: scenario.marginalGainPerAddedKwh,
      annualValueEur: scenario.annualValueEur,
      paybackYears: scenario.paybackYears,
      yearlyCostsEur: scenario.yearlyCostsEur,
      netAnnualSavingsEur: scenario.netAnnualSavingsEur,
      paybackIndicative: scenario.paybackIndicative,
      isEligible: scenario.isEligible,
      excludedReason: scenario.excludedReason,
      recommendationReason: scenario.recommendationReason,
      totalEconomicValueEur: scenario.totalEconomicValueEur,
      pvStrategy: scenario.pvStrategy,
      // Excluded on purpose to keep report payload small for large datasets.
      shavedSeries: []
    }));

    const reportPayload = {
      analysisType: appliedSettings.analysisType,
      contractedPowerKw: appliedSettings.contractedPowerKw,
      maxObservedKw: analysisResult.maxObservedKw,
      maxObservedTimestamp: analysisResult.maxObservedTimestamp,
      exceedanceCount: analysisResult.exceedanceIntervals,
      compliance: appliedSettings.compliance,
      method: appliedSettings.method,
      efficiency: appliedSettings.efficiency,
      safetyFactor: appliedSettings.safetyFactor,
      pvStrategy: appliedSettings.pvStrategy,
      sizing: analysisResult.sizing,
      quality: analysisResult.quality,
      topEvents: analysisResult.events,
      peakMoments: analysisResult.peakMoments,
      intervals: analysisResult.intervals,
      highestPeakDay: analysisResult.highestPeakDay,
      pvSummary: analysisResult.pvSummary,
      pvAdviceCharts: analysisResult.pvAdviceCharts,
      scenarios: reportScenarios
    };

    try {
    const response = await fetch('/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reportPayload)
    });
    if (!response.ok) {
      throw new Error(`Rapport download mislukt (${response.status})`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${appliedSettings.analysisType === 'PV_SELF_CONSUMPTION' ? 'wattsnext-pv-report' : 'wattsnext-peak-shaving-report'}-${Date.now()}.html`;
    a.click();
    URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download van rapport mislukt');
    }
  };

  return (
    <main className="wx-shell">
      <section className="wx-hero">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Image
              src="/assets/wattsnext-logo.png"
              alt="WattsNext logo"
              width={170}
              height={86}
              className="h-auto w-[140px] md:w-[170px]"
              priority
            />
            <div>
              <h1 className="text-2xl font-bold md:text-3xl">
                {draftSettings.analysisType === 'PV_SELF_CONSUMPTION' ? 'PV Self Consumption Adviseur' : 'Peak Shaving Adviseur'}
              </h1>
              <p className="text-sm text-slate-600">Snelle batterij-analyse in WattsNext-stijl</p>
            </div>
          </div>
          <div className="rounded-lg border border-lime-200 bg-lime-50 px-3 py-2 text-xs font-medium text-lime-800">
            ENERGIEOPLOSSINGEN
          </div>
        </div>
      </section>

      <Upload onFile={handleFile} />
      {error && <p className="rounded border border-red-200 bg-red-50 p-3 text-red-700">{error}</p>}
      {headers.length > 0 && (
        <ColumnMapper
          headers={headers}
          mapping={draftMapping}
          analysisType={draftSettings.analysisType}
          onChange={setDraftMapping}
        />
      )}

      <div className="wx-card grid gap-4 lg:grid-cols-3">
        <label className="text-sm">
          Analysemodus
          <select
            className="wx-input"
            value={draftSettings.analysisType}
            onChange={(event) =>
              setDraftSettings((prev) => ({
                ...prev,
                analysisType: event.target.value as AnalysisSettings['analysisType']
              }))
            }
          >
            <option value="PEAK_SHAVING">Peak Shaving</option>
            <option value="PV_SELF_CONSUMPTION">PV Self Consumption</option>
          </select>
        </label>

        {!isPvMode && (
          <>
            <label className="text-sm">
              Gecontracteerd vermogen (kW)
              <input
                className="wx-input"
                type="number"
                value={draftSettings.contractedPowerKw}
                onChange={(event) =>
                  setDraftSettings((prev) => ({ ...prev, contractedPowerKw: Number(event.target.value) }))
                }
              />
            </label>

            <label className="text-sm">
              Methode
              <select
                className="wx-input"
                value={draftSettings.method}
                onChange={(event) =>
                  setDraftSettings((prev) => ({ ...prev, method: event.target.value as AnalysisSettings['method'] }))
                }
              >
                <option value="MAX_PEAK">MAX_PEAK</option>
                <option value="P95">P95</option>
                <option value="FULL_COVERAGE">FULL_COVERAGE</option>
              </select>
            </label>
          </>
        )}

        {isPvMode && (
          <>
            <label className="text-sm">
              PV batterijmodus
              <select
                className="wx-input"
                value={draftSettings.pvStrategy}
                onChange={(event) =>
                  setDraftSettings((prev) => ({
                    ...prev,
                    pvStrategy: event.target.value as AnalysisSettings['pvStrategy']
                  }))
                }
              >
                <option value="SELF_CONSUMPTION_ONLY">Self-consumption only</option>
                <option value="PV_WITH_TRADING">PV + trading</option>
              </select>
            </label>
            <label className="text-sm">
              Klanttype
              <select
                className="wx-input"
                value={draftSettings.pvCustomerType}
                onChange={(event) =>
                  setDraftSettings((prev) => ({
                    ...prev,
                    pvCustomerType: event.target.value as AnalysisSettings['pvCustomerType']
                  }))
                }
              >
                <option value="auto">Auto</option>
                <option value="home">Home</option>
                <option value="business">Business</option>
              </select>
            </label>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm lg:col-span-3">
              <h3 className="font-semibold text-slate-900">Financiële berekening</h3>
              <p className="mt-1 text-slate-600">
                Bij dynamische prijzen wordt de waarde van de batterij per interval berekend. De batterij laadt in PV_SELF_CONSUMPTION nog steeds alleen met zonne-overschot en wordt niet gebruikt voor actieve handel met netstroom.
              </p>
              <div className="mt-3 grid gap-4 lg:grid-cols-3">
                <label className="text-sm">
                  Contracttype
                  <select
                    className="wx-input"
                    value={draftSettings.pvPricingMode}
                    onChange={(event) =>
                      setDraftSettings((prev) => ({
                        ...prev,
                        pvPricingMode: event.target.value as AnalysisSettings['pvPricingMode']
                      }))
                    }
                  >
                    <option value="average">Vast tarief</option>
                    <option value="variable">Variabel contract</option>
                    <option value="dynamic">Dynamische prijzen</option>
                  </select>
                </label>
                <label className="text-sm">
                  Importprijs / fallback (EUR/kWh)
                  <input
                    className="wx-input"
                    type="number"
                    step="0.01"
                    value={draftSettings.pvImportPriceEurPerKwh}
                    onChange={(event) =>
                      setDraftSettings((prev) => ({
                        ...prev,
                        pvImportPriceEurPerKwh: Number(event.target.value)
                      }))
                    }
                  />
                </label>
                <label className="text-sm">
                  Terugleververgoeding / fallback (EUR/kWh)
                  <input
                    className="wx-input"
                    type="number"
                    step="0.01"
                    value={draftSettings.pvExportCompensationEurPerKwh}
                    onChange={(event) =>
                      setDraftSettings((prev) => ({
                        ...prev,
                        pvExportCompensationEurPerKwh: Number(event.target.value)
                      }))
                    }
                  />
                </label>
                <label className="text-sm">
                  Terugleverkosten / fallback (EUR/kWh)
                  <input
                    className="wx-input"
                    type="number"
                    step="0.01"
                    value={draftSettings.pvFeedInCostEurPerKwh}
                    onChange={(event) =>
                      setDraftSettings((prev) => ({
                        ...prev,
                        pvFeedInCostEurPerKwh: Number(event.target.value)
                      }))
                    }
                  />
                </label>
                <label className="text-sm">
                  Installatiekosten (optioneel, EUR)
                  <input
                    className="wx-input"
                    type="number"
                    step="100"
                    value={draftSettings.pvInstallationCostEur ?? ''}
                    onChange={(event) =>
                      setDraftSettings((prev) => ({
                        ...prev,
                        pvInstallationCostEur:
                          event.target.value === '' ? undefined : Number(event.target.value)
                      }))
                    }
                  />
                </label>
                <label className="text-sm">
                  Jaarlijks onderhoud / kosten (EUR)
                  <input
                    className="wx-input"
                    type="number"
                    step="10"
                    value={draftSettings.pvYearlyMaintenanceEur ?? 0}
                    onChange={(event) =>
                      setDraftSettings((prev) => ({
                        ...prev,
                        pvYearlyMaintenanceEur: Number(event.target.value)
                      }))
                    }
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draftSettings.pvFallbackToAveragePrices}
                    onChange={(event) =>
                      setDraftSettings((prev) => ({
                        ...prev,
                        pvFallbackToAveragePrices: event.target.checked
                      }))
                    }
                  />
                  Fallback naar gemiddelde prijzen toestaan
                </label>
                {draftSettings.pvPricingMode === 'variable' && (
                  <div className="lg:col-span-3">
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-900">Tariefperiodes</p>
                        <button className="wx-btn-secondary" type="button" onClick={addVariablePricePeriod}>
                          Periode toevoegen
                        </button>
                      </div>
                      <div className="grid gap-3">
                        {variablePricePeriods.map((period, index) => (
                          <div
                            key={`${index}-${period.startTs}-${period.endTs}`}
                            className="grid gap-3 rounded-lg border border-slate-200 p-3 lg:grid-cols-5"
                          >
                            <label className="text-xs">
                              Startdatum
                              <input
                                className="wx-input"
                                type="datetime-local"
                                value={period.startTs ? period.startTs.slice(0, 16) : ''}
                                onChange={(event) =>
                                  updateVariablePricePeriod(index, {
                                    startTs: event.target.value ? new Date(event.target.value).toISOString() : ''
                                  })
                                }
                              />
                            </label>
                            <label className="text-xs">
                              Einddatum
                              <input
                                className="wx-input"
                                type="datetime-local"
                                value={period.endTs ? period.endTs.slice(0, 16) : ''}
                                onChange={(event) =>
                                  updateVariablePricePeriod(index, {
                                    endTs: event.target.value ? new Date(event.target.value).toISOString() : ''
                                  })
                                }
                              />
                            </label>
                            <label className="text-xs">
                              Importprijs
                              <input
                                className="wx-input"
                                type="number"
                                step="0.01"
                                value={period.importPriceEurPerKwh}
                                onChange={(event) =>
                                  updateVariablePricePeriod(index, {
                                    importPriceEurPerKwh: Number(event.target.value)
                                  })
                                }
                              />
                            </label>
                            <label className="text-xs">
                              Exportvergoeding
                              <input
                                className="wx-input"
                                type="number"
                                step="0.01"
                                value={period.exportPriceEurPerKwh}
                                onChange={(event) =>
                                  updateVariablePricePeriod(index, {
                                    exportPriceEurPerKwh: Number(event.target.value)
                                  })
                                }
                              />
                            </label>
                            <div className="flex items-end gap-2">
                              <label className="text-xs">
                                Terugleverkosten
                                <input
                                  className="wx-input"
                                  type="number"
                                  step="0.01"
                                  value={period.feedInCostEurPerKwh ?? 0}
                                  onChange={(event) =>
                                    updateVariablePricePeriod(index, {
                                      feedInCostEurPerKwh: Number(event.target.value),
                                      source: 'variable_period'
                                    })
                                  }
                                />
                              </label>
                              {variablePricePeriods.length > 1 && (
                                <button
                                  className="wx-btn-secondary"
                                  type="button"
                                  onClick={() => removeVariablePricePeriod(index)}
                                >
                                  Verwijderen
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {draftSettings.pvPricingMode === 'dynamic' && (
                  <label className="text-sm">
                    Upload prijsbestand (CSV/XLSX)
                    <input
                      className="wx-input"
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          void handlePriceFile(file);
                        }
                      }}
                    />
                  </label>
                )}
              </div>
              {draftSettings.pvPricingMode !== 'average' && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
                  <p>Prijsbestand: {priceFileName ?? 'Nog niet geüpload'}</p>
                  <p>Gekoppelde prijspunten: {draftSettings.pvPricingMode === 'dynamic' ? priceIntervals.length : variablePricePeriods.length}</p>
                  {analysisResult?.sizing.pvSelfConsumptionAdvice?.configUsed.pricingStats && (
                    <>
                      <p>Exacte matches: {analysisResult.sizing.pvSelfConsumptionAdvice.configUsed.pricingStats.exactMatches}</p>
                      <p>Uurmatches: {analysisResult.sizing.pvSelfConsumptionAdvice.configUsed.pricingStats.hourlyMatches}</p>
                      <p>Periode-matches: {analysisResult.sizing.pvSelfConsumptionAdvice.configUsed.pricingStats.variablePeriodMatches}</p>
                      <p>Fallbackmatches: {analysisResult.sizing.pvSelfConsumptionAdvice.configUsed.pricingStats.fallbackMatches}</p>
                      <p>Ontbrekende prijzen: {analysisResult.sizing.pvSelfConsumptionAdvice.configUsed.pricingStats.missingPrices}</p>
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        <label className="text-sm">
          Interpretatie
          <select
            className="wx-input"
            value={draftSettings.interpretationMode}
            onChange={(event) =>
              setDraftSettings((prev) => ({
                ...prev,
                interpretationMode: event.target.value as AnalysisSettings['interpretationMode']
              }))
            }
          >
            <option value="AUTO">Auto</option>
            <option value="INTERVAL">Intervalwaarden</option>
            <option value="CUMULATIVE_DELTA">Cumulatieve meterstanden (delta)</option>
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          {!isPvMode && (
            <label className="text-sm">
              Veiligheidsfactor
              <input
                className="wx-input"
                type="number"
                step="0.01"
                value={draftSettings.safetyFactor}
                onChange={(event) =>
                  setDraftSettings((prev) => ({ ...prev, safetyFactor: Number(event.target.value) }))
                }
              />
            </label>
          )}
          <label className="text-sm">
            Efficiëntie
            <input
              className="wx-input"
              type="number"
              step="0.01"
              value={draftSettings.efficiency}
              onChange={(event) =>
                setDraftSettings((prev) => ({ ...prev, efficiency: Number(event.target.value) }))
              }
            />
          </label>
        </div>

        {isPvMode && (
          <div className="rounded-lg border border-lime-200 bg-lime-50 px-3 py-3 text-sm text-lime-900 lg:col-span-3">
            In PV-modus wordt eerst een formulebasis berekend en daarna een kwartiersimulatie uitgevoerd. Het eindadvies kiest dus niet simpelweg de grootste batterij, maar de beste balans tussen importreductie, benutting, cycli en economische waarde.
          </div>
        )}

        {!isPvMode && (
          <div className="lg:col-span-3">
            <ComplianceSlider
              compliance={draftSettings.compliance}
              onChange={(value) => setDraftSettings((prev) => ({ ...prev, compliance: value }))}
            />
          </div>
        )}

        <div className="flex gap-2">
          <button
            className="wx-btn-primary"
            onClick={handleAnalyze}
            disabled={!canAnalyze || isAnalyzing}
          >
            {isAnalyzing ? 'Analyseren...' : 'Analyseer'}
          </button>
          <button
            className="wx-btn-secondary"
            onClick={resetDraft}
            disabled={!hasPendingChanges}
          >
            Wijzigingen resetten
          </button>
        </div>
      </div>

      {hasPendingChanges && (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Wijzigingen zijn nog niet toegepast. Klik op Analyseer om resultaten te verversen.
        </p>
      )}

      {analysisResult ? (
        <>
          {analysisResult.analysisType === 'PV_SELF_CONSUMPTION' &&
            (analysisResult.pvWarnings ?? []).map((warning) => (
              <p key={warning} className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                {warning}
              </p>
            ))}
          {analysisResult.analysisType === 'PEAK_SHAVING' && analysisResult.maxObservedKw > OUTLIER_KW_THRESHOLD * 2 && (
            <p className="rounded border border-amber-300 bg-amber-50 p-3 text-amber-800">
              Onrealistisch vermogen gedetecteerd - controleer kolomkeuze
            </p>
          )}
          {analysisResult.sizing.noFeasibleBatteryByPower && (
            <p className="rounded border border-amber-300 bg-amber-50 p-3 text-amber-800">
              Geen batterijconfiguratie voldoet aan het benodigde vermogen (kW).
            </p>
          )}

          <KpiCards
            analysisType={analysisResult.analysisType}
            maxObservedKw={analysisResult.maxObservedKw}
            maxObservedTimestamp={analysisResult.maxObservedTimestamp}
            exceedanceIntervals={analysisResult.exceedanceIntervals}
            sizing={analysisResult.sizing}
            pvSummary={analysisResult.pvSummary}
          />

          <DataQualityPanel
            diagnostics={analysisResult.normalizationDiagnostics}
            quality={analysisResult.quality}
          />

          {analysisResult.analysisType === 'PEAK_SHAVING' ? (
            <Charts
              intervals={analysisResult.intervals}
              contractKw={appliedSettings?.contractedPowerKw ?? draftSettings.contractedPowerKw}
              peakMoments={analysisResult.peakMoments}
              highestPeakDay={analysisResult.highestPeakDay}
              topExceededIntervals={analysisResult.topExceededIntervals}
            />
          ) : (
            <div className="wx-card text-sm text-slate-700">
              <h3 className="wx-title">Capaciteitsbepaling</h3>
              <p>
                De kwartierdata wordt eerst gelezen als de huidige situatie zonder batterij. Op basis van het verbruiks- en
                opwekprofiel berekenen we hoeveel opslagcapaciteit nodig is om relevant PV-overschot te verschuiven.
              </p>
              <p>
                Formulebasis: {analysisResult.sizing.kWhNeededRaw.toFixed(2)} kWh. Simulatieadvies: {analysisResult.sizing.kWhNeeded.toFixed(2)} kWh.
              </p>
              <p>
                Batterijmodus: {analysisResult.pvSummary?.strategy === 'PV_WITH_TRADING' ? 'PV + trading' : 'Self-consumption only'}.
              </p>
              {analysisResult.pvSummary?.strategy === 'PV_WITH_TRADING' && (
                <p>
                  Onderbouwing: export zonder batterij {(analysisResult.pvSummary?.exportBefore ?? 0).toFixed(2)} kWh en
                  import zonder batterij {(analysisResult.pvSummary?.importedBefore ?? 0).toFixed(2)} kWh vormen samen het profiel
                  waartegen de batterijcapaciteit wordt bepaald.
                </p>
              )}
              {analysisResult.pvSummary?.mode === 'FULL_PV' ? (
                <>
                  <p>
                    Totale PV-opwek zonder batterij: {(analysisResult.pvSummary?.totalPvKwh ?? 0).toFixed(2)} kWh. Export zonder
                    batterij: {(analysisResult.pvSummary?.exportBefore ?? 0).toFixed(2)} kWh. Import zonder batterij:
                    {' '}
                    {(analysisResult.pvSummary?.importedBefore ?? 0).toFixed(2)} kWh.
                  </p>
                  <p>
                    Daarmee is zichtbaar hoeveel opwek direct wordt gebruikt en hoeveel overschot er beschikbaar is om met een
                    batterij te verschuiven.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    Export zonder batterij: {(analysisResult.pvSummary?.exportBefore ?? 0).toFixed(2)} kWh. De benodigde
                    opslag wordt hier bepaald op basis van gemeten teruglevering en resterend verbruik.
                  </p>
                  <p className="text-xs text-slate-500">
                    Extra PV-metrics zoals totale opwek en zelfconsumptie worden getoond zodra die databron beschikbaar is.
                  </p>
                </>
              )}
            </div>
          )}

          {analysisResult.analysisType === 'PV_SELF_CONSUMPTION' && analysisResult.sizing.pvFormulaAdvice && (
            (() => {
              const advice = analysisResult.sizing.pvFormulaAdvice;
              const hybrid = analysisResult.sizing.pvSelfConsumptionAdvice;
              const pvActiveDays = advice.totals.numberOfPvActiveDays;
              const confidenceLabel =
                pvActiveDays >= 90 ? 'Hoog vertrouwen' : pvActiveDays >= 30 ? 'Goed onderbouwd' : 'Indicatief';

              return (
                <div className="wx-card border-l-4 border-l-emerald-600 bg-emerald-50/40 text-sm text-slate-800">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="max-w-3xl">
                      <h3 className="wx-title">Waarom dit batterijadvies?</h3>
                      <p className="text-base font-semibold text-slate-900">
                        Aanbevolen batterij: {hybrid?.simulationAdvice.recommended.capacityKwh ?? advice.roundedAdvice.recommendedKwh} kWh
                      </p>
                      <p className="mt-1">
                        Dit advies is gebaseerd op P75 van de dagelijkse nuttige opslagbehoefte over{' '}
                        {advice.totals.numberOfPvActiveDays} PV-actieve dagen, gevolgd door een kwartiersimulatie die
                        capaciteit, laad-/ontlaadvermogen, cycli en economische waarde meeweegt.
                      </p>
                    </div>
                    <div className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-700">
                      {confidenceLabel}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Sterkste basis</div>
                      <div className="mt-1 text-lg font-semibold text-slate-900">
                        P75 {advice.percentiles.p75StorageNeedKwh.toFixed(1)} kWh
                      </div>
                      <div className="mt-1 text-xs text-slate-600">Representatieve dagelijkse opslagbehoefte vóór safety factor en DoD-correctie.</div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Datadekking</div>
                      <div className="mt-1 text-lg font-semibold text-slate-900">
                        {advice.totals.numberOfPvActiveDays} / {advice.totals.numberOfDays} dagen
                      </div>
                      <div className="mt-1 text-xs text-slate-600">Aantal PV-actieve dagen waarop het advies is gebaseerd.</div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Balans van opties</div>
                      <div className="mt-1 text-lg font-semibold text-slate-900">
                        {hybrid?.simulationAdvice.conservative.capacityKwh ?? advice.roundedAdvice.conservativeKwh} / {hybrid?.simulationAdvice.recommended.capacityKwh ?? advice.roundedAdvice.recommendedKwh} / {hybrid?.simulationAdvice.spacious.capacityKwh ?? advice.roundedAdvice.spaciousKwh} kWh
                      </div>
                      <div className="mt-1 text-xs text-slate-600">Conservatief, aanbevolen en ruim advies na formulebasis plus kwartiersimulatie.</div>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 text-sm">
                    <p>
                      Klanttype: {advice.usedCustomerType}. Totale teruglevering {advice.totals.totalExportKwh.toFixed(1)} kWh en
                      totale netafname {advice.totals.totalImportKwh.toFixed(1)} kWh.
                    </p>
                    {hybrid && (
                      <>
                        <p>
                          Simulatieadvies: {hybrid.simulationAdvice.recommended.capacityKwh} kWh met circa{' '}
                          {hybrid.simulationAdvice.recommended.dischargePowerKw.toFixed(1)} kW,{' '}
                          {hybrid.simulationAdvice.recommended.importReductionKwhAnnualized.toFixed(1)} kWh/jaar minder netafname en{' '}
                          {hybrid.simulationAdvice.recommended.cyclesPerYear.toFixed(1)} cycli/jaar.
                        </p>
                        <p>
                          Jaarlijkse waarde: EUR {hybrid.simulationAdvice.recommended.annualValueEur?.toFixed(2) ?? '0.00'}.
                          {hybrid.simulationAdvice.recommended.paybackYears != null
                            ? ` Terugverdientijd: ${hybrid.simulationAdvice.recommended.paybackYears.toFixed(1)} jaar.`
                            : ''}
                        </p>
                      </>
                    )}
                    {advice.rawAdvice.capReason && <p>{advice.rawAdvice.capReason}</p>}
                    {(hybrid?.warnings ?? advice.warnings).map((warning) => (
                      <p key={warning} className="text-amber-700">
                        {warning}
                      </p>
                    ))}
                  </div>
                </div>
              );
            })()
          )}

          {analysisResult.analysisType === 'PV_SELF_CONSUMPTION' &&
            analysisResult.sizing.pvFormulaAdvice &&
            analysisResult.pvAdviceCharts && (
              <PvAdviceCharts
                advice={analysisResult.sizing.pvFormulaAdvice}
                charts={analysisResult.pvAdviceCharts}
              />
            )}

          {analysisResult.analysisType === 'PV_SELF_CONSUMPTION' ? (
            <details className="wx-card">
              <summary className="cursor-pointer list-none text-base font-semibold text-slate-900">
                Technische verdieping: simulatie per batterijoptie
              </summary>
              <p className="mt-3 text-sm text-slate-600">
                Deze sectie is bedoeld voor technische vergelijking. Het uiteindelijke advies hierboven is gebaseerd op
                dagelijkse opslagbehoefte en percentielen, niet op maximale exportreductie of de grootste batterij.
              </p>
              <div className="mt-4">
                <ScenarioTable
                  analysisType={analysisResult.analysisType}
                  scenarios={analysisResult.scenarios}
                  recommendedCapacityKwh={analysisResult.sizing.recommendedProduct?.capacityKwh ?? null}
                />
              </div>
              <div className="mt-4">
                <ScenarioCharts
                  analysisType={analysisResult.analysisType}
                  scenarios={analysisResult.scenarios}
                  selectedScenarioCapacity={selectedScenario}
                  onSelectScenario={setSelectedScenario}
                  sizing={analysisResult.sizing}
                  efficiency={appliedSettings?.efficiency ?? draftSettings.efficiency}
                  safetyFactor={appliedSettings?.safetyFactor ?? draftSettings.safetyFactor}
                  compliance={appliedSettings?.compliance ?? draftSettings.compliance}
                />
              </div>
            </details>
          ) : (
            <>
              <ScenarioTable
                analysisType={analysisResult.analysisType}
                scenarios={analysisResult.scenarios}
                recommendedCapacityKwh={analysisResult.sizing.recommendedProduct?.capacityKwh ?? null}
              />

              <ScenarioCharts
                analysisType={analysisResult.analysisType}
                scenarios={analysisResult.scenarios}
                selectedScenarioCapacity={selectedScenario}
                onSelectScenario={setSelectedScenario}
                sizing={analysisResult.sizing}
                efficiency={appliedSettings?.efficiency ?? draftSettings.efficiency}
                safetyFactor={appliedSettings?.safetyFactor ?? draftSettings.safetyFactor}
                compliance={appliedSettings?.compliance ?? draftSettings.compliance}
              />
            </>
          )}

          <div className="wx-card">
            <h3 className="wx-title">Advies</h3>
            <p>
              Aanbevolen:{' '}
              {analysisResult.sizing.recommendedProduct
                ? analysisResult.sizing.recommendedProduct.label
                : 'Geen haalbare batterijconfiguratie op basis van kWh + kW'}
            </p>
            {analysisResult.sizing.pvSelfConsumptionAdvice && (
              <>
                <p>
                  Simulatiebasis: {analysisResult.sizing.pvSelfConsumptionAdvice.simulationAdvice.recommended.importReductionKwhAnnualized.toFixed(1)} kWh/jaar minder netafname,
                  {` `}{analysisResult.sizing.pvSelfConsumptionAdvice.simulationAdvice.recommended.exportReductionKwhAnnualized.toFixed(1)} kWh/jaar minder teruglevering en
                  {` `}{analysisResult.sizing.pvSelfConsumptionAdvice.simulationAdvice.recommended.cyclesPerYear.toFixed(1)} cycli/jaar.
                </p>
                <p>
                  Aanbevolen laad-/ontlaadvermogen: circa {analysisResult.sizing.pvSelfConsumptionAdvice.simulationAdvice.recommended.dischargePowerKw.toFixed(1)} kW.
                </p>
              </>
            )}
            {analysisResult.sizing.pvFormulaAdvice && analysisResult.analysisType === 'PV_SELF_CONSUMPTION' && (
              <p>
                Formulebasis: {analysisResult.sizing.pvFormulaAdvice.rawAdvice.recommendedKwh.toFixed(1)} kWh.
                Conservatief / aanbevolen / ruim: {analysisResult.sizing.pvSelfConsumptionAdvice?.simulationAdvice.conservative.capacityKwh ?? analysisResult.sizing.pvFormulaAdvice.roundedAdvice.conservativeKwh} / {analysisResult.sizing.pvSelfConsumptionAdvice?.simulationAdvice.recommended.capacityKwh ?? analysisResult.sizing.pvFormulaAdvice.roundedAdvice.recommendedKwh} / {analysisResult.sizing.pvSelfConsumptionAdvice?.simulationAdvice.spacious.capacityKwh ?? analysisResult.sizing.pvFormulaAdvice.roundedAdvice.spaciousKwh} kWh.
              </p>
            )}
            <p>
              Alternatief:{' '}
              {analysisResult.sizing.alternativeProduct
                ? analysisResult.sizing.alternativeProduct.label
                : 'Geen grotere productoptie beschikbaar'}
            </p>
              {(analysisResult.sizing.pvSelfConsumptionAdvice?.warnings ?? analysisResult.sizing.pvFormulaAdvice?.warnings ?? []).map((line) => (
                <p key={line} className="mt-1 text-xs text-amber-700">
                  {line}
                </p>
            ))}
            {analyzedAt && <p className="mt-1 text-xs text-slate-500">Laatst geanalyseerd: {analyzedAt}</p>}
            <p className="mt-2 text-xs text-slate-500">
              {analysisResult.analysisType === 'PV_SELF_CONSUMPTION'
                ? analysisResult.pvSummary?.strategy === 'PV_WITH_TRADING'
                  ? 'PV + trading gebruikt dezelfde batterij-fysica als peak shaving en laat opgeslagen PV later naar het net ontladen binnen kW-, kWh- en SOC-limieten.'
                  : analysisResult.pvSummary?.mode === 'FULL_PV'
                    ? 'PV-dimensionering gebruikt een 15-minuten simulatie met PV-surplus, laad/ontlaadlimieten en batterijverliezen; finale engineeringvalidatie blijft vereist.'
                    : 'Export-only advies gebruikt een 15-minuten simulatie op terugleveroverschot en batterijbeperkingen; extra PV-metrics worden getoond wanneer die databron beschikbaar is.'
                : 'Dimensionering voor peak shaving; finale engineeringvalidatie blijft vereist.'}
            </p>
            <button
              className="wx-btn-primary mt-3"
              onClick={downloadReport}
              disabled={!analysisResult}
            >
              Download interactief rapport
            </button>
          </div>
        </>
      ) : (
        <div className="wx-card text-sm text-slate-600">
          Upload data en klik op Analyseer om resultaten te genereren.
        </div>
      )}
    </main>
  );
}
