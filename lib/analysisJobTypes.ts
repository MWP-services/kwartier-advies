import type { AnalysisResult, AnalysisSettings, AnnualBillInput } from './analysis';
import type { ColumnMapping } from './parsing';

export type AnalysisJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface AnalyzeRequestBody {
  uploadId?: string;
  rows?: Record<string, unknown>[];
  mapping?: ColumnMapping;
  settings?: AnalysisSettings;
  annualBillInput?: AnnualBillInput;
}

export interface PersistedAnalyzeInput {
  rows?: Record<string, unknown>[];
  mapping?: ColumnMapping;
  settings: AnalysisSettings;
  annualBillInput?: AnnualBillInput;
}

export interface AnalysisJobProgress {
  progress: number;
  currentStep: string;
}

export interface AnalysisJobRecord extends AnalysisJobProgress {
  jobId: string;
  status: AnalysisJobStatus;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  input: PersistedAnalyzeInput;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  lockedUntil?: string;
  result?: AnalysisResult & { analysisId: string };
  error?: string;
  errorDetails?: string;
}

export type AnalysisJobStatusResponse =
  | {
      jobId: string;
      status: 'queued' | 'processing';
      progress: number;
      currentStep: string;
    }
  | {
      jobId: string;
      status: 'completed';
      progress: 100;
      currentStep: string;
      result: AnalysisResult & { analysisId: string };
    }
  | {
      jobId: string;
      status: 'failed';
      progress: number;
      currentStep: string;
      error: string;
    };

export interface StartAnalysisJobResponse {
  jobId: string;
  status: 'queued';
  progress: number;
  currentStep: string;
}
