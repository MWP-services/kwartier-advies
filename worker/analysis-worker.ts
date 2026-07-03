import {
  ANALYSIS_WORKER_HEARTBEAT_INTERVAL_MS,
  ANALYSIS_WORKER_POLL_INTERVAL_MS,
  ensureAnalysisWorkerHeartbeatStarted,
  ensureAnalysisWorkerStarted,
  writeAnalysisWorkerHeartbeat
} from '../lib/analysisWorker';
import { resolveAnalysisJobStoreDir } from '../lib/analysisJobStore';

function logStartup(): void {
  console.log('[analyze-worker] starting', {
    pid: process.pid,
    workerRole: process.env.ANALYSIS_WORKER_ROLE ?? 'unknown',
    jobStoreDir: resolveAnalysisJobStoreDir(),
    pollIntervalMs: ANALYSIS_WORKER_POLL_INTERVAL_MS,
    heartbeatIntervalMs: ANALYSIS_WORKER_HEARTBEAT_INTERVAL_MS
  });
}

process.on('uncaughtException', (error) => {
  console.error('[analyze-worker] uncaughtException', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[analyze-worker] unhandledRejection', reason);
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('[analyze-worker] received SIGTERM');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[analyze-worker] received SIGINT');
  process.exit(0);
});

logStartup();
ensureAnalysisWorkerStarted();
ensureAnalysisWorkerHeartbeatStarted();
void writeAnalysisWorkerHeartbeat()
  .then(() => {
    console.log('[analyze-worker] ready', {
      pid: process.pid,
      jobStoreDir: resolveAnalysisJobStoreDir()
    });
  })
  .catch((error) => {
    console.error('[analyze-worker] startup heartbeat failed', error);
    process.exit(1);
  });

setInterval(() => {
  // Keep the worker process alive; the real polling timer lives in analysisWorker.
}, 60_000);
