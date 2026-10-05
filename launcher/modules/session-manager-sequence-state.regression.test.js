'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const createState = require('./session-manager-sequence-state');
const createTransport = require('./moe/moe-coordinator-agents');
function mockReply(url, body) {
  if (url.endsWith('/apply-template')) return { prompt: body.messages.map(m => `${m.role}: ${m.content}\n`).join('') + 'assistant: ' };
  if (url.endsWith('/tokenize')) return { tokens: [...body.content].map(c => c.charCodeAt(0)) };
  if (url.endsWith('/completion')) return { content: 'Answer', tokens: [999], truncated: false };
  return { choices: [{ message: { role: 'assistant', content: 'Answer' } }] };
}
function fixture() {
  const sessions = { a: { ollamaPID: 10, ollamaPort: 12345,
    metadata: { backend: 'llama-cpp', persistentSequence: true } } };
  const calls = [];
  const manager = createState({ getSession: id => sessions[id], fetch: async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return { ok: true, json: async () => mockReply(url, JSON.parse(options.body)) };
  }});
  const turn = text => manager.runTurn('a', { model: 'rwkv7', messages: [{ role: 'user', content: text }] });
  return { sessions, calls, manager, turn };
}
test('successive turns extend matching context on the same slot; concurrent calls serialize', async () => {
  const f = fixture();
  const result = await Promise.all([f.turn('One'), f.turn('Two')]);
  assert(result.every(r => r.success));
  const completions = f.calls.filter(c => c.url.endsWith('/completion'));
  assert.deepEqual(completions[1].body.prompt.slice(0, completions[0].body.prompt.length + 1), [...completions[0].body.prompt, 999]);
  assert(completions.every(c => c.body.id_slot === 0 && c.body.cache_prompt === true));
  assert.equal(f.manager.status('a').messageCount, 4);
});
test('reset erases native slot and matching conversation before next turn', async () => {
  const f = fixture(); await f.turn('Old');
  assert.equal((await f.manager.reset('a')).success, true);
  assert.match(f.calls[3].url, /slots\/0\?action=erase$/);
  assert.equal(f.manager.status('a').messageCount, 0);
  await f.turn('New'); assert.equal(f.calls[4].body.messages.length, 1);
});
test('close invalidates state and rejects queued turns', async () => {
  const f = fixture(); await f.turn('Old');
  const queued = f.turn('Never');
  await f.manager.invalidate('a'); delete f.sessions.a;
  assert.equal((await queued).success, false);
  assert.equal((await f.turn('Closed')).success, false);
  assert.equal(f.manager.status('a').status, 'invalidated');
});
test('replacement process cannot inherit previous conversation', async () => {
  const f = fixture(); await f.turn('Old');
  f.sessions.a = { ...f.sessions.a, ollamaPID: 11 };
  await f.turn('Restarted');
  assert.equal(f.calls[3].body.messages.length, 1);
});
test('state is isolated by existing BMOC session identity', async () => {
  const f = fixture(); f.sessions.b = { ...f.sessions.a, ollamaPID: 12, ollamaPort: 12346 };
  await f.turn('A');
  await f.manager.runTurn('b', { messages: [{ role: 'user', content: 'B' }] });
  assert.equal(f.calls[3].body.messages.length, 1);
  assert.match(f.calls[3].url, /12346/);
});
test('non-persistent BMOC calls retain legacy body and do not carry history', async () => {
  const f = fixture(); f.sessions.a.metadata.persistentSequence = false;
  assert.equal((await f.turn('One')).success, true);
  assert.equal((await f.turn('Two')).success, true);
  assert.deepEqual(f.calls[1].body, { model: 'rwkv7', messages: [{ role: 'user', content: 'Two' }], stream: false });
  assert.equal(f.manager.status('a').messageCount, 0);
  assert.equal((await f.manager.reset('a')).success, false);
});
test('ordinary Relay llama.cpp calls also delegate to BMOC', async () => {
  let received;
  const transport = createTransport({ requestTimeout: 1000, runSessionTurn: async (id, body) => {
    received = { id, body }; return { success: true, content: 'Legacy' };
  }});
  const result = await transport.callAgent({ provider: 'llama.cpp', modelId: 'model', sessionId: 'moe-agent-normal',
    endpoint: { type: 'local', host: '127.0.0.1', port: 12345, protocol: 'http' } }, [{ role: 'user', content: 'Hello' }]);
  assert.equal(result.content, 'Legacy');
  assert.equal(received.id, 'moe-agent-normal');
});
test('persistent Relay calls are delegated to BMOC by session ID', async () => {
  let received;
  const transport = createTransport({ requestTimeout: 1000, runSessionTurn: async (id, body) => {
    received = { id, body }; return { success: true, content: 'Managed' };
  }});
  await transport.callAgent({ provider: 'llama.cpp', modelId: 'rwkv7', persistentSequence: true, sessionId: 'moe-agent-123',
    endpoint: { type: 'local', host: '127.0.0.1', port: 12345, protocol: 'http' } }, [{ role: 'user', content: 'Hello' }]);
  assert.equal(received.id, 'moe-agent-123');
});
test('failed calls require explicit reset; endpoint overrides cannot borrow another state', async () => {
  const f = fixture();
  const result = await f.manager.runTurn('a', { endpoint: 'http://other:12345', messages: [{ role: 'user', content: 'No' }] });
  assert.equal(result.success, false); assert.equal(f.calls.length, 0);
  assert.equal((await f.turn('No')).success, false);
  await f.manager.reset('a'); assert.equal((await f.turn('Yes')).success, true);
});
test('in-flight close aborts native call and releases retained context', async () => {
  const session = { ollamaPID: 10, ollamaPort: 12345, metadata: { backend: 'llama-cpp', persistentSequence: true } };
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const manager = createState({ getSession: () => session, fetch: (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true }); started();
  }) });
  const turn = manager.runTurn('a', { messages: [{ role: 'user', content: 'Hello' }] });
  await ready; await manager.invalidate('a');
  assert.equal((await turn).success, false);
});
test('BMOC close hook invalidates state before terminating registered process', async () => {
  const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
  const createRegistry = require('./session-manager-state');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bmoc-lifecycle-'));
  const events = [];
  try {
    const registry = createRegistry({ beforeClose: async id => { events.push('invalidate'); await manager.invalidate(id); },
      processUtils: { killProcess: async () => events.push('kill'), killProcessesOnPort: async () => {} },
      sessionUtils: { generateSessionId: () => 'moe-agent-test' } });
    registry.initialize(path.join(dir, 'launcher'));
    const id = registry.registerSession({ type: 'moe-agent', ollamaPID: 10, ollamaPort: 12345,
      metadata: { backend: 'llama-cpp', persistentSequence: true } });
    const manager = createState({ getSession: id => registry.getSession(id), fetch: async (url, options) => ({ ok: true,
      json: async () => mockReply(url, JSON.parse(options.body)) }) });
    await manager.runTurn(id, { messages: [{ role: 'user', content: 'Hello' }] });
    const releases = [];
    assert.equal(await registry.closeSession(id, { ollama: { releasePort: port => releases.push(port) } }), true);
    assert.deepEqual(events, ['invalidate', 'kill']);
    assert.deepEqual(releases, [12345]);
    assert.equal(manager.status(id).status, 'invalidated');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('Relay llama.cpp health checks use BMOC session identity', async () => {
  let id;
  const transport = createTransport({ requestTimeout: 1000, pingSession: async value => { id = value; return { reachable: true }; } });
  assert.equal((await transport.pingAgent({ provider: 'llama.cpp', sessionId: 'moe-agent-test' })).reachable, true);
  assert.equal(id, 'moe-agent-test');
});

test('closing session cannot reopen state while process teardown is still pending', async () => {
  const f = fixture(); await f.turn('Old');
  await f.manager.invalidate('a');
  assert.equal((await f.turn('Race')).success, false);
  assert.equal(f.manager.status('a').status, 'invalidated');
});
test('BMOC lifecycle metadata counts completed turns and resets without exposing native resources', async () => {
  const f = fixture();
  f.sessions.a.metadata.modelId = 'rwkv7-catalog-id';
  f.sessions.a.metadata.modelName = 'RWKV7';
  const first = await f.turn('PRIVATE INPUT');
  assert.equal(first.bmocState.sessionId, 'a');
  assert.equal(first.bmocState.enabled, true);
  assert.equal(first.bmocState.modelId, 'rwkv7-catalog-id');
  assert.equal(first.bmocState.runtime, 'llama.cpp');
  assert.equal(first.bmocState.turnCount, 1);
  assert.equal(first.bmocState.generation, 0);
  await f.turn('Second');
  const reset = await f.manager.reset('a');
  assert.equal(reset.bmocState.turnCount, 0);
  assert.equal(reset.bmocState.totalTurnCount, 2);
  assert.equal(reset.bmocState.resetCount, 1);
  assert.equal(reset.bmocState.generation, 1);
  assert.equal(reset.bmocState.events.at(-1).type, 'reset');
  const serialized = JSON.stringify(reset.bmocState);
  assert(!serialized.includes('PRIVATE INPUT'));
  for (const key of ['tokens', 'messages', 'promptText', 'controller', 'tail', 'pid']) {
    assert.equal(Object.hasOwn(reset.bmocState, key), false);
  }
  assert.equal((await f.turn('Third')).bmocState.turnCount, 1);
});
test('observation is read-only and lifecycle metadata copies cannot mutate BMOC state', async () => {
  const f = fixture();
  const before = f.manager.status('a');
  assert.equal(before.turnCount, 0);
  assert.equal(before.events.length, 0);
  assert.equal(f.calls.length, 0);
  await f.turn('Hello');
  const view = f.manager.status('a'); view.events[0].type = 'tampered'; view.events.push({ type: 'fake' });
  assert.equal(f.manager.status('a').events[0].type, 'opened');
  assert.equal(f.manager.status('a').events.length, 3);
});
test('BMOC event log contains no prompts or generated token IDs; history is bounded', async () => {
  const f = fixture(); const logs = [];
  const manager = createState({ getSession: id => f.sessions[id], log: row => logs.push(row), fetch: async (url, options) => ({
    ok: true, json: async () => mockReply(url, JSON.parse(options.body))
  }) });
  for (let i = 0; i < 52; i++) {
    await manager.runTurn('a', { messages: [{ role: 'user', content: 'SECRET' }] });
  }
  assert.equal(manager.status('a').events.length, 100);
  assert.equal(manager.status('a').totalTurnCount, 52);
  assert(!JSON.stringify(logs).includes('SECRET'));
  await manager.invalidate('a');
  assert.equal(logs.at(-1).event.type, 'invalidated');
  assert.equal(logs.at(-1).sessionId, 'a');
});
test('Relay chat surfaces escape BMOC metadata and display it without routing metadata', () => {
  const fs = require('node:fs'); const path = require('node:path'); const vm = require('node:vm');
  const renderers = [
    ['../src/moe-chat-renderer-render.js', 'MoeChatRenderOps', 'buildRouteTraceLine'],
    ['../src/renderer/renderer-developer/moe-pipeline-ops-chat-render.js', 'MoePipelineChatRenderOps', 'buildInlineRouteTrace']
  ];
  for (const [file, group, method] of renderers) {
    const window = {};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), { window });
    const html = window[group][method]({ bmocState: { sessionId: 'moe-agent-test', status: 'ready',
      enabled: true, generation: 2, turnCount: 3, modelName: '<script>bad</script>' } }, {
      escapeHtml: value => String(value).replace(/</g, '&lt;').replace(/>/g, '&gt;')
    });
    assert(html.includes('moe-agent-test'));
    assert(html.includes('&lt;script&gt;'));
    assert(!html.includes('<script>'));
  }
});
test('BMOC enriches Relay status from its own registry without mutating deployment records', () => {
  const fs = require('node:fs'); const vm = require('node:vm'); const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, 'session-manager.js'), 'utf8');
  const code = source.slice(source.indexOf('function getMoEStatus()'), source.indexOf('async function teardownMoEPipeline'));
  const deployment = { agents: { 'relay-agent-1': { provider: 'llama.cpp', sessionId: 'moe-agent-123' } } };
  const calls = [];
  const scope = { moe: { getMoEStatus: () => deployment }, sequenceState: { status: id => {
    calls.push(id); return { sessionId: id, enabled: true, generation: 1, turnCount: 4 };
  } } };
  vm.runInNewContext(code, scope);
  const result = scope.getMoEStatus();
  assert.deepEqual(calls, ['moe-agent-123']);
  assert.equal(result.agents['relay-agent-1'].bmocState.turnCount, 4);
  assert.equal(deployment.agents['relay-agent-1'].bmocState, undefined);
});
test('ordinary metadata updates preserve queued BMOC turns and exact sequence history', async () => {
  const f = fixture(); await f.turn('First');
  const queued = f.turn('Second');
  f.sessions.a = { ...f.sessions.a, metadata: { ...f.sessions.a.metadata, ownerLabel: 'updated' } };
  assert.equal((await queued).success, true);
  assert.equal(f.manager.status('a').turnCount, 2);
  const completions = f.calls.filter(c => c.url.endsWith('/completion'));
  assert.deepEqual(completions[1].body.prompt.slice(0, completions[0].body.prompt.length + 1), [...completions[0].body.prompt, 999]);
});
test('queued calls are rejected after a true model process restart', async () => {
  const f = fixture(); await f.turn('First');
  const queued = f.turn('Must not reach old process');
  f.sessions.a = { ...f.sessions.a, ollamaPID: 11, startTime: 'new-lifetime' };
  assert.equal((await queued).success, false);
  assert.equal((await f.turn('New lifetime')).success, true);
  assert.equal(f.manager.status('a').turnCount, 1);
});
test('BMOC owns llama.cpp template normalization while Relay forwards its messages unchanged', async () => {
  const f = fixture(); f.sessions.a.metadata.persistentSequence = false;
  const messages = [{ role: 'system', content: 'Rules' }, { role: 'user', content: 'Hello' }];
  const transport = createTransport({ requestTimeout: 1000, runSessionTurn: (id, body) => {
    assert.deepEqual(body.messages, messages);
    return f.manager.runTurn(id, body);
  } });
  const result = await transport.callAgent({ provider: 'llama.cpp', modelId: 'model', sessionId: 'a',
    endpoint: { type: 'local', host: '127.0.0.1', port: 12345, protocol: 'http' } }, messages);
  assert.equal(result.success, true);
  assert.deepEqual(f.calls[0].body, { model: 'model', messages: [{ role: 'user', content: 'Rules\n\nHello' }], stream: false });
  assert.deepEqual(messages, [{ role: 'system', content: 'Rules' }, { role: 'user', content: 'Hello' }]);
});

test('in-flight response cannot commit context after its runtime lifetime changes', async () => {
  const session = { ollamaPID: 10, ollamaPort: 12345, metadata: { backend: 'llama-cpp', persistentSequence: true } };
  let current = session;
  let release;
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const manager = createState({ getSession: () => current, log: () => {}, fetch: async (url, options) => {
    await new Promise(resolve => { release = resolve; started(); });
    return { ok: true, json: async () => mockReply(url, JSON.parse(options.body)) };
  } });
  const pending = manager.runTurn('a', { messages: [{ role: 'user', content: 'Old process' }] });
  await ready;
  current = { ...session, ollamaPID: 11 };
  release();
  assert.equal((await pending).success, false);
  assert.equal(manager.status('a').status, 'invalidated');
  assert.equal(manager.status('a').messageCount, 0);
});
