/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
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
  function isCliToolIntent(message = "") {
    const text = String(message || "").toLowerCase();
    return [
      'cli tool',
      'cli-tool',
      'cli_tool',
      'cli agent',
      'cli-agent',
      'cli_agent',
      'write_file',
      'read_file',
      'run_tests',
      'list_files',
      'search_code',
      'read_file_chunk',
      'apply_patch',
      'tool.write_file',
      'tool.read_file',
      'tool.run_tests',
      'tool.list_files',
      'tool.search_code',
      'tool.read_file_chunk',
      'tool.apply_patch',
      'tool.verify',
      'verify'
    ].some((token) => text.includes(token));
  }

  register('coding-terminal:send-message', async (event, message) => {
    try {
      codingTerminalCommon.addMessage('user', message);
      const dispatchMode = deps.getChatDispatchMode ? deps.getChatDispatchMode(message) : { mode: 'auto' };
      const runtimeCfg = codingTerminalCommon.getConfig ? codingTerminalCommon.getConfig() : {};
      const cliIntent = isCliToolIntent(message);
      const cliAgentEnabled = runtimeCfg?.cliAgentEnabled === true;
      const deterministicEnabled = runtimeCfg?.deterministicFileRead === true && !cliAgentEnabled && !cliIntent;
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
        let content = proof ? `${deterministic.content}\n\n${proof}` : deterministic.content;
        if (typeof deps.postProcessAssistantText === 'function') {
          const processed = await deps.postProcessAssistantText({
            text: content,
            streamId,
            modelName: 'deterministic-file-read',
            sender: event.sender,
            mode: 'stream'
          });
          if (processed && typeof processed.text === 'string') content = processed.text;
        }
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
      const preparedForRun = (typeof deps.applyCliAgentContext === 'function')
        ? (deps.applyCliAgentContext(prepared) || prepared)
        : prepared;
      if (preparedForRun?.deterministicResult) {
        const deterministicContent = String(preparedForRun.deterministicResult.content || '');
        const deterministicSources = Array.isArray(preparedForRun.deterministicResult.sources)
          ? preparedForRun.deterministicResult.sources
          : [];
        const deterministicModelName = String(preparedForRun?.modelName || 'deterministic-file-read');
        const deterministicDispatch = preparedForRun.dispatch || { mode: 'inspect', used: false };
        const proof = deps.formatGroundingProofFooter
          ? deps.formatGroundingProofFooter({
              modelName: deterministicModelName,
              sources: deterministicSources,
              grounding: preparedForRun.grounding || { enabled: true },
              dispatch: deterministicDispatch
            })
          : '';
        let content = proof ? `${deterministicContent}\n\n${proof}` : deterministicContent;
        if (typeof deps.postProcessAssistantText === 'function') {
          const processed = await deps.postProcessAssistantText({
            text: content,
            modelName: deterministicModelName,
            sender: event.sender,
            mode: 'non-stream'
          });
          if (processed && typeof processed.text === 'string') content = processed.text;
        }
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
      const selectedModel = preparedForRun.modelName;
      const history = preparedForRun.messages || [];
      const sources = Array.isArray(preparedForRun.sources) ? preparedForRun.sources : [];
      const exactFileContext = preparedForRun?.grounding?.exactFileContext || null;
      const groundedAnalysisMode = !!preparedForRun?.grounding?.enabled;
      const generationOptions = preparedForRun?.generationOptions || {};

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
        const verdict = deps.validateGroundedAnalysis(content, exactFileContext, preparedForRun.grounding || null);
        if (!verdict.ok) {
          if (preparedForRun?.grounding?.rewriteMode) {
            const warning = deps.buildGroundingFailureMessage
              ? deps.buildGroundingFailureMessage(verdict, exactFileContext)
              : `Grounded rewrite warning: ${verdict.reason || 'rewrite-validation-failed'}`;
            content = `${content}\n\n[Validation warning]\n${warning}`;
          }
        } else if (preparedForRun?.grounding?.rewriteMode && verdict?.applied?.content) {
          const lang = verdict?.applied?.language ? String(verdict.applied.language) : '';
          content = `~~~${lang}\n${verdict.applied.content}\n~~~`;
        }
      }
      const strictVerdict = enforceStrictOutputContract(content, preparedForRun.dispatch || dispatchMode);
      if (!strictVerdict.ok) {
        const strictOutput = String((preparedForRun.dispatch || dispatchMode)?.strictOutput || '').trim().toLowerCase();
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
        dispatch: preparedForRun.dispatch || dispatchMode
      });
      if (!replacementVerdict.ok) {
        content = `${content}\n\n[Validation warning]\n${replacementVerdict.error}`;
      }
      const noExtraEditsVerdict = validateNoExtraEditsForReplacements({
        userMessage: message,
        outputText: content,
        dispatch: preparedForRun.dispatch || dispatchMode,
        exactFileContext
      });
      if (!noExtraEditsVerdict.ok) {
        content = `${content}\n\n[Validation warning]\n${noExtraEditsVerdict.error}`;
      }
      const proof = deps.formatGroundingProofFooter
          ? deps.formatGroundingProofFooter({
            modelName: selectedModel,
            sources,
            grounding: preparedForRun.grounding || null,
            dispatch: preparedForRun.dispatch || dispatchMode
          })
        : '';
      if (proof) content = `${content}\n\n${proof}`;
      const cliAgentEnabledForTurn = runtimeCfg?.cliAgentEnabled === true;
      if (!cliAgentEnabledForTurn && typeof deps.postProcessAssistantText === 'function') {
        const processed = await deps.postProcessAssistantText({
          text: content,
          modelName: selectedModel,
          sender: event.sender,
          mode: 'non-stream'
        });
        if (processed && typeof processed.text === 'string') content = processed.text;
      }
      if (cliAgentEnabledForTurn && typeof deps.runCliAgentAutonomousTurn === 'function') {
        const looped = await deps.runCliAgentAutonomousTurn({
          text: content,
          userPrompt: message,
          modelName: selectedModel,
          history,
          sendModelMessage: (model, messages, options = {}) => deps.ollamaManager.sendMessage(model, messages, options),
          sendOptions: {
            port: activePort,
            keep_alive: constants.OLLAMA_KEEP_ALIVE,
            ...generationOptions
          },
          sender: event.sender
        });
        if (looped && typeof looped.text === 'string') content = looped.text;
      }
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
      const cliIntent = isCliToolIntent(message);
      const cliAgentEnabled = cfg?.cliAgentEnabled === true;
      const deterministicEnabled = cfg?.deterministicFileRead === true && !cliAgentEnabled && !cliIntent;
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
        let content = proof ? `${deterministic.content}\n\n${proof}` : deterministic.content;
        if (typeof deps.postProcessAssistantText === 'function') {
          const processed = await deps.postProcessAssistantText({
            text: content,
            modelName: 'deterministic-file-read',
            sender: event.sender,
            mode: 'non-stream'
          });
          if (processed && typeof processed.text === 'string') content = processed.text;
        }
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
      const preparedForRun = (typeof deps.applyCliAgentContext === 'function')
        ? (deps.applyCliAgentContext(prepared) || prepared)
        : prepared;
      if (preparedForRun?.deterministicResult) {
        const deterministicContent = String(preparedForRun.deterministicResult.content || '');
        const deterministicSources = Array.isArray(preparedForRun.deterministicResult.sources)
          ? preparedForRun.deterministicResult.sources
          : [];
        const deterministicModelName = String(preparedForRun?.modelName || 'deterministic-file-read');
        const deterministicDispatch = preparedForRun.dispatch || { mode: 'inspect', used: false };
        const proof = deps.formatGroundingProofFooter
          ? deps.formatGroundingProofFooter({
              modelName: deterministicModelName,
              sources: deterministicSources,
              grounding: preparedForRun.grounding || { enabled: true },
              dispatch: deterministicDispatch
            })
          : '';
        let content = proof ? `${deterministicContent}\n\n${proof}` : deterministicContent;
        if (typeof deps.postProcessAssistantText === 'function') {
          const processed = await deps.postProcessAssistantText({
            text: content,
            streamId,
            modelName: deterministicModelName,
            sender: event.sender,
            mode: 'stream'
          });
          if (processed && typeof processed.text === 'string') content = processed.text;
        }
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
        modelName: preparedForRun.modelName,
        messages: preparedForRun.messages,
        sources: preparedForRun.sources || [],
        grounding: preparedForRun.grounding || null,
        dispatch: preparedForRun.dispatch || dispatchMode,
        generationOptions: preparedForRun.generationOptions || {},
        originalUserMessage: message,
        port: backend === 'llama-cpp' ? llamaPort : ollamaPort,
        backend,
        sender: event.sender
      });

      return {
        success: true,
        streamId,
        modelName: preparedForRun.modelName,
        sources: preparedForRun.sources || [],
        grounding: preparedForRun.grounding || null,
        dispatch: preparedForRun.dispatch || null,
        routingDebug: preparedForRun.routingDebug || null
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
