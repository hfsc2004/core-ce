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

function normalizeScratchName(value, fallback = 'value') {
  const name = String(value || fallback || 'value').trim().replace(/[^\w.-]+/g, '_');
  return name || fallback;
}

function extractRequestedWordLimit(text = '') {
  const prompt = String(text || '');
  const patterns = [
    /\b(?:under|below|less than|fewer than|max(?:imum)?|no more than)\s+(\d{1,5})\s+words?\b/i,
    /\bkeep\b[\s\S]{0,80}?\b(?:under|below|less than|fewer than|max(?:imum)?|no more than)\s+(\d{1,5})\s+words?\b/i
  ];
  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    const value = Number(match?.[1]);
    if (Number.isFinite(value) && value > 0) return Math.floor(value);
  }
  return 0;
}

function outputTokensForWordLimit(wordLimit, fallback = 1024) {
  const words = Number(wordLimit);
  if (!Number.isFinite(words) || words <= 0) return fallback;
  return Math.max(128, Math.min(4096, Math.ceil(words * 2.2) + 96));
}

function looksIncompleteText(text = '') {
  const value = String(text || '').trim();
  if (!value) return false;
  if (/[.!?")\]]$/.test(value)) return false;
  return /\b(and|or|but|because|with|without|for|from|to|in|on|at|by|of|a|an|the|game|plan|where|when|while)$/i.test(value) || /[,;:]$/.test(value);
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
    } else if (type === 'map_prompt_chunks') {
      if (!runSubLm) return { success: false, error: 'RLM sub_lm transport is unavailable.' };
      const chunkSize = clampInt(args.chunkSize || args.chunk_size, Math.min(4000, maxSlice), 128, maxSlice);
      const overlap = clampInt(args.overlap, 200, 0, Math.max(0, chunkSize - 1));
      const maxChunks = clampInt(args.maxChunks || args.max_chunks, 4, 1, 32);
      const maxTokens = clampInt(args.maxTokens || args.max_tokens, 160, 64, 2048);
      const outputName = normalizeScratchName(args.outputName || args.output_name, 'chunk_summaries');
      const instruction = String(args.instruction || args.instructions || args.query || 'Summarize the useful information in this prompt chunk in one concise sentence.').trim();
      const chunks = env.chunkPrompt(chunkSize, overlap).slice(0, maxChunks);
      const mapped = [];
      for (const chunk of chunks) {
        if (session.isStopped && session.isStopped()) {
          return { success: false, error: `RLM session is stopped: ${id}` };
        }
        const subResult = await runSubLm(session, {
          prompt: [
            instruction,
            `Chunk ${chunk.index} (${chunk.start}-${chunk.end}):`,
            truncateText(chunk.text, maxSlice)
          ].join('\n\n'),
          max_tokens: maxTokens
        });
        if (!subResult || subResult.success !== true) {
          return {
            success: false,
            handled: true,
            sessionId: id,
            action: type,
            error: subResult?.error || 'RLM chunk map sub_lm failed.',
            budgetExhausted: subResult?.budgetExhausted === true,
            result: {
              outputName,
              processed: mapped.length,
              totalSelected: chunks.length
            },
            environment: env.getMetadata()
          };
        }
        mapped.push({
          index: chunk.index,
          start: chunk.start,
          end: chunk.end,
          chars: String(chunk.text || '').length,
          summary: truncateText(subResult.content, maxSlice)
        });
      }
      const stored = JSON.stringify(mapped, null, 2);
      env.setValue(outputName, stored);
      result = {
        outputName,
        processed: mapped.length,
        totalSelected: chunks.length,
        summaries: mapped.map((item) => ({
          index: item.index,
          start: item.start,
          end: item.end,
          chars: item.chars,
          summary: truncateText(item.summary, 1000)
        }))
      };
    } else if (type === 'compose_final') {
      if (!runSubLm) return { success: false, error: 'RLM sub_lm transport is unavailable.' };
      const promptLimit = clampInt(args.promptChars || args.prompt_chars, Math.min(maxSlice, 4000), 512, maxSlice);
      const promptSlice = env.slicePrompt(0, promptLimit);
      const requestedWordLimit = extractRequestedWordLimit(promptSlice);
      const defaultMaxTokens = outputTokensForWordLimit(requestedWordLimit, 1024);
      const maxTokens = clampInt(args.maxTokens || args.max_tokens, defaultMaxTokens, 128, 4096);
      const baseInstruction = String(args.instruction || args.instructions || 'Produce the final answer for the user. Use the task prompt and Scratch summaries. Return only the final answer.').trim();
      const instruction = [
        baseInstruction,
        requestedWordLimit > 0 ? `The user requested fewer than ${requestedWordLimit} words. Stay within that limit.` : '',
        'Finish cleanly with a complete final sentence. Do not end mid-sentence or with a dangling phrase.'
      ].filter(Boolean).join('\n');
      const names = Array.isArray(args.scratchNames || args.scratch_names)
        ? (args.scratchNames || args.scratch_names)
        : env.listValues();
      const scratchSections = names.map((name) => {
        const key = String(name || '').trim();
        if (!key) return '';
        const value = env.getValue(key, 0, maxSlice);
        return value ? `Scratch ${key}:\n${value}` : '';
      }).filter(Boolean);
      const subResult = await runSubLm(session, {
        prompt: [
          instruction,
          `User task:\n${promptSlice}`,
          scratchSections.join('\n\n')
        ].filter(Boolean).join('\n\n'),
        purpose: 'final_composition',
        max_tokens: maxTokens
      });
      if (!subResult || subResult.success !== true) {
        return {
          success: false,
          handled: true,
          sessionId: id,
          action: type,
          error: subResult?.error || 'RLM final composition sub_lm failed.',
          budgetExhausted: subResult?.budgetExhausted === true,
          environment: env.getMetadata()
        };
      }
      const finalText = truncateText(subResult.content, clampInt(budget.maxFinalOutputChars, 24000, 512, 1000000));
      env.setFinal(finalText);
      result = {
        chars: finalText.length,
        requestedWordLimit,
        incomplete: looksIncompleteText(finalText),
        finishReason: subResult.finishReason || '',
        scratchNames: names.map((name) => String(name || '').trim()).filter(Boolean)
      };
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
