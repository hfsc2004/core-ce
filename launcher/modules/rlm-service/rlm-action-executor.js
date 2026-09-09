/**
 * Structured RLM action executor.
 *
 * Root-model turns should resolve to these actions before touching the prompt
 * environment or sandbox runner.
 */

function clampInt(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(num)));
}

function truncateText(value, maxChars) {
  const text = String(value || '');
  const limit = Math.max(0, Number(maxChars) || 0);
  if (!limit || text.length <= limit) return text;
  return `${text.slice(0, limit)}...`;
}

function normalizeActionType(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[-\s]+/g, '_');
}

function createRlmActionExecutor(options = {}) {
  const getSession = typeof options.getSession === 'function' ? options.getSession : null;
  const validateSandboxCode = typeof options.validateSandboxCode === 'function' ? options.validateSandboxCode : null;
  const executeSandboxCode = typeof options.executeSandboxCode === 'function' ? options.executeSandboxCode : null;
  const runSubLm = typeof options.runSubLm === 'function' ? options.runSubLm : null;

  async function runAction(sessionId, action = {}) {
    const id = String(sessionId || '').trim();
    const session = getSession ? getSession(id) : null;
    if (!session) {
      return { success: false, error: `RLM session not found: ${id}` };
    }
    if (session.isStopped && session.isStopped()) {
      return { success: false, error: `RLM session is stopped: ${id}` };
    }

    const type = normalizeActionType(action.type || action.action || action.name);
    const args = action.args && typeof action.args === 'object' ? action.args : {};
    const env = session.environment;
    const budget = session.budget || {};
    const maxSlice = clampInt(budget.maxPromptSliceChars, 12000, 512, 200000);
    const maxValue = clampInt(budget.maxEnvironmentValueBytes, 1024 * 1024, 4096, 100 * 1024 * 1024);

    let result;
    if (type === 'inspect_environment_metadata' || type === 'metadata') {
      result = env.getMetadata();
    } else if (type === 'len_prompt') {
      result = { chars: env.lenPrompt() };
    } else if (type === 'slice_prompt') {
      const start = clampInt(args.start, 0, 0, env.lenPrompt());
      const requestedEnd = args.end == null ? start + maxSlice : clampInt(args.end, start + maxSlice, start, env.lenPrompt());
      const end = Math.min(requestedEnd, start + maxSlice);
      result = {
        start,
        end,
        truncated: requestedEnd > end,
        text: env.slicePrompt(start, end)
      };
    } else if (type === 'search_prompt') {
      result = env.searchPrompt(args.pattern || args.query || '', args.maxHits || args.max_hits || 20);
    } else if (type === 'chunk_prompt') {
      const chunkSize = clampInt(args.chunkSize || args.chunk_size, Math.min(4000, maxSlice), 128, maxSlice);
      const overlap = clampInt(args.overlap, 200, 0, Math.max(0, chunkSize - 1));
      const maxChunks = clampInt(args.maxChunks || args.max_chunks, 20, 1, 200);
      const includeText = args.includeText === true || args.include_text === true;
      const chunks = env.chunkPrompt(chunkSize, overlap).slice(0, maxChunks);
      result = chunks.map((chunk) => ({
        index: chunk.index,
        start: chunk.start,
        end: chunk.end,
        chars: String(chunk.text || '').length,
        text: includeText ? truncateText(chunk.text, maxSlice) : undefined
      }));
    } else if (type === 'set_value') {
      const value = truncateText(args.value, maxValue);
      result = env.setValue(args.name, value);
    } else if (type === 'get_value') {
      result = {
        name: String(args.name || '').trim(),
        text: env.getValue(args.name, args.offset || 0, args.length || 0)
      };
    } else if (type === 'list_values') {
      result = env.listValues();
    } else if (type === 'set_final') {
      result = env.setFinal(args.value || action.value || '');
    } else if (type === 'sub_lm') {
      if (!runSubLm) return { success: false, error: 'RLM sub_lm transport is unavailable.' };
      result = await runSubLm(session, args);
      if (!result || result.success !== true) {
        return {
          success: false,
          handled: true,
          sessionId: id,
          action: type,
          error: result?.error || 'RLM sub_lm failed.',
          budgetExhausted: result?.budgetExhausted === true,
          environment: env.getMetadata()
        };
      }
    } else if (type === 'validate_sandbox_code') {
      if (!validateSandboxCode) return { success: false, error: 'RLM sandbox validator is unavailable.' };
      result = validateSandboxCode({ sessionId: id, code: args.code || action.code || '' });
    } else if (type === 'execute_sandbox_code') {
      if (!executeSandboxCode) return { success: false, error: 'RLM sandbox executor is unavailable.' };
      result = await executeSandboxCode({ sessionId: id, code: args.code || action.code || '' });
    } else {
      return { success: false, error: `Unsupported RLM action: ${type || '(empty)'}` };
    }

    if (session.trace && typeof session.trace.add === 'function') {
      session.trace.add('action-executed', { type });
    }
    return {
      success: true,
      handled: true,
      sessionId: id,
      action: type,
      result,
      environment: env.getMetadata()
    };
  }

  return { runAction };
}

module.exports = {
  createRlmActionExecutor,
  normalizeActionType
};
