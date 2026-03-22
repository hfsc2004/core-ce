/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { getCurrentPlatformKey } = require('./binary-manager-platform');

function hasCommand(cmd, args = []) {
  try {
    execFileSync(cmd, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function verifyCudaConfigured(cachePath) {
  try {
    if (!fs.existsSync(cachePath)) {
      return { ok: false, reason: `Missing CMake cache: ${cachePath}` };
    }
    const cache = fs.readFileSync(cachePath, 'utf8');
    const cudaOn = /^GGML_CUDA:BOOL=ON$/m.test(cache);
    if (!cudaOn) {
      return { ok: false, reason: 'GGML_CUDA was not ON in CMakeCache.txt' };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message || 'Unable to read CMakeCache.txt' };
  }
}

function verifyCudaRuntimeLinked(serverPath) {
  try {
    if (!fs.existsSync(serverPath)) {
      return { ok: false, reason: `Missing llama-server binary at ${serverPath}` };
    }
    if (process.platform !== 'linux') {
      return { ok: true };
    }
    const out = execFileSync('ldd', [serverPath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const linkedCuda = /(libcuda\.so|libcudart|libcublas|libggml-cuda)/i.test(String(out || ''));
    if (!linkedCuda) {
      return { ok: false, reason: 'ldd output did not show CUDA libraries (libcuda/libcudart/libcublas)' };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message || 'Failed to inspect runtime library links' };
  }
}

function verifyExistingLlamaServerCapability(serverPath, buildProfile) {
  if (!fs.existsSync(serverPath)) {
    return { ok: false, reason: `Missing llama-server at ${serverPath}` };
  }
  if (buildProfile?.expectCuda) {
    const runtime = verifyCudaRuntimeLinked(serverPath);
    if (!runtime.ok) {
      return { ok: false, reason: runtime.reason };
    }
  }
  return { ok: true };
}

function findCudaHeaders() {
  const candidates = [
    '/usr/local/cuda/include/cuda_runtime.h',
    '/usr/local/cuda/include/cuda_runtime_api.h',
    '/usr/include/cuda_runtime.h',
    '/usr/include/cuda_runtime_api.h'
  ];
  return candidates.some((p) => fs.existsSync(p));
}

function findCudaRuntimeLibs() {
  const fsCandidates = [
    '/usr/local/cuda/lib64/libcudart.so',
    '/usr/local/cuda/lib64/libcudart.so.12',
    '/usr/local/cuda/lib64/libcublas.so',
    '/usr/local/cuda/lib64/libcublas.so.12'
  ];
  if (fsCandidates.some((p) => fs.existsSync(p))) {
    return { ok: true };
  }
  try {
    const out = execFileSync('ldconfig', ['-p'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const txt = String(out || '');
    const hasCudart = /libcudart\.so/i.test(txt);
    const hasCublas = /libcublas\.so/i.test(txt);
    if (hasCudart && hasCublas) {
      return { ok: true };
    }
    return { ok: false, reason: 'CUDA runtime libs not found (missing libcudart/libcublas in linker cache)' };
  } catch {
    return { ok: false, reason: 'Unable to verify CUDA runtime libs (ldconfig unavailable and no libs in /usr/local/cuda/lib64)' };
  }
}

function runCudaPreflight() {
  const reasons = [];

  if (!hasCommand('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'])) {
    reasons.push('nvidia-smi not found or no NVIDIA GPU reported');
  }
  if (!hasCommand('nvcc', ['--version'])) {
    reasons.push('nvcc not found in PATH (CUDA toolkit not installed or PATH not configured)');
  }
  if (!findCudaHeaders()) {
    reasons.push('CUDA headers not found (expected cuda_runtime.h / cuda_runtime_api.h)');
  }

  const libCheck = findCudaRuntimeLibs();
  if (!libCheck.ok) {
    reasons.push(libCheck.reason);
  }

  return { ok: reasons.length === 0, reasons };
}

function runBuildToolchainPreflight() {
  const reasons = [];
  if (!hasCommand('cmake', ['--version'])) {
    reasons.push('cmake not found in PATH');
  }
  const hasCompiler =
    hasCommand('c++', ['--version']) ||
    hasCommand('g++', ['--version']) ||
    hasCommand('clang++', ['--version']);
  if (!hasCompiler) {
    reasons.push('C++ compiler not found in PATH (c++ / g++ / clang++)');
  }
  return { ok: reasons.length === 0, reasons };
}

function runRocmPreflight() {
  const reasons = [];
  const hasAnyProbe =
    hasCommand('rocm-smi', ['--showproductname']) ||
    hasCommand('rocminfo', []) ||
    hasCommand('hipcc', ['--version']);

  if (!hasAnyProbe) {
    reasons.push('ROCm tools not found (expected one of: rocm-smi, rocminfo, hipcc)');
  }
  if (!hasCommand('hipcc', ['--version'])) {
    reasons.push('hipcc not found in PATH (ROCm compiler toolchain missing)');
  }
  return { ok: reasons.length === 0, reasons };
}

function runVulkanPreflight() {
  const reasons = [];
  if (!hasCommand('vulkaninfo', ['--summary'])) {
    reasons.push('vulkaninfo not found or Vulkan ICD/device not visible');
  }
  return { ok: reasons.length === 0, reasons };
}

function runNpuPreflight() {
  const reasons = [];
  const detected =
    hasCommand('npu-smi', []) ||
    hasCommand('hl-smi', []) ||
    fs.existsSync('/dev/npu0') ||
    fs.existsSync('/dev/accel') ||
    fs.existsSync('/dev/apex_0') ||
    fs.existsSync('/sys/class/misc/apex_0');
  if (!detected) {
    reasons.push('No known NPU tooling or device node detected (npu-smi/hl-smi,/dev/npu0,/dev/accel)');
  }
  return { ok: reasons.length === 0, reasons };
}

function detectLlamaCppAcceleratorCapabilities() {
  const platform = process.platform;
  const arch = process.arch;

  const cudaDetected = hasCommand('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader']);
  const rocmSmiDetected = hasCommand('rocm-smi', ['--showproductname']);
  const rocminfoDetected = hasCommand('rocminfo', []);
  const hipccDetected = hasCommand('hipcc', ['--version']);
  const rocmDetected = rocmSmiDetected || rocminfoDetected || hipccDetected;
  const vulkanInfoDetected = hasCommand('vulkaninfo', ['--summary']);
  const npuSmiDetected = hasCommand('npu-smi', []);
  const habanaSmiDetected = hasCommand('hl-smi', []);
  const npuDeviceDetected =
    fs.existsSync('/dev/npu0') ||
    fs.existsSync('/dev/accel') ||
    fs.existsSync('/dev/apex_0') ||
    fs.existsSync('/sys/class/misc/apex_0');
  const npuDetected = npuSmiDetected || habanaSmiDetected || npuDeviceDetected;

  return {
    platform,
    arch,
    cuda: {
      detected: cudaDetected,
      supportedNow: cudaDetected && platform === 'linux' && arch === 'x64'
    },
    rocm: {
      detected: rocmDetected,
      supportedNow: false,
      probes: { rocmSmi: rocmSmiDetected, rocminfo: rocminfoDetected, hipcc: hipccDetected }
    },
    vulkan: {
      detected: vulkanInfoDetected,
      supportedNow: false,
      probes: { vulkaninfo: vulkanInfoDetected }
    },
    npu: {
      detected: npuDetected,
      supportedNow: false,
      probes: { npuSmi: npuSmiDetected, hlSmi: habanaSmiDetected, deviceNode: npuDeviceDetected }
    }
  };
}

function detectLlamaCppBuildProfile() {
  const platform = process.platform;
  const arch = process.arch;
  const caps = detectLlamaCppAcceleratorCapabilities();

  if (!(platform === 'linux' && arch === 'x64')) {
    return {
      label: 'CPU-only',
      cmakeFlags: [],
      expectCuda: false,
      requireCuda: false,
      accelerator: 'cpu',
      capabilities: caps,
      notice: caps.rocm.detected
        ? 'ROCm detected (stubbed for future backend); current profile remains CPU-only on this platform.'
        : ''
    };
  }

  if (caps.cuda.detected) {
    return {
      label: 'CUDA-enabled',
      cmakeFlags: ['-D', 'GGML_CUDA=ON'],
      expectCuda: true,
      requireCuda: true,
      accelerator: 'cuda',
      capabilities: caps,
      notice: ''
    };
  }

  if (caps.rocm.detected) {
    return {
      label: 'CPU-only (ROCm detected; backend stubbed)',
      cmakeFlags: [],
      expectCuda: false,
      requireCuda: false,
      accelerator: 'cpu',
      capabilities: caps,
      notice: 'ROCm/HIP capability detected. ROCm backend is stubbed and not yet enabled in Build.'
    };
  }

  if (caps.vulkan.detected) {
    return {
      label: 'CPU-only (Vulkan detected; backend stubbed)',
      cmakeFlags: [],
      expectCuda: false,
      requireCuda: false,
      accelerator: 'cpu',
      capabilities: caps,
      notice: 'Vulkan capability detected. Vulkan backend is stubbed and not yet enabled in Build.'
    };
  }

  return {
    label: 'CPU-only',
    cmakeFlags: [],
    expectCuda: false,
    requireCuda: false,
    accelerator: 'cpu',
    capabilities: caps,
    notice: ''
  };
}

function runLlamaCppBuildPreflight(fromPath = null) {
  const platform = process.platform;
  const arch = process.arch;
  const platformKey = getCurrentPlatformKey();
  const caps = detectLlamaCppAcceleratorCapabilities();
  const profile = detectLlamaCppBuildProfile();

  const toolchain = runBuildToolchainPreflight();
  const cuda = runCudaPreflight();
  const rocm = runRocmPreflight();
  const vulkan = runVulkanPreflight();
  const npu = runNpuPreflight();

  let sourcePresent = false;
  let sourcePath = '';
  if (fromPath) {
    try {
      const projectRoot = path.join(fromPath, '..');
      sourcePath = path.join(projectRoot, 'binaries', 'llama.cpp', platformKey, 'CMakeLists.txt');
      sourcePresent = fs.existsSync(sourcePath);
    } catch {
      sourcePresent = false;
    }
  }

  const selected = {
    accelerator: profile.accelerator || 'cpu',
    label: profile.label || 'CPU-only',
    ok: true,
    reasons: []
  };

  if (!toolchain.ok) {
    selected.ok = false;
    selected.reasons.push(...toolchain.reasons);
  }
  if (profile.requireCuda && !cuda.ok) {
    selected.ok = false;
    selected.reasons.push(...cuda.reasons);
  }

  const backendStatus = {
    cpu: { detected: true, buildSupportedNow: true, ok: toolchain.ok, reasons: [...toolchain.reasons] },
    cuda: {
      detected: !!caps?.cuda?.detected,
      buildSupportedNow: platform === 'linux' && arch === 'x64',
      ok: toolchain.ok && cuda.ok,
      reasons: [...toolchain.reasons, ...cuda.reasons]
    },
    rocm: {
      detected: !!caps?.rocm?.detected,
      buildSupportedNow: false,
      ok: false,
      reasons: [...toolchain.reasons, ...rocm.reasons, 'ROCm backend is currently stubbed in this build path (not enabled yet).']
    },
    vulkan: {
      detected: !!caps?.vulkan?.detected,
      buildSupportedNow: false,
      ok: false,
      reasons: [...toolchain.reasons, ...vulkan.reasons, 'Vulkan backend is currently stubbed in this build path (not enabled yet).']
    },
    npu: {
      detected: !!caps?.npu?.detected,
      buildSupportedNow: false,
      ok: false,
      reasons: [...toolchain.reasons, ...npu.reasons, 'NPU backend is currently stubbed in this build path (not enabled yet).']
    }
  };

  return {
    success: true,
    platform,
    arch,
    platformKey,
    sourcePresent,
    sourcePath,
    profile,
    capabilities: caps,
    toolchain,
    backends: backendStatus,
    selected
  };
}


module.exports = {
  hasCommand,
  verifyCudaConfigured,
  verifyCudaRuntimeLinked,
  verifyExistingLlamaServerCapability,
  runCudaPreflight,
  runBuildToolchainPreflight,
  runRocmPreflight,
  runVulkanPreflight,
  runNpuPreflight,
  detectLlamaCppAcceleratorCapabilities,
  detectLlamaCppBuildProfile,
  runLlamaCppBuildPreflight
};
