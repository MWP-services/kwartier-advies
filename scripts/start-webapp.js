const { existsSync } = require('node:fs');
const { spawn } = require('node:child_process');
const path = require('node:path');

const workerEntry = path.join(process.cwd(), '.worker-build', 'worker', 'analysis-worker.js');
const standaloneServerEntries = [
  path.join(process.cwd(), 'server.js'),
  path.join(process.cwd(), '.next', 'standalone', 'server.js')
];
const port = String(process.env.PORT || 8080);
const maxWorkerRestarts = 3;

let shuttingDown = false;
let worker = null;
let server = null;
let workerRestartCount = 0;

function failAfterWorkerProblem(message, error) {
  if (error) {
    console.error(message, error);
  } else {
    console.error(message);
  }

  workerRestartCount += 1;
  if (workerRestartCount > maxWorkerRestarts) {
    console.error(`[webapp] analysis worker failed after ${maxWorkerRestarts} restart attempts; stopping web app`);
    shutdownChildren('SIGTERM');
    process.exit(1);
  }

  const backoffMs = Math.min(30_000, 1000 * 2 ** (workerRestartCount - 1));
  console.error(`[webapp] restarting analysis worker in ${backoffMs}ms`);
  setTimeout(() => {
    if (!shuttingDown) startWorker();
  }, backoffMs);
}

function startWorker() {
  if (!existsSync(workerEntry)) {
    console.error(`[webapp] analysis worker build missing: ${workerEntry}`);
    console.error('[webapp] run npm run build before starting the Azure Web App package');
    process.exit(1);
  }

  console.log('[webapp] starting analysis worker', { workerEntry });
  worker = spawn(process.execPath, [workerEntry], {
    stdio: 'inherit',
    env: {
      ...process.env,
      ANALYSIS_WORKER_ROLE: 'worker'
    }
  });

  worker.on('exit', (code, signal) => {
    if (shuttingDown) return;

    failAfterWorkerProblem(`[webapp] analysis worker exited unexpectedly code=${code ?? 'null'} signal=${signal ?? 'null'}`);
  });

  worker.on('error', (error) => {
    if (shuttingDown) return;
    failAfterWorkerProblem('[webapp] failed to start analysis worker', error);
  });
}

function startServer() {
  console.log('[webapp] starting Next.js', { host: '0.0.0.0', port });

  const standaloneServerEntry = standaloneServerEntries.find((entry) => existsSync(entry));
  const serverArgs = standaloneServerEntry
    ? [standaloneServerEntry]
    : [require.resolve('next/dist/bin/next'), 'start', '-H', '0.0.0.0', '-p', port];
  const serverCwd = standaloneServerEntry ? path.dirname(standaloneServerEntry) : process.cwd();

  server = spawn(process.execPath, serverArgs, {
    cwd: serverCwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      HOSTNAME: '0.0.0.0',
      PORT: port,
      ANALYSIS_WORKER_DISABLE_IN_PROCESS: 'true'
    }
  });

  server.on('exit', (code, signal) => {
    if (!shuttingDown) {
      console.error(`[web] exited code=${code ?? 'null'} signal=${signal ?? 'null'}`);
      shutdownChildren('SIGTERM');
    }
    process.exit(code ?? 0);
  });

  server.on('error', (error) => {
    console.error('[webapp] failed to start Next.js', error);
    shutdownChildren('SIGTERM');
    process.exit(1);
  });
}

function shutdownChildren(signal) {
  worker?.kill(signal);
  server?.kill(signal);
}

function stop(signal) {
  shuttingDown = true;
  shutdownChildren(signal);
  setTimeout(() => process.exit(0), 10_000).unref?.();
}

process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));

startWorker();
startServer();
