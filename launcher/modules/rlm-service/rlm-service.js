/**
 * BMOC-owned RLM service skeleton.
 *
 * Phase 1/2 implementation: session lifecycle plus prompt environment dry-run.
 * This intentionally does not execute model-authored code yet.
 */

const { createRlmSession } = require('./rlm-session');
const { normalizeModelBehavior, normalizeProfile } = require('./rlm-budget');
const { validatePythonSource, normalizeSandboxPolicy } = require('./rlm-sandbox-policy');
const { executePythonSnippet } = require('./rlm-python-runner');
const { createRlmActionExecutor } = require('./rlm-action-executor');
const { runRootLoop } = require('./rlm-root-loop');

function createRlmService(deps = {}) {
  const registerSession = typeof deps.registerSession === 'function' ? deps.registerSession : null;
  const closeSession = typeof deps.closeSession === 'function' ? deps.closeSession : null;
  const updateSession = typeof deps.updateSession === 'function' ? deps.updateSession : null;
  const getBmocSession = typeof deps.getSession === 'function' ? deps.getSession : null;
  const attachmentStore = deps.attachmentStore || null;
  const sandboxExecutionEnabled = deps.enableSandboxExecution === true;
  const defaultSendMessage = typeof deps.sendMessage === 'function' ? deps.sendMessage : null;
  const sessions = new Map();
  const actionExecutor = createRlmActionExecutor({
    getSession: (sessionId) => sessions.get(sessionId),
    validateSandboxCode,
    executeSandboxCode
  });

  async function listAttachmentMetadata(sessionId) {
    const sid = String(sessionId || '').trim();
    if (!sid || !attachmentStore || typeof attachmentStore.listAttachments !== 'function') return [];
    try {
      const items = await attachmentStore.listAttachments(sid);
      return Array.isArray(items) ? items : [];
    } catch (_) {
      return [];
    }
  }

  async function startSession(request = {}) {
    if (!registerSession) {
      return { success: false, error: 'BMOC registerSession is unavailable.' };
    }

    const prompt = String(request.prompt || request.message || '');
    const parentSessionId = String(request.parentSessionId || request.terminalSessionId || '').trim();
    const attachmentSessionId = String(request.attachmentSessionId || request.sessionId || parentSessionId || '').trim();
    const modelBehavior = normalizeModelBehavior(request.modelBehavior);
    const profile = normalizeProfile(request.profile);
    const mode = String(request.mode || 'recursive-repl-dry-run').trim() || 'recursive-repl-dry-run';
    const attachments = await listAttachmentMetadata(attachmentSessionId);

    const bmocSessionId = registerSession({
      type: 'rlm',
      ollamaPort: null,
      ollamaPID: null,
      metadata: {
        service: 'rlm',
        mode,
        dryRun: true,
        surface: String(request.surface || 'terminal'),
        parentSessionId: parentSessionId || null,
        attachmentSessionId: attachmentSessionId || null,
        rootModel: String(request.model || request.modelName || ''),
        backend: String(request.backend || ''),
        modelBehavior,
        behaviorSource: String(request.behaviorSource || 'unknown'),
        profile,
        promptChars: prompt.length,
        startedVia: 'rlm-service:startSession'
      }
    });

    const session = createRlmSession({
      bmocSessionId,
      parentSessionId,
      surface: request.surface,
      mode,
      model: request.model || request.modelName,
      backend: request.backend,
      modelBehavior,
      behaviorSource: request.behaviorSource,
      profile,
      budget: request.budget,
      prompt,
      messages: request.messages,
      attachments
    });
    sessions.set(bmocSessionId, session);

    if (updateSession) {
      updateSession(bmocSessionId, {
        metadata: {
          ...((getBmocSession && getBmocSession(bmocSessionId)?.metadata) || {}),
          budget: { ...session.budget },
          environmentSchema: 'rlm-environment/v0-dry-run'
        }
      });
    }

    return session.getStatus();
  }

  function getSessionStatus(sessionId) {
    const id = String(sessionId || '').trim();
    const session = sessions.get(id);
    if (!session) {
      return { success: false, error: `RLM session not found: ${id}` };
    }
    return session.getStatus();
  }

  async function runDryTurn(request = {}) {
    let sessionId = String(request.sessionId || '').trim();
    let status;
    if (!sessionId) {
      status = await startSession(request);
      if (!status?.success) return status;
      sessionId = String(status.sessionId || '');
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return { success: false, error: `RLM session not found: ${sessionId}` };
    }
    if (session.isStopped()) {
      return { success: false, error: `RLM session is stopped: ${sessionId}` };
    }

    const metadata = session.environment.getMetadata();
    const rootModelInput = {
      system: [
        'You are the root controller of a Recursive Language Model.',
        'The full user prompt is stored externally as Prompt.',
        'Do not ask for the full prompt. Use environment helpers to inspect bounded slices.',
        'This dry run exposes metadata only; model-authored code execution is disabled.'
      ].join('\n'),
      environment: metadata,
      allowedActions: ['inspect_environment_metadata'],
      disabledActions: ['execute_code', 'sub_lm', 'sub_rlm']
    };
    session.trace.add('dry-run-root-input-built', {
      promptChars: metadata.prompt.chars,
      attachmentCount: metadata.attachments.count,
      scratchCount: metadata.scratch.count
    });

    return {
      success: true,
      handled: true,
      sessionId,
      mode: session.mode,
      dryRun: true,
      rootModelInput,
      trace: session.trace.list(50)
    };
  }

  function validateSandboxCode(request = {}) {
    const sessionId = String(request.sessionId || '').trim();
    const session = sessionId ? sessions.get(sessionId) : null;
    const budget = session?.budget || request.budget || {};
    const policy = normalizeSandboxPolicy(request.policy || {}, budget);
    const validation = validatePythonSource(request.code || request.source || '', policy);
    if (session) {
      session.trace.add('sandbox-code-validated', {
        success: validation.success,
        executable: validation.executable,
        executionDisabled: validation.executionDisabled,
        errorIds: validation.errors.map((item) => item.id)
      });
    }
    return {
      success: true,
      handled: true,
      sessionId: sessionId || null,
      validation
    };
  }

  async function executeSandboxCode(request = {}) {
    const sessionId = String(request.sessionId || '').trim();
    const session = sessionId ? sessions.get(sessionId) : null;
    if (!session) {
      return { success: false, error: `RLM session not found: ${sessionId}` };
    }
    if (!sandboxExecutionEnabled) {
      return {
        success: false,
        handled: true,
        sessionId,
        executionDisabled: true,
        error: 'RLM sandbox execution is disabled.'
      };
    }

    const state = session.environment.getSandboxState();
    const result = await executePythonSnippet({
      code: request.code || request.source || '',
      prompt: state.prompt,
      scratch: state.scratch,
      policy: {
        ...(request.policy || {}),
        allowExecution: true
      },
      budget: session.budget
    });
    session.trace.add('sandbox-code-executed', {
      success: result.success === true,
      timeout: result.timeout === true,
      error: String(result.error || ''),
      finalSet: result.result?.final?.set === true
    });

    if (result.success === true && result.result) {
      session.environment.applySandboxResult(result.result);
    }

    return {
      success: result.success === true,
      handled: true,
      sessionId,
      executionDisabled: false,
      result,
      environment: session.environment.getMetadata()
    };
  }

  async function stopSession(sessionId, reason = 'stopped') {
    const id = String(sessionId || '').trim();
    const session = sessions.get(id);
    if (session) {
      session.stop(reason);
      sessions.delete(id);
    }
    if (closeSession && id) {
      await closeSession(id);
    }
    return { success: true, sessionId: id, stopped: true };
  }

  async function runAction(request = {}) {
    return actionExecutor.runAction(request.sessionId, request.action || request);
  }

  async function runLoop(request = {}, options = {}) {
    let sessionId = String(request.sessionId || '').trim();
    if (!sessionId) {
      const status = await startSession(request);
      if (!status?.success) return status;
      sessionId = String(status.sessionId || '');
    }
    const session = sessions.get(sessionId);
    if (!session) {
      return { success: false, error: `RLM session not found: ${sessionId}` };
    }
    if (session.isStopped()) {
      return { success: false, error: `RLM session is stopped: ${sessionId}` };
    }
    return runRootLoop({
      session,
      model: request.model || request.modelName || session.model,
      runAction: (id, action) => actionExecutor.runAction(id, action),
      sendMessage: options.sendMessage || request.sendMessage || defaultSendMessage
    });
  }

  function listSessions() {
    return {
      success: true,
      sessions: Array.from(sessions.values()).map((session) => session.getStatus())
    };
  }

  return {
    startSession,
    runDryTurn,
    validateSandboxCode,
    executeSandboxCode,
    runAction,
    runLoop,
    getSession: getSessionStatus,
    stopSession,
    listSessions
  };
}

module.exports = {
  createRlmService
};
