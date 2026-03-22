/**
 * Local Transformers availability probes (TTS/STT).
 */
const common = require('./local-transformers-common');
const runtime = require('./local-transformers-runtime');

async function checkLocalTransformersAvailability(cfg = {}, options = {}) {
  const pythonBin = String(options?.pythonBin || '').trim() || runtime.resolvePythonBin(cfg, options);
  const selectedModel = String(options?.model || cfg?.model || '').trim();
  const wantsCuda = String(cfg?.device || 'cpu').trim().toLowerCase() === 'cuda';
  const wantsChatterbox = common.isChatterboxModel(selectedModel);
  const wantsDia = common.isDiaModel(selectedModel);
  const cacheKey = `${common.getProbeCacheKey(pythonBin, wantsCuda, wantsChatterbox)}::${wantsDia ? 'dia' : 'default'}`;
  const now = Date.now();
  const cached = common.localTransformersProbeCache.get(cacheKey);
  if (cached && Number(cached.expiresAt || 0) > now) {
    return cached.result;
  }
  const modsLiteral = wantsChatterbox
    ? '["transformers","torch","numpy","chatterbox"]'
    : (wantsDia
      ? '["transformers","torch","numpy","descript_audio_codec","safetensors"]'
      : '["transformers","torch","numpy"]');
  const probeCode = [
    'import importlib.util',
    `mods=${modsLiteral}`,
    'missing=[m for m in mods if importlib.util.find_spec(m) is None]',
    'import json',
    'import sys',
    `wants_cuda=${wantsCuda ? 'True' : 'False'}`,
    'cuda_ok=(not wants_cuda) or ("torch" in missing) or __import__("torch").cuda.is_available()',
    'cuda_msg="" if cuda_ok else "cuda requested but torch.cuda.is_available() is false"',
    'print(json.dumps({"missing":missing,"cuda_ok":cuda_ok,"cuda_msg":cuda_msg,"py_major":sys.version_info.major,"py_minor":sys.version_info.minor}))'
  ].join(';');
  let probe;
  try {
    probe = await common.runPythonProcess(pythonBin, ['-c', probeCode], {
      timeout: 60000,
      maxBuffer: 4 * 1024 * 1024
    });
  } catch (err) {
    return {
      available: false,
      error: `Python probe failed: ${err.message}`
    };
  }
  if (probe.status !== 0) {
    return {
      available: false,
      error: `Python probe exited with code ${probe.status}: ${String(probe.stderr || '').trim()}`
    };
  }
  let parsed = null;
  try {
    parsed = JSON.parse(String(probe.stdout || '').trim() || '{}');
  } catch (_err) {
    parsed = { missing: ['probe-parse-failed'], cuda_ok: true, cuda_msg: '' };
  }
  const missing = Array.isArray(parsed?.missing) ? parsed.missing.filter(Boolean) : [];
  if (missing.length === 0 && wantsDia) {
    const diaProbeCode = [
      'import json',
      'ok=True',
      'try:',
      ' from transformers import DiaForConditionalGeneration',
      'except Exception:',
      ' ok=False',
      'print(json.dumps({"ok": ok}))'
    ].join('\n');
    try {
      const diaProbe = await common.runPythonProcess(pythonBin, ['-c', diaProbeCode], {
        timeout: 60000,
        maxBuffer: 2 * 1024 * 1024
      });
      if (diaProbe.status !== 0) {
        missing.push('transformers_dia');
      } else {
        let diaParsed = {};
        try {
          diaParsed = JSON.parse(String(diaProbe.stdout || '').trim() || '{}');
        } catch (_err) {
          diaParsed = { ok: false };
        }
        if (diaParsed?.ok !== true) {
          missing.push('transformers_dia');
        }
      }
    } catch (_err) {
      missing.push('transformers_dia');
    }
  }
  if (missing.length > 0) {
    const pyMajor = Number(parsed?.py_major || 0);
    const pyMinor = Number(parsed?.py_minor || 0);
    const isPy312Plus = pyMajor > 3 || (pyMajor === 3 && pyMinor >= 12);
    const isChatterboxMissing = missing.some((name) => String(name).toLowerCase() === 'chatterbox');
    const installPkgs = missing.map((name) => common.pipPackageForPythonModule(name));
    const installHint = `Install in the configured Python env: ${pythonBin} -m pip install ${installPkgs.join(' ')}`;
    const compatHint = (isChatterboxMissing && isPy312Plus)
      ? ' Note: chatterbox-tts currently has Python 3.12 install issues on some environments; Python 3.10/3.11 is recommended for Chatterbox right now.'
      : '';
    return {
      available: false,
      error: `Missing Python packages: ${missing.join(', ')}. ${installHint}${compatHint}`
    };
  }
  if (parsed?.cuda_ok === false) {
    const result = {
      available: false,
      error: String(parsed?.cuda_msg || 'CUDA requested but unavailable in this Python environment.')
    };
    common.localTransformersProbeCache.set(cacheKey, { result, expiresAt: now + common.PROBE_CACHE_TTL_MS });
    return result;
  }
  const result = { available: true };
  common.localTransformersProbeCache.set(cacheKey, { result, expiresAt: now + common.PROBE_CACHE_TTL_MS });
  return result;
}

async function checkLocalTransformersSttAvailability(cfg = {}, options = {}) {
  const pythonBin = String(options?.pythonBin || '').trim() || runtime.resolvePythonBin(cfg, options);
  const wantsCuda = String(cfg?.device || 'cpu').trim().toLowerCase() === 'cuda';
  const cacheKey = `${String(pythonBin || '').trim()}::${wantsCuda ? 'cuda' : 'cpu'}::stt`;
  const now = Date.now();
  const cached = common.localTransformersProbeCache.get(cacheKey);
  if (cached && Number(cached.expiresAt || 0) > now) {
    return cached.result;
  }

  const probeCode = [
    'import importlib.util',
    'mods=["transformers","torch","torchaudio","numpy"]',
    'missing=[m for m in mods if importlib.util.find_spec(m) is None]',
    'import json',
    `wants_cuda=${wantsCuda ? 'True' : 'False'}`,
    'cuda_ok=(not wants_cuda) or ("torch" in missing) or __import__("torch").cuda.is_available()',
    'cuda_msg="" if cuda_ok else "cuda requested but torch.cuda.is_available() is false"',
    'print(json.dumps({"missing":missing,"cuda_ok":cuda_ok,"cuda_msg":cuda_msg}))'
  ].join(';');

  let probe;
  try {
    probe = await common.runPythonProcess(pythonBin, ['-c', probeCode], {
      timeout: 60000,
      maxBuffer: 4 * 1024 * 1024
    });
  } catch (err) {
    return { available: false, error: `Python probe failed: ${err.message}` };
  }

  if (probe.status !== 0) {
    return {
      available: false,
      error: `Python probe exited with code ${probe.status}: ${String(probe.stderr || '').trim()}`
    };
  }

  let parsed = null;
  try {
    parsed = JSON.parse(String(probe.stdout || '').trim() || '{}');
  } catch (_err) {
    parsed = { missing: ['probe-parse-failed'], cuda_ok: true, cuda_msg: '' };
  }
  const missing = Array.isArray(parsed?.missing) ? parsed.missing.filter(Boolean) : [];
  if (missing.length > 0) {
    const installPkgs = missing.map((name) => common.pipPackageForPythonModule(name));
    return {
      available: false,
      error: `Missing Python packages: ${missing.join(', ')}. Install in the configured Python env: ${pythonBin} -m pip install ${installPkgs.join(' ')}`
    };
  }
  if (parsed?.cuda_ok === false) {
    const result = {
      available: false,
      error: String(parsed?.cuda_msg || 'CUDA requested but unavailable in this Python environment.')
    };
    common.localTransformersProbeCache.set(cacheKey, { result, expiresAt: now + common.PROBE_CACHE_TTL_MS });
    return result;
  }
  const result = { available: true };
  common.localTransformersProbeCache.set(cacheKey, { result, expiresAt: now + common.PROBE_CACHE_TTL_MS });
  return result;
}

module.exports = {
  checkLocalTransformersAvailability,
  checkLocalTransformersSttAvailability
};
