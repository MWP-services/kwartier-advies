import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as startAnalyze } from '@/app/api/analyze/route';
import { GET as getAnalyzeHealth } from '@/app/api/analyze/health/route';
import { GET as getAnalyzeStatus } from '@/app/api/analyze/status/route';
import { defaultAnalysisSettings } from '@/lib/analysis';
import { FileAnalysisJobStore, WORKER_HEARTBEAT_FILE, setAnalysisJobStoreForTests } from '@/lib/analysisJobStore';
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

  it('removes stale locks before claiming queued jobs', async () => {
    const job = await store.createJob(input);
    const lockPath = path.join(tempDir, `${job.jobId}.lock`);
    await mkdir(lockPath);
    const staleTime = new Date(Date.now() - 31 * 60 * 1000);
    await utimes(lockPath, staleTime, staleTime);

    const claim = await store.claimNextJob();

    expect(claim?.job.jobId).toBe(job.jobId);
    expect(claim?.job.status).toBe('processing');
    await claim?.release();
  });

  it('does not claim queued jobs with a recent lock', async () => {
    const job = await store.createJob(input);
    await mkdir(path.join(tempDir, `${job.jobId}.lock`));

    const claim = await store.claimNextJob();

    expect(claim).toBeNull();
  });

  it('releases a newly-created lock when claiming fails before processing starts', async () => {
    const job = await store.createJob(input);
    const originalUpdateJob = store.updateJob.bind(store);
    store.updateJob = async (...args) => {
      const [, patch] = args;
      if (patch.status === 'processing') {
        throw new Error('simulated write failure');
      }
      return originalUpdateJob(...args);
    };

    await expect(store.claimNextJob()).rejects.toThrow('simulated write failure');
    await expect(stat(path.join(tempDir, `${job.jobId}.lock`))).rejects.toMatchObject({ code: 'ENOENT' });

    store.updateJob = originalUpdateJob;
  });

  it('reclaims stale processing jobs', async () => {
    const job = await store.createJob(input);
    const claim = await store.claimNextJob();
    expect(claim?.job.status).toBe('processing');
    const staleTime = new Date(Date.now() - 31 * 60 * 1000);
    await utimes(path.join(tempDir, `${job.jobId}.lock`), staleTime, staleTime);
    await store.updateJob(job.jobId, {
      status: 'processing',
      lockedUntil: new Date(Date.now() - 1000).toISOString()
    });

    const staleClaim = await store.claimNextJob();

    expect(staleClaim?.job.jobId).toBe(job.jobId);
    expect(staleClaim?.job.attempts).toBe(2);
    await staleClaim?.release();
  });

  it('skips completed and failed jobs when claiming', async () => {
    const completed = await store.createJob(input);
    const failed = await store.createJob(input);
    await store.updateJob(completed.jobId, { status: 'completed', progress: 100 });
    await store.updateJob(failed.jobId, { status: 'failed', progress: 100, error: 'Boom' });

    const claim = await store.claimNextJob();

    expect(claim).toBeNull();
  });

  it('releases the lock after completing a job', async () => {
    const job = await store.createJob(input);

    await processAnalysisQueueOnce();
    const claim = await store.claimNextJob();

    expect(claim).toBeNull();
    await mkdir(path.join(tempDir, `${job.jobId}.lock`));
  });

  it('reports a recent worker heartbeat as healthy', async () => {
    await store.writeWorkerHeartbeat({
      timestamp: new Date().toISOString(),
      pid: 123,
      workerRole: 'worker',
      jobStoreDir: tempDir
    });

    const response = await getAnalyzeHealth();
    const payload = await readJson<{ healthy: boolean; workerStatus: string; jobStoreDir: string; ageMs: number }>(response);

    expect(response.status).toBe(200);
    expect(payload.healthy).toBe(true);
    expect(payload.workerStatus).toBe('online');
    expect(payload.jobStoreDir).toBe(tempDir);
    expect(payload.ageMs).toBeGreaterThanOrEqual(0);
  });

  it('reports a missing worker heartbeat as unhealthy', async () => {
    const response = await getAnalyzeHealth();
    const payload = await readJson<{ healthy: boolean; workerStatus: string }>(response);

    expect(response.status).toBe(503);
    expect(payload.healthy).toBe(false);
    expect(payload.workerStatus).toBe('offline');
  });

  it('reports an expired worker heartbeat as unhealthy', async () => {
    await store.writeWorkerHeartbeat({
      timestamp: new Date(Date.now() - 60_000).toISOString(),
      pid: 123,
      workerRole: 'worker',
      jobStoreDir: tempDir
    });

    const response = await getAnalyzeHealth();
    const payload = await readJson<{ healthy: boolean; workerStatus: string; ageMs: number }>(response);

    expect(response.status).toBe(503);
    expect(payload.healthy).toBe(false);
    expect(payload.workerStatus).toBe('offline');
    expect(payload.ageMs).toBeGreaterThanOrEqual(45_000);
  });

  it('reports a corrupt worker heartbeat as unhealthy', async () => {
    await writeFile(path.join(tempDir, WORKER_HEARTBEAT_FILE), '{bad json', 'utf8');

    const response = await getAnalyzeHealth();
    const payload = await readJson<{ healthy: boolean; workerStatus: string }>(response);

    expect(response.status).toBe(503);
    expect(payload.healthy).toBe(false);
    expect(payload.workerStatus).toBe('offline');
  });
});
