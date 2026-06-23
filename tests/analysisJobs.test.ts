import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as startAnalyze } from '@/app/api/analyze/route';
import { GET as getAnalyzeStatus } from '@/app/api/analyze/status/route';
import { defaultAnalysisSettings } from '@/lib/analysis';
import { FileAnalysisJobStore, setAnalysisJobStoreForTests } from '@/lib/analysisJobStore';
import { processAnalysisQueueOnce, stopAnalysisWorkerForTests } from '@/lib/analysisWorker';

const settings = {
  ...defaultAnalysisSettings,
  interpretationMode: 'INTERVAL' as const
};

const input = {
  rows: [
    { timestamp: '2024-01-01T00:00:00.000Z', consumption_kwh: 120 },
    { timestamp: '2024-01-01T00:15:00.000Z', consumption_kwh: 160 }
  ],
  mapping: {
    timestamp: 'timestamp',
    consumptionKwh: 'consumption_kwh'
  },
  settings
};

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe('analysis jobs', () => {
  let tempDir: string;
  let store: FileAnalysisJobStore;
  let previousDisableWorker: string | undefined;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'kwartier-analysis-jobs-'));
    store = new FileAnalysisJobStore(tempDir);
    setAnalysisJobStoreForTests(store);
    stopAnalysisWorkerForTests();
    previousDisableWorker = process.env.ANALYSIS_WORKER_DISABLE_IN_PROCESS;
    process.env.ANALYSIS_WORKER_DISABLE_IN_PROCESS = 'true';
  });

  afterEach(async () => {
    setAnalysisJobStoreForTests(null);
    stopAnalysisWorkerForTests();
    if (previousDisableWorker == null) {
      delete process.env.ANALYSIS_WORKER_DISABLE_IN_PROCESS;
    } else {
      process.env.ANALYSIS_WORKER_DISABLE_IN_PROCESS = previousDisableWorker;
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  it('starts an analysis job with 202 Accepted and queued status', async () => {
    const response = await startAnalyze(
      new Request('http://localhost/api/analyze', {
        method: 'POST',
        body: JSON.stringify(input)
      })
    );

    expect(response.status).toBe(202);
    const payload = await readJson<{ jobId: string; status: string; progress: number }>(response);
    expect(payload.jobId).toMatch(/^analysis_[a-f0-9]{32}$/);
    expect(payload.status).toBe('queued');

    const statusResponse = await getAnalyzeStatus(new Request(`http://localhost/api/analyze/status?jobId=${payload.jobId}`));
    expect(statusResponse.status).toBe(200);
    const statusPayload = await readJson<{ status: string }>(statusResponse);
    expect(statusPayload.status).toBe('queued');
  });

  it('returns 404 for an unknown job id', async () => {
    const response = await getAnalyzeStatus(
      new Request('http://localhost/api/analyze/status?jobId=analysis_00000000000000000000000000000000')
    );

    expect(response.status).toBe(404);
  });

  it('moves a queued job through processing to completed', async () => {
    const job = await store.createJob(input);

    await processAnalysisQueueOnce();

    const completed = await store.getJob(job.jobId);
    expect(completed?.status).toBe('completed');
    expect(completed?.progress).toBe(100);
    expect(completed?.result?.analysisId).toBe(job.jobId);
  });

  it('marks failed jobs with a user-safe error', async () => {
    const job = await store.createJob({
      ...input,
      rows: [{ timestamp: 'bad', consumption_kwh: 'bad' }]
    });

    await processAnalysisQueueOnce();

    const failed = await store.getJob(job.jobId);
    expect(failed?.status).toBe('failed');
    expect(failed?.error).toBeTruthy();
    expect(failed?.errorDetails).toBeTruthy();
  });

  it('does not claim the same queued job twice while locked', async () => {
    await store.createJob(input);

    const firstClaim = await store.claimNextJob();
    const secondClaim = await store.claimNextJob();

    expect(firstClaim?.job.status).toBe('processing');
    expect(secondClaim).toBeNull();
    await firstClaim?.release();
  });
});
