'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);
const config = require('./moe-ngi-config');
const { createController } = require('./moe-ngi-experiment');
const user = surface => ({ kind: 'user', surface });
function fixture() {
  const calls = []; const reads = [];
  const status = { id: 'deployment-A', agents: {
    subject: { name: 'RWKV7', sessionId: 'bmoc-subject', modelId: 'rwkv7-model', provider: 'llama.cpp', persistentSequence: true },
    helper: { name: 'Assistant', sessionId: 'bmoc-helper', ngiManagement: true }
  }, gateways: { g: { id: 'g', adapter: 'kt-emulator-http', assignedAgentIds: ['subject'],
    ktEmulator: { baseUrl: 'http://127.0.0.1:8000' } } } };
  let contract = { target: 'ngi-experiment', action: 'ngi_configure_drive', params: { instruction: 'RF', noise: 0 } };
  let hold;
  const controller = createController({ getStatus: () => status, log: () => {},
    getStateStatus: id => { reads.push(id); return { generation: 3, status: 'ready', lifetimeId:'test-lifetime', enabled:true }; },
    native:{ capabilities:() => ({ available:true, observations:[require('../session-manager-rwkv-observation').OBSERVATION] }),
      configure:async () => ({ success:true }),activate:async () => ({ success:true }),clear:async () => ({ success:true }),reset:async () => ({ success:true }) },
    emulator:async () => ({ success:true }),
    callHelper: async id => { calls.push(id); if (hold) await hold; return { success: true, content: JSON.stringify(contract) }; } });
  return { controller, status, calls, reads, setContract: value => { contract = value; }, hold: value => { hold = value; },
    command: (action, params = {}, surface = 'ui') => controller.command('g', action, params, user(surface)) };
}
function completePatch() {
  return { observation: { id: 'rwkv7-native-sequence', version: '1' }, projection: { id: 'seeded-rademacher', version: '1', seed: 42 },
    delta: { id: 'successive-q', version: '1', parameters: {} }, mapping: { id: 'scaled-delta-sign', version: '1', parameters: { scale: 0.5 } },
    drive: { positiveInstruction: 'FF', negativeInstruction: 'RF', noise: 0 },trigger:{ id:'after-persistent-turn' } };
}
test('UI, CLI and model-backed IRG share one revision and no subject/emulator execution', async () => {
  const f = fixture(); const before = JSON.stringify(f.status.agents);
  assert.equal(f.command('ngi_configure', { patch: completePatch(), expectedRevision: 0 }).experiment.revision, 1);
  assert.equal(f.command('ngi_configure', { patch: { projection: { seed: 43 } }, expectedRevision: 1 }, 'cli').experiment.revision, 2);
  assert.equal((await f.controller.chat('helper', 'Change the draft instruction')).experiment.revision, 3);
  const result = f.command('ngi_validate');
  assert.equal(result.experiment.validation.valid, true);
  assert.equal(result.experiment.validation.readyToRun, true);
  assert.deepEqual(f.calls, ['helper']); assert(f.reads.length && f.reads.every(id => id === 'bmoc-subject'));
  assert.equal(JSON.stringify(f.status.agents), before);
  assert.deepEqual(f.status.gateways.g.assignedAgentIds, ['subject']);
  assert.deepEqual(f.status.gateways.g.ktEmulator, { baseUrl: 'http://127.0.0.1:8000' });
});
test('portable manifest roundtrip excludes local identities and provenance links canonical hash', () => {
  const f = fixture(); f.command('ngi_configure', { patch: completePatch() });
  const saved = f.command('ngi_save_manifest').manifest;
  assert.deepEqual(Object.keys(saved), ['schemaVersion','experimentId','definition']);
  for (const value of ['deployment-A','bmoc-subject','rwkv7-model','127.0.0.1','subjectAgentId']) assert(!JSON.stringify(saved).includes(value));
  assert.deepEqual(config.loadManifest(saved), saved);
  assert.equal(config.hash(saved), config.hash({ definition: saved.definition, experimentId: saved.experimentId, schemaVersion: saved.schemaVersion }));
  const v = f.command('ngi_validate').experiment.validationRecord;
  assert.equal(v.provenance.sessionId, 'bmoc-subject'); assert.equal(v.provenance.manifestSha256, config.hash(saved));
  const loaded = f.command('ngi_load_manifest', { manifest: saved }).experiment;
  assert.equal(loaded.revision, 2); assert.equal(loaded.status, 'draft'); assert.equal(loaded.applied, false);
  assert.equal(loaded.source.agentId, 'subject'); assert.equal(loaded.validationRecord, null);
});
test('drive modes survive shared manifests and legacy manifests retain single-instruction behavior',async () => {
  const f=fixture();
  f.command('ngi_configure',{ patch:{ ...completePatch(),drive:{ ...completePatch().drive,mode:'read-feedback' } } });
  const saved=f.command('ngi_save_manifest').manifest;
  assert.equal(config.loadManifest(saved).definition.drive.mode,'read-feedback');
  assert.equal(f.command('ngi_configure',{ patch:{ drive:{ mode:'single-instruction' } } },'cli').experiment.definition.drive.mode,'single-instruction');
  f.setContract({ target:'ngi-experiment',action:'ngi_configure_drive',params:{ mode:'read-feedback',positiveInstruction:'FH',negativeInstruction:'RL',noise:0 } });
  assert.equal((await f.controller.chat('helper','Use read plus feedback')).experiment.definition.drive.mode,'read-feedback');
  const legacy=JSON.parse(JSON.stringify(saved)); delete legacy.definition.drive.mode;
  assert.equal(config.loadManifest(legacy).definition.drive.mode,'single-instruction');
  assert.throws(()=>config.merge(config.defaults(),{ drive:{ mode:'guess' } }),/drive mode/);
});
test('explicit Apply freezes validated definition; edits require re-Apply before Arm/Start', async () => {
  const f = fixture(); assert.equal(f.command('ngi_apply').success, false);
  f.command('ngi_configure', { patch: completePatch() });
  const applied = f.command('ngi_apply').experiment;
  assert.equal(applied.status, 'applied'); assert.equal(applied.appliedRevision, 1); assert.equal(applied.running, false);
  assert.equal(applied.validation.readyToRun, true);
  f.command('ngi_configure', { patch: { projection: { seed: 99 } } });
  const edited = f.controller.inspect('g').experiment;
  assert.equal(edited.status, 'draft'); assert.equal(edited.appliedManifest.definition.projection.seed, 42);
  for (const action of ['ngi_arm','ngi_start']) assert.match((await f.command(action)).error, /Apply/);
  assert.equal((await f.command('ngi_stop')).experiment.status, 'stopped');
  const results = f.command('ngi_results'); assert.deepEqual(results.results, []); assert.equal(results.provenance.configRevision, 2);
  assert.equal(f.calls.length, 0);
});
test('all helper transitions blocked; model identity fields cannot authorize UI/CLI actions', async () => {
  const f = fixture();
  for (const action of ['ngi_apply','ngi_arm','ngi_start','ngi_stop']) {
    f.setContract({ target: 'ngi-experiment', action, params: {} });
    assert.match((await f.controller.chat('helper', 'Change lifecycle')).error, /explicit user action/);
  }
  assert.equal(f.controller.command('g', 'ngi_inspect', {}, { kind: 'helper', agentId: 'subject', surface: 'ui' }).success, false);
  assert.equal(f.command('ngi_configure', { patch: completePatch(), agentId: 'helper' }).success, false);
});
test('stale UI edits and late helper responses cannot overwrite concurrent CLI edits', async () => {
  const f = fixture();
  let release; f.hold(new Promise(resolve => { release = resolve; }));
  const waiting = f.controller.chat('helper', 'Change draft');
  while (!f.calls.length) await new Promise(resolve => setImmediate(resolve));
  f.command('ngi_configure', { patch: { projection: { seed: 9 } }, expectedRevision: 0 }, 'cli');
  release(); assert.match((await waiting).error, /Draft changed/);
  assert.match(f.command('ngi_configure', { patch: completePatch(), expectedRevision: 0 }).error, /revision changed/);
  assert.equal(f.controller.inspect('g').experiment.definition.projection.seed, 9);
  assert.equal(f.controller.inspect('g').experiment.revision, 1);
});
test('pipeline persistence retains definition and separate subject binding but discards applied/runtime lifetime', () => {
  const f = fixture(); f.command('ngi_configure', { patch: completePatch() }); f.command('ngi_apply');
  const pipeline = f.controller.pipelineConfig({ items: [{ type: 'gateway', id: 'g', assignedAgentIds: ['subject'] }] });
  assert.deepEqual(pipeline.items[0].ngiExperiment.definition.projection, { id: 'seeded-rademacher', version: '1', seed: 42 });
  assert.equal(pipeline.items[0].ngiSubjectAgentId, 'subject');
  f.status.id = 'deployment-B'; const next = f.controller.inspect('g').experiment;
  assert.equal(next.revision, 0); assert.equal(next.applied, false); assert.equal(next.status, 'draft');
  assert.equal(next.definition.projection.seed, 42); assert.deepEqual(next.events, []);
  const fields = require('./moe-kt-emulator').deployFields({ ...pipeline.items[0], ktEmulator: { baseUrl: 'http://127.0.0.1:8000' } });
  assert.deepEqual(fields.ngiExperiment, pipeline.items[0].ngiExperiment); assert.deepEqual(fields.assignedAgentIds, ['subject']);
});
test('strict manifest/parameter validation rejects machine-specific fields, expressions and incomplete reset settings', () => {
  const f = fixture(); const saved = f.command('ngi_save_manifest').manifest;
  for (const value of [{ ...saved, sessionId: 'machine' }, { ...saved, schemaVersion: '2' },
    { ...saved, definition: { ...saved.definition, endpoint: 'http://model' } }]) assert.equal(f.command('ngi_load_manifest', { manifest: value }).success, false);
  for (const patch of [{ mapping: { parameters: { expression: 'x*2' } } }, { projection: { seed: -1 } },
    { reset: { emulatorSettings: {} } }, { logging: { fields: ['native-tensors'] } }]) assert.equal(f.command('ngi_configure', { patch }).success, false);
  assert.equal(f.controller.inspect('g').experiment.revision, 0);
});
test('Gateway editor uses shared controller, stages imports and retains manual controls', async () => {
  const f = fixture(); const alerts = [];
  const sandbox = { window: { modelOrderingState: { moeItems: [{ type: 'gateway', id: 'g' }] }, electronAPI: {
    commandMoENgiExperiment: async (id, action, params) => f.command(action, JSON.parse(JSON.stringify(params))),
    getMoENgiExperiment: async () => f.controller.inspect('g')
  } }, escapeBinding: value => String(value).replaceAll('<','&lt;'), renderModelOrdering() {}, alert: msg => alerts.push(msg), console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../src/renderer/renderer-developer/moe-kt-gateway.js'), 'utf8'), sandbox);
  await sandbox.window.refreshNgiDraft('g');
  let html = sandbox.window.renderNgiExperimentEditor({ id: 'g' });
  for (const label of ['Subject Agent','Projection seed','Delta mode','Numeric mapping','Positive instruction','Negative instruction','Model reset policy','Logging','Save manifest','Load manifest']) assert(html.includes(label));
  assert.match(html, /disabled[\s\S]*Validate required capabilities/);
  sandbox.window.updateNgiExperimentField('g','projection','seed','8','number');
  await sandbox.window.submitNgiExperimentEdits('g'); assert.equal(f.controller.inspect('g').experiment.revision, 1);
  const saved = f.command('ngi_save_manifest').manifest;
  await sandbox.window.loadNgiManifest('g', { size: 100, text: async () => JSON.stringify(saved) });
  assert.equal(f.controller.inspect('g').experiment.revision, 1);
  assert(sandbox.window.renderNgiExperimentEditor({ id: 'g' }).includes('Load into draft'));
  await sandbox.window.confirmNgiManifestImport('g'); assert.equal(f.controller.inspect('g').experiment.revision, 2);
  sandbox.window.updateNgiExperimentField('g','mapping','parameters','bad json','json');
  sandbox.window.updateNgiExperimentField('g','projection','seed','9','number');
  await sandbox.window.submitNgiExperimentEdits('g'); assert.equal(alerts.length, 1); assert.equal(f.controller.inspect('g').experiment.revision, 2);
  sandbox.window.discardNgiExperimentEdits('g');
  html = sandbox.window.renderKtGatewayDetails({ id: 'g', ktEmulator: {}, assignedAgentIds: [] });
  for (const label of ['Read State','Evaluate','Reset Emulator']) assert(html.includes(label));
});
test('authenticated local ingress and real CLI mutate the same controller; teardown removes credentials', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngi-contract-')); const f = fixture(); const releases = [];
  const tools = require('./moe-deployment-ingress')({ http,
    settingsManager: { getSettings: () => ({ relay_ingress_bind: 'localhost' }) },
    networkHost: { getPrimaryLanIpv4: () => null }, getActiveDeployment: () => f.status,
    getBmoc: () => ({ allocateCoordinatorPort: () => 0, releaseCoordinatorPort: port => releases.push(port) }),
    getCoordinatorBridge: () => ({ routeMoEMessage: async () => ({ success: true, response: 'pipeline' }),
      ngiCommand: payload => f.command(payload.action, payload.params, 'cli') }), setIngress() {} });
  const ingress = await tools.deployIngressIfConfigured(path.join(dir, 'launcher'));
  const connection = path.join(dir, 'config/relay/ngi-management.json');
  t.after(async () => { await tools.closeIngressServer(ingress.server, ingress.port); fs.rmSync(dir, { recursive: true, force: true }); });
  const descriptor = JSON.parse(fs.readFileSync(connection)); assert.equal(fs.statSync(connection).mode & 0o777, 0o600);
  const send = (body, headers = {}) => fetch(descriptor.url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  assert.equal((await send({ action: 'ngi_inspect' })).status, 403);
  const auth = { Authorization: `Bearer ${descriptor.token}` };
  assert.equal((await send({ action: 'ngi_inspect' }, { ...auth, Origin: 'http://malicious' })).status, 403);
  assert.equal((await send({ action: 'ngi_inspect', actor: { kind: 'user' } }, auth)).status, 400);
  const cli = path.join(__dirname, 'moe-ngi-cli.js');
  const run = async args => JSON.parse((await execFile(process.execPath, [cli, ...args, '--gateway','g','--connection',connection])).stdout);
  assert.equal((await run(['configure','--params',JSON.stringify(completePatch()),'--expected-revision','0'])).experiment.revision, 1);
  f.command('ngi_configure', { patch: { projection: { seed: 55 } } });
  assert.equal((await run(['inspect'])).experiment.revision, 2);
  await f.controller.chat('helper', 'Use RF'); assert.equal((await run(['status'])).experiment.revision, 3);
  const outfile = path.join(dir, 'manifest.json'); await run(['save','--output',outfile]);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(outfile))), ['schemaVersion','experimentId','definition']);
  assert.equal((await run(['load','--file',outfile])).experiment.revision, 4);
  const resultfile = path.join(dir, 'results.json'); await run(['results','--output',resultfile]);
  assert.equal(JSON.parse(fs.readFileSync(resultfile)).provenance.sessionId, 'bmoc-subject');
  await assert.rejects(execFile(process.execPath, [cli,'start','--gateway','g','--connection',connection]), err => err.code === 1 && /Apply/.test(JSON.parse(err.stdout).error));
  const health = await fetch(descriptor.url.replace('/v1/ngi','/health')); assert.equal(health.status, 200);
  const chat = await fetch(descriptor.url.replace('/v1/ngi','/v1/chat'), { method: 'POST', body: JSON.stringify({ message: 'hello' }) });
  assert.equal((await chat.json()).response, 'pipeline');
  await tools.closeIngressServer(ingress.server, ingress.port); assert.equal(fs.existsSync(connection), false); assert(releases.length);
});
