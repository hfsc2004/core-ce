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
    performance: { now: () => Date.now() },
    document: {
      createElement: () => ({ className: '', textContent: '', parentElement: null })
    },
    fetch: fetchImpl || (async () => {
      throw new Error('provider fetch should not be called for handled RLM turn');
    })
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(sourcePath, 'utf8'), context, { filename: sourcePath });
  return context.window.TerminalChatFlow.createChatFlowController;
}

async function testRecursiveRlmRunsBeforeLlamaCppProvider() {
  const createChatFlowController = loadChatFlowController();
  const userInput = { value: 'Use the RLM environment to outline a story about ants' };
  const assistantMessages = [];
  const systemMessages = [];
  let runRlmLoopCalled = false;
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
    getAttachmentSessionId: () => 'terminal-52454-window-7',
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
    getRlmProvider: () => 'engine',
    runRlmTurn: async (payload = {}) => {
      throw new Error(`legacy RLM turn should not run: ${JSON.stringify(payload)}`);
    },
    runRlmLoop: async (payload = {}) => {
      runRlmLoopCalled = true;
      assert.strictEqual(payload.prompt, 'Use the RLM environment to outline a story about ants');
      assert.strictEqual(payload.backend, 'llama.cpp');
      assert.strictEqual(payload.mode, 'recursive-repl');
      return {
        success: true,
        handled: true,
        final: 'Ant story outline',
        iterations: 3,
        observations: [
          { action: { type: 'inspect_environment_metadata' }, success: true },
          { action: { type: 'slice_prompt' }, success: true },
          { action: { type: 'set_final' }, success: true, finalSet: true }
        ]
      };
    },
    getRlmVerboseTrace: () => false,
    getRlmQuality: () => 'balanced',
    getRlmBudgets: () => ({ maxToolCalls: 40, maxRuntimeMs: 45000 }),
    getRlmIncludeSharedAttachments: () => false,
    setThinkingStatusText: () => {}
  });

  await controller.sendMessage();

  assert.strictEqual(runRlmLoopCalled, true);
  assert.deepStrictEqual(assistantMessages, ['Ant story outline']);
  assert.strictEqual(pairAppended, true);
  assert.strictEqual(userInput.value, '');
  assert.ok(systemMessages.some((message) => message.includes('RLM Trace: actions=inspect_environment_metadata -> slice_prompt -> set_final')));
  assert.ok(systemMessages.some((message) => message.includes('RLM Engine: mode=recursive-repl')));
}

function createLlamaCppControllerForSse(sse, hooks = {}) {
  const defaultFetch = async (_url, request = {}) => {
    if (typeof hooks.onFetch === 'function') hooks.onFetch(request);
    return {
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
    };
  };
  const createChatFlowController = loadChatFlowController(hooks.fetch || defaultFetch);
  const userInput = { value: hooks.userMessage || 'tell me a story about ants' };
  const messageDiv = {
    children: [],
    querySelector(selector) {
      return this.children.find((child) => child.className === selector.replace('.', '')) || null;
    },
    insertBefore(child, before) {
      const idx = this.children.indexOf(before);
      if (idx >= 0) this.children.splice(idx, 0, child);
      else this.children.push(child);
      child.parentElement = this;
    }
  };
  const assistantShell = { textContent: '', parentElement: messageDiv };
  messageDiv.children.push(assistantShell);
  let activeStream = null;

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
    getConversationHistory: () => hooks.conversationHistory || [],
    appendConversationPair: hooks.appendConversationPair || (() => {}),
    getCurrentModel: () => hooks.modelName || 'Qwen3.8-4B-Q8_0.gguf',
    buildOllamaOptions: () => hooks.ollamaOptions || ({ num_ctx: 4096, num_gpu: 34 }),
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
    getAttachmentSessionId: () => hooks.attachmentSessionId || 'terminal-52454-window-7',
    getTerminalPort: () => 52454,
    getElectronAPI: () => ({
      ensureTerminalLlamaCppSession: async () => ({
        success: true,
        reused: true,
        port: 52454,
        baseUrl: 'http://127.0.0.1:52454'
      }),
      ...(hooks.electronApi || {})
    }),
    sanitizeQwenSelfDialogue: (value) => String(value || ''),
    addErrorMessage: hooks.addErrorMessage || ((message) => {
      throw new Error(message);
    }),
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
    setThinkingStatusText: hooks.setThinkingStatusText || (() => {})
  });

  return { controller, userInput, assistantShell, getActiveStream: () => activeStream };
}

async function testLlamaCppThinkingAndAnswerStaySeparate() {
  const sse = [
    'data: {"choices":[{"delta":{"reasoning_content":"internal thought "}}]}',
    'data: {"choices":[{"delta":{"content":"Once upon a time, "}}]}',
    'data: {"choices":[{"delta":{"thinking":"more internal thought "}}]}',
    'data: {"choices":[{"delta":{"content":"a colony learned to share."}}]}',
    'data: [DONE]',
    ''
  ].join('\n');
  let finalAssistant = '';
  let pairAppended = false;

  const { controller, assistantShell, getActiveStream } = createLlamaCppControllerForSse(sse, {
    appendConversationPair: (_user, assistant) => {
      pairAppended = true;
      finalAssistant = String(assistant || '');
    },
  });

  await controller.sendMessage();

  assert.strictEqual(pairAppended, true);
  assert.strictEqual(finalAssistant, 'Once upon a time, a colony learned to share.');
  assert.strictEqual(assistantShell.textContent, finalAssistant);
  const thinkingDiv = assistantShell.parentElement.querySelector('.message-thinking');
  assert.ok(thinkingDiv);
  assert.strictEqual(thinkingDiv.textContent, 'internal thought more internal thought');
  assert.strictEqual(getActiveStream(), null);
}

async function testLlamaCppThinkingOnlyStreamIsNotAnswer() {
  const sse = [
    'data: {"choices":[{"delta":{"reasoning_content":"internal thought only "}}]}',
    'data: {"choices":[{"delta":{"thinking":"still no final answer"}}]}',
    'data: [DONE]',
    ''
  ].join('\n');
  let errorMessage = '';
  let pairAppended = false;
  const { controller, assistantShell } = createLlamaCppControllerForSse(sse, {
    appendConversationPair: () => { pairAppended = true; },
    addErrorMessage: (message) => { errorMessage = String(message || ''); }
  });

  await controller.sendMessage();

  assert.strictEqual(pairAppended, false);
  assert.strictEqual(assistantShell.textContent, '');
  assert.ok(errorMessage.includes('reasoning/thinking tokens but no final assistant answer'));
}

async function testLlamaCppDropsOldHistoryWhenContextIsTight() {
  const sse = [
    'data: {"choices":[{"delta":{"content":"ok"}}]}',
    'data: [DONE]',
    ''
  ].join('\n');
  let requestBody = null;
  const oldContent = 'old '.repeat(4000);
  const { controller } = createLlamaCppControllerForSse(sse, {
    userMessage: 'Please answer the current request.',
    ollamaOptions: { num_ctx: 2048, num_gpu: 34 },
    conversationHistory: [
      { role: 'user', content: oldContent },
      { role: 'assistant', content: oldContent },
      { role: 'user', content: 'recent question' },
      { role: 'assistant', content: 'recent answer' }
    ],
    onFetch: (request) => { requestBody = JSON.parse(String(request?.body || '{}')); },
    appendConversationPair: () => {}
  });

  await controller.sendMessage();

  assert.ok(requestBody);
  const joined = requestBody.messages.map((row) => String(row.content || '')).join('\n');
  assert.ok(joined.includes('Please answer the current request.'));
  assert.ok(!joined.includes(oldContent.trim()));
}

async function testLlamaCppRejectsOversizedCurrentPrompt() {
  const sse = [
    'data: {"choices":[{"delta":{"content":"should not fetch"}}]}',
    'data: [DONE]',
    ''
  ].join('\n');
  let fetchCalled = false;
  let errorMessage = '';
  const { controller } = createLlamaCppControllerForSse(sse, {
    userMessage: 'huge '.repeat(3000),
    ollamaOptions: { num_ctx: 2048, num_gpu: 34 },
    fetch: async () => {
      fetchCalled = true;
      throw new Error('fetch should not be called for oversized current prompt');
    },
    addErrorMessage: (message) => { errorMessage = String(message || ''); }
  });

  await controller.sendMessage();

  assert.strictEqual(fetchCalled, false);
  assert.ok(errorMessage.includes('estimated at'));
  assert.ok(errorMessage.includes('Reduce the current message'));
}

async function testOrdinaryChatSkipsAttachmentContext() {
  const sse = [
    'data: {"choices":[{"delta":{"content":"hello"}}]}',
    'data: [DONE]',
    ''
  ].join('\n');
  let attachmentContextCalled = false;
  const createChatFlowController = loadChatFlowController(async () => ({
    ok: true,
    status: 200,
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
  const userInput = { value: 'Tell me a story about ants' };
  let activeStream = null;
  const shell = { textContent: '', parentElement: { querySelector: () => null, insertBefore() {} } };
  const subject = createChatFlowController({
    getUserInput: () => userInput,
    addInputRecallEntry: () => {},
    handleCommand: async () => {},
    getActiveStream: () => activeStream,
    setWaitingState: () => {},
    addSystemMessage: () => {},
    addMessage: () => {},
    getSystemPrompt: () => '',
    buildAttachmentContext: async () => {
      attachmentContextCalled = true;
      return '';
    },
    shouldInjectAttachmentContext: () => false,
    getConversationHistory: () => [],
    appendConversationPair: () => {},
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
    addAssistantShell: () => shell,
    setActiveStream: (value) => { activeStream = value; },
    getChatDisplay: () => ({ scrollTop: 0, scrollHeight: 0 }),
    finalizeStreamingMessage: () => {},
    getAttachmentSessionId: () => 'terminal-52454-window-7',
    getTerminalPort: () => 52454,
    getElectronAPI: () => ({
      ensureTerminalLlamaCppSession: async () => ({ success: true, reused: true, port: 52454 })
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
    runRlmTurn: async () => ({ handled: false }),
    getRlmVerboseTrace: () => false,
    getRlmQuality: () => 'balanced',
    getRlmBudgets: () => ({}),
    getRlmIncludeSharedAttachments: () => false,
    setThinkingStatusText: () => {}
  });

  await subject.sendMessage();

  assert.strictEqual(attachmentContextCalled, false);
}

async function testLlamaCppSkipsStaleImagesForOrdinaryGreeting() {
  const sse = [
    'data: {"choices":[{"delta":{"content":"Hello!"}}]}',
    'data: [DONE]',
    ''
  ].join('\n');
  let requestBody = null;
  let listCalled = false;
  const { controller } = createLlamaCppControllerForSse(sse, {
    userMessage: 'Hello!',
    onFetch: (request) => { requestBody = JSON.parse(String(request?.body || '{}')); },
    electronApi: {
      terminalAttachmentsList: async () => {
        listCalled = true;
        return {
          success: true,
          attachments: [
            { id: 'old-image', displayName: 'eiffel.jpg', mimeType: 'image/jpeg', sizeBytes: 1234 }
          ]
        };
      },
      terminalAttachmentsReadBytes: async () => ({
        success: true,
        bytesBase64: 'stale-image'
      })
    }
  });

  await controller.sendMessage();

  assert.strictEqual(listCalled, false);
  assert.ok(requestBody);
  const last = requestBody.messages[requestBody.messages.length - 1];
  assert.strictEqual(last.content, 'Hello!');
}

async function testLlamaCppUsesCurrentSessionImageForVisionIntent() {
  const sse = [
    'data: {"choices":[{"delta":{"content":"That is the Eiffel Tower."}}]}',
    'data: [DONE]',
    ''
  ].join('\n');
  let requestBody = null;
  let listTarget = null;
  let readTarget = null;
  const { controller } = createLlamaCppControllerForSse(sse, {
    userMessage: 'What is this?',
    modelName: 'gemma-3-4b-it-mm.gguf',
    attachmentSessionId: 'terminal-52454-window-9',
    onFetch: (request) => { requestBody = JSON.parse(String(request?.body || '{}')); },
    electronApi: {
      terminalAttachmentsList: async (target) => {
        listTarget = target;
        return {
          success: true,
          attachments: [
            { id: 'current-image', displayName: 'tower.jpg', mimeType: 'image/jpeg', sizeBytes: 1234 }
          ]
        };
      },
      terminalAttachmentsReadBytes: async (target) => {
        readTarget = target;
        return { success: true, bytesBase64: 'current-image-base64' };
      }
    }
  });

  await controller.sendMessage();

  assert.strictEqual(listTarget.sessionId, 'terminal-52454-window-9');
  assert.strictEqual(readTarget.sessionId, 'terminal-52454-window-9');
  assert.strictEqual(readTarget.attachmentId, 'current-image');
  assert.strictEqual(readTarget.maxBytes, 8 * 1024 * 1024);
  const last = requestBody.messages[requestBody.messages.length - 1];
  assert.ok(Array.isArray(last.content));
  assert.deepStrictEqual(last.content[0], { type: 'text', text: 'What is this?' });
  assert.strictEqual(last.content[1].type, 'image_url');
  assert.strictEqual(last.content[1].image_url.url, 'data:image/jpeg;base64,current-image-base64');
}

async function run() {
  await testRecursiveRlmRunsBeforeLlamaCppProvider();
  await testLlamaCppThinkingAndAnswerStaySeparate();
  await testLlamaCppThinkingOnlyStreamIsNotAnswer();
  await testLlamaCppDropsOldHistoryWhenContextIsTight();
  await testLlamaCppRejectsOversizedCurrentPrompt();
  await testOrdinaryChatSkipsAttachmentContext();
  await testLlamaCppSkipsStaleImagesForOrdinaryGreeting();
  await testLlamaCppUsesCurrentSessionImageForVisionIntent();
  console.log('terminal-renderer-chatflow regression tests passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
