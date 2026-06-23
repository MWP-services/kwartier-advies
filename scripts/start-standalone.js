const { spawn } = require('node:child_process');

let shuttingDown = false;
let worker = null;

function startWorker() {
  worker = spawn(process.execPath, ['.worker-build/worker/analysis-worker.js'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      ANALYSIS_WORKER_ROLE: 'worker'
    }
  });

  worker.on('exit', (code, signal) => {
    console.error(`[analyze-worker] exited code=${code ?? 'null'} signal=${signal ?? 'null'}`);
    if (!shuttingDown) {
      setTimeout(startWorker, 5000);
    }
  });
}

function stop(signal) {
  shuttingDown = true;
  worker?.kill(signal);
  process.exit(0);
}

process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));

process.env.ANALYSIS_WORKER_DISABLE_IN_PROCESS = 'true';
startWorker();
require('./server.js');
