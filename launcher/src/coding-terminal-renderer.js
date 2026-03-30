/**
 * PSF Coding Terminal - Renderer
 * Frontend logic for coding terminal interface
 * 
 * @version 1.1.2 - March 5, 2026
 */

(function() {
  'use strict';

  // ==========================================================================
  // State
  // ==========================================================================
  
  const state = {
    currentView: 'chat',
    projectPath: null,
    ragSources: [],
    gitStatus: null,
    modelName: 'No model selected',
    selectedModelValue: '',
    routerModelName: 'Router: not set',
    models: [],
    routerModels: [],
    routerMode: 'off',
    routerEnabled: false,
    routerUseGpu: true,
    inferenceBackend: 'ollama',
    ragEnabled: true,
    ragDebug: false,
    deterministicFileRead: false,
    cliAgentEnabled: false,
    cliAgentPolicy: 'workspace-write',
    cliAgentStepBudget: 2,
    testMode: false,
    rlmAssisted: true,
    rlmIncludeSharedAttachments: false,
    rlmProfile: 'balanced',
    rlmAdvancedBudgets: false,
    rlmBudgets: {
      maxToolCalls: 40,
      maxRecursionDepth: 3,
      maxChunksProcessed: 48,
      maxRuntimeMs: 45000,
      maxEvidenceHits: 28
    },
    diffLegendEnabled: false,
    diffDisplayMode: 'raw',
    chatMode: 'auto',
    streaming: false,
    activeStreamId: null,
    activeMessageShellId: null,
    activeStreamBuffer: '',
    activeThinkingBuffer: '',
    downloadCounter: 0,
    showThinking: true,
    autoScroll: true,
    showRouterDebug: false,
    routerDebugEntries: [],
    ragIndexing: false,
    ragIndexRunId: null,
    ragProgress: null,
    ragLastProgressUiAt: 0,
    ragCollapsed: false,
    gitControlsCollapsed: false,
    gitStatusCollapsed: false,
    contextRailCollapsed: true,
    ragBuckets: [],
    ragActiveBucket: null,
    editorFiles: [],
    editorCurrentFile: null,
    editorDirty: false,
    gitStatusLabel: 'N/A',
    sessionMemoryEnabled: true,
    sessionMemorySessionId: 'coding-terminal',
    promptRecallHistory: [],
    promptRecallIndex: -1,
    promptRecallDraft: '',
    attachmentController: null,
    voiceController: null,
    speechEngine: null,
    chatHistory: []
  };

  // ==========================================================================
  // DOM References
  // ==========================================================================
  
  let elements = {};
  let bootstrapModule = null;
  let sessionsModule = null;
  const featureModules = {
    text: null,
    shell: null,
    chat: null,
    rag: null,
    git: null,
    gitActions: null,
    events: null,
    runtime: null,
    trace: null,
    project: null,
    editor: null,
    ui: null,
    rlm: null
  };

  function cacheElements() {
    return bootstrapModule?.cacheElements?.();
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================
  
  async function initialize() {
    console.log('[CodingTerminal] Initializing...');

    if (window.CodingTerminalRendererBootstrap?.createBootstrapModule) {
      bootstrapModule = window.CodingTerminalRendererBootstrap.createBootstrapModule({
        state,
        featureModules,
        getElements: () => elements,
        setElements: (next) => {
          elements = next || {};
        },
        api: buildBootstrapApi()
      });
    }

    cacheElements();
    initializeSharedAttachments();
    await initializeVoiceToText();
    initializeFeatureModules();
    initializeRlmModule();
    initializeSessionsModule();
    await applyGlobalThemeFromSettings();
    if (window.electronAPI?.onThemeUpdated) {
      window.electronAPI.onThemeUpdated(() => {
        applyGlobalThemeFromSettings();
      });
    }
    configureMarkdown();
    attachEventListeners();
    attachStreamListeners();

    const resumed = restoreLastSessionOnStartup();

    // Initial state
    if (!resumed) {
      addSystemMessage('Coding Terminal ready. Type a message to begin.');
    } else {
      addSystemMessage('Session restored. Continue where you left off.');
    }
    updateStatus('model', 'Ready');
    updateProjectRootButton();
    loadUiPreferences();
    applyThinkingToggleUi();
    applyAutoScrollToggleUi();
    applyRouterDebugToggleUi();
    applyRagCollapseUi();
    applyGitCollapseUi();
    applyContextRailUi();
    updateStreamingUi();
    loadModelSelector();
    loadRouterModelSelector();
    loadInferenceBackend();
    loadFooterCopyright();
    loadRuntimeConfig();
    initializeProjectContext();
    refreshRagBuckets();
    refreshRagSources();
    refreshGitStatus();
    callFeature('trace', 'startPolling');
    
    console.log('[CodingTerminal] Initialized');
  }

  function initializeFeatureModules() {
    return bootstrapModule?.initializeFeatureModules?.();
  }

  function initializeRlmModule() {
    if (!window.CodingTerminalRendererRlm?.createRlmModule) return;
    featureModules.rlm = window.CodingTerminalRendererRlm.createRlmModule({
      state,
      api: {
        saveUiPreferences,
        addSystemMessage,
        promptText
      }
    });
  }

  function initializeSessionsModule() {
    if (!window.CodingTerminalRendererSessions?.createSessionsModule) return;
    sessionsModule = window.CodingTerminalRendererSessions.createSessionsModule({
      state,
      api: {
        getConversationSnapshot: () => callFeatureOr('chat', 'getConversationEntries', []),
        loadConversationEntries: (entries) => callFeature('chat', 'loadConversationEntries', entries),
        clearConversation: () => callFeature('chat', 'clearConversation'),
        updateProjectRootButton,
        addSystemMessage,
        promptText,
        confirmAction: (message) => callFeatureOr('shell', 'confirmAction', true, message),
        escapeHtml
      }
    });
  }

  function initializeSharedAttachments() {
    if (!window.TerminalAttachments?.createAttachmentController) return;
    if (state.attachmentController) return;
    state.attachmentController = window.TerminalAttachments.createAttachmentController({
      getSessionId: () => String(state.sessionMemorySessionId || 'coding-terminal'),
      getElectronAPI: () => window.electronAPI || null,
      addSystemMessage,
      addErrorMessage: addSystemMessage,
      escapeHtml,
      formatBytes: (bytes) => {
        const n = Number(bytes) || 0;
        if (n < 1024) return `${n} B`;
        const kb = n / 1024;
        if (kb < 1024) return `${kb.toFixed(2)} KB`;
        const mb = kb / 1024;
        return `${mb.toFixed(2)} MB`;
      }
    });
    state.attachmentController.installDragAndDropAttach?.();
  }

  async function initializeVoiceToText() {
    if (!window.PsfVoiceToText || typeof window.PsfVoiceToText.createVoiceController !== 'function') return;
    const voiceBtn = document.getElementById('voice-btn');
    const voiceModeBtn = document.getElementById('voice-mode-btn');
    const userInput = document.getElementById('user-input');
    if (!voiceBtn || !userInput) return;
    state.voiceController = window.PsfVoiceToText.createVoiceController({
      surface: 'psf-coding-terminal',
      getElectronAPI: () => window.electronAPI || null,
      getInputElement: () => userInput,
      getButtonElement: () => voiceBtn,
      getModeButtonElement: () => voiceModeBtn,
      onAutoSend: () => {
        if (state.streaming) return;
        const pending = String(userInput?.value || '').trim();
        if (!pending) return;
        callFeature('chat', 'handleSend');
      },
      onStatus: (text) => addSystemMessage(text),
      onError: (text) => addSystemMessage(`Voice: ${text}`),
      onTranscription: (text) => {
        if (!text) return;
        state.voiceController?.handleTranscript?.(text);
      }
    });
    await state.voiceController.init();
    if (window.PsfSpeechEngine && typeof window.PsfSpeechEngine.createSpeechEngine === 'function') {
      state.speechEngine = window.PsfSpeechEngine.createSpeechEngine({
        runSpeak: (chunk) => state.voiceController?.speak?.(chunk),
        runSynthesize: (chunk) => state.voiceController?.synthesize?.(chunk),
        runPlayAudio: (audioJob) => state.voiceController?.playAudio?.(audioJob?.audioBase64 || '', audioJob?.mimeType || 'audio/wav'),
        interruptPlayback: () => state.voiceController?.stopSpeech?.(),
        isDebugEnabled: () => false
      });
    }
  }

  async function initializeProjectContext() {
    return bootstrapModule?.initializeProjectContext?.();
  }

  // Markdown Configuration
  const configureMarkdown = () => featureModules.text?.configureMarkdown?.();
  const parseMarkdown = (text) => featureModules.text?.parseMarkdown?.(text) || String(text || '');
  const escapeHtml = (text) => featureModules.text?.escapeHtml?.(text) || '';
  const highlightCodeBlocks = (container) => featureModules.text?.highlightCodeBlocks?.(container);
  const attachEventListeners = () => callFeature('events', 'attachEventListeners');
  const attachStreamListeners = () => callFeature('chat', 'attachStreamListeners');

  async function sendMessage(message) {
    addPromptRecallEntry(message);
    return callFeature('chat', 'sendMessage', message);
  }

  function handleThinkingToggle() {
    state.showThinking = !state.showThinking;
    saveUiPreferences();
    applyThinkingToggleUi();
    refreshThinkingVisibility();
  }

  function handleAutoScrollToggle() {
    state.autoScroll = !state.autoScroll;
    saveUiPreferences();
    applyAutoScrollToggleUi();
  }

  function handleRouterDebugToggle() {
    state.showRouterDebug = !state.showRouterDebug;
    saveUiPreferences();
    applyRouterDebugToggleUi();
    renderRouterDebugPanel();
  }

  async function handleVoiceToggle() {
    if (!state.voiceController || typeof state.voiceController.toggle !== 'function') return;
    await state.voiceController.toggle();
  }

  function callFeature(moduleName, methodName, ...args) {
    return featureModules[moduleName]?.[methodName]?.(...args);
  }

  function callFeatureOr(moduleName, methodName, fallbackValue, ...args) {
    const result = callFeature(moduleName, methodName, ...args);
    return result === undefined ? fallbackValue : result;
  }

  function delegate(moduleName, methodName) {
    return (...args) => callFeature(moduleName, methodName, ...args);
  }

  function buildBootstrapApi() {
    return {
      escapeHtml,
      parseMarkdown,
      highlightCodeBlocks,
      addSystemMessage,
      addMessage,
      sendMessage,
      updateStatus: delegate('shell', 'updateStatus'),
      updateRagSources: delegate('rag', 'updateRagSources'),
      updateRagProgressUi: delegate('shell', 'updateRagProgressUi'),
      addRouterDebugEntry: delegate('ui', 'addRouterDebugEntry'),
      addPromptRecallEntry: delegate('runtime', 'addPromptRecallEntry'),
      pushModelTrace: delegate('trace', 'pushModelTrace'),
      setActiveModelTrace: delegate('trace', 'setActiveModelTrace'),
      clearActiveModelTrace: delegate('trace', 'clearActiveModelTrace'),
      refreshPlanRuns: delegate('trace', 'refreshPlanRuns'),
      refreshCliLoop: delegate('trace', 'refreshCliLoop'),
      refreshModelTrace: delegate('trace', 'refreshNow'),
      onConversationChanged: handleConversationChanged,
      refreshEditorFiles: delegate('editor', 'refreshEditorFiles'),
      refreshGitStatus: delegate('git', 'refreshGitStatus'),
      updateRagButtons: delegate('shell', 'updateRagButtons'),
      updateRagIndexInfo: delegate('shell', 'updateRagIndexInfo'),
      confirmAction: delegate('shell', 'confirmAction'),
      promptText: delegate('shell', 'promptText'),
      normalizeBucketIdForUi: (value) => callFeatureOr('shell', 'normalizeBucketIdForUi', '', value),
      handleSend: delegate('chat', 'handleSend'),
      handleStop: delegate('chat', 'handleStop'),
      handleSteer: delegate('chat', 'handleSteer'),
      handleVoiceToggle,
      handlePromptRecallKeydown: (event, inputEl, sendFn) => callFeatureOr('runtime', 'handlePromptRecallKeydown', false, event, inputEl, sendFn),
      switchView: delegate('ui', 'switchView'),
      handleHeaderRagClick: delegate('ui', 'handleHeaderRagClick'),
      handleHeaderGitClick: delegate('ui', 'handleHeaderGitClick'),
      handleHeaderSettingsClick: delegate('ui', 'handleHeaderSettingsClick'),
      handleContextRailToggle: delegate('ui', 'handleContextRailToggle'),
      handleContextRailSelect: delegate('ui', 'handleContextRailSelect'),
      handleSessionNew,
      handleSessionSave,
      handleSessionLoad,
      handleSessionDelete,
      handleSelectProjectRoot: delegate('project', 'handleSelectProjectRoot'),
      handleSelectRagBucketFromHeader: delegate('rag', 'handleSelectRagBucketFromHeader'),
      openRlmAttachmentManager: delegate('project', 'openRlmAttachmentManager'),
      handleModelSelection: delegate('runtime', 'handleModelSelection'),
      handleRouterModelSelection: delegate('runtime', 'handleRouterModelSelection'),
      handleChatModeSelection: delegate('runtime', 'handleChatModeSelection'),
      loadModelSelector: delegate('runtime', 'loadModelSelector'),
      loadRouterModelSelector: delegate('runtime', 'loadRouterModelSelector'),
      refreshRagSources: delegate('rag', 'refreshRagSources'),
      handleIndexProject: delegate('rag', 'handleIndexProject'),
      handleClearRagSources: delegate('rag', 'handleClearRagSources'),
      handleCreateRagBucket: delegate('rag', 'handleCreateRagBucket'),
      handleDeleteRagBucket: delegate('rag', 'handleDeleteRagBucket'),
      handleSelectRagBucket: delegate('rag', 'handleSelectRagBucket'),
      showPromptGuideModal: delegate('gitActions', 'showPromptGuideModal'),
      showGitHelpModal: delegate('gitActions', 'showGitHelpModal'),
      hideGitHelpModal: delegate('gitActions', 'hideGitHelpModal'),
      hidePromptGuideModal: delegate('gitActions', 'hidePromptGuideModal'),
      executeGitAction: delegate('gitActions', 'executeGitAction'),
      openSelectedEditorFile: delegate('editor', 'openSelectedEditorFile'),
      saveEditorFile: delegate('editor', 'saveEditorFile'),
      handleEditorRun: delegate('editor', 'handleEditorRun'),
      handleEditorChatSend: delegate('editor', 'handleEditorChatSend'),
      updateEditorHeader: delegate('editor', 'updateEditorHeader'),
      handleRagSourceClick: delegate('rag', 'handleRagSourceClick'),
      handleContextMenu: delegate('shell', 'handleContextMenu'),
      updateProjectRootButton: delegate('project', 'updateProjectRootButton'),
      toTitleCaseDiffMode: (mode) => callFeatureOr('runtime', 'toTitleCaseDiffMode', 'Raw', mode),
      handleInferenceBackendCycle: delegate('runtime', 'handleInferenceBackendCycle'),
      handleRouterToggle: delegate('runtime', 'handleRouterToggle'),
      handleRouterGpuToggle: delegate('runtime', 'handleRouterGpuToggle'),
      handleRagToggle: delegate('runtime', 'handleRagToggle'),
      handleRouterDebugToggle,
      handleThinkingToggle,
      handleAutoScrollToggle,
      handleRagDebugToggle: delegate('runtime', 'handleRagDebugToggle'),
      handleDeterministicToggle: delegate('runtime', 'handleDeterministicToggle'),
      handleCliAgentToggle: delegate('runtime', 'handleCliAgentToggle'),
      handleCliAgentPolicyCycle: delegate('runtime', 'handleCliAgentPolicyCycle'),
      handleCliAgentStepBudgetCycle: delegate('runtime', 'handleCliAgentStepBudgetCycle'),
      handleTestModeToggle: delegate('runtime', 'handleTestModeToggle'),
      handleRlmToggle: (...args) => callFeature('rlm', 'handleRlmToggle', ...args),
      handleRlmSharedAttachmentsToggle: (...args) => callFeature('rlm', 'handleRlmSharedAttachmentsToggle', ...args),
      handleRlmProfileCycle: (...args) => callFeature('rlm', 'handleRlmProfileCycle', ...args),
      handleRlmAdvancedBudgetsToggle: (...args) => callFeature('rlm', 'handleRlmAdvancedBudgetsToggle', ...args),
      handleRlmBudgetEdit: (...args) => callFeature('rlm', 'handleRlmBudgetEdit', ...args),
      handleDiffLegendToggle: delegate('runtime', 'handleDiffLegendToggle'),
      handleDiffDisplayModeCycle: delegate('runtime', 'handleDiffDisplayModeCycle'),
      refreshRagBuckets: delegate('rag', 'refreshRagBuckets')
    };
  }

  const addMessage = (role, content) => callFeature('chat', 'addMessage', role, content);
  const addSystemMessage = (content) => callFeature('chat', 'addSystemMessage', content);
  const updateStatus = (type, text) => callFeature('shell', 'updateStatus', type, text);
  const updateProjectRootButton = () => callFeature('project', 'updateProjectRootButton');
  const loadUiPreferences = () => callFeature('ui', 'loadUiPreferences');
  const saveUiPreferences = () => callFeature('ui', 'saveUiPreferences');
  const applyThinkingToggleUi = () => callFeature('chat', 'applyThinkingToggleUi');
  const applyAutoScrollToggleUi = () => callFeature('chat', 'applyAutoScrollToggleUi');
  const applyRouterDebugToggleUi = () => callFeature('ui', 'applyRouterDebugToggleUi');
  const applyRagCollapseUi = () => callFeature('ui', 'applyRagCollapseUi');
  const applyGitCollapseUi = () => callFeature('ui', 'applyGitCollapseUi');
  const applyContextRailUi = () => callFeature('ui', 'applyContextRailUi');
  const updateStreamingUi = () => callFeature('chat', 'updateStreamingUi');
  const refreshRagBuckets = () => callFeature('rag', 'refreshRagBuckets');
  const refreshRagSources = () => callFeature('rag', 'refreshRagSources');
  const refreshGitStatus = () => callFeature('git', 'refreshGitStatus');
  const loadModelSelector = () => callFeature('runtime', 'loadModelSelector');
  const loadRouterModelSelector = () => callFeature('runtime', 'loadRouterModelSelector');
  const loadInferenceBackend = () => callFeature('runtime', 'loadInferenceBackend');
  const loadFooterCopyright = () => callFeature('runtime', 'loadFooterCopyright');
  const loadRuntimeConfig = () => callFeature('runtime', 'loadRuntimeConfig');
  const applyGlobalThemeFromSettings = () => callFeature('runtime', 'applyGlobalThemeFromSettings');
  const addPromptRecallEntry = (text) => callFeature('runtime', 'addPromptRecallEntry', text);
  const promptText = (message, defaultValue = '') => callFeature('shell', 'promptText', message, defaultValue);
  const handleConversationChanged = () => sessionsModule?.handleConversationChanged?.();
  const restoreLastSessionOnStartup = () => sessionsModule?.restoreLastSessionOnStartup?.() || false;
  const handleSessionSave = async () => sessionsModule?.handleSessionSave?.();
  const handleSessionNew = async () => sessionsModule?.handleSessionNew?.();
  const handleSessionLoad = async () => sessionsModule?.handleSessionLoad?.();
  const handleSessionDelete = async () => sessionsModule?.handleSessionDelete?.();

  window.CodingTerminal = {
    initialize,
    addMessage,
    addSystemMessage,
    refreshRagSources,
    refreshGitStatus,
    state
  };

})();
