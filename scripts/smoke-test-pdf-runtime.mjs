import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { createServer } from 'node:net';
import { PDFDocument, StandardFonts } from 'pdf-lib';

// Copy outside the repository: missing dependencies must not resolve from local node_modules.
const source = resolve(process.argv.includes('--standalone') ? process.argv[process.argv.indexOf('--standalone') + 1] : '.next/standalone');
const root = await mkdtemp(join(tmpdir(), 'annual-pdf-smoke-'));
const env = { ...process.env, NODE_ENV: 'production', OPENAI_API_KEY: '', NODE_PATH: '', HOSTNAME: '127.0.0.1' };
let server;
let exited;
let output = '';
try {
  await cp(source, root, { recursive: true, dereference: true });
  await writeFile(join(root, 'native-probe.cjs'), `
    const assert = require('node:assert/strict');
    for (const name of ['@napi-rs/canvas', 'sharp']) {
      assert(require.resolve(name).startsWith(__dirname + require('node:path').sep));
    }
    assert.equal(typeof require('@napi-rs/canvas').DOMMatrix, 'function');
    require('sharp')({create:{width:1,height:1,channels:3,background:'white'}})
      .png().toBuffer().then(() => console.log('Native canvas and sharp OK'))
      .catch(error => { console.error(error); process.exitCode = 1; });
  `);
  const probe = spawn(process.execPath, ['native-probe.cjs'], { cwd: root, env, stdio: 'inherit', windowsHide: true });
  assert.equal((await once(probe, 'exit'))[0], 0, 'Standalone native dependencies failed');
  const portProbe = createServer();
  portProbe.listen(0, '127.0.0.1');
  await once(portProbe, 'listening');
  const port = portProbe.address().port;
  await new Promise((resolveClose) => portProbe.close(resolveClose));
  server = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...env, PORT: String(port) }, windowsHide: true });
  exited = once(server, 'exit');
  for (const stream of [server.stdout, server.stderr]) stream.on('data', data => { output = (output + data).slice(-24000); });
  const url = `http://127.0.0.1:${port}/api/annual-bill/extract`;
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    try { await fetch(url, { signal: AbortSignal.timeout(3000) }); ready = true; break; } catch {}
    if (server.exitCode !== null) throw new Error('Standalone server exited');
    await new Promise(resolveWait => setTimeout(resolveWait, 500));
  }
  assert(ready, 'Standalone server startup timed out');
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage().drawText('Jaarnota rooktest - Verbruik 3500 kWh', { font, size: 16 });
  for (const [bytes, expected] of [[await pdf.save(), 200], [Buffer.from('%PDF-1.7\ninvalid'), 500]]) {
    const body = new FormData();
    body.set('file', new Blob([bytes], { type: 'application/pdf' }), 'smoke.pdf');
    const response = await fetch(url, { method: 'POST', body, signal: AbortSignal.timeout(60000) });
    assert.equal(response.status, expected);
    assert.match(response.headers.get('content-type'), /application\/json/);
    const result = await response.json();
    if (expected === 200) {
      assert.match(result.textPreview, /Jaarnota rooktest/);
      assert(result.diagnostics.textLength > 0);
    } else assert.equal(typeof result.error, 'string');
  }
  assert(!/DOMMatrix is not defined|Cannot load "@napi-rs\/canvas"|Cannot find module '@napi-rs\/canvas'|'sharp' is required/.test(output), output);
  console.log('Standalone PDF extraction OK; invalid PDF returns JSON 500.');
} catch (error) {
  console.error(output);
  throw error;
} finally {
  if (server && server.exitCode === null) { server.kill(); await exited; }
  // Only remove the absolute temporary directory allocated above, never the supplied source.
  assert.equal(dirname(root), resolve(tmpdir()));
  assert(root.startsWith(join(resolve(tmpdir()), 'annual-pdf-smoke-')));
  await rm(root, { recursive: true, force: true });
}
