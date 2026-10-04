'use strict';
const { isMainThread, parentPort, workerData, Worker } = require('worker_threads');

// The established builder performs filesystem copies and synchronous preflight
// probes. Keep all of that off Electron's main thread, including tool updates.
function updateConversionTools(appDir, emit, { workerPath = __filename } = {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, { workerData: { appDir } });
    const started = Date.now();
    let lastProgress = started, stage = 'Starting conversion tool update…', settled = false;
    const heartbeat = setInterval(() => {
      if (Date.now() - lastProgress >= 10000) {
        const minutes = Math.floor((Date.now() - started) / 60000);
        const seconds = Math.floor((Date.now() - started) / 1000) % 60;
        emit(`${stage}\nUpdate is running (${minutes}m ${seconds}s elapsed). First builds can take tens of minutes.`);
      }
    }, 1000);
    const cleanup = () => clearInterval(heartbeat);
    worker.on('message', message => {
      if (message.type === 'progress') {
        lastProgress = Date.now(); stage = message.message; emit(stage);
      } else if (message.type === 'result' && !settled) {
        settled = true; cleanup(); resolve(message.result);
      }
    });
    worker.on('error', error => { if (!settled) { settled = true; cleanup(); reject(error); } });
    worker.on('exit', code => {
      cleanup();
      if (!settled) { settled = true; reject(new Error(`Conversion tool update worker exited ${code} without a result.`)); }
    });
  });
}

if (!isMainThread && workerData?.appDir) {
  const { downloadLlamaCpp } = require('./binary-manager-llamacpp');
  downloadLlamaCpp(workerData.appDir, data => parentPort.postMessage({ type: 'progress', message: data.message || 'Updating llama.cpp…' }),
    { conversionTools: true, refresh: true })
    .then(result => parentPort.postMessage({ type: 'result', result }))
    .catch(error => parentPort.postMessage({ type: 'result', result: { success: false, message: error.message } }));
}

module.exports = { updateConversionTools };
