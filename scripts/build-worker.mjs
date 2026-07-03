import { rm } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(rootDir, '.worker-build');
const outfile = path.join(outDir, 'worker', 'analysis-worker.js');

const nodeBuiltins = [
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`)
];

try {
  await rm(outDir, { recursive: true, force: true });

  await esbuild.build({
    entryPoints: [path.join(rootDir, 'worker', 'analysis-worker.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    packages: 'bundle',
    external: nodeBuiltins,
    sourcemap: true,
    logLevel: 'info'
  });
} catch (error) {
  console.error('[build-worker] failed', error);
  process.exit(1);
}
