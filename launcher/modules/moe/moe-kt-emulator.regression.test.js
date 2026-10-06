'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ADAPTER, DEFAULTS, createGatewayClient, settings } = require('./moe-kt-emulator');
const { validateConfig } = require('./moe-config-validation');
const createState = require('../session-manager-sequence-state');
const snapshot = { step: 2, instruction: 'FF', y: 0.1, ga: 0.55, gb: 0.45, magnitude: 1,
  model: 'float', init: 'medium', seed: 1, read_noise: 0.02, history: [] };
function fixture(fetch) {
  const calls = []; const logs = [];
  const gateway = { id: 'g', type: 'gateway', name: 'kT', position: 'output', enabled: true,
    adapter: ADAPTER, assignedAgentIds: ['a'], ktEmulator: { ...DEFAULTS } };
  let deployment = { id: 'deployment', gateways: { g: gateway }, agents: { a: {
    sessionId: 'bmoc-a', endpoint: 'http://127.0.0.1:12345', modelName: 'RWKV7' } } };
  const state = { generation: 3, turnCount: 4 };
  const client = createGatewayClient({ getStatus: () => deployment, getStateStatus: () => state,
    log: entry => logs.push(entry), fetch: async (url, options) => {
      calls.push({ url, options });
      return fetch ? fetch(url, options) : { ok: true, status: 200, json: async () => snapshot };
    } });
  return { client, calls, logs, gateway, state, setDeployment: value => { deployment = value; } };
}
test('manual commands use exactly the existing API fields and emit correlated traces', async () => {
  const f = fixture();
  for (const command of ['read', 'evaluate', 'reset']) {
    const result = await f.client.run('g', command);
    assert.equal(result.success, true);
    const entry = result.trace.steps[0];
    assert.equal(entry.sessionId, 'bmoc-a'); assert.equal(entry.agentId, 'a');
    assert.equal(entry.generation, 3); assert.equal(entry.turnCount, 4);
    assert.equal(entry.origin, 'manual'); assert.equal(entry.httpStatus, 200);
    assert.equal(entry.result.magnitude, 1); assert.equal(entry.result.history, undefined);
  }
  assert.equal(f.calls[0].url, 'http://127.0.0.1:8000/api/state');
  assert.equal(f.calls[0].options.method, 'GET'); assert.equal(f.calls[0].options.body, undefined);
  assert.deepEqual(JSON.parse(f.calls[1].options.body), { instruction: 'FF', noise: 0 });
  assert.deepEqual(JSON.parse(f.calls[2].options.body), { seed: 1, model: 'float', init: 'medium', read_noise: 0.02 });
  assert(f.calls.every(call => call.options.redirect === 'error'));
  assert.deepEqual(f.state, { generation: 3, turnCount: 4 });
});
test('reset sends optional starting y, never resets BMOC', async () => {
  const f = fixture(); f.gateway.ktEmulator.start_y = 0.2;
  await f.client.run('g', 'reset'); assert.equal(JSON.parse(f.calls[0].options.body).start_y, 0.2);
  assert.deepEqual(f.state, { generation: 3, turnCount: 4 });
});
test('automatic and manual operations serialize together without changing manual settings or BMOC state',async () => {
  const f=fixture(); const before=JSON.stringify(f.gateway.ktEmulator);
  const [automatic,manual]=await Promise.all([
    f.client.runExperiment('g',{ command:'evaluate',agentId:'a',runId:'run',experimentId:'experiment',drive:{ instruction:'RF',noise:0.1 },guard:()=>true }),
    f.client.run('g','evaluate')
  ]);
  assert.equal(automatic.success,true); assert.equal(manual.success,true);
  assert.deepEqual(JSON.parse(f.calls[0].options.body),{ instruction:'RF',noise:0.1 });
  assert.deepEqual(JSON.parse(f.calls[1].options.body),{ instruction:'FF',noise:0 });
  assert.equal(automatic.trace.steps[0].origin,'experiment'); assert.equal(automatic.trace.steps[0].runId,'run');
  assert.equal(JSON.stringify(f.gateway.ktEmulator),before); assert.deepEqual(f.state,{ generation:3,turnCount:4 });
  assert.equal((await f.client.runExperiment('g',{ guard:()=>false,drive:{ instruction:'RF' } })).success,false);
  assert.equal(f.calls.length,2);
});
test('timeout aborts once without retry and warns execution may have occurred', async () => {
  const f = fixture((url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(Object.assign(new Error('abort'), { name: 'AbortError' })));
  }));
  f.gateway.ktEmulator.timeoutMs = 100;
  const result = await f.client.run('g', 'evaluate');
  assert.equal(result.success, false); assert.match(result.error, /timed out.*already/); assert.equal(f.calls.length, 1);
});
test('read-feedback reserves both requests, records fresh read y and post-feedback conductances separately',async () => {
  const f=fixture(async (_url,options)=>{
    const instruction=options.body ? JSON.parse(options.body).instruction : 'FF';
    const data=instruction === 'FF' ? { ...snapshot,y:0.25,ga:0.6,gb:0.4,step:3 } :
      { ...snapshot,instruction,y:0.9,ga:0.7,gb:0.2,magnitude:0.9,step:4 };
    return { ok:true,status:200,json:async()=>data };
  });
  const before=JSON.stringify(f.gateway.ktEmulator);
  const [pair,manual]=await Promise.all([
    f.client.runExperiment('g',{ command:'evaluate',agentId:'a',runId:'r',driveMode:'read-feedback',drive:{ instruction:'FH',noise:0.2 },guard:()=>true }),
    f.client.run('g','read')
  ]);
  assert.equal(pair.success,true); assert.equal(manual.success,true);
  assert.deepEqual(f.calls.slice(0,2).map(c=>JSON.parse(c.options.body)),[{ instruction:'FF',noise:0.2 },{ instruction:'FH',noise:0 }]);
  assert.match(f.calls[2].url,/api\/state$/);
  assert.equal(pair.result.y,0.25); assert.equal(pair.result.ga,0.7); assert.equal(pair.result.gb,0.2); assert.equal(pair.result.magnitude,0.9);
  assert.equal(pair.read.result.ga,0.6); assert.equal(pair.feedback.result.y,0.9);
  assert.deepEqual(pair.trace.steps.map(s=>s.phase),['read','feedback']);
  assert(pair.trace.steps.every(s=>s.startedAt && s.durationMs >= 0 && s.runId === 'r'));
  assert.equal(JSON.stringify(f.gateway.ktEmulator),before); assert.deepEqual(f.state,{ generation:3,turnCount:4 });
});
test('read-feedback never continues after failed read and never retries partial or invalidated pairs',async () => {
  const operation={ command:'evaluate',agentId:'a',driveMode:'read-feedback',drive:{ instruction:'RL',noise:0 },guard:()=>true };
  const failedRead=fixture(async()=>{ throw new Error('read failed'); });
  const a=await failedRead.client.runExperiment('g',operation);
  assert.equal(a.success,false); assert.equal(failedRead.calls.length,1); assert.equal(a.read.success,false); assert.equal(a.feedback,undefined);
  let count=0;
  const failedFeedback=fixture(async()=>{ if (++count === 2) throw new Error('feedback failed'); return { ok:true,status:200,json:async()=>snapshot }; });
  const b=await failedFeedback.client.runExperiment('g',operation);
  assert.equal(b.success,false); assert.equal(failedFeedback.calls.length,2); assert.equal(b.read.success,true); assert.equal(b.feedback.success,false);
  assert.equal(b.trace.steps.length,2); assert.equal(b.result,undefined);
  let alive=true;
  const invalidated=fixture(async()=>{ alive=false; return { ok:true,status:200,json:async()=>snapshot }; });
  const c=await invalidated.client.runExperiment('g',{ ...operation,guard:()=>alive });
  assert.equal(c.success,false); assert.equal(invalidated.calls.length,1); assert.equal(c.trace.steps[1].phase,'feedback');
});
test('HTTP, connection, malformed JSON and non-finite output failures are traced', async () => {
  for (const fetch of [
    async () => ({ ok: false, status: 400, json: async () => ({ error: 'Unknown instruction' }) }),
    async () => { throw new Error('Connection refused'); },
    async () => ({ ok: true, status: 200, json: async () => { throw new Error('Invalid JSON'); } }),
    async () => ({ ok: true, status: 200, json: async () => ({ ...snapshot, ga: Infinity }) })
  ]) {
    const f = fixture(fetch); const result = await f.client.run('g', 'read');
    assert.equal(result.success, false); assert(result.trace.steps[0].error); assert.equal(f.calls.length, 1);
  }
});
test('operations serialize and resolve current session metadata at dispatch', async () => {
  let release;
  const f = fixture(async () => { if (!release) await new Promise(resolve => { release = resolve; }); return { ok: true, status: 200, json: async () => snapshot }; });
  const first = f.client.run('g', 'read'); const second = f.client.run('g', 'evaluate');
  await new Promise(resolve => setImmediate(resolve)); assert.equal(f.calls.length, 1);
  f.state.generation = 4; release();
  assert.equal((await first).trace.steps[0].generation, 3);
  assert.equal((await second).trace.steps[0].generation, 4); assert.equal(f.calls.length, 2);
});
test('missing/disabled Gateway, invalid assignment and unsupported operations never send HTTP', async () => {
  for (const mutate of [f => f.setDeployment(null), f => { f.gateway.enabled = false; },
    f => { f.gateway.assignedAgentIds = []; }, f => { f.gateway.assignedAgentIds = ['a', 'b']; },
    f => { f.gateway.assignedAgentIds = ['missing']; }]) {
    const f = fixture(); mutate(f); assert.equal((await f.client.run('g', 'read')).success, false); assert.equal(f.calls.length, 0);
  }
  const f = fixture();
  for (const command of ['cycle','sample','preset','monitor','model-reset']) assert.equal((await f.client.run('g', command)).success, false);
  assert.equal(f.calls.length, 0);
});
test('model endpoint and localhost aliases are rejected without touching the model', async () => {
  for (const url of ['http://127.0.0.1:12345', 'http://localhost:12345', 'http://[::1]:12345']) {
    const f = fixture(); f.gateway.ktEmulator.baseUrl = url;
    assert.match((await f.client.run('g', 'reset')).error, /model endpoint/); assert.equal(f.calls.length, 0);
  }
});
test('real deployed endpoint objects permit emulator requests and still reject model targets', async () => {
  const endpoints = require('./moe-endpoint');
  for (const endpoint of [endpoints.createLocalEndpoint(12345), endpoints.createLocalIPv6Endpoint(12345)]) {
    const f = fixture();
    f.setDeployment({ id: 'd', gateways: { g: f.gateway }, agents: { a: { sessionId: 'bmoc-a', endpoint } } });
    assert.equal((await f.client.run('g', 'read')).success, true);
    assert.equal(f.calls.length, 1);
    f.gateway.ktEmulator.baseUrl = 'http://localhost:12345';
    assert.match((await f.client.run('g', 'reset')).error, /model endpoint/);
    assert.equal(f.calls.length, 1);
  }
});
test('only origins and valid existing emulator settings are accepted', () => {
  for (const config of [{ baseUrl: 'file:///tmp/model' }, { baseUrl: 'http://localhost:8000/api/reset' },
    { baseUrl: 'http://user:pass@localhost:8000' }, { timeoutMs: 0 }, { instruction: 'XX' },
    { noise: NaN }, { read_noise: -1 }, { seed: 1.5 }, { init: 'invented' }, { model: 'invented' }]) assert.throws(() => settings(config));
});
test('config validates one enabled Gateway and one existing assigned Agent', () => {
  const f = fixture(); const agent = { id: 'a', type: 'agent', name: 'RWKV', enabled: true };
  assert.equal(validateConfig({ items: [agent, f.gateway] }).valid, true);
  assert.equal(validateConfig({ items: [agent, f.gateway, { ...f.gateway, id: 'g2' }] }).valid, false);
  f.gateway.assignedAgentIds = ['missing']; assert.equal(validateConfig({ items: [agent, f.gateway] }).valid, false);
});
test('real deployment preserves assignment/settings and teardown sends no emulator requests', async () => {
  const deployment = require('./moe-deployment'); const f = fixture();
  const http = require('node:http'); const original = http.createServer;
  const { EventEmitter } = require('node:events');
  http.createServer = () => Object.assign(new EventEmitter(), {
    listen(port, host, callback) { callback(); }, close(callback) { callback(); }
  });
  deployment.initialize({ allocateCoordinatorPort: () => 52434, releaseCoordinatorPort: () => {}, routeMoEMessage: () => {} });
  try {
    const result = await deployment.deployPipeline({ items: [f.gateway] }, '/tmp', null);
    assert.equal(result.success, true);
    const deployed = deployment.getGateway('g');
    assert.deepEqual(deployed.assignedAgentIds, ['a']); assert.notEqual(deployed.assignedAgentIds, f.gateway.assignedAgentIds);
    assert.deepEqual(deployed.ktEmulator, DEFAULTS); assert.equal(deployed.irg.enabled, false);
  } finally { await deployment.teardownPipeline(); http.createServer = original; }
  assert.equal(f.calls.length, 0);
});
test('all Gateway operations leave real BMOC sequence metadata unchanged and never contact llama.cpp', async () => {
  let modelCalls = 0;
  const bmoc = createState({ getSession: () => ({ ollamaPID: 1, ollamaPort: 12345, metadata: { backend: 'llama-cpp', persistentSequence: true } }),
    fetch: async () => { modelCalls++; throw new Error('Model call forbidden'); }, log: () => {} });
  const f = fixture();
  const before = bmoc.status('bmoc-a');
  const client = createGatewayClient({ getStatus: () => ({ id: 'd', gateways: { g: f.gateway }, agents: { a: { sessionId: 'bmoc-a', endpoint: 'http://127.0.0.1:12345' } } }),
    getStateStatus: id => bmoc.status(id), log: () => {}, fetch: async () => ({ ok: true, status: 200, json: async () => snapshot }) });
  for (const command of ['read','evaluate','reset']) assert.equal((await client.run('g', command)).success, true);
  assert.deepEqual(bmoc.status('bmoc-a'), before); assert.equal(modelCalls, 0);
});
test('IPC dispatch exposes only a Gateway ID/command, with no model operations', async () => {
  const handlers = require('../ipc-handlers/moe').createMoEHandlers(); const calls = [];
  const ctx = { sessionManager: { runMoEKtGateway: (id, command) => { calls.push([id, command]); return { success: true }; } } };
  assert.equal((await handlers['moe-kt-gateway'](ctx, {}, 'g', 'read')).success, true);
  assert.deepEqual(calls, [['g', 'read']]);
});
test('Gateway UI sends only manual operations, escapes trace content and prevents duplicate clicks', async () => {
  const vm = require('node:vm'); const fs = require('node:fs'); let release; const calls = [];
  const f = fixture();
  const context = { window: { modelOrderingState: { moeItems: [f.gateway, { id: 'a', type: 'agent', name: 'RWKV' }] },
    electronAPI: { runMoEKtGateway: (id, command) => { calls.push([id, command]); return new Promise(resolve => { release = resolve; }); } } },
    escapeBinding: value => String(value).replaceAll('<', '&lt;').replaceAll('>', '&gt;'), renderModelOrdering: () => {}, console: { log: () => {} } };
  vm.createContext(context); vm.runInContext(fs.readFileSync(require.resolve('../../src/renderer/renderer-developer/moe-kt-gateway.js'), 'utf8'), context);
  assert.equal(calls.length, 0);
  const pending = context.window.runKtGateway('g', 'reset');
  await context.window.runKtGateway('g', 'reset'); assert.equal(calls.length, 1);
  assert.match(context.window.renderKtGatewayDetails(f.gateway), /button disabled/);
  release({ trace: { steps: [{ error: '<script>bad</script>' }] } }); await pending;
  const html = context.window.renderKtGatewayDetails(f.gateway);
  assert(!html.includes('<script>bad')); assert(html.includes('&lt;script&gt;bad'));
});
test('real HTTP requests validate the wire contract and abort a stalled response without retry', async () => {
  const http = require('node:http'); const requests = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url);
    if (req.url === '/api/evaluate') return;
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(snapshot));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const f = fixture(); f.gateway.ktEmulator.baseUrl = `http://127.0.0.1:${server.address().port}`; f.gateway.ktEmulator.timeoutMs = 100;
    const client = createGatewayClient({ getStatus: () => ({ id: 'd', gateways: { g: f.gateway }, agents: { a: { sessionId: 'bmoc-a' } } }),
      getStateStatus: () => f.state, log: () => {} });
    assert.equal((await client.run('g', 'read')).success, true);
    assert.match((await client.run('g', 'evaluate')).error, /timed out/);
    assert.deepEqual(requests, ['/api/state', '/api/evaluate']);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
