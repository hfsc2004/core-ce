const assert = require('assert');
const { createRlmEngine } = require('./rlm-engine');
const dtools = require('../deterministic-tools');

function createFakeAttachmentStore() {
  const attachments = {
    'terminal-52454': [
      {
        id: 'file_alpha_001',
        displayName: 'alpha-notes.md',
        textExtractable: true,
        sizeBytes: 512
      }
    ],
    'terminal-shared': [
      {
        id: 'file_shared_001',
        displayName: 'shared-notes.md',
        textExtractable: true,
        sizeBytes: 256
      }
    ]
  };
  const texts = {
    'terminal-52454:file_alpha_001': [
      '# Alpha Notes',
      'The deterministic tool broker should validate every action before execution.',
      'The sandbox must restrict writes to the workspace and block risky commands.',
      'Audit logs should record tool name, status, input scope, and summarized output.',
      'Required term: sandbox.'
    ].join('\n'),
    'terminal-shared:file_shared_001': [
      '# Shared Notes',
      'Shared attachments can be included when the caller opts into shared context.'
    ].join('\n')
  };

  return {
    async listAttachments(sessionId) {
      return (attachments[String(sessionId || '')] || []).map((item) => ({ ...item }));
    },
    async readAttachmentText(options = {}) {
      const key = `${String(options.sessionId || '')}:${String(options.attachmentId || '')}`;
      const text = texts[key] || '';
      return {
        success: true,
        text,
        textLength: text.length
      };
    }
  };
}

function createEngine(overrides = {}) {
  const runtime = dtools.createDefaultRuntime();
  return createRlmEngine({
    attachmentStore: createFakeAttachmentStore(),
    executeDeterministicTool: (toolName, args = {}, context = {}, options = {}) =>
      runtime.executeTool({
        toolName,
        args,
        context,
        timeoutMs: options.timeoutMs
      }),
    ...overrides
  });
}

async function testNoAttachmentsHandled() {
  const engine = createEngine();
  const result = await engine.runTurn({
    message: 'summarize my attachment',
    options: {
      sessionId: 'terminal-empty'
    }
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.handled, true);
  assert.ok(String(result.answer || '').includes('No text-extractable attachments'));
}

async function testDeterministicAttachmentSummary() {
  const engine = createEngine();
  const result = await engine.runTurn({
    message: 'Summarize alpha-notes.md and preserve terms: sandbox',
    options: {
      sessionId: 'terminal-52454',
      engineMode: 'deterministic',
      quality: 'balanced',
      budgets: {
        maxToolCalls: 12,
        maxRuntimeMs: 30000
      }
    }
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.handled, true);
  assert.ok(String(result.answer || '').includes('Summary of alpha-notes.md'));
  assert.ok(String(result.answer || '').toLowerCase().includes('sandbox'));
  assert.ok(Array.isArray(result.executedTools));
  assert.ok(result.executedTools.includes('chunk_text'));
  assert.ok(result.executedTools.includes('accumulate_summaries'));
  assert.ok(result.toolResult?.output?.coverage);
}

async function testSharedAttachmentOptIn() {
  const engine = createEngine();
  const result = await engine.runTurn({
    message: 'Summarize shared-notes.md',
    options: {
      sessionId: 'terminal-52454',
      includeSharedAttachments: true,
      sharedAttachmentSessionId: 'terminal-shared',
      engineMode: 'deterministic'
    }
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.handled, true);
  assert.ok(String(result.answer || '').includes('shared-notes.md'));
  assert.ok(String(result.answer || '').toLowerCase().includes('shared attachments'));
}

async function testCodeGenerateUsesModelTransport() {
  let sendCalled = false;
  const engine = createEngine({
    sendMessage: async (_modelName, messages) => {
      sendCalled = true;
      assert.ok(Array.isArray(messages));
      assert.strictEqual(messages[0].role, 'system');
      return {
        response: {
          message: {
            content: 'print("hello from rlm")'
          }
        }
      };
    }
  });

  const result = await engine.runTurn({
    message: 'write a python script',
    options: {
      sessionId: 'terminal-52454',
      modelName: 'local-test-model',
      port: 52454
    }
  });

  assert.strictEqual(sendCalled, true);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.handled, true);
  assert.ok(String(result.answer || '').includes('```python'));
  assert.ok(String(result.answer || '').includes('print("hello from rlm")'));
}

async function run() {
  await testNoAttachmentsHandled();
  await testDeterministicAttachmentSummary();
  await testSharedAttachmentOptIn();
  await testCodeGenerateUsesModelTransport();
  console.log('rlm-engine regression tests passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
