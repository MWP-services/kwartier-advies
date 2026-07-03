import { mkdtemp, mkdir, cp, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const rootDir = process.cwd();
const bundleArgIndex = process.argv.indexOf('--bundle');
const bundlePath = path.resolve(
  bundleArgIndex >= 0 && process.argv[bundleArgIndex + 1]
    ? process.argv[bundleArgIndex + 1]
    : path.join(rootDir, '.worker-build', 'worker', 'analysis-worker.js')
);
const timeoutMs = 15_000;

function fail(message) {
  console.error(`[smoke-worker] ${message}`);
  process.exit(1);
}

async function assertNoExternalPackageRequire(bundle) {
  const content = await readFile(bundle, 'utf8');
  const forbidden = [
    /require\(["']papaparse["']\)/,
    /require\(["']xlsx["']\)/
  ];

  for (const pattern of forbidden) {
    if (pattern.test(content)) {
      fail(`bundle still contains unresolved external require: ${pattern}`);
    }
  }
}

async function main() {
  if (!existsSync(bundlePath)) {
    fail(`worker bundle missing: ${bundlePath}`);
  }

  await assertNoExternalPackageRequire(bundlePath);

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'kwartier-worker-smoke-'));
  const isolatedBundle = path.join(tempDir, '.worker-build', 'worker', 'analysis-worker.js');
  const isolatedMap = `${isolatedBundle}.map`;
  const sourceMap = `${bundlePath}.map`;

  await mkdir(path.dirname(isolatedBundle), { recursive: true });
  await cp(bundlePath, isolatedBundle);
  if (existsSync(sourceMap)) {
    await cp(sourceMap, isolatedMap);
  }

  let output = '';
  let settled = false;
  const child = spawn(process.execPath, [isolatedBundle], {
    cwd: tempDir,
    env: {
      ...process.env,
      ANALYSIS_WORKER_ROLE: 'worker',
      ANALYSIS_JOB_STORE_DIR: path.join(tempDir, 'jobs')
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const cleanup = async () => {
    child.kill('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 500));
    child.kill('SIGKILL');
    await rm(tempDir, { recursive: true, force: true });
  };

  const timer = setTimeout(async () => {
    if (settled) return;
    settled = true;
    await cleanup();
    fail(`worker did not become ready within ${timeoutMs}ms\n${output}`);
  }, timeoutMs);

  const handleChunk = async (chunk) => {
    output += chunk.toString();

    if (/MODULE_NOT_FOUND/.test(output) || /Cannot find module/.test(output)) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      await cleanup();
      fail(`worker failed with missing module\n${output}`);
    }

    if (/\[analyze-worker\] ready/.test(output)) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      await cleanup();
      console.log('[smoke-worker] worker bundle starts in isolated directory');
      console.log(`[smoke-worker] bundle=${bundlePath}`);
    }
  };

  child.stdout.on('data', (chunk) => {
    void handleChunk(chunk);
  });
  child.stderr.on('data', (chunk) => {
    void handleChunk(chunk);
  });
  child.on('exit', async (code, signal) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    await cleanup();
    fail(`worker exited before startup code=${code ?? 'null'} signal=${signal ?? 'null'}\n${output}`);
  });
  child.on('error', async (error) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    await cleanup();
    fail(`worker failed to spawn: ${error.message}`);
  });
}

main().catch((error) => {
  console.error('[smoke-worker] unexpected failure', error);
  process.exit(1);
});
