import type {
  DataQualityReport,
  ExceededInterval,
  PeakEvent,
  PeakMoment,
  ProcessedInterval,
  SizingResult
} from './calculations';
import type { NormalizationDiagnostics, InterpretationMode } from './normalization';
import type { ScenarioResult } from './simulation';

export type Method = 'MAX_PEAK' | 'P95' | 'FULL_COVERAGE';

export interface AnalysisSettings {
  contractedPowerKw: number;
  method: Method;
  compliance: number;
  safetyFactor: number;
  efficiency: number;
  interpretationMode: InterpretationMode;
  includeHistogram?: boolean;
  includePeakEventsTable?: boolean;
  includeScenarioSection?: boolean;
}

export interface AnalysisResult {
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
}

export const defaultAnalysisSettings: AnalysisSettings = {
  contractedPowerKw: 500,
  method: 'MAX_PEAK',
  compliance: 0.95,
  safetyFactor: 1.2,
  efficiency: 0.9,
  interpretationMode: 'AUTO',
  includeHistogram: true,
  includePeakEventsTable: true,
  includeScenarioSection: true
};

export function analysisSettingsEqual(a: AnalysisSettings, b: AnalysisSettings): boolean {
  return (
    a.contractedPowerKw === b.contractedPowerKw &&
    a.method === b.method &&
    a.compliance === b.compliance &&
    a.safetyFactor === b.safetyFactor &&
    a.efficiency === b.efficiency &&
    a.interpretationMode === b.interpretationMode &&
    (a.includeHistogram ?? true) === (b.includeHistogram ?? true) &&
    (a.includePeakEventsTable ?? true) === (b.includePeakEventsTable ?? true) &&
    (a.includeScenarioSection ?? true) === (b.includeScenarioSection ?? true)
  );
}
