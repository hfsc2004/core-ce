/**
 * Short-lived Python runner for RLM REPL snippets.
 */

const path = require('path');
const { spawn } = require('child_process');
const { normalizeSandboxPolicy, validatePythonSource } = require('./rlm-sandbox-policy');

function truncateText(value, maxChars) {
  const text = String(value || '');
  const limit = Math.max(0, Number(maxChars) || 0);
  if (!limit || text.length <= limit) return text;
  return `${text.slice(0, limit)}...`;
}

function resolvePythonBin(options = {}) {
  const configured = String(options.pythonBin || process.env.PSF_RLM_PYTHON || '').trim();
  if (configured) return configured;
  if (process.platform === 'win32') return 'python';
  return 'python3';
}

function runPythonWorker(payload = {}, options = {}) {
  return new Promise((resolve) => {
    const workerPath = path.join(__dirname, 'rlm_python_worker.py');
    const pythonBin = resolvePythonBin(options);
    const policy = normalizeSandboxPolicy(options.policy || {}, options.budget || {});
    const input = JSON.stringify({
      code: payload.code || '',
      prompt: payload.prompt || '',
      scratch: payload.scratch || {},
      policy: {
        ...policy,
        maxPromptSliceChars: options.budget?.maxPromptSliceChars,
        maxFinalOutputChars: options.budget?.maxFinalOutputChars
      }
    });
    const maxStdoutChars = policy.maxStdoutChars;
    const maxStderrChars = policy.maxStderrChars;
    const timeoutMs = policy.maxExecMs;
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timeoutId = null;

    const args = process.platform === 'win32'
      ? [workerPath]
      : ['-I', workerPath];

    const child = spawn(pythonBin, args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      env: {
        PATH: process.env.PATH || '',
        PYTHONNOUSERSITE: '1',
        PYTHONSAFEPATH: '1'
      }
    });

    function finish(result) {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      resolve(result);
    }

    child.on('error', (err) => {
      finish({
        success: false,
        error: `Failed to launch RLM Python worker: ${String(err?.message || err || '')}`,
        stdout: truncateText(stdout, maxStdoutChars),
        stderr: truncateText(stderr, maxStderrChars)
      });
    });

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
      if (stdout.length > maxStdoutChars * 2) {
        stdout = stdout.slice(0, maxStdoutChars * 2);
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
      if (stderr.length > maxStderrChars * 2) {
        stderr = stderr.slice(0, maxStderrChars * 2);
      }
    });

    child.on('close', (code, signal) => {
      const cleanStdout = truncateText(stdout, maxStdoutChars);
      const cleanStderr = truncateText(stderr, maxStderrChars);
      if (code !== 0) {
        finish({
          success: false,
          error: `RLM Python worker exited with code ${code == null ? 'null' : code}${signal ? ` (${signal})` : ''}.`,
          stdout: cleanStdout,
          stderr: cleanStderr
        });
        return;
      }
      try {
        const parsed = JSON.parse(cleanStdout || '{}');
        finish({
          success: parsed.success === true,
          result: parsed,
          stdout: cleanStdout,
          stderr: cleanStderr
        });
      } catch (err) {
        finish({
          success: false,
          error: `Invalid RLM Python worker JSON: ${String(err?.message || err || '')}`,
          stdout: cleanStdout,
          stderr: cleanStderr
        });
      }
    });

    timeoutId = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch (_) {}
      finish({
        success: false,
        timeout: true,
        error: `RLM Python worker timed out after ${timeoutMs}ms.`,
        stdout: truncateText(stdout, maxStdoutChars),
        stderr: truncateText(stderr, maxStderrChars)
      });
    }, timeoutMs);

    child.stdin.write(input);
    child.stdin.end();
  });
}

async function executePythonSnippet(request = {}, options = {}) {
  const policy = normalizeSandboxPolicy(request.policy || {}, request.budget || {});
  const validation = validatePythonSource(request.code || request.source || '', {
    ...policy,
    allowExecution: true
  });
  if (!validation.success) {
    return {
      success: false,
      handled: true,
      validation,
      error: 'RLM sandbox policy rejected code before execution.'
    };
  }
  return runPythonWorker({
    code: request.code || request.source || '',
    prompt: request.prompt || '',
    scratch: request.scratch || {}
  }, {
    ...options,
    policy: {
      ...policy,
      allowExecution: true
    },
    budget: request.budget || {}
  });
}

module.exports = {
  executePythonSnippet,
  resolvePythonBin,
  runPythonWorker
};
