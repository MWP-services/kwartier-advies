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
import { ScenarioCharts } from '@/components/ScenarioCharts';
import { ScenarioTable } from '@/components/ScenarioTable';
import { Upload } from '@/components/Upload';
import {
  buildDataQualityReport,
  computePvSizingFromScenarioResults,
  computeSizing,
  derivePvIntervalFlow,
  findMaxObserved,
  groupPeakEvents,
  listPeakMoments,
  processIntervals,
  selectTopExceededIntervals
} from '@/lib/calculations';
import {
  autoDetectColumns,
  hasLikelyPvHeader,
  isLikelyPvHeader,
  mapRows,
  parseCsv,
  parseXlsx,
  type ColumnMapping
} from '@/lib/parsing';
import { normalizeConsumptionSeries } from '@/lib/normalization';
import { buildPvSummaryFromScenario, findHighestPeakDay, simulateAllPvScenarios, simulateAllScenarios } from '@/lib/simulation';
import { buildDefaultTradingConfig, determinePvAnalysisMode } from '@/lib/pvSimulation';

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
  headers: string[],
  mapping: ColumnMapping,
  settings: AnalysisSettings
): AnalysisResult | null {
  const sanitizedMapping: ColumnMapping =
    settings.analysisType === 'PV_SELF_CONSUMPTION' &&
    mapping.exportKwh &&
    mapping.pvKwh &&
    !hasLikelyPvHeader(headers) &&
    !isLikelyPvHeader(mapping.pvKwh)
      ? { ...mapping, pvKwh: undefined }
      : mapping;
  const mappedRows = mapRows(rawRows, sanitizedMapping);
  if (mappedRows.length === 0) return null;

  const normalized = normalizeConsumptionSeries(mappedRows, {
    intervalMinutes: 15,
    interpretationMode: settings.interpretationMode,
    outlierKwThreshold: OUTLIER_KW_THRESHOLD,
    allowNegativeDeltas: false
  });
  if (normalized.normalizedRows.length === 0) return null;

  const intervals = processIntervals(normalized.normalizedRows, settings.contractedPowerKw);
  const quality = buildDataQualityReport(normalized.normalizedRows);
  const { maxObservedKw, maxObservedTimestamp } = findMaxObserved(intervals);

  if (settings.analysisType === 'PV_SELF_CONSUMPTION') {
    const pvAnalysisMode = determinePvAnalysisMode(normalized.normalizedRows);
    if (!pvAnalysisMode) return null;
    const pvSizingSettings = {
      compliance: settings.compliance,
      safetyFactor: settings.safetyFactor,
      efficiency: settings.efficiency,
      strategy: settings.pvStrategy,
      trading: buildDefaultTradingConfig(settings.pvStrategy)
    };
    const scenarioTargetCapacityKwh = Math.max(
      64,
      ...intervals.map((interval) => Math.max(0, interval.exportKwh ?? interval.pvKwh ?? 0) * 4)
    );
    const scenarios = simulateAllPvScenarios(intervals, scenarioTargetCapacityKwh, {
      dischargeEfficiency: settings.efficiency,
      initialSocRatio: 0,
      strategy: settings.pvStrategy,
      trading: buildDefaultTradingConfig(settings.pvStrategy),
      captureSocSeries: false
    });
    const sizing = computePvSizingFromScenarioResults(intervals, scenarios, pvSizingSettings);
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
      pvAnalysisMode,
      pvWarnings: pvSummary?.warnings ?? []
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
    (draftSettings.analysisType === 'PEAK_SHAVING' || hasPvInputs);

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
    if (!canAnalyze) {
      setError('Controleer instellingen en data voordat je analyseert.');
      return;
    }

    setIsAnalyzing(true);
    // Yield once so the UI can paint the loading state before heavy synchronous analysis starts.
    await new Promise((resolve) => setTimeout(resolve, 0));

    try {
      const result = runAnalysis(rawRows, headers, draftMapping, draftSettings);
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
      achievedSelfConsumption: scenario.achievedSelfConsumption,
      selfSufficiency: scenario.selfSufficiency,
      exportReduction: scenario.exportReduction,
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
            In PV-modus zijn alleen de instellingen zichtbaar die direct nodig zijn voor de batterijsimulatie.
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
                Benodigde opslag uit profiel: {analysisResult.sizing.kWhNeededRaw.toFixed(2)} kWh. Benodigde batterijcapaciteit
                na batterijverliezen: {analysisResult.sizing.kWhNeeded.toFixed(2)} kWh.
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
                    Export zonder batterij: {(analysisResult.pvSummary?.exportBefore ?? 0).toFixed(2)} kWh. Zonder `pv_kwh`
                    baseren we de benodigde opslag op gemeten teruglevering en resterend verbruik.
                  </p>
                  <p className="text-xs text-slate-500">
                    Totale PV-opwek en zelfconsumptieratio worden niet getoond zonder `pv_kwh`.
                  </p>
                </>
              )}
            </div>
          )}

          {analysisResult.analysisType === 'PV_SELF_CONSUMPTION' && (
            <div className="wx-card text-sm text-slate-700">
              <h3 className="wx-title">Simulatie-impact per batterij</h3>
              <p>
                Hieronder zie je pas de simulatiescenario&apos;s. Die laten zien wat de impact zou zijn als er een batterij
                geplaatst wordt met een bepaalde capaciteit.
              </p>
            </div>
          )}

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

          <div className="wx-card">
            <h3 className="wx-title">Advies</h3>
            <p>
              Aanbevolen:{' '}
              {analysisResult.sizing.recommendedProduct
                ? analysisResult.sizing.recommendedProduct.label
                : 'Geen haalbare batterijconfiguratie op basis van kWh + kW'}
            </p>
            <p>
              Alternatief:{' '}
              {analysisResult.sizing.alternativeProduct
                ? analysisResult.sizing.alternativeProduct.label
                : 'Geen grotere productoptie beschikbaar'}
            </p>
            {analyzedAt && <p className="mt-1 text-xs text-slate-500">Laatst geanalyseerd: {analyzedAt}</p>}
            <p className="mt-2 text-xs text-slate-500">
              {analysisResult.analysisType === 'PV_SELF_CONSUMPTION'
                ? analysisResult.pvSummary?.strategy === 'PV_WITH_TRADING'
                  ? 'PV + trading gebruikt dezelfde batterij-fysica als peak shaving en laat opgeslagen PV later naar het net ontladen binnen kW-, kWh- en SOC-limieten.'
                  : analysisResult.pvSummary?.mode === 'FULL_PV'
                    ? 'PV-dimensionering gebruikt een 15-minuten simulatie met PV-surplus, laad/ontlaadlimieten en batterijverliezen; finale engineeringvalidatie blijft vereist.'
                    : 'Export-only advies gebruikt een 15-minuten simulatie op terugleveroverschot en batterijbeperkingen; totale PV-opwek blijft onbekend zonder pv_kwh.'
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
