import type { AnnualBillInput } from '@/lib/analysis';

export type AnnualBillField = keyof AnnualBillInput;

export type AnnualBillExtractValue = {
  value: string | number;
  confidence: number;
  evidence?: string;
};

export type AnnualBillRawExtract = Partial<Record<AnnualBillField, AnnualBillExtractValue>>;

export type AnnualBillValidationIssue = {
  field: AnnualBillField;
  message: string;
  severity: 'missing' | 'warning';
};

export type AnnualBillExtractionResult = {
  input: AnnualBillInput;
  raw: AnnualBillRawExtract;
  textPreview: string;
  issues: AnnualBillValidationIssue[];
};

export type AnnualBillExtract = AnnualBillExtractionResult;
