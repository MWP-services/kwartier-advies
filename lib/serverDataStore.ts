import type { AnalysisResult } from './analysis';

interface UploadedDataset {
  rows: Record<string, unknown>[];
  headers: string[];
  fileName: string;
  createdAt: number;
}

interface StoredAnalysis {
  result: AnalysisResult;
  createdAt: number;
}

const TTL_MS = 2 * 60 * 60 * 1000;

const globalStore = globalThis as typeof globalThis & {
  __kwartierUploads?: Map<string, UploadedDataset>;
  __kwartierAnalyses?: Map<string, StoredAnalysis>;
};

const uploads = globalStore.__kwartierUploads ?? new Map<string, UploadedDataset>();
const analyses = globalStore.__kwartierAnalyses ?? new Map<string, StoredAnalysis>();

globalStore.__kwartierUploads = uploads;
globalStore.__kwartierAnalyses = analyses;

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function purgeExpired(): void {
  const cutoff = Date.now() - TTL_MS;
  uploads.forEach((value, key) => {
    if (value.createdAt < cutoff) uploads.delete(key);
  });
  analyses.forEach((value, key) => {
    if (value.createdAt < cutoff) analyses.delete(key);
  });
}

export function storeUploadedDataset(input: Omit<UploadedDataset, 'createdAt'>): string {
  purgeExpired();
  const id = createId('upload');
  uploads.set(id, { ...input, createdAt: Date.now() });
  return id;
}

export function getUploadedDataset(id: string): UploadedDataset | null {
  purgeExpired();
  return uploads.get(id) ?? null;
}

export function storeAnalysisResult(result: AnalysisResult): string {
  purgeExpired();
  const id = createId('analysis');
  analyses.set(id, { result, createdAt: Date.now() });
  return id;
}

export function getAnalysisResult(id: string): AnalysisResult | null {
  purgeExpired();
  return analyses.get(id)?.result ?? null;
}

