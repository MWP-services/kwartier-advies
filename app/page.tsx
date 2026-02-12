'use client';

import { useMemo, useState } from 'react';
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
  computeSizing,
  findMaxObserved,
  groupPeakEvents,
  processIntervals,
  selectTopExceededIntervals
} from '@/lib/calculations';
import { autoDetectColumns, mapRows, parseCsv, parseXlsx, type ColumnMapping } from '@/lib/parsing';
import { normalizeConsumptionSeries } from '@/lib/normalization';
import { findHighestPeakDay, simulateAllScenarios } from '@/lib/simulation';

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
  settings: AnalysisSettings
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

  const intervals = processIntervals(normalized.normalizedRows, settings.contractedPowerKw);
  const events = groupPeakEvents(intervals);
  const sizing = computeSizing({
    intervals,
    events,
    method: settings.method,
    compliance: settings.compliance,
    safetyFactor: settings.safetyFactor,
    efficiency: settings.efficiency
  });
  const scenarios = simulateAllScenarios(intervals, sizing.kWNeeded, sizing.recommendedProduct.capacityKwh);
  const { maxObservedKw, maxObservedTimestamp } = findMaxObserved(intervals);
  const highestPeakDay = findHighestPeakDay(intervals);
  const topExceededIntervals = highestPeakDay ? selectTopExceededIntervals(intervals, highestPeakDay, 20) : [];
  const quality = buildDataQualityReport(normalized.normalizedRows);

  return {
    intervals,
    events,
    sizing,
    scenarios,
    highestPeakDay,
    maxObservedKw,
    maxObservedTimestamp,
    topExceededIntervals,
    normalizationDiagnostics: normalized.diagnostics,
    quality
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

  const draftMappedRows = useMemo(() => {
    if (!draftMapping.timestamp || !draftMapping.consumptionKwh) return [];
    return mapRows(rawRows, draftMapping);
  }, [draftMapping, rawRows]);

  const canAnalyze =
    draftMappedRows.length > 0 &&
    draftSettings.contractedPowerKw > 0 &&
    draftSettings.efficiency > 0 &&
    draftSettings.compliance >= 0.7 &&
    draftSettings.compliance <= 1;

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
      setError(err instanceof Error ? err.message : 'Could not parse file');
    }
  };

  const handleAnalyze = () => {
    setError(null);
    if (!draftMapping.timestamp || !draftMapping.consumptionKwh) {
      setError('Selecteer eerst timestamp- en consumption-kolommen.');
      return;
    }
    if (!canAnalyze) {
      setError('Controleer instellingen en data voordat je analyseert.');
      return;
    }

    const result = runAnalysis(rawRows, draftMapping, draftSettings);
    if (!result) {
      setError('Geen bruikbare rijen na normalisatie of filtering.');
      return;
    }

    setAppliedSettings({ ...draftSettings });
    setAppliedMapping({ ...draftMapping });
    setAnalysisResult(result);
    setAnalyzedAt(new Date().toISOString());
  };

  const resetDraft = () => {
    if (!appliedSettings || !appliedMapping) return;
    setDraftSettings({ ...appliedSettings });
    setDraftMapping({ ...appliedMapping });
  };

  const downloadPdf = async () => {
    if (!analysisResult || !appliedSettings) return;
    const response = await fetch('/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contractedPowerKw: appliedSettings.contractedPowerKw,
        maxObservedKw: analysisResult.maxObservedKw,
        maxObservedTimestamp: analysisResult.maxObservedTimestamp,
        exceedanceCount: analysisResult.events.length,
        compliance: appliedSettings.compliance,
        method: appliedSettings.method,
        efficiency: appliedSettings.efficiency,
        safetyFactor: appliedSettings.safetyFactor,
        sizing: analysisResult.sizing,
        quality: analysisResult.quality,
        topEvents: analysisResult.events,
        scenarios: analysisResult.scenarios
      })
    });

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'peak-shaving-report.pdf';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="mx-auto max-w-7xl space-y-4 p-4">
      <h1 className="text-2xl font-bold">Peak Shaving Advisor (MVP)</h1>
      <p className="text-sm text-slate-600">Upload 15-minute interval data and generate a battery advice report.</p>

      <Upload onFile={handleFile} />
      {error && <p className="rounded border border-red-200 bg-red-50 p-3 text-red-700">{error}</p>}
      {headers.length > 0 && <ColumnMapper headers={headers} mapping={draftMapping} onChange={setDraftMapping} />}

      <div className="grid gap-4 rounded-lg border bg-white p-4 shadow-sm lg:grid-cols-3">
        <label className="text-sm">
          Contracted power (kW)
          <input
            className="mt-1 w-full rounded border p-2"
            type="number"
            value={draftSettings.contractedPowerKw}
            onChange={(event) =>
              setDraftSettings((prev) => ({ ...prev, contractedPowerKw: Number(event.target.value) }))
            }
          />
        </label>

        <label className="text-sm">
          Method
          <select
            className="mt-1 w-full rounded border p-2"
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

        <label className="text-sm">
          Interpretation
          <select
            className="mt-1 w-full rounded border p-2"
            value={draftSettings.interpretationMode}
            onChange={(event) =>
              setDraftSettings((prev) => ({
                ...prev,
                interpretationMode: event.target.value as AnalysisSettings['interpretationMode']
              }))
            }
          >
            <option value="AUTO">Auto</option>
            <option value="INTERVAL">Interval values</option>
            <option value="CUMULATIVE_DELTA">Cumulative meter readings (delta)</option>
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm">
            Safety factor
            <input
              className="mt-1 w-full rounded border p-2"
              type="number"
              step="0.01"
              value={draftSettings.safetyFactor}
              onChange={(event) =>
                setDraftSettings((prev) => ({ ...prev, safetyFactor: Number(event.target.value) }))
              }
            />
          </label>
          <label className="text-sm">
            Efficiency
            <input
              className="mt-1 w-full rounded border p-2"
              type="number"
              step="0.01"
              value={draftSettings.efficiency}
              onChange={(event) =>
                setDraftSettings((prev) => ({ ...prev, efficiency: Number(event.target.value) }))
              }
            />
          </label>
        </div>

        <div className="lg:col-span-3">
          <ComplianceSlider
            compliance={draftSettings.compliance}
            onChange={(value) => setDraftSettings((prev) => ({ ...prev, compliance: value }))}
          />
        </div>

        <div className="flex gap-2">
          <button
            className="rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            onClick={handleAnalyze}
            disabled={!canAnalyze}
          >
            Analyze
          </button>
          <button
            className="rounded border border-slate-300 px-4 py-2 font-semibold text-slate-700 disabled:opacity-60"
            onClick={resetDraft}
            disabled={!hasPendingChanges}
          >
            Reset changes
          </button>
        </div>
      </div>

      {hasPendingChanges && (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Changes not applied. Klik op Analyze om resultaten te verversen.
        </p>
      )}

      {analysisResult ? (
        <>
          {analysisResult.maxObservedKw > OUTLIER_KW_THRESHOLD * 2 && (
            <p className="rounded border border-amber-300 bg-amber-50 p-3 text-amber-800">
              Onrealistisch vermogen gedetecteerd - controleer kolomkeuze
            </p>
          )}

          <KpiCards
            maxObservedKw={analysisResult.maxObservedKw}
            maxObservedTimestamp={analysisResult.maxObservedTimestamp}
            exceedanceIntervals={analysisResult.events.length}
            sizing={analysisResult.sizing}
          />

          <DataQualityPanel
            diagnostics={analysisResult.normalizationDiagnostics}
            quality={analysisResult.quality}
          />

          <Charts
            intervals={analysisResult.intervals}
            contractKw={appliedSettings?.contractedPowerKw ?? draftSettings.contractedPowerKw}
            topEvents={analysisResult.events}
            highestPeakDay={analysisResult.highestPeakDay}
            topExceededIntervals={analysisResult.topExceededIntervals}
          />

          <ScenarioTable
            scenarios={analysisResult.scenarios}
            recommendedCapacityKwh={analysisResult.sizing.recommendedProduct.capacityKwh}
          />

          <ScenarioCharts
            scenarios={analysisResult.scenarios}
            selectedScenarioCapacity={selectedScenario}
            onSelectScenario={setSelectedScenario}
            highestPeakDay={analysisResult.highestPeakDay}
            contractKw={appliedSettings?.contractedPowerKw ?? draftSettings.contractedPowerKw}
          />

          <div className="rounded-lg border bg-white p-4">
            <h3 className="font-semibold">Recommendation</h3>
            <p>Recommended: {analysisResult.sizing.recommendedProduct.label}</p>
            <p>
              Alternative:{' '}
              {analysisResult.sizing.alternativeProduct
                ? analysisResult.sizing.alternativeProduct.label
                : 'No larger product available'}
            </p>
            {analyzedAt && <p className="mt-1 text-xs text-slate-500">Last analyzed: {analyzedAt}</p>}
            <p className="mt-2 text-xs text-slate-500">
              Sizing for peak shaving; final engineering validation required.
            </p>
            <button
              className="mt-3 rounded bg-emerald-600 px-4 py-2 font-semibold text-white disabled:opacity-60"
              onClick={downloadPdf}
              disabled={!analysisResult}
            >
              Download PDF report
            </button>
          </div>
        </>
      ) : (
        <div className="rounded-lg border bg-white p-4 text-sm text-slate-600 shadow-sm">
          Upload data and click Analyze to generate results.
        </div>
      )}
    </main>
  );
}
