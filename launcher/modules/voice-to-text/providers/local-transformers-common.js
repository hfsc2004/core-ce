/**
 * Shared Local Transformers helpers/state.
 */
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const MANAGED_PY311_POINTER_FILE = 'python-path.txt';
const PROBE_CACHE_TTL_MS = 5 * 60 * 1000;
const localTransformersProbeCache = new Map();
const localTransformersWorkerPool = new Map();
const voiceRuntimeEnsurePromises = new Map();
let localTransformersWorkerRequestSeq = 1;

function nextWorkerRequestId() {
  const id = localTransformersWorkerRequestSeq;
  localTransformersWorkerRequestSeq += 1;
  return id;
}

function getPlatformDir() {
  if (process.platform === 'win32') return process.arch === 'arm64' ? 'windows-arm64' : 'windows-x64';
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'macos-arm' : 'macos-intel';
  return process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
}

function getManagedPythonWebUiBin(appDir = '') {
  const platformDir = getPlatformDir();
  const binName = process.platform === 'win32' ? path.join('venv', 'Scripts', 'python.exe') : path.join('venv', 'bin', 'python');
  const candidate = path.resolve(String(appDir || ''), '..', 'binaries', 'python-webui', platformDir, binName);
  if (fs.existsSync(candidate)) return candidate;
  return '';
}

function getManagedVoiceRuntimeDir(appDir = '', options = {}) {
  const platformDir = getPlatformDir();
  const runtimeName = options.requiresChatterbox === true ? 'python-voice-chatterbox' : 'python-voice';
  return path.resolve(String(appDir || ''), '..', 'binaries', runtimeName, platformDir);
}

function getManagedVoiceRuntimePythonBin(appDir = '', options = {}) {
  const binName = process.platform === 'win32' ? path.join('venv', 'Scripts', 'python.exe') : path.join('venv', 'bin', 'python');
  const candidate = path.join(getManagedVoiceRuntimeDir(appDir, options), binName);
  if (fs.existsSync(candidate)) return candidate;
  return '';
}

function getManagedPython311Dir(appDir = '') {
  const platformDir = getPlatformDir();
  return path.resolve(String(appDir || ''), '..', 'binaries', 'python311', platformDir);
}

function getManagedPython311Bin(appDir = '') {
  const runtimeDir = getManagedPython311Dir(appDir);
  const pointerPath = path.join(runtimeDir, MANAGED_PY311_POINTER_FILE);
  if (!fs.existsSync(pointerPath)) return '';
  try {
    const pointed = String(fs.readFileSync(pointerPath, 'utf8') || '').trim();
    if (pointed && fs.existsSync(pointed)) return pointed;
  } catch (_err) {
    // Ignore invalid pointer and continue.
  }
  return '';
}

function isGenericPythonAlias(value = '') {
  const v = String(value || '').trim().toLowerCase();
  return v === 'python' || v === 'python3' || v === 'py';
}

function findCommandPath(cmd) {
  const value = String(cmd || '').trim();
  if (!value) return '';
  if (path.isAbsolute(value) && fs.existsSync(value)) return value;
  const checker = process.platform === 'win32' ? 'where' : 'which';
  const probe = spawnSync(checker, [value], { encoding: 'utf8', timeout: 5000 });
  if (probe.error || probe.status !== 0) return '';
  const firstLine = String(probe.stdout || '').split(/\r?\n/).map((v) => v.trim()).filter(Boolean)[0];
  return firstLine || '';
}

function getPythonVersionInfo(pythonExe) {
  const probe = spawnSync(
    pythonExe,
    ['-c', 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")'],
    { encoding: 'utf8', timeout: 8000 }
  );
  if (probe.error || probe.status !== 0) return null;
  const raw = String(probe.stdout || '').trim();
  const match = raw.match(/^(\d+)\.(\d+)$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    text: raw
  };
}

function getUvExecutable(appDir = '') {
  const webUiPython = getManagedPythonWebUiBin(appDir);
  if (webUiPython) {
    const uvName = process.platform === 'win32' ? 'uv.exe' : 'uv';
    const sibling = path.join(path.dirname(webUiPython), uvName);
    if (fs.existsSync(sibling)) return sibling;
  }
  return findCommandPath('uv');
}

function extractExecutableFromText(text = '') {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const firstToken = String(line.split(/\s+/)[0] || '').trim();
    if (!firstToken) continue;
    const normalized = firstToken.replace(/^"+|"+$/g, '');
    if (path.isAbsolute(normalized) && fs.existsSync(normalized)) return normalized;
  }
  return '';
}

function runPythonProcess(pythonBin, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    let finished = false;
    let timeoutId = null;

    const maxBufferBytes = Number.isFinite(options.maxBuffer) ? options.maxBuffer : 32 * 1024 * 1024;
    const timeoutMs = Number.isFinite(options.timeout) ? options.timeout : 12000;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const complete = (result) => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve(result);
    };

    const fail = (err) => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(err);
    };

    child.on('error', fail);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
      if (Buffer.byteLength(stdout, 'utf8') > maxBufferBytes) {
        child.kill('SIGKILL');
        fail(new Error('Process stdout exceeded max buffer.'));
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
      if (Buffer.byteLength(stderr, 'utf8') > maxBufferBytes) {
        child.kill('SIGKILL');
        fail(new Error('Process stderr exceeded max buffer.'));
      }
    });

    child.on('close', (code, signal) => {
      complete({
        status: typeof code === 'number' ? code : -1,
        signal: signal || '',
        stdout,
        stderr
      });
    });

    if (typeof options.input === 'string' && options.input.length > 0) {
      child.stdin.write(options.input);
    }
    child.stdin.end();

    timeoutId = setTimeout(() => {
      child.kill('SIGKILL');
      fail(new Error(`Process timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  });
}

function runCommandProcess(commandBin, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(commandBin, args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false
    });
    let stdout = '';
    let stderr = '';
    let finished = false;
    let timeoutId = null;

    const maxBufferBytes = Number.isFinite(options.maxBuffer) ? options.maxBuffer : 32 * 1024 * 1024;
    const timeoutMs = Number.isFinite(options.timeout) ? options.timeout : 12000;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const complete = (result) => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve(result);
    };

    const fail = (err) => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(err);
    };

    child.on('error', fail);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
      if (Buffer.byteLength(stdout, 'utf8') > maxBufferBytes) {
        child.kill('SIGKILL');
        fail(new Error('Process stdout exceeded max buffer.'));
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
      if (Buffer.byteLength(stderr, 'utf8') > maxBufferBytes) {
        child.kill('SIGKILL');
        fail(new Error('Process stderr exceeded max buffer.'));
      }
    });

    child.on('close', (code, signal) => {
      complete({
        status: typeof code === 'number' ? code : -1,
        signal: signal || '',
        stdout,
        stderr
      });
    });

    child.stdin.end();

    timeoutId = setTimeout(() => {
      child.kill('SIGKILL');
      fail(new Error(`Process timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  });
}

function trimTail(value, maxLen = 4000) {
  const text = String(value || '');
  if (text.length <= maxLen) return text;
  return text.slice(text.length - maxLen);
}

function clearProbeCacheForPython(pythonBin) {
  const prefix = `${String(pythonBin || '').trim()}::`;
  for (const key of localTransformersProbeCache.keys()) {
    if (key.startsWith(prefix)) localTransformersProbeCache.delete(key);
  }
}

function getProbeCacheKey(pythonBin, wantsCuda, wantsChatterbox) {
  return `${String(pythonBin || '').trim()}::${wantsCuda ? 'cuda' : 'cpu'}::${wantsChatterbox ? 'chatterbox' : 'pipeline'}`;
}

function isChatterboxModel(modelId = '') {
  const id = String(modelId || '').trim().toLowerCase();
  if (!id) return false;
  return id.includes('chatterbox');
}

function isDiaModel(modelId = '') {
  const id = String(modelId || '').trim().toLowerCase();
  if (!id) return false;
  return id.includes('nari-labs/dia') || id.includes('dia-1.6b');
}

function resolveDiaTransformersModel(modelId = '') {
  const trimmed = String(modelId || '').trim();
  const lower = trimmed.toLowerCase();
  if (lower === 'nari-labs/dia-1.6b') {
    return 'nari-labs/Dia-1.6B-0626';
  }
  return trimmed;
}

function pipPackageForPythonModule(moduleName = '') {
  const key = String(moduleName || '').trim().toLowerCase();
  if (key === 'chatterbox') return 'chatterbox-tts';
  if (key === 'descript_audio_codec') return 'descript-audio-codec';
  if (key === 'transformers_dia') return 'transformers>=4.53.1';
  return key;
}

function isCudaUnavailableErrorText(value = '') {
  const text = String(value || '').toLowerCase();
  return text.includes('torch.cuda.is_available() is false') || text.includes('cuda requested but unavailable');
}

module.exports = {
  fs,
  path,
  MANAGED_PY311_POINTER_FILE,
  PROBE_CACHE_TTL_MS,
  localTransformersProbeCache,
  localTransformersWorkerPool,
  voiceRuntimeEnsurePromises,
  nextWorkerRequestId,
  getPlatformDir,
  getManagedPythonWebUiBin,
  getManagedVoiceRuntimeDir,
  getManagedVoiceRuntimePythonBin,
  getManagedPython311Dir,
  getManagedPython311Bin,
  isGenericPythonAlias,
  findCommandPath,
  getPythonVersionInfo,
  getUvExecutable,
  extractExecutableFromText,
  runPythonProcess,
  runCommandProcess,
  trimTail,
  clearProbeCacheForPython,
  getProbeCacheKey,
  isChatterboxModel,
  isDiaModel,
  resolveDiaTransformersModel,
  pipPackageForPythonModule,
  isCudaUnavailableErrorText
};
