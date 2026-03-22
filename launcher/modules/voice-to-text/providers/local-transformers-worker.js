/**
 * Local Transformers worker-process helpers.
 */
const { spawn } = require('child_process');
const common = require('./local-transformers-common');

function ensureLocalTransformersWorker(pythonBin, scriptPath) {
  const key = `${pythonBin}::${scriptPath}`;
  const active = common.localTransformersWorkerPool.get(key);
  if (active && active.ready) return active;

  const child = spawn(pythonBin, [scriptPath, '--serve'], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  const worker = {
    key,
    child,
    ready: true,
    stdoutBuffer: '',
    stderrTail: '',
    pending: new Map()
  };
  common.localTransformersWorkerPool.set(key, worker);

  const rejectPending = (message) => {
    for (const [, pending] of worker.pending) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error(message));
    }
    worker.pending.clear();
  };

  child.stdout.on('data', (chunk) => {
    worker.stdoutBuffer += chunk.toString('utf8');
    let newlineIdx = worker.stdoutBuffer.indexOf('\n');
    while (newlineIdx >= 0) {
      const line = worker.stdoutBuffer.slice(0, newlineIdx).trim();
      worker.stdoutBuffer = worker.stdoutBuffer.slice(newlineIdx + 1);
      if (line) {
        let parsed = null;
        try {
          parsed = JSON.parse(line);
        } catch (_err) {
          // Ignore malformed line and continue; stderr usually has details.
        }
        if (parsed && Object.prototype.hasOwnProperty.call(parsed, 'id')) {
          const id = Number(parsed.id);
          const pending = worker.pending.get(id);
          if (pending) {
            clearTimeout(pending.timeoutId);
            worker.pending.delete(id);
            pending.resolve(parsed);
          }
        }
      }
      newlineIdx = worker.stdoutBuffer.indexOf('\n');
    }
  });

  child.stderr.on('data', (chunk) => {
    worker.stderrTail = common.trimTail(`${worker.stderrTail}${chunk.toString('utf8')}`, 8000);
  });

  child.on('error', (err) => {
    worker.ready = false;
    const detail = common.trimTail(worker.stderrTail, 1200);
    rejectPending(`Local Transformers worker error: ${err.message || String(err)}${detail ? ` | ${detail}` : ''}`);
    common.localTransformersWorkerPool.delete(key);
  });

  child.on('close', (code, signal) => {
    worker.ready = false;
    const detail = common.trimTail(worker.stderrTail, 1200);
    rejectPending(
      `Local Transformers worker exited (${typeof code === 'number' ? code : -1}${signal ? `/${signal}` : ''})${detail ? `: ${detail}` : ''}`
    );
    common.localTransformersWorkerPool.delete(key);
  });

  return worker;
}

function requestLocalTransformersWorker(worker, payload = {}, options = {}) {
  return new Promise((resolve, reject) => {
    if (!worker || !worker.ready || !worker.child || !worker.child.stdin) {
      reject(new Error('Local Transformers worker is not available.'));
      return;
    }
    const id = common.nextWorkerRequestId();
    const timeoutMs = Number.isFinite(options.timeout) ? options.timeout : 120000;
    const timeoutId = setTimeout(() => {
      worker.pending.delete(id);
      try {
        worker.ready = false;
        if (worker.child && !worker.child.killed) {
          worker.child.kill('SIGKILL');
        }
      } catch (_err) {
        // Ignore cleanup errors on timeout path.
      }
      const tail = common.trimTail(String(worker.stderrTail || ''), 1400);
      const detail = tail ? ` stderr: ${tail}` : '';
      reject(new Error(`Local Transformers worker timed out after ${timeoutMs}ms.${detail}`));
    }, timeoutMs);
    worker.pending.set(id, { resolve, reject, timeoutId });
    try {
      worker.child.stdin.write(`${JSON.stringify({ id, ...payload })}\n`);
    } catch (err) {
      clearTimeout(timeoutId);
      worker.pending.delete(id);
      reject(err);
    }
  });
}

module.exports = {
  ensureLocalTransformersWorker,
  requestLocalTransformersWorker
};
