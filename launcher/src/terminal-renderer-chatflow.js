/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
(function() {
  'use strict';

  function createChatFlowController(deps) {
    const getUserInput = typeof deps?.getUserInput === 'function' ? deps.getUserInput : () => null;
    const addInputRecallEntry = typeof deps?.addInputRecallEntry === 'function' ? deps.addInputRecallEntry : (() => {});
    const handleCommand = typeof deps?.handleCommand === 'function' ? deps.handleCommand : (async () => {});
    const getActiveStream = typeof deps?.getActiveStream === 'function' ? deps.getActiveStream : () => null;
    const setWaitingState = typeof deps?.setWaitingState === 'function' ? deps.setWaitingState : (() => {});
    const addSystemMessage = typeof deps?.addSystemMessage === 'function' ? deps.addSystemMessage : (() => {});
    const addMessage = typeof deps?.addMessage === 'function' ? deps.addMessage : (() => {});
    const getSystemPrompt = typeof deps?.getSystemPrompt === 'function' ? deps.getSystemPrompt : () => null;
    const buildAttachmentContext = typeof deps?.buildAttachmentContext === 'function' ? deps.buildAttachmentContext : (async () => '');
    const shouldInjectAttachmentContext = typeof deps?.shouldInjectAttachmentContext === 'function' ? deps.shouldInjectAttachmentContext : (() => false);
    const getConversationHistory = typeof deps?.getConversationHistory === 'function' ? deps.getConversationHistory : () => [];
    const appendConversationPair = typeof deps?.appendConversationPair === 'function' ? deps.appendConversationPair : (() => {});
    const getCurrentModel = typeof deps?.getCurrentModel === 'function' ? deps.getCurrentModel : () => null;
    const buildOllamaOptions = typeof deps?.buildOllamaOptions === 'function' ? deps.buildOllamaOptions : (() => ({}));
    const addAssistantShell = typeof deps?.addAssistantShell === 'function' ? deps.addAssistantShell : (() => null);
    const setActiveStream = typeof deps?.setActiveStream === 'function' ? deps.setActiveStream : (() => {});
    const getTerminalPort = typeof deps?.getTerminalPort === 'function' ? deps.getTerminalPort : () => 0;
    const getElectronAPI = typeof deps?.getElectronAPI === 'function' ? deps.getElectronAPI : () => (window.electronAPI || null);
    const sanitizeQwenSelfDialogue = typeof deps?.sanitizeQwenSelfDialogue === 'function' ? deps.sanitizeQwenSelfDialogue : ((v) => String(v || ''));
    const addErrorMessage = typeof deps?.addErrorMessage === 'function' ? deps.addErrorMessage : (() => {});
    const focusInput = typeof deps?.focusInput === 'function' ? deps.focusInput : (() => {});
    const setStreamStopRequested = typeof deps?.setStreamStopRequested === 'function' ? deps.setStreamStopRequested : (() => {});
    const getStreamStopRequested = typeof deps?.getStreamStopRequested === 'function' ? deps.getStreamStopRequested : () => false;
    const getRlmAssisted = typeof deps?.getRlmAssisted === 'function' ? deps.getRlmAssisted : () => false;
    const getRlmController = typeof deps?.getRlmController === 'function' ? deps.getRlmController : () => null;
    const getRlmProvider = typeof deps?.getRlmProvider === 'function' ? deps.getRlmProvider : () => 'legacy';
    const runRlmTurn = typeof deps?.runRlmTurn === 'function' ? deps.runRlmTurn : (async () => ({ success: false, handled: false, error: 'rlm engine unavailable' }));
    const getRlmVerboseTrace = typeof deps?.getRlmVerboseTrace === 'function' ? deps.getRlmVerboseTrace : () => false;
    const getRlmQuality = typeof deps?.getRlmQuality === 'function' ? deps.getRlmQuality : () => 'balanced';
    const getRlmBudgets = typeof deps?.getRlmBudgets === 'function' ? deps.getRlmBudgets : () => ({});
    const getRlmIncludeSharedAttachments = typeof deps?.getRlmIncludeSharedAttachments === 'function'
      ? deps.getRlmIncludeSharedAttachments
      : () => false;
    const setThinkingStatusText = typeof deps?.setThinkingStatusText === 'function' ? deps.setThinkingStatusText : (() => {});
    const STOP_REASON_MESSAGES = {
      max_runtime_ms: 'Stopped at time limit. Increase profile or enable Advanced budgets.',
      max_tool_calls: 'Stopped at planning-step limit. Increase profile or enable Advanced budgets.',
      max_chunks_processed: 'Stopped at document-coverage limit. Increase profile or enable Advanced budgets.',
      max_evidence_hits: 'Stopped at evidence-sampling limit. Increase profile or enable Advanced budgets.',
      max_recursion_depth: 'Stopped at reasoning-depth limit. Increase profile or enable Advanced budgets.'
    };

    function shouldRunRlm(message) {
      const text = String(message || '').trim();
      if (!text) return false;
      const lower = text.toLowerCase();

      // Do not run planner/tools for simple chit-chat.
      if (/^(hi|hello|hey|yo|sup|hola|howdy|good (morning|afternoon|evening)|thanks|thank you|ok|okay)[!. ]*$/i.test(text)) {
        return false;
      }

      // Trigger only for file/attachment intents.
      const hasSource = /(attachment|attachments|attached|file|files|document|documents|doc|docs|pdf|markdown|md)\b/i.test(lower);
      const hasAction = /(summari[sz]e|analy[sz]e|review|inspect|read|extract|search|find|quote|compare|list)\b/i.test(lower);
      const directAttachmentAsk = /(from (the )?attached|from attachments?|in (the )?attachment|attached file)/i.test(lower);
      const provider = String(getRlmProvider() || 'legacy').trim().toLowerCase();
      const hasCodeIntent = /(write|generate|create|program|build)\s+(a\s+)?(python|script|function|program|code)\b/i.test(lower)
        || /\bpython\b/i.test(lower);

      if ((hasSource && hasAction) || directAttachmentAsk) return true;
      if (provider === 'engine' && hasCodeIntent) return true;
      return false;
    }

    async function sendMessage() {
      const userInput = getUserInput();
      const message = String(userInput?.value || '').trim();
      if (!message) return;

      addInputRecallEntry(message);

      if (message.startsWith('/')) {
        await handleCommand(message);
        if (userInput) userInput.value = '';
        return;
      }

      if (getActiveStream()) {
        addSystemMessage('⚠️ Still streaming previous response. Please wait or use /clear to reset.');
        return;
      }

      setWaitingState(true);
      setThinkingStatusText('Preparing request');
      addMessage('user', message);

      const messages = [];
      const systemParts = [];
      const systemPrompt = getSystemPrompt();
      if (systemPrompt) {
        systemParts.push(systemPrompt);
      }
      setThinkingStatusText('Reading attachments');
      const attachmentContext = await buildAttachmentContext();
      if (attachmentContext && shouldInjectAttachmentContext(message)) {
        systemParts.push(`Attached context (verbatim snippets from user-attached files):\n${attachmentContext}`);
      }
      if (systemParts.length > 0) {
        messages.push({ role: 'system', content: systemParts.join('\n\n') });
      }
      messages.push(...getConversationHistory());
      messages.push({ role: 'user', content: message });

      const imagePayload = await buildImagePayloadForUserMessage({
        api: getElectronAPI(),
        port: getTerminalPort(),
        modelName: getCurrentModel(),
        setThinkingStatusText,
        addSystemMessage
      });
      if (imagePayload && imagePayload.images && imagePayload.images.length > 0) {
        messages[messages.length - 1].images = imagePayload.images;
      }

      if (userInput) userInput.value = '';

      if (getRlmAssisted() === true && shouldRunRlm(message)) {
        setThinkingStatusText('Running RLM tools');
        const provider = String(getRlmProvider() || 'legacy').trim().toLowerCase();
        if (provider === 'engine') {
          try {
            const rlmResult = await runRlmTurn({
              message,
              conversationHistory: getConversationHistory(),
              systemPrompt: getSystemPrompt() || '',
              options: {
                modelName: getCurrentModel(),
                port: getTerminalPort(),
                engineMode: 'mit-loop',
                quality: getRlmQuality(),
                budgets: getRlmBudgets(),
                includeSharedAttachments: getRlmIncludeSharedAttachments(),
                sharedAttachmentSessionId: 'terminal-shared'
              }
            });
            if (rlmResult && rlmResult.handled) {
              addMessage('assistant', rlmResult.answer);
              appendConversationPair(message, rlmResult.answer);
              const cov = rlmResult?.toolResult?.output?.coverage;
              const coverageNote = cov && Number.isFinite(cov.processedRatio)
                ? ` coverage=${Math.round(cov.processedRatio * 100)}% (${cov.processedChunks}/${cov.totalChunks} chunks)`
                : '';
              const traceTools = Array.isArray(rlmResult?.executedTools) && rlmResult.executedTools.length > 0
                ? rlmResult.executedTools.join(' -> ')
                : (Array.isArray(rlmResult?.steps) && rlmResult.steps.length > 0
                  ? rlmResult.steps.map((s) => s.tool).join(' -> ')
                  : (rlmResult?.plan?.tool || 'unknown'));
              const stopNote = rlmResult?.stopReason ? ` stop=${rlmResult.stopReason}` : '';
              const modeNote = rlmResult?.plan?.mode ? ` mode=${rlmResult.plan.mode}` : ' mode=engine';
              addSystemMessage(`RLM Trace: tool=${traceTools} source=deterministic${coverageNote}${stopNote}`);
              addSystemMessage(`RLM Engine:${modeNote}`);
              if (rlmResult?.stopReason && STOP_REASON_MESSAGES[rlmResult.stopReason]) {
                addSystemMessage(`RLM Notice: ${STOP_REASON_MESSAGES[rlmResult.stopReason]}`);
              }
              if (getRlmVerboseTrace() === true) {
                if (rlmResult?.plan) {
                  addSystemMessage(`RLM Plan JSON: ${JSON.stringify(rlmResult.plan)}`);
                }
                if (Array.isArray(rlmResult?.trace)) {
                  rlmResult.trace.forEach((line) => addSystemMessage(`RLM Step: ${line}`));
                }
              }
              setWaitingState(false);
              focusInput();
              return;
            }
            if (rlmResult && rlmResult.error) {
              addSystemMessage(`RLM engine fallback: ${rlmResult.error}`);
            }
          } catch (err) {
            addSystemMessage(`RLM engine fallback: ${err.message || err}`);
          }
        } else {
          const rlm = getRlmController();
          if (rlm && typeof rlm.runSingleStep === 'function') {
            try {
              const rlmResult = await rlm.runSingleStep(message, getConversationHistory(), getSystemPrompt() || '');
              if (rlmResult && rlmResult.handled) {
                addMessage('assistant', rlmResult.answer);
                appendConversationPair(message, rlmResult.answer);
                const cov = rlmResult?.toolResult?.output?.coverage;
                const coverageNote = cov && Number.isFinite(cov.processedRatio)
                  ? ` coverage=${Math.round(cov.processedRatio * 100)}% (${cov.processedChunks}/${cov.totalChunks} chunks)`
                  : '';
                const traceTools = Array.isArray(rlmResult?.executedTools) && rlmResult.executedTools.length > 0
                  ? rlmResult.executedTools.join(' -> ')
                  : (Array.isArray(rlmResult?.steps) && rlmResult.steps.length > 0
                    ? rlmResult.steps.map((s) => s.tool).join(' -> ')
                    : (rlmResult?.plan?.tool || 'unknown'));
                const stopNote = rlmResult?.stopReason ? ` stop=${rlmResult.stopReason}` : '';
                addSystemMessage(`RLM Trace: tool=${traceTools} source=deterministic${coverageNote}${stopNote}`);
                if (rlmResult?.stopReason && STOP_REASON_MESSAGES[rlmResult.stopReason]) {
                  addSystemMessage(`RLM Notice: ${STOP_REASON_MESSAGES[rlmResult.stopReason]}`);
                }
                if (getRlmVerboseTrace() === true) {
                  if (rlmResult?.plan) {
                    addSystemMessage(`RLM Plan JSON: ${JSON.stringify(rlmResult.plan)}`);
                  }
                  if (Array.isArray(rlmResult?.trace)) {
                    rlmResult.trace.forEach((line) => addSystemMessage(`RLM Step: ${line}`));
                  }
                }
                setWaitingState(false);
                focusInput();
                return;
              }
              if (rlmResult && rlmResult.error) {
                addSystemMessage(`RLM fallback: ${rlmResult.error}`);
              }
            } catch (err) {
              addSystemMessage(`RLM fallback: ${err.message || err}`);
            }
          }
        }
      }

      const api = getElectronAPI();
      const hasStreamingSupport =
        api &&
        typeof api.ollamaSendMessageStream === 'function' &&
        typeof api.onOllamaStreamData === 'function';

      if (hasStreamingSupport) {
        setThinkingStatusText('Connecting to model');
        const assistantContentDiv = addAssistantShell();
        setActiveStream({
          content: '',
          contentDiv: assistantContentDiv,
          userMessage: message,
          port: getTerminalPort(),
          ttsPreviewSpoken: false
        });
        setStreamStopRequested(false);

        try {
          const result = await api.ollamaSendMessageStream(
            getCurrentModel(),
            messages,
            buildOllamaOptions()
          );
          setThinkingStatusText('Streaming');
          if (!result || result.success === false) {
            addErrorMessage(result && result.message ? result.message : 'Failed to start stream from Ollama');
            setActiveStream(null);
            setWaitingState(false);
          }
        } catch (error) {
          if (getStreamStopRequested()) {
            setStreamStopRequested(false);
            return;
          }
          console.error('[Terminal] Stream send error:', error);
          addErrorMessage(`Error: ${error.message || 'Failed to start streaming from Ollama'}`);
          setActiveStream(null);
          setWaitingState(false);
        } finally {
          focusInput();
        }
        return;
      }

      try {
        setThinkingStatusText('Waiting for model');
        const result = await api.ollamaSendMessage(
          getCurrentModel(),
          messages,
          buildOllamaOptions()
        );

        if (result.success && result.response && result.response.message) {
          const assistantMessage = sanitizeQwenSelfDialogue(result.response.message.content);
          addMessage('assistant', assistantMessage);
          appendConversationPair(message, assistantMessage);
        } else {
          addErrorMessage('Failed to get response from Ollama');
        }
      } catch (error) {
        console.error('[Terminal] Send message error:', error);
        addErrorMessage(`Error: ${error.message || 'Failed to communicate with Ollama'}`);
      } finally {
        setWaitingState(false);
        focusInput();
      }
    }

    function isVisionModel(modelName) {
      const n = String(modelName || '').toLowerCase();
      return (
        n.includes('vision') ||
        n.includes('-vl') ||
        n.includes('llava') ||
        n.includes('bakllava') ||
        n.includes('minicpm-v') ||
        n.includes('moondream') ||
        n.includes('gemma-3-4b-it-mm') ||
        /gemma[-_ ]?3.*\bmm\b/.test(n) ||
        /qwen.*vl/.test(n)
      );
    }

    function isImageAttachment(item) {
      const mime = String(item?.mimeType || '').toLowerCase();
      const name = String(item?.displayName || item?.originalName || '').toLowerCase();
      if (mime.startsWith('image/')) return true;
      return (
        name.endsWith('.png') ||
        name.endsWith('.jpg') ||
        name.endsWith('.jpeg') ||
        name.endsWith('.webp') ||
        name.endsWith('.gif') ||
        name.endsWith('.bmp')
      );
    }

    async function buildImagePayloadForUserMessage({ api, port, modelName, setThinkingStatusText, addSystemMessage }) {
      if (!api || typeof api.terminalAttachmentsList !== 'function' || typeof api.terminalAttachmentsReadBytes !== 'function') {
        return null;
      }
      let list;
      try {
        list = await api.terminalAttachmentsList({ port });
      } catch {
        return null;
      }
      const attachments = Array.isArray(list?.attachments) ? list.attachments : [];
      const imageItems = attachments.filter(isImageAttachment).slice(0, 3);
      if (imageItems.length === 0) return null;

      if (!isVisionModel(modelName)) {
        addSystemMessage('Image attachments detected, but selected model is not vision-capable. Switch to a vision model to analyze images.');
        return null;
      }

      const images = [];
      setThinkingStatusText('Loading image attachments');
      for (const item of imageItems) {
        try {
          const read = await api.terminalAttachmentsReadBytes({
            port,
            attachmentId: item.id,
            maxBytes: 8 * 1024 * 1024
          });
          const b64 = String(read?.bytesBase64 || '').trim();
          if (!read?.success || !b64) continue;
          images.push(b64);
        } catch {
          // keep going
        }
      }
      return images.length > 0 ? { images } : null;
    }

    return {
      sendMessage
    };
  }

  window.TerminalChatFlow = {
    createChatFlowController
  };
})();
