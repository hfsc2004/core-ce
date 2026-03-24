/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/* terminal renderer */
(function() {
  'use strict';
  let config = null;
  let conversationHistory = [];
  let isWaitingForResponse = false;
  let systemPrompt = null;
  let activeStream = null;
  let streamStopRequested = false;
  let temperature = 0.7;
  let provider = 'ollama';
  let providerBaseUrl = '';
  let providerApiKey = '';
  let providerModelId = '';
  let llamaCppModelPath = '';
  let currentModel = null;
  let terminalPort = 52434;
  let attachmentSessionId = 'terminal-default';
  let uiController = null;
  let memoryController = null;
  let attachmentController = null;
  let sessionController = null;
  let commandController = null;
  let persistenceController = null;
  let contextMenuController = null;
  let streamController = null;
  let chatFlowController = null;
  let ioController = null;
  let bootstrapController = null;
  let runtimeController = null;
  let initController = null;
  let rlmController = null;
  let preferenceController = null;
  let rlmAssisted = false;
  let rlmVerboseTrace = false;
  let rlmQuality = 'balanced';
  let rlmProfile = 'balanced';
  let rlmProvider = 'legacy';
  let rlmAdvancedBudgets = false;
  let rlmIncludeSharedAttachments = false;
  let llmAssistedFileNaming = true;
  let rlmBudgets = {
    maxToolCalls: 40,
    maxRecursionDepth: 3,
    maxChunksProcessed: 48,
    maxRuntimeMs: 45000,
    maxEvidenceHits: 28
  };
  const RLM_SHARED_ATTACHMENT_SESSION_ID = 'terminal-shared';
  let top_p = null;
  let top_k = null;
  let num_ctx = null;
  let num_gpu = null;
  let num_predict = null;
  let repeat_penalty = null;
  let seed = null;
  let stopSequences = null;
  let chatDisplay = null;
  let userInput = null;
  let sendBtn = null;
  let stopBtn = null;
  let voiceBtn = null;
  let voiceModeBtn = null;
  let attachmentsBtn = null;
  let statusText = null;
  let gpuIcon = null;
  let gpuText = null;
  let peerSelect = null;
  let groupSelect = null;
  let interjectBtn = null;
  let labelBtn = null;
  let selfLabelEl = null;
  let voiceController = null;
  let speechEngine = null;
  let speechController = null;
  let lastSpeechCfg = null;
  let speechEngineProfileKey = '';
  let speechChunkProfile = { preview: 140, segment: 220, tail: 240 };
  let terminalWindowId = null;
  const GLOBAL_PROVIDER_PREFS_KEY = 'psf_terminal_provider_defaults';
  let meshStateUnsubscribe = null;
  let meshRefreshTimer = null;
  let meshSyncInProgress = false;
  let linkedPeerId = null;
  let groupedPeerIds = new Set();
  let inboundRelayHold = false;
  let suppressUserRelay = false;
  let terminalIdentityLabel = '';
  const inboundRelayQueue = [];
  let inboundRelayBusy = false;
  const call = (controller, method, fallback, ...args) => (
    controller && typeof controller[method] === 'function' ? controller[method](...args) : fallback
  );
  const callAsync = async (controller, method, fallback, ...args) => (
    controller && typeof controller[method] === 'function' ? controller[method](...args) : fallback
  );
  function configureMarkdown() { call(uiController, 'configureMarkdown'); }
  function escapeHtml(text) { return call(uiController, 'escapeHtml', String(text || ''), text); }
  function finalizeStreamingMessage(contentDiv, fullContent) { call(uiController, 'finalizeStreamingMessage', undefined, contentDiv, fullContent); }
  function sanitizeQwenSelfDialogue(content) { return call(runtimeController, 'sanitizeQwenSelfDialogue', String(content || ''), content); }
  function shouldInjectAttachmentContext(message) { return call(runtimeController, 'shouldInjectAttachmentContext', true, message); }
  function buildOllamaOptions() { return call(runtimeController, 'buildOllamaOptions', { port: terminalPort, temperature }); }
  function recordSessionMemory(entry = {}) { call(memoryController, 'recordSessionMemory', undefined, entry); }
  async function loadSessionMemoryPreferences() { await callAsync(memoryController, 'loadSessionMemoryPreferences'); }
  function addInputRecallEntry(text) { call(memoryController, 'addInputRecallEntry', undefined, text); }
  function applyInputRecall(offset) { return call(memoryController, 'applyInputRecall', false, offset); }
  async function loadInputRecallHistory() { await callAsync(memoryController, 'loadInputRecallHistory'); }
  function addMessage(role, content, channel = 'chat') {
    if (!call(uiController, 'addMessage', false, role, content)) return;
    if (role === 'user' || role === 'assistant' || role === 'error') recordSessionMemory({ role, content, channel });
  }
  function addSystemMessage(content) { addMessage('system', content); }
  function isTtsDebugTraceEnabled(cfg = null) { return call(speechController, 'isTtsDebugTraceEnabled', false, cfg); }
  function addTtsDebugMessage(enabled, message) { call(speechController, 'addTtsDebugMessage', undefined, enabled, message); }
  function resolveSpeechEngineProfile(speechCfg = null) {
    return call(speechController, 'resolveSpeechEngineProfile', { key: 'default', tuning: {}, chunks: { preview: 140, segment: 220, tail: 240 } }, speechCfg);
  }
  async function applySpeechEngineProfile(speechCfg = null) {
    return callAsync(speechController, 'applySpeechEngineProfile', { key: 'default', tuning: {}, chunks: { preview: 140, segment: 220, tail: 240 } }, speechCfg);
  }
  function ensureSpeechEngine() { return call(speechController, 'ensureSpeechEngine', null); }
  function addErrorMessage(content) { addMessage('error', content); }
  function addSystemImagePreview(preview = {}) { call(uiController, 'addSystemImagePreview', undefined, preview); }
  function addAssistantShell() { return call(uiController, 'addAssistantShell', null); }
  function setWaitingState(waiting) { isWaitingForResponse = waiting; call(uiController, 'setWaitingState', undefined, waiting); }
  function setThinkingStatusText(text) { call(uiController, 'setThinkingStatusText', undefined, text); }
  function updateGPUIndicator(gpuType) { call(uiController, 'updateGPUIndicator', undefined, gpuType); }
  async function sendMessage() {
    const rawInput = String(userInput?.value || '').trim();
    const shouldRelayUser = !suppressUserRelay && rawInput.length > 0 && !rawInput.startsWith('/');
    if (shouldRelayUser) {
      await relayUserToPeer(rawInput);
    }
    await callAsync(chatFlowController, 'sendMessage');
  }
  function normalizeSpeechText(text) { return call(speechController, 'normalizeSpeechText', String(text || '').trim(), text); }
  function splitSpeechChunks(text, maxLen = 140) { return call(speechController, 'splitSpeechChunks', [], text, maxLen); }
  async function buildSpeechRuntimeProfile(options = {}) { return callAsync(speechController, 'buildSpeechRuntimeProfile', { timeoutMs: 45000, debugOn: false }, options); }
  async function synthesizeAssistantChunk(text, options = {}) { return callAsync(speechController, 'synthesizeAssistantChunk', { success: false, error: 'TTS unavailable.' }, text, options); }
  async function playAssistantAudio(job = {}) { return callAsync(speechController, 'playAssistantAudio', { success: false, error: 'TTS unavailable.' }, job); }
  async function speakAssistantTextNow(text, options = {}) { return callAsync(speechController, 'speakAssistantTextNow', undefined, text, options); }
  async function speakAssistantText(text, options = {}) { return callAsync(speechController, 'speakAssistantText', undefined, text, options); }
  async function populateModelDropdown(port) { await callAsync(ioController, 'populateModelDropdown', undefined, port); }
  async function handleCommand(command) { await callAsync(ioController, 'handleCommand', undefined, command); }
  async function attachFile(rawPath) { await callAsync(ioController, 'attachFile', undefined, rawPath); }
  function installDragAndDropAttach() { call(ioController, 'installDragAndDropAttach'); }
  async function listAttachments() { await callAsync(ioController, 'listAttachments'); }
  async function detachAttachment(rawId) { await callAsync(ioController, 'detachAttachment', undefined, rawId); }
  async function clearAttachments() { await callAsync(ioController, 'clearAttachments'); }
  async function openAttachmentManager() { await callAsync(ioController, 'openAttachmentManager'); }
  async function buildAttachmentContext() { return callAsync(ioController, 'buildAttachmentContext', ''); }
  function clearConversation() {
    conversationHistory.length = 0;
    chatDisplay.innerHTML = '';
    addSystemMessage('✅ Conversation history cleared');
    addSystemMessage(`Model: ${currentModel} on port ${terminalPort}`);
  }
  function saveConversation(name) {
    if (!persistenceController || typeof persistenceController.saveConversation !== 'function') return;
    persistenceController.saveConversation(name);
  }
  async function loadConversation(name) {
    if (!persistenceController || typeof persistenceController.loadConversation !== 'function') return;
    await persistenceController.loadConversation(name);
  }
  async function listSavedConversations() {
    if (!persistenceController || typeof persistenceController.listSavedConversations !== 'function') return [];
    return persistenceController.listSavedConversations();
  }
  async function deleteSavedConversation(name) {
    if (!persistenceController || typeof persistenceController.deleteSavedConversation !== 'function') return false;
    return persistenceController.deleteSavedConversation(name);
  }
  function formatBytes(bytes) { return call(ioController, 'formatBytes', `${bytes || 0} B`, bytes); }
  function syncInterjectButton() {
    if (!interjectBtn) return;
    if (inboundRelayHold) {
      interjectBtn.classList.add('active');
      interjectBtn.setAttribute('aria-pressed', 'true');
      interjectBtn.title = 'Interject armed: inbound auto-turns paused until you send your next message';
    } else {
      interjectBtn.classList.remove('active');
      interjectBtn.setAttribute('aria-pressed', 'false');
      interjectBtn.title = 'Pause inbound auto-turns after current response so you can speak next';
    }
  }
  function armInterject() {
    if (inboundRelayHold) return;
    inboundRelayHold = true;
    syncInterjectButton();
    addSystemMessage('Interject armed: waiting for current turn to finish, then inbound auto-turns will pause.');
  }
  function clearInterject(reason = '') {
    const wasHeld = inboundRelayHold;
    inboundRelayHold = false;
    syncInterjectButton();
    if (wasHeld && reason) addSystemMessage(reason);
  }
  function handleInterjectClick() {
    if (inboundRelayHold) {
      clearInterject('Interject cleared: inbound auto-turns resumed.');
      void processInboundRelayQueue();
      return;
    }
    armInterject();
  }
  function handleInputKeypress(e) {
    if (e && e.key === 'Enter' && !e.shiftKey) clearInterject();
    call(ioController, 'handleInputKeypress', undefined, e);
  }
  async function handleStopClick() { await callAsync(ioController, 'handleStopClick'); }
  async function initializeVoiceToText() { await callAsync(ioController, 'initializeVoiceToText'); }
  function formatLocalTerminalIdentity() {
    const idPart = terminalWindowId ? `Terminal #${terminalWindowId}` : 'Terminal';
    const custom = String(terminalIdentityLabel || '').trim();
    return custom ? `${custom} (${idPart})` : idPart;
  }
  function renderSelfLabel() {
    if (!selfLabelEl) return;
    selfLabelEl.textContent = formatLocalTerminalIdentity();
    selfLabelEl.title = `Identity: ${formatLocalTerminalIdentity()}`;
  }
  async function handleLabelEdit() {
    const existing = String(terminalIdentityLabel || '').trim();
    const next = window.prompt('Set terminal label (blank to clear):', existing);
    if (next === null) return;
    if (!window.electronAPI || typeof window.electronAPI.terminalLinkSetLabel !== 'function') return;
    try {
      const result = await window.electronAPI.terminalLinkSetLabel(String(next || '').trim());
      if (result?.success) {
        terminalIdentityLabel = String(result.selfLabel || '').trim();
        renderSelfLabel();
        renderPeerOptions(result || {});
      }
    } catch (err) {
      addErrorMessage(`Label update failed: ${err?.message || err}`);
    }
  }
  function buildPeerOptionLabel(peer) {
    const label = String(peer?.label || '').trim();
    if (label) return label;
    const id = Number(peer?.windowId || 0);
    const port = Number(peer?.port || 0);
    if (id > 0 && port > 0) return `Terminal #${id} (port ${port})`;
    if (id > 0) return `Terminal #${id}`;
    return 'Terminal';
  }
  function renderPeerOptions(state = {}) {
    if (!peerSelect) return;
    const peers = Array.isArray(state.peers) ? state.peers : [];
    terminalIdentityLabel = String(state.selfLabel || terminalIdentityLabel || '').trim();
    renderSelfLabel();
    const selectedPeerWindowId = Number(state.linkedPeerWindowId || 0);
    const selectedGroupPeerIds = Array.isArray(state.groupPeerWindowIds)
      ? state.groupPeerWindowIds.map((v) => Number(v || 0)).filter((v) => v > 0)
      : [];
    // Keep local runtime state for relay decisions.
    linkedPeerId = selectedPeerWindowId > 0 ? selectedPeerWindowId : null;
    groupedPeerIds = new Set(selectedGroupPeerIds);
    const options = [`<option value="">Unlinked</option>`];
    peers.forEach((peer) => {
      const windowId = Number(peer?.windowId || 0);
      if (!windowId) return;
      const selected = selectedPeerWindowId > 0 && windowId === selectedPeerWindowId ? ' selected' : '';
      options.push(`<option value="${windowId}"${selected}>${escapeHtml(buildPeerOptionLabel(peer))}</option>`);
    });
    peerSelect.innerHTML = options.join('');
    if (selectedPeerWindowId > 0 && !peers.some((peer) => Number(peer?.windowId || 0) === selectedPeerWindowId)) {
      peerSelect.value = '';
    }
    if (!peerSelect.value && selectedPeerWindowId > 0) {
      peerSelect.value = String(selectedPeerWindowId);
    }
    if (groupSelect) {
      const groupOptions = [];
      peers.forEach((peer) => {
        const windowId = Number(peer?.windowId || 0);
        if (!windowId) return;
        const selected = selectedGroupPeerIds.includes(windowId) ? ' selected' : '';
        groupOptions.push(`<option value="${windowId}"${selected}>${escapeHtml(buildPeerOptionLabel(peer))}</option>`);
      });
      groupSelect.innerHTML = groupOptions.length > 0
        ? groupOptions.join('')
        : `<option value="" disabled>No other terminals</option>`;
    }
  }
  async function refreshTerminalPeerLinks() {
    if (!peerSelect || meshSyncInProgress) return;
    if (!window.electronAPI || typeof window.electronAPI.terminalLinkListPeers !== 'function') return;
    meshSyncInProgress = true;
    try {
      const state = await window.electronAPI.terminalLinkListPeers();
      if (!state?.success) return;
      terminalWindowId = Number(state.selfWindowId || terminalWindowId || 0) || terminalWindowId;
      renderPeerOptions(state);
    } catch (err) {
      console.warn('[Terminal Mesh] Failed to refresh peers:', err?.message || err);
    } finally {
      meshSyncInProgress = false;
    }
  }
  async function handlePeerSelectChange() {
    if (!peerSelect || meshSyncInProgress) return;
    if (!window.electronAPI || typeof window.electronAPI.terminalLinkSetPeer !== 'function') return;
    const selectedId = Number(peerSelect.value || 0);
    meshSyncInProgress = true;
    try {
      const result = await window.electronAPI.terminalLinkSetPeer(selectedId > 0 ? selectedId : null);
      if (!result?.success) {
        addErrorMessage(`Terminal link failed: ${result?.message || 'Unknown error'}`);
      }
      renderPeerOptions(result || {});
    } catch (err) {
      addErrorMessage(`Terminal link failed: ${err?.message || err}`);
    } finally {
      meshSyncInProgress = false;
    }
  }
  function getSelectedGroupPeerIds() {
    if (!groupSelect) return [];
    const selected = [];
    Array.from(groupSelect.selectedOptions || []).forEach((option) => {
      const value = Number(option?.value || 0);
      if (value > 0) selected.push(value);
    });
    return selected;
  }
  async function handleGroupSelectChange() {
    if (!groupSelect || meshSyncInProgress) return;
    if (!window.electronAPI || typeof window.electronAPI.terminalLinkSetGroupPeers !== 'function') return;
    const selectedIds = getSelectedGroupPeerIds();
    meshSyncInProgress = true;
    try {
      const result = await window.electronAPI.terminalLinkSetGroupPeers(selectedIds);
      if (!result?.success) {
        addErrorMessage(`Terminal group link failed: ${result?.message || 'Unknown error'}`);
      }
      renderPeerOptions(result || {});
    } catch (err) {
      addErrorMessage(`Terminal group link failed: ${err?.message || err}`);
    } finally {
      meshSyncInProgress = false;
    }
  }
  function buildIncomingSpeakerDescriptor(next = {}) {
    const fromWindowId = Number(next.fromWindowId || 0);
    const senderLabel = String(next.senderLabel || '').trim();
    const senderModel = String(next.modelName || '').trim();
    const speakerRole = String(next.speakerRole || 'assistant').trim().toLowerCase();
    const terminalPart = fromWindowId > 0 ? `terminal #${fromWindowId}` : 'terminal';
    if (speakerRole === 'user') {
      return senderLabel
        ? `user at ${terminalPart} (${senderLabel})`
        : `user at ${terminalPart}`;
    }
    const assistantName = senderLabel || senderModel || 'assistant';
    return `${assistantName} at ${terminalPart}`;
  }
  function buildIncomingRelayPrompt(next = {}) {
    const text = String(next.text || '').trim();
    if (!text) return '';
    const speaker = buildIncomingSpeakerDescriptor(next);
    return `[From ${speaker}]\n${text}`;
  }
  function enqueueInboundRelay(payload = {}) {
    const text = String(payload?.text || '').trim();
    if (!text) return;
    inboundRelayQueue.push({
      text,
      fromWindowId: Number(payload?.fromWindowId || 0) || null,
      kind: String(payload?.kind || 'pair').trim().toLowerCase() || 'pair',
      speakerRole: String(payload?.speakerRole || 'assistant').trim().toLowerCase() || 'assistant',
      senderLabel: String(payload?.senderLabel || '').trim(),
      modelName: String(payload?.modelName || '').trim()
    });
    void processInboundRelayQueue();
  }
  async function processInboundRelayQueue() {
    if (inboundRelayBusy) return;
    inboundRelayBusy = true;
    try {
      while (inboundRelayQueue.length > 0) {
        if (inboundRelayHold) return;
        if (isWaitingForResponse || activeStream) {
          await new Promise((resolve) => setTimeout(resolve, 350));
          continue;
        }
        const next = inboundRelayQueue.shift();
        if (!next?.text) continue;
        const prefix = next.kind === 'group' ? 'Group Terminal' : 'Linked Terminal';
        const speaker = buildIncomingSpeakerDescriptor(next);
        addSystemMessage(`${prefix} ${next.fromWindowId ? `#${next.fromWindowId}` : ''}: incoming message from ${speaker}`);
        if (userInput) userInput.value = buildIncomingRelayPrompt(next);
        suppressUserRelay = true;
        try {
          await sendMessage();
        } finally {
          suppressUserRelay = false;
        }
      }
    } finally {
      inboundRelayBusy = false;
    }
  }
  async function relayToMesh(text, speakerRole = 'assistant') {
    const payloadText = String(text || '').trim();
    if (!payloadText) return;
    if (!window.electronAPI) return;
    const sharedPayload = {
      text: payloadText,
      speakerRole: String(speakerRole || 'assistant').trim().toLowerCase() || 'assistant',
      senderLabel: String(terminalIdentityLabel || '').trim(),
      fromWindowId: terminalWindowId || null,
      modelName: currentModel || 'unknown',
      port: terminalPort || null
    };
    const hasGroup = groupedPeerIds instanceof Set && groupedPeerIds.size > 0;
    const hasPair = Number(linkedPeerId || 0) > 0;
    try {
      if (hasPair && (!hasGroup || !groupedPeerIds.has(Number(linkedPeerId)))) {
        if (typeof window.electronAPI.terminalLinkRelayMessage === 'function') {
          await window.electronAPI.terminalLinkRelayMessage(sharedPayload);
        }
      }
      if (hasGroup && typeof window.electronAPI.terminalLinkRelayGroupMessage === 'function') {
        await window.electronAPI.terminalLinkRelayGroupMessage(sharedPayload);
      }
    } catch (err) {
      console.warn('[Terminal Mesh] Relay failed:', err?.message || err);
    }
  }
  async function relayAssistantToPeer(assistantMessage) {
    const text = String(assistantMessage || '').trim();
    if (!text) return;
    await relayToMesh(text, 'assistant');
  }
  async function relayUserToPeer(userMessage) {
    const text = String(userMessage || '').trim();
    if (!text) return;
    await relayToMesh(text, 'user');
  }
  function initializeTerminalMesh() {
    peerSelect = document.getElementById('terminal-peer-select');
    groupSelect = document.getElementById('terminal-group-select');
    interjectBtn = document.getElementById('interject-btn');
    labelBtn = document.getElementById('terminal-label-btn');
    selfLabelEl = document.getElementById('terminal-self-label');
    if (!peerSelect) return;
    peerSelect.addEventListener('change', handlePeerSelectChange);
    if (groupSelect) {
      groupSelect.addEventListener('change', handleGroupSelectChange);
    }
    if (interjectBtn) {
      interjectBtn.addEventListener('click', handleInterjectClick);
      syncInterjectButton();
    }
    if (labelBtn) {
      labelBtn.addEventListener('click', handleLabelEdit);
    }
    renderSelfLabel();
    if (window.electronAPI && typeof window.electronAPI.onTerminalLinkStateChanged === 'function') {
      if (typeof meshStateUnsubscribe === 'function') {
        try { meshStateUnsubscribe(); } catch (_) {}
      }
      meshStateUnsubscribe = window.electronAPI.onTerminalLinkStateChanged((state = {}) => {
        if (state && Number(state.selfWindowId || 0) && terminalWindowId && Number(state.selfWindowId) !== Number(terminalWindowId)) {
          return;
        }
        renderPeerOptions(state);
      });
    }
    if (window.electronAPI && typeof window.electronAPI.onTerminalLinkInbound === 'function') {
      window.electronAPI.onTerminalLinkInbound((payload = {}) => {
        enqueueInboundRelay(payload);
      });
    }
    refreshTerminalPeerLinks();
    if (meshRefreshTimer) clearInterval(meshRefreshTimer);
    meshRefreshTimer = setInterval(refreshTerminalPeerLinks, 2500);
  }
  function initialize(terminalConfig) {
    if (!window.TerminalInit || typeof window.TerminalInit.createInitController !== 'function') {
      console.error('[Terminal] Init controller module not loaded.');
      return;
    }
    if (window.TerminalPreferences && typeof window.TerminalPreferences.createPreferenceController === 'function') {
      preferenceController = window.TerminalPreferences.createPreferenceController(window.localStorage);
    }
    const fallbackPrefsFactory = window.TerminalRendererDefaults?.createFallbackPreferenceApi;
    const fallbackPrefs = (typeof fallbackPrefsFactory === 'function')
      ? fallbackPrefsFactory()
      : {
          loadAssisted: () => false,
          setAssisted: () => {},
          loadVerboseTrace: () => false,
          setVerboseTrace: () => {},
          loadQuality: () => 'balanced',
          setQuality: () => {},
          loadProfile: () => 'balanced',
          setProfile: () => {},
          loadProvider: () => 'legacy',
          setProvider: () => {},
          loadAdvancedBudgets: () => false,
          setAdvancedBudgets: () => {},
          loadIncludeSharedAttachments: () => false,
          setIncludeSharedAttachments: () => {},
          normalizeBudgets: (value) => value || {},
          loadBudgets: () => ({}),
          setBudgets: () => {},
          loadLlmAssistedFileNaming: () => true,
          setLlmAssistedFileNaming: () => {}
        };
    const prefs = (window.TerminalPreferences && typeof window.TerminalPreferences.createPreferenceApi === 'function')
      ? window.TerminalPreferences.createPreferenceApi(preferenceController)
      : fallbackPrefs;
    function persistTerminalModelConfig() {
      if (!prefs || typeof prefs.saveModelConfig !== 'function') return;
      const modelKey = String(currentModel || '').trim();
      const payload = {
        provider,
        provider_base_url: providerBaseUrl,
        provider_api_key: providerApiKey,
        provider_model_id: providerModelId,
        llama_cpp_model_path: llamaCppModelPath,
        systemPrompt,
        temperature,
        top_p,
        top_k,
        num_ctx,
        num_gpu,
        num_predict,
        repeat_penalty,
        seed,
        stop: stopSequences
      };
      try {
        localStorage.setItem(GLOBAL_PROVIDER_PREFS_KEY, JSON.stringify({
          provider: payload.provider,
          provider_base_url: payload.provider_base_url,
          provider_api_key: payload.provider_api_key,
          provider_model_id: payload.provider_model_id,
          llama_cpp_model_path: payload.llama_cpp_model_path
        }));
      } catch (_) {}
      if (!modelKey) return;
      prefs.saveModelConfig(modelKey, payload);
    }
    if (!speechController && window.TerminalSpeech && typeof window.TerminalSpeech.createTerminalSpeechController === 'function') {
      speechController = window.TerminalSpeech.createTerminalSpeechController({
        getVoiceController: () => voiceController,
        getSpeechEngine: () => speechEngine,
        setSpeechEngine: (value) => { speechEngine = value; },
        getLastSpeechCfg: () => lastSpeechCfg,
        setLastSpeechCfg: (value) => { lastSpeechCfg = value; },
        getProfileKey: () => speechEngineProfileKey,
        setProfileKey: (value) => { speechEngineProfileKey = String(value || ''); },
        getChunkProfile: () => speechChunkProfile,
        setChunkProfile: (value) => { speechChunkProfile = value || { preview: 140, segment: 220, tail: 240 }; },
        addSystemMessage
      });
    }
    if (!ioController && window.TerminalIo && typeof window.TerminalIo.createIoController === 'function') {
      ioController = window.TerminalIo.createIoController({
        getCommandController: () => commandController,
        getAttachmentController: () => attachmentController,
        getUserInput: () => userInput,
        getVoiceController: () => voiceController,
        setVoiceController: (value) => { voiceController = value; },
        setVoiceElements: (nextVoiceBtn, nextVoiceModeBtn) => {
          voiceBtn = nextVoiceBtn || null;
          voiceModeBtn = nextVoiceModeBtn || null;
        },
        addErrorMessage,
        addSystemMessage,
        applyInputRecall,
        sendMessage,
        getIsWaitingForResponse: () => isWaitingForResponse,
        getActiveStream: () => activeStream,
        setActiveStream: (value) => { activeStream = value; },
        setStreamStopRequested: (value) => { streamStopRequested = Boolean(value); },
        getTerminalPort: () => terminalPort,
        setWaitingState,
        ensureSpeechEngine,
        setLastSpeechCfg: (value) => { lastSpeechCfg = value; },
        applySpeechEngineProfile
      });
    }
    if (!initController) {
      initController = window.TerminalInit.createInitController();
    }
    rlmAssisted = prefs.loadAssisted();
    rlmVerboseTrace = prefs.loadVerboseTrace();
    rlmQuality = prefs.loadQuality();
    rlmProfile = prefs.loadProfile();
    rlmProvider = prefs.loadProvider();
    rlmAdvancedBudgets = prefs.loadAdvancedBudgets();
    rlmIncludeSharedAttachments = prefs.loadIncludeSharedAttachments();
    rlmBudgets = prefs.loadBudgets();
    llmAssistedFileNaming = prefs.loadLlmAssistedFileNaming();
    const bridge = window.TerminalInitBridge;
    if (!bridge || typeof bridge.buildInitOptions !== 'function') {
      console.error('[Terminal] Init bridge module not loaded.');
      return;
    }

    const initOptions = bridge.buildInitOptions({
      setConfig: (value) => { config = value; },
      getConfig: () => config,
      getRlmAssisted: () => rlmAssisted,
      setRlmAssisted: (value) => { rlmAssisted = value === true; prefs.setAssisted(rlmAssisted); },
      getRlmVerboseTrace: () => rlmVerboseTrace,
      setRlmVerboseTrace: (value) => { rlmVerboseTrace = value === true; prefs.setVerboseTrace(rlmVerboseTrace); },
      getRlmQuality: () => rlmQuality,
      setRlmQuality: (value) => { prefs.setQuality(value); rlmQuality = prefs.loadQuality(); },
      getRlmProfile: () => rlmProfile,
      setRlmProfile: (value) => { prefs.setProfile(value); rlmProfile = prefs.loadProfile(); },
      getRlmProvider: () => rlmProvider,
      setRlmProvider: (value) => { prefs.setProvider(value); rlmProvider = prefs.loadProvider(); },
      getRlmAdvancedBudgets: () => rlmAdvancedBudgets,
      setRlmAdvancedBudgets: (value) => { rlmAdvancedBudgets = value === true; prefs.setAdvancedBudgets(rlmAdvancedBudgets); },
      getRlmIncludeSharedAttachments: () => rlmIncludeSharedAttachments,
      setRlmIncludeSharedAttachments: (value) => {
        rlmIncludeSharedAttachments = value === true;
        prefs.setIncludeSharedAttachments(rlmIncludeSharedAttachments);
      },
      getRlmBudgets: () => ({ ...rlmBudgets }),
      setRlmBudgets: (value) => { rlmBudgets = prefs.normalizeBudgets(value); prefs.setBudgets(rlmBudgets); },
      getLlmAssistedFileNaming: () => llmAssistedFileNaming,
      setLlmAssistedFileNaming: (value) => {
        prefs.setLlmAssistedFileNaming(value === true);
        llmAssistedFileNaming = prefs.loadLlmAssistedFileNaming();
      },
      setCurrentModel: (value) => { currentModel = value; },
      getCurrentModel: () => currentModel,
      setTerminalPort: (value) => { terminalPort = value; },
      getTerminalPort: () => terminalPort,
      getTerminalWindowId: () => terminalWindowId,
      getTerminalIdentityLabel: () => String(terminalIdentityLabel || '').trim(),
      setAttachmentSessionId: (value) => { attachmentSessionId = value; },
      getAttachmentSessionId: () => attachmentSessionId,
      setSystemPrompt: (value) => { systemPrompt = value; },
      getSystemPrompt: () => systemPrompt,
      setTemperature: (value) => { temperature = value; },
      getTemperature: () => temperature,
      setProvider: (value) => { provider = String(value || 'ollama').trim().toLowerCase() || 'ollama'; },
      getProvider: () => provider,
      setProviderBaseUrl: (value) => { providerBaseUrl = String(value || '').trim(); },
      getProviderBaseUrl: () => providerBaseUrl,
      setProviderApiKey: (value) => { providerApiKey = String(value || ''); },
      getProviderApiKey: () => providerApiKey,
      setProviderModelId: (value) => { providerModelId = String(value || '').trim(); },
      getProviderModelId: () => providerModelId,
      setLlamaCppModelPath: (value) => { llamaCppModelPath = String(value || '').trim(); },
      getLlamaCppModelPath: () => llamaCppModelPath,
      setTopP: (value) => { top_p = value; },
      getTopP: () => top_p,
      setTopK: (value) => { top_k = value; },
      getTopK: () => top_k,
      setNumCtx: (value) => { num_ctx = value; },
      getNumCtx: () => num_ctx,
      setNumGpu: (value) => { num_gpu = value; },
      getNumGpu: () => num_gpu,
      setNumPredict: (value) => { num_predict = value; },
      getNumPredict: () => num_predict,
      setRepeatPenalty: (value) => { repeat_penalty = value; },
      getRepeatPenalty: () => repeat_penalty,
      setSeed: (value) => { seed = value; },
      getSeed: () => seed,
      setStopSequences: (value) => { stopSequences = value; },
      getStopSequences: () => stopSequences,
      persistTerminalModelConfig,
      controllerBindings: {
        uiController: { set: (v) => { uiController = v; }, get: () => uiController },
        memoryController: { set: (v) => { memoryController = v; }, get: () => memoryController },
        attachmentController: { set: (v) => { attachmentController = v; }, get: () => attachmentController },
        sessionController: { set: (v) => { sessionController = v; }, get: () => sessionController },
        commandController: { set: (v) => { commandController = v; }, get: () => commandController },
        persistenceController: { set: (v) => { persistenceController = v; }, get: () => persistenceController },
        contextMenuController: { set: (v) => { contextMenuController = v; }, get: () => contextMenuController },
        streamController: { set: (v) => { streamController = v; }, get: () => streamController },
        chatFlowController: { set: (v) => { chatFlowController = v; }, get: () => chatFlowController },
        bootstrapController: { set: (v) => { bootstrapController = v; }, get: () => bootstrapController },
        runtimeController: { set: (v) => { runtimeController = v; }, get: () => runtimeController }
      },
      domBindings: {
        chatDisplay: { set: (v) => { chatDisplay = v; }, get: () => chatDisplay },
        userInput: { set: (v) => { userInput = v; }, get: () => userInput },
        sendBtn: { set: (v) => { sendBtn = v; }, get: () => sendBtn },
        stopBtn: { set: (v) => { stopBtn = v; }, get: () => stopBtn },
        attachmentsBtn: { set: (v) => { attachmentsBtn = v; }, get: () => attachmentsBtn },
        statusText: { set: (v) => { statusText = v; }, get: () => statusText },
        gpuIcon: { set: (v) => { gpuIcon = v; }, get: () => gpuIcon },
        gpuText: { set: (v) => { gpuText = v; }, get: () => gpuText }
      },
      addSystemMessage,
      addSystemImagePreview,
      addErrorMessage,
      escapeHtml,
      formatBytes,
      getConversationHistory: () => conversationHistory,
      setConversationHistory: (history) => {
        conversationHistory.length = 0;
        conversationHistory.push(...(Array.isArray(history) ? history : []));
      },
      addMessage,
      saveConversation,
      loadConversation,
      listSavedConversations,
      deleteSavedConversation,
      recordSessionMemory,
      clearConversation,
      handleStopClick,
      attachFile,
      listAttachments,
      detachAttachment,
      clearAttachments,
      getActiveStream: () => activeStream,
      setActiveStream: (value) => { activeStream = value; },
      sanitizeQwenSelfDialogue,
      finalizeStreamingMessage,
      setWaitingState,
      setThinkingStatusText,
      appendConversationPair: (userMessage, assistantMessage, options = {}) => {
        conversationHistory.push({ role: 'user', content: userMessage });
        conversationHistory.push({ role: 'assistant', content: assistantMessage });
        if (options?.skipTts !== true) {
          void speakAssistantText(assistantMessage);
        }
        if (options?.skipRelay !== true) {
          void relayAssistantToPeer(assistantMessage);
        }
        if (!inboundRelayHold) {
          void processInboundRelayQueue();
        }
      },
      isTtsDebugTraceEnabled,
      speakAssistantText,
      getTtsQueueDepth: () => {
        const engine = ensureSpeechEngine();
        return engine && typeof engine.getQueueDepth === 'function' ? engine.getQueueDepth() : 0;
      },
      getSpeechEngine: () => ensureSpeechEngine(),
      getSpeechChunkProfile: () => ({ ...speechChunkProfile }),
      addInputRecallEntry,
      handleCommand,
      buildAttachmentContext,
      shouldInjectAttachmentContext,
      buildOllamaOptions,
      addAssistantShell,
      setStreamStopRequested: (value) => { streamStopRequested = Boolean(value); },
      getStreamStopRequested: () => streamStopRequested,
      getRlmController: () => rlmController,
      getRlmProvider: () => rlmProvider,
      runRlmTurn: (payload = {}) => {
        if (!window.electronAPI || typeof window.electronAPI.rlmRunTurn !== 'function') {
          return Promise.resolve({ success: false, handled: false, error: 'rlmRunTurn API unavailable' });
        }
        return window.electronAPI.rlmRunTurn(payload);
      },
      getLlmAssistedFileNaming: () => llmAssistedFileNaming,
      configureMarkdown,
      installDragAndDropAttach,
      updateGPUIndicator,
      populateModelDropdown,
      handleSendClick: () => {
        if (!isWaitingForResponse) {
          clearInterject();
          sendMessage();
        }
      },
      openAttachmentManager,
      handleInputKeypress,
      loadSessionMemoryPreferences,
      loadInputRecallHistory,
      verifyGPUUsage: async () => {
        if (!runtimeController || typeof runtimeController.verifyGPUUsage !== 'function') return;
        await runtimeController.verifyGPUUsage();
      }
    });

    if (prefs && typeof prefs.loadModelConfig === 'function') {
      try {
        const globalRaw = localStorage.getItem(GLOBAL_PROVIDER_PREFS_KEY);
        const globalPrefs = globalRaw ? JSON.parse(globalRaw) : null;
        if (globalPrefs && typeof globalPrefs === 'object') {
          if (Object.prototype.hasOwnProperty.call(globalPrefs, 'provider')) terminalConfig.provider = String(globalPrefs.provider || terminalConfig.provider || 'ollama');
          if (Object.prototype.hasOwnProperty.call(globalPrefs, 'provider_base_url')) terminalConfig.baseUrl = String(globalPrefs.provider_base_url || terminalConfig.baseUrl || '');
          if (Object.prototype.hasOwnProperty.call(globalPrefs, 'provider_api_key')) terminalConfig.apiKey = String(globalPrefs.provider_api_key || terminalConfig.apiKey || '');
          if (Object.prototype.hasOwnProperty.call(globalPrefs, 'provider_model_id')) terminalConfig.providerModel = String(globalPrefs.provider_model_id || terminalConfig.providerModel || '');
          if (Object.prototype.hasOwnProperty.call(globalPrefs, 'llama_cpp_model_path')) terminalConfig.llamaCppModelPath = String(globalPrefs.llama_cpp_model_path || terminalConfig.llamaCppModelPath || '');
        }
      } catch (_) {}
      const preKey = String(terminalConfig?.modelName || '').trim();
      if (preKey) {
        const preSaved = prefs.loadModelConfig(preKey);
        if (preSaved && typeof preSaved === 'object') {
          // Preserve global/provider persistence precedence for backend selection.
          // Model-specific config should not force provider reset on startup.
          // (Keeps dropdown/provider selections stable across sessions.)
          if (Object.prototype.hasOwnProperty.call(preSaved, 'systemPrompt')) terminalConfig.systemPrompt = String(preSaved.systemPrompt || terminalConfig.systemPrompt || '');
          if (Object.prototype.hasOwnProperty.call(preSaved, 'temperature')) terminalConfig.temperature = Number(preSaved.temperature ?? terminalConfig.temperature ?? 0.7);
          if (Object.prototype.hasOwnProperty.call(preSaved, 'top_p')) terminalConfig.top_p = Number(preSaved.top_p ?? terminalConfig.top_p ?? 0.9);
          if (Object.prototype.hasOwnProperty.call(preSaved, 'top_k')) terminalConfig.top_k = Number(preSaved.top_k ?? terminalConfig.top_k ?? 40);
          if (Object.prototype.hasOwnProperty.call(preSaved, 'num_ctx')) terminalConfig.num_ctx = Number(preSaved.num_ctx ?? terminalConfig.num_ctx ?? 4096);
          if (Object.prototype.hasOwnProperty.call(preSaved, 'num_gpu')) terminalConfig.num_gpu = Number(preSaved.num_gpu ?? terminalConfig.num_gpu ?? 0);
        }
      }
    }

    initController.initializeTerminal(terminalConfig, initOptions);
    terminalWindowId = Number(terminalConfig?.terminalWindowId || 0) || null;
    renderSelfLabel();
    initializeTerminalMesh();
    if (prefs && typeof prefs.loadModelConfig === 'function') {
      const savedModelCfg = prefs.loadModelConfig(currentModel);
      if (savedModelCfg && typeof savedModelCfg === 'object') {
        if (Object.prototype.hasOwnProperty.call(savedModelCfg, 'systemPrompt')) systemPrompt = savedModelCfg.systemPrompt;
        // Do not override provider runtime from per-model config at startup.
        // Provider persistence is handled globally/per-provider in commands-models.
        if (Object.prototype.hasOwnProperty.call(savedModelCfg, 'temperature')) temperature = savedModelCfg.temperature;
        if (Object.prototype.hasOwnProperty.call(savedModelCfg, 'top_p')) top_p = savedModelCfg.top_p;
        if (Object.prototype.hasOwnProperty.call(savedModelCfg, 'top_k')) top_k = savedModelCfg.top_k;
        if (Object.prototype.hasOwnProperty.call(savedModelCfg, 'num_ctx')) num_ctx = savedModelCfg.num_ctx;
        if (Object.prototype.hasOwnProperty.call(savedModelCfg, 'num_gpu')) num_gpu = savedModelCfg.num_gpu;
        if (Object.prototype.hasOwnProperty.call(savedModelCfg, 'num_predict')) num_predict = savedModelCfg.num_predict;
        if (Object.prototype.hasOwnProperty.call(savedModelCfg, 'repeat_penalty')) repeat_penalty = savedModelCfg.repeat_penalty;
        if (Object.prototype.hasOwnProperty.call(savedModelCfg, 'seed')) seed = savedModelCfg.seed;
        if (Object.prototype.hasOwnProperty.call(savedModelCfg, 'stop')) stopSequences = savedModelCfg.stop;
      }
    }

    rlmController = bridge.createRlmController({
      getElectronAPI: () => window.electronAPI,
      getSessionId: () => attachmentSessionId,
      getModelName: () => currentModel,
      sendMessage: (modelName, messages, options = {}) => {
        if (!window.electronAPI || typeof window.electronAPI.ollamaSendMessage !== 'function') {
          return Promise.resolve({ success: false, message: 'ollamaSendMessage API unavailable' });
        }
        return window.electronAPI.ollamaSendMessage(modelName, messages, options);
      },
      buildOllamaOptions,
      getRlmVerboseTrace: () => rlmVerboseTrace,
      getRlmQuality: () => rlmQuality,
      getIncludeSharedAttachments: () => rlmIncludeSharedAttachments,
      getRlmBudgets: () => ({ ...rlmBudgets }),
      getSharedAttachmentSessionId: () => RLM_SHARED_ATTACHMENT_SESSION_ID,
      onThinkingStatus: (text) => setThinkingStatusText(text)
    });

    initializeVoiceToText().catch((err) => {
      addErrorMessage(`Voice init error: ${err?.message || String(err)}`);
    });
  }
  const shell = window.TerminalShell && typeof window.TerminalShell.createSessionActions === 'function'
    ? window.TerminalShell.createSessionActions(() => sessionController)
    : {
        showPrompt: async () => null,
        closeModal: () => {},
        promptSave: async () => {},
        promptLoad: async () => {},
        promptDelete: async () => {}
      };

  const terminalApp = {
    initialize: initialize,
    showPrompt: shell.showPrompt,
    promptSave: shell.promptSave,
    promptLoad: shell.promptLoad,
    promptDelete: shell.promptDelete,
    closeModal: shell.closeModal,
    toggleConfig: () => {
      if (!commandController || typeof commandController.toggleConfig !== 'function') return;
      commandController.toggleConfig();
    },
    applyConfig: () => {
      if (!commandController || typeof commandController.applyConfig !== 'function') return;
      commandController.applyConfig();
    },
    
    // Expose for debugging (optional - can be removed in production)
    _debug: {
      getConfig: () => config,
      getHistory: () => conversationHistory,
      getPort: () => terminalPort,
      getModel: () => currentModel
    }
  };

  if (window.TerminalShell && typeof window.TerminalShell.mountTerminalApp === 'function') {
    window.TerminalShell.mountTerminalApp(terminalApp);
  } else {
    window.TerminalApp = terminalApp;
  }
  
  console.log('[Terminal Renderer] Module loaded, waiting for initialization...');
  
})();
