import type { AnnualBillInput } from '@/lib/analysis';

export type AnnualBillField = keyof AnnualBillInput;

export type AnnualBillExtractValue = {
  value: string | number;
  confidence: number;
  evidence?: string;
  source?: 'rules' | 'ai' | 'merged';
  evidenceSnippet?: string;
  reasoning?: string;
  requiresReview?: boolean;
};

export type AnnualBillRawExtract = Partial<Record<AnnualBillField, AnnualBillExtractValue>>;

export type AnnualBillValidationIssue = {
  field: AnnualBillField;
  message: string;
  severity: 'missing' | 'warning';
};

export type AnnualBillExtractionDiagnostics = {
  traceId?: string;
  pdfBytes?: number;
  textLength: number;
  recognizedFields: AnnualBillField[];
  missingFields: AnnualBillField[];
  issueCount: number;
  parser: 'pdf-parse';
  aiEnabled?: boolean;
  aiUsed?: boolean;
  aiModel?: string;
  aiWarnings?: string[];
};

export type AnnualBillAssumption = {
  field: AnnualBillField | 'general';
  label: string;
  value?: string | number;
  source: 'pdf' | 'calculation' | 'fallback';
  confidence: number;
  evidenceSnippet?: string;
  reasoning: string;
  requiresReview?: boolean;
};

export type AnnualBillAiReport = {
  summary: string;
  assumptions: AnnualBillAssumption[];
  warnings: string[];
};

export type AnnualBillExtractionResult = {
  input: AnnualBillInput;
  raw: AnnualBillRawExtract;
  textPreview: string;
  issues: AnnualBillValidationIssue[];
  diagnostics: AnnualBillExtractionDiagnostics;
  aiReport?: AnnualBillAiReport;
};

export type AnnualBillExtract = AnnualBillExtractionResult;
