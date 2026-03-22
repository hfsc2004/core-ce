/**
 * Local Transformers runtime/bootstrap/package helpers.
 */
const common = require('./local-transformers-common');

function resolveBootstrapPythonCandidate(options = {}) {
  const requiresPy311Or310 = options.requiresPy311Or310 === true;
  const managedPy311 = common.getManagedPython311Bin(options.appDir);
  if (managedPy311) {
    const version = common.getPythonVersionInfo(managedPy311);
    if (version && version.major === 3 && version.minor <= 11) {
      if (!requiresPy311Or310 || version.minor >= 10) {
        return { path: managedPy311, version };
      }
    }
  }
  const candidates = process.platform === 'win32'
    ? ['python', 'py']
    : ['python3.11', 'python3.10', 'python3', 'python'];

  let fallback = null;
  for (const cmd of candidates) {
    const exe = common.findCommandPath(cmd);
    if (!exe) continue;
    const version = common.getPythonVersionInfo(exe);
    if (!version) continue;
    if (version.major !== 3) continue;
    if (version.minor <= 11) {
      return { path: exe, version };
    }
    if (!fallback) {
      fallback = { path: exe, version };
    }
  }

  if (!requiresPy311Or310) return fallback;
  return null;
}

async function ensureManagedPython311(appDir = '') {
  const existing = common.getManagedPython311Bin(appDir);
  if (existing) {
    const version = common.getPythonVersionInfo(existing);
    if (version && version.major === 3 && version.minor === 11) {
      return { success: true, pythonBin: existing, created: false };
    }
  }

  const uvExe = common.getUvExecutable(appDir);
  if (!uvExe) {
    return {
      success: false,
      error: 'Managed Python 3.11 bootstrap requires uv, but no uv executable was found. Build Python WebUI first.'
    };
  }

  const installResult = await common.runCommandProcess(uvExe, ['python', 'install', '3.11'], {
    timeout: 30 * 60 * 1000,
    maxBuffer: 64 * 1024 * 1024
  });
  if (installResult.status !== 0) {
    const detail = common.trimTail(`${String(installResult.stdout || '')}\n${String(installResult.stderr || '')}`, 1600);
    return { success: false, error: `uv python install 3.11 failed: ${detail}` };
  }

  const findResult = await common.runCommandProcess(uvExe, ['python', 'find', '3.11'], {
    timeout: 30000,
    maxBuffer: 2 * 1024 * 1024
  });
  if (findResult.status !== 0) {
    const detail = common.trimTail(`${String(findResult.stdout || '')}\n${String(findResult.stderr || '')}`, 1200);
    return { success: false, error: `uv python find 3.11 failed: ${detail}` };
  }

  const found = common.extractExecutableFromText(`${String(findResult.stdout || '')}\n${String(findResult.stderr || '')}`);
  if (!found) {
    return { success: false, error: 'uv python find 3.11 did not return a usable interpreter path.' };
  }

  const version = common.getPythonVersionInfo(found);
  if (!version || version.major !== 3 || version.minor !== 11) {
    return { success: false, error: `Resolved interpreter is not Python 3.11: ${found}` };
  }

  const runtimeDir = common.getManagedPython311Dir(appDir);
  common.fs.mkdirSync(runtimeDir, { recursive: true });
  const pointerPath = common.path.join(runtimeDir, common.MANAGED_PY311_POINTER_FILE);
  common.fs.writeFileSync(pointerPath, `${found}\n`, 'utf8');
  return { success: true, pythonBin: found, created: true };
}

async function runPipInstall(pythonBin, installArgs = [], timeoutMs = 10 * 60 * 1000) {
  const args = ['-m', 'pip', 'install', ...installArgs];
  const result = await common.runPythonProcess(pythonBin, args, {
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024
  });
  if (result.status !== 0) {
    const tail = common.trimTail(`${String(result.stdout || '')}\n${String(result.stderr || '')}`, 1800);
    return { success: false, error: `pip install failed (code=${result.status}) ${tail}`.trim() };
  }
  return { success: true };
}

async function probeMissingPythonModules(pythonBin, modules = []) {
  const list = Array.from(new Set((Array.isArray(modules) ? modules : []).map((m) => String(m || '').trim()).filter(Boolean)));
  if (list.length === 0) return [];
  const probeCode = [
    'import importlib.util, json',
    `mods=${JSON.stringify(list)}`,
    'missing=[m for m in mods if importlib.util.find_spec(m) is None]',
    'print(json.dumps({"missing": missing}))'
  ].join(';');
  const result = await common.runPythonProcess(pythonBin, ['-c', probeCode], {
    timeout: 20000,
    maxBuffer: 2 * 1024 * 1024
  });
  if (result.status !== 0) {
    const detail = common.trimTail(`${String(result.stdout || '')}\n${String(result.stderr || '')}`, 1200);
    throw new Error(`Python module probe failed: ${detail}`);
  }
  let parsed = {};
  try {
    parsed = JSON.parse(String(result.stdout || '').trim() || '{}');
  } catch (_err) {
    parsed = {};
  }
  return Array.isArray(parsed?.missing) ? parsed.missing.filter(Boolean) : [];
}

async function probeTorchCudaAvailable(pythonBin) {
  const probeCode = [
    'import json',
    'import torch',
    'print(json.dumps({"cuda_available": bool(torch.cuda.is_available())}))'
  ].join(';');
  const result = await common.runPythonProcess(pythonBin, ['-c', probeCode], {
    timeout: 20000,
    maxBuffer: 2 * 1024 * 1024
  });
  if (result.status !== 0) {
    return { ok: false, available: false, error: common.trimTail(`${String(result.stdout || '')}\n${String(result.stderr || '')}`, 1000) };
  }
  try {
    const parsed = JSON.parse(String(result.stdout || '').trim() || '{}');
    return { ok: true, available: parsed?.cuda_available === true, error: '' };
  } catch (err) {
    return { ok: false, available: false, error: err.message || String(err) };
  }
}

async function probeTorchInfo(pythonBin) {
  const probeCode = [
    'import json',
    'import torch',
    'print(json.dumps({',
    ' "version": str(getattr(torch, "__version__", "")),',
    ' "cuda": str(getattr(torch.version, "cuda", "") or ""),',
    ' "cuda_available": bool(torch.cuda.is_available())',
    '}))'
  ].join('\n');
  const result = await common.runPythonProcess(pythonBin, ['-c', probeCode], {
    timeout: 20000,
    maxBuffer: 2 * 1024 * 1024
  });
  if (result.status !== 0) {
    return { ok: false, version: '', cuda: '', available: false, error: common.trimTail(`${String(result.stdout || '')}\n${String(result.stderr || '')}`, 1000) };
  }
  try {
    const parsed = JSON.parse(String(result.stdout || '').trim() || '{}');
    return {
      ok: true,
      version: String(parsed?.version || ''),
      cuda: String(parsed?.cuda || ''),
      available: parsed?.cuda_available === true,
      error: ''
    };
  } catch (err) {
    return { ok: false, version: '', cuda: '', available: false, error: err.message || String(err) };
  }
}

async function probeDiaTransformersAvailable(pythonBin) {
  const probeCode = [
    'import json',
    'ok=True',
    'try:',
    ' from transformers import DiaForConditionalGeneration',
    'except Exception:',
    ' ok=False',
    'print(json.dumps({"ok": ok}))'
  ].join('\n');
  const result = await common.runPythonProcess(pythonBin, ['-c', probeCode], {
    timeout: 30000,
    maxBuffer: 2 * 1024 * 1024
  });
  if (result.status !== 0) return false;
  try {
    const parsed = JSON.parse(String(result.stdout || '').trim() || '{}');
    return parsed?.ok === true;
  } catch (_err) {
    return false;
  }
}

async function ensureVoiceRuntimePackages(pythonBin, options = {}) {
  const requiresChatterbox = options.requiresChatterbox === true;
  const requiresDia = options.requiresDia === true;
  const prefersCuda = options.prefersCuda === true;
  const requiredModules = requiresChatterbox
    ? ['numpy', 'transformers', 'torch', 'phonemizer', 'chatterbox']
    : (requiresDia
      ? ['numpy', 'transformers', 'torch', 'phonemizer', 'descript_audio_codec', 'safetensors']
      : ['numpy', 'transformers', 'torch', 'torchaudio', 'phonemizer']);
  const missing = await probeMissingPythonModules(pythonBin, requiredModules);
  if (missing.length === 0 && !requiresDia) return { success: true, installed: [] };

  let needsDiaTransformersUpgrade = false;
  if (requiresDia && !missing.includes('transformers')) {
    const diaAvailable = await probeDiaTransformersAvailable(pythonBin);
    if (!diaAvailable) {
      needsDiaTransformersUpgrade = true;
    }
  }
  if (missing.length === 0 && !needsDiaTransformersUpgrade) {
    return { success: true, installed: [] };
  }

  const installPlan = [];
  const needsTorch = missing.includes('torch');
  const needsTorchAudio = missing.includes('torchaudio');
  const needsCore = missing.some((m) => m === 'numpy' || m === 'transformers' || m === 'phonemizer');
  const needsChatterbox = missing.includes('chatterbox');
  const needsDiaDeps = missing.includes('descript_audio_codec') || missing.includes('safetensors');

  installPlan.push(['--upgrade', 'pip', 'setuptools', 'wheel']);
  if (needsCore) installPlan.push(['numpy', 'transformers', 'phonemizer']);
  if (needsDiaTransformersUpgrade) installPlan.push(['--upgrade', 'transformers>=4.53.1']);
  if (needsTorch || needsTorchAudio) {
    const canUseCudaIndex = prefersCuda && (
      (process.platform === 'win32' && process.arch === 'x64') ||
      (process.platform === 'linux' && process.arch === 'x64')
    );
    const torchArgs = canUseCudaIndex
      ? ['--index-url', 'https://download.pytorch.org/whl/cu118', 'torch', 'torchaudio']
      : ['--index-url', 'https://download.pytorch.org/whl/cpu', 'torch', 'torchaudio'];
    installPlan.push(torchArgs);
  }
  if (needsChatterbox) installPlan.push(['chatterbox-tts']);
  if (needsDiaDeps) installPlan.push(['descript-audio-codec', 'safetensors']);

  for (const args of installPlan) {
    const installed = await runPipInstall(pythonBin, args);
    if (!installed.success) return installed;
  }

  if (prefersCuda) {
    const hasTorch = !missing.includes('torch');
    const hasTorchAudio = !missing.includes('torchaudio');
    if (hasTorch || hasTorchAudio) {
      const cudaProbe = await probeTorchCudaAvailable(pythonBin);
      if (!cudaProbe.available) {
        const candidateIndexes = [
          'https://download.pytorch.org/whl/cu124',
          'https://download.pytorch.org/whl/cu121',
          'https://download.pytorch.org/whl/cu118'
        ];
        let lastError = '';
        let repaired = false;
        for (const indexUrl of candidateIndexes) {
          const torchCudaRepair = await runPipInstall(
            pythonBin,
            ['--index-url', indexUrl, '--upgrade', '--force-reinstall', 'torch', 'torchaudio']
          );
          if (!torchCudaRepair.success) {
            lastError = String(torchCudaRepair.error || '');
            continue;
          }
          const info = await probeTorchInfo(pythonBin);
          const hasCudaBuild = info.ok && info.cuda && !String(info.version || '').includes('+cpu');
          if (hasCudaBuild && info.available) {
            repaired = true;
            break;
          }
          lastError = `Installed torch is not CUDA-capable (version=${info.version || 'unknown'}, cuda=${info.cuda || 'none'}, is_available=${info.available === true}).`;
        }
        if (!repaired) {
          return { success: false, error: `CUDA torch repair failed. ${lastError}` };
        }
      }
    }
  }

  const remaining = await probeMissingPythonModules(pythonBin, requiredModules);
  if (requiresDia) {
    const diaAvailable = await probeDiaTransformersAvailable(pythonBin);
    if (!diaAvailable) remaining.push('transformers_dia');
  }
  if (remaining.length > 0) {
    return { success: false, error: `Packages still missing after install: ${remaining.join(', ')}` };
  }
  if (prefersCuda) {
    const info = await probeTorchInfo(pythonBin);
    const hasCudaBuild = info.ok && info.cuda && !String(info.version || '').includes('+cpu');
    if (!hasCudaBuild || !info.available) {
      return {
        success: false,
        error: `CUDA requested but torch runtime is not usable (version=${info.version || 'unknown'}, cuda=${info.cuda || 'none'}, is_available=${info.available === true})${info.error ? ` (${info.error})` : ''}`
      };
    }
  }
  if (needsDiaTransformersUpgrade && !missing.includes('transformers_dia')) {
    missing.push('transformers_dia');
  }
  return { success: true, installed: missing };
}

async function ensureManagedVoiceRuntime(appDir = '', options = {}) {
  const requiresChatterbox = options.requiresChatterbox === true;
  const requiresDia = options.requiresDia === true;
  const prefersCuda = options.prefersCuda === true;
  const requiresPy311Or310 = requiresChatterbox || prefersCuda;
  const runtimeDir = common.getManagedVoiceRuntimeDir(appDir, { requiresChatterbox });
  const venvDir = common.path.join(runtimeDir, 'venv');
  const lockKey = `${runtimeDir}::${requiresChatterbox ? 'chatterbox' : 'base'}::${requiresDia ? 'dia' : 'default'}`;
  const existing = common.voiceRuntimeEnsurePromises.get(lockKey);
  if (existing) return existing;

  const promise = (async () => {
    let existingPython = common.getManagedVoiceRuntimePythonBin(appDir, { requiresChatterbox });
    if (existingPython) {
      if (requiresPy311Or310) {
        const version = common.getPythonVersionInfo(existingPython);
        const isCompatible = version && version.major === 3 && version.minor >= 10 && version.minor <= 11;
        if (!isCompatible) {
          try {
            common.fs.rmSync(runtimeDir, { recursive: true, force: true });
          } catch (_err) {
            // If cleanup fails we'll surface it later when venv creation fails.
          }
          existingPython = '';
        }
      }
    }
    if (existingPython) {
      const ensured = await ensureVoiceRuntimePackages(existingPython, { requiresChatterbox, requiresDia, prefersCuda });
      if (!ensured.success) {
        return { success: false, error: `Existing voice runtime repair failed: ${ensured.error}` };
      }
      return { success: true, pythonBin: existingPython, created: false, repaired: (ensured.installed || []).length > 0 };
    }

    let bootstrap = resolveBootstrapPythonCandidate({ requiresPy311Or310, appDir });
    if ((!bootstrap || !bootstrap.path) && requiresPy311Or310) {
      const py311Bootstrap = await ensureManagedPython311(appDir);
      if (!py311Bootstrap.success) {
        return {
          success: false,
          error: `${prefersCuda ? 'CUDA voice runtime' : 'Voice runtime'} bootstrap failed: ${py311Bootstrap.error}`
        };
      }
      bootstrap = resolveBootstrapPythonCandidate({ requiresPy311Or310, appDir });
    }
    if (!bootstrap || !bootstrap.path) {
      if (requiresPy311Or310) {
        const reason = prefersCuda
          ? 'CUDA voice runtime requires Python 3.10/3.11, but no compatible interpreter was found on PATH.'
          : 'Chatterbox requires Python 3.10/3.11 for the dedicated voice runtime, but no compatible interpreter was found on PATH.';
        return {
          success: false,
          error: reason
        };
      }
      return { success: false, error: 'No Python interpreter found to bootstrap dedicated voice runtime.' };
    }
    if (requiresPy311Or310 && Number(bootstrap?.version?.minor || 0) > 11) {
      const reason = prefersCuda ? 'CUDA voice runtime' : 'Chatterbox';
      return {
        success: false,
        error: `${reason} requires Python 3.10/3.11 for dedicated voice runtime. Found Python ${bootstrap.version.text} at ${bootstrap.path}.`
      };
    }

    common.fs.mkdirSync(runtimeDir, { recursive: true });
    const venvCreate = await common.runPythonProcess(bootstrap.path, ['-m', 'venv', venvDir], {
      timeout: 4 * 60 * 1000,
      maxBuffer: 16 * 1024 * 1024
    });
    if (venvCreate.status !== 0) {
      const detail = common.trimTail(`${String(venvCreate.stdout || '')}\n${String(venvCreate.stderr || '')}`, 1200);
      return { success: false, error: `Failed to create voice runtime venv: ${detail}` };
    }

    const voicePython = common.getManagedVoiceRuntimePythonBin(appDir, { requiresChatterbox });
    if (!voicePython) {
      return { success: false, error: 'Voice runtime venv created, but python binary was not found.' };
    }

    const ensured = await ensureVoiceRuntimePackages(voicePython, { requiresChatterbox, requiresDia, prefersCuda });
    if (!ensured.success) {
      return { success: false, error: `Voice runtime package install failed: ${ensured.error}` };
    }

    return { success: true, pythonBin: voicePython, created: true };
  })();

  common.voiceRuntimeEnsurePromises.set(lockKey, promise);
  try {
    return await promise;
  } finally {
    common.voiceRuntimeEnsurePromises.delete(lockKey);
  }
}

async function resolvePythonBinForModel(cfg = {}, options = {}) {
  const configured = String(cfg.pythonBin || '').trim();
  if (configured && !common.isGenericPythonAlias(configured)) {
    return { success: true, pythonBin: configured, source: 'configured' };
  }

  const modelId = String(options?.model || '').trim();
  const requiresChatterbox = common.isChatterboxModel(modelId);
  const requiresDia = common.isDiaModel(modelId);
  const prefersCuda = String(cfg?.device || 'cpu').trim().toLowerCase() === 'cuda';

  const ensured = await ensureManagedVoiceRuntime(options.appDir, { requiresChatterbox, requiresDia, prefersCuda });
  if (ensured?.success && ensured.pythonBin) {
    return {
      success: true,
      pythonBin: ensured.pythonBin,
      source: requiresChatterbox ? 'voice-runtime-chatterbox' : 'voice-runtime',
      created: ensured.created === true
    };
  }
  if (requiresChatterbox || requiresDia) {
    const modelLabel = requiresChatterbox ? 'Chatterbox' : 'Dia';
    return { success: false, error: ensured?.error || `Dedicated voice runtime unavailable for ${modelLabel}.` };
  }

  const managedWebUi = common.getManagedPythonWebUiBin(options.appDir);
  if (managedWebUi) return { success: true, pythonBin: managedWebUi, source: 'python-webui' };
  return { success: true, pythonBin: (process.platform === 'win32' ? 'python' : 'python3'), source: 'system' };
}

function resolvePythonBin(cfg = {}, options = {}) {
  const configured = String(cfg.pythonBin || '').trim();
  if (configured && !common.isGenericPythonAlias(configured)) return configured;
  const managed = common.getManagedPythonWebUiBin(options.appDir);
  if (managed) return managed;
  return process.platform === 'win32' ? 'python' : 'python3';
}

function getRuntimeProfileOptions(profile = 'base') {
  const key = String(profile || 'base').trim().toLowerCase();
  if (key === 'chatterbox') {
    return { requiresChatterbox: true, profile: 'chatterbox' };
  }
  if (key === 'dia') {
    return { requiresChatterbox: false, requiresDia: true, profile: 'dia' };
  }
  return { requiresChatterbox: false, requiresDia: false, profile: 'base' };
}

function getRuntimeProfileLabel(profile = {}) {
  if (profile?.profile === 'chatterbox') return 'Chatterbox';
  if (profile?.profile === 'dia') return 'Dia';
  return 'Base';
}

module.exports = {
  resolveBootstrapPythonCandidate,
  ensureManagedPython311,
  runPipInstall,
  probeMissingPythonModules,
  probeTorchCudaAvailable,
  probeTorchInfo,
  probeDiaTransformersAvailable,
  ensureVoiceRuntimePackages,
  ensureManagedVoiceRuntime,
  resolvePythonBinForModel,
  resolvePythonBin,
  getRuntimeProfileOptions,
  getRuntimeProfileLabel
};
