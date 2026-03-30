/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * PSF Coding Terminal - Renderer Chat Module
 */

(function() {
  'use strict';

  function createChatModule(ctx) {
    const { state, elements, api } = ctx;
    const diffHelpers = window.CodingTerminalRendererChatDiff || null;
    const STOP_REASON_MESSAGES = {
      max_runtime_ms: 'RLM stopped at time limit. Increase profile or enable advanced budgets.',
      max_tool_calls: 'RLM stopped at planning-step limit. Increase profile or enable advanced budgets.',
      max_chunks_processed: 'RLM stopped at document-coverage limit. Increase profile or enable advanced budgets.',
      max_evidence_hits: 'RLM stopped at evidence-sampling limit. Increase profile or enable advanced budgets.',
      max_recursion_depth: 'RLM stopped at reasoning-depth limit. Increase profile or enable advanced budgets.'
    };
    let shouldStickToBottom = true;
    state.chatHistory = Array.isArray(state.chatHistory) ? state.chatHistory : [];
    const rlmController = (window.PsfRlmShared && typeof window.PsfRlmShared.createRlmCore === 'function')
      ? window.PsfRlmShared.createRlmCore({
        getElectronAPI: () => window.electronAPI,
        getSessionId: () => String(state.sessionMemorySessionId || 'coding-terminal'),
        getModelName: () => String(state.modelName || ''),
        buildOllamaOptions: () => ({}),
        getIncludeSharedAttachments: () => state.rlmIncludeSharedAttachments === true,
        getRlmBudgets: () => ({ ...(state.rlmBudgets || {}) }),
        getSharedAttachmentSessionId: () => 'terminal-shared',
        sendMessage: (modelName, messages, options = {}) => {
          if (!window.electronAPI || typeof window.electronAPI.sendCodingInferenceMessages !== 'function') {
            return Promise.resolve({ success: false, message: 'sendCodingInferenceMessages API unavailable' });
          }
          return window.electronAPI.sendCodingInferenceMessages({
            modelName,
            messages,
            options
          });
        },
        getRlmVerboseTrace: () => false,
        getRlmQuality: () => {
          const p = String(state.rlmProfile || '').toLowerCase();
          if (p === 'fast' || p === 'balanced' || p === 'deep') return p;
          if (p === 'industrial-safe') return 'balanced';
          return 'balanced';
        },
        onThinkingStatus: (text) => api.updateStatus('model', String(text || 'Processing...'))
      })
      : null;
    const messageHelpers = (window.CodingTerminalRendererChatMessages && typeof window.CodingTerminalRendererChatMessages.createChatMessageHelpers === 'function')
      ? window.CodingTerminalRendererChatMessages.createChatMessageHelpers({
          state,
          elements,
          api,
          diffHelpers,
          scrollToBottom,
          recordConversationEntry
        })
      : null;
    const streamHelpers = window.CodingTerminalRendererChatStream || null;

    function isNearBottom(el, threshold = 48) {
      if (!el) return true;
      const distance = el.scrollHeight - (el.scrollTop + el.clientHeight);
      return distance <= threshold;
    }

    function attachScrollBehavior() {
      if (!elements.chatDisplay) return;
      elements.chatDisplay.addEventListener('scroll', () => {
        shouldStickToBottom = isNearBottom(elements.chatDisplay);
      });
    }

    function attachStreamListeners() {
      attachScrollBehavior();
      if (!window.electronAPI) return;
      window.electronAPI.onCodingStreamData?.((data) => {
        if (!data) return;
        if (!state.activeStreamId && state.streaming && data.streamId) {
          state.activeStreamId = data.streamId;
        }
        if (data.streamId !== state.activeStreamId) return;
        const kind = data.kind || 'answer';
        if (kind === 'status') {
          addSystemMessage(`Trace: ${data.chunk || ''}`);
          api.setActiveModelTrace?.({
            modelName: data.modelName || state.modelName,
            phase: 'status',
            answer: String(data.chunk || '')
          });
        } else if (kind === 'thinking') {
          state.activeThinkingBuffer += data.chunk || '';
          updateAssistantThinking(state.activeMessageShellId, state.activeThinkingBuffer);
          api.setActiveModelTrace?.({
            modelName: data.modelName || state.modelName,
            phase: 'thinking',
            thinking: state.activeThinkingBuffer
          });
        } else {
          state.activeStreamBuffer += data.chunk || '';
          updateAssistantShell(state.activeMessageShellId, state.activeStreamBuffer);
          api.setActiveModelTrace?.({
            modelName: data.modelName || state.modelName,
            phase: 'answer',
            answer: state.activeStreamBuffer
          });
        }
      });
      window.electronAPI.onCodingStreamDone?.((data) => {
        if (!data) return;
        if (!state.activeStreamId && state.streaming && data.streamId) {
          state.activeStreamId = data.streamId;
        }
        if (data.streamId !== state.activeStreamId) return;
        const finalText = data.text || state.activeStreamBuffer;
        const finalThinking = data.thinking || state.activeThinkingBuffer;
        if (Array.isArray(data.sources) && data.sources.length > 0) {
          api.updateRagSources(data.sources);
        }
        if (finalThinking) {
          updateAssistantThinking(state.activeMessageShellId, finalThinking);
        }
        finalizeMessage(state.activeMessageShellId, finalText);
        api.pushModelTrace?.(
          `stream done (${String(data.modelName || state.modelName || 'assistant')})`,
          finalText
        );
        api.clearActiveModelTrace?.();
        state.activeStreamId = null;
        state.activeMessageShellId = null;
        state.activeStreamBuffer = '';
        state.activeThinkingBuffer = '';
        state.streaming = false;
        api.updateStatus('model', 'Ready');
        setInlineActivity(false, 'Thinking');
        updateStreamingUi();
      });
      window.electronAPI.onCodingStreamError?.((data) => {
        if (!data) return;
        if (!state.activeStreamId && state.streaming && data.streamId) {
          state.activeStreamId = data.streamId;
        }
        if (data.streamId !== state.activeStreamId) return;
        const errText = data.error || 'Stream failed';
        const userStopped = errText.toLowerCase().includes('stopped by user');
        if (userStopped) {
          const partial = (state.activeStreamBuffer || '').trim();
          const partialThinking = (state.activeThinkingBuffer || '').trim();
          if (partialThinking) {
            updateAssistantThinking(state.activeMessageShellId, partialThinking);
          }
          finalizeMessage(state.activeMessageShellId, partial || '[Generation stopped]');
          api.pushModelTrace?.(
            `stream stopped (${String(data.modelName || state.modelName || 'assistant')})`,
            partial || '[Generation stopped]'
          );
        } else {
          finalizeMessage(state.activeMessageShellId, `Error: ${errText}`);
          api.pushModelTrace?.('stream error', errText);
        }
        api.clearActiveModelTrace?.();
        state.activeStreamId = null;
        state.activeMessageShellId = null;
        state.activeStreamBuffer = '';
        state.activeThinkingBuffer = '';
        state.streaming = false;
        api.updateStatus('model', 'Ready');
        setInlineActivity(false, 'Thinking');
        updateStreamingUi();
      });
      window.electronAPI.onCodingRagIndexProgress?.((data) => {
        if (!data) return;
        if (state.ragIndexRunId && data.runId && data.runId !== state.ragIndexRunId) return;
        state.ragProgress = data;
        api.updateRagProgressUi(data);
      });
      window.electronAPI.onCodingModelStartupStatus?.((data) => {
        if (!data) return;
        const phase = String(data.phase || '').trim();
        const detail = String(data.detail || '').trim();
        const status = String(data.status || '').toLowerCase();
        const label = detail || messageHelpers?.formatStartupPhase?.(phase) || 'Model startup in progress';
        if (label) {
          const startupInProgress = status !== 'ok' && phase !== 'reuse' && phase !== 'ready';
          if (startupInProgress) {
            api.updateStatus('model', `Processing... ${label}`);
            setInlineActivity(true, label);
          } else {
            api.updateStatus('model', label);
            setInlineActivity(false, 'Thinking');
          }
        }
      });
    }

    async function ensureCoderSelectionAppliedIfMissing() {
      if (!window.electronAPI?.getCodingConfig || !window.electronAPI?.selectCodingModel) return true;
      const cfg = await window.electronAPI.getCodingConfig();
      const backend = String(cfg?.inferenceBackend || '').toLowerCase();
      if (backend !== 'llama-cpp') return true;
      const hasPath = String(cfg?.llamaCppModelPath || '').trim().length > 0;
      const hasModel = String(cfg?.modelName || '').trim().length > 0;
      if (hasPath && hasModel) return true;

      const value = String(elements.modelSelect?.value || '').trim();
      if (!value || !value.includes('::')) {
        api.addSystemMessage('No coder model selected. Pick a model from the Coder dropdown first.');
        api.updateStatus('model', 'No model selected');
        return false;
      }
      const delim = value.indexOf('::');
      if (delim < 0) return false;
      const collectionKey = value.slice(0, delim);
      const modelId = value.slice(delim + 2);
      const result = await window.electronAPI.selectCodingModel({ collectionKey, modelId });
      if (!result?.success) {
        api.addSystemMessage(`Model select failed: ${result?.message || 'Unknown error'}`);
        api.updateStatus('model', 'Select failed');
        return false;
      }
      state.modelName = result.modelName || state.modelName;
      api.addSystemMessage(`Model ready: ${state.modelName}`);
      api.updateStatus('model', state.modelName);
      return true;
    }

    async function handleSend() {
      const message = elements.userInput.value.trim();
      if (!message) return;
      const modelReady = await ensureCoderSelectionAppliedIfMissing();
      if (!modelReady) return;
      if (state.streaming) {
        elements.userInput.value = '';
        void submitSteering(message, 'chat');
        return;
      }
      shouldStickToBottom = true;
      api.onUserPrompt?.(message);
      addMessage('user', message);
      elements.userInput.value = '';
      sendMessage(message);
    }

    async function waitForStreamToSettle(timeoutMs = 5000) {
      const start = Date.now();
      while (state.streaming && (Date.now() - start) < timeoutMs) {
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
    }

    function buildSteeringPrompt(message) {
      const steer = String(message || '').trim();
      return (
        '[STEERING UPDATE]\n' +
        `${steer}\n\n` +
        'Continue from current progress. Apply this steering update immediately. ' +
        'Do not restart from scratch unless explicitly requested.'
      );
    }

    async function submitSteering(rawMessage, source = 'chat') {
      const message = String(rawMessage || '').trim();
      if (!message) return;
      shouldStickToBottom = true;
      api.onUserPrompt?.(message);
      addMessage('user', `[Steer] ${message}`);
      api.pushModelTrace?.(`steer request (${source})`, message);

      if (state.streaming) {
        await handleStop();
        await waitForStreamToSettle(7000);
      }
      const steeringPrompt = buildSteeringPrompt(message);
      await sendMessage(steeringPrompt);
    }

    async function handleSteer(source = 'chat') {
      const isEditor = String(source || '').toLowerCase() === 'editor';
      const inputEl = isEditor ? elements.editorChatInput : elements.userInput;
      const raw = String(inputEl?.value || '').trim();
      if (!raw) return;
      if (inputEl) inputEl.value = '';
      await submitSteering(raw, isEditor ? 'editor' : 'chat');
    }

    async function sendMessage(message) {
      state.streaming = true;
      state.activeStreamId = null;
      api.updateStatus('model', 'Processing...');
      setInlineActivity(true, 'Thinking');
      api.pushModelTrace?.('user prompt', message);

      const shellId = addAssistantShell();
      state.activeMessageShellId = shellId;
      state.activeStreamBuffer = '';
      state.activeThinkingBuffer = '';

      try {
        if (streamHelpers?.maybeRunRlmAssist) {
          const rlm = await streamHelpers.maybeRunRlmAssist({
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
          });
          if (rlm?.handled) return;
        }

        const forceNonStreamCliAgent = state.cliAgentEnabled === true;
        if (!forceNonStreamCliAgent && window.electronAPI?.sendCodingMessageStream) {
          const start = await window.electronAPI.sendCodingMessageStream(message);
          if (!start?.success) {
            finalizeMessage(shellId, `Error: ${start?.error || 'Failed to start stream'}`);
            state.streaming = false;
            state.activeMessageShellId = null;
            state.activeThinkingBuffer = '';
            api.updateStatus('model', 'Ready');
            setInlineActivity(false, 'Thinking');
            updateStreamingUi();
            return;
          }
          if (streamHelpers?.processStreamStart) {
            streamHelpers.processStreamStart({
              start,
              state,
              shellId,
              updateAssistantThinking,
              addSystemMessage,
              api,
              setAssistantShellRole,
              updateStreamingUi,
              setInlineActivity
            });
          }
          return;
        } else if (window.electronAPI?.sendCodingMessage) {
          if (forceNonStreamCliAgent) {
            addSystemMessage('CLI Agent mode active: running autonomous tool loop for this turn.');
          }
          const response = await window.electronAPI.sendCodingMessage(message);
          finalizeMessage(shellId, response.content);
          if (response.sources) {
            api.updateRagSources(response.sources);
          }
        } else {
          setTimeout(() => {
            finalizeMessage(shellId,
              'Backend not connected. This is a frontend preview.\n\n' +
              '```javascript\nconsole.log("Hello from Coding Terminal!");\n```'
            );
          }, 500);
        }
      } catch (err) {
        console.error('[CodingTerminal] Send error:', err);
        finalizeMessage(shellId, `Error: ${err.message}`);
        state.activeMessageShellId = null;
        state.streaming = false;
        api.updateStatus('model', 'Ready');
        setInlineActivity(false, 'Thinking');
        updateStreamingUi();
      }
    }

    async function handleStop() {
      if (!state.streaming) return;
      api.updateStatus('model', 'Stopping...');
      setInlineActivity(true, 'Stopping');
      try {
        if (window.electronAPI?.stopCodingMessageStream) {
          await window.electronAPI.stopCodingMessageStream(state.activeStreamId);
        }
      } catch (err) {
        console.warn('[CodingTerminal] Stop stream error:', err.message);
      }
    }

    function addMessage(role, content) {
      return messageHelpers?.addMessage?.(role, content);
    }

    function addSystemMessage(content) {
      return messageHelpers?.addSystemMessage?.(content);
    }

    function addAssistantShell() {
      return messageHelpers?.addAssistantShell?.();
    }

    function setAssistantShellRole(id, modelName) {
      return messageHelpers?.setAssistantShellRole?.(id, modelName);
    }

    function finalizeMessage(id, content) {
      const result = messageHelpers?.finalizeMessage?.(id, content);
      if (state.speechEngine && typeof state.speechEngine.enqueueTextDeferred === 'function') {
        state.speechEngine.enqueueTextDeferred(String(content || '').trim(), { maxChunkChars: 420 });
      } else if (state.voiceController && typeof state.voiceController.speak === 'function') {
        void state.voiceController.speak(String(content || '').trim()).catch((err) => {
          console.warn('[CodingTerminal] TTS error:', err?.message || err);
        });
      }
      return result;
    }

    function updateAssistantShell(id, content) {
      return messageHelpers?.updateAssistantShell?.(id, content);
    }

    function updateAssistantThinking(id, content) {
      return messageHelpers?.updateAssistantThinking?.(id, content);
    }

    function refreshThinkingVisibility() {
      return messageHelpers?.refreshThinkingVisibility?.();
    }

    function updateStreamingUi() {
      if (elements.sendBtn) elements.sendBtn.disabled = state.streaming;
      if (elements.stopBtn) elements.stopBtn.disabled = !state.streaming;
      if (elements.btnStopTop) elements.btnStopTop.disabled = !state.streaming;
      if (elements.steerBtn) elements.steerBtn.disabled = !state.streaming;
      if (elements.editorSteerBtn) elements.editorSteerBtn.disabled = !state.streaming;
      if (!state.streaming) {
        setInlineActivity(false, 'Thinking');
      }
    }

    function applyThinkingToggleUi() {
      return messageHelpers?.applyThinkingToggleUi?.();
    }

    function applyAutoScrollToggleUi() {
      return messageHelpers?.applyAutoScrollToggleUi?.();
    }

    function scrollToBottom() {
      if (!elements.chatDisplay) return;
      if (state.autoScroll === false) return;
      if (!shouldStickToBottom) return;
      elements.chatDisplay.scrollTop = elements.chatDisplay.scrollHeight;
    }

    function ensureInlineActivityNode() {
      if (!elements.chatDisplay) return null;
      let node = elements.chatDisplay.querySelector('#ct-inline-activity');
      if (!node) {
        node = document.createElement('div');
        node.id = 'ct-inline-activity';
        node.className = 'ct-inline-activity';
        node.innerHTML = '<span class="dot"></span><span class="label">Thinking</span><span class="dots"><span></span><span></span><span></span></span>';
        elements.chatDisplay.appendChild(node);
      }
      return node;
    }

    function setInlineActivity(active, labelText = 'Thinking') {
      const node = ensureInlineActivityNode();
      if (!node) return;
      elements.chatDisplay?.appendChild(node);
      const label = node.querySelector('.label');
      if (label) label.textContent = String(labelText || 'Thinking');
      if (active) {
        node.classList.add('active');
      } else {
        node.classList.remove('active');
      }
      if (active) scrollToBottom();
    }

    function recordConversationEntry(entry) {
      if (!entry || !entry.role) return;
      state.chatHistory.push({
        role: String(entry.role || 'system').toLowerCase(),
        content: String(entry.content || ''),
        ts: Number(entry.ts || Date.now())
      });
      api.onConversationChanged?.();
    }

    function getConversationEntries() {
      return state.chatHistory.map((item) => ({ ...item }));
    }

    function clearConversation() {
      state.chatHistory = [];
      state.activeStreamId = null;
      state.activeMessageShellId = null;
      state.activeStreamBuffer = '';
      state.activeThinkingBuffer = '';
      if (elements.chatDisplay) {
        elements.chatDisplay.innerHTML = '';
      }
      setInlineActivity(false, 'Thinking');
      updateStreamingUi();
      api.onConversationChanged?.();
    }

    function loadConversationEntries(entries) {
      const rows = Array.isArray(entries) ? entries : [];
      clearConversation();
      rows.forEach((row) => {
        const role = String(row?.role || '').toLowerCase();
        const content = String(row?.content || '');
        if (!content) return;
        if (role === 'user' || role === 'assistant' || role === 'system') {
          addMessage(role, content);
        } else {
          addMessage('system', content);
        }
      });
    }

    return {
      attachStreamListeners,
      handleSend,
      handleSteer,
      sendMessage,
      handleStop,
      addMessage,
      addSystemMessage,
      addAssistantShell,
      finalizeMessage,
      updateAssistantShell,
      updateAssistantThinking,
      refreshThinkingVisibility,
      updateStreamingUi,
      applyThinkingToggleUi,
      applyAutoScrollToggleUi,
      scrollToBottom,
      getConversationEntries,
      clearConversation,
      loadConversationEntries
    };
  }

  window.CodingTerminalRendererChat = {
    createChatModule
  };
})();
