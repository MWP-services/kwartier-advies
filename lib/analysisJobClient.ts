import type { AnalysisJobStatusResponse } from './analysisJobTypes';

type TerminalAnalysisJobStatus = Extract<AnalysisJobStatusResponse, { status: 'completed' | 'failed' }>;

export interface PollAnalysisJobOptions {
  jobId: string;
  signal?: AbortSignal;
  intervalMs?: number;
  maxQueuedMs?: number;
  maxTotalMs?: number;
  fetchStatus?: (jobId: string, signal?: AbortSignal) => Promise<AnalysisJobStatusResponse>;
  wait?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  onStatus?: (status: AnalysisJobStatusResponse) => void;
  now?: () => number;
}

export async function fetchAnalysisJobStatus(
  jobId: string,
  signal?: AbortSignal
): Promise<AnalysisJobStatusResponse> {
  const response = await fetch(`/api/analyze/status?jobId=${encodeURIComponent(jobId)}`, { signal });
  const payload = (await response.json()) as AnalysisJobStatusResponse | { error?: string };

  if (!response.ok) {
    throw new Error('error' in payload && payload.error ? payload.error : `Status ophalen mislukt (${response.status})`);
  }

  return payload as AnalysisJobStatusResponse;
}

export function waitForNextPoll(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Polling afgebroken.', 'AbortError'));
      return;
    }

    const timeout = window.setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timeout);
        reject(new DOMException('Polling afgebroken.', 'AbortError'));
      },
      { once: true }
    );
  });
}

export async function pollAnalysisJob({
  jobId,
  signal,
  intervalMs = 2500,
  maxQueuedMs = 5 * 60 * 1000,
  maxTotalMs = 20 * 60 * 1000,
  fetchStatus = fetchAnalysisJobStatus,
  wait = waitForNextPoll,
  onStatus,
  now = Date.now
}: PollAnalysisJobOptions): Promise<TerminalAnalysisJobStatus> {
  const startedAt = now();
  let queuedSince: number | null = null;

  while (true) {
    const status = await fetchStatus(jobId, signal);
    onStatus?.(status);

    if (status.status === 'completed' || status.status === 'failed') {
      return status;
    }

    const checkedAt = now();
    if (checkedAt - startedAt >= maxTotalMs) {
      throw new Error('Analyse duurt te lang. Controleer of de worker draait en probeer het opnieuw.');
    }

    if (status.status === 'queued') {
      queuedSince ??= checkedAt;
      if (checkedAt - queuedSince >= maxQueuedMs) {
        throw new Error('Analyse blijft in de wachtrij. De worker lijkt niet te draaien of pakt geen jobs op.');
      }
    } else {
      queuedSince = null;
    }

    await wait(intervalMs, signal);
  }
}
