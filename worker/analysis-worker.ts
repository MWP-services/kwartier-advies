import { ensureAnalysisWorkerStarted } from '../lib/analysisWorker';

console.log('[analyze-worker] starting');
ensureAnalysisWorkerStarted();

process.on('SIGTERM', () => {
  console.log('[analyze-worker] received SIGTERM');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[analyze-worker] received SIGINT');
  process.exit(0);
});

setInterval(() => {
  // Keep the worker process alive; the real polling timer lives in analysisWorker.
}, 60_000);
