const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadBootstrapController() {
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
    console
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
    runRlmTurn: async () => ({ handled: false }),
    runRlmLoop,
    setThinkingStatusText: () => {}
  };

  createBootstrapController().buildControllers(ctx);
  const deps = getCapturedChatFlowDeps();
  assert.ok(deps);
  assert.strictEqual(deps.runRlmLoop, runRlmLoop);
  assert.strictEqual(deps.getRlmProfile, getRlmProfile);
}

testBootstrapPassesRecursiveRlmDepsToChatflow();
console.log('terminal-renderer-bootstrap regression tests passed');
