const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadChatFlowController(fetchImpl) {
  const sourcePath = path.join(__dirname, 'terminal-renderer-chatflow.js');
  const context = {
    window: {},
    console,
    setTimeout,
    clearTimeout,
    AbortController,
    TextDecoder,
    fetch: fetchImpl || (async () => {
      throw new Error('provider fetch should not be called for handled RLM turn');
    })
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

async function testLlamaCppReasoningOnlyStreamIsNotEmpty() {
  const sse = [
    'data: {"choices":[{"delta":{"reasoning_content":"Once upon a time, "}}]}',
    'data: {"choices":[{"delta":{"reasoning":"a colony learned to share."}}]}',
    'data: [DONE]',
    ''
  ].join('\n');
  const createChatFlowController = loadChatFlowController(async () => ({
    ok: true,
    body: {
      getReader: () => {
        let sent = false;
        return {
          async read() {
            if (sent) return { done: true };
            sent = true;
            return { done: false, value: Buffer.from(sse, 'utf8') };
          },
          releaseLock() {}
        };
      }
    }
  }));
  const userInput = { value: 'tell me a story about ants' };
  const assistantShell = { textContent: '' };
  let activeStream = null;
  let finalAssistant = '';
  let pairAppended = false;

  const controller = createChatFlowController({
    getUserInput: () => userInput,
    addInputRecallEntry: () => {},
    handleCommand: async () => {},
    getActiveStream: () => activeStream,
    setWaitingState: () => {},
    addSystemMessage: () => {},
    addMessage: () => {},
    getSystemPrompt: () => '',
    buildAttachmentContext: async () => '',
    shouldInjectAttachmentContext: () => false,
    getConversationHistory: () => [],
    appendConversationPair: (_user, assistant) => {
      pairAppended = true;
      finalAssistant = String(assistant || '');
    },
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
    addAssistantShell: () => assistantShell,
    setActiveStream: (value) => { activeStream = value; },
    getChatDisplay: () => ({ scrollTop: 0, scrollHeight: 0 }),
    finalizeStreamingMessage: (contentDiv, message) => { contentDiv.textContent = message; },
    getTerminalPort: () => 52454,
    getElectronAPI: () => ({
      ensureTerminalLlamaCppSession: async () => ({
        success: true,
        reused: true,
        port: 52454,
        baseUrl: 'http://127.0.0.1:52454'
      })
    }),
    sanitizeQwenSelfDialogue: (value) => String(value || ''),
    addErrorMessage: (message) => {
      throw new Error(message);
    },
    focusInput: () => {},
    setStreamStopRequested: () => {},
    getStreamStopRequested: () => false,
    getRlmAssisted: () => false,
    getRlmController: () => null,
    getRlmProvider: () => 'legacy',
    runRlmTurn: async () => {
      throw new Error('RLM should not run for ordinary chat');
    },
    getRlmVerboseTrace: () => false,
    getRlmQuality: () => 'balanced',
    getRlmBudgets: () => ({}),
    getRlmIncludeSharedAttachments: () => false,
    setThinkingStatusText: () => {}
  });

  await controller.sendMessage();

  assert.strictEqual(pairAppended, true);
  assert.strictEqual(finalAssistant, 'Once upon a time, a colony learned to share.');
  assert.strictEqual(assistantShell.textContent, finalAssistant);
}

async function run() {
  await testRlmRunsBeforeLlamaCppProvider();
  await testLlamaCppReasoningOnlyStreamIsNotEmpty();
  console.log('terminal-renderer-chatflow regression tests passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
