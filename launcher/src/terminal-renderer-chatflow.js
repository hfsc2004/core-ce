/**
 *
 * @version 1.1.3 - March 5, 2026
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
    const getProvider = typeof deps?.getProvider === 'function' ? deps.getProvider : () => 'ollama';
    const getProviderBaseUrl = typeof deps?.getProviderBaseUrl === 'function' ? deps.getProviderBaseUrl : () => '';
    const getProviderApiKey = typeof deps?.getProviderApiKey === 'function' ? deps.getProviderApiKey : () => '';
    const getProviderModelId = typeof deps?.getProviderModelId === 'function' ? deps.getProviderModelId : () => '';
    const getLlamaCppModelPath = typeof deps?.getLlamaCppModelPath === 'function' ? deps.getLlamaCppModelPath : () => '';
    const addAssistantShell = typeof deps?.addAssistantShell === 'function' ? deps.addAssistantShell : (() => null);
    const setActiveStream = typeof deps?.setActiveStream === 'function' ? deps.setActiveStream : (() => {});
    const getChatDisplay = typeof deps?.getChatDisplay === 'function' ? deps.getChatDisplay : () => null;
    const finalizeStreamingMessage = typeof deps?.finalizeStreamingMessage === 'function' ? deps.finalizeStreamingMessage : (() => {});
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
    function normalizeProvider(value) {
      const raw = String(value || '').trim().toLowerCase();
      if (raw === 'llamacpp') return 'llama.cpp';
      return raw || 'ollama';
    }
    function defaultBaseUrl(provider) {
      if (provider === 'llama.cpp') return 'http://127.0.0.1:8080';
      if (provider === 'vllm') return 'http://127.0.0.1:8000';
      if (provider === 'openai-compatible') return 'http://127.0.0.1:8000';
      return '';
    }
    function resolveProviderRuntime() {
      const provider = normalizeProvider(getProvider());
      const baseUrl = String(getProviderBaseUrl() || '').trim() || defaultBaseUrl(provider);
      const apiKey = String(getProviderApiKey() || '').trim();
      const providerModel = String(getProviderModelId() || '').trim();
      const llamaCppModelPath = String(getLlamaCppModelPath() || '').trim();
      return { provider, baseUrl, apiKey, providerModel, llamaCppModelPath };
    }
    function isTransientProviderError(provider, message) {
      const p = String(provider || '').trim().toLowerCase();
      const text = String(message || '').toLowerCase();
      if (!text) return false;
      if (text.includes('generation stopped')) return false;
      if (p === 'llama.cpp') {
        if (text.includes('loading model')) return true;
        if (text.includes('network error')) return true;
        if (text.includes('http 503')) return true;
        if (text.includes('unavailable_error')) return true;
      }
      return false;
    }
    async function waitMs(ms) {
      const duration = Math.max(0, Number(ms) || 0);
      if (!duration) return;
      await new Promise((resolve) => setTimeout(resolve, duration));
    }
    function buildOpenAIStyleMessages(messages = []) {
      return (Array.isArray(messages) ? messages : []).map((m) => ({
        role: String(m?.role || 'user'),
        content: String(m?.content || '')
      }));
    }
    function extractProviderDelta(parsed = {}) {
      const choice = parsed?.choices?.[0] || {};
      const delta = choice?.delta;
      if (delta && typeof delta.content === 'string') return delta.content;
      if (choice?.message && typeof choice.message.content === 'string') return choice.message.content;
      if (typeof parsed?.content === 'string') return parsed.content;
      if (typeof parsed?.text === 'string') return parsed.text;
      return '';
    }
    async function streamViaProvider(providerRuntime, messages = []) {
      const options = buildOllamaOptions();
      const model = String(providerRuntime.providerModel || getCurrentModel() || '').trim();
      const api = getElectronAPI();
      let endpointBase = String(providerRuntime.baseUrl || '').trim().replace(/\/+$/, '');
      const headers = { 'Content-Type': 'application/json' };
      if (providerRuntime.apiKey) headers.Authorization = `Bearer ${providerRuntime.apiKey}`;

      if (providerRuntime.provider === 'exllamav2') {
        return { success: false, message: 'Provider "exllamav2" is not implemented yet in PSF Terminal.' };
      }
      if (!endpointBase && providerRuntime.provider !== 'ollama') {
        return { success: false, message: `Provider "${providerRuntime.provider}" requires Base URL.` };
      }
      if ((providerRuntime.provider === 'vllm' || providerRuntime.provider === 'openai-compatible') && !model) {
        return { success: false, message: `Provider "${providerRuntime.provider}" requires a model id (select model or set Provider Model ID).` };
      }

      if (providerRuntime.provider === 'llama.cpp') {
        if (!api || typeof api.ensureTerminalLlamaCppSession !== 'function') {
          return { success: false, message: 'BMOC llama.cpp session API is unavailable in this build.' };
        }
        const sessionResult = await api.ensureTerminalLlamaCppSession({
          modelPath: providerRuntime.llamaCppModelPath,
          modelName: model || '',
          contextSize: options?.num_ctx,
          gpuLayers: options?.num_gpu
        });
        if (!sessionResult?.success) {
          return {
            success: false,
            message: sessionResult?.message || 'Failed to start BMOC llama.cpp terminal session.'
          };
        }
        if (sessionResult?.reused === false && String(sessionResult?.chatTemplate || '').trim()) {
          addSystemMessage(`llama.cpp chat template: ${String(sessionResult.chatTemplate)}`);
        }
        const port = Number(sessionResult.port || sessionResult.ollamaPort || 0);
        endpointBase = String(sessionResult.baseUrl || (port > 0 ? `http://127.0.0.1:${port}` : '')).trim().replace(/\/+$/, '');
      }

      const body = {
        model: model || 'local-model',
        messages: buildOpenAIStyleMessages(messages),
        temperature: options.temperature,
        stream: true
      };
      if (options.top_p !== undefined) body.top_p = options.top_p;
      if (options.top_k !== undefined) body.top_k = options.top_k;
      if (options.num_predict !== undefined) body.max_tokens = options.num_predict;
      if (options.stop !== undefined) body.stop = options.stop;

      const assistantContentDiv = addAssistantShell();
      const abortController = new AbortController();
      setActiveStream({
        content: '',
        contentDiv: assistantContentDiv,
        userMessage: messages[messages.length - 1]?.content || '',
        port: getTerminalPort(),
        provider: providerRuntime.provider,
        abortController
      });

      let response;
      try {
        response = await fetch(`${endpointBase}/v1/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: abortController.signal
        });
      } catch (err) {
        if (abortController.signal.aborted || getStreamStopRequested()) {
          return { success: false, stopped: true, message: 'Generation stopped.' };
        }
        return { success: false, message: err?.message || String(err) };
      }
      if (!response.ok) {
        const text = await response.text();
        return { success: false, message: `HTTP ${response.status} - ${text}` };
      }
      if (!response.body || typeof response.body.getReader !== 'function') {
        const text = await response.text();
        let parsed = {};
        try { parsed = JSON.parse(text || '{}'); } catch {}
        const content = String(parsed?.choices?.[0]?.message?.content || '').trim();
        if (!content) return { success: false, message: 'No assistant content returned by provider.' };
        return { success: true, message: content };
      }

      const decoder = new TextDecoder();
      const reader = response.body.getReader();
      let buffer = '';
      let full = '';
      let doneSeen = false;
      try {
        while (true) {
          if (getStreamStopRequested()) {
            abortController.abort();
            break;
          }
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let lineBreak;
          while ((lineBreak = buffer.indexOf('\n')) >= 0) {
            let line = buffer.slice(0, lineBreak);
            buffer = buffer.slice(lineBreak + 1);
            line = line.trim();
            if (!line) continue;
            if (line.startsWith('data:')) line = line.slice(5).trim();
            if (!line) continue;
            if (line === '[DONE]') {
              doneSeen = true;
              break;
            }
            let parsed;
            try {
              parsed = JSON.parse(line);
            } catch (_) {
              continue;
            }
            const delta = extractProviderDelta(parsed);
            if (!delta) continue;
            full += delta;
            const active = getActiveStream();
            if (active && active.contentDiv) active.contentDiv.textContent = full;
            const chat = getChatDisplay();
            if (chat) chat.scrollTop = chat.scrollHeight;
          }
          if (doneSeen) break;
        }
      } catch (err) {
        if (!abortController.signal.aborted && !getStreamStopRequested()) {
          return { success: false, message: err?.message || String(err) };
        }
      } finally {
        try { reader.releaseLock(); } catch (_) {}
      }

      const content = String(full || '').trim();
      if (getStreamStopRequested()) {
        return { success: false, stopped: true, message: 'Generation stopped.' };
      }
      if (!content) {
        return { success: false, message: 'No assistant content returned by provider.' };
      }
      return { success: true, message: content };
    }
    async function sendViaProvider(providerRuntime, messages = []) {
      const options = buildOllamaOptions();
      const model = String(providerRuntime.providerModel || getCurrentModel() || '').trim();
      const api = getElectronAPI();
      let endpointBase = String(providerRuntime.baseUrl || '').trim().replace(/\/+$/, '');
      const headers = { 'Content-Type': 'application/json' };
      if (providerRuntime.apiKey) headers.Authorization = `Bearer ${providerRuntime.apiKey}`;

      if (providerRuntime.provider === 'exllamav2') {
        return { success: false, message: 'Provider "exllamav2" is not implemented yet in PSF Terminal.' };
      }
      if (!endpointBase && providerRuntime.provider !== 'ollama') {
        return { success: false, message: `Provider "${providerRuntime.provider}" requires Base URL.` };
      }
      if ((providerRuntime.provider === 'vllm' || providerRuntime.provider === 'openai-compatible') && !model) {
        return { success: false, message: `Provider "${providerRuntime.provider}" requires a model id (select model or set Provider Model ID).` };
      }

      if (providerRuntime.provider === 'llama.cpp') {
        if (!api || typeof api.ensureTerminalLlamaCppSession !== 'function') {
          return { success: false, message: 'BMOC llama.cpp session API is unavailable in this build.' };
        }
        const sessionResult = await api.ensureTerminalLlamaCppSession({
          modelPath: providerRuntime.llamaCppModelPath,
          modelName: model || '',
          contextSize: options?.num_ctx,
          gpuLayers: options?.num_gpu
        });
        if (!sessionResult?.success) {
          return {
            success: false,
            message: sessionResult?.message || 'Failed to start BMOC llama.cpp terminal session.'
          };
        }
        if (sessionResult?.reused === false && String(sessionResult?.chatTemplate || '').trim()) {
          addSystemMessage(`llama.cpp chat template: ${String(sessionResult.chatTemplate)}`);
        }
        const port = Number(sessionResult.port || sessionResult.ollamaPort || 0);
        endpointBase = String(sessionResult.baseUrl || (port > 0 ? `http://127.0.0.1:${port}` : '')).trim().replace(/\/+$/, '');
      }

      if (providerRuntime.provider === 'llama.cpp' || providerRuntime.provider === 'vllm' || providerRuntime.provider === 'openai-compatible') {
        const body = {
          model: model || 'local-model',
          messages: buildOpenAIStyleMessages(messages),
          temperature: options.temperature
        };
        if (options.top_p !== undefined) body.top_p = options.top_p;
        if (options.top_k !== undefined) body.top_k = options.top_k;
        if (options.num_predict !== undefined) body.max_tokens = options.num_predict;
        if (options.stop !== undefined) body.stop = options.stop;
        const response = await fetch(`${endpointBase}/v1/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body)
        });
        const text = await response.text();
        if (!response.ok) {
          return { success: false, message: `HTTP ${response.status} - ${text}` };
        }
        let parsed = {};
        try { parsed = JSON.parse(text || '{}'); } catch {
          return { success: false, message: 'Provider returned non-JSON response.' };
        }
        const content = String(parsed?.choices?.[0]?.message?.content || '').trim();
        if (!content) return { success: false, message: 'No assistant content returned by provider.' };
        return { success: true, message: content };
      }

      return { success: false, message: `Unsupported provider: ${providerRuntime.provider}` };
    }

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
      let message = String(userInput?.value || '').trim();
      if (!message) return;
      let localOnly = false;
      if (/^\/local(?:\s+|$)/i.test(message)) {
        localOnly = true;
        message = message.replace(/^\/local\s*/i, '').trim();
        if (!message) {
          addErrorMessage('Usage: /local <message>');
          if (userInput) userInput.value = '';
          return;
        }
      }

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
      if (localOnly) {
        addSystemMessage('Local-only turn: response will stay in this terminal.');
      }
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

      const providerRuntime = resolveProviderRuntime();
      if (providerRuntime.provider !== 'ollama') {
        setThinkingStatusText(`Calling ${providerRuntime.provider}`);
        try {
          const maxAttempts = providerRuntime.provider === 'llama.cpp' ? 4 : 1;
          let result = null;
          for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            result = await streamViaProvider(providerRuntime, messages);
            if (result?.success || result?.stopped) break;
            if (!isTransientProviderError(providerRuntime.provider, result?.message || '')) break;
            if (attempt >= maxAttempts) break;
            const delayMs = 900 * attempt;
            addSystemMessage(`Provider warming up (${attempt}/${maxAttempts - 1} retries)...`);
            await waitMs(delayMs);
          }
          if (result && result.success) {
            const assistantMessage = sanitizeQwenSelfDialogue(result.message || '');
            const finalAssistantMessage = localOnly
              ? `{local} ${assistantMessage}`
              : assistantMessage;
            const active = getActiveStream();
            if (active && active.contentDiv) {
              finalizeStreamingMessage(active.contentDiv, finalAssistantMessage);
            }
            appendConversationPair(message, finalAssistantMessage, { skipRelay: localOnly });
          } else if (result && result.stopped) {
            addSystemMessage('⏹️ Generation stopped.');
          } else {
            addErrorMessage(`Provider error: ${(result && result.message) || 'unknown error'}`);
          }
        } catch (error) {
          addErrorMessage(`Provider error: ${error?.message || String(error)}`);
        } finally {
          setActiveStream(null);
          setWaitingState(false);
          setStreamStopRequested(false);
          focusInput();
        }
        return;
      }

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
              const rlmAnswer = localOnly ? `{local} ${rlmResult.answer}` : rlmResult.answer;
              addMessage('assistant', rlmAnswer);
              appendConversationPair(message, rlmAnswer, { skipRelay: localOnly });
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
                const rlmAnswer = localOnly ? `{local} ${rlmResult.answer}` : rlmResult.answer;
                addMessage('assistant', rlmAnswer);
                appendConversationPair(message, rlmAnswer, { skipRelay: localOnly });
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
          localOnly,
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
            addErrorMessage(result && result.message ? result.message : 'Failed to start stream from local model server');
            setActiveStream(null);
            setWaitingState(false);
          }
        } catch (error) {
          if (getStreamStopRequested()) {
            setStreamStopRequested(false);
            return;
          }
          console.error('[Terminal] Stream send error:', error);
          addErrorMessage(`Error: ${error.message || 'Failed to start streaming from local model server'}`);
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
          const finalAssistantMessage = localOnly
            ? `{local} ${assistantMessage}`
            : assistantMessage;
          addMessage('assistant', finalAssistantMessage);
          appendConversationPair(message, finalAssistantMessage, { skipRelay: localOnly });
        } else {
          addErrorMessage('Failed to get response from local model server');
        }
      } catch (error) {
        console.error('[Terminal] Send message error:', error);
        addErrorMessage(`Error: ${error.message || 'Failed to communicate with local model server'}`);
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
