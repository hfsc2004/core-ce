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
      sub_lm_cache: payload.subLmCache || payload.sub_lm_cache || {},
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
  const runSubLm = typeof options.runSubLm === 'function' ? options.runSubLm : null;
  const subLmCache = {};
  const subLmTrace = [];
  const maxSubcalls = Math.max(0, Math.min(1000, Number(request.budget?.maxSubcalls) || Number(options.budget?.maxSubcalls) || 0));
  const basePayload = {
    code: request.code || request.source || '',
    prompt: request.prompt || '',
    scratch: request.scratch || {}
  };
  const workerOptions = {
    ...options,
    policy: {
      ...policy,
      allowExecution: true
    },
    budget: request.budget || {}
  };

  for (let attempt = 0; attempt <= maxSubcalls; attempt += 1) {
    const result = await runPythonWorker({
      ...basePayload,
      subLmCache
    }, workerOptions);
    if (!result?.result?.needs_sub_lm) {
      if (subLmTrace.length > 0 && result && typeof result === 'object') {
        result.subLmTrace = subLmTrace.slice();
      }
      return result;
    }
    const requests = Array.isArray(result.result.sub_lm_requests) ? result.result.sub_lm_requests : [];
    const nextRequest = requests[0] || null;
    if (!runSubLm) {
      return {
        ...result,
        success: false,
        handled: true,
        error: 'RLM sandbox requested sub_lm, but host sub_lm transport is unavailable.',
        subLmTrace
      };
    }
    if (!nextRequest?.key || !nextRequest?.prompt) {
      return {
        ...result,
        success: false,
        handled: true,
        error: 'RLM sandbox returned an invalid sub_lm request.',
        subLmTrace
      };
    }
    if (subLmTrace.length >= maxSubcalls) {
      return {
        ...result,
        success: false,
        handled: true,
        budgetExhausted: true,
        error: `RLM sandbox sub_lm budget exhausted (${subLmTrace.length}/${maxSubcalls}).`,
        subLmTrace
      };
    }
    const subResult = await runSubLm({
      prompt: nextRequest.prompt,
      max_tokens: nextRequest.max_tokens,
      model: nextRequest.model,
      temperature: nextRequest.temperature,
      purpose: 'sandbox_repl'
    });
    if (!subResult || subResult.success !== true) {
      return {
        ...result,
        success: false,
        handled: true,
        budgetExhausted: subResult?.budgetExhausted === true,
        error: subResult?.error || 'RLM sandbox sub_lm call failed.',
        subLmTrace
      };
    }
    subLmCache[nextRequest.key] = String(subResult.content || '');
    subLmTrace.push({
      promptChars: String(nextRequest.prompt || '').length,
      responseChars: String(subResult.content || '').length,
      finishReason: String(subResult.finishReason || '')
    });
  }

  return {
    success: false,
    handled: true,
    budgetExhausted: true,
    error: `RLM sandbox sub_lm trampoline exhausted (${subLmTrace.length}/${maxSubcalls}).`,
    subLmTrace
  };
}

module.exports = {
  executePythonSnippet,
  resolvePythonBin,
  runPythonWorker
};
