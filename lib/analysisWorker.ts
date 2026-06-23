import type { AnalysisResult } from './analysis';
import type { AnalysisJobProgress, AnalysisJobRecord, PersistedAnalyzeInput } from './analysisJobTypes';
import { buildAnnualBillIndicativeAnalysis } from './annualBillAdvice';
import { getAnalysisJobStore } from './analysisJobStore';
import { compactAnalysisResult } from './analysisResultSerialization';
import { runAnalysis } from './clientAnalysis';
import { mapRows } from './parsing';
import { storeAnalysisResult } from './serverDataStore';

const POLL_INTERVAL_MS = 5000;

type ProgressReporter = (progress: AnalysisJobProgress) => Promise<void>;

const globalWorkerState = globalThis as typeof globalThis & {
  __kwartierAnalysisWorker?: {
    started: boolean;
    running: boolean;
    timer?: NodeJS.Timeout;
  };
};

function getWorkerState() {
  globalWorkerState.__kwartierAnalysisWorker ??= {
    started: false,
    running: false
  };
  return globalWorkerState.__kwartierAnalysisWorker;
}

function elapsedMs(start: number): number {
  return Math.round(performance.now() - start);
}

function serializeError(error: unknown): { message: string; details: string } {
  if (error instanceof Error) {
    return {
      message: error.message,
      details: error.stack ?? error.message
    };
  }

  return {
    message: 'Onbekende serverfout tijdens analyse.',
    details: String(error)
  };
}

function logAnalyze(jobId: string, message: string, extra?: Record<string, unknown>): void {
  if (extra) {
    console.log(`[analyze] job=${jobId} ${message}`, extra);
    return;
  }
  console.log(`[analyze] job=${jobId} ${message}`);
}

async function timedStep<T>(
  jobId: string,
  label: string,
  progress: AnalysisJobProgress,
  reportProgress: ProgressReporter,
  run: () => T | Promise<T>
): Promise<T> {
  await reportProgress(progress);
  const start = performance.now();
  logAnalyze(jobId, `${label} started`);
  try {
    const result = await run();
    logAnalyze(jobId, `${label} completed`, { durationMs: elapsedMs(start) });
    return result;
  } catch (error) {
    logAnalyze(jobId, `${label} failed`, { durationMs: elapsedMs(start), error: serializeError(error).details });
    throw error;
  }
}

async function executeAnalysisJob(job: AnalysisJobRecord): Promise<AnalysisResult & { analysisId: string }> {
  const totalStart = performance.now();
  const store = getAnalysisJobStore();
  const reportProgress: ProgressReporter = async (progress) => {
    await store.updateJob(job.jobId, progress);
  };

  const input: PersistedAnalyzeInput = job.input;
  logAnalyze(job.jobId, 'processing accepted input', {
    hasRows: Array.isArray(input.rows),
    rowCount: input.rows?.length ?? 0,
    analysisType: input.settings.analysisType
  });

  const result = await timedStep(
    job.jobId,
    'generate advice',
    { progress: 15, currentStep: 'Analyse voorbereiden' },
    reportProgress,
    async () => {
      if (input.settings.analysisType === 'PV_SELF_CONSUMPTION' && input.settings.pvInputMode !== 'intervalData') {
        if (!input.annualBillInput) {
          throw new Error('Vul eerst de jaarnota-gegevens in.');
        }

        const annualResult = buildAnnualBillIndicativeAnalysis(input.annualBillInput, input.settings);
        if (!annualResult) {
          throw new Error('Voor indicatief jaarnota-advies zijn minimaal totaal verbruik en totale teruglevering nodig.');
        }
        return annualResult;
      }

      if (!Array.isArray(input.rows) || !input.mapping) {
        throw new Error('Ongeldige analyse-aanvraag.');
      }

      const rows = input.rows;
      const mapping = input.mapping;
      const mappedRows = await timedStep(
        job.jobId,
        'preprocess quarter-hour rows',
        { progress: 30, currentStep: 'Data verwerken en kwartieren voorbereiden' },
        reportProgress,
        () => mapRows(rows, mapping)
      );

      const analysis = await timedStep(
        job.jobId,
        'run calculations and simulations',
        { progress: 55, currentStep: "Batterijscenario's doorrekenen" },
        reportProgress,
        () => runAnalysis(mappedRows, input.settings)
      );

      if (!analysis) {
        throw new Error('Geen bruikbare rijen na normalisatie of filtering.');
      }

      return analysis;
    }
  );

  await timedStep(
    job.jobId,
    'store in-process analysis result',
    { progress: 82, currentStep: 'Resultaat opslaan' },
    reportProgress,
    () => storeAnalysisResult(result)
  );

  const compactResult = await timedStep(
    job.jobId,
    'prepare response payload',
    { progress: 92, currentStep: 'Advies samenstellen' },
    reportProgress,
    () => compactAnalysisResult(result, job.jobId)
  );

  logAnalyze(job.jobId, 'completed', { totalDurationMs: elapsedMs(totalStart) });
  return compactResult;
}

async function processOneAnalysisJob(): Promise<boolean> {
  const store = getAnalysisJobStore();
  const claimed = await store.claimNextJob();
  if (!claimed) return false;

  const { job, release } = claimed;
  const totalStart = performance.now();
  logAnalyze(job.jobId, 'worker claimed job', { attempts: job.attempts });

  try {
    const result = await executeAnalysisJob(job);
    await store.updateJob(job.jobId, {
      status: 'completed',
      progress: 100,
      currentStep: 'Analyse voltooid',
      result,
      completedAt: new Date().toISOString(),
      lockedUntil: undefined
    });
    logAnalyze(job.jobId, 'job marked completed', { totalDurationMs: elapsedMs(totalStart) });
  } catch (error) {
    const serialized = serializeError(error);
    await store.updateJob(job.jobId, {
      status: 'failed',
      progress: 100,
      currentStep: 'Analyse mislukt',
      error: serialized.message,
      errorDetails: serialized.details,
      failedAt: new Date().toISOString(),
      lockedUntil: undefined
    });
    console.error(`[analyze] job=${job.jobId} job failed`, serialized.details);
  } finally {
    await release();
  }

  return true;
}

export async function processAnalysisQueueOnce(): Promise<void> {
  const state = getWorkerState();
  if (state.running) return;

  state.running = true;
  try {
    while (await processOneAnalysisJob()) {
      // Keep draining queued work without waiting for the next timer tick.
    }
  } finally {
    state.running = false;
  }
}

export function ensureAnalysisWorkerStarted(): void {
  if (process.env.ANALYSIS_WORKER_DISABLE_IN_PROCESS === 'true' && process.env.ANALYSIS_WORKER_ROLE !== 'worker') {
    return;
  }

  const state = getWorkerState();
  if (state.started) {
    setTimeout(() => {
      void processAnalysisQueueOnce();
    }, 0);
    return;
  }

  state.started = true;
  state.timer = setInterval(() => {
    void processAnalysisQueueOnce();
  }, POLL_INTERVAL_MS);
  state.timer.unref?.();

  setTimeout(() => {
    void processAnalysisQueueOnce();
  }, 0);
}

export function stopAnalysisWorkerForTests(): void {
  const state = getWorkerState();
  if (state.timer) clearInterval(state.timer);
  state.started = false;
  state.running = false;
  state.timer = undefined;
}
