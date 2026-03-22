/**
 * Coding Terminal renderer chat stream helpers.
 */
(function() {
  'use strict';

  async function maybeRunRlmAssist(options = {}) {
    const {
      state,
      rlmController,
      message,
      shellId,
      finalizeMessage,
      api,
      addSystemMessage,
      setInlineActivity,
      updateStreamingUi,
      STOP_REASON_MESSAGES
    } = options;
    const shouldRunRlm = (
      state.rlmAssisted === true &&
      rlmController &&
      typeof rlmController.runSingleStep === 'function' &&
      /(attachment|attachments|attached|file|files|document|documents|doc|docs|pdf|epub|markdown|md)\b/i.test(String(message || '').toLowerCase()) &&
      /(summari[sz]e|analy[sz]e|review|inspect|read|extract|search|find|quote|compare|list)\b/i.test(String(message || '').toLowerCase())
    );
    if (!shouldRunRlm) return { handled: false };

    const rlmResult = await rlmController.runSingleStep(message, [], '');
    if (rlmResult && rlmResult.handled) {
      finalizeMessage(shellId, String(rlmResult.answer || ''));
      api.pushModelTrace?.('rlm deterministic answer', String(rlmResult.answer || ''));
      const cov = rlmResult?.toolResult?.output?.coverage;
      const coverageNote = cov && Number.isFinite(cov.processedRatio)
        ? ` coverage=${Math.round(cov.processedRatio * 100)}% (${cov.processedChunks}/${cov.totalChunks} chunks)`
        : '';
      const traceTools = Array.isArray(rlmResult?.executedTools) && rlmResult.executedTools.length > 0
        ? rlmResult.executedTools.join(' -> ')
        : 'unknown';
      const stopNote = rlmResult?.stopReason ? ` stop=${rlmResult.stopReason}` : '';
      addSystemMessage(`RLM Trace: tool=${traceTools} source=deterministic${coverageNote}${stopNote}`);
      if (rlmResult?.stopReason && STOP_REASON_MESSAGES[rlmResult.stopReason]) {
        addSystemMessage(`RLM Notice: ${STOP_REASON_MESSAGES[rlmResult.stopReason]}`);
      }
      state.streaming = false;
      state.activeMessageShellId = null;
      state.activeThinkingBuffer = '';
      api.updateStatus('model', 'Ready');
      setInlineActivity(false, 'Thinking');
      updateStreamingUi();
      return { handled: true };
    }
    if (rlmResult && rlmResult.error) {
      addSystemMessage(`RLM fallback: ${rlmResult.error}`);
    }
    return { handled: false };
  }

  function processStreamStart(options = {}) {
    const {
      start,
      state,
      shellId,
      updateAssistantThinking,
      addSystemMessage,
      api,
      setAssistantShellRole,
      updateStreamingUi,
      setInlineActivity
    } = options;

    const rewrite = String(start?.dispatch?.rewrittenMessage || '').trim();
    const rewriteSource = String(start?.dispatch?.rewriteSource || '').trim();
    const routerModel = String(start?.dispatch?.dispatcherModel || '').trim();
    const routerPort = start?.dispatch?.dispatcherPort ? `@${start.dispatch.dispatcherPort}` : '';
    if (rewrite) {
      const routeTag = routerModel ? `${routerModel}${routerPort}` : 'router';
      const sourceTag = rewriteSource ? ` [${rewriteSource}]` : '';
      const intentTag = start?.dispatch?.intentClass ? ` intent=${start.dispatch.intentClass}` : '';
      const strategyTag = start?.dispatch?.executionStrategy ? ` strategy=${start.dispatch.executionStrategy}` : '';
      const selectionTag = start?.dispatch?.coderSelectionReason ? ` coder=${start.dispatch.coderSelectionReason}` : '';
      const routerThinking = `Router rewrite (${routeTag})${sourceTag}:\n${rewrite}`;
      state.activeThinkingBuffer = state.activeThinkingBuffer
        ? `${state.activeThinkingBuffer}\n\n${routerThinking}`
        : routerThinking;
      updateAssistantThinking(shellId, state.activeThinkingBuffer);
      api.pushModelTrace?.(
        `router rewrite (${String(start?.dispatch?.dispatcherModel || 'router')})${intentTag}${strategyTag}${selectionTag}`,
        rewrite
      );
    } else if (start?.dispatch?.used && routerModel) {
      addSystemMessage(`Router (${routerModel}${routerPort}) -> ${start.modelName} (no rewrite text returned)`);
      api.pushModelTrace?.(
        `router used (${routerModel}${routerPort})`,
        'no rewrite text returned'
      );
    } else if (start?.dispatch?.coderSelectionReason && start.dispatch.coderSelectionReason !== 'configured-model') {
      api.pushModelTrace?.(
        'coder selection',
        `model=${String(start.modelName || '')} reason=${String(start.dispatch.coderSelectionReason)}`
      );
    }

    if (start?.routingDebug) {
      const d = start.routingDebug;
      api.addRouterDebugEntry?.({
        model: start?.dispatch?.dispatcherModel || 'router',
        reason: start?.dispatch?.reason || '',
        parse: start?.dispatch?.routerParseMode || '',
        rewriteSource: start?.dispatch?.rewriteSource || '',
        rawHash: d.originalHash || '',
        rawLen: d.originalLen || 0,
        rewriteHash: d.rewriteHash || '',
        rewriteLen: d.rewriteLen || 0
      });
      addSystemMessage(
        `Route Proof: original ${d.originalHash || 'n/a'}/${d.originalLen || 0} | ` +
        `rewrite ${d.rewriteHash || 'none'}/${d.rewriteLen || 0} | ` +
        `to-coder ${d.effectiveHash || 'n/a'}/${d.effectiveLen || 0}`
      );
      if (d.requestId || d.traceId) {
        addSystemMessage(
          `Trace IDs: request=${d.requestId || 'n/a'} | trace=${d.traceId || 'n/a'} | terminal=${d.terminalId || 'n/a'}`
        );
      }
    }

    setAssistantShellRole(shellId, start.modelName || 'assistant');
    api.setActiveModelTrace?.({
      modelName: start.modelName || 'assistant',
      phase: 'streaming',
      rewrite: rewrite || ''
    });
    state.activeStreamId = start.streamId;
    updateStreamingUi();
    api.updateStatus('model', 'Processing...');
    setInlineActivity(true, 'Streaming');
  }

  window.CodingTerminalRendererChatStream = {
    maybeRunRlmAssist,
    processStreamStart
  };
})();
