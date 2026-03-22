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
  let voiceController = null;
  let speechEngine = null;
  let speechController = null;
  let lastSpeechCfg = null;
  let speechEngineProfileKey = '';
  let speechChunkProfile = { preview: 140, segment: 220, tail: 240 };
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
  async function sendMessage() { await callAsync(chatFlowController, 'sendMessage'); }
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
  function handleInputKeypress(e) { call(ioController, 'handleInputKeypress', undefined, e); }
  async function handleStopClick() { await callAsync(ioController, 'handleStopClick'); }
  async function initializeVoiceToText() { await callAsync(ioController, 'initializeVoiceToText'); }
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
      if (!modelKey) return;
      prefs.saveModelConfig(modelKey, {
        systemPrompt,
        temperature,
        top_p,
        top_k,
        num_ctx,
        num_predict,
        repeat_penalty,
        seed,
        stop: stopSequences
      });
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
      setAttachmentSessionId: (value) => { attachmentSessionId = value; },
      getAttachmentSessionId: () => attachmentSessionId,
      setSystemPrompt: (value) => { systemPrompt = value; },
      getSystemPrompt: () => systemPrompt,
      setTemperature: (value) => { temperature = value; },
      getTemperature: () => temperature,
      setTopP: (value) => { top_p = value; },
      getTopP: () => top_p,
      setTopK: (value) => { top_k = value; },
      getTopK: () => top_k,
      setNumCtx: (value) => { num_ctx = value; },
      getNumCtx: () => num_ctx,
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
        if (!isWaitingForResponse) sendMessage();
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

    initController.initializeTerminal(terminalConfig, initOptions);
    if (prefs && typeof prefs.loadModelConfig === 'function') {
      const savedModelCfg = prefs.loadModelConfig(currentModel);
      if (savedModelCfg && typeof savedModelCfg === 'object') {
        if (Object.prototype.hasOwnProperty.call(savedModelCfg, 'systemPrompt')) systemPrompt = savedModelCfg.systemPrompt;
        if (Object.prototype.hasOwnProperty.call(savedModelCfg, 'temperature')) temperature = savedModelCfg.temperature;
        if (Object.prototype.hasOwnProperty.call(savedModelCfg, 'top_p')) top_p = savedModelCfg.top_p;
        if (Object.prototype.hasOwnProperty.call(savedModelCfg, 'top_k')) top_k = savedModelCfg.top_k;
        if (Object.prototype.hasOwnProperty.call(savedModelCfg, 'num_ctx')) num_ctx = savedModelCfg.num_ctx;
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
