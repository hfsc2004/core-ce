'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { updateConversionTools } = require('./binary-manager-llamacpp-worker');

function workerFixture(t, code) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'psf-update-worker-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'worker.js');
  fs.writeFileSync(filename, code);
  return filename;
}

test('synchronous build work runs off the main event loop and forwards progress/results', async t => {
  const workerPath = workerFixture(t, `
const { parentPort, workerData } = require('worker_threads');
parentPort.postMessage({ type: 'progress', message: 'Building conversion tools…' });
const stop = Date.now() + 250;
while (Date.now() < stop) {} // Simulate the established synchronous CMake build.
parentPort.postMessage({ type: 'result', result: { success: true, appDir: workerData.appDir } });
`);
  const progress = [];
  let ticks = 0;
  const timer = setInterval(() => ticks++, 10);
  try {
    const result = await updateConversionTools('/tmp/launcher', message => progress.push(message), { workerPath });
    assert.equal(result.success, true);
    assert.equal(result.appDir, '/tmp/launcher');
    assert.deepEqual(progress, ['Building conversion tools…']);
    assert.ok(ticks >= 5, 'Main event loop must stay responsive during synchronous worker work');
  } finally { clearInterval(timer); }
});

test('worker failure is surfaced instead of leaving the editor waiting indefinitely', async t => {
  const workerPath = workerFixture(t, "throw new Error('Fixture build worker failed');");
  await assert.rejects(updateConversionTools('/tmp/launcher', () => {}, { workerPath }), /Fixture build worker failed/);
});

test('worker exit without a result is surfaced as an update failure', async t => {
  const workerPath = workerFixture(t, 'process.exit(1);');
  await assert.rejects(updateConversionTools('/tmp/launcher', () => {}, { workerPath }), /exited 1 without a result/);
});
