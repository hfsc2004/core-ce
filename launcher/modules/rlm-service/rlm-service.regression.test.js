const assert = require('assert');
const { createRlmService } = require('./rlm-service');
const { executePythonSnippet } = require('./rlm-python-runner');
const { extractFirstJsonObject } = require('./rlm-root-loop');

function createFakeBmoc() {
  let counter = 0;
  const sessions = new Map();
  const closed = [];
  return {
    closed,
    registerSession(config = {}) {
      counter += 1;
      const id = `${config.type || 'session'}-test-${counter}`;
      sessions.set(id, {
        type: config.type,
        ollamaPort: config.ollamaPort,
        ollamaPID: config.ollamaPID,
        servicePort: config.servicePort || null,
        servicePID: config.servicePID || null,
        metadata: config.metadata || {}
      });
      return id;
    },
    updateSession(sessionId, updates = {}) {
      const current = sessions.get(sessionId);
      if (!current) return false;
      sessions.set(sessionId, { ...current, ...updates });
      return true;
    },
    getSession(sessionId) {
      return sessions.get(sessionId) || null;
    },
    async closeSession(sessionId) {
      closed.push(sessionId);
      sessions.delete(sessionId);
      return true;
    }
  };
}

function createService(options = {}) {
  const bmoc = createFakeBmoc();
  const service = createRlmService({
    registerSession: (config) => bmoc.registerSession(config),
    updateSession: (sessionId, updates) => bmoc.updateSession(sessionId, updates),
    getSession: (sessionId) => bmoc.getSession(sessionId),
    closeSession: (sessionId) => bmoc.closeSession(sessionId),
    attachmentStore: {
      async listAttachments(sessionId) {
        if (sessionId !== 'terminal-1') return [];
        return [{
          id: 'att-1',
          displayName: 'notes.md',
          sizeBytes: 123,
          textExtractable: true,
          mimeType: 'text/markdown'
        }];
      }
    },
    enableSandboxExecution: options.enableSandboxExecution === true,
    sendMessage: options.sendMessage
  });
  return { service, bmoc };
}

async function testStartSessionRegistersWithBmoc() {
  const { service, bmoc } = createService();
  const status = await service.startSession({
    prompt: 'Summarize the attached notes.',
    parentSessionId: 'terminal-1',
    model: 'qwen-thinking',
    backend: 'llama-cpp',
    modelBehavior: 'thinking',
    behaviorSource: 'user',
    profile: 'balanced'
  });

  assert.equal(status.success, true);
  assert.equal(status.sessionId, 'rlm-test-1');
  assert.equal(status.modelBehavior, 'thinking');
  assert.equal(status.budget.maxSubcalls, 16);
  assert.equal(status.environment.attachments.count, 1);

  const bmocSession = bmoc.getSession(status.sessionId);
  assert.equal(bmocSession.type, 'rlm');
  assert.equal(bmocSession.ollamaPort, null);
  assert.equal(bmocSession.ollamaPID, null);
  assert.equal(bmocSession.metadata.service, 'rlm');
  assert.equal(bmocSession.metadata.dryRun, true);
  assert.equal(bmocSession.metadata.budget.maxSubcalls, 16);
  assert.equal(bmocSession.metadata.environmentSchema, 'rlm-environment/v0-dry-run');
}

async function testDryRunDoesNotSendFullPromptToRootModel() {
  const { service } = createService();
  const hiddenTail = 'SECRET_TAIL_SHOULD_STAY_IN_ENVIRONMENT_ONLY';
  const prompt = `${'outline section\n'.repeat(400)}${hiddenTail}`;
  const result = await service.runDryTurn({
    prompt,
    parentSessionId: 'terminal-1',
    modelBehavior: 'non-thinking',
    profile: 'balanced'
  });

  assert.equal(result.success, true);
  assert.equal(result.handled, true);
  assert.equal(result.rootModelInput.environment.prompt.chars, prompt.length);
  assert.equal(result.rootModelInput.environment.prompt.preview.includes(hiddenTail), false);
  assert.equal(JSON.stringify(result.rootModelInput).includes(hiddenTail), false);
  assert.deepEqual(result.rootModelInput.allowedActions, ['inspect_environment_metadata']);
  assert.ok(result.rootModelInput.disabledActions.includes('execute_code'));
  assert.ok(result.rootModelInput.disabledActions.includes('sub_rlm'));
}

async function testBehaviorProfilesSelectDifferentBudgets() {
  const { service } = createService();
  const thinking = await service.startSession({ prompt: 'x', modelBehavior: 'thinking', profile: 'balanced' });
  const nonThinking = await service.startSession({ prompt: 'x', modelBehavior: 'non_thinking', profile: 'balanced' });

  assert.equal(thinking.budget.maxRootIterations, 4);
  assert.equal(thinking.budget.maxSubcalls, 16);
  assert.equal(nonThinking.budget.maxRootIterations, 6);
  assert.equal(nonThinking.budget.maxSubcalls, 32);
}

async function testStopSessionClosesBmocSession() {
  const { service, bmoc } = createService();
  const status = await service.startSession({ prompt: 'x' });
  const stopped = await service.stopSession(status.sessionId, 'test-complete');

  assert.equal(stopped.success, true);
  assert.equal(stopped.stopped, true);
  assert.deepEqual(bmoc.closed, [status.sessionId]);
  assert.equal(bmoc.getSession(status.sessionId), null);
}

async function testSandboxPolicyAcceptsHelperOnlyCodeButDoesNotExecute() {
  const { service } = createService();
  const status = await service.startSession({ prompt: 'Find the treaty section.' });
  const result = service.validateSandboxCode({
    sessionId: status.sessionId,
    code: [
      'hits = search_prompt("treaty", 5)',
      'set_value("hits", str(hits))',
      'set_final(get_value("hits"))'
    ].join('\n')
  });

  assert.equal(result.success, true);
  assert.equal(result.handled, true);
  assert.equal(result.validation.success, true);
  assert.equal(result.validation.executable, false);
  assert.equal(result.validation.executionDisabled, true);
  assert.equal(result.validation.errors.length, 0);
}

async function testSandboxPolicyBlocksUnsafeCode() {
  const { service } = createService();
  const result = service.validateSandboxCode({
    code: [
      'import os',
      'print(open("/etc/passwd").read())',
      'os.system("curl http://example.invalid")'
    ].join('\n')
  });

  assert.equal(result.success, true);
  assert.equal(result.validation.success, false);
  const ids = result.validation.errors.map((item) => item.id);
  assert.ok(ids.includes('import'));
  assert.ok(ids.includes('filesystem-open'));
  assert.ok(ids.includes('process'));
  assert.ok(ids.includes('environment'));
}

async function testSandboxExecutionDisabledByDefault() {
  const { service } = createService();
  const status = await service.startSession({ prompt: 'Alpha treaty text.' });
  const result = await service.executeSandboxCode({
    sessionId: status.sessionId,
    code: 'set_final(slice_prompt(0, 5))'
  });

  assert.equal(result.success, false);
  assert.equal(result.handled, true);
  assert.equal(result.executionDisabled, true);
}

async function testSandboxExecutionCanUseEnvironmentHelpersWhenEnabled() {
  const { service } = createService({ enableSandboxExecution: true });
  const status = await service.startSession({
    prompt: 'Alpha treaty text. Treaty clause seven grants safe harbor.',
    budget: {
      maxReplExecMs: 2000,
      maxStdoutCharsPerIteration: 2000,
      maxStderrCharsPerIteration: 1000
    }
  });
  const result = await service.executeSandboxCode({
    sessionId: status.sessionId,
    code: [
      'hits = search_prompt("treaty", 3)',
      'set_value("hit_count", str(len(hits)))',
      'set_final(slice_prompt(hits[0]["index"], hits[0]["index"] + 12))'
    ].join('\n')
  });

  assert.equal(result.success, true);
  assert.equal(result.executionDisabled, false);
  assert.equal(result.environment.scratch.count, 1);
  assert.equal(result.environment.final.set, true);
  assert.equal(result.environment.final.preview, 'treaty text.');
}

async function testSandboxExecutionRejectsUnsafeCodeBeforeWorkerLaunch() {
  const result = await executePythonSnippet({
    code: 'import os\nset_final("bad")',
    prompt: 'x',
    budget: { maxReplExecMs: 1000 }
  });

  assert.equal(result.success, false);
  assert.equal(result.handled, true);
  assert.equal(result.validation.success, false);
  assert.equal(result.error, 'RLM sandbox policy rejected code before execution.');
}

async function testSandboxExecutionTimeout() {
  const result = await executePythonSnippet({
    code: 'while True:\n    pass',
    prompt: 'x',
    budget: { maxReplExecMs: 250 }
  });

  assert.equal(result.success, false);
  assert.equal(result.timeout, true);
  assert.match(result.error, /timed out/i);
}

async function testSandboxExecutionCapturesPrintWithoutBreakingJson() {
  const result = await executePythonSnippet({
    code: [
      'print("alpha")',
      'print("beta")',
      'set_final("done")'
    ].join('\n'),
    prompt: 'x',
    budget: {
      maxReplExecMs: 2000,
      maxStdoutCharsPerIteration: 256
    }
  });

  assert.equal(result.success, true);
  assert.equal(result.result.success, true);
  assert.equal(result.result.stdout, 'alpha\nbeta\n');
  assert.equal(result.result.final.value, 'done');
}

async function testSandboxWorkerBlocksAstEscapes() {
  const cases = [
    'def helper():\n    return 1\nset_final("bad")',
    'class Escape:\n    pass\nset_final("bad")',
    'set_final((lambda: "bad")())'
  ];

  for (const code of cases) {
    const result = await executePythonSnippet({
      code,
      prompt: 'x',
      budget: { maxReplExecMs: 2000 }
    });
    assert.equal(result.success, false);
    assert.equal(result.result.success, false);
    assert.ok(result.result.errors.some((item) => item.id === 'ast-blocked-node'));
  }
}

async function testStructuredActionsOperateOnEnvironment() {
  const { service } = createService();
  const longPrompt = `${'Alpha treaty text. Treaty clause seven grants safe harbor. '.repeat(20)}omega`;
  const status = await service.startSession({
    prompt: longPrompt,
    budget: { maxPromptSliceChars: 512 }
  });

  const search = await service.runAction({
    sessionId: status.sessionId,
    action: {
      type: 'search_prompt',
      args: { pattern: 'Treaty', maxHits: 2 }
    }
  });
  assert.equal(search.success, true);
  assert.equal(search.action, 'search_prompt');
  assert.equal(search.result.length, 2);

  const slice = await service.runAction({
    sessionId: status.sessionId,
    action: {
      type: 'slice_prompt',
      args: { start: 0, end: 1000 }
    }
  });
  assert.equal(slice.success, true);
  assert.equal(slice.result.text.length, 512);
  assert.equal(slice.result.truncated, true);

  const setValue = await service.runAction({
    sessionId: status.sessionId,
    action: {
      type: 'set_value',
      args: { name: 'note', value: 'safe harbor' }
    }
  });
  assert.equal(setValue.success, true);
  assert.equal(setValue.environment.scratch.count, 1);

  const final = await service.runAction({
    sessionId: status.sessionId,
    action: {
      type: 'set_final',
      args: { value: 'done' }
    }
  });
  assert.equal(final.success, true);
  assert.equal(final.environment.final.set, true);
  assert.equal(final.environment.final.preview, 'done');
}

async function testStructuredActionsFailClosed() {
  const { service } = createService();
  const status = await service.startSession({ prompt: 'x' });
  const result = await service.runAction({
    sessionId: status.sessionId,
    action: { type: 'read_file', args: { path: '/etc/passwd' } }
  });

  assert.equal(result.success, false);
  assert.match(result.error, /Unsupported RLM action/);
}

async function testSubLmActionUsesModelTransportAndBudget() {
  const calls = [];
  const { service } = createService({
    sendMessage: async (model, messages, options = {}) => {
      calls.push({ model, messages, options });
      return { response: { message: { content: 'sub answer' } } };
    }
  });
  const status = await service.startSession({
    prompt: 'Root prompt',
    model: 'mock-root',
    budget: {
      maxSubcalls: 2,
      maxTokensPerSubcall: 128
    }
  });

  const result = await service.runAction({
    sessionId: status.sessionId,
    action: {
      type: 'sub_lm',
      args: {
        prompt: 'Summarize this slice.',
        maxTokens: 80
      }
    }
  });

  assert.equal(result.success, true);
  assert.equal(result.action, 'sub_lm');
  assert.equal(result.result.content, 'sub answer');
  assert.equal(result.result.usage.subcalls, 1);
  assert.equal(result.environment.final.set, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, 'mock-root');
  assert.deepEqual(calls[0].messages, [
    {
      role: 'system',
      content: 'You are a bounded RLM subcall. Return only the requested answer. Do not include analysis, thinking, markdown, or extra explanation.'
    },
    { role: 'user', content: 'Summarize this slice.' }
  ]);
  assert.equal(calls[0].options.rlmSubcall, true);
  assert.equal(calls[0].options.maxTokens, 80);
  assert.equal(calls[0].options.temperature, 0);
}

async function testSubLmActionFailsClosedAtBudgetLimit() {
  let callCount = 0;
  const { service } = createService({
    sendMessage: async () => {
      callCount += 1;
      return { response: { message: { content: 'sub answer' } } };
    }
  });
  const status = await service.startSession({
    prompt: 'Root prompt',
    model: 'mock-root',
    budget: {
      maxSubcalls: 1
    }
  });

  const first = await service.runAction({
    sessionId: status.sessionId,
    action: { type: 'sub_lm', args: { prompt: 'first' } }
  });
  const second = await service.runAction({
    sessionId: status.sessionId,
    action: { type: 'sub_lm', args: { prompt: 'second' } }
  });

  assert.equal(first.success, true);
  assert.equal(second.success, false);
  assert.equal(second.budgetExhausted, true);
  assert.match(second.error, /subcall budget exhausted/i);
  assert.equal(callCount, 1);
}

function testRootLoopJsonExtraction() {
  assert.deepEqual(
    extractFirstJsonObject('```json\n{"type":"len_prompt","args":{}}\n```'),
    { type: 'len_prompt', args: {} }
  );
  assert.deepEqual(
    extractFirstJsonObject('Here is the action:\n{"type":"set_final","args":{"value":"done"}}\nThanks'),
    { type: 'set_final', args: { value: 'done' } }
  );
}

async function testRootLoopExecutesStructuredActions() {
  const hiddenTail = 'SECRET_TAIL_SHOULD_NOT_REACH_ROOT_MODEL';
  const hiddenMessage = 'OLD_STORY_CONTEXT_SHOULD_NOT_REACH_ROOT_MODEL';
  const prompt = `${'Alpha treaty text. '.repeat(200)}${hiddenTail}`;
  const seenMessages = [];
  const actions = [
    { type: 'search_prompt', args: { pattern: 'treaty', maxHits: 1 } },
    { type: 'slice_prompt', args: { start: 0, end: 80 } },
    { type: 'set_final', args: { value: 'The prompt discusses Alpha treaty text.' } }
  ];
  const { service } = createService({
    sendMessage: async (_model, messages) => {
      seenMessages.push(JSON.stringify(messages));
      return { response: { message: { content: JSON.stringify(actions.shift()) } } };
    }
  });

  const result = await service.runLoop({
    prompt,
    messages: [
      { role: 'user', content: hiddenMessage }
    ],
    model: 'mock-root',
    budget: {
      maxRootIterations: 4,
      maxPromptSliceChars: 512
    }
  });

  assert.equal(result.success, true);
  assert.equal(result.final, 'The prompt discusses Alpha treaty text.');
  assert.equal(result.iterations, 3);
  assert.equal(seenMessages.length, 3);
  assert.equal(seenMessages.some((text) => text.includes(hiddenTail)), false);
  assert.equal(seenMessages.some((text) => text.includes(hiddenMessage)), false);
  assert.ok(result.observations.some((item) => item.action.type === 'search_prompt'));
  assert.ok(result.observations.some((item) => item.action.type === 'slice_prompt'));
}

async function testRootLoopCanUseSubLmObservation() {
  const calls = [];
  const rootActions = [
    { type: 'sub_lm', args: { prompt: 'Extract the key point.', maxTokens: 96 } },
    { type: 'set_final', args: { value: 'Final from subcall observation.' } }
  ];
  const { service } = createService();
  const result = await service.runLoop({
    prompt: 'Long task',
    model: 'mock-root',
    budget: {
      maxRootIterations: 3,
      maxSubcalls: 2
    }
  }, {
    sendMessage: async (model, messages, options = {}) => {
      calls.push({ model, messages, options });
      if (options.rlmSubcall) {
        return { response: { message: { content: 'key point' } } };
      }
      return { response: { message: { content: JSON.stringify(rootActions.shift()) } } };
    }
  });

  assert.equal(result.success, true);
  assert.equal(result.final, 'Final from subcall observation.');
  assert.ok(result.observations.some((item) => item.action.type === 'sub_lm'));
  assert.ok(result.observations.some((item) => item.result?.content === 'key point'));
  assert.equal(calls.filter((call) => call.options.rlmSubcall === true).length, 1);
}

async function testRootLoopEnforcesPromptRequestedActionsBeforeFinal() {
  let rootCalls = 0;
  const { service } = createService({
    sendMessage: async (_model, _messages, options = {}) => {
      if (options.rlmSubcall) {
        return { response: { message: { content: 'A persecuted caravan must recover a pardon from pirates before the empire erases them.' } } };
      }
      rootCalls += 1;
      return { response: { message: { content: '{"type":"set_final","args":{"value":"Recovered final."}}' } } };
    }
  });

  const result = await service.runLoop({
    prompt: [
      'Create a numbered outline.',
      'Before writing the final outline, use the RLM environment to:',
      '1. inspect the prompt length,',
      '2. read a slice of the prompt,',
      '3. ask a bounded sub_lm call to summarize the central conflict in one sentence,',
      '4. then produce the final answer.'
    ].join('\n'),
    model: 'mock-root',
    budget: {
      maxRootIterations: 5,
      maxSubcalls: 2
    }
  });

  assert.equal(result.success, true);
  assert.equal(result.final, 'Recovered final.');
  assert.deepEqual(result.observations.map((entry) => entry.action.type), [
    'len_prompt',
    'slice_prompt',
    'sub_lm',
    'set_final'
  ]);
  assert.equal(rootCalls, 1);
}

async function testRootLoopRetriesInvalidJsonAction() {
  let callCount = 0;
  const { service } = createService({
    sendMessage: async () => {
      callCount += 1;
      if (callCount === 1) return { response: { message: { content: 'not-json' } } };
      return { response: { message: { content: '{"type":"set_final","args":{"value":"recovered"}}' } } };
    }
  });
  const result = await service.runLoop({
    prompt: 'Short prompt',
    model: 'mock-root',
    budget: { maxRootIterations: 3 }
  });

  assert.equal(result.success, true);
  assert.equal(result.final, 'recovered');
  assert.equal(callCount, 2);
  assert.equal(result.observations[0].success, false);
  assert.match(result.observations[0].error, /Invalid JSON action/);
}

async function testRootLoopBudgetExhaustion() {
  const { service } = createService({
    sendMessage: async () => ({ response: { message: { content: '{"type":"len_prompt","args":{}}' } } })
  });
  const result = await service.runLoop({
    prompt: 'Never finalized',
    model: 'mock-root',
    budget: { maxRootIterations: 2 }
  });

  assert.equal(result.success, false);
  assert.equal(result.budgetExhausted, true);
  assert.equal(result.iterations, 2);
  assert.equal(result.final, '');
}

(async () => {
  testRootLoopJsonExtraction();
  await testStartSessionRegistersWithBmoc();
  await testDryRunDoesNotSendFullPromptToRootModel();
  await testBehaviorProfilesSelectDifferentBudgets();
  await testStopSessionClosesBmocSession();
  await testSandboxPolicyAcceptsHelperOnlyCodeButDoesNotExecute();
  await testSandboxPolicyBlocksUnsafeCode();
  await testSandboxExecutionDisabledByDefault();
  await testSandboxExecutionCanUseEnvironmentHelpersWhenEnabled();
  await testSandboxExecutionRejectsUnsafeCodeBeforeWorkerLaunch();
  await testSandboxExecutionTimeout();
  await testSandboxExecutionCapturesPrintWithoutBreakingJson();
  await testSandboxWorkerBlocksAstEscapes();
  await testStructuredActionsOperateOnEnvironment();
  await testStructuredActionsFailClosed();
  await testSubLmActionUsesModelTransportAndBudget();
  await testSubLmActionFailsClosedAtBudgetLimit();
  await testRootLoopExecutesStructuredActions();
  await testRootLoopCanUseSubLmObservation();
  await testRootLoopEnforcesPromptRequestedActionsBeforeFinal();
  await testRootLoopRetriesInvalidJsonAction();
  await testRootLoopBudgetExhaustion();
  console.log('rlm-service regression tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
