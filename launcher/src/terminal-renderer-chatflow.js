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
    const hasKnownAttachments = typeof deps?.hasKnownAttachments === 'function' ? deps.hasKnownAttachments : (() => false);
    const getConversationHistory = typeof deps?.getConversationHistory === 'function' ? deps.getConversationHistory : () => [];
    const appendConversationPair = typeof deps?.appendConversationPair === 'function' ? deps.appendConversationPair : (() => {});
    const getCurrentModel = typeof deps?.getCurrentModel === 'function' ? deps.getCurrentModel : () => null;
    const buildOllamaOptions = typeof deps?.buildOllamaOptions === 'function' ? deps.buildOllamaOptions : (() => ({}));
    const getProvider = typeof deps?.getProvider === 'function' ? deps.getProvider : () => 'ollama';
    const getProviderBaseUrl = typeof deps?.getProviderBaseUrl === 'function' ? deps.getProviderBaseUrl : () => '';
    const getProviderApiKey = typeof deps?.getProviderApiKey === 'function' ? deps.getProviderApiKey : () => '';
    const getProviderModelId = typeof deps?.getProviderModelId === 'function' ? deps.getProviderModelId : () => '';
    const getLlamaCppModelPath = typeof deps?.getLlamaCppModelPath === 'function' ? deps.getLlamaCppModelPath : () => '';
    const getLlamaCppForceCpu = typeof deps?.getLlamaCppForceCpu === 'function' ? deps.getLlamaCppForceCpu : () => false;
    const setTerminalPort = typeof deps?.setTerminalPort === 'function' ? deps.setTerminalPort : (() => {});
    const setProviderBaseUrl = typeof deps?.setProviderBaseUrl === 'function' ? deps.setProviderBaseUrl : (() => {});
    const addAssistantShell = typeof deps?.addAssistantShell === 'function' ? deps.addAssistantShell : (() => null);
    const setActiveStream = typeof deps?.setActiveStream === 'function' ? deps.setActiveStream : (() => {});
    const getChatDisplay = typeof deps?.getChatDisplay === 'function' ? deps.getChatDisplay : () => null;
    const finalizeStreamingMessage = typeof deps?.finalizeStreamingMessage === 'function' ? deps.finalizeStreamingMessage : (() => {});
    const getAttachmentSessionId = typeof deps?.getAttachmentSessionId === 'function' ? deps.getAttachmentSessionId : () => '';
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
    const runRlmStartSession = typeof deps?.runRlmStartSession === 'function'
      ? deps.runRlmStartSession
      : (async () => ({ success: false, error: 'rlmStartSession API unavailable' }));
    const runRlmTurn = typeof deps?.runRlmTurn === 'function' ? deps.runRlmTurn : (async () => ({ success: false, handled: false, error: 'rlm engine unavailable' }));
    const runRlmLoop = typeof deps?.runRlmLoop === 'function'
      ? deps.runRlmLoop
      : (async () => ({
        success: false,
        handled: false,
        error: 'recursive RLM bridge unavailable; restart PSF Core and open a fresh Terminal window'
      }));
    const getRlmVerboseTrace = typeof deps?.getRlmVerboseTrace === 'function' ? deps.getRlmVerboseTrace : () => false;
    const getRlmQuality = typeof deps?.getRlmQuality === 'function' ? deps.getRlmQuality : () => 'balanced';
    const getRlmProfile = typeof deps?.getRlmProfile === 'function' ? deps.getRlmProfile : () => 'balanced';
    const getRlmBudgets = typeof deps?.getRlmBudgets === 'function' ? deps.getRlmBudgets : () => ({});
    const getRlmIncludeSharedAttachments = typeof deps?.getRlmIncludeSharedAttachments === 'function'
      ? deps.getRlmIncludeSharedAttachments
      : () => false;
    const setActiveRlmSessionId = typeof deps?.setActiveRlmSessionId === 'function' ? deps.setActiveRlmSessionId : (() => {});
    const setThinkingStatusText = typeof deps?.setThinkingStatusText === 'function' ? deps.setThinkingStatusText : (() => {});
    const STOP_REASON_MESSAGES = {
      max_runtime_ms: 'Stopped at time limit. Increase profile or enable Advanced budgets.',
      max_tool_calls: 'Stopped at planning-step limit. Increase profile or enable Advanced budgets.',
      max_chunks_processed: 'Stopped at document-coverage limit. Increase profile or enable Advanced budgets.',
      max_evidence_hits: 'Stopped at evidence-sampling limit. Increase profile or enable Advanced budgets.',
      max_recursion_depth: 'Stopped at reasoning-depth limit. Increase profile or enable Advanced budgets.'
    };
    const RLM_PROFILE_ITERATIONS = {
      fast: 4,
      balanced: 8,
      deep: 16,
      'industrial-safe': 6,
      custom: 8
    };
    function normalizeProvider(value) {
      const raw = String(value || '').trim().toLowerCase();
      if (raw === 'llamacpp' || raw === 'llama-cpp' || raw === 'llama.cpp') return 'llama.cpp';
      return raw || 'ollama';
    }
    function defaultBaseUrl(provider) {
      if (provider === 'llama.cpp') return '';
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
      const llamaCppForceCpu = getLlamaCppForceCpu() === true;
      return { provider, baseUrl, apiKey, providerModel, llamaCppModelPath, llamaCppForceCpu };
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
    function getProviderRetryConfig(provider) {
      const p = String(provider || '').trim().toLowerCase();
      if (p === 'llama.cpp') {
        return { maxAttempts: 25, delayMs: 5000 };
      }
      return { maxAttempts: 1, delayMs: 0 };
    }
    function nowMs() {
      try {
        if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
          return performance.now();
        }
      } catch (_) {}
      return Date.now();
    }
    function logTiming(stage, startedAt, details = '') {
      const elapsed = Math.round(nowMs() - startedAt);
      const suffix = details ? ` ${details}` : '';
      console.log(`[Terminal Timing] ${stage}: ${elapsed}ms${suffix}`);
    }
    function normalizeRlmProfile(value) {
      const key = String(value || '').trim().toLowerCase();
      return Object.prototype.hasOwnProperty.call(RLM_PROFILE_ITERATIONS, key) ? key : 'balanced';
    }
    function buildRecursiveRlmBudget() {
      const budgets = getRlmBudgets() || {};
      const profile = normalizeRlmProfile(getRlmProfile());
      const maxToolCalls = Number(budgets.maxToolCalls);
      const maxRuntimeMs = Number(budgets.maxRuntimeMs);
      const maxRecursionDepth = Number(budgets.maxRecursionDepth);
      const maxRootIterations = Number.isFinite(maxToolCalls)
        ? Math.max(1, Math.min(64, Math.floor(maxToolCalls)))
        : RLM_PROFILE_ITERATIONS[profile];
      const out = {
        profile,
        modelBehavior: 'unknown',
        maxRootIterations,
        maxTokensPerSubcall: profile === 'deep' ? 1536 : 1024
      };
      if (Number.isFinite(maxRuntimeMs) && maxRuntimeMs > 0) out.maxRuntimeMs = Math.floor(maxRuntimeMs);
      if (Number.isFinite(maxRecursionDepth) && maxRecursionDepth > 0) out.maxRecursionDepth = Math.floor(maxRecursionDepth);
      return out;
    }
    function summarizeRecursiveRlmActions(observations = []) {
      if (!Array.isArray(observations) || observations.length === 0) return 'none';
      return observations.map((entry) => {
        if (entry && entry.action && entry.action.type) return String(entry.action.type);
        return entry && entry.error ? 'invalid_action' : 'unknown';
      }).join(' -> ');
    }
    function summarizeRecursiveRlmError(rlmResult = {}) {
      const direct = String(rlmResult?.error || '').trim();
      if (direct) return direct;
      const observations = Array.isArray(rlmResult?.observations) ? rlmResult.observations : [];
      const failed = observations.find((entry) => entry && entry.success === false);
      const action = String(failed?.action?.type || '').trim();
      const error = String(failed?.error || '').trim();
      if (action && error) return `${action}: ${error}`;
      if (error) return error;
      return 'no final answer returned';
    }
    function buildOpenAIStyleMessages(messages = []) {
      return (Array.isArray(messages) ? messages : []).map((m) => ({
        role: String(m?.role || 'user'),
        content: Array.isArray(m?.content) ? m.content : String(m?.content || '')
      }));
    }
    function extractProviderAnswer(parsed = {}) {
      const choice = parsed?.choices?.[0] || {};
      return String(
        choice?.message?.content ||
        choice?.text ||
        choice?.delta?.content ||
        parsed?.message?.content ||
        parsed?.content ||
        parsed?.text ||
        parsed?.response ||
        ''
      );
    }
    function extractProviderThinking(parsed = {}) {
      const choice = parsed?.choices?.[0] || {};
      return String(
        choice?.message?.reasoning_content ||
        choice?.message?.reasoning ||
        choice?.message?.thinking ||
        choice?.delta?.reasoning_content ||
        choice?.delta?.reasoning ||
        choice?.delta?.thinking ||
        parsed?.message?.reasoning_content ||
        parsed?.message?.reasoning ||
        parsed?.message?.thinking ||
        parsed?.reasoning_content ||
        parsed?.reasoning ||
        parsed?.thinking ||
        ''
      );
    }
    function buildThinkingOnlyProviderMessage(thinking = '') {
      const chars = String(thinking || '').trim().length;
      const suffix = chars > 0 ? ` Captured ${chars} reasoning/thinking characters.` : '';
      return `Provider returned reasoning/thinking tokens but no final assistant answer.${suffix}`;
    }
    function buildPromptTooLargeMessage(fit = {}) {
      const estimated = Math.max(0, Number(fit.estimatedTokens) || 0);
      const budget = Math.max(0, Number(fit.budget) || 0);
      const contextSize = Math.max(0, Number(fit.contextSize) || 0);
      const reduceBy = Math.max(1, estimated - budget);
      return [
        `Your message is estimated at ${estimated} tokens, but this llama.cpp session can fit about ${budget} prompt tokens after reserved response space.`,
        `Context size is ${contextSize} tokens. Reduce the current message by about ${reduceBy} tokens, attach the material as a file, or increase the model context size.`
      ].join(' ');
    }
    function updateProviderThinkingDisplay(active, thinking = '') {
      const contentDiv = active?.contentDiv || null;
      const text = String(thinking || '').trim();
      if (!contentDiv || !contentDiv.parentElement || !text) return;
      let thinkingDiv = active.thinkingDiv || null;
      if (!thinkingDiv) {
        thinkingDiv = contentDiv.parentElement.querySelector('.message-thinking');
        if (!thinkingDiv) {
          thinkingDiv = document.createElement('div');
          thinkingDiv.className = 'message-thinking';
          contentDiv.parentElement.insertBefore(thinkingDiv, contentDiv);
        }
        active.thinkingDiv = thinkingDiv;
      }
      thinkingDiv.textContent = text;
    }
    function summarizeRlmThinking(rlmResult = {}, maxChars = 4000) {
      const entries = Array.isArray(rlmResult?.thinking) ? rlmResult.thinking : [];
      const text = entries
        .map((entry) => String(entry?.text || '').trim())
        .filter(Boolean)
        .join('\n\n');
      if (!text) return '';
      const limit = Math.max(512, Number(maxChars) || 4000);
      return text.length <= limit ? text : `${text.slice(0, limit)}...`;
    }
    function addRlmAssistantMessage(answer, rlmResult = {}) {
      const thinking = summarizeRlmThinking(rlmResult);
      if (!thinking) {
        addMessage('assistant', answer);
        return;
      }
      const contentDiv = addAssistantShell();
      if (!contentDiv) {
        addMessage('assistant', answer);
        return;
      }
      updateProviderThinkingDisplay({ contentDiv }, thinking);
      finalizeStreamingMessage(contentDiv, answer);
    }
    function formatRlmProgress(progress = {}) {
      const phase = String(progress?.phase || '').trim();
      const action = String(progress?.action || '').trim();
      if (phase === 'action-start') return `RLM progress: ${action || 'action'} started`;
      if (phase === 'action-done') return `RLM progress: ${action || 'action'} ${progress?.success === false ? 'failed' : 'done'}`;
      if (phase === 'root-model-start') return 'RLM progress: final controller call started';
      if (phase === 'root-model-done') return 'RLM progress: final controller call done';
      return '';
    }
    function subscribeRlmProgress(sessionId = '') {
      const wanted = String(sessionId || '').trim();
      const api = getElectronAPI();
      if (!wanted || !api || typeof api.onRlmProgress !== 'function') return null;
      const seen = new Set();
      return api.onRlmProgress((progress = {}) => {
        if (String(progress?.sessionId || '').trim() !== wanted) return;
        const message = formatRlmProgress(progress);
        if (!message) return;
        const key = `${progress?.phase || ''}:${progress?.action || ''}:${progress?.iteration || ''}:${progress?.success}`;
        if (seen.has(key)) return;
        seen.add(key);
        addSystemMessage(message);
      });
    }
    function applyLlamaCppChatDefaults(body, options = {}) {
      if (!body || typeof body !== 'object') return body;
      if (body.temperature === undefined || body.temperature === null || body.temperature === 0.7) {
        body.temperature = 0.2;
      }
      if (body.repeat_penalty === undefined && options.repeat_penalty === undefined) {
        body.repeat_penalty = 1.08;
      }
      if (body.stop === undefined && options.stop === undefined) {
        body.stop = [
          '<|im_end|>',
          '<|endoftext|>',
          '<|fim_pad|>',
          '<|repo_name|>',
          '<|file_sep|>',
          '\nUSER',
          '\nASSISTANT'
        ];
      }
      return body;
    }
    function normalizeLlamaCppMessages(messages = []) {
      const rows = buildOpenAIStyleMessages(messages);
      const hasSystem = rows.some((row) => String(row?.role || '').trim().toLowerCase() === 'system');
      if (hasSystem) return rows;
      return [
        {
          role: 'system',
          content: 'You are a concise, helpful assistant. Reply in English unless the user explicitly asks for another language.'
        },
        ...rows
      ];
    }
    function estimatePromptTokens(messages = []) {
      const rows = Array.isArray(messages) ? messages : [];
      let chars = 0;
      for (const row of rows) {
        chars += String(row?.role || '').length + String(row?.content || '').length + 12;
      }
      return Math.ceil(chars / 4);
    }
    function fitMessagesToContext(messages = [], options = {}) {
      const rows = Array.isArray(messages) ? messages : [];
      const contextSize = Math.max(1024, Number(options.num_ctx) || 32768);
      const reserveTokens = Math.max(512, Math.min(4096, Math.floor(contextSize * 0.12)));
      const budget = Math.max(512, contextSize - reserveTokens);
      if (estimatePromptTokens(rows) <= budget) return { messages: rows, trimmed: 0, estimatedTokens: estimatePromptTokens(rows), budget };

      const systemRows = [];
      const bodyRows = [];
      for (const row of rows) {
        if (String(row?.role || '').trim().toLowerCase() === 'system') systemRows.push(row);
        else bodyRows.push(row);
      }
      const currentUser = bodyRows.length > 0 ? bodyRows[bodyRows.length - 1] : null;
      const historyRows = currentUser ? bodyRows.slice(0, -1) : bodyRows;
      const currentOnly = currentUser ? [...systemRows, currentUser] : systemRows;
      const currentOnlyTokens = estimatePromptTokens(currentOnly);
      if (currentOnlyTokens > budget) {
        return {
          messages: currentOnly,
          trimmed: historyRows.length,
          estimatedTokens: currentOnlyTokens,
          budget,
          contextSize,
          tooLarge: true
        };
      }
      const keptHistory = [];
      for (let i = historyRows.length - 1; i >= 0; i -= 1) {
        const candidate = [...systemRows, historyRows[i], ...keptHistory];
        if (currentUser) candidate.push(currentUser);
        if (estimatePromptTokens(candidate) <= budget) {
          keptHistory.unshift(historyRows[i]);
        }
      }
      let fitted = currentUser
        ? [...systemRows, ...keptHistory, currentUser]
        : [...systemRows, ...keptHistory];
      let trimmed = historyRows.length - keptHistory.length;

      return { messages: fitted, trimmed, estimatedTokens: estimatePromptTokens(fitted), budget, contextSize, tooLarge: false };
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
      if (!endpointBase && providerRuntime.provider !== 'ollama' && providerRuntime.provider !== 'llama.cpp') {
        return { success: false, message: `Provider "${providerRuntime.provider}" requires Base URL.` };
      }
      if ((providerRuntime.provider === 'vllm' || providerRuntime.provider === 'openai-compatible') && !model) {
        return { success: false, message: `Provider "${providerRuntime.provider}" requires a model id (select model or set Provider Model ID).` };
      }

      if (providerRuntime.provider === 'llama.cpp') {
        if (!api || typeof api.ensureTerminalLlamaCppSession !== 'function') {
          return { success: false, message: 'BMOC llama.cpp session API is unavailable in this build.' };
        }
        const ensureStartedAt = nowMs();
        const sessionResult = await api.ensureTerminalLlamaCppSession({
          modelPath: providerRuntime.llamaCppModelPath,
          modelName: model || '',
          contextSize: options?.num_ctx,
          gpuLayers: options?.num_gpu,
          forceCpu: providerRuntime.llamaCppForceCpu === true
        });
        logTiming('llama.cpp session ensure', ensureStartedAt, `reused=${sessionResult?.reused === true} port=${Number(sessionResult?.port || sessionResult?.ollamaPort || 0) || 'n/a'}`);
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
        if (port > 0) setTerminalPort(port);
        if (endpointBase) setProviderBaseUrl(endpointBase);
      }

      const providerMessages = providerRuntime.provider === 'llama.cpp'
        ? fitMessagesToContext(normalizeLlamaCppMessages(messages), options)
        : { messages: buildOpenAIStyleMessages(messages), trimmed: 0, tooLarge: false };
      if (providerRuntime.provider === 'llama.cpp') {
        console.log(`[Terminal Timing] llama.cpp prompt estimate: ${Number(providerMessages.estimatedTokens || 0)} tokens, messages=${providerMessages.messages.length}, trimmed=${providerMessages.trimmed || 0}`);
      }
      if (providerMessages.tooLarge) {
        return { success: false, message: buildPromptTooLargeMessage(providerMessages) };
      }
      if (providerRuntime.provider === 'llama.cpp' && providerMessages.trimmed > 0) {
        addSystemMessage(`Context budget: omitted ${providerMessages.trimmed} older history message(s) for this llama.cpp request.`);
      }

      const body = {
        model: model || 'local-model',
        messages: providerMessages.messages,
        temperature: options.temperature,
        stream: true
      };
      if (options.top_p !== undefined) body.top_p = options.top_p;
      if (options.top_k !== undefined) body.top_k = options.top_k;
      if (options.num_predict !== undefined) body.max_tokens = options.num_predict;
      if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;
      if (options.repeat_penalty !== undefined) body.repeat_penalty = options.repeat_penalty;
      if (options.stop !== undefined) body.stop = options.stop;
      if (providerRuntime.provider === 'llama.cpp') applyLlamaCppChatDefaults(body, options);

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
        const fetchStartedAt = nowMs();
        response = await fetch(`${endpointBase}/v1/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: abortController.signal
        });
        logTiming('provider response headers', fetchStartedAt, `status=${response?.status || 'n/a'}`);
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
        const content = extractProviderAnswer(parsed).trim();
        if (!content) {
          const thinking = extractProviderThinking(parsed).trim();
          if (thinking) return { success: false, message: buildThinkingOnlyProviderMessage(thinking) };
          return { success: false, message: 'No assistant content returned by provider.' };
        }
        return { success: true, message: content };
      }

      const decoder = new TextDecoder();
      const reader = response.body.getReader();
      let buffer = '';
      let full = '';
      let thinking = '';
      let doneSeen = false;
      let firstChunkSeen = false;
      const streamStartedAt = nowMs();
      try {
        while (true) {
          if (getStreamStopRequested()) {
            abortController.abort();
            break;
          }
          const { value, done } = await reader.read();
          if (done) break;
          if (!firstChunkSeen) {
            firstChunkSeen = true;
            logTiming('first stream chunk', streamStartedAt);
          }
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
            const answerDelta = extractProviderAnswer(parsed);
            const thinkingDelta = extractProviderThinking(parsed);
            if (thinkingDelta) thinking += thinkingDelta;
            if (thinkingDelta && !answerDelta) {
              setThinkingStatusText('Thinking');
            }
            const active = getActiveStream();
            if (active) {
              active.thinking = thinking;
              if (thinkingDelta) updateProviderThinkingDisplay(active, thinking);
            }
            if (!answerDelta) continue;
            full += answerDelta;
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
        if (String(thinking || '').trim()) {
          return { success: false, message: buildThinkingOnlyProviderMessage(thinking) };
        }
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
      if (!endpointBase && providerRuntime.provider !== 'ollama' && providerRuntime.provider !== 'llama.cpp') {
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
          gpuLayers: options?.num_gpu,
          forceCpu: providerRuntime.llamaCppForceCpu === true
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
        if (port > 0) setTerminalPort(port);
        if (endpointBase) setProviderBaseUrl(endpointBase);
      }

      if (providerRuntime.provider === 'llama.cpp' || providerRuntime.provider === 'vllm' || providerRuntime.provider === 'openai-compatible') {
        const providerMessages = providerRuntime.provider === 'llama.cpp'
          ? fitMessagesToContext(normalizeLlamaCppMessages(messages), options)
          : { messages: buildOpenAIStyleMessages(messages), trimmed: 0, tooLarge: false };
        if (providerMessages.tooLarge) {
          return { success: false, message: buildPromptTooLargeMessage(providerMessages) };
        }
        if (providerRuntime.provider === 'llama.cpp' && providerMessages.trimmed > 0) {
          addSystemMessage(`Context budget: omitted ${providerMessages.trimmed} older history message(s) for this llama.cpp request.`);
        }

        const body = {
          model: model || 'local-model',
          messages: providerMessages.messages,
          temperature: options.temperature
        };
        if (options.top_p !== undefined) body.top_p = options.top_p;
        if (options.top_k !== undefined) body.top_k = options.top_k;
        if (options.num_predict !== undefined) body.max_tokens = options.num_predict;
        if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;
        if (options.repeat_penalty !== undefined) body.repeat_penalty = options.repeat_penalty;
        if (options.stop !== undefined) body.stop = options.stop;
        if (providerRuntime.provider === 'llama.cpp') applyLlamaCppChatDefaults(body, options);
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
        const content = extractProviderAnswer(parsed).trim();
        if (!content) {
          const thinking = extractProviderThinking(parsed).trim();
          if (thinking) return { success: false, message: buildThinkingOnlyProviderMessage(thinking) };
          return { success: false, message: 'No assistant content returned by provider.' };
        }
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
      const hasExplicitRlm = /\brlm\b|recursive language model|rlm environment/.test(lower);
      const hasSource = /(attachment|attachments|attached|file|files|document|documents|doc|docs|pdf|markdown|md)\b/i.test(lower);
      const hasAction = /(summari[sz]e|analy[sz]e|review|inspect|read|extract|search|find|quote|compare|list)\b/i.test(lower);
      const directAttachmentAsk = /(from (the )?attached|from attachments?|in (the )?attachment|attached file)/i.test(lower);

      if (hasExplicitRlm) return true;
      if ((hasSource && hasAction) || directAttachmentAsk) return true;
      return false;
    }

    function getCurrentAttachmentSessionId() {
      return String(getAttachmentSessionId() || '').trim() || `terminal-${getTerminalPort()}`;
    }

    function hasImageAttachmentIntent(message) {
      const lower = String(message || '').trim().toLowerCase();
      if (!lower) return false;
      return (
        /\b(image|images|picture|pictures|photo|photos|screenshot|screenshots|vision|diagram|drawing)\b/.test(lower) ||
        /\b(look at|see this|identify this|describe this|what is this|what's this|what am i looking at)\b/.test(lower)
      );
    }

    async function tryRunRlm(message, localOnly, providerRuntime) {
      if (getRlmAssisted() !== true || !shouldRunRlm(message)) return false;

      setThinkingStatusText('Running RLM tools');
      const activeProvider = String(providerRuntime?.provider || 'ollama').trim().toLowerCase();
      const provider = String(getRlmProvider() || 'legacy').trim().toLowerCase();
      if (provider === 'engine') {
        try {
          const rlmPayload = {
            prompt: message,
            messages: getConversationHistory(),
            systemPrompt: getSystemPrompt() || '',
            parentSessionId: getCurrentAttachmentSessionId(),
            attachmentSessionId: getCurrentAttachmentSessionId(),
            surface: 'terminal',
            mode: 'recursive-repl',
            model: String(providerRuntime?.providerModel || '').trim() || getCurrentModel(),
            backend: activeProvider,
            providerBaseUrl: String(providerRuntime?.baseUrl || '').trim() || (
              activeProvider === 'llama.cpp' && getTerminalPort() > 0
                ? `http://127.0.0.1:${getTerminalPort()}`
                : ''
            ),
            providerApiKey: String(providerRuntime?.apiKey || '').trim(),
            providerModel: String(providerRuntime?.providerModel || '').trim(),
            quality: getRlmQuality(),
            includeSharedAttachments: getRlmIncludeSharedAttachments(),
            sharedAttachmentSessionId: 'terminal-shared',
            budget: buildRecursiveRlmBudget()
          };
          const startResult = await runRlmStartSession(rlmPayload);
          const rlmSessionId = String(startResult?.sessionId || '').trim();
          if (!startResult?.success || !rlmSessionId) {
            const startError = String(startResult?.error || '');
            if (!/unavailable/i.test(startError)) {
              addSystemMessage(`RLM engine fallback: ${startError || 'failed to start RLM session'}`);
              return false;
            }
            const legacyResult = await runRlmLoop(rlmPayload);
            if (legacyResult && legacyResult.handled) {
              const answer = String(legacyResult.final || legacyResult.answer || '').trim();
              const traceTools = summarizeRecursiveRlmActions(legacyResult.observations);
              const exhaustedNote = legacyResult.budgetExhausted ? ' budget_exhausted=true' : '';
              if (!answer) {
                addSystemMessage(`RLM engine error: ${summarizeRecursiveRlmError(legacyResult)}`);
                addSystemMessage(`RLM Trace: actions=${traceTools} source=recursive-loop iterations=${legacyResult.iterations || 0}${exhaustedNote}`);
                setWaitingState(false);
                focusInput();
                return true;
              }
              const rlmAnswer = localOnly ? `{local} ${answer}` : answer;
              addRlmAssistantMessage(rlmAnswer, legacyResult);
              appendConversationPair(message, rlmAnswer, { skipRelay: localOnly });
              addSystemMessage(`RLM Trace: actions=${traceTools} source=recursive-loop iterations=${legacyResult.iterations || 0}${exhaustedNote}`);
              addSystemMessage(`RLM Engine: mode=recursive-repl profile=${normalizeRlmProfile(getRlmProfile())}`);
              setWaitingState(false);
              focusInput();
              return true;
            }
            return false;
          }
          setActiveRlmSessionId(rlmSessionId);
          const unsubscribeRlmProgress = subscribeRlmProgress(rlmSessionId);
          if (getStreamStopRequested()) {
            setActiveRlmSessionId('');
            if (typeof unsubscribeRlmProgress === 'function') unsubscribeRlmProgress();
            return true;
          }
          let rlmResult = null;
          try {
            rlmResult = await runRlmLoop({
              ...rlmPayload,
              sessionId: rlmSessionId
            });
          } finally {
            if (typeof unsubscribeRlmProgress === 'function') unsubscribeRlmProgress();
            setActiveRlmSessionId('');
          }
          if (getStreamStopRequested()) {
            setStreamStopRequested(false);
            setWaitingState(false);
            focusInput();
            return true;
          }
          if (rlmResult && rlmResult.handled) {
            const answer = String(rlmResult.final || rlmResult.answer || '').trim();
            const traceTools = summarizeRecursiveRlmActions(rlmResult.observations);
            const exhaustedNote = rlmResult.budgetExhausted ? ' budget_exhausted=true' : '';
            if (!answer && rlmResult.budgetExhausted) {
              addSystemMessage('RLM Notice: Stopped at root-loop iteration limit before final answer. Increase profile or Advanced RLM budgets.');
              addSystemMessage(`RLM Trace: actions=${traceTools} source=recursive-loop iterations=${rlmResult.iterations || 0}${exhaustedNote}`);
              setWaitingState(false);
              focusInput();
              return true;
            }
            if (!answer) {
              addSystemMessage(`RLM engine error: ${summarizeRecursiveRlmError(rlmResult)}`);
              addSystemMessage(`RLM Trace: actions=${traceTools} source=recursive-loop iterations=${rlmResult.iterations || 0}${exhaustedNote}`);
              if (getRlmVerboseTrace() === true && Array.isArray(rlmResult?.observations)) {
                rlmResult.observations.forEach((entry) => addSystemMessage(`RLM Step: ${JSON.stringify(entry)}`));
              }
              setWaitingState(false);
              focusInput();
              return true;
            }
            const rlmAnswer = localOnly ? `{local} ${answer}` : answer;
            addRlmAssistantMessage(rlmAnswer, rlmResult);
            appendConversationPair(message, rlmAnswer, { skipRelay: localOnly });
            addSystemMessage(`RLM Trace: actions=${traceTools} source=recursive-loop iterations=${rlmResult.iterations || 0}${exhaustedNote}`);
            addSystemMessage(`RLM Engine: mode=recursive-repl profile=${normalizeRlmProfile(getRlmProfile())}`);
            if (rlmResult.budgetExhausted) {
              addSystemMessage('RLM Notice: Stopped at root-loop iteration limit. Increase profile or Advanced RLM budgets.');
            }
            if (getRlmVerboseTrace() === true) {
              if (Array.isArray(rlmResult?.observations)) {
                rlmResult.observations.forEach((entry) => addSystemMessage(`RLM Step: ${JSON.stringify(entry)}`));
              }
            }
            setWaitingState(false);
            focusInput();
            return true;
          }
          if (rlmResult && rlmResult.error) {
            addSystemMessage(`RLM engine fallback: ${rlmResult.error}`);
          }
        } catch (err) {
          setActiveRlmSessionId('');
          addSystemMessage(`RLM engine fallback: ${err.message || err}`);
        }
        return false;
      }

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
            return true;
          }
          if (rlmResult && rlmResult.error) {
            addSystemMessage(`RLM fallback: ${rlmResult.error}`);
          }
        } catch (err) {
          addSystemMessage(`RLM fallback: ${err.message || err}`);
        }
      }
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
      const turnStartedAt = nowMs();

      const messages = [];
      const systemParts = [];
      const systemPrompt = getSystemPrompt();
      if (systemPrompt) {
        systemParts.push(systemPrompt);
      }
      const attachmentIntent = shouldInjectAttachmentContext(message);
      const shouldReadAttachmentContext = attachmentIntent;
      if (shouldReadAttachmentContext) {
        setThinkingStatusText('Reading attachments');
        const attachmentsStartedAt = nowMs();
        const attachmentContext = await buildAttachmentContext();
        logTiming('attachment context', attachmentsStartedAt, `used=${Boolean(attachmentContext)}`);
        if (attachmentContext) {
          systemParts.push(`Attached context (verbatim snippets from user-attached files):\n${attachmentContext}`);
        }
      }
      if (systemParts.length > 0) {
        messages.push({ role: 'system', content: systemParts.join('\n\n') });
      }
      messages.push(...getConversationHistory());
      messages.push({ role: 'user', content: message });

      const providerRuntime = resolveProviderRuntime();
      const imagePayload = hasImageAttachmentIntent(message)
        ? await buildImagePayloadForUserMessage({
          api: getElectronAPI(),
          sessionId: getCurrentAttachmentSessionId(),
          modelName: getCurrentModel(),
          setThinkingStatusText,
          addSystemMessage
        })
        : null;
      if (imagePayload && imagePayload.images && imagePayload.images.length > 0) {
        const lastMessage = messages[messages.length - 1];
        if (normalizeProvider(providerRuntime.provider) === 'llama.cpp') {
          lastMessage.content = [
            { type: 'text', text: message },
            ...imagePayload.images.map((image) => ({
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${image}` }
            }))
          ];
        } else {
          lastMessage.images = imagePayload.images;
        }
      }

      if (userInput) userInput.value = '';

      const rlmStartedAt = nowMs();
      if (await tryRunRlm(message, localOnly, providerRuntime)) {
        logTiming('rlm handled', rlmStartedAt);
        return;
      }
      logTiming('rlm skipped/fallback', rlmStartedAt);
      logTiming('pre-provider request build', turnStartedAt);
      if (providerRuntime.provider !== 'ollama') {
        setThinkingStatusText(`Calling ${providerRuntime.provider}`);
        try {
          const retryConfig = getProviderRetryConfig(providerRuntime.provider);
          const maxAttempts = retryConfig.maxAttempts;
          let result = null;
          for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            result = await streamViaProvider(providerRuntime, messages);
            if (result?.success || result?.stopped) break;
            if (!isTransientProviderError(providerRuntime.provider, result?.message || '')) break;
            if (attempt >= maxAttempts) break;
            addSystemMessage(`Provider warming up (${attempt}/${maxAttempts - 1} retries)...`);
            await waitMs(retryConfig.delayMs);
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

    async function buildImagePayloadForUserMessage({ api, sessionId, modelName, setThinkingStatusText, addSystemMessage }) {
      if (!api || typeof api.terminalAttachmentsList !== 'function' || typeof api.terminalAttachmentsReadBytes !== 'function') {
        return null;
      }
      const targetSessionId = String(sessionId || '').trim();
      if (!targetSessionId) return null;
      let list;
      try {
        list = await api.terminalAttachmentsList({ sessionId: targetSessionId });
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
            sessionId: targetSessionId,
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
