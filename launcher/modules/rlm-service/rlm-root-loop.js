/**
 * Root loop for MIT-style RLM orchestration.
 *
 * The root model sees metadata and bounded action observations, then emits one
 * JSON action per iteration. The full prompt remains in the RLM environment.
 */

const ACTION_SCHEMA = {
  type: 'object',
  required: ['type'],
  properties: {
    type: {
      type: 'string',
      enum: [
        'inspect_environment_metadata',
        'len_prompt',
        'slice_prompt',
        'search_prompt',
        'chunk_prompt',
        'set_value',
        'get_value',
        'list_values',
        'set_final',
        'sub_lm',
        'validate_sandbox_code',
        'execute_sandbox_code'
      ]
    },
    args: { type: 'object' }
  }
};

function truncateJson(value, maxChars = 6000) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const limit = Math.max(512, Number(maxChars) || 6000);
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}...`;
}

function summarizeObservationResult(value, maxChars = 6000) {
  const text = JSON.stringify(value);
  const limit = Math.max(512, Number(maxChars) || 6000);
  if (text.length <= limit) return value;
  return {
    truncated: true,
    chars: text.length,
    preview: text.slice(0, limit)
  };
}

function extractModelContent(result = {}) {
  if (typeof result === 'string') return result;
  return String(
    result?.response?.message?.content ??
    result?.message?.content ??
    result?.content ??
    result?.response ??
    result?.text ??
    ''
  );
}

function extractModelThinking(result = {}) {
  if (typeof result === 'string') return '';
  return String(
    result?.response?.message?.reasoning_content ??
    result?.response?.message?.reasoning ??
    result?.response?.message?.thinking ??
    result?.message?.reasoning_content ??
    result?.message?.reasoning ??
    result?.message?.thinking ??
    result?.reasoning_content ??
    result?.reasoning ??
    result?.thinking ??
    ''
  );
}

function stripJsonFence(text = '') {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced ? fenced[1].trim() : raw;
}

function extractFirstJsonObject(text = '') {
  const raw = stripJsonFence(text);
  if (!raw) throw new Error('empty model response');
  try {
    return JSON.parse(raw);
  } catch (_) {
    // Fall through to balanced-brace extraction.
  }

  const start = raw.indexOf('{');
  if (start < 0) throw new Error('no JSON object found');
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(raw.slice(start, i + 1));
      }
    }
  }
  throw new Error('unterminated JSON object');
}

function normalizeActionPayload(payload = {}) {
  const action = payload.action && typeof payload.action === 'object' ? payload.action : payload;
  const type = String(action.type || action.action || action.name || '').trim();
  const args = action.args && typeof action.args === 'object' ? action.args : {};
  if (!type) throw new Error('action type is required');
  return { type, args };
}

function getRequiredActions(session) {
  const metadata = session?.environment?.getMetadata?.() || {};
  const actions = Array.isArray(metadata?.prompt?.requestedRlmActions)
    ? metadata.prompt.requestedRlmActions
    : [];
  return actions.map((action) => String(action || '').trim()).filter(Boolean);
}

function hasActionRun(observations = [], actionType = '') {
  const wanted = String(actionType || '').trim();
  if (!wanted) return true;
  return observations.some((entry) =>
    entry?.success === true &&
    String(entry?.action?.type || '').trim() === wanted
  );
}

function buildRequiredAction(actionType, session, observations = []) {
  const promptLength = Number(session?.environment?.lenPrompt?.() || 0);
  if (actionType === 'len_prompt') {
    return { type: 'len_prompt', args: {} };
  }
  if (actionType === 'slice_prompt') {
    return {
      type: 'slice_prompt',
      args: {
        start: 0,
        end: Math.min(Math.max(promptLength, 1), 1200)
      }
    };
  }
  if (actionType === 'sub_lm') {
    const sliceObservation = [...observations].reverse().find((entry) =>
      entry?.success === true &&
      String(entry?.action?.type || '') === 'slice_prompt' &&
      typeof entry?.result === 'string'
    );
    const promptSlice = String(sliceObservation?.result || '').trim();
    return {
      type: 'sub_lm',
      args: {
        prompt: [
          'Return one plain sentence only. No analysis. Summarize the central conflict or main task.',
          promptSlice ? `Prompt slice:\n${promptSlice}` : ''
        ].filter(Boolean).join('\n\n'),
        max_tokens: 96
      }
    };
  }
  return null;
}

function enforceRequiredActions(action, session, observations = []) {
  if (!action || action.type !== 'set_final') return action;
  const required = getRequiredActions(session);
  const missing = required.find((actionType) => !hasActionRun(observations, actionType));
  if (!missing) return action;
  return buildRequiredAction(missing, session, observations) || action;
}

function buildActionObservation(iteration, action, actionResult) {
  return {
    iteration,
    action,
    success: actionResult.success === true,
    result: actionResult.success ? summarizeObservationResult(actionResult.result, 6000) : undefined,
    error: actionResult.success ? undefined : actionResult.error,
    finalSet: actionResult.environment?.final?.set === true
  };
}

function emitProgress(onProgress, progress = {}) {
  if (typeof onProgress !== 'function') return;
  try {
    onProgress({
      sessionId: progress.sessionId || '',
      ts: new Date().toISOString(),
      ...progress
    });
  } catch (_) {}
}

async function runActionAndRecord(session, runAction, observations, iteration, action, onProgress = null) {
  emitProgress(onProgress, {
    sessionId: session.bmocSessionId,
    phase: 'action-start',
    iteration,
    action: action.type
  });
  const actionResult = await runAction(session.bmocSessionId, action);
  const observation = buildActionObservation(iteration, action, actionResult);
  observations.push(observation);
  session.trace?.add?.('root-loop-action-result', {
    iteration,
    action: action.type,
    success: observation.success,
    finalSet: observation.finalSet
  });
  emitProgress(onProgress, {
    sessionId: session.bmocSessionId,
    phase: 'action-done',
    iteration,
    action: action.type,
    success: observation.success
  });
  return observation;
}

async function runMissingRequiredActions(session, runAction, observations, iteration, onProgress = null) {
  const required = getRequiredActions(session);
  const ran = [];
  for (const actionType of required) {
    if (hasActionRun(observations, actionType)) continue;
    const action = buildRequiredAction(actionType, session, observations);
    if (!action) continue;
    const observation = await runActionAndRecord(session, runAction, observations, iteration, action, onProgress);
    ran.push(observation);
    if (observation.success !== true) break;
  }
  return ran;
}

function buildRootMessages(session, observations = []) {
  const metadata = session.environment.getMetadata();
  const budget = session.budget || {};
  const system = [
    'You are the root controller of a Recursive Language Model.',
    'The full user prompt is stored externally as Prompt and is not in your context.',
    'Do not deliberate. Do not write analysis, thinking, markdown, or explanation.',
    'Choose exactly one JSON action per response. Do not include prose outside JSON.',
    'The current Prompt is the task to answer. Do not use prior Messages as task content unless the Prompt explicitly asks for conversation history.',
    'Use bounded prompt/environment actions to inspect, transform, and finish.',
    'If environment.prompt.requestedRlmActions is non-empty, run those action types successfully before set_final.',
    `Allowed action types are: ${ACTION_SCHEMA.properties.type.enum.join(', ')}.`,
    'Set the final answer with {"type":"set_final","args":{"value":"..."}} when ready.',
    'Do not ask for the full prompt.',
    'Use sub_lm only for bounded sub-questions over prompt slices or intermediate values.',
    'Sandbox execution may be unavailable; if execute_sandbox_code is rejected, continue with non-execution actions.'
  ].join('\n');
  const userPayload = {
    environment: metadata,
    budget: {
      maxRootIterations: budget.maxRootIterations,
      maxPromptSliceChars: budget.maxPromptSliceChars,
      maxFinalOutputChars: budget.maxFinalOutputChars,
      modelBehavior: budget.modelBehavior,
      profile: budget.profile
    },
    actionSchema: ACTION_SCHEMA,
    recentObservations: observations.slice(-8)
  };
  return [
    { role: 'system', content: system },
    { role: 'user', content: truncateJson(userPayload, 12000) }
  ];
}

async function runRootLoop(options = {}) {
  const session = options.session;
  const runAction = options.runAction;
  const sendMessage = options.sendMessage;
  const model = String(options.model || session?.model || '').trim();
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
  if (!session) return { success: false, error: 'RLM session is required.' };
  if (typeof runAction !== 'function') return { success: false, error: 'RLM action executor is unavailable.' };
  if (typeof sendMessage !== 'function') return { success: false, error: 'RLM model transport is unavailable.' };
  if (!model) return { success: false, error: 'RLM root model is required.' };

  const budget = session.budget || {};
  const maxIterations = Math.max(1, Math.min(64, Number(budget.maxRootIterations) || 1));
  const observations = [];
  const thinking = [];
  if (getRequiredActions(session).length > 0) {
    await runMissingRequiredActions(session, runAction, observations, 0, onProgress);
  }

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    if (session.isStopped && session.isStopped()) {
      return { success: false, stopped: true, sessionId: session.bmocSessionId, observations, thinking };
    }
    if (session.environment.isFinalSet()) {
      return {
        success: true,
        handled: true,
        sessionId: session.bmocSessionId,
        final: session.environment.getFinal(),
        iterations: iteration - 1,
        observations,
        thinking,
        environment: session.environment.getMetadata()
      };
    }

    const messages = buildRootMessages(session, observations);
    session.trace?.add?.('root-loop-model-call', { iteration, observationCount: observations.length });
    emitProgress(onProgress, {
      sessionId: session.bmocSessionId,
      phase: 'root-model-start',
      iteration
    });
    const modelResult = await sendMessage(model, messages, {
      stream: false,
      rlm: true,
      rlmRootAction: true,
      maxTokens: Math.min(256, Number(budget.maxRootActionTokens) || 192)
    });
    emitProgress(onProgress, {
      sessionId: session.bmocSessionId,
      phase: 'root-model-done',
      iteration
    });
    if (session.isStopped && session.isStopped()) {
      return { success: false, stopped: true, sessionId: session.bmocSessionId, observations, thinking };
    }
    const content = extractModelContent(modelResult);
    const modelThinking = extractModelThinking(modelResult).trim();
    if (modelThinking) {
      thinking.push({
        iteration,
        chars: modelThinking.length,
        text: modelThinking
      });
    }
    let action;
    try {
      action = normalizeActionPayload(extractFirstJsonObject(content));
    } catch (err) {
      const observation = {
        iteration,
        success: false,
        error: `Invalid JSON action: ${String(err?.message || err || '')}`,
        modelTextPreview: String(content || '').slice(0, 500)
      };
      observations.push(observation);
      session.trace?.add?.('root-loop-invalid-action', { iteration, error: observation.error });
      continue;
    }

    if (action.type === 'set_final') {
      await runMissingRequiredActions(session, runAction, observations, iteration, onProgress);
    }
    action = enforceRequiredActions(action, session, observations);
    await runActionAndRecord(session, runAction, observations, iteration, action, onProgress);
  }

  return {
    success: session.environment.isFinalSet(),
    handled: true,
    sessionId: session.bmocSessionId,
    final: session.environment.getFinal(),
    iterations: maxIterations,
    budgetExhausted: !session.environment.isFinalSet(),
    observations,
    thinking,
    environment: session.environment.getMetadata()
  };
}

module.exports = {
  ACTION_SCHEMA,
  buildRootMessages,
  extractFirstJsonObject,
  extractModelContent,
  extractModelThinking,
  emitProgress,
  normalizeActionPayload,
  summarizeObservationResult,
  runRootLoop
};
