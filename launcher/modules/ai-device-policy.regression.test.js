'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { EventEmitter } = require('events');
const policy = require('./ai-device-policy');
const devices = policy.parseNvidia('0, Quadro M5000, 8192, GPU-aaaa, 5.2\n1, Tesla P4, 8192, GPU-bbbb, 6.1');
const selected = ids => ({ mode: 'selected', device_ids: ids });

test('P4 selection excludes desktop GPU using a persistent UUID', () => {
  const result = policy.resolve(selected(['GPU-bbbb']), devices);
  assert.equal(result.env.CUDA_VISIBLE_DEVICES, 'GPU-bbbb');
  assert.equal(result.splitMode, 'none');
  const reordered = devices.map(d => ({ ...d, index: 1 - d.index })).reverse();
  assert.equal(policy.resolve(selected(['GPU-bbbb']), reordered).env.CUDA_VISIBLE_DEVICES, 'GPU-bbbb');
});
test('multiple selected GPUs override a single-card layout', () => {
  const result = policy.resolve(selected(['GPU-bbbb', 'GPU-aaaa']), devices);
  assert.equal(result.env.CUDA_VISIBLE_DEVICES, 'GPU-bbbb,GPU-aaaa');
  assert.equal(result.splitMode, 'layer');
  assert.equal(result.mainGpuIndex, 0);
});
test('All allows any number of CUDA cards and new GPU architectures', () => {
  const many = Array.from({ length: 8 }, (_, i) => ({ ...devices[0], id: `GPU-${i}`, uuid: `GPU-${i}`, compute_capability: '12.0' }));
  const result = policy.resolve({ mode: 'all' }, many);
  assert.equal(result.devices.length, 8);
  assert.equal(result.env.CUDA_VISIBLE_DEVICES, many.map(d => d.uuid).join(','));
  assert.equal(result.splitMode, 'layer');
});
test('missing or ambiguous selections fail instead of substituting another card', () => {
  assert.throws(() => policy.resolve(selected(['GPU-missing']), devices), /missing or ambiguous/);
  assert.throws(() => policy.resolve(selected(['GPU-bbbb']), [devices[1], devices[1]]), /missing or ambiguous/);
  assert.throws(() => policy.normalize(selected([])), /at least one/);
});
test('CPU disables accelerator backends; All without GPUs falls back to CPU', () => {
  for (const result of [policy.resolve({ mode: 'cpu' }, devices), policy.resolve({ mode: 'all' }, [])]) {
    assert.equal(result.forceCpu, true);
    for (const key of ['CUDA_VISIBLE_DEVICES', 'ROCR_VISIBLE_DEVICES', 'HIP_VISIBLE_DEVICES', 'GGML_VK_VISIBLE_DEVICES']) assert.equal(result.env[key], '-1');
  }
});
test('Automatic preserves existing runtime environment decisions', () => {
  assert.deepEqual(policy.resolve({ mode: 'auto' }, devices).env, {});
});
test('All still permits CUDA devices when nvidia-smi is unavailable', () => {
  const found = policy.parseLlamaDevices('CUDA0: Card A (24576 MiB)\nCUDA1: Card B (24576 MiB)');
  assert.equal(policy.resolve({ mode: 'all' }, found).env.CUDA_VISIBLE_DEVICES, '0,1');
  assert.throws(() => policy.resolve(selected([found[0].id]), found), /UUID/);
});
test('backend discovery uses installed runtime output, including non-CUDA cards', () => {
  const found = policy.parseLlamaDevices('Available devices:\n  CUDA0: Tesla P4 (8192 MiB, 7000 MiB free)\n  Vulkan1: Radeon RX 7900 (24576 MiB)\n  Metal: Apple M3 (16384 MiB)\n  CPU: CPU (64000 MiB)');
  assert.deepEqual(found.map(d => d.backend), ['CUDA', 'Vulkan', 'Metal']);
  const result = policy.resolve(selected([found[1].id]), found);
  assert.deepEqual(result.runtimeNames, ['Vulkan1']);
  assert.equal(result.env.CUDA_VISIBLE_DEVICES, '-1');
});
test('mixed backends map CUDA device names after UUID masking', () => {
  const vulkan = { id: 'amd', name: 'AMD', backend: 'Vulkan', index: 1, runtime_name: 'Vulkan1' };
  const result = policy.resolve(selected(['GPU-bbbb', 'amd']), [...devices.map(d => ({ ...d, runtime_name: `CUDA${d.index}` })), vulkan]);
  assert.deepEqual(result.runtimeNames, ['CUDA0', 'Vulkan1']);
});
test('Ollama receives all selected cards and masks unselected backends', () => {
  const result = policy.resolve(selected(devices.map(d => d.id)), devices, 'ollama');
  assert.equal(result.env.CUDA_VISIBLE_DEVICES, 'GPU-aaaa,GPU-bbbb');
  assert.equal(result.env.ROCR_VISIBLE_DEVICES, '-1');
  assert.equal(result.env.GGML_VK_VISIBLE_DEVICES, '-1');
});
test('custom build targets accept future architectures and reject injected flags', () => {
  assert.equal(policy.normalize({ build_mode: 'custom', custom_cuda_architectures: '86;89;120a' }).custom_cuda_architectures, '86;89;120a');
  assert.throws(() => policy.normalize({ build_mode: 'custom', custom_cuda_architectures: '61;--other-flag' }), /architecture targets/);
});

function loadWithMocks(file, mocks) {
  const absolute = path.join(__dirname, file), module = { exports: {} };
  const localRequire = require('module').createRequire(absolute);
  const context = { module, exports: module.exports, require: name => mocks[name] || localRequire(name), __dirname: path.dirname(absolute), process, console, Buffer, setTimeout, clearTimeout };
  vm.runInNewContext(fs.readFileSync(absolute, 'utf8'), context, { filename: absolute });
  return module.exports;
}
test('build targets follow selected cards, all cards, custom targets, and CPU', async () => {
  let saved = { ...selected(['GPU-bbbb']), build_mode: 'selected' };
  const mocked = loadWithMocks('ai-device-policy.js', {
    './settings-manager': { loadSettings: () => ({ ai_devices: saved }) },
    child_process: { execFile: (_exe, _args, _options, callback) => callback(null, { stdout: '0, Quadro M5000, 8192, GPU-aaaa, 5.2\n1, Tesla P4, 8192, GPU-bbbb, 6.1', stderr: '' }) }
  });
  assert.equal((await mocked.cudaBuildPolicy('/tmp/no-app')).architectures, '61');
  saved.build_mode = 'all';
  assert.equal((await mocked.cudaBuildPolicy('/tmp/no-app')).architectures, '52;61');
  saved = { mode: 'cpu', build_mode: 'selected' };
  assert.equal((await mocked.cudaBuildPolicy('/tmp/no-app')).cpuOnly, true);
  saved = { mode: 'all', build_mode: 'custom', custom_cuda_architectures: '89;120' };
  assert.equal((await mocked.cudaBuildPolicy('/tmp/no-app')).architectures, '89;120');
});

for (const mode of ['selected', 'all', 'cpu']) test(`llama-server launch honors ${mode} over legacy single-GPU options`, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-device-launch-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = path.join(root, 'launcher'); fs.mkdirSync(app);
  const platform = process.platform === 'darwin' ? `macos-${process.arch === 'arm64' ? 'arm' : 'intel'}` : `${process.platform === 'win32' ? 'windows' : 'linux'}-${process.arch}`;
  const bin = path.join(root, 'binaries', 'llama.cpp', platform, 'bin'); fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'), 'fixture');
  const model = path.join(root, 'model.gguf'); fs.writeFileSync(model, 'fixture');
  let spawned;
  const saved = mode === 'selected' ? selected(['GPU-bbbb', 'GPU-aaaa']) : { mode };
  const resolved = policy.resolve(saved, devices);
  const manager = loadWithMocks('llama-cpp-manager.js', {
    fs: { ...fs, createWriteStream: () => ({ write() {}, end() {} }) },
    './ai-device-policy': { ...policy, read: () => saved, runtimePolicy: async () => resolved },
    child_process: { execFileSync: () => 'libggml-cuda.so', spawn: (exe, args, options) => {
      spawned = { exe, args, options };
      const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.pid = 12345;
      t.after(async () => { child.emit('exit', 0); await new Promise(resolve => setImmediate(resolve)); });
      return child;
    } },
    http: { get: (_url, callback) => { callback({ resume() {}, statusCode: 200 }); const req = new EventEmitter(); req.setTimeout = () => {}; return req; } }
  });
  const result = await manager.startLlamaServerOnPort(app, { port: 50001, modelPath: model, gpuLayers: 99, splitMode: 'none', mainGpuIndex: 1, cudaVisibleDevices: 'GPU-old' });
  assert.equal(spawned.options.env.CUDA_VISIBLE_DEVICES, resolved.env.CUDA_VISIBLE_DEVICES);
  assert.equal(result.aiDevicePolicyKey, resolved.key);
  if (mode === 'cpu') {
    assert.equal(result.gpuLayers, 0);
    assert.equal(spawned.args[spawned.args.indexOf('--device') + 1], 'none');
  } else {
    assert.equal(spawned.args[spawned.args.indexOf('--split-mode') + 1], 'layer');
    assert.equal(result.mainGpuIndex, 0);
  }
});

function hardwareEditor(saved = selected(['GPU-bbbb'])) {
  const elements = new Map();
  const create = () => ({ value: '', checked: false, children: [], style: {}, append(...items) { this.children.push(...items); }, appendChild(item) { this.children.push(item); }, replaceChildren() { this.children = []; } });
  const element = id => { if (!elements.has(id)) elements.set(id, create()); return elements.get(id); };
  let submitted;
  const context = vm.createContext({ document: { getElementById: element, createElement: create }, window: { electronAPI: {
    getAiDeviceSettings: async () => ({ success: true, policy: policy.normalize(saved), devices }),
    setAiDeviceSettings: async input => { submitted = input; return { success: true }; }
  } } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/renderer/renderer-developer/settings-modal-hardware.js'), 'utf8'), context);
  return { element, run: code => vm.runInContext(code, context), submitted: () => submitted };
}
test('Hardware UI can select and save all cards without a count limit', async () => {
  const ui = hardwareEditor(); await ui.run('loadAiDeviceSettings()');
  ui.run('selectAllAiDevices()');
  assert.equal(ui.element('settings-ai-device-mode').value, 'all');
  assert.equal(ui.element('settings-ai-device-list').children.every(label => label.children[0].checked), true);
  await ui.run('saveAiDeviceSettings()');
  assert.equal(ui.submitted().mode, 'all');
  assert.equal(ui.submitted().device_ids.length, 2);
});
test('Hardware UI allows one or multiple checked cards in selected mode', async () => {
  const ui = hardwareEditor(); await ui.run('loadAiDeviceSettings()');
  const inputs = ui.element('settings-ai-device-list').children.map(label => label.children[0]);
  assert.equal(inputs[0].checked, false); assert.equal(inputs[1].checked, true);
  inputs[0].checked = true; await ui.run('saveAiDeviceSettings()');
  assert.equal(ui.submitted().mode, 'selected'); assert.equal(ui.submitted().device_ids.length, 2);
});
test('Hardware UI offers CPU mode and custom build targets independently', async () => {
  const ui = hardwareEditor(); await ui.run('loadAiDeviceSettings()');
  ui.element('settings-ai-device-mode').value = 'cpu';
  ui.element('settings-ai-build-mode').value = 'custom';
  ui.element('settings-ai-build-custom').value = '89;120';
  ui.run('updateAiDeviceControls()');
  assert.equal(ui.element('settings-ai-build-custom-row').hidden, false);
  await ui.run('saveAiDeviceSettings()');
  assert.equal(ui.submitted().mode, 'cpu'); assert.equal(ui.submitted().device_ids.length, 0);
  assert.equal(ui.submitted().custom_cuda_architectures, '89;120');
});
