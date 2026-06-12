'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import type { AnalysisResult, AnalysisSettings, AnnualBillInput, PvInputMode } from '@/lib/analysis';
import { defaultAnalysisSettings } from '@/lib/analysis';
import { ColumnMapper } from '@/components/ColumnMapper';
import { ComplianceSlider } from '@/components/ComplianceSlider';
import { DataQualityPanel } from '@/components/DataQualityPanel';
import { KpiCards } from '@/components/KpiCards';
import { ScenarioTable } from '@/components/ScenarioTable';
import { Upload } from '@/components/Upload';
import { PageTitle, PremiumBadge, Screen } from '@/components/ui';
import type {
  PeakMoment,
  ProcessedInterval,
  PvBatterySimulationResult,
  PvAdviceChartsData,
  PvSelfConsumptionAdviceResult,
  SizingResult
} from '@/lib/calculations';
import { getLocalDayIso } from '@/lib/datetime';
import type { ColumnMapping } from '@/lib/parsing';
import type { PdfPayload } from '@/lib/pdf';
import type { PriceInterval } from '@/lib/pricing';
import type { ScenarioResult } from '@/lib/simulation';
import type { AnnualBillAdviceResult } from '@/src/lib/annual-bill/calculateAnnualBillAdvice';
import type { AnnualBillExtract } from '@/src/lib/annual-bill/schema';
import { annualBillConfidenceLabel, annualBillMissingDetails, formatEuro, formatKwh, formatYears, maskEan, resolveAverageFeedInPrice, resolveAverageImportPrice, resolveAnnualFeedInKwh, resolveAnnualUsageKwh } from '@/src/lib/annual-bill/annualBillUx';

const Charts = dynamic(() => import('@/components/Charts').then((module) => module.Charts), {
  ssr: false,
  loading: () => <div className="wx-card text-sm text-slate-600">Grafieken laden...</div>
});

const PvAdviceCharts = dynamic(() => import('@/components/PvAdviceCharts').then((module) => module.PvAdviceCharts), {
  ssr: false,
  loading: () => <div className="wx-card text-sm text-slate-600">PV-grafieken laden...</div>
});

const ScenarioCharts = dynamic(() => import('@/components/ScenarioCharts').then((module) => module.ScenarioCharts), {
  ssr: false,
  loading: () => <div className="wx-card text-sm text-slate-600">Scenariografieken laden...</div>
});

const OUTLIER_KW_THRESHOLD = 5000;
const REPORT_HISTOGRAM_SAMPLE_SIZE = 1200;

interface ProgressState {
  percent: number;
  label: string;
}

async function readApiJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) return {} as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    const cleanText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const message = cleanText.slice(0, 180) || response.statusText || 'Onbekende serverfout';
    return { error: `Server gaf geen geldige JSON terug (${response.status}): ${message}` } as T;
  }
}

function ProgressBar({ progress }: { progress: ProgressState | null }) {
  if (!progress) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span>{progress.label}</span>
        <span className="font-semibold tabular-nums text-slate-900">{progress.percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-emerald-600 transition-all duration-300 ease-out"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
    </div>
  );
}

function compactReportInterval(interval: ProcessedInterval): ProcessedInterval {
  return {
    timestamp: interval.timestamp,
    consumptionKwh: interval.consumptionKwh,
    exportKwh: interval.exportKwh,
    pvKwh: interval.pvKwh,
    consumptionKw: interval.consumptionKw,
    excessKw: interval.excessKw,
    excessKwh: interval.excessKwh
  };
}

function selectReportIntervals(intervals: ProcessedInterval[], highestPeakDay: string | null): ProcessedInterval[] {
  if (intervals.length <= REPORT_HISTOGRAM_SAMPLE_SIZE) {
    return intervals.map(compactReportInterval);
  }

  const selectedDayIntervals = highestPeakDay
    ? intervals.filter((interval) => getLocalDayIso(interval.timestamp, 'Europe/Amsterdam') === highestPeakDay)
    : [];
  const sampledIntervals = intervals.filter(
    (_, index) => index % Math.ceil(intervals.length / REPORT_HISTOGRAM_SAMPLE_SIZE) === 0
  );

  const byTimestamp = new Map<string, ProcessedInterval>();
  [...selectedDayIntervals, ...sampledIntervals].forEach((interval) => {
    byTimestamp.set(interval.timestamp, compactReportInterval(interval));
  });

  return [...byTimestamp.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function selectReportPeakMoments(peakMoments: PeakMoment[], highestPeakDay: string | null): PeakMoment[] {
  if (!highestPeakDay) return peakMoments.slice(0, 500);
  const selectedDayMoments = peakMoments.filter(
    (moment) => getLocalDayIso(moment.timestamp, 'Europe/Amsterdam') === highestPeakDay
  );
  return selectedDayMoments.length > 0 ? selectedDayMoments : peakMoments.slice(0, 500);
}

function compactPvSimulationScenario(scenario: PvBatterySimulationResult): PvBatterySimulationResult {
  const compactScenario = { ...scenario };
  delete compactScenario.valueByInterval;
  delete compactScenario.socSeries;
  return compactScenario;
}

function compactPvSelfConsumptionAdvice(
  advice: PvSelfConsumptionAdviceResult | null | undefined
): PvSelfConsumptionAdviceResult | null | undefined {
  if (!advice) return advice;

  return {
    ...advice,
    simulationAdvice: {
      conservative: compactPvSimulationScenario(advice.simulationAdvice.conservative),
      recommended: compactPvSimulationScenario(advice.simulationAdvice.recommended),
      spacious: compactPvSimulationScenario(advice.simulationAdvice.spacious),
      allScenarios: advice.simulationAdvice.allScenarios.map(compactPvSimulationScenario)
    }
  };
}

function compactReportSizing(sizing: SizingResult): SizingResult {
  return {
    ...sizing,
    pvSelfConsumptionAdvice: compactPvSelfConsumptionAdvice(sizing.pvSelfConsumptionAdvice)
  };
}

function compactReportScenario(scenario: ScenarioResult): ScenarioResult {
  return {
    ...scenario,
    shavedSeries: [],
    socSeries: []
  };
}

function toOptionalNumber(value: string): number | undefined {
  return value === '' ? undefined : Number(value);
}

function mappingEqual(a: ColumnMapping | null, b: ColumnMapping): boolean {
  if (!a) return false;
  return (
    a.timestamp === b.timestamp &&
    a.consumptionKwh === b.consumptionKwh &&
    (a.exportKwh ?? '') === (b.exportKwh ?? '') &&
    (a.pvKwh ?? '') === (b.pvKwh ?? '')
  );
}

function technicalSettingsEqual(a: AnalysisSettings, b: AnalysisSettings): boolean {
  return (
    a.analysisType === b.analysisType &&
    a.contractedPowerKw === b.contractedPowerKw &&
    a.method === b.method &&
    a.compliance === b.compliance &&
    a.safetyFactor === b.safetyFactor &&
    a.efficiency === b.efficiency &&
    a.interpretationMode === b.interpretationMode &&
    a.pvStrategy === b.pvStrategy &&
    a.pvCustomerType === b.pvCustomerType &&
    (a.includeHistogram ?? true) === (b.includeHistogram ?? true) &&
    (a.includePeakEventsTable ?? true) === (b.includePeakEventsTable ?? true) &&
    (a.includeScenarioSection ?? true) === (b.includeScenarioSection ?? true)
  );
}

export default function HomePage() {
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [uploadedRowCount, setUploadedRowCount] = useState(0);
  const [headers, setHeaders] = useState<string[]>([]);
  const [draftMapping, setDraftMapping] = useState<ColumnMapping>({ timestamp: '', consumptionKwh: '' });
  const [appliedMapping, setAppliedMapping] = useState<ColumnMapping | null>(null);
  const [draftSettings, setDraftSettings] = useState<AnalysisSettings>(defaultAnalysisSettings);
  const [inputMode, setInputMode] = useState<PvInputMode>(defaultAnalysisSettings.pvInputMode);
  const [appliedSettings, setAppliedSettings] = useState<AnalysisSettings | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [financialResult, setFinancialResult] = useState<PvSelfConsumptionAdviceResult | null>(null);
  const [financialPvAdviceCharts, setFinancialPvAdviceCharts] = useState<PvAdviceChartsData | null>(null);
  const [annualBillExtract, setAnnualBillExtract] = useState<AnnualBillExtract | null>(null);
  const [annualBillInput, setAnnualBillInput] = useState<AnnualBillInput>({ source: 'manual' });
  const [annualBillAdvice, setAnnualBillAdvice] = useState<AnnualBillAdviceResult | null>(null);
  const [annualBillFileName, setAnnualBillFileName] = useState<string | null>(null);
  const [annualBillTextPreview, setAnnualBillTextPreview] = useState<string | null>(null);
  const [annualBillDetailsOpen, setAnnualBillDetailsOpen] = useState(false);
  const [isExtractingAnnualBill, setIsExtractingAnnualBill] = useState(false);
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
  const [isCalculatingFinancials, setIsCalculatingFinancials] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<ProgressState | null>(null);
  const [financialProgress, setFinancialProgress] = useState<ProgressState | null>(null);
  const isPvMode = draftSettings.analysisType === 'PV_SELF_CONSUMPTION';
  const usesIntervalData = !isPvMode || inputMode === 'intervalData';
  const hasPvInputs = !!draftMapping.pvKwh || !!draftMapping.exportKwh;
  const hasAnnualBillInputs =
    resolveAnnualUsageKwh(annualBillInput) > 0 ||
    resolveAnnualFeedInKwh(annualBillInput) > 0;
  const annualBillConfidence = annualBillConfidenceLabel(annualBillInput);
  const annualBillMissing = annualBillMissingDetails(annualBillInput);
  const annualBillUsedImportPrice = resolveAverageImportPrice(annualBillInput);
  const annualBillUsedFeedInPrice = resolveAverageFeedInPrice(annualBillInput);

  const canAnalyze =
    (usesIntervalData ? (uploadedRowCount > 0 || rawRows.length > 0) && !!draftMapping.timestamp && !!draftMapping.consumptionKwh : hasAnnualBillInputs) &&
    draftSettings.efficiency > 0 &&
    (isPvMode || draftSettings.contractedPowerKw > 0) &&
    (isPvMode || (draftSettings.compliance >= 0.7 && draftSettings.compliance <= 1)) &&
    (draftSettings.analysisType === 'PEAK_SHAVING' || !usesIntervalData || hasPvInputs);

  const hasPendingChanges =
    !!appliedSettings &&
    (!technicalSettingsEqual(draftSettings, appliedSettings) || !mappingEqual(appliedMapping, draftMapping));

  const financialSettingsKey = JSON.stringify({
    pvPricingMode: draftSettings.pvPricingMode,
    pvImportPriceEurPerKwh: draftSettings.pvImportPriceEurPerKwh,
    pvExportCompensationEurPerKwh: draftSettings.pvExportCompensationEurPerKwh,
    pvFeedInCostEurPerKwh: draftSettings.pvFeedInCostEurPerKwh,
    pvInstallationCostEur: draftSettings.pvInstallationCostEur ?? null,
    pvYearlyMaintenanceEur: draftSettings.pvYearlyMaintenanceEur ?? 0,
    pvFallbackToAveragePrices: draftSettings.pvFallbackToAveragePrices,
    priceFileName,
    priceIntervalCount: priceIntervals.length,
    variablePricePeriods
  });
  const previousFinancialSettingsKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (previousFinancialSettingsKeyRef.current === null) {
      previousFinancialSettingsKeyRef.current = financialSettingsKey;
      return;
    }
    if (previousFinancialSettingsKeyRef.current !== financialSettingsKey) {
      previousFinancialSettingsKeyRef.current = financialSettingsKey;
      if (financialResult) {
        setFinancialResult(null);
        setFinancialPvAdviceCharts(null);
      }
    }
  }, [financialSettingsKey, financialResult]);

  const handleFile = async (file: File) => {
    setError(null);
    try {
      const formData = new FormData();
      formData.set('file', file);
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      const result = await readApiJson<{
        uploadId?: string;
        headers?: string[];
        rowCount?: number;
        detectedMapping?: ColumnMapping | null;
        error?: string;
      }>(response);
      if (!response.ok || !result.uploadId || !result.headers) {
        throw new Error(result.error ?? `Bestand uploaden mislukt (${response.status})`);
      }

      setUploadId(result.uploadId);
      setUploadedRowCount(result.rowCount ?? 0);
      setRawRows([]);
      setHeaders(result.headers);
      if (result.detectedMapping) {
        setDraftMapping(result.detectedMapping);
      }
      setAppliedSettings(null);
      setAppliedMapping(null);
      setAnalysisResult(null);
      setAnalysisId(null);
      setFinancialResult(null);
      setFinancialPvAdviceCharts(null);
      setAnalyzedAt(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bestand kon niet worden ingelezen');
    }
  };

  const updatePvInputMode = (mode: PvInputMode) => {
    setInputMode(mode);
    setDraftSettings((prev) => ({ ...prev, pvInputMode: mode }));
    setAnalysisResult(null);
    setAnalysisId(null);
    setAnnualBillAdvice(null);
    setFinancialResult(null);
    setFinancialPvAdviceCharts(null);
  };

  const handleAnnualBillPdf = async (file: File) => {
    setAnnualBillFileName(file.name);
    setIsExtractingAnnualBill(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set('file', file);
      const response = await fetch('/api/annual-bill/extract', {
        method: 'POST',
        body: formData
      });
      const result = await readApiJson<{
        input?: AnnualBillInput;
        raw?: AnnualBillExtract['raw'];
        issues?: AnnualBillExtract['issues'];
        textPreview?: string;
        error?: string;
      }>(response);
      if (!response.ok || !result.input) {
        throw new Error(result.error ?? `Jaarnota uitlezen mislukt (${response.status})`);
      }

      const extract: AnnualBillExtract = {
        input: result.input,
        raw: result.raw ?? {},
        issues: result.issues ?? [],
        textPreview: result.textPreview ?? ''
      };
      setAnnualBillExtract(extract);
      setAnnualBillInput((prev) => ({
        ...prev,
        ...result.input,
        supplierName: result.input?.supplierName ?? prev.supplierName ?? file.name.replace(/\.pdf$/i, ''),
        source: 'pdf'
      }));
      setAnnualBillTextPreview(result.textPreview ?? null);
      setAnnualBillDetailsOpen(false);
      setAnnualBillAdvice(null);
      setAnalysisResult(null);
      setAnalysisId(null);
      setFinancialResult(null);
      setFinancialPvAdviceCharts(null);
    } catch {
      setAnnualBillInput((prev) => ({
        ...prev,
        supplierName: prev.supplierName ?? file.name.replace(/\.pdf$/i, ''),
        source: 'pdf',
        extractionConfidence: 0,
        missingFields: ['totalUsageKwh', 'totalFeedInKwh']
      }));
      setAnnualBillExtract(null);
      setAnnualBillAdvice(null);
      setError('We konden deze PDF niet automatisch uitlezen. Je kunt doorgaan met handmatige jaarnota-invoer.');
    } finally {
      setIsExtractingAnnualBill(false);
    }
  };

  const updateAnnualBillInput = (patch: Partial<AnnualBillInput>) => {
    setAnnualBillInput((prev) => ({ ...prev, ...patch }));
    setAnnualBillAdvice(null);
    setAnalysisResult(null);
    setAnalysisId(null);
    setFinancialResult(null);
    setFinancialPvAdviceCharts(null);
  };

  const handleAnalyze = async () => {
    setError(null);
    if (usesIntervalData && (!draftMapping.timestamp || !draftMapping.consumptionKwh)) {
      setError('Selecteer eerst timestamp- en consumption-kolommen.');
      return;
    }
    if (draftSettings.analysisType === 'PV_SELF_CONSUMPTION' && usesIntervalData && !hasPvInputs) {
      setError('Voor PV-analyse is een pv_kwh- of export_kwh-kolom nodig.');
      return;
    }
    if (draftSettings.analysisType === 'PV_SELF_CONSUMPTION' && !usesIntervalData && !hasAnnualBillInputs) {
      setError('We hebben geen stroomverbruik of teruglevering gevonden. Vul minimaal een van deze jaarwaarden in.');
      return;
    }
    if (!canAnalyze) {
      setError('Controleer instellingen en data voordat je analyseert.');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisProgress({ percent: 10, label: 'Analyse voorbereiden...' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    try {
      setAnalysisProgress({ percent: 25, label: 'Rekenmodules laden...' });
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId,
          rows: uploadId ? undefined : rawRows,
          mapping: draftMapping,
          settings: { ...draftSettings, pvInputMode: inputMode },
          annualBillInput: usesIntervalData ? undefined : annualBillInput
        })
      });
      const payload = await readApiJson<(AnalysisResult & { analysisId?: string }) | { error?: string }>(response);
      setAnalysisProgress({ percent: 45, label: 'Data opschonen en kwartieren voorbereiden...' });
      await new Promise((resolve) => setTimeout(resolve, 0));
      setAnalysisProgress({ percent: 70, label: 'Batterijscenario’s simuleren...' });
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (!response.ok) {
        setError('error' in payload && payload.error ? payload.error : `Analyse mislukt (${response.status})`);
        return;
      }
      const result = payload as AnalysisResult & { analysisId?: string };
      if (!result) {
        setError('Geen bruikbare rijen na normalisatie of filtering.');
        return;
      }

      setAnalysisProgress({ percent: 92, label: 'Resultaten en grafieken klaarzetten...' });
      setAppliedSettings({ ...draftSettings });
      setAppliedMapping({ ...draftMapping });
      setAnalysisResult(result);
      setAnalysisId(result.analysisId ?? null);
      setAnnualBillAdvice(result.annualBillAdvice ?? null);
      setFinancialResult(null);
      setFinancialPvAdviceCharts(null);
      setSelectedScenario(result.sizing.recommendedProduct?.capacityKwh ?? result.scenarios[0]?.capacityKwh ?? 64);
      setAnalyzedAt(new Date().toISOString());
      setAnalysisProgress({ percent: 100, label: 'Analyse gereed.' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analyse kon niet worden uitgevoerd. Probeer opnieuw of upload het bestand opnieuw.');
    } finally {
      setIsAnalyzing(false);
      window.setTimeout(() => setAnalysisProgress(null), 500);
    }
  };

  const updateVariablePricePeriod = (index: number, patch: Partial<PriceInterval>) => {
    setVariablePricePeriods((prev) => prev.map((period, periodIndex) => (periodIndex === index ? { ...period, ...patch } : period)));
    setFinancialResult(null);
    setFinancialPvAdviceCharts(null);
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
    setFinancialResult(null);
    setFinancialPvAdviceCharts(null);
  };

  const removeVariablePricePeriod = (index: number) => {
    setVariablePricePeriods((prev) => prev.filter((_, periodIndex) => periodIndex !== index));
    setFinancialResult(null);
    setFinancialPvAdviceCharts(null);
  };

  const handlePriceFile = async (file: File) => {
    setError(null);
    try {
      const { calculateAveragePriceValues, parsePriceFile } = await import('@/lib/pricing');
      const result = await parsePriceFile(file);
      const averagePrices = calculateAveragePriceValues(result.rows);
      setPriceIntervals(result.rows);
      setPriceFileName(file.name);
      setDraftSettings((prev) => ({
        ...prev,
        pvPricingMode: 'dynamic',
        pvImportPriceEurPerKwh: averagePrices.importPriceEurPerKwh ?? prev.pvImportPriceEurPerKwh,
        pvExportCompensationEurPerKwh: averagePrices.exportPriceEurPerKwh ?? prev.pvExportCompensationEurPerKwh,
        pvFeedInCostEurPerKwh: averagePrices.feedInCostEurPerKwh ?? prev.pvFeedInCostEurPerKwh
      }));
      setFinancialResult(null);
      setFinancialPvAdviceCharts(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Prijsbestand kon niet worden ingelezen');
    }
  };

  const handleCalculateFinancials = async () => {
    setError(null);
    if (!analysisResult || analysisResult.analysisType !== 'PV_SELF_CONSUMPTION') return;
    if (
      draftSettings.pvPricingMode === 'variable' &&
      !variablePricePeriods.some((period) => !!period.startTs && !!period.endTs)
    ) {
      setError('Vul minimaal één geldige tariefperiode in.');
      return;
    }

    setIsCalculatingFinancials(true);
    setFinancialProgress({ percent: 10, label: 'Financiële berekening voorbereiden...' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    try {
      setFinancialProgress({ percent: 25, label: 'Prijs- en rekenmodules laden...' });
      setFinancialProgress({ percent: 45, label: 'Prijzen aan kwartieren koppelen...' });
      const effectivePriceIntervals =
        draftSettings.pvPricingMode === 'variable'
          ? variablePricePeriods.filter((period) => period.startTs && period.endTs)
          : priceIntervals;
      setFinancialProgress({ percent: 70, label: 'Financiële batterijscenario’s doorrekenen...' });
      await new Promise((resolve) => setTimeout(resolve, 0));
      const response = await fetch('/api/financial-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysisId,
          intervals: analysisId ? undefined : analysisResult.intervals,
          formulaAdvice: analysisId ? undefined : analysisResult.sizing.pvFormulaAdvice ?? null,
          settings: {
            ...draftSettings,
            pvCustomerType: appliedSettings?.pvCustomerType ?? draftSettings.pvCustomerType
          },
          priceIntervals: effectivePriceIntervals
        })
      });
      const payload = await readApiJson<
        | { financialAdvice: PvSelfConsumptionAdviceResult; charts: PvAdviceChartsData | null }
        | { error?: string }
      >(response);
      if (!response.ok || !('financialAdvice' in payload)) {
        setError('error' in payload && payload.error ? payload.error : `Financiele berekening mislukt (${response.status})`);
        return;
      }
      const financialAdvice = payload.financialAdvice;
      setFinancialProgress({ percent: 90, label: 'Rapportgrafieken en terugverdientijd klaarzetten...' });
      setFinancialResult(financialAdvice);
      setFinancialPvAdviceCharts(payload.charts);
      setFinancialProgress({ percent: 100, label: 'Financiële berekening gereed.' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Financiele berekening kon niet worden uitgevoerd. Probeer opnieuw.');
    } finally {
      setIsCalculatingFinancials(false);
      window.setTimeout(() => setFinancialProgress(null), 500);
    }
  };

  const resetDraft = () => {
    if (!appliedSettings || !appliedMapping) return;
    setDraftSettings({ ...appliedSettings });
    setDraftMapping({ ...appliedMapping });
  };

  const displayedPvAdviceCharts = useMemo(() => {
    if (
      !analysisResult ||
      analysisResult.analysisType !== 'PV_SELF_CONSUMPTION' ||
      !analysisResult.sizing.pvFormulaAdvice
    ) {
      return null;
    }

    if (financialResult) {
      return financialPvAdviceCharts;
    }

    return analysisResult.pvAdviceCharts;
  }, [analysisResult, financialResult, financialPvAdviceCharts]);

  const downloadReport = async () => {
    if (!analysisResult || !appliedSettings) return;
    let reportSizing = analysisResult.sizing;
    let sourceScenarios = analysisResult.scenarios;
    let reportPvAdviceCharts = analysisResult.pvAdviceCharts;
    const includePeakReportData = analysisResult.analysisType !== 'PV_SELF_CONSUMPTION';
    const reportIntervals = includePeakReportData
      ? selectReportIntervals(analysisResult.intervals, analysisResult.highestPeakDay)
      : [];
    const reportPeakMoments = includePeakReportData
      ? selectReportPeakMoments(analysisResult.peakMoments, analysisResult.highestPeakDay)
      : [];

    if (analysisResult.analysisType === 'PV_SELF_CONSUMPTION' && financialResult) {
      const { buildSizingResultFromPvSelfConsumptionAdvice, computePvStorageFormulaAdvice, toScenarioResult } =
        await import('@/lib/calculations');
      const formulaAdvice =
        analysisResult.sizing.pvFormulaAdvice ??
        computePvStorageFormulaAdvice(analysisResult.intervals, {
          customerType: appliedSettings.pvCustomerType
        });
      reportSizing = buildSizingResultFromPvSelfConsumptionAdvice(formulaAdvice, financialResult);
      sourceScenarios = financialResult.simulationAdvice.allScenarios.map((scenario) =>
        toScenarioResult({
          ...scenario,
          optionLabel: `${scenario.capacityKwh} kWh / ${scenario.dischargePowerKw.toFixed(1)} kW`
        })
      );
      reportPvAdviceCharts = financialPvAdviceCharts ?? analysisResult.pvAdviceCharts;
    }

    const reportScenarios = sourceScenarios.map((scenario) => ({
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
      baselineEnergyCostEur: scenario.baselineEnergyCostEur,
      batteryEnergyCostEur: scenario.batteryEnergyCostEur,
      dynamicValueEur: scenario.dynamicValueEur,
      isEligible: scenario.isEligible,
      excludedReason: scenario.excludedReason,
      recommendationReason: scenario.recommendationReason,
      totalEconomicValueEur: scenario.totalEconomicValueEur,
      pvStrategy: scenario.pvStrategy,
      // Excluded on purpose to keep report payload small for large datasets.
      shavedSeries: []
    }));

    const reportPayload = {
      reportVariant: 'advice',
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
      sizing: compactReportSizing(reportSizing),
      quality: analysisResult.quality,
      topEvents: analysisResult.events,
      peakMoments: reportPeakMoments,
      intervals: reportIntervals,
      highestPeakDay: analysisResult.highestPeakDay,
      pvSummary: analysisResult.pvSummary,
      pvAdviceCharts: reportPvAdviceCharts,
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

  const downloadFinancialReport = async () => {
    if (!analysisResult || !appliedSettings || !financialResult || analysisResult.analysisType !== 'PV_SELF_CONSUMPTION') return;
    const {
      buildSizingResultFromPvSelfConsumptionAdvice,
      buildPvAdviceChartsData,
      computePvStorageFormulaAdvice,
      toScenarioResult
    } = await import('@/lib/calculations');
    const formulaAdvice = analysisResult.sizing.pvFormulaAdvice ?? computePvStorageFormulaAdvice(analysisResult.intervals, {
      customerType: appliedSettings.pvCustomerType
    });
    const sizing = buildSizingResultFromPvSelfConsumptionAdvice(formulaAdvice, financialResult);
    const reportScenarios = financialResult.simulationAdvice.allScenarios.map((scenario) =>
      compactReportScenario(
        toScenarioResult({
          ...scenario,
          optionLabel: `${scenario.capacityKwh} kWh / ${scenario.dischargePowerKw.toFixed(1)} kW`
        })
      )
    );
    const reportPayload: PdfPayload = {
      reportVariant: 'financial',
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
      sizing: compactReportSizing(sizing),
      quality: analysisResult.quality,
      topEvents: analysisResult.events,
      peakMoments: [],
      intervals: [],
      highestPeakDay: analysisResult.highestPeakDay,
      pvSummary: analysisResult.pvSummary,
      pvAdviceCharts: financialPvAdviceCharts ?? buildPvAdviceChartsData(formulaAdvice, analysisResult.intervals, financialResult),
      scenarios: reportScenarios
    };

    try {
      const { generateReportPdf } = await import('@/lib/pdf');
      const pdf = await generateReportPdf(reportPayload);
      const pdfBuffer = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
      const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wattsnext-pv-financial-report-${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download van financieel rapport mislukt');
    }
  };

  return (
    <Screen>
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
            <PageTitle
              title={draftSettings.analysisType === 'PV_SELF_CONSUMPTION' ? 'PV Self Consumption Adviseur' : 'Peak Shaving Adviseur'}
              description="batterij-analyse met scenariovergelijking, rapportage en financiële onderbouwing."
            />
          </div>
          <PremiumBadge tone="success">ENERGIEOPLOSSINGEN</PremiumBadge>
        </div>
      </section>

      {usesIntervalData && <Upload onFile={handleFile} />}
      {error && <p className="rounded border border-red-200 bg-red-50 p-3 text-red-700">{error}</p>}
      {usesIntervalData && headers.length > 0 && (
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
            <div className="lg:col-span-3">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="mb-3 text-sm font-medium text-slate-900">Invoermethode PV-opwek optimaliseren</p>
                <div className="grid gap-3 md:grid-cols-3">
                  {[
                    ['intervalData', 'Kwartierdata uploaden', 'Nauwkeurig advies'],
                    ['annualBill', 'Jaarnota uploaden', 'Indicatief advies'],
                    ['manualAnnualBill', 'Handmatig invullen', 'Indicatief advies']
                  ].map(([value, title, label]) => (
                    <label key={value} className="rounded-lg border border-slate-200 p-3 text-sm">
                      <input
                        className="mr-2"
                        type="radio"
                        checked={inputMode === value}
                        onChange={() => updatePvInputMode(value as PvInputMode)}
                      />
                      <span className="font-medium text-slate-900">{title}</span>
                      <span className="mt-1 block text-xs text-slate-500">{label}</span>
                    </label>
                  ))}
                </div>
                {inputMode !== 'intervalData' && (
                  <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                    Indicatief advies: deze route gebruikt jaarvolumes en een vereenvoudigd profiel. Upload kwartierdata voor een nauwkeurig batterijadvies.
                  </p>
                )}
              </div>
            </div>

            {inputMode === 'annualBill' && (
              <label className="text-sm lg:col-span-3">
                Upload PDF-jaarnota
                <input id="annual-bill-pdf-input" className="wx-input" type="file" accept=".pdf" disabled={isExtractingAnnualBill} onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleAnnualBillPdf(file); }} />
                <span className="mt-1 block text-xs text-slate-500">
                  {isExtractingAnnualBill
                    ? 'Je jaarnota wordt geanalyseerd...'
                    : annualBillFileName
                      ? `Jaarnota: ${annualBillFileName}. Controleer en vul de jaarwaarden hieronder aan.`
                      : 'Upload een PDF; de app probeert jaarwaarden te herkennen en zet ze hieronder klaar ter controle.'}
                </span>
              </label>
            )}

            {inputMode !== 'intervalData' && (
              <div className="lg:col-span-3">
                <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-3">
                  <div className="md:col-span-3 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
                    Extractiezekerheid: {annualBillInput.extractionConfidence != null ? `${Math.round(annualBillInput.extractionConfidence * 100)}%` : 'n.v.t.'}
                    {annualBillInput.missingFields?.length ? ` | Controleer/aanvullen: ${annualBillInput.missingFields.join(', ')}` : ' | Geen verplichte ontbrekende velden gemeld.'}
                  </div>
                  <div className="md:col-span-3 grid gap-3 md:grid-cols-3">
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Verbruik per jaar</p>
                      <p className="text-lg font-semibold text-slate-900">{formatKwh(resolveAnnualUsageKwh(annualBillInput))}</p>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Teruglevering per jaar</p>
                      <p className="text-lg font-semibold text-slate-900">{formatKwh(resolveAnnualFeedInKwh(annualBillInput))}</p>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Periode</p>
                      <p className="text-sm font-semibold text-slate-900">{annualBillInput.periodStart || '-'} t/m {annualBillInput.periodEnd || '-'}</p>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Leverancier</p>
                      <p className="text-sm font-semibold text-slate-900">{annualBillInput.supplierName || '-'}</p>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Gebruikte stroomprijs</p>
                      <p className="text-sm font-semibold text-slate-900">€ {annualBillUsedImportPrice.toLocaleString('nl-NL', { maximumFractionDigits: 2 })}/kWh</p>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Gebruikte terugleververgoeding</p>
                      <p className="text-sm font-semibold text-slate-900">€ {annualBillUsedFeedInPrice.toLocaleString('nl-NL', { maximumFractionDigits: 2 })}/kWh</p>
                    </div>
                  </div>
                  <p className="md:col-span-3 rounded-md border border-lime-200 bg-lime-50 p-2 text-sm text-lime-900">
                    {annualBillExtract
                      ? 'We hebben de belangrijkste gegevens gevonden. Controleer kort of dit klopt.'
                      : 'We hebben niet alles kunnen vinden, maar kunnen wel een indicatief advies maken.'}
                    {annualBillMissing.length ? ` Ontbrekende details worden geschat: ${annualBillMissing.join(', ')}.` : ''}
                  </p>
                  <details className="md:col-span-3 rounded-md border border-slate-200 bg-white p-3 text-sm" open={annualBillDetailsOpen} onToggle={(event) => setAnnualBillDetailsOpen(event.currentTarget.open)}>
                    <summary className="cursor-pointer font-medium text-slate-900">Geavanceerde gegevens bekijken</summary>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <label className="text-sm">
                    Leverancier
                    <input className="wx-input" value={annualBillInput.supplierName ?? ''} onChange={(event) => updateAnnualBillInput({ supplierName: event.target.value, source: inputMode === 'annualBill' ? 'pdf' : 'manual' })} />
                  </label>
                  <label className="text-sm">
                    Periode start
                    <input className="wx-input" type="date" value={annualBillInput.periodStart ?? ''} onChange={(event) => updateAnnualBillInput({ periodStart: event.target.value })} />
                  </label>
                  <label className="text-sm">
                    Periode einde
                    <input className="wx-input" type="date" value={annualBillInput.periodEnd ?? ''} onChange={(event) => updateAnnualBillInput({ periodEnd: event.target.value })} />
                  </label>
                  <label className="text-sm">
                    Totaal verbruik (kWh/jaar)
                    <input className="wx-input" type="number" step="1" value={annualBillInput.totalUsageKwh ?? ''} onChange={(event) => updateAnnualBillInput({ totalUsageKwh: toOptionalNumber(event.target.value) })} />
                  </label>
                  <label className="text-sm">
                    Totaal teruglevering (kWh/jaar)
                    <input className="wx-input" type="number" step="1" value={annualBillInput.totalFeedInKwh ?? ''} onChange={(event) => updateAnnualBillInput({ totalFeedInKwh: toOptionalNumber(event.target.value) })} />
                  </label>
                  <label className="text-sm">
                    Verbruik overdag/piek (kWh/jaar)
                    <input className="wx-input" type="number" step="1" value={annualBillInput.usageNormalKwh ?? ''} onChange={(event) => updateAnnualBillInput({ usageNormalKwh: toOptionalNumber(event.target.value) })} />
                  </label>
                  <label className="text-sm">
                    Verbruik dal/nacht (kWh/jaar)
                    <input className="wx-input" type="number" step="1" value={annualBillInput.usageOffPeakKwh ?? ''} onChange={(event) => updateAnnualBillInput({ usageOffPeakKwh: toOptionalNumber(event.target.value) })} />
                  </label>
                  <label className="text-sm">
                    Teruglevering overdag/piek (kWh/jaar)
                    <input className="wx-input" type="number" step="1" value={annualBillInput.feedInNormalKwh ?? ''} onChange={(event) => updateAnnualBillInput({ feedInNormalKwh: toOptionalNumber(event.target.value) })} />
                  </label>
                  <label className="text-sm">
                    Teruglevering dal/nacht (kWh/jaar)
                    <input className="wx-input" type="number" step="1" value={annualBillInput.feedInOffPeakKwh ?? ''} onChange={(event) => updateAnnualBillInput({ feedInOffPeakKwh: toOptionalNumber(event.target.value) })} />
                  </label>
                  <label className="text-sm">
                    Jaarlijkse PV-opwek (optioneel)
                    <input className="wx-input" type="number" step="1" value={annualBillInput.annualPvProductionKwh ?? ''} onChange={(event) => updateAnnualBillInput({ annualPvProductionKwh: toOptionalNumber(event.target.value) })} />
                  </label>
                  <label className="text-sm">
                    Aantal zonnepanelen
                    <input className="wx-input" type="number" step="1" value={annualBillInput.solarPanelCount ?? ''} onChange={(event) => updateAnnualBillInput({ solarPanelCount: toOptionalNumber(event.target.value) })} />
                  </label>
                  <label className="text-sm">
                    Vermogen per paneel (Wp)
                    <input className="wx-input" type="number" step="5" value={annualBillInput.solarPanelWp ?? ''} onChange={(event) => updateAnnualBillInput({ solarPanelWp: toOptionalNumber(event.target.value) })} />
                  </label>
                  <label className="text-sm">
                    Dakoriëntatie
                    <select className="wx-input" value={annualBillInput.roofOrientation ?? 'other'} onChange={(event) => updateAnnualBillInput({ roofOrientation: event.target.value as AnnualBillInput['roofOrientation'] })}>
                      <option value="south">Zuid</option>
                      <option value="east_west">Oost-west</option>
                      <option value="east">Oost</option>
                      <option value="west">West</option>
                      <option value="other">Anders/onbekend</option>
                    </select>
                  </label>
                  <label className="text-sm">
                    Verbruik overdag/piek tarief (EUR/kWh)
                    <input className="wx-input" type="number" step="0.01" value={annualBillInput.normalTariffEurPerKwh ?? ''} onChange={(event) => updateAnnualBillInput({ normalTariffEurPerKwh: toOptionalNumber(event.target.value) })} />
                  </label>
                  <label className="text-sm">
                    Verbruik dal/nacht tarief (EUR/kWh)
                    <input className="wx-input" type="number" step="0.01" value={annualBillInput.offPeakTariffEurPerKwh ?? ''} onChange={(event) => updateAnnualBillInput({ offPeakTariffEurPerKwh: toOptionalNumber(event.target.value) })} />
                  </label>
                  <label className="text-sm">
                    Terugleververgoeding (EUR/kWh)
                    <input className="wx-input" type="number" step="0.01" value={annualBillInput.feedInTariffEurPerKwh ?? ''} onChange={(event) => updateAnnualBillInput({ feedInTariffEurPerKwh: toOptionalNumber(event.target.value) })} />
                  </label>
                  <label className="text-sm">
                    Batterij-investering (EUR)
                    <input className="wx-input" type="number" step="100" value={annualBillInput.batteryInvestmentEur ?? ''} onChange={(event) => updateAnnualBillInput({ batteryInvestmentEur: toOptionalNumber(event.target.value) })} />
                  </label>
                  <div className="md:col-span-3 text-xs text-slate-600">
                    EAN: {maskEan(annualBillInput.eanElectricity)} | Betrouwbaarheid: {annualBillConfidence === 'medium' ? 'middel' : 'laag'}
                  </div>
                    </div>
                  </details>
                  {annualBillTextPreview && (
                    <details className="md:col-span-3 rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-600">
                      <summary className="cursor-pointer font-medium text-slate-800">PDF-tekstfragment tonen</summary>
                      <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap">{annualBillTextPreview}</pre>
                    </details>
                  )}
                  <div className="md:col-span-3 rounded-md border border-lime-200 bg-lime-50 p-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-lime-900">
                          Controleer de gevonden waarden
                        </p>
                        <p className="mt-1 text-xs text-lime-800">
                          {inputMode === 'annualBill'
                            ? annualBillExtract
                              ? 'De PDF is geanalyseerd. Pas alleen velden aan die niet kloppen en bereken daarna het indicatieve advies.'
                              : 'Upload eerst een PDF-jaarnota; daarna vult de app de gevonden waarden hier automatisch in.'
                            : 'Vul de belangrijkste jaarwaarden in en bereken daarna het indicatieve advies.'}
                        </p>
                        {annualBillExtract?.issues.length ? (
                          <p className="mt-1 text-xs text-amber-800">
                            Aandachtspunten: {annualBillExtract.issues.map((issue) => issue.message).join(' ')}
                          </p>
                        ) : null}
                      </div>
                      <button
                        className="wx-btn-primary"
                        type="button"
                        onClick={handleAnalyze}
                        disabled={!canAnalyze || isAnalyzing || isExtractingAnnualBill}
                      >
                        {isAnalyzing ? 'Advies berekenen...' : 'Bereken mijn batterijadvies'}
                      </button>
                      <button className="wx-btn-secondary" type="button" onClick={() => setAnnualBillDetailsOpen(true)}>
                        Waarden aanpassen
                      </button>
                      {inputMode === 'annualBill' && (
                        <button className="wx-btn-secondary" type="button" onClick={() => document.getElementById('annual-bill-pdf-input')?.click()}>
                          Nieuwe jaarnota uploaden
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

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
          {usesIntervalData && (
            <button
              className="wx-btn-primary"
              onClick={handleAnalyze}
              disabled={!canAnalyze || isAnalyzing}
            >
              {isAnalyzing ? 'Analyseren...' : 'Analyseer'}
            </button>
          )}
          <button
            className="wx-btn-secondary"
            onClick={resetDraft}
            disabled={!hasPendingChanges}
          >
            Wijzigingen resetten
          </button>
        </div>
        <div className="lg:col-span-3">
          <ProgressBar progress={analysisProgress} />
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
          {analysisResult.analysisType === 'PV_SELF_CONSUMPTION' && annualBillAdvice && (
            <div className="wx-card">
              <h2 className="wx-title">Indicatief batterijadvies op basis van jaarnota</h2>
              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <p className="text-xs text-slate-500">Aanbevolen batterij</p>
                  <p className="text-lg font-semibold text-slate-900">
                    {annualBillAdvice.recommendedBatteryKwh != null
                      ? `${annualBillAdvice.recommendedBatteryKwh} kWh`
                      : 'Onvoldoende data'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Jaarlijkse besparing</p>
                  <p className="text-lg font-semibold text-slate-900">
                    {formatEuro(annualBillAdvice.annualSavingsRangeEur.expected)}
                  </p>
                  <p className="text-xs text-slate-500">
                    range {formatEuro(annualBillAdvice.annualSavingsRangeEur.min)} - {formatEuro(annualBillAdvice.annualSavingsRangeEur.max)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Terugverdientijd</p>
                  <p className="text-lg font-semibold text-slate-900">
                    {formatYears(annualBillAdvice.paybackRangeYears.expected)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Betrouwbaarheid</p>
                  <p className="text-lg font-semibold text-slate-900">
                    {annualBillAdvice.confidence === 'medium' ? 'Middel' : 'Laag'}
                  </p>
                </div>
              </div>
              <div className="mt-3 rounded-md border border-lime-200 bg-lime-50 p-3 text-sm text-lime-900">
                <p className="font-semibold">Waarom dit advies?</p>
                <p className="mt-1">{annualBillAdvice.explanation}</p>
              </div>
              <p className="mt-3 text-sm text-slate-600">
                Betrouwbaarheid: {annualBillAdvice.confidence === 'medium' ? 'middel' : 'laag'}. Dit blijft indicatief omdat er geen kwartierprofiel is gebruikt.
              </p>
              {annualBillAdvice.warnings.length > 0 && (
                <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">
                  {annualBillAdvice.warnings.join(' ')}
                </p>
              )}
              {annualBillAdvice.options.length > 0 && (
                <div className="mt-4 hidden overflow-x-auto md:block">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b text-xs text-slate-500">
                        <th className="py-2">Batterij</th>
                        <th className="py-2">Opgeslagen zon/jaar</th>
                        <th className="py-2">Besparing/jaar</th>
                        <th className="py-2">TVT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {annualBillAdvice.options.map((option) => (
                        <tr key={option.batteryKwh} className="border-b border-slate-100">
                          <td className="py-2">{option.batteryKwh} kWh</td>
                          <td className="py-2">{formatKwh(option.estimatedAnnualStoredSolarKwh)}</td>
                          <td className="py-2">{formatEuro(option.estimatedAnnualSavingsEur)}</td>
                          <td className="py-2">{formatYears(option.estimatedPaybackYears)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {annualBillAdvice.options.length > 0 && (
                <div className="mt-4 grid gap-3 md:hidden">
                  {annualBillAdvice.options.map((option) => (
                    <div key={option.batteryKwh} className="rounded-md border border-slate-200 bg-white p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <strong>{option.batteryKwh} kWh</strong>
                        <span>{formatYears(option.estimatedPaybackYears)}</span>
                      </div>
                      <p className="mt-2 text-slate-600">Opgeslagen zon: {formatKwh(option.estimatedAnnualStoredSolarKwh)}</p>
                      <p className="text-slate-600">Besparing: {formatEuro(option.estimatedAnnualSavingsEur)} per jaar</p>
                    </div>
                  ))}
                </div>
              )}
              <button className="wx-btn-secondary mt-4" type="button" onClick={() => updatePvInputMode('intervalData')}>
                Nauwkeuriger advies maken met kwartierdata
              </button>
            </div>
          )}
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
                          Financi?le berekening en terugverdientijd worden pas hieronder apart doorgerekend op basis van contracttype en prijsdata.
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
            displayedPvAdviceCharts && (
              <PvAdviceCharts
                advice={analysisResult.sizing.pvFormulaAdvice}
                charts={displayedPvAdviceCharts}
              />
            )}

          {analysisResult.analysisType === 'PV_SELF_CONSUMPTION' && (
            <div className="wx-card">
              <h3 className="wx-title">Financiële berekening na advies</h3>
              <p className="text-sm text-slate-600">
                Eerst is het technische batterijadvies bepaald. Vul daarna de financiële aannames in om de terugverdientijd en onderbouwing apart te berekenen en te downloaden.
              </p>
              <div className="mt-4 grid gap-4 lg:grid-cols-3">
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
                    <option value="dynamic">Dynamisch contract</option>
                    <option value="average">Vast tarief</option>
                    <option value="variable">Variabel contract</option>
                  </select>
                </label>
                {draftSettings.pvPricingMode !== 'dynamic' && (
                  <>
                    <label className="text-sm">
                      Importprijs / fallback (EUR/kWh)
                      <input className="wx-input" type="number" step="0.01" value={draftSettings.pvImportPriceEurPerKwh} onChange={(event) => setDraftSettings((prev) => ({ ...prev, pvImportPriceEurPerKwh: Number(event.target.value) }))} />
                    </label>
                    <label className="text-sm">
                      Terugleververgoeding / fallback (EUR/kWh)
                      <input className="wx-input" type="number" step="0.01" value={draftSettings.pvExportCompensationEurPerKwh} onChange={(event) => setDraftSettings((prev) => ({ ...prev, pvExportCompensationEurPerKwh: Number(event.target.value) }))} />
                    </label>
                    <label className="text-sm">
                      Terugleverkosten / fallback (EUR/kWh)
                      <input className="wx-input" type="number" step="0.01" value={draftSettings.pvFeedInCostEurPerKwh} onChange={(event) => setDraftSettings((prev) => ({ ...prev, pvFeedInCostEurPerKwh: Number(event.target.value) }))} />
                    </label>
                  </>
                )}
                <label className="text-sm">
                  Investering (EUR)
                  <input className="wx-input" type="number" step="100" value={draftSettings.pvInstallationCostEur ?? ''} onChange={(event) => setDraftSettings((prev) => ({ ...prev, pvInstallationCostEur: event.target.value === '' ? undefined : Number(event.target.value) }))} />
                </label>
                <label className="text-sm">
                  Jaarlijks onderhoud / kosten (EUR)
                  <input className="wx-input" type="number" step="10" value={draftSettings.pvYearlyMaintenanceEur ?? 0} onChange={(event) => setDraftSettings((prev) => ({ ...prev, pvYearlyMaintenanceEur: Number(event.target.value) }))} />
                </label>
                {draftSettings.pvPricingMode !== 'dynamic' && (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={draftSettings.pvFallbackToAveragePrices} onChange={(event) => setDraftSettings((prev) => ({ ...prev, pvFallbackToAveragePrices: event.target.checked }))} />
                    Fallback naar gemiddelde prijzen toestaan
                  </label>
                )}
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
                    <input className="wx-input" type="file" accept=".csv,.xlsx,.xls" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handlePriceFile(file); }} />
                  </label>
                )}
              </div>
              {draftSettings.pvPricingMode !== 'average' && (
                <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
                  <p>Prijsbestand: {priceFileName ?? 'Nog niet geüpload'}</p>
                  <p>Gekoppelde prijspunten: {draftSettings.pvPricingMode === 'dynamic' ? priceIntervals.length : variablePricePeriods.length}</p>
                  {financialResult?.configUsed.pricingStats && (
                    <>
                      <p>Exacte matches: {financialResult.configUsed.pricingStats.exactMatches}</p>
                      <p>Uurmatches: {financialResult.configUsed.pricingStats.hourlyMatches}</p>
                      <p>Periode-matches: {financialResult.configUsed.pricingStats.variablePeriodMatches}</p>
                      <p>Fallbackmatches: {financialResult.configUsed.pricingStats.fallbackMatches}</p>
                      <p>Ontbrekende prijzen: {financialResult.configUsed.pricingStats.missingPrices}</p>
                    </>
                  )}
                </div>
              )}
              <div className="mt-4 flex gap-2">
                <button className="wx-btn-primary" onClick={handleCalculateFinancials} disabled={isCalculatingFinancials || hasPendingChanges}>
                  {isCalculatingFinancials ? 'Berekenen...' : 'Bereken terugverdientijd'}
                </button>
                <button className="wx-btn-secondary" onClick={downloadFinancialReport} disabled={!financialResult || hasPendingChanges}>
                  Download financieel rapport
                </button>
              </div>
              <div className="mt-3">
                <ProgressBar progress={financialProgress} />
              </div>
              {financialResult && (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">
                    Terugverdientijd aanbevolen batterij: {financialResult.simulationAdvice.recommended.paybackYears != null ? `${financialResult.simulationAdvice.recommended.paybackYears.toFixed(1)} jaar` : 'niet positief / niet binnen levensduur'}
                  </p>
                  <p className="mt-1">
                    Netto jaarlijkse besparing: EUR {financialResult.simulationAdvice.recommended.netAnnualSavingsEur?.toFixed(2) ?? '0.00'} bij een investering van EUR {(draftSettings.pvInstallationCostEur ?? 0).toFixed(2)}.
                  </p>
                  <p className="mt-1">
                    De jaarlijkse besparing is berekend uit de kwartierprijzen en het batterijgedrag in de dataset, daarna opgeschaald naar een representatief jaar.
                  </p>
                  <p className="mt-1">
                    Onderbouwing: zonder batterij import {financialResult.simulationAdvice.recommended.importBeforeKwh.toFixed(1)} kWh en export {financialResult.simulationAdvice.recommended.exportBeforeKwh.toFixed(1)} kWh; met batterij import {financialResult.simulationAdvice.recommended.importAfterKwh.toFixed(1)} kWh en export {financialResult.simulationAdvice.recommended.exportAfterKwh.toFixed(1)} kWh.
                  </p>
                  {financialResult.simulationAdvice.recommended.paybackIndicative && (
                    <p className="mt-1 text-amber-700">De terugverdientijd is indicatief omdat de dataset korter dan een jaar is of omdat een deel van de prijsdata met fallbacktarieven is berekend.</p>
                  )}
                </div>
              )}
            </div>
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
              Download adviesrapport
            </button>
          </div>
        </>
      ) : (
        <div className="wx-card text-sm text-slate-600">
          Upload data en klik op Analyseer om resultaten te genereren.
        </div>
      )}
    </Screen>
  );
}
