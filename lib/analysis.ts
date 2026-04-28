import type {
  DataQualityReport,
  ExceededInterval,
  PvAdviceChartsData,
  PeakEvent,
  PeakMoment,
  ProcessedInterval,
  SizingResult
} from './calculations';
import type { NormalizationDiagnostics, InterpretationMode } from './normalization';
import type { PvSummary, ScenarioResult } from './simulation';
import type { PvAnalysisMode, PvStrategy } from './pvSimulation';
import type { PricingMode } from './pricing';

export type Method = 'MAX_PEAK' | 'P95' | 'FULL_COVERAGE';
export type AnalysisType = 'PEAK_SHAVING' | 'PV_SELF_CONSUMPTION';

export interface AnalysisSettings {
  analysisType: AnalysisType;
  contractedPowerKw: number;
  method: Method;
  compliance: number;
  safetyFactor: number;
  efficiency: number;
  interpretationMode: InterpretationMode;
  pvStrategy: PvStrategy;
  pvCustomerType: 'auto' | 'home' | 'business';
  pvPricingMode: PricingMode;
  pvFallbackToAveragePrices: boolean;
  pvImportPriceEurPerKwh: number;
  pvExportCompensationEurPerKwh: number;
  pvFeedInCostEurPerKwh: number;
  pvInstallationCostEur?: number;
  pvYearlyMaintenanceEur?: number;
  includeHistogram?: boolean;
  includePeakEventsTable?: boolean;
  includeScenarioSection?: boolean;
}

export interface AnalysisResult {
  analysisType: AnalysisType;
  intervals: ProcessedInterval[];
  events: PeakEvent[];
  peakMoments: PeakMoment[];
  sizing: SizingResult;
  scenarios: ScenarioResult[];
  highestPeakDay: string | null;
  maxObservedKw: number;
  maxObservedTimestamp: string | null;
  exceedanceIntervals: number;
  topExceededIntervals: ExceededInterval[];
  normalizationDiagnostics: NormalizationDiagnostics;
  quality: DataQualityReport;
  pvSummary: PvSummary | null;
  pvAdviceCharts?: PvAdviceChartsData | null;
  pvAnalysisMode?: PvAnalysisMode | null;
  pvWarnings?: string[];
}

export const defaultAnalysisSettings: AnalysisSettings = {
  analysisType: 'PEAK_SHAVING',
  contractedPowerKw: 500,
  method: 'MAX_PEAK',
  compliance: 0.95,
  safetyFactor: 1.2,
  efficiency: 0.9,
  interpretationMode: 'AUTO',
  pvStrategy: 'SELF_CONSUMPTION_ONLY',
  pvCustomerType: 'auto',
  pvPricingMode: 'dynamic',
  pvFallbackToAveragePrices: true,
  pvImportPriceEurPerKwh: 0.3,
  pvExportCompensationEurPerKwh: 0.05,
  pvFeedInCostEurPerKwh: 0,
  pvInstallationCostEur: undefined,
  pvYearlyMaintenanceEur: 0,
  includeHistogram: true,
  includePeakEventsTable: true,
  includeScenarioSection: true
};

export function analysisSettingsEqual(a: AnalysisSettings, b: AnalysisSettings): boolean {
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
    a.pvPricingMode === b.pvPricingMode &&
    a.pvFallbackToAveragePrices === b.pvFallbackToAveragePrices &&
    a.pvImportPriceEurPerKwh === b.pvImportPriceEurPerKwh &&
    a.pvExportCompensationEurPerKwh === b.pvExportCompensationEurPerKwh &&
    a.pvFeedInCostEurPerKwh === b.pvFeedInCostEurPerKwh &&
    (a.pvInstallationCostEur ?? 0) === (b.pvInstallationCostEur ?? 0) &&
    (a.pvYearlyMaintenanceEur ?? 0) === (b.pvYearlyMaintenanceEur ?? 0) &&
    (a.includeHistogram ?? true) === (b.includeHistogram ?? true) &&
    (a.includePeakEventsTable ?? true) === (b.includePeakEventsTable ?? true) &&
    (a.includeScenarioSection ?? true) === (b.includeScenarioSection ?? true)
  );
}
