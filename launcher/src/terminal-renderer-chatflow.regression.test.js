const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadChatFlowController() {
  const sourcePath = path.join(__dirname, 'terminal-renderer-chatflow.js');
  const context = {
    window: {},
    console,
    setTimeout,
    clearTimeout,
    fetch: async () => {
      throw new Error('provider fetch should not be called for handled RLM turn');
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(sourcePath, 'utf8'), context, { filename: sourcePath });
  return context.window.TerminalChatFlow.createChatFlowController;
}

async function testRlmRunsBeforeLlamaCppProvider() {
  const createChatFlowController = loadChatFlowController();
  const userInput = { value: 'summarize the attached file' };
  const assistantMessages = [];
  const systemMessages = [];
  let runRlmCalled = false;
  let pairAppended = false;

  const controller = createChatFlowController({
    getUserInput: () => userInput,
    addInputRecallEntry: () => {},
    handleCommand: async () => {},
    getActiveStream: () => null,
    setWaitingState: () => {},
    addSystemMessage: (message) => systemMessages.push(String(message || '')),
    addMessage: (role, message) => {
      if (role === 'assistant') assistantMessages.push(String(message || ''));
    },
    getSystemPrompt: () => '',
    buildAttachmentContext: async () => '',
    shouldInjectAttachmentContext: () => false,
    getConversationHistory: () => [],
    appendConversationPair: () => { pairAppended = true; },
    getCurrentModel: () => 'Qwen3.8-4B-Q8_0.gguf',
    buildOllamaOptions: () => ({ num_ctx: 4096, num_gpu: 34 }),
    getProvider: () => 'llama.cpp',
    getProviderBaseUrl: () => '',
    getProviderApiKey: () => '',
    getProviderModelId: () => '',
    getLlamaCppModelPath: () => '/tmp/Qwen3.8-4B-Q8_0.gguf',
    getLlamaCppForceCpu: () => false,
    setTerminalPort: () => {},
    setProviderBaseUrl: () => {},
    addAssistantShell: () => {
      throw new Error('provider stream shell should not be created for handled RLM turn');
    },
    setActiveStream: () => {},
    finalizeStreamingMessage: () => {},
    getTerminalPort: () => 52454,
    getElectronAPI: () => ({
      ensureTerminalLlamaCppSession: async () => {
        throw new Error('llama.cpp provider startup should not run before handled RLM turn');
      }
    }),
    sanitizeQwenSelfDialogue: (value) => String(value || ''),
    addErrorMessage: (message) => {
      throw new Error(message);
    },
    focusInput: () => {},
    setStreamStopRequested: () => {},
    getStreamStopRequested: () => false,
    getRlmAssisted: () => true,
    getRlmController: () => null,
    getRlmProvider: () => 'legacy',
    runRlmTurn: async (payload = {}) => {
      runRlmCalled = true;
      assert.strictEqual(payload.message, 'summarize the attached file');
      assert.strictEqual(payload.options.backendProvider, 'llama.cpp');
      return {
        success: true,
        handled: true,
        answer: 'Summary of attached file',
        executedTools: ['chunk_text', 'accumulate_summaries'],
        plan: { mode: 'engine' },
        toolResult: {
          output: {
            coverage: { processedRatio: 1, processedChunks: 1, totalChunks: 1 }
          }
        }
      };
    },
    getRlmVerboseTrace: () => false,
    getRlmQuality: () => 'balanced',
    getRlmBudgets: () => ({ maxToolCalls: 40, maxRuntimeMs: 45000 }),
    getRlmIncludeSharedAttachments: () => false,
    setThinkingStatusText: () => {}
  });

  await controller.sendMessage();

  assert.strictEqual(runRlmCalled, true);
  assert.deepStrictEqual(assistantMessages, ['Summary of attached file']);
  assert.strictEqual(pairAppended, true);
  assert.strictEqual(userInput.value, '');
  assert.ok(systemMessages.some((message) => message.includes('RLM Trace:')));
  assert.ok(systemMessages.some((message) => message.includes('RLM Engine:')));
}

async function run() {
  await testRlmRunsBeforeLlamaCppProvider();
  console.log('terminal-renderer-chatflow regression tests passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
