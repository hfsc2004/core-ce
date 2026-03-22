/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
/**
 * PSF Coding Terminal - Chat IPC Handlers
 */
const {
  extractAssistantResponseText,
  buildEmptyReplyDiagnostic,
  restoreOriginalUserMessage,
  enforceStrictOutputContract,
  validateReplacementEditsInOutput,
  validateNoExtraEditsForReplacements,
  trySynthesizeUnifiedDiffFromModelOutput
} = require('./coding-terminal-ipc-chat-utils');

function registerChatHandlers({
  register,
  codingTerminalCommon,
  constants,
  deps
}) {
  register('coding-terminal:send-message', async (event, message) => {
    try {
      codingTerminalCommon.addMessage('user', message);
      const dispatchMode = deps.getChatDispatchMode ? deps.getChatDispatchMode(message) : { mode: 'auto' };
      const runtimeCfg = codingTerminalCommon.getConfig ? codingTerminalCommon.getConfig() : {};
      const deterministicEnabled = runtimeCfg?.deterministicFileRead === true;
      const deterministic = (deterministicEnabled && dispatchMode.mode !== 'generate')
        ? await deps.tryHandleDeterministicFileRequest(message)
        : null;
      if (deterministic) {
        const proof = deps.formatGroundingProofFooter
          ? deps.formatGroundingProofFooter({
              modelName: 'deterministic-file-read',
              sources: deterministic.sources || [],
              grounding: { enabled: true },
              dispatch: { mode: 'inspect', used: false }
            })
          : '';
        const content = proof ? `${deterministic.content}\n\n${proof}` : deterministic.content;
        codingTerminalCommon.addMessage('assistant', content);
        return {
          id: codingTerminalCommon.generateId(),
          content,
          sources: deterministic.sources || []
        };
      }

      const prepared = await deps.prepareChatRequest(message, { sender: event.sender });
      if (!prepared?.success) {
        return {
          id: codingTerminalCommon.generateId(),
          content: `Error: ${prepared?.error || 'Unable to prepare chat request.'}`,
          sources: []
        };
      }
      if (prepared?.deterministicResult) {
        const deterministicContent = String(prepared.deterministicResult.content || '');
        const deterministicSources = Array.isArray(prepared.deterministicResult.sources)
          ? prepared.deterministicResult.sources
          : [];
        const deterministicModelName = String(prepared?.modelName || 'deterministic-file-read');
        const deterministicDispatch = prepared.dispatch || { mode: 'inspect', used: false };
        const proof = deps.formatGroundingProofFooter
          ? deps.formatGroundingProofFooter({
              modelName: deterministicModelName,
              sources: deterministicSources,
              grounding: prepared.grounding || { enabled: true },
              dispatch: deterministicDispatch
            })
          : '';
        const content = proof ? `${deterministicContent}\n\n${proof}` : deterministicContent;
        codingTerminalCommon.addMessage('assistant', content);
        return {
          id: codingTerminalCommon.generateId(),
          content,
          sources: deterministicSources
        };
      }

      const port = deps.getTerminalOllamaPort();
      const backend = deps.getInferenceBackend ? deps.getInferenceBackend() : 'ollama';
      const activePort = backend === 'llama-cpp'
        ? (deps.getTerminalLlamaPort ? deps.getTerminalLlamaPort() : null)
        : port;
      const selectedModel = prepared.modelName;
      const history = prepared.messages || [];
      const sources = Array.isArray(prepared.sources) ? prepared.sources : [];
      const exactFileContext = prepared?.grounding?.exactFileContext || null;
      const groundedAnalysisMode = !!prepared?.grounding?.enabled;
      const generationOptions = prepared?.generationOptions || {};

      const cfg = codingTerminalCommon.getConfig();
      const isFirstResponse = history.length <= 1;
      const chatTimeoutMs = isFirstResponse
        ? (cfg.firstResponseTimeoutMs || 120000)
        : (cfg.responseTimeoutMs || 45000);

      const reply = await deps.withTimeout(
        deps.ollamaManager.sendMessage(selectedModel, history, {
          port: activePort,
          keep_alive: constants.OLLAMA_KEEP_ALIVE,
          ...generationOptions
        }),
        chatTimeoutMs,
        `Ollama chat timeout after ${chatTimeoutMs}ms`
      );

      if (!reply?.success) {
        return {
          id: codingTerminalCommon.generateId(),
          content: `${backend} request failed on port ${activePort}: ${reply?.message || 'Unknown error'}`,
          sources
        };
      }

      if (reply?.response?.error) {
        return {
          id: codingTerminalCommon.generateId(),
          content: `${backend} error (${selectedModel} @ ${activePort}): ${reply.response.error}`,
          sources
        };
      }

      let content = extractAssistantResponseText(reply);
      if (!content || !content.trim()) {
        return {
          id: codingTerminalCommon.generateId(),
          content: buildEmptyReplyDiagnostic(reply, selectedModel, activePort, backend),
          sources
        };
      }
      if (groundedAnalysisMode && exactFileContext) {
        const verdict = deps.validateGroundedAnalysis(content, exactFileContext, prepared.grounding || null);
        if (!verdict.ok) {
          if (prepared?.grounding?.rewriteMode) {
            const warning = deps.buildGroundingFailureMessage
              ? deps.buildGroundingFailureMessage(verdict, exactFileContext)
              : `Grounded rewrite warning: ${verdict.reason || 'rewrite-validation-failed'}`;
            content = `${content}\n\n[Validation warning]\n${warning}`;
          }
        } else if (prepared?.grounding?.rewriteMode && verdict?.applied?.content) {
          const lang = verdict?.applied?.language ? String(verdict.applied.language) : '';
          content = `~~~${lang}\n${verdict.applied.content}\n~~~`;
        }
      }
      const strictVerdict = enforceStrictOutputContract(content, prepared.dispatch || dispatchMode);
      if (!strictVerdict.ok) {
        const strictOutput = String((prepared.dispatch || dispatchMode)?.strictOutput || '').trim().toLowerCase();
        if (strictOutput === 'unified_diff') {
          const synthesized = trySynthesizeUnifiedDiffFromModelOutput({
            outputText: content,
            exactFileContext
          });
          if (synthesized) {
            content = `${synthesized}\n\n[Validation warning]\nstrictOutput=unified_diff: synthesized diff from authoritative file + model full-file output.`;
          } else {
            content = `${content}\n\n[Validation error]\n${strictVerdict.error || 'strictOutput validation failed.'}`;
          }
        } else {
          content = `${content}\n\n[Validation error]\n${strictVerdict.error || 'strictOutput validation failed.'}`;
        }
      } else {
        content = strictVerdict.text;
        if (strictVerdict.warning) {
          content = `${content}\n\n[Validation warning]\n${strictVerdict.warning}`;
        }
      }
      const replacementVerdict = validateReplacementEditsInOutput({
        userMessage: message,
        outputText: content,
        dispatch: prepared.dispatch || dispatchMode
      });
      if (!replacementVerdict.ok) {
        content = `${content}\n\n[Validation warning]\n${replacementVerdict.error}`;
      }
      const noExtraEditsVerdict = validateNoExtraEditsForReplacements({
        userMessage: message,
        outputText: content,
        dispatch: prepared.dispatch || dispatchMode,
        exactFileContext
      });
      if (!noExtraEditsVerdict.ok) {
        content = `${content}\n\n[Validation warning]\n${noExtraEditsVerdict.error}`;
      }
      const proof = deps.formatGroundingProofFooter
        ? deps.formatGroundingProofFooter({
            modelName: selectedModel,
            sources,
            grounding: prepared.grounding || null,
            dispatch: prepared.dispatch || dispatchMode
          })
        : '';
      if (proof) content = `${content}\n\n${proof}`;
      codingTerminalCommon.addMessage('assistant', content);
      return {
        id: codingTerminalCommon.generateId(),
        content,
        sources
      };
    } catch (err) {
      console.error('[CodingTerminal:IPC:Chat] Send message error:', err);
      return {
        id: codingTerminalCommon.generateId(),
        content: `Error: ${err.message}`,
        sources: []
      };
    }
  });

  register('coding-terminal:send-message-stream', async (event, message) => {
    try {
      codingTerminalCommon.addMessage('user', message);
      const streamId = codingTerminalCommon.generateId();

      const dispatchMode = deps.getChatDispatchMode ? deps.getChatDispatchMode(message) : { mode: 'auto' };
      const cfg = codingTerminalCommon.getConfig ? codingTerminalCommon.getConfig() : {};
      const deterministicEnabled = cfg?.deterministicFileRead === true;
      const deterministic = (deterministicEnabled && dispatchMode.mode !== 'generate')
        ? await deps.tryHandleDeterministicFileRequest(message)
        : null;
      if (deterministic) {
        const proof = deps.formatGroundingProofFooter
          ? deps.formatGroundingProofFooter({
              modelName: 'deterministic-file-read',
              sources: deterministic.sources || [],
              grounding: { enabled: true },
              dispatch: { mode: 'inspect', used: false }
            })
          : '';
        const content = proof ? `${deterministic.content}\n\n${proof}` : deterministic.content;
        codingTerminalCommon.addMessage('assistant', content);
        setTimeout(() => {
          event.sender.send('coding-terminal:stream-data', {
            streamId,
            modelName: 'deterministic-file-read',
            chunk: content,
            kind: 'answer'
          });
          event.sender.send('coding-terminal:stream-done', {
            streamId,
            modelName: 'deterministic-file-read',
            text: content,
            thinking: '',
            sources: deterministic.sources || []
          });
        }, 0);
        return { success: true, streamId, modelName: 'deterministic-file-read', sources: deterministic.sources || [] };
      }

      const prepared = await deps.prepareChatRequest(message, { sender: event.sender });
      if (!prepared.success) {
        event.sender.send('coding-terminal:stream-error', {
          streamId,
          error: prepared.error
        });
        return { success: false, streamId, error: prepared.error };
      }
      if (prepared?.deterministicResult) {
        const deterministicContent = String(prepared.deterministicResult.content || '');
        const deterministicSources = Array.isArray(prepared.deterministicResult.sources)
          ? prepared.deterministicResult.sources
          : [];
        const deterministicModelName = String(prepared?.modelName || 'deterministic-file-read');
        const deterministicDispatch = prepared.dispatch || { mode: 'inspect', used: false };
        const proof = deps.formatGroundingProofFooter
          ? deps.formatGroundingProofFooter({
              modelName: deterministicModelName,
              sources: deterministicSources,
              grounding: prepared.grounding || { enabled: true },
              dispatch: deterministicDispatch
            })
          : '';
        const content = proof ? `${deterministicContent}\n\n${proof}` : deterministicContent;
        codingTerminalCommon.addMessage('assistant', content);
        setTimeout(() => {
          event.sender.send('coding-terminal:stream-data', {
            streamId,
            modelName: deterministicModelName,
            chunk: content,
            kind: 'answer'
          });
          event.sender.send('coding-terminal:stream-done', {
            streamId,
            modelName: deterministicModelName,
            text: content,
            thinking: '',
            sources: deterministicSources
          });
        }, 0);
        return { success: true, streamId, modelName: deterministicModelName, sources: deterministicSources };
      }

      const backend = deps.getInferenceBackend ? deps.getInferenceBackend() : 'ollama';
      const ollamaPort = deps.getTerminalOllamaPort();
      const llamaPort = deps.getTerminalLlamaPort ? deps.getTerminalLlamaPort() : null;
      deps.streamFromBackend({
        streamId,
        modelName: prepared.modelName,
        messages: prepared.messages,
        sources: prepared.sources || [],
        grounding: prepared.grounding || null,
        dispatch: prepared.dispatch || dispatchMode,
        generationOptions: prepared.generationOptions || {},
        originalUserMessage: message,
        port: backend === 'llama-cpp' ? llamaPort : ollamaPort,
        backend,
        sender: event.sender
      });

      return {
        success: true,
        streamId,
        modelName: prepared.modelName,
        sources: prepared.sources || [],
        grounding: prepared.grounding || null,
        dispatch: prepared.dispatch || null,
        routingDebug: prepared.routingDebug || null
      };
    } catch (err) {
      console.error('[CodingTerminal:IPC:Chat] Stream start error:', err);
      return { success: false, error: err.message };
    }
  });

  register('coding-terminal:stop-stream', async (event, streamId = null) => {
    try {
      const activeStreamRequests = deps.getActiveStreamRequests();
      if (streamId) {
        const req = activeStreamRequests.get(streamId);
        if (!req) return { success: false, message: 'Stream not found' };
        req.destroy(new Error('Stream stopped by user'));
        activeStreamRequests.delete(streamId);
        return { success: true, stopped: 1 };
      }

      let stopped = 0;
      for (const [id, req] of activeStreamRequests.entries()) {
        try {
          req.destroy(new Error('Stream stopped by user'));
          stopped += 1;
        } catch {}
        activeStreamRequests.delete(id);
      }
      return { success: true, stopped };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  register('coding-terminal:get-history', async (event, limit = 0) => {
    return codingTerminalCommon.getHistory(limit);
  });

  register('coding-terminal:clear-history', async () => {
    codingTerminalCommon.clearHistory();
    return { success: true };
  });
}

module.exports = {
  registerChatHandlers
};
