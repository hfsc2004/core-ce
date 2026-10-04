'use strict';
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execute = promisify(execFile);
const settingsManager = require('./settings-manager');
const { getCurrentPlatformKey } = require('./binary-manager/binary-manager-platform');
const DEFAULT_POLICY = { mode: 'auto', device_ids: [], build_mode: 'all', custom_cuda_architectures: '' };
const cache = new Map();

function normalize(policy = {}) {
  const mode = policy.mode || 'auto', build = policy.build_mode || 'all';
  if (!['auto', 'selected', 'all', 'cpu'].includes(mode)) throw new Error('Invalid AI device mode.');
  if (!['all', 'selected', 'custom'].includes(build)) throw new Error('Invalid CUDA build target mode.');
  const ids = [...new Set((policy.device_ids || []).map(String))];
  if (mode === 'selected' && !ids.length) throw new Error('Select at least one AI GPU, or choose CPU only.');
  if (ids.some(id => !id || /[\x00-\x1f,]/.test(id))) throw new Error('Invalid AI device identifier.');
  const custom = String(policy.custom_cuda_architectures || '').trim();
  if (build === 'custom' && !/^\d{2,3}[af]?(?:-(?:real|virtual))?(?:;\d{2,3}[af]?(?:-(?:real|virtual))?)*$/.test(custom)) throw new Error('Enter CUDA architecture targets separated by semicolons, such as 86;89.');
  return { mode, device_ids: ids, build_mode: build, custom_cuda_architectures: custom };
}
function read(appDir) { return normalize(settingsManager.loadSettings(appDir).ai_devices || DEFAULT_POLICY); }
function fingerprint(policy) { const p = normalize(policy); return JSON.stringify({ mode: p.mode, ids: p.mode === 'selected' ? p.device_ids : [] }); }
function parseNvidia(text) {
  return text.split(/\r?\n/).filter(Boolean).flatMap(line => {
    const [index, name, memory, uuid, compute] = line.split(',').map(s => s.trim());
    if (!/^GPU-[a-f\d-]+$/i.test(uuid || '')) return [];
    return [{ id: uuid, uuid, index: Number(index), name, memory_mb: Number(memory), backend: 'CUDA',
      compute_capability: /^\d+\.\d+$/.test(compute || '') ? compute : null }];
  });
}
function parseLlamaDevices(text) {
  return text.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^\s*([A-Za-z][\w.-]*\d*):\s+(.+?)\s*\((\d+)\s*MiB/i);
    if (!match || /^CPU/i.test(match[1])) return [];
    const backend = match[1].replace(/\d+$/, '');
    return [{ id: `llama:${backend}:${match[2].trim()}`, runtime_name: match[1], name: match[2].trim(), backend,
      index: Number(match[1].match(/\d+$/)?.[0] || 0), memory_mb: Number(match[3]) }];
  });
}
async function inventory(appDir, refresh = false) {
  const cached = cache.get(appDir);
  if (!refresh && cached && Date.now() - cached.time < 60000) return cached.devices;
  let nvidia = [], runtime = [];
  try {
    const result = await execute('nvidia-smi', ['--query-gpu=index,name,memory.total,uuid,compute_cap', '--format=csv,noheader,nounits'], { timeout: 10000 });
    nvidia = parseNvidia(result.stdout);
  } catch (_) {
    try {
      const result = await execute('nvidia-smi', ['--query-gpu=index,name,memory.total,uuid', '--format=csv,noheader,nounits'], { timeout: 10000 });
      nvidia = parseNvidia(result.stdout);
    } catch (_) {}
  }
  const root = path.join(appDir, '..', 'binaries', 'llama.cpp', getCurrentPlatformKey());
  const exe = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server';
  const binary = ['bin', 'build/bin', 'build/bin/Release'].map(dir => path.join(root, dir, exe)).find(file => fs.existsSync(file));
  if (binary) {
    try {
      const result = await execute(binary, ['--list-devices'], { timeout: 15000, env: { ...process.env, LD_LIBRARY_PATH: [path.dirname(binary), process.env.LD_LIBRARY_PATH || ''].filter(Boolean).join(path.delimiter) } });
      runtime = parseLlamaDevices(result.stdout + '\n' + result.stderr);
    } catch (_) {}
  }
  const devices = [...nvidia];
  for (const device of runtime) {
    const sameName = nvidia.filter(n => n.name.replace(/^NVIDIA\s+/i, '') === device.name.replace(/^NVIDIA\s+/i, ''));
    const match = /^CUDA/i.test(device.backend) && (sameName.length === 1 ? sameName[0] : sameName.find(n => n.index === device.index));
    if (match) match.runtime_name = device.runtime_name;
    else devices.push(device);
  }
  // Runtime names can change with enumeration order. Persist NVIDIA UUIDs and
  // backend/model identity for other devices; reject ambiguous identities.
  for (const device of devices) device.ambiguous = devices.filter(d => d.id === device.id).length > 1;
  cache.set(appDir, { time: Date.now(), devices });
  return devices;
}
function choose(policy, devices) {
  if (policy.mode !== 'selected') return policy.mode === 'all' ? devices : [];
  return policy.device_ids.map(id => {
    const matches = devices.filter(d => d.id === id);
    if (matches.length !== 1 || matches[0].ambiguous) throw new Error(`Selected AI GPU is missing or ambiguous (${id}). Select devices in Settings → Hardware; no other GPU will be substituted.`);
    return matches[0];
  });
}
function resolve(policy, devices, backend = 'llama.cpp') {
  const p = normalize(policy), key = fingerprint(p);
  if (p.mode === 'auto') return { mode: 'auto', key, env: {}, devices: [] };
  const selected = p.mode === 'cpu' ? [] : choose(p, devices);
  if (p.mode === 'all' && !selected.length) return { mode: 'cpu', key, forceCpu: true, env: { CUDA_VISIBLE_DEVICES: '-1', ROCR_VISIBLE_DEVICES: '-1', HIP_VISIBLE_DEVICES: '-1', GGML_VK_VISIBLE_DEVICES: '-1' }, devices: [] };
  if (p.mode === 'cpu') return { mode: 'cpu', key, forceCpu: true, env: { CUDA_VISIBLE_DEVICES: '-1', ROCR_VISIBLE_DEVICES: '-1', HIP_VISIBLE_DEVICES: '-1', GGML_VK_VISIBLE_DEVICES: '-1' }, devices: [] };
  const cuda = selected.filter(d => d.backend.toUpperCase() === 'CUDA');
  const unidentifiedCuda = selected.filter(d => d.backend.toUpperCase() === 'CUDA' && !d.uuid);
  if (unidentifiedCuda.length && p.mode === 'selected') throw new Error('Cannot identify the selected CUDA GPU by UUID. Check nvidia-smi and refresh the device list, or choose All detected.');
  const nonCuda = selected.filter(d => d.backend.toUpperCase() !== 'CUDA');
  const env = { CUDA_VISIBLE_DEVICES: cuda.length ? cuda.map(d => d.uuid || d.index).join(',') : '-1' };
  const vulkan = nonCuda.filter(d => /^Vulkan$/i.test(d.backend));
  const rocm = nonCuda.filter(d => /^(ROCm|HIP)$/i.test(d.backend));
  if (backend === 'ollama' || !nonCuda.length) {
    env.ROCR_VISIBLE_DEVICES = rocm.length ? rocm.map(d => d.uuid || d.index).join(',') : '-1';
    env.HIP_VISIBLE_DEVICES = rocm.length ? rocm.map(d => d.index).join(',') : '-1';
    env.GGML_VK_VISIBLE_DEVICES = vulkan.length ? vulkan.map(d => d.index).join(',') : '-1';
  }
  if (backend === 'ollama' && nonCuda.some(d => !/^(Vulkan|ROCm|HIP|Metal)$/i.test(d.backend))) throw new Error('The selected device backend is not supported by the Ollama device selector. Choose another device or Automatic.');
  // An explicit selection takes precedence over older per-terminal single-GPU defaults.
  const runtimeNames = nonCuda.length ? selected.map(d => d.backend.toUpperCase() === 'CUDA'
    ? (d.runtime_name ? d.runtime_name.replace(/\d+$/, String(cuda.indexOf(d))) : undefined) : d.runtime_name) : null;
  if (runtimeNames?.some(name => !name)) throw new Error('The installed llama.cpp runtime cannot identify every selected device. Update tools or choose devices from the same backend.');
  return { mode: p.mode, key, devices: selected, env, forceCpu: false, splitMode: selected.length > 1 ? 'layer' : 'none', mainGpuIndex: 0, runtimeNames };
}
async function runtimePolicy(appDir, backend) {
  const p = read(appDir);
  return resolve(p, ['auto', 'cpu'].includes(p.mode) ? [] : await inventory(appDir), backend);
}
async function ollamaEnv(appDir, env, forceCpu = false) {
  const policy = forceCpu ? resolve({ mode: 'cpu' }, []) : await runtimePolicy(appDir, 'ollama');
  return { ...env, ...policy.env };
}
async function cudaBuildPolicy(appDir) {
  const policy = read(appDir);
  if (policy.build_mode === 'custom') return { architectures: policy.custom_cuda_architectures };
  if (policy.build_mode === 'selected' && policy.mode === 'cpu') return { cpuOnly: true };
  const devices = choose(policy.mode === 'auto' || policy.build_mode === 'all' ? { ...policy, mode: 'all' } : policy, await inventory(appDir));
  const cuda = devices.filter(d => d.backend.toUpperCase() === 'CUDA');
  if (!cuda.length) return { cpuOnly: true };
  if (cuda.some(d => !d.compute_capability)) {
    if (policy.build_mode === 'all') return { architectures: 'native' };
    throw new Error('Cannot detect selected GPU compute capability. Choose All detected or enter custom CUDA build targets.');
  }
  return { architectures: [...new Set(cuda.map(d => d.compute_capability.replace('.', '')))].join(';') };
}
module.exports = { DEFAULT_POLICY, normalize, read, fingerprint, parseNvidia, parseLlamaDevices, inventory, choose, resolve, runtimePolicy, ollamaEnv, cudaBuildPolicy };
