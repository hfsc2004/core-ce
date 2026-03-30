/**
 * Pseudo Science Fiction Core Collection - Llama.cpp Manager
 *
 * Minimal backend adapter used by inference-manager.
 * This module intentionally keeps behavior conservative until llama-server
 * packaging/session lifecycle is fully integrated.
 *
 * @module llama-cpp-manager
 * @version 1.1.3 - March 5, 2026
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn, execFileSync } = require('child_process');

let catalogTemplateCache = {
  cacheKey: '',
  tokenMap: new Map()
};

function getPlatformTag() {
  const p = os.platform();
  const a = os.arch();
  if (p === 'linux' && a === 'x64') return 'linux-x64';
  if (p === 'linux' && a === 'arm64') return 'linux-arm64';
  if (p === 'darwin' && a === 'x64') return 'macos-intel';
  if (p === 'darwin' && a === 'arm64') return 'macos-arm';
  if (p === 'win32' && a === 'x64') return 'windows-x64';
  if (p === 'win32' && a === 'arm64') return 'windows-arm64';
  return null;
}

function getLlamaServerPath(appDir) {
  const platformTag = getPlatformTag();
  if (!platformTag) return null;
  const exe = os.platform() === 'win32' ? 'llama-server.exe' : 'llama-server';
  const root = path.join(appDir, '..', 'binaries', 'llama.cpp', platformTag);
  const candidates = [
    path.join(root, 'build', 'bin', exe),
    path.join(root, 'bin', exe)
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function checkAvailable(appDir) {
  const serverPath = getLlamaServerPath(appDir);
  return {
    success: !!serverPath,
    available: !!serverPath,
    serverPath,
    message: serverPath
      ? `llama.cpp backend available (${serverPath})`
      : 'llama.cpp backend unavailable: llama-server binary not found.'
  };
}

function resolveModelPath(appDir, modelPath) {
  const raw = String(modelPath || '').trim();
  if (!raw) return null;
  if (path.isAbsolute(raw)) return raw;
  return path.resolve(path.join(appDir, '..'), raw);
}

function getTemplateDirectory(appDir) {
  const platformTag = getPlatformTag();
  if (!platformTag) return null;
  return path.join(appDir, '..', 'binaries', 'llama.cpp', platformTag, 'models', 'templates');
}

function resolveKnownTemplatePath(appDir, fileName) {
  const templateDir = getTemplateDirectory(appDir);
  if (!templateDir) return null;
  const candidate = path.join(templateDir, String(fileName || '').trim());
  if (!String(fileName || '').trim()) return null;
  return fs.existsSync(candidate) ? candidate : null;
}

function normalizeModelToken(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  return raw.replace(/\.gguf$/i, '');
}

function normalizeTemplateValue(appDir, value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (path.isAbsolute(raw)) return raw;
  if (/\.jinja$/i.test(raw)) {
    const resolved = resolveKnownTemplatePath(appDir, raw);
    return resolved || raw;
  }
  return raw;
}

function getCatalogModelEntries(catalog) {
  if (!catalog || typeof catalog !== 'object') return [];
  if (Array.isArray(catalog.models)) return catalog.models;
  const out = [];
  const collections = catalog.collections;
  if (collections && typeof collections === 'object') {
    if (Array.isArray(collections)) {
      collections.forEach((collection) => {
        if (Array.isArray(collection?.models)) out.push(...collection.models);
      });
    } else {
      Object.values(collections).forEach((collection) => {
        if (Array.isArray(collection?.models)) out.push(...collection.models);
      });
    }
  }
  return out;
}

function buildCatalogTemplateTokenMap(appDir) {
  const modelsDir = path.join(appDir, '..', 'models');
  let catalogFiles = [];
  try {
    catalogFiles = fs.readdirSync(modelsDir)
      .filter((name) => /^catalog-.*\.json$/i.test(String(name || '')))
      .sort();
  } catch (_) {
    return new Map();
  }

  const statsKey = catalogFiles.map((name) => {
    try {
      const stat = fs.statSync(path.join(modelsDir, name));
      return `${name}:${Number(stat.mtimeMs || 0)}:${Number(stat.size || 0)}`;
    } catch (_) {
      return `${name}:0:0`;
    }
  }).join('|');
  if (catalogTemplateCache.cacheKey === statsKey && catalogTemplateCache.tokenMap instanceof Map) {
    return catalogTemplateCache.tokenMap;
  }

  const tokenMap = new Map();
  const templateFields = ['chat_template', 'chatTemplate', 'llama_cpp_chat_template', 'llamaCppChatTemplate'];
  for (const fileName of catalogFiles) {
    const fullPath = path.join(modelsDir, fileName);
    let parsed = null;
    try {
      parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    } catch (_) {
      continue;
    }
    const entries = getCatalogModelEntries(parsed);
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      const explicitTemplateRaw = templateFields
        .map((field) => entry[field])
        .find((v) => String(v || '').trim().length > 0);
      if (!explicitTemplateRaw) continue;
      const templateValue = normalizeTemplateValue(appDir, explicitTemplateRaw);
      if (!templateValue) continue;

      const tokens = new Set();
      const primaryCandidates = [
        entry.id,
        entry.name,
        entry.filename,
        entry.download_url,
        entry.base_model_url
      ];
      primaryCandidates.forEach((candidate) => {
        const token = normalizeModelToken(candidate);
        if (token) tokens.add(token);
        if (String(candidate || '').includes('/')) {
          const base = normalizeModelToken(path.basename(String(candidate || '')));
          if (base) tokens.add(base);
        }
      });
      const artifacts = Array.isArray(entry.artifacts) ? entry.artifacts : [];
      artifacts.forEach((artifact) => {
        const token = normalizeModelToken(artifact?.filename);
        if (token) tokens.add(token);
      });

      for (const token of tokens) {
        if (!tokenMap.has(token)) {
          tokenMap.set(token, templateValue);
        }
      }
    }
  }

  catalogTemplateCache = {
    cacheKey: statsKey,
    tokenMap
  };
  return tokenMap;
}

function resolveCatalogTemplate(appDir, options = {}) {
  const tokenMap = buildCatalogTemplateTokenMap(appDir);
  if (!(tokenMap instanceof Map) || tokenMap.size === 0) return null;

  const modelPath = String(options.modelPath || '').trim();
  const modelName = String(options.modelName || '').trim();
  const probeTokens = [
    modelName,
    path.basename(modelPath || ''),
    path.basename(modelPath || '').replace(/\.gguf$/i, '')
  ]
    .map((value) => normalizeModelToken(value))
    .filter(Boolean);

  for (const token of probeTokens) {
    const hit = tokenMap.get(token);
    if (hit) return hit;
  }
  return null;
}

function inferChatTemplate(appDir, options = {}) {
  const explicit = String(options.chatTemplate || '').trim();
  if (explicit) {
    return { value: explicit, source: 'explicit' };
  }

  const catalogTemplate = resolveCatalogTemplate(appDir, options);
  if (catalogTemplate) {
    return { value: catalogTemplate, source: 'catalog' };
  }

  const modelPath = String(options.modelPath || '').trim();
  const modelName = String(options.modelName || '').trim();
  const identity = `${modelName} ${path.basename(modelPath || '')}`.toLowerCase();
  if (!identity) return { value: null, source: 'none' };

  // Keep heuristics minimal. Family-wide forced templates can degrade output badly.
  // Prefer model metadata (catalog override) or explicit user/operator override.
  if (/tinyllama/.test(identity)) {
    return { value: 'chatml', source: 'auto:builtin:chatml' };
  }

  return { value: null, source: 'none' };
}

function pingEndpoint(url, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function checkServerReady(port, timeoutMs = 600000) {
  const startedAt = Date.now();
  const endpoints = [
    `http://127.0.0.1:${port}/health`,
    `http://127.0.0.1:${port}/v1/models`,
    `http://127.0.0.1:${port}/`
  ];

  while ((Date.now() - startedAt) <= timeoutMs) {
    for (const endpoint of endpoints) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await pingEndpoint(endpoint, 2000);
      if (ok) return true;
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

async function startLlamaServerOnPort(appDir, options = {}) {
  const {
    port,
    modelPath,
    modelName,
    chatTemplate,
    contextSize = 8192,
    threads = 0,
    gpuLayers = null,
    forceCpu = false,
    splitMode = null,
    mainGpuIndex = null,
    cudaVisibleDevices = null,
    parallel = 1,
    startupTimeoutMs = 600000
  } = options;

  if (!port) {
    throw new Error('Port is required - must be pre-allocated by session-manager');
  }

  const availability = checkAvailable(appDir);
  if (!availability.available || !availability.serverPath) {
    throw new Error(availability.message);
  }

  const resolvedModelPath = resolveModelPath(appDir, modelPath);
  if (!resolvedModelPath || !fs.existsSync(resolvedModelPath)) {
    throw new Error(
      `llama.cpp model file not found. Configure a valid GGUF path first (received: ${String(modelPath || 'empty')})`
    );
  }

  const args = [
    '--model', resolvedModelPath,
    '--host', '127.0.0.1',
    '--port', String(port),
    '--ctx-size', String(Math.max(256, Number(contextSize) || 8192)),
    '--parallel', String(Math.max(1, Number(parallel) || 1))
  ];

  const templateResolved = inferChatTemplate(appDir, {
    chatTemplate,
    modelPath: resolvedModelPath,
    modelName
  });
  if (templateResolved.value) {
    args.push('--chat-template', String(templateResolved.value));
  }

  if (Number(threads) > 0) {
    args.push('--threads', String(Math.max(1, Number(threads))));
  }

  const normalizedSplitMode = String(splitMode || '').trim().toLowerCase();
  if (['none', 'layer', 'row'].includes(normalizedSplitMode)) {
    args.push('--split-mode', normalizedSplitMode);
  }
  const normalizedMainGpuIndex = Number(mainGpuIndex);
  if (Number.isInteger(normalizedMainGpuIndex) && normalizedMainGpuIndex >= 0) {
    args.push('--main-gpu', String(normalizedMainGpuIndex));
  }

  if (forceCpu) {
    args.push('--n-gpu-layers', '0');
  } else if (gpuLayers !== null && Number.isFinite(Number(gpuLayers))) {
    args.push('--n-gpu-layers', String(Number(gpuLayers)));
  }

  const requestedGpuLayers = forceCpu ? 0 : (Number.isFinite(Number(gpuLayers)) ? Number(gpuLayers) : null);
  if (requestedGpuLayers && requestedGpuLayers > 0) {
    const cudaCheck = verifyCudaRuntimeLinked(availability.serverPath);
    if (!cudaCheck.ok) {
      // Newer llama.cpp builds may load CUDA backends via plugins/dlopen, so ldd
      // can be a false negative. Do not hard-fail preflight; let runtime startup
      // prove capability and surface concrete stderr if CUDA is truly unavailable.
      console.warn(
        `[llama-cpp] CUDA link precheck warning (continuing): ` +
        `n-gpu-layers=${requestedGpuLayers} | ${cudaCheck.reason}`
      );
    }
  }

  const childEnv = { ...process.env };
  const visibleDevices = String(cudaVisibleDevices || '').trim();
  if (visibleDevices) {
    childEnv.CUDA_VISIBLE_DEVICES = visibleDevices;
  }

  const child = spawn(availability.serverPath, args, {
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'],
    cwd: path.dirname(availability.serverPath),
    env: childEnv
  });

  let startupError = '';
  let exited = false;
  let exitCode = null;
  let exitSignal = null;
  child.stderr.on('data', (chunk) => {
    startupError += String(chunk || '');
    if (startupError.length > 16000) {
      startupError = startupError.slice(-16000);
    }
  });
  child.on('exit', (code, signal) => {
    exited = true;
    exitCode = code;
    exitSignal = signal;
  });

  const ready = await Promise.race([
    checkServerReady(port, Math.max(30000, Number(startupTimeoutMs) || 600000)),
    new Promise((resolve) => {
      child.once('exit', () => resolve(false));
    })
  ]);
  if (!ready) {
    try {
      if (!exited && child.pid) process.kill(-child.pid, 'SIGTERM');
    } catch {}
    const exitInfo = exited
      ? ` (llama-server exited: code=${String(exitCode)}, signal=${String(exitSignal)})`
      : '';
    throw new Error(
      `llama.cpp server startup timeout on port ${port}${exitInfo}${startupError ? ` (${startupError.trim().slice(0, 1200)})` : ''}`
    );
  }

  return {
    pid: child.pid,
    port,
    process: child,
    modelPath: resolvedModelPath,
    chatTemplate: templateResolved.value || null,
    chatTemplateSource: templateResolved.source || 'none'
  };
}

function verifyCudaRuntimeLinked(serverPath) {
  try {
    if (!fs.existsSync(serverPath)) {
      return { ok: false, reason: `binary missing at ${serverPath}` };
    }
    if (process.platform !== 'linux') {
      return { ok: true };
    }
    const out = execFileSync('ldd', [serverPath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const linkedCuda = /(libcuda\.so|libcudart|libcublas|libggml-cuda)/i.test(String(out || ''));
    if (!linkedCuda) {
      return { ok: false, reason: 'ldd did not show CUDA libraries (libcuda/libcudart/libcublas)' };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message || 'runtime link inspection failed' };
  }
}

async function notReady(op, appDir) {
  const availability = checkAvailable(appDir);
  return {
    success: false,
    message: `[llama-cpp] ${op} is not enabled yet. ${availability.message}`
  };
}

function extractAssistantText(payload) {
  return String(
    payload?.choices?.[0]?.message?.content ||
    payload?.choices?.[0]?.message?.reasoning_content ||
    payload?.choices?.[0]?.message?.reasoning ||
    payload?.choices?.[0]?.message?.thinking ||
    payload?.choices?.[0]?.text ||
    payload?.choices?.[0]?.delta?.content ||
    payload?.choices?.[0]?.delta?.reasoning_content ||
    payload?.choices?.[0]?.delta?.reasoning ||
    payload?.message?.content ||
    payload?.message?.reasoning_content ||
    payload?.message?.reasoning ||
    payload?.message?.thinking ||
    payload?.content ||
    payload?.response ||
    ''
  );
}

function mapOptions(options = {}) {
  const out = {};
  if (options.temperature !== undefined) out.temperature = Number(options.temperature);
  if (options.top_p !== undefined) out.top_p = Number(options.top_p);
  if (options.top_k !== undefined) out.top_k = Number(options.top_k);
  if (options.repeat_penalty !== undefined) out.repeat_penalty = Number(options.repeat_penalty);
  if (options.num_predict !== undefined) out.max_tokens = Number(options.num_predict);
  return out;
}

function normalizeMessagesForLlamaTemplate(messages = []) {
  const rows = Array.isArray(messages) ? messages : [];
  const normalized = [];
  for (const row of rows) {
    const rawRole = String(row?.role || '').trim().toLowerCase();
    const content = String(row?.content || '').trim();
    if (!content) continue;
    const role = rawRole === 'assistant' ? 'assistant' : 'user';
    if (normalized.length === 0 && role === 'assistant') {
      normalized.push({ role: 'user', content: 'Continue.' });
    }
    const prev = normalized[normalized.length - 1];
    if (prev && prev.role === role) {
      prev.content = `${prev.content}\n\n${content}`.trim();
    } else {
      normalized.push({ role, content });
    }
  }
  if (normalized.length === 0) {
    normalized.push({ role: 'user', content: 'Hello.' });
  }
  const last = normalized[normalized.length - 1];
  if (last && last.role !== 'user') {
    normalized.push({ role: 'user', content: 'Continue.' });
  }
  return normalized;
}

function buildCompletionPromptFromMessages(messages = []) {
  const rows = Array.isArray(messages) ? messages : [];
  const lines = [];
  for (const row of rows) {
    const role = String(row?.role || '').trim().toLowerCase() || 'user';
    const content = String(row?.content || '').trim();
    if (!content) continue;
    lines.push(`${role.toUpperCase()}: ${content}`);
  }
  lines.push('ASSISTANT:');
  return lines.join('\n\n');
}

function postJson({ port, pathName, body }) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body || {});
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: pathName,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk.toString(); });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data || '{}');
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
            return;
          }
          reject(new Error(parsed?.error?.message || parsed?.error || `HTTP ${res.statusCode}`));
        } catch {
          reject(new Error(`Invalid JSON response (HTTP ${res.statusCode})`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(120000, () => req.destroy(new Error('llama.cpp request timeout')));
    req.write(payload);
    req.end();
  });
}

function getJson({ port, pathName }) {
  return new Promise((resolve, reject) => {
    const req = http.get({
      hostname: '127.0.0.1',
      port,
      path: pathName
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk.toString(); });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data || '{}');
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
            return;
          }
          reject(new Error(parsed?.error?.message || parsed?.error || `HTTP ${res.statusCode}`));
        } catch {
          reject(new Error(`Invalid JSON response (HTTP ${res.statusCode})`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('llama.cpp request timeout')));
  });
}

async function listModels(appDir, options = {}) {
  const availability = checkAvailable(appDir);
  if (!availability.available) return { success: false, message: availability.message, models: [] };
  const port = Number(options.port);
  if (!port) return { success: false, message: 'llama.cpp listModels requires a running session port', models: [] };
  try {
    const payload = await getJson({ port, pathName: '/v1/models' });
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    const models = rows.map((m) => ({
      name: String(m?.id || ''),
      modified_at: null,
      size: 0
    })).filter((m) => m.name);
    return { success: true, models };
  } catch (err) {
    return { success: false, message: err.message, models: [] };
  }
}

async function sendMessage(appDir, modelName, messages, options = {}) {
  const availability = checkAvailable(appDir);
  if (!availability.available) return { success: false, message: availability.message };
  const port = Number(options.port);
  if (!port) return { success: false, message: 'llama.cpp sendMessage requires a running session port' };
  try {
    const normalizedMessages = normalizeMessagesForLlamaTemplate(messages);
    const req = {
      model: String(modelName || 'local-model'),
      messages: normalizedMessages,
      stream: false,
      ...mapOptions(options)
    };
    const parsed = await postJson({ port, pathName: '/v1/chat/completions', body: req });
    let content = extractAssistantText(parsed);
    const messageObj = parsed?.choices?.[0]?.message || {};
    let completionFallbackRaw = null;

    if (!String(content || '').trim()) {
      // Some model/server combinations expose empty chat payloads but still answer via /completion.
      const completionReq = {
        prompt: buildCompletionPromptFromMessages(normalizedMessages),
        stream: false,
        temperature: req.temperature,
        top_p: req.top_p,
        top_k: req.top_k,
        repeat_penalty: req.repeat_penalty,
        max_tokens: req.max_tokens,
        n_predict: req.max_tokens
      };
      try {
        completionFallbackRaw = await postJson({ port, pathName: '/completion', body: completionReq });
        const completionText = String(
          completionFallbackRaw?.content ||
          completionFallbackRaw?.response ||
          completionFallbackRaw?.choices?.[0]?.text ||
          ''
        ).trim();
        if (completionText) {
          content = completionText;
        }
      } catch {
        // Keep original empty content behavior; caller will surface clear diagnostic.
      }
    }

    return {
      success: true,
      response: {
        message: {
          content,
          reasoning: String(messageObj?.reasoning || ''),
          reasoning_content: String(messageObj?.reasoning_content || ''),
          thinking: String(messageObj?.thinking || '')
        },
        content,
        raw: completionFallbackRaw || parsed,
        raw_chat: parsed,
        raw_completion: completionFallbackRaw,
        done: true,
        done_reason: parsed?.choices?.[0]?.finish_reason || 'stop'
      }
    };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

async function sendMessageStream(appDir, modelName, messages, options = {}) {
  // Current coding-terminal stream transport handles raw HTTP itself.
  // Keep a conservative placeholder until full native llama stream path is added.
  return sendMessage(appDir, modelName, messages, options);
}

module.exports = {
  checkAvailable,
  startLlamaServerOnPort,
  listModels,
  sendMessage,
  sendMessageStream,
  launchModel: (appDir) => notReady('launchModel', appDir),
  openTerminal: (appDir) => notReady('openTerminal', appDir)
};
