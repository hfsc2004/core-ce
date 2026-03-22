/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
function createIpcRuntimeHandlers({
  codingTerminalCommon,
  pipelineTools,
  deterministicRegistryTools = null,
  normalizeCodingInferenceBackend,
  getCodingInferenceBackend,
  sendInferenceMessage,
  getRuntimeContext,
  inferenceManager,
  startupTools,
  ensureTerminalOllamaReady,
  ensureTerminalLlamaReady,
  closeTerminalOllamaSession,
  closeRouterOllamaSession,
  closeTerminalLlamaSession,
  closeRouterLlamaSession,
  closeRagOllamaSession
} = {}) {
  async function handleGetConfig(event) {
    return codingTerminalCommon.getConfig();
  }

  async function handleUpdateConfig(event, updates) {
    codingTerminalCommon.updateConfig(updates);
    return { success: true };
  }

  async function handleGetPipelineEvents(_event, payload = {}) {
    const limit = Number(payload?.limit) || 120;
    return {
      success: true,
      events: pipelineTools.getPipelineEvents(limit)
    };
  }

  async function handleGetPlanRuns(_event, payload = {}) {
    const limit = Math.max(1, Math.min(Number(payload?.limit) || 20, 80));
    const includeLatest = payload?.includeLatest !== false;
    const runId = String(payload?.runId || '').trim();
    let latestRun = null;
    if (runId && typeof codingTerminalCommon.getPlanRun === 'function') {
      latestRun = codingTerminalCommon.getPlanRun(runId);
    } else if (includeLatest && typeof codingTerminalCommon.getLatestPlanRun === 'function') {
      latestRun = codingTerminalCommon.getLatestPlanRun();
    }
    const runs = typeof codingTerminalCommon.listPlanRuns === 'function'
      ? codingTerminalCommon.listPlanRuns(limit)
      : [];
    return {
      success: true,
      latestRun,
      runs
    };
  }

  async function handleGetDeterministicRegistry(_event, payload = {}) {
    const limit = Math.max(1, Math.min(Number(payload?.limit) || 200, 1000));
    const definitions = deterministicRegistryTools?.listDeterministicRegistryDefinitions
      ? deterministicRegistryTools.listDeterministicRegistryDefinitions()
      : [];
    const telemetry = deterministicRegistryTools?.getDeterministicRegistryTelemetry
      ? deterministicRegistryTools.getDeterministicRegistryTelemetry(limit)
      : [];
    return {
      success: true,
      definitions,
      telemetry
    };
  }

  async function handleGetInferenceBackend() {
    const backend = getCodingInferenceBackend();
    const appDir = getRuntimeContext()?.appDir || null;
    return {
      success: true,
      backend,
      availability: appDir ? inferenceManager.getBackendAvailability(appDir) : null
    };
  }

  async function handleSetInferenceBackend(event, backendValue) {
    const normalized = normalizeCodingInferenceBackend(backendValue);
    codingTerminalCommon.updateConfig({ inferenceBackend: normalized });
    const appDir = getRuntimeContext()?.appDir || null;
    if (normalized !== 'ollama') {
      await closeTerminalOllamaSession();
      await closeRouterOllamaSession();
    } else {
      await closeTerminalLlamaSession();
      await closeRouterLlamaSession();
      await closeRagOllamaSession();
    }
    let warmup = null;
    if (normalized === 'llama-cpp') {
      const cfg = codingTerminalCommon.getConfig ? codingTerminalCommon.getConfig() : {};
      if (String(cfg?.llamaCppModelPath || '').trim()) {
        const t0 = Date.now();
        const ready = await ensureTerminalLlamaReady();
        warmup = {
          attempted: true,
          success: !!ready?.success,
          elapsedMs: Math.max(0, Date.now() - t0),
          error: ready?.success ? null : String(ready?.error || 'warmup failed')
        };
      }
    }
    return {
      success: true,
      backend: normalized,
      availability: appDir ? inferenceManager.getBackendAvailability(appDir) : null,
      warmup
    };
  }

  async function handleSendInferenceMessages(_event, payload = {}) {
    const backend = getCodingInferenceBackend();
    const requestedModel = String(payload?.modelName || '').trim();
    const messages = Array.isArray(payload?.messages) ? payload.messages : [];
    const extraOptions = (payload?.options && typeof payload.options === 'object') ? payload.options : {};
    if (messages.length === 0) {
      return { success: false, message: 'messages are required' };
    }

    const ready = backend === 'llama-cpp'
      ? await ensureTerminalLlamaReady({ sender: _event?.sender || null })
      : await ensureTerminalOllamaReady();
    if (!ready?.success) {
      return { success: false, message: ready?.error || `Failed to initialize ${backend}` };
    }

    const activePort = backend === 'llama-cpp'
      ? startupTools.getTerminalLlamaPort()
      : startupTools.getTerminalOllamaPort();
    const modelName = requestedModel || String(codingTerminalCommon.getConfig().modelName || '').trim();
    if (!modelName) {
      return { success: false, message: 'No model configured for coding-terminal transport' };
    }

    const reply = await sendInferenceMessage(modelName, messages, {
      ...extraOptions,
      backend,
      port: activePort
    });
    if (!reply?.success) return reply;
    return {
      success: true,
      backend,
      port: activePort,
      modelName,
      response: reply.response || null
    }
  }

  return {
    handleGetConfig,
    handleUpdateConfig,
    handleGetPipelineEvents,
    handleGetPlanRuns,
    handleGetDeterministicRegistry,
    handleGetInferenceBackend,
    handleSetInferenceBackend,
    handleSendInferenceMessages
  };
}

module.exports = createIpcRuntimeHandlers;
