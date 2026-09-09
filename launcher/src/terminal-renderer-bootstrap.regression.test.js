const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadBootstrapController(extraContext = {}) {
  const sourcePath = path.join(__dirname, 'terminal-renderer-bootstrap.js');
  let capturedChatFlowDeps = null;
  const context = {
    window: {
      TerminalChatFlow: {
        createChatFlowController: (deps = {}) => {
          capturedChatFlowDeps = deps;
          return { sendMessage: async () => {} };
        }
      }
    },
    console,
    ...extraContext
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(sourcePath, 'utf8'), context, { filename: sourcePath });
  return {
    createBootstrapController: context.window.TerminalBootstrap.createBootstrapController,
    getCapturedChatFlowDeps: () => capturedChatFlowDeps
  };
}

function testBootstrapPassesRecursiveRlmDepsToChatflow() {
  const { createBootstrapController, getCapturedChatFlowDeps } = loadBootstrapController();
  const runRlmStartSession = async () => ({ success: true, sessionId: 'rlm-test' });
  const runRlmLoop = async () => ({ handled: true });
  const getRlmProfile = () => 'balanced';
  const ctx = {
    chatDisplay: {},
    userInput: { focus() {} },
    sendBtn: {},
    stopBtn: {},
    attachmentsBtn: {},
    statusText: {},
    gpuIcon: {},
    gpuText: {},
    attachmentSessionId: 'terminal-52454',
    getConfig: () => ({}),
    getCurrentModel: () => 'model.gguf',
    setCurrentModel: () => {},
    getTerminalPort: () => 52454,
    setTerminalPort: () => {},
    getProvider: () => 'llama.cpp',
    setProvider: () => {},
    getProviderBaseUrl: () => '',
    setProviderBaseUrl: () => {},
    getProviderApiKey: () => '',
    setProviderApiKey: () => {},
    getProviderModelId: () => '',
    setProviderModelId: () => {},
    getLlamaCppModelPath: () => '/tmp/model.gguf',
    setLlamaCppModelPath: () => {},
    getLlamaCppForceCpu: () => false,
    setLlamaCppForceCpu: () => {},
    getSystemPrompt: () => '',
    setSystemPrompt: () => {},
    getRlmAssisted: () => true,
    setRlmAssisted: () => {},
    getRlmVerboseTrace: () => false,
    setRlmVerboseTrace: () => {},
    getRlmQuality: () => 'balanced',
    setRlmQuality: () => {},
    getRlmProfile,
    setRlmProfile: () => {},
    getRlmProvider: () => 'engine',
    setRlmProvider: () => {},
    getRlmAdvancedBudgets: () => false,
    setRlmAdvancedBudgets: () => {},
    getRlmIncludeSharedAttachments: () => false,
    setRlmIncludeSharedAttachments: () => {},
    getRlmBudgets: () => ({}),
    setRlmBudgets: () => {},
    getLlmAssistedFileNaming: () => true,
    setLlmAssistedFileNaming: () => {},
    getTemperature: () => 0.7,
    setTemperature: () => {},
    getTopP: () => 0.9,
    setTopP: () => {},
    getTopK: () => 40,
    setTopK: () => {},
    getNumCtx: () => 4096,
    setNumCtx: () => {},
    getNumGpu: () => 0,
    setNumGpu: () => {},
    getNumPredict: () => null,
    setNumPredict: () => {},
    getRepeatPenalty: () => 1.1,
    setRepeatPenalty: () => {},
    getSeed: () => null,
    setSeed: () => {},
    getStopSequences: () => null,
    setStopSequences: () => {},
    persistTerminalModelConfig: () => {},
    getConversationHistory: () => [],
    setConversationHistory: () => {},
    addMessage: () => {},
    addSystemMessage: () => {},
    addSystemImagePreview: () => {},
    addErrorMessage: () => {},
    escapeHtml: (value) => String(value || ''),
    formatBytes: (value) => String(value || ''),
    saveConversation: async () => {},
    loadConversation: async () => {},
    listSavedConversations: async () => [],
    deleteSavedConversation: async () => {},
    recordSessionMemory: async () => {},
    clearConversation: () => {},
    handleStopClick: () => {},
    attachFile: async () => {},
    listAttachments: async () => [],
    detachAttachment: async () => {},
    clearAttachments: async () => {},
    getActiveStream: () => null,
    setActiveStream: () => {},
    sanitizeQwenSelfDialogue: (value) => String(value || ''),
    finalizeStreamingMessage: () => {},
    setWaitingState: () => {},
    appendConversationPair: () => {},
    speakAssistantText: () => {},
    getSpeechEngine: () => null,
    getSpeechChunkProfile: () => ({}),
    addInputRecallEntry: () => {},
    handleCommand: async () => {},
    buildAttachmentContext: async () => '',
    shouldInjectAttachmentContext: () => false,
    buildOllamaOptions: () => ({}),
    addAssistantShell: () => null,
    setStreamStopRequested: () => {},
    getStreamStopRequested: () => false,
    getRlmController: () => null,
    runRlmStartSession,
    runRlmTurn: async () => ({ handled: false }),
    runRlmLoop,
    setThinkingStatusText: () => {}
  };

  createBootstrapController().buildControllers(ctx);
  const deps = getCapturedChatFlowDeps();
  assert.ok(deps);
  assert.strictEqual(deps.runRlmStartSession, runRlmStartSession);
  assert.strictEqual(deps.runRlmLoop, runRlmLoop);
  assert.strictEqual(deps.getRlmProfile, getRlmProfile);
}

function testBootstrapWiresAttachPlusButton() {
  let clickHandler = null;
  let attachClicks = 0;
  const systemMessages = [];
  const { createBootstrapController } = loadBootstrapController({
    document: {
      getElementById: () => null,
      addEventListener: () => {}
    },
    setTimeout: () => 0,
    setInterval: () => 0
  });
  const ctx = {
    configureMarkdown: () => {},
    installDragAndDropAttach: () => {},
    updateGPUIndicator: () => {},
    populateModelDropdown: () => {},
    config: { port: 52454, gpuType: 'cuda' },
    sendBtn: { addEventListener: () => {} },
    stopBtn: { addEventListener: () => {}, disabled: false, style: {} },
    attachPlusBtn: {
      addEventListener: (eventName, handler) => {
        if (eventName === 'click') clickHandler = handler;
      }
    },
    attachmentsBtn: null,
    userInput: { addEventListener: () => {}, focus: () => {} },
    chatDisplay: { style: {} },
    contextMenuController: null,
    streamController: null,
    handleSendClick: () => {},
    handleStopClick: () => {},
    handleAttachPlusClick: () => { attachClicks += 1; },
    handleInputKeypress: () => {},
    handleInputPaste: () => {},
    getProvider: () => 'llama.cpp',
    getCurrentModel: () => 'model.gguf',
    getTerminalPort: () => 52454,
    getProviderBaseUrl: () => '',
    getLlamaCppModelPath: () => '',
    addSystemMessage: (message) => systemMessages.push(String(message || '')),
    getRlmAssisted: () => true,
    getRlmProvider: () => 'engine',
    getRlmProfile: () => 'balanced',
    getRlmVerboseTrace: () => false,
    getSystemPrompt: () => '',
    loadSessionMemoryPreferences: async () => {},
    loadInputRecallHistory: async () => {},
    verifyGPUUsage: async () => {}
  };
  createBootstrapController().runPostInit(ctx);
  assert.strictEqual(typeof clickHandler, 'function');
  assert.ok(systemMessages.some((message) => message === 'RLM status: ON provider=engine profile=balanced verbose=OFF'));
  clickHandler();
  assert.strictEqual(attachClicks, 1);
}

testBootstrapPassesRecursiveRlmDepsToChatflow();
testBootstrapWiresAttachPlusButton();
console.log('terminal-renderer-bootstrap regression tests passed');
