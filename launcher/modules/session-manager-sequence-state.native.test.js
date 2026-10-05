'use strict';

// Optional CPU-only integration test. BMOC opens and closes every test process.
// node launcher/modules/session-manager-sequence-state.native.test.js /path/to/model.gguf
if (!process.argv[2]) {
  console.log('Native test skipped: supply a GGUF path');
  process.exit(0);
}
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const createRegistry = require('./session-manager-state');
const createState = require('./session-manager-sequence-state');
const createLauncher = require('./session-manager-service-launcher');
const sessionUtils = require('./session-manager-session-utils');
const processUtils = require('./session-manager-process-utils');
const PortPool = require('./port-pool/port-pool-ollama');

async function run() {
  const root = path.resolve(__dirname, '../..');
  const modelPath = path.resolve(process.argv[2]);
  assert(fs.existsSync(modelPath), 'GGUF file must exist');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bmoc-native-'));
  let manager;
  const registry = createRegistry({ processUtils, sessionUtils,
    beforeClose: id => manager.invalidate(id) });
  registry.initialize(path.join(directory, 'launcher'));
  const completions = [];
  manager = createState({ getSession: id => registry.getSession(id), log: () => {},
    fetch: async (url, options) => {
      if (!url.endsWith('/completion')) return fetch(url, options);
      const body = { ...JSON.parse(options.body), n_predict: 2, temperature: 0 };
      const response = await fetch(url, { ...options, body: JSON.stringify(body) });
      if (response.ok) completions.push({ body, data: await response.clone().json() });
      return response;
    }
  });
  const launcher = createLauncher({ normalizeServiceType: sessionUtils.normalizeServiceType,
    registerSession: config => registry.registerSession(config) });
  const ids = new Set();
  async function start() {
    const result = await launcher.startLlamaCppForService('moe-agent', path.join(root, 'launcher'), {
      modelPath, modelName: path.basename(modelPath), persistentSequence: true,
      forceCpu: true, contextSize: 512, threads: 4, parallel: 1, startupTimeoutMs: 120000
    });
    assert.equal(result.success, true, result.message);
    ids.add(result.sessionId);
    return result.sessionId;
  }
  async function turn(id, content) {
    const result = await manager.runTurn(id, { messages: [{ role: 'user', content }], timeoutMs: 60000 });
    assert.equal(result.success, true, result.error);
    return result;
  }
  async function close(id) {
    assert.equal(await registry.closeSession(id, { ollama: PortPool }), true);
    ids.delete(id);
    assert.equal(manager.status(id).status, 'invalidated');
  }
  try {
    const id = await start();
    await turn(id, 'Hello');
    // A normal BMOC metadata update must not break state ownership.
    registry.updateSession(id, { metadata: { ...registry.getSession(id).metadata, reviewLabel: 'native-test' } });
    await turn(id, 'Continue');
    await turn(id, 'Continue again');
    for (let i = 1; i < 3; i++) {
      const prior = completions[i - 1];
      const current = completions[i];
      const nativePrefix = [...prior.body.prompt, ...prior.data.tokens];
      assert.deepEqual(current.body.prompt.slice(0, nativePrefix.length), nativePrefix,
        'Continuation must preserve exact prompt and generated token IDs');
      assert.equal(current.data.id_slot, 0);
      assert(current.data.timings.cache_n >= prior.body.prompt.length,
        'Installed llama.cpp must reuse native state rather than replay the old prompt');
    }
    assert.equal(manager.status(id).turnCount, 3);
    assert.equal(manager.status(id).messageCount, 6);
    const reset = await manager.reset(id);
    assert.equal(reset.success, true, reset.error);
    assert.equal(reset.bmocState.generation, 1);
    assert.equal(manager.status(id).tokenCount, 0);
    await turn(id, 'Hello');
    assert.equal(completions[3].data.timings.cache_n, 0, 'Reset must clear the native slot');
    assert.deepEqual(completions[3].body.prompt, completions[0].body.prompt);
    await close(id);
    assert.equal((await manager.runTurn(id, { messages: [{ role: 'user', content: 'Closed' }] })).success, false);
    const restarted = await start();
    assert.notEqual(restarted, id);
    await turn(restarted, 'Hello');
    assert.equal(completions[4].data.timings.cache_n, 0);
    assert.equal(manager.status(restarted).generation, 0);
    assert.equal(manager.status(restarted).turnCount, 1);
    await close(restarted);
    console.log('Native BMOC continuity, reset, close, and restart checks passed');
  } finally {
    for (const id of ids) await registry.closeSession(id, { ollama: PortPool });
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
run().catch(err => { console.error(err); process.exitCode = 1; });
