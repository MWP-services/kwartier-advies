import { describe, expect, it } from 'vitest';
import { pollAnalysisJob } from '@/lib/analysisJobClient';
import type { AnalysisJobStatusResponse } from '@/lib/analysisJobTypes';

describe('pollAnalysisJob', () => {
  it('stops polling when a job completes', async () => {
    const statuses: AnalysisJobStatusResponse[] = [
      { jobId: 'analysis_x', status: 'queued', progress: 0, currentStep: 'Queued' },
      { jobId: 'analysis_x', status: 'processing', progress: 50, currentStep: 'Processing' },
      {
        jobId: 'analysis_x',
        status: 'completed',
        progress: 100,
        currentStep: 'Done',
        result: {} as never
      }
    ];
    const seen: string[] = [];

    const final = await pollAnalysisJob({
      jobId: 'analysis_x',
      fetchStatus: async () => statuses.shift() as AnalysisJobStatusResponse,
      wait: async () => undefined,
      onStatus: (status) => seen.push(status.status)
    });

    expect(final.status).toBe('completed');
    expect(seen).toEqual(['queued', 'processing', 'completed']);
  });

  it('stops polling when a job fails', async () => {
    const statuses: AnalysisJobStatusResponse[] = [
      { jobId: 'analysis_x', status: 'processing', progress: 50, currentStep: 'Processing' },
      { jobId: 'analysis_x', status: 'failed', progress: 100, currentStep: 'Failed', error: 'Boom' }
    ];

    const final = await pollAnalysisJob({
      jobId: 'analysis_x',
      fetchStatus: async () => statuses.shift() as AnalysisJobStatusResponse,
      wait: async () => undefined
    });

    expect(final.status).toBe('failed');
  });

  it('cleans up polling when aborted', async () => {
    const controller = new AbortController();
    let waitCalled = false;

    await expect(
      pollAnalysisJob({
        jobId: 'analysis_x',
        signal: controller.signal,
        fetchStatus: async () => ({ jobId: 'analysis_x', status: 'queued', progress: 0, currentStep: 'Queued' }),
        wait: async (_milliseconds, signal) => {
          waitCalled = true;
          controller.abort();
          if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        }
      })
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(waitCalled).toBe(true);
  });
});
