/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
function createModelsRouterTools(deps = {}) {
  const {
    getInferenceBackend,
    codingTerminalCommon,
    ensureRouterOllamaReady,
    ensureRouterLlamaReady,
    getRouterOllamaPort,
    getRouterLlamaPort,
    withTimeout,
    listInferenceModels,
    sendInferenceMessage,
    sanitizeAssistantText,
    pipelineTools,
    defaultRouterModel,
    routerSystemPrompt,
    OLLAMA_KEEP_ALIVE,
    resolveConfiguredModel,
    normalizeRouterMode,
    parseDispatcherDecision,
    coerceRouterDecisionForUserIntent,
    validateRouterContract
  } = deps;

  function buildRouterInferenceOptions(cfg = {}, backend = 'ollama', port = null) {
    const asNumber = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const options = {
      port,
      keep_alive: OLLAMA_KEEP_ALIVE,
      backend
    };
    const temperature = asNumber(cfg.routerTemperature);
    const topP = asNumber(cfg.routerTopP);
    const topK = asNumber(cfg.routerTopK);
    const repeatPenalty = asNumber(cfg.routerRepeatPenalty);
    const numPredict = asNumber(cfg.routerNumPredict);
    const numCtx = asNumber(cfg.routerNumCtx);
    const seed = asNumber(cfg.routerSeed);
    options.temperature = temperature !== null ? temperature : 0;
    options.num_predict = numPredict !== null ? numPredict : 256;
    if (topP !== null) options.top_p = topP;
    if (topK !== null) options.top_k = topK;
    if (repeatPenalty !== null) options.repeat_penalty = repeatPenalty;
    if (numCtx !== null) options.num_ctx = numCtx;
    if (seed !== null) options.seed = seed;
    return options;
  }

  async function requestRouterSelfCorrection({
    dispatcherModel,
    originalMessage,
    currentRewrite,
    currentReason,
    fixedCoderModel,
    groundedAnalysisMode,
    hasExactFileContext,
    port,
    timeoutMs,
    backend = 'ollama',
    cfg = {}
  }) {
    try {
      const repairSystemPrompt =
        'You are repairing a failed router translation. ' +
        'Output JSON only with keys: reason, rewrittenMessage, taskMode, strictOutput. ' +
        'Preserve user intent exactly. Keep mentioned filenames. ' +
        'Do not import unrelated example text.';
      const repairReply = await withTimeout(
        sendInferenceMessage(
          dispatcherModel,
          [
            { role: 'system', content: repairSystemPrompt },
            {
              role: 'user',
              content:
                `Original user message:\n${String(originalMessage || '').slice(0, 4000)}\n\n` +
                `Previous rewrite (invalid):\n${String(currentRewrite || '').slice(0, 4000)}\n\n` +
                `Invalid reason: ${String(currentReason || '').slice(0, 200)}\n` +
                `Grounded file analysis: ${groundedAnalysisMode ? 'yes' : 'no'}\n` +
                `Exact file context attached: ${hasExactFileContext ? 'yes' : 'no'}\n` +
                `Fixed coder model: ${fixedCoderModel}\n` +
                'Return corrected JSON only.'
            }
          ],
          buildRouterInferenceOptions(cfg, backend, port)
        ),
        timeoutMs,
        `Router self-correction timeout after ${timeoutMs}ms`
      );
      if (!repairReply?.success || repairReply?.response?.error) return { rawText: '' };
      const rawText = sanitizeAssistantText(
        repairReply?.response?.message?.content ||
        repairReply?.response?.message?.reasoning ||
        repairReply?.response?.message?.reasoning_content ||
        repairReply?.response?.message?.thinking ||
        repairReply?.response?.response ||
        repairReply?.response?.content ||
        ''
      );
      return { rawText: String(rawText || '').trim() };
    } catch {
      return { rawText: '' };
    }
  }

  async function routeModelViaRouter({
    message,
    selectedModel,
    groundedAnalysisMode,
    hasExactFileContext,
    pipelineContext = null
  }) {
    try {
      const backend = String(getInferenceBackend() || 'ollama').toLowerCase();
      const cfg = codingTerminalCommon.getConfig();
      if (cfg?.testMode === true) {
        return { used: false, reason: 'test-mode', modelName: selectedModel };
      }
      const routerMode = normalizeRouterMode(cfg);
      if (routerMode === 'off') {
        return { used: false, reason: 'router-disabled', modelName: selectedModel };
      }

      const routerReady = backend === 'ollama'
        ? await ensureRouterOllamaReady()
        : await ensureRouterLlamaReady();
      if (!routerReady.success) {
        return { used: false, reason: 'router-session-unavailable', modelName: selectedModel };
      }
      const dispatcherPreferred = cfg.routerModelName || cfg.dispatcherModelName || defaultRouterModel;
      const routerPort = backend === 'ollama' ? getRouterOllamaPort() : getRouterLlamaPort();
      const routerModelsResult = await withTimeout(
        listInferenceModels({ port: routerPort, backend }),
        5000,
        'Router model list timeout'
      );
      const routerModelNames = routerModelsResult?.success && Array.isArray(routerModelsResult.models)
        ? routerModelsResult.models.map((m) => m.name || '').filter(Boolean)
        : [];
      let dispatcherModel = resolveConfiguredModel(dispatcherPreferred, routerModelNames);
      if (!dispatcherModel && backend === 'llama-cpp') {
        dispatcherModel = dispatcherPreferred || selectedModel;
      }
      if (!dispatcherModel) {
        return { used: false, reason: 'dispatcher-model-not-found', modelName: selectedModel };
      }

      const fixedCoderModel = String(selectedModel || '').trim();
      if (!fixedCoderModel) {
        return { used: false, reason: 'missing-selected-model', modelName: selectedModel };
      }

      const routerInferenceOptions = buildRouterInferenceOptions(cfg, backend, routerPort);
      const effectiveRouterSystemPrompt = String(cfg?.routerSystemPrompt || '').trim() || routerSystemPrompt;
      const timeoutMs = Math.max(2000, Math.min(Number(cfg.routerTimeoutMs || cfg.dispatcherTimeoutMs) || 8000, 30000));
      const routerRequestEnvelope = pipelineTools?.createMailboxEnvelope({
        from: `coding-terminal:${pipelineContext?.terminalId || cfg?.terminalId || 'local'}`,
        to: `router:${dispatcherModel}`,
        type: 'router.translate.request',
        correlationId: pipelineContext?.requestId || '',
        payload: {
          model: dispatcherModel,
          fixedCoderModel,
          groundedAnalysisMode: !!groundedAnalysisMode,
          hasExactFileContext: !!hasExactFileContext,
          userMessageLen: String(message || '').length
        },
        ttlMs: timeoutMs,
        attempt: 1
      }) || null;
      if (routerRequestEnvelope && pipelineTools?.appendPipelineEvent) {
        pipelineTools.appendPipelineEvent({
          kind: 'router.request',
          requestId: pipelineContext?.requestId || '',
          traceId: pipelineContext?.traceId || '',
          envelope: routerRequestEnvelope
        });
      }
      const routerMessages = [
        { role: 'system', content: effectiveRouterSystemPrompt },
        {
          role: 'user',
          content:
            `User message:\n${String(message || '').slice(0, 4000)}\n\n` +
            `Grounded file analysis: ${groundedAnalysisMode ? 'yes' : 'no'}\n` +
            `Exact file context attached: ${hasExactFileContext ? 'yes' : 'no'}\n` +
            `User-selected coding model (fixed target, do not change): ${fixedCoderModel}\n` +
            'Model routing is disabled in this mode. Rewrite/normalize the message only.\n\n' +
            'Return JSON only.'
        }
      ];
      let dispatcherReply;
      try {
        dispatcherReply = await withTimeout(
          sendInferenceMessage(
            dispatcherModel,
            routerMessages,
            routerInferenceOptions
          ),
          timeoutMs,
          `Router timeout after ${timeoutMs}ms`
        );
      } catch (err) {
        const msg = String(err?.message || '');
        if (!/timeout/i.test(msg)) throw err;
        const retryTimeoutMs = Math.min(30000, Math.max(timeoutMs + 4000, Math.floor(timeoutMs * 1.75)));
        dispatcherReply = await withTimeout(
          sendInferenceMessage(
            dispatcherModel,
            routerMessages,
            routerInferenceOptions
          ),
          retryTimeoutMs,
          `Router timeout after retry ${retryTimeoutMs}ms`
        );
      }

      if (!dispatcherReply?.success || dispatcherReply?.response?.error) {
        return { used: false, reason: 'dispatcher-request-failed', modelName: selectedModel };
      }

      const dispatcherText = sanitizeAssistantText(
        dispatcherReply?.response?.message?.content ||
        dispatcherReply?.response?.message?.reasoning ||
        dispatcherReply?.response?.message?.reasoning_content ||
        dispatcherReply?.response?.message?.thinking ||
        dispatcherReply?.response?.response ||
        dispatcherReply?.response?.content ||
        ''
      );
      let rewriteSource = 'router-primary';
      let parsed = parseDispatcherDecision(dispatcherText);
      parsed = coerceRouterDecisionForUserIntent(parsed, message);
      let contractVerdict = validateRouterContract({
        parsed,
        originalMessage: message,
        hasExactFileContext,
        groundedAnalysisMode,
        enforceSchema: routerMode === 'on'
      });
      if (!contractVerdict.ok && routerMode === 'on') {
        const corrected = await requestRouterSelfCorrection({
          dispatcherModel,
          originalMessage: message,
          currentRewrite: String(parsed?.rewrittenMessage || ''),
          currentReason: contractVerdict.reason || 'invalid-contract',
          fixedCoderModel,
          groundedAnalysisMode,
          hasExactFileContext,
          port: routerPort,
          timeoutMs: Math.max(2000, Math.floor(timeoutMs * 0.7)),
          backend,
          cfg
        });
        if (corrected?.rawText) {
          const correctedParsed = parseDispatcherDecision(corrected.rawText);
          const correctedCoerced = coerceRouterDecisionForUserIntent(correctedParsed, message);
          const correctedVerdict = validateRouterContract({
            parsed: correctedCoerced,
            originalMessage: message,
            hasExactFileContext,
            groundedAnalysisMode,
            enforceSchema: true
          });
          if (correctedVerdict.ok) {
            parsed = correctedCoerced;
            contractVerdict = correctedVerdict;
            rewriteSource = 'router-self-corrected';
          }
        }
      }
      const routerResponseEnvelope = pipelineTools?.createMailboxEnvelope({
        from: `router:${dispatcherModel}`,
        to: `coding-terminal:${pipelineContext?.terminalId || cfg?.terminalId || 'local'}`,
        type: 'router.translate.response',
        correlationId: pipelineContext?.requestId || '',
        payload: {
          rewriteSource,
          contractOk: contractVerdict.ok,
          contractReason: contractVerdict.reason || '',
          strictOutput: parsed?.strictOutput || '',
          taskMode: parsed?.taskMode || '',
          intentClass: parsed?.intentClass || '',
          executionStrategy: parsed?.executionStrategy || '',
          rewriteLen: String(parsed?.rewrittenMessage || '').length
        },
        ttlMs: timeoutMs,
        attempt: 1
      }) || null;
      if (routerResponseEnvelope && pipelineTools?.appendPipelineEvent) {
        pipelineTools.appendPipelineEvent({
          kind: 'router.response',
          requestId: pipelineContext?.requestId || '',
          traceId: pipelineContext?.traceId || '',
          envelope: routerResponseEnvelope
        });
      }
      return {
        used: true,
        reason: contractVerdict.ok
          ? (parsed?.reason || (dispatcherText ? 'translator-parse-failed' : 'translator-empty-output'))
          : `translator-invalid-contract:${contractVerdict.reason || 'invalid'}`,
        contractOk: !!contractVerdict.ok,
        contractReason: contractVerdict.reason || '',
        dispatcherModel,
        dispatcherPort: routerPort,
        modelName: fixedCoderModel,
        targetModel: fixedCoderModel,
        rewrittenMessage: contractVerdict.ok ? (parsed?.rewrittenMessage || '') : '',
        taskMode: parsed?.taskMode || '',
        strictOutput: parsed?.strictOutput || '',
        intentClass: parsed?.intentClass || '',
        executionStrategy: parsed?.executionStrategy || '',
        rewriteSource,
        routerParseMode: parsed?.parseMode || '',
        routerRewritePreview: String(parsed?.rewrittenMessage || '').slice(0, 320),
        routerRawPreview: dispatcherText ? dispatcherText.slice(0, 320) : '',
        translationOnly: true,
        mailbox: {
          request: routerRequestEnvelope,
          response: routerResponseEnvelope
        }
      };
    } catch (err) {
      return {
        used: false,
        reason: 'dispatcher-exception',
        routerError: String(err?.message || 'unknown-router-exception'),
        modelName: selectedModel
      };
    }
  }

  return {
    routeModelViaRouter
  };
}

module.exports = createModelsRouterTools;
