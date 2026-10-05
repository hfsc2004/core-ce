'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { createController, validateContract, SCHEMAS } = require('./moe-ngi-experiment');
const { parseLlmPlanContract } = require('./moe-irg-infer-plan');
const irg = require('./moe-irg');
const plan = (action, params = {}, extra = {}) => ({ contractVersion: '1.0', target: 'ngi-experiment', action, params, ...extra });
function fixture() {
  const calls = []; const logs = [];
  let response = { success: true, content: 'IRG_PLAN_JSON: ' + JSON.stringify(plan('ngi_inspect')) };
  let status = { id: 'd1', gateways: { g: { adapter: 'kt-emulator-http', enabled: true,
    assignedAgentIds: ['subject'], ktEmulator: { baseUrl: 'http://127.0.0.1:8000' } } }, agents: {
    subject: { sessionId: 'subject-session', name: 'RWKV7', provider: 'llama.cpp', persistentSequence: true, ngiManagement: false },
    helper: { sessionId: 'helper-session', name: 'Assistant', provider: 'llama.cpp', ngiManagement: true },
    other: { sessionId: 'other-session', provider: 'llama.cpp', persistentSequence: true, ngiManagement: false }
  } };
  let gate = null;
  const controller = createController({ getStatus: () => status, log: entry => logs.push(entry),
    callHelper: async (id, messages) => { calls.push({ id, messages }); if (gate) await gate; return response; } });
  return { controller, calls, logs, get status() { return status; }, setStatus: value => { status = value; },
    setResponse: value => { response = value; }, block: promise => { gate = promise; },
    request: async (action, params, helper = 'helper', extra = {}) => {
      response = { success: true, content: 'IRG_PLAN_JSON: ' + JSON.stringify(plan(action, params, extra)) };
      return controller.request('g', helper, 'Please update or inspect the draft');
    } };
}
test('explicit NGI target survives IRG parsing/validation; missing target cannot become Pico', () => {
  const contract = plan('ngi_inspect');
  assert.deepEqual(parseLlmPlanContract('IRG_PLAN_JSON: ' + JSON.stringify(contract), {}), contract);
  assert.equal(irg.validateContract(contract, {}).valid, true);
  const missing = parseLlmPlanContract(JSON.stringify({ action: 'ngi_inspect', params: {} }), {});
  assert.equal(missing.target, ''); assert.equal(irg.validateContract(missing, {}).valid, false);
});
test('NGI schemas reject identity spoofing, unknown keys/actions, code, and invalid values', () => {
  for (const contract of [plan('ngi_inspect', { requestingAgentId: 'helper' }),
    plan('ngi_inspect', {}, { agentId: 'helper' }), plan('constructor'), plan('ngi_unknown'),
    plan('ngi_configure_mapping', { id: 'declared', version: '1', parameters: { expression: 'eval(x)' } }),
    plan('ngi_configure_drive', { instruction: 'XX', noise: 0 }),
    plan('ngi_configure_drive', { instruction: 'FF', noise: Infinity }),
    plan('ngi_configure_trigger_logging', { trigger: 'every-helper-message', logging: { enabled: true, maxRecords: 100 } }),
    plan('ngi_configure_trigger_logging', { trigger: 'manual', logging: { enabled: true, maxRecords: 0 } })]) assert.equal(validateContract(contract).valid, false);
  for (const action of ['ngi_inspect','ngi_validate','ngi_status','ngi_results','ngi_apply','ngi_arm','ngi_start','ngi_stop']) assert.equal(validateContract(plan(action)).valid, true);
  assert(Object.keys(SCHEMAS).length >= 12);
});
test('permission is deployed and subject cannot impersonate or become helper', async () => {
  const f = fixture();
  assert.equal((await f.request('ngi_inspect', {}, 'subject')).success, false); assert.equal(f.calls.length, 0);
  f.status.agents.subject.ngiManagement = true;
  assert.match((await f.request('ngi_inspect', {}, 'subject')).error, /subject/); assert.equal(f.calls.length, 0);
  f.status.agents.helper.ngiManagement = false;
  assert.match((await f.request('ngi_inspect')).error, /permission/); assert.equal(f.calls.length, 0);
});
test('only separate subject can be selected; deployed Gateway assignment stays untouched', async () => {
  const f = fixture();
  for (const id of ['helper','missing']) assert.equal((await f.request('ngi_select_source', { agentId: id, observationId: 'proposed-native-state' })).success, false);
  const result = await f.request('ngi_select_source', { agentId: 'other', observationId: 'proposed-native-state' });
  assert.equal(result.success, true); assert.equal(result.experiment.source.agentId, 'other');
  assert.deepEqual(f.status.gateways.g.assignedAgentIds, ['subject']);
  assert(f.calls.every(call => call.id === 'helper'));
});
test('draft tools update only proposals and validation remains explicitly not runnable', async () => {
  const f = fixture(); const before = JSON.stringify(f.status);
  await f.request('ngi_select_source', { agentId: 'subject', observationId: 'proposed-native-state' });
  await f.request('ngi_configure_mapping', { id: 'proposal-only', version: '1', parameters: {} });
  await f.request('ngi_configure_drive', { instruction: 'FF', noise: 0 });
  await f.request('ngi_configure_trigger_logging', { trigger: 'after-persistent-turn', logging: { enabled: true, maxRecords: 100 } });
  const result = await f.request('ngi_validate');
  assert.equal(result.success, true); assert.equal(result.experiment.revision, 4);
  assert.equal(result.experiment.validation.valid, true); assert.equal(result.experiment.validation.readyToRun, false);
  assert.equal(result.experiment.validation.blockers.length, 3);
  assert.equal(result.experiment.running, false); assert.equal(result.experiment.applied, false);
  assert.equal(JSON.stringify(f.status), before); assert.equal(result.experiment.capabilities.mappings.length, 0);
  assert.equal(f.logs[0].requestingAgentId, 'helper'); assert.equal(f.logs[0].subjectAgentId, 'subject');
});
test('missing fields and invalid subject policy appear in visible validation', () => {
  const f = fixture(); f.status.agents.subject.persistentSequence = false;
  const result = f.controller.inspect('g');
  assert.equal(result.success, true); assert.equal(result.experiment.validation.valid, false);
  assert(result.experiment.validation.errors.some(error => /persistent/.test(error)));
  result.experiment.source.agentId = 'helper';
  assert.equal(f.controller.inspect('g').experiment.source.agentId, 'subject');
});
test('apply/arm/start/stop cannot be authorized by helper output or model flags', async () => {
  const f = fixture();
  for (const action of ['ngi_apply','ngi_arm','ngi_start','ngi_stop']) {
    assert.match((await f.request(action)).error, /unavailable/);
    assert.equal((await f.request(action, { userConfirmed: true })).success, false);
  }
  const state = f.controller.inspect('g').experiment;
  assert.equal(state.revision, 0); assert.equal(state.running, false); assert.equal(state.armed, false);
});
test('generic IRG execution, overrides, and replay paths cannot bypass helper authorization', async () => {
  for (const mode of ['simulate','live','disabled']) {
    const contract = plan('ngi_inspect');
    assert.equal((await irg.executeContract(contract, { irg: { enabled: true, executeMode: mode } }, { requestingAgentId: 'helper' })).blocked, true);
    const result = await irg.tryHandleGatewayRequest({ llmPlan: JSON.stringify(contract), gatewayConfig: { irg: { enabled: true } }, modeOverride: mode });
    assert.equal(result.blocked, true);
  }
  const { runIrgContractInternal } = require('./moe-coordinator-irg-replay');
  const result = await runIrgContractInternal({ contractInput: plan('ngi_inspect'),
    getInputGateway: () => ({ irg: { enabled: true } }), getAnyEnabledIrgGateway: () => null,
    moeIrg: irg, normalizeIrgModeOverride: () => 'live', rememberLastIrgExecution: () => { throw new Error('Must not execute'); } });
  assert.equal(result.success, false); assert.match(result.error, /backend-authorized/);
});
test('helper cannot request a hardware action through experiment management', async () => {
  const f = fixture(); f.setResponse({ success: true, content: JSON.stringify({ target: 'esp32', action: 'esp32_wifi_http', params: {
    host: '127.0.0.1', port: 8000, method: 'GET', path: '/reboot', timeoutMs: 5000 } }) });
  const result = await f.controller.request('g', 'helper', 'Perform an action');
  assert.equal(result.success, false); assert.match(result.error, /ngi-experiment|NGI action/);
});
test('late model responses cannot commit after deployment or permission changes', async () => {
  for (const change of [f => f.setStatus({ ...f.status, id: 'd2' }), f => { f.status.agents.helper.ngiManagement = false; },
    f => { f.status.agents.helper.sessionId = 'new-session'; }]) {
    const f = fixture(); let release; f.block(new Promise(resolve => { release = resolve; }));
    const pending = f.request('ngi_configure_drive', { instruction: 'FF', noise: 0 });
    await new Promise(resolve => setImmediate(resolve)); change(f); release();
    assert.equal((await pending).success, false); assert.equal(f.controller.inspect('g').experiment.drive, null);
  }
});
test('drafts and helper conversations are isolated from new deployments and from subject', async () => {
  const f = fixture(); await f.request('ngi_configure_drive', { instruction: 'FF', noise: 0 });
  const result = await f.request('ngi_results'); assert.deepEqual(result.results, []);
  assert(f.calls.every(call => call.id === 'helper')); assert.equal(f.controller.inspect('g').experiment.conversations, undefined);
  f.setStatus({ ...f.status, id: 'd2' }); assert.equal(f.controller.inspect('g').experiment.revision, 0);
  f.setStatus(null); assert.equal(f.controller.inspect('g').success, false);
});
test('actual coordinator helper transport calls only the BMOC-owned helper session', async () => {
  const coordinator = require('./moe-coordinator'); const endpoint = require('./moe-endpoint');
  const f = fixture(); const calls = [];
  Object.assign(f.status.agents.helper, { modelId: 'helper-model', endpoint: endpoint.createLocalEndpoint(12345) });
  coordinator.initialize({ getAgent: id => f.status.agents[id] }, { runSessionTurn: async (id, input) => {
    calls.push({ id, input }); return { success: true, content: JSON.stringify(plan('ngi_inspect')) };
  } });
  const controller = createController({ getStatus: () => f.status, callHelper: coordinator.callNgiHelper, log: () => {} });
  assert.equal((await controller.request('g', 'helper', 'Inspect the experiment')).success, true);
  assert.equal(calls.length, 1); assert.equal(calls[0].id, 'helper-session');
  assert.equal(calls[0].input.endpoint, 'http://127.0.0.1:12345');
  assert.equal((await controller.request('g', 'subject', 'Inspect')).success, false);
  assert.equal(calls.length, 1);
});
test('IPC keeps helper selection outside model JSON; UI exposes only draft controls', async () => {
  const handlers = require('../ipc-handlers/moe').createMoEHandlers(); const calls = [];
  const ctx = { sessionManager: { requestMoENgiHelper: (...args) => { calls.push(args); return { success: true }; },
    getMoENgiExperiment: () => ({ success: true }) } };
  await handlers['moe-ngi-helper'](ctx, {}, 'g', 'helper', 'Inspect the draft');
  assert.deepEqual(calls, [['g', 'helper', 'Inspect the draft']]);
  const fs = require('node:fs'); const vm = require('node:vm');
  const f = fixture(); const context = { window: { modelOrderingState: { moeItems: [
    { id: 'subject', type: 'agent', name: 'RWKV7', ngiManagement: false },
    { id: 'helper', type: 'agent', name: 'Assistant', ngiManagement: true }
  ] } }, escapeBinding: value => String(value).replaceAll('<', '&lt;'), console, renderModelOrdering: () => {} };
  vm.createContext(context); vm.runInContext(fs.readFileSync(require.resolve('../../src/renderer/renderer-developer/moe-kt-gateway.js'), 'utf8'), context);
  const html = context.window.renderNgiExperimentDraft({ id: 'g', assignedAgentIds: ['subject'] });
  assert.match(html, /value="helper"/); assert(!html.includes('value="subject"'));
  assert.match(html, /Refresh draft \/ validation/);
  assert(!html.includes('>Apply</button>')); assert(!html.includes('>Start</button>'));
  assert(!html.includes('>Arm</button>'));
});
test('config requires an explicit boolean permission and keeps subject management disabled', () => {
  const { validateConfig } = require('./moe-config-validation');
  const config = { items: [ { id: 'subject', type: 'agent', name: 'RWKV', ngiManagement: false },
    { id: 'helper', type: 'agent', name: 'Assistant', ngiManagement: true },
    { id: 'g', type: 'gateway', name: 'NGI', position: 'output', adapter: 'kt-emulator-http', assignedAgentIds: ['subject'] } ] };
  assert.equal(validateConfig(config).valid, true);
  config.items[0].ngiManagement = true; assert.equal(validateConfig(config).valid, false);
  config.items[0].ngiManagement = false; config.items[1].ngiManagement = 'true';
  assert.equal(validateConfig(config).valid, false);
});
test('individual helper chat dispatches draft tools and reports correlated validation', async () => {
  const f = fixture();
  f.setResponse({ success: true, content: JSON.stringify(plan('ngi_configure_drive', { instruction: 'FF', noise: 0 })) });
  const result = await f.controller.chat('helper', 'Propose FF');
  assert.equal(result.success, true);
  assert.equal(result.ngi.requestingAgentId, 'helper');
  assert.equal(result.ngi.gatewayId, 'g');
  assert.equal(result.experiment.drive.instruction, 'FF');
  assert.match(result.content, /NGI draft tool result/);
  assert.equal(await f.controller.chat('subject', 'Hello'), null);
  assert.equal(f.calls.length, 1);
  f.setResponse({ success: true, content: JSON.stringify(plan('ngi_start')) });
  assert.equal((await f.controller.chat('helper', 'Start')).success, false);
  f.status.gateways.second = { ...f.status.gateways.g };
  assert.match((await f.controller.chat('helper', 'Inspect')).error, /exactly one/);
});
test('Full Pipeline cannot invoke IRG even for live overrides and valid model plans', async () => {
  const coordinator = require('./moe-coordinator');
  const endpoint = require('./moe-endpoint');
  const f = fixture();
  const subject = { id: 'subject', modelId: 'rwkv-model', ...f.status.agents.subject, endpoint: endpoint.createLocalEndpoint(12345) };
  f.status.config = { items: [{ id: 'subject', type: 'agent', enabled: true }] };
  f.status.gateways.hardware = { position: 'input', enabled: true, irg: { enabled: true, entryMode: 'deterministic-first' } };
  const original = irg.tryHandleGatewayRequest;
  let executions = 0;
  irg.tryHandleGatewayRequest = async () => { executions++; throw new Error('IRG must not run'); };
  try {
    coordinator.initialize({ isActive: () => true, getAgentsInOrder: () => [subject],
      getAgent: () => subject, getStatus: () => f.status },
      { runSessionTurn: async () => ({ success: true, content: JSON.stringify(plan('ngi_start')) }) });
    const result = await coordinator.routeMessage('Program raspberry pi pico to blink red', { irgModeOverride: 'live' });
    assert.equal(result.success, true, JSON.stringify(result));
    assert.equal(executions, 0);
    assert.equal(result.irg, undefined);
  } finally { irg.tryHandleGatewayRequest = original; }
});
test('individual hardware Agent uses its model plan and configured IRG policy', async () => {
  const coordinator = require('./moe-coordinator'); const endpoint = require('./moe-endpoint');
  const f = fixture(); const calls = [];
  const helper = { id: 'helper', modelId: 'model', ...f.status.agents.helper, endpoint: endpoint.createLocalEndpoint(12345) };
  f.status.gateways = { hardware: { position: 'input', enabled: true, irg: { enabled: true } } };
  const original = irg.tryHandleGatewayRequest;
  irg.tryHandleGatewayRequest = async input => { calls.push(input); return { handled: true, success: true, response: 'Tool result' }; };
  try {
    coordinator.initialize({ isActive: () => true, getAgent: () => helper, getStatus: () => f.status },
      { runSessionTurn: async () => ({ success: true, content: 'IRG_PLAN_JSON: {"target":"raspberry-pi-pico","action":"blink_gpio","params":{}}' }) });
    const result = await coordinator.sendToAgent('helper', 'Program raspberry pi pico to blink red');
    assert.equal(result.content, 'Tool result'); assert.equal(result.irg.requestingAgentId, 'helper');
    assert.equal(calls.length, 1); assert.equal(calls[0].requireLlmPlan, true);
    assert.match(calls[0].llmPlan, /IRG_PLAN_JSON/);
    f.status.gateways.hardware.irg.enabled = false;
    await coordinator.sendToAgent('helper', 'Program raspberry pi pico to blink red');
    assert.equal(calls.length, 1);
  } finally { irg.tryHandleGatewayRequest = original; }
});
test('ordinary helper conversation has no draft dump or tool execution', async () => {
  const f = fixture();
  f.setResponse({ success: true, content: 'Hello! How can I help with the experiment?' });
  const result = await f.controller.chat('helper', 'hello!');
  assert.equal(result.success, true);
  assert.equal(result.content, 'Hello! How can I help with the experiment?');
  assert.equal(result.experiment.revision, 0);
  assert.equal(f.logs.length, 0);
  const prompt = f.calls[0].messages[0].content;
  assert.match(prompt, /Greetings.*require no tool and no JSON/);
  assert.match(prompt, /current user message explicitly asks/);
  assert.match(prompt, /ask a clarifying question/);
  f.setResponse({ success: true, content: 'Native observations are not connected yet.' });
  const explanation = await f.controller.chat('helper', 'What is an observation?');
  assert.equal(explanation.content, 'Native observations are not connected yet.');
  assert.equal(f.logs.length, 0);
});
test('incomplete source proposals remain rejected without changing the draft', async () => {
  const f = fixture();
  f.setResponse({ success: true, content: JSON.stringify(plan('ngi_select_source', { agentId: 'subject' })) });
  const result = await f.controller.chat('helper', 'Select the subject');
  assert.equal(result.success, false);
  assert.equal(result.backendTrace.toolRequested, true);
  assert.equal(result.backendTrace.contract.action, 'ngi_select_source');
  assert.match(result.error, /observationId/);
  assert.equal(result.experiment.revision, 0);
  assert.equal(f.logs.length, 0);
});
test('helper instructions translate everyday management requests without requiring tool names', async () => {
  const f = fixture();
  f.setResponse({ success: true, content: JSON.stringify(plan('ngi_configure_drive', { instruction: 'FF', noise: 0 })) });
  const result = await f.controller.chat('helper', 'Set the draft to FF with no noise');
  assert.equal(result.success, true);
  assert.deepEqual(result.experiment.drive, { instruction: 'FF', noise: 0 });
  const prompt = f.calls[0].messages[0].content;
  assert.match(prompt, /users never need to know action names/);
  assert.match(prompt, /Check the draft and tell me what is missing/);
  assert.match(prompt, /What does FF mean.*plain text without a tool/);
  f.setResponse({ success: true, content: JSON.stringify(plan('ngi_validate')) });
  const validation = await f.controller.chat('helper', 'Check the draft and tell me what is missing');
  assert.equal(validation.success, true);
  assert.equal(validation.contract.action, 'ngi_validate');
  assert.equal(validation.experiment.revision, 1);
});
