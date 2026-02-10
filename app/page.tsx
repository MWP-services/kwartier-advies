'use client';

import { useMemo, useState } from 'react';
import { Charts } from '@/components/Charts';
import { ColumnMapper } from '@/components/ColumnMapper';
import { ComplianceSlider } from '@/components/ComplianceSlider';
import { KpiCards } from '@/components/KpiCards';
import { ScenarioCharts } from '@/components/ScenarioCharts';
import { ScenarioTable } from '@/components/ScenarioTable';
import { Upload } from '@/components/Upload';
import {
  buildDataQualityReport,
  computeSizing,
  groupPeakEvents,
  processIntervals,
  type Method
} from '@/lib/calculations';
import { autoDetectColumns, mapRows, parseCsv, parseXlsx, type ColumnMapping } from '@/lib/parsing';
import { simulateAllScenarios } from '@/lib/simulation';

export default function HomePage() {
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({ timestamp: '', consumptionKwh: '' });
  const [contractedPowerKw, setContractedPowerKw] = useState(500);
  const [method, setMethod] = useState<Method>('MAX_PEAK');
  const [safetyFactor, setSafetyFactor] = useState(1.2);
  const [efficiency, setEfficiency] = useState(0.9);
  const [compliance, setCompliance] = useState(0.95);
  const [analyzed, setAnalyzed] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState(64);
  const [error, setError] = useState<string | null>(null);

  const mappedRows = useMemo(() => {
    if (!mapping.timestamp || !mapping.consumptionKwh) return [];
    return mapRows(rawRows, mapping);
  }, [mapping, rawRows]);

  const processed = useMemo(() => {
    if (!analyzed || mappedRows.length === 0) return null;
    const intervals = processIntervals(mappedRows, contractedPowerKw);
    const events = groupPeakEvents(intervals);
    const sizing = computeSizing({
      intervals,
      events,
      method,
      compliance,
      safetyFactor,
      efficiency
    });
    const scenarios = simulateAllScenarios(intervals, sizing.kWNeeded);
    const maxObservedKw = Math.max(...intervals.map((item) => item.consumptionKw));
    const quality = buildDataQualityReport(mappedRows);
    return { intervals, events, sizing, scenarios, maxObservedKw, quality };
  }, [analyzed, compliance, contractedPowerKw, efficiency, mappedRows, method, safetyFactor]);

  const handleFile = async (file: File) => {
    setError(null);
    try {
      if (file.name.toLowerCase().endsWith('.csv')) {
        const content = await file.text();
        const result = parseCsv(content);
        setRawRows(result.rows);
        setHeaders(result.headers);
        const detected = autoDetectColumns(result.headers);
        if (detected) setMapping(detected);
      } else {
        const buffer = await file.arrayBuffer();
        const result = parseXlsx(buffer);
        setRawRows(result.rows);
        setHeaders(result.headers);
        const detected = autoDetectColumns(result.headers);
        if (detected) setMapping(detected);
      }
      setAnalyzed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not parse file');
    }
  };

  const downloadPdf = async () => {
    if (!processed) return;
    const response = await fetch('/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contractedPowerKw,
        maxObservedKw: processed.maxObservedKw,
        exceedanceCount: processed.events.length,
        compliance,
        method,
        efficiency,
        safetyFactor,
        sizing: processed.sizing,
        quality: processed.quality,
        topEvents: processed.events,
        scenarios: processed.scenarios
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
      {headers.length > 0 && <ColumnMapper headers={headers} mapping={mapping} onChange={setMapping} />}

      <div className="grid gap-4 rounded-lg border bg-white p-4 shadow-sm lg:grid-cols-3">
        <label className="text-sm">
          Contracted power (kW)
          <input
            className="mt-1 w-full rounded border p-2"
            type="number"
            value={contractedPowerKw}
            onChange={(event) => setContractedPowerKw(Number(event.target.value))}
          />
        </label>

        <label className="text-sm">
          Method
          <select
            className="mt-1 w-full rounded border p-2"
            value={method}
            onChange={(event) => setMethod(event.target.value as Method)}
          >
            <option value="MAX_PEAK">MAX_PEAK</option>
            <option value="P95">P95</option>
            <option value="FULL_COVERAGE">FULL_COVERAGE</option>
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm">
            Safety factor
            <input
              className="mt-1 w-full rounded border p-2"
              type="number"
              step="0.01"
              value={safetyFactor}
              onChange={(event) => setSafetyFactor(Number(event.target.value))}
            />
          </label>
          <label className="text-sm">
            Efficiency
            <input
              className="mt-1 w-full rounded border p-2"
              type="number"
              step="0.01"
              value={efficiency}
              onChange={(event) => setEfficiency(Number(event.target.value))}
            />
          </label>
        </div>

        <div className="lg:col-span-3">
          <ComplianceSlider compliance={compliance} onChange={setCompliance} />
        </div>

        <button
          className="rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
          onClick={() => setAnalyzed(true)}
          disabled={!mapping.timestamp || !mapping.consumptionKwh || mappedRows.length === 0}
        >
          Analyze
        </button>
      </div>

      {processed && (
        <>
          <KpiCards
            maxObservedKw={processed.maxObservedKw}
            exceedanceIntervals={processed.events.length}
            sizing={processed.sizing}
          />

          <Charts intervals={processed.intervals} contractKw={contractedPowerKw} topEvents={processed.events} />

          <ScenarioTable
            scenarios={processed.scenarios}
            recommendedCapacityKwh={processed.sizing.recommendedProduct.capacityKwh}
          />

          <ScenarioCharts
            scenarios={processed.scenarios}
            selectedScenarioCapacity={selectedScenario}
            onSelectScenario={setSelectedScenario}
          />

          <div className="rounded-lg border bg-white p-4">
            <h3 className="font-semibold">Recommendation</h3>
            <p>Recommended: {processed.sizing.recommendedProduct.label}</p>
            <p>
              Alternative:{' '}
              {processed.sizing.alternativeProduct
                ? processed.sizing.alternativeProduct.label
                : 'No larger product available'}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Sizing for peak shaving; final engineering validation required.
            </p>
            <button
              className="mt-3 rounded bg-emerald-600 px-4 py-2 font-semibold text-white"
              onClick={downloadPdf}
            >
              Download PDF report
            </button>
          </div>
        </>
      )}
    </main>
  );
}
