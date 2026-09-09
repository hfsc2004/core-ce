/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
'use strict';

const path = require('path');
const http = require('http');
const fs = require('fs');
const { BrowserWindow } = require('electron');
const {
  checkLocalVoiceRuntime,
  installLocalVoiceRuntime,
  deleteLocalVoiceRuntime
} = require('../voice-to-text/providers/local-transformers');

function registerOpsHandlers(ipcMain, deps = {}) {
  const appDir = String(deps.appDir || '');
  const binaryManager = deps.binaryManager;
  const anythingLLMManager = deps.anythingLLMManager;
  const settingsManager = deps.settingsManager;
  const downloadManager = deps.downloadManager;
  const installationManager = deps.installationManager;
  const ollamaManager = deps.ollamaManager;
  const modelConfigManager = deps.modelConfigManager;
  const compileManager = deps.compileManager;
  const sessionManager = deps.sessionManager;
  const getGpuInfo = typeof deps.getGpuInfo === 'function' ? deps.getGpuInfo : () => null;
  const terminalSessionRegistry = deps.terminalSessionRegistry instanceof Map ? deps.terminalSessionRegistry : new Map();

  function trackTerminalSession(windowId, sessionId, backend, port) {
    const w = Number(windowId || 0);
    const s = String(sessionId || '').trim();
    if (!w || !s) return;
    terminalSessionRegistry.set(w, {
      sessionId: s,
      backend: String(backend || 'ollama').trim().toLowerCase() || 'ollama',
      port: Number(port || 0) || null
    });
  }

  function normalizeTerminalProvider(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'llamacpp' || raw === 'llama-cpp' || raw === 'llama.cpp') return 'llama.cpp';
    return 'ollama';
  }

  function normalizeSessionBackend(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'llamacpp' || raw === 'llama.cpp' || raw === 'llama-cpp') return 'llama-cpp';
    return raw || 'ollama';
  }

  function catalogRuntimeConfigForModel(modelPath, modelName) {
    const modelsDir = path.join(appDir, '..', 'models');
    const wantedPath = String(modelPath || '').trim();
    const wantedBase = path.basename(wantedPath || '').toLowerCase();
    const wantedName = String(modelName || '').trim().toLowerCase();
    let files = [];
    try {
      files = fs.readdirSync(modelsDir).filter((name) => /^catalog(?:-|\.json)/i.test(name) && /\.json$/i.test(name));
    } catch (_) {
      return {};
    }
    for (const fileName of files) {
      let parsed = null;
      try {
        parsed = JSON.parse(fs.readFileSync(path.join(modelsDir, fileName), 'utf8'));
      } catch (_) {
        continue;
      }
      const entries = [];
      if (Array.isArray(parsed?.models)) {
        parsed.models.forEach((entry) => entries.push({ entry, collectionKey: '' }));
      }
      const collections = parsed?.collections;
      if (collections && typeof collections === 'object') {
        Object.entries(collections).forEach(([collectionKey, collection]) => {
          if (Array.isArray(collection?.models)) {
            collection.models.forEach((entry) => entries.push({ entry, collectionKey }));
          }
        });
      }
      for (const row of entries) {
        const entry = row?.entry || {};
        const names = [
          entry?.id,
          entry?.name,
          entry?.filename,
          path.basename(String(entry?.download_url || '')),
          ...(Array.isArray(entry?.artifacts) ? entry.artifacts.map((artifact) => artifact?.filename) : [])
        ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
        if ((wantedBase && names.includes(wantedBase)) || (wantedName && names.includes(wantedName))) {
          const projectorFilename = String(entry?.projector_filename || entry?.projectorFilename || '').trim();
          const projectorPath = projectorFilename && row.collectionKey
            ? path.join('models', row.collectionKey, projectorFilename)
            : '';
          return {
            forceCpu: entry?.force_cpu === true,
            gpuLayers: Number.isFinite(Number(entry?.gpu_layers)) ? Number(entry.gpu_layers) : null,
            projectorFilename,
            projectorPath
          };
        }
      }
    }
    return {};
  }

  function catalogForceCpuForModel(modelPath, modelName) {
    return catalogRuntimeConfigForModel(modelPath, modelName).forceCpu === true;
  }

  function normalizeLlamaCppModelPathForCompare(modelPath) {
    const raw = String(modelPath || '').trim();
    if (!raw) return '';
    return path.isAbsolute(raw) ? raw : path.resolve(path.join(appDir, '..'), raw);
  }

  function inferSiblingProjectorPath(modelPath) {
    const resolvedModelPath = normalizeLlamaCppModelPathForCompare(modelPath);
    if (!resolvedModelPath) return '';
    const dirPath = path.dirname(resolvedModelPath);
    let entries = [];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch (_) {
      return '';
    }
    const match = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => {
        const lower = String(name || '').toLowerCase();
        return lower.endsWith('.gguf') && (
          lower.startsWith('mmproj') ||
          lower.includes('mmproj') ||
          lower.includes('projector') ||
          lower.includes('clip-vit')
        );
      })
      .sort((a, b) => {
        const score = (name) => String(name || '').toLowerCase().startsWith('mmproj') ? 0 : 1;
        return score(a) - score(b) || String(a || '').localeCompare(String(b || ''));
      })[0];
    const modelFiles = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => /\.gguf$/i.test(String(name || '')) && !/mmproj|projector|clip-vit/i.test(String(name || '')));
    return match && modelFiles.length === 1 ? path.join(dirPath, match) : '';
  }

  async function isOllamaResponsive(port) {
    const candidatePort = Number(port || 0);
    if (candidatePort <= 0) return false;
    return new Promise((resolve) => {
      const req = http.get({
        hostname: '127.0.0.1',
        port: candidatePort,
        path: '/api/tags',
        timeout: 1500
      }, (res) => {
        res.resume();
        resolve(res.statusCode >= 200 && res.statusCode < 500);
      });
      req.on('timeout', () => {
        try { req.destroy(new Error('timeout')); } catch (_) {}
        resolve(false);
      });
      req.on('error', () => resolve(false));
    });
  }

  async function isLlamaCppResponsive(port) {
    const candidatePort = Number(port || 0);
    if (candidatePort <= 0) return false;
    return new Promise((resolve) => {
      const req = http.get({
        hostname: '127.0.0.1',
        port: candidatePort,
        path: '/health',
        timeout: 1500
      }, (res) => {
        res.resume();
        // llama.cpp returns 503 while a model is still loading. That is a live
        // reusable process, not a reason to start a duplicate server/session.
        resolve((res.statusCode >= 200 && res.statusCode < 500) || res.statusCode === 503);
      });
      req.on('timeout', () => {
        try { req.destroy(new Error('timeout')); } catch (_) {}
        resolve(false);
      });
      req.on('error', () => resolve(false));
    });
  }

  function isProcessAlive(pid) {
    const candidatePid = Number(pid || 0);
    if (!Number.isFinite(candidatePid) || candidatePid <= 0) return false;
    try {
      process.kill(candidatePid, 0);
      return true;
    } catch (_) {
      return false;
    }
  }

  async function cleanupTerminalSessions() {
    const sessions = sessionManager?.getActiveSessionsForService?.('terminal') || [];
    if (!Array.isArray(sessions) || sessions.length === 0) return;
    const PortPool = require('../port-pool/port-pool-ollama');
    for (const session of sessions) {
      if (!session?.sessionId) continue;
      try {
        await sessionManager.closeSession(session.sessionId, { ollama: PortPool });
      } catch (_) {
        // best effort
      }
    }
  }

  async function cleanupTerminalLlamaCppSessions() {
    const sessions = sessionManager?.getActiveSessionsForService?.('terminal') || [];
    if (!Array.isArray(sessions) || sessions.length === 0) return;
    const PortPool = require('../port-pool/port-pool-ollama');
    for (const session of sessions) {
      if (!session?.sessionId) continue;
      if (String(session?.metadata?.backend || '').toLowerCase() !== 'llama-cpp') continue;
      try {
        await sessionManager.closeSession(session.sessionId, { ollama: PortPool });
      } catch (_) {
        // best effort
      }
    }
  }

  async function ensureTerminalOllamaSession() {
    if (!sessionManager || typeof sessionManager.startOllamaForService !== 'function') {
      return { success: false, message: 'Session manager is unavailable.' };
    }

    const existingSessions = sessionManager.getActiveSessionsForService?.('terminal') || [];
    const existingPort = Number(sessionManager.getOllamaPortForService?.('terminal') || 0);
    if (existingPort > 0 && await isOllamaResponsive(existingPort)) {
      const matchedSession = Array.isArray(existingSessions)
        ? existingSessions.find((session) => Number(session?.ollamaPort || 0) === existingPort)
        : null;
      return {
        success: true,
        ollamaPort: existingPort,
        sessionId: matchedSession?.sessionId || null,
        reused: true
      };
    }

    await cleanupTerminalSessions();

    return sessionManager.startOllamaForService('terminal', appDir, getGpuInfo());
  }

  async function closeWindowOwnedTerminalSessions(windowId, backendFilter = 'all') {
    const ownerWindowId = Number(windowId || 0);
    if (!ownerWindowId) return;
    const sessions = sessionManager?.getActiveSessionsForService?.('terminal') || [];
    if (!Array.isArray(sessions) || sessions.length === 0) return;
    const PortPool = require('../port-pool/port-pool-ollama');
    const normalizedFilter = String(backendFilter || 'all').trim().toLowerCase();
    for (const session of sessions) {
      const sessionId = String(session?.sessionId || '').trim();
      if (!sessionId) continue;
      const owner = Number(session?.metadata?.ownerWindowId || 0);
      if (!owner || owner !== ownerWindowId) continue;
      const backend = normalizeSessionBackend(session?.metadata?.backend || 'ollama');
      if (normalizedFilter !== 'all' && backend !== normalizedFilter) continue;
      try {
        await sessionManager.closeSession(sessionId, { ollama: PortPool });
        if (ownerWindowId && terminalSessionRegistry.get(ownerWindowId)?.sessionId === sessionId) {
          terminalSessionRegistry.delete(ownerWindowId);
        }
      } catch (_) {
        // best effort
      }
    }
  }

  async function ensureTerminalLlamaCppSession(payload = {}, event = null) {
    if (!sessionManager || typeof sessionManager.startLlamaCppForService !== 'function') {
      return { success: false, message: 'Session manager is unavailable.' };
    }

    const ownerWindow = event && event.sender ? BrowserWindow.fromWebContents(event.sender) : null;
    const ownerWindowId = Number(ownerWindow?.id || 0) || null;
    let modelPath = String(payload?.modelPath || '').trim();
    let projectorPath = String(payload?.projectorPath || payload?.mmprojPath || '').trim();
    let modelName = String(payload?.modelName || '').trim();
    const chatTemplate = String(payload?.chatTemplate || '').trim();
    const gpuInfo = getGpuInfo() || null;
    const nvidiaDetected = String(gpuInfo?.accelerationType || '').toLowerCase() === 'nvidia';
    const requestedGpuLayersRaw = Number(payload?.gpuLayers);
    const requestedContextSize = Math.max(256, Number(payload?.contextSize) || 32768);
    const catalogRuntime = catalogRuntimeConfigForModel(modelPath, modelName);
    if (!projectorPath && catalogRuntime?.projectorPath) {
      projectorPath = String(catalogRuntime.projectorPath || '').trim();
    }
    const catalogGpuLayers = Number(catalogRuntime?.gpuLayers);
    const forceCpu = payload?.forceCpu === true || catalogRuntime?.forceCpu === true;
    const effectiveGpuLayers = forceCpu
      ? 0
      : (Number.isFinite(requestedGpuLayersRaw) && requestedGpuLayersRaw > 0
        ? requestedGpuLayersRaw
        : (Number.isFinite(catalogGpuLayers) && catalogGpuLayers > 0
          ? catalogGpuLayers
          : (nvidiaDetected ? 999 : null)));
    const requireGpuSession = !forceCpu && nvidiaDetected && Number(effectiveGpuLayers) > 0;
    if (modelPath) {
      modelPath = normalizeLlamaCppModelPathForCompare(modelPath);
    }
    if (!projectorPath && modelPath) {
      projectorPath = inferSiblingProjectorPath(modelPath);
    }
    if (projectorPath) {
      projectorPath = normalizeLlamaCppModelPathForCompare(projectorPath);
    }
    const existingSessions = sessionManager.getActiveSessionsForService?.('terminal') || [];
    if (Array.isArray(existingSessions)) {
      for (const session of existingSessions) {
        const sessionId = String(session?.sessionId || '').trim() || '(unknown)';
        const backend = normalizeSessionBackend(session?.metadata?.backend || '');
        if (backend !== 'llama-cpp') {
          console.log(`[main-ops] llama.cpp reuse skip ${sessionId}: backend=${backend || '(empty)'}`);
          continue;
        }
        const sessionOwnerWindowId = Number(session?.metadata?.ownerWindowId || 0) || null;
        if (ownerWindowId && sessionOwnerWindowId && sessionOwnerWindowId !== ownerWindowId) {
          console.log(`[main-ops] llama.cpp reuse skip ${sessionId}: owner ${sessionOwnerWindowId} != ${ownerWindowId}`);
          continue;
        }
        const sessionModelPath = normalizeLlamaCppModelPathForCompare(session?.metadata?.modelPath || '');
        if (modelPath && sessionModelPath && sessionModelPath !== modelPath) {
          console.log(`[main-ops] llama.cpp reuse skip ${sessionId}: modelPath mismatch session="${sessionModelPath}" requested="${modelPath}"`);
          continue;
        }
        const sessionProjectorPath = normalizeLlamaCppModelPathForCompare(session?.metadata?.projectorPath || '');
        if (projectorPath && sessionProjectorPath !== projectorPath) {
          console.log(`[main-ops] llama.cpp reuse skip ${sessionId}: projectorPath mismatch session="${sessionProjectorPath}" requested="${projectorPath}"`);
          continue;
        }
        const sessionModelName = String(session?.metadata?.modelName || '').trim().toLowerCase();
        if (modelName && sessionModelName && sessionModelName !== modelName.toLowerCase()) {
          console.log(`[main-ops] llama.cpp reuse skip ${sessionId}: modelName mismatch session="${sessionModelName}" requested="${modelName.toLowerCase()}"`);
          continue;
        }
        const sessionTemplate = String(session?.metadata?.chatTemplate || '').trim();
        if (chatTemplate && sessionTemplate && sessionTemplate !== chatTemplate) {
          console.log(`[main-ops] llama.cpp reuse skip ${sessionId}: chatTemplate mismatch`);
          continue;
        }
        const sessionContextSize = Number(session?.metadata?.contextSize || 0);
        if (Number.isFinite(requestedContextSize) && requestedContextSize > 0) {
          if (!Number.isFinite(sessionContextSize) || sessionContextSize <= 0) {
            console.log(`[main-ops] llama.cpp reuse skip ${sessionId}: missing session context size`);
            continue;
          }
          if (sessionContextSize < requestedContextSize) {
            console.log(`[main-ops] llama.cpp reuse skip ${sessionId}: context ${sessionContextSize} < ${requestedContextSize}`);
            continue;
          }
        }
        if (requireGpuSession) {
          const sessionForceCpu = session?.metadata?.forceCpu === true;
          const sessionGpuLayers = Number(session?.metadata?.gpuLayers);
          if (sessionForceCpu) {
            console.log(`[main-ops] llama.cpp reuse skip ${sessionId}: existing session is CPU-forced`);
            continue;
          }
          if (!Number.isFinite(sessionGpuLayers) || sessionGpuLayers <= 0) {
            console.log(`[main-ops] llama.cpp reuse skip ${sessionId}: existing session has no GPU layers`);
            continue;
          }
        }
        const port = Number(session?.ollamaPort || 0);
        if (port <= 0) {
          console.log(`[main-ops] llama.cpp reuse skip ${sessionId}: missing port`);
          continue;
        }
        const responsive = await isLlamaCppResponsive(port);
        const alive = responsive || isProcessAlive(session?.ollamaPID);
        if (!alive) {
          console.warn(`[main-ops] Skipping stale llama.cpp terminal session ${sessionId} on port ${port}`);
          continue;
        }
        if (ownerWindowId && session?.sessionId && sessionOwnerWindowId !== ownerWindowId) {
          try {
            sessionManager.updateSession(session.sessionId, {
              metadata: { ...(session.metadata || {}), ownerWindowId }
            });
          } catch (_) {
            // best effort
          }
        }
        console.log(`[main-ops] Reusing BMOC llama.cpp terminal session ${sessionId} on port ${port}${responsive ? '' : ' (process alive, still warming)'}`);
        return {
          success: true,
          port,
          ollamaPort: port,
          sessionId: session?.sessionId || null,
          reused: true,
          modelPath: sessionModelPath || null,
          projectorPath: sessionProjectorPath || null,
          chatTemplate: String(session?.metadata?.chatTemplate || '').trim() || null,
          baseUrl: `http://127.0.0.1:${port}`,
          warming: !responsive
        };
      }
    }

    if (!modelPath) {
      const wantedName = String(modelName || '').trim().toLowerCase();
      if (wantedName) {
        try {
          const discovered = listTerminalLlamaCppModels();
          const models = Array.isArray(discovered?.models) ? discovered.models : [];
          const matched = models.find((candidate) => {
            const name = String(candidate?.name || '').trim().toLowerCase();
            const filename = String(candidate?.filename || '').trim().toLowerCase();
            return name === wantedName || filename === wantedName || filename.replace(/\.gguf$/i, '') === wantedName;
          });
          const matchedPath = String(matched?.pathAbs || '').trim();
          if (matchedPath) modelPath = matchedPath;
          const matchedProjectorPath = String(matched?.projectorPathAbs || '').trim();
          if (!projectorPath && matchedProjectorPath) projectorPath = matchedProjectorPath;
        } catch (_) {
          // Fall through to explicit error below.
        }
      }
      if (!modelPath) {
        return {
          success: false,
          message: modelName
            ? `Could not resolve llama.cpp GGUF model "${modelName}". Select a model from the terminal dropdown.`
            : 'Select a llama.cpp GGUF model before sending a message.'
        };
      }
    }
    modelPath = normalizeLlamaCppModelPathForCompare(modelPath);

    await cleanupTerminalLlamaCppSessions();

    const startResult = await sessionManager.startLlamaCppForService('terminal', appDir, {
      ownerWindowId,
      modelPath,
      projectorPath: projectorPath || null,
      modelName: modelName || null,
      chatTemplate: chatTemplate || null,
      contextSize: requestedContextSize,
      threads: Number.isFinite(Number(payload?.threads)) ? Number(payload.threads) : undefined,
      parallel: Number.isFinite(Number(payload?.parallel)) ? Number(payload.parallel) : undefined,
      gpuLayers: effectiveGpuLayers,
      forceCpu,
      splitMode: forceCpu ? null : (payload?.splitMode || (nvidiaDetected ? 'none' : null)),
      mainGpuIndex: forceCpu
        ? null
        : (Number.isFinite(Number(payload?.mainGpuIndex)) ? Number(payload.mainGpuIndex) : undefined),
      cudaVisibleDevices: forceCpu ? null : payload?.cudaVisibleDevices,
      startupTimeoutMs: Number.isFinite(Number(payload?.startupTimeoutMs)) ? Number(payload.startupTimeoutMs) : undefined
    });

    if (!startResult?.success) {
      return {
        success: false,
        message: startResult?.message || 'Failed to start BMOC llama.cpp terminal session.'
      };
    }

    const port = Number(startResult.port || startResult.ollamaPort || 0);
    if (ownerWindowId && startResult.sessionId) {
      trackTerminalSession(ownerWindowId, startResult.sessionId, 'llama-cpp', port);
    }
    return {
      success: true,
      port,
      ollamaPort: port,
      sessionId: startResult.sessionId || null,
      reused: false,
      modelPath,
      projectorPath: projectorPath || null,
      modelName: modelName || null,
      forceCpu,
      chatTemplate: String(startResult?.chatTemplate || chatTemplate || '').trim() || null,
      baseUrl: port > 0 ? `http://127.0.0.1:${port}` : ''
    };
  }

  function listTerminalLlamaCppModels() {
    const projectRoot = path.join(appDir, '..');
    const modelsRoot = path.join(projectRoot, 'models');
    if (!fs.existsSync(modelsRoot)) {
      return { success: true, models: [], message: 'Models directory not found.' };
    }

    const skipTopLevel = new Set(['blobs', 'manifests']);
    const models = [];

    function isLikelyProjectorFile(fileName = '') {
      const lower = String(fileName || '').toLowerCase();
      if (!lower.endsWith('.gguf')) return false;
      return (
        lower.startsWith('mmproj') ||
        lower.includes('mmproj') ||
        lower.includes('projector') ||
        lower.includes('clip-vit')
      );
    }

    function findSiblingProjector(dirPath, relDir = '') {
      let entries = [];
      try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true });
      } catch (_) {
        return null;
      }
      const modelFiles = entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .filter((name) => /\.gguf$/i.test(String(name || '')) && !isLikelyProjectorFile(name));
      if (modelFiles.length !== 1) return null;
      const projectors = entries
        .filter((entry) => entry.isFile() && isLikelyProjectorFile(entry.name))
        .map((entry) => {
          const absPath = path.join(dirPath, entry.name);
          let sizeBytes = 0;
          try {
            sizeBytes = Number(fs.statSync(absPath).size || 0);
          } catch (_) {
            sizeBytes = 0;
          }
          return {
            filename: entry.name,
            pathAbs: absPath,
            pathRel: relDir ? path.join(relDir, entry.name) : entry.name,
            sizeBytes
          };
        })
        .sort((a, b) => {
          const score = (item) => String(item.filename || '').toLowerCase().startsWith('mmproj') ? 0 : 1;
          return score(a) - score(b) || String(a.filename || '').localeCompare(String(b.filename || ''));
        });
      return projectors[0] || null;
    }

    function walk(dirPath, relDir = '') {
      let entries = [];
      try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true });
      } catch (_) {
        return;
      }
      for (const entry of entries) {
        const entryName = String(entry?.name || '');
        if (!entryName) continue;
        const absPath = path.join(dirPath, entryName);
        const relPath = relDir ? path.join(relDir, entryName) : entryName;
        if (entry.isDirectory()) {
          if (!relDir && skipTopLevel.has(entryName)) continue;
          walk(absPath, relPath);
          continue;
        }
        if (!entry.isFile()) continue;
        if (!/\.gguf$/i.test(entryName)) continue;
        if (isLikelyProjectorFile(entryName)) continue;
        let statSize = 0;
        try {
          statSize = Number(fs.statSync(absPath).size || 0);
        } catch (_) {
          statSize = 0;
        }
        const siblingProjector = findSiblingProjector(dirPath, relDir);
        models.push({
          name: entryName.replace(/\.gguf$/i, ''),
          filename: entryName,
          pathAbs: absPath,
          pathRel: relPath,
          sizeBytes: statSize,
          projectorPathAbs: siblingProjector?.pathAbs || '',
          projectorPathRel: siblingProjector?.pathRel || '',
          projectorFilename: siblingProjector?.filename || '',
          projectorSizeBytes: Number(siblingProjector?.sizeBytes || 0)
        });
      }
    }

    walk(modelsRoot, '');
    models.sort((a, b) => String(a.pathRel || '').localeCompare(String(b.pathRel || '')));
    return { success: true, models };
  }

  ipcMain.handle('check-binaries', async (event, binaryType) => {
    try {
      if (binaryType === 'anythingllm') {
        return await anythingLLMManager.checkAnythingLLM(appDir);
      }
      return await binaryManager.checkBinaries(appDir, binaryType);
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('check-llama-cpp-build', async () => {
    try {
      const result = binaryManager.runLlamaCppBuildPreflight(appDir);
      return { success: true, ...result };
    } catch (err) {
      return { success: false, message: err.message || 'Failed to run llama.cpp build preflight' };
    }
  });

  ipcMain.handle('download-model', async (event, modelId, url, collectionId, filename, projectorUrl = null, projectorFilename = null, expectedSHA256 = null) => {
    const hfToken = settingsManager.getHuggingFaceToken(appDir);
    return await downloadManager.downloadModel(
      appDir,
      modelId,
      url,
      collectionId,
      filename,
      projectorUrl,
      projectorFilename,
      expectedSHA256,
      (progressData) => event.sender.send('download-progress', progressData),
      hfToken
    );
  });

  ipcMain.handle('download-binaries', async (event, type) => {
    try {
      if (type === 'ollama') {
        return await binaryManager.downloadOllama(appDir, (progress) => event.sender.send('download-progress', progress));
      }
      if (type === 'anythingllm') {
        event.sender.send('download-progress', { progress: 0, filename: 'anythingllm', completed: 0, total: 1 });
        const result = await installationManager.installAnythingLLM(appDir, (output) => {
          let progress = 25;
          if (output.includes('Step 2/4')) progress = 50;
          else if (output.includes('Step 3/4')) progress = 75;
          else if (output.includes('Step 4/4')) progress = 90;
          else if (output.includes('✅')) progress = 100;
          event.sender.send('download-progress', { progress, filename: 'anythingllm', completed: 0, total: 1, message: output });
        });
        event.sender.send('download-progress', { progress: 100, filename: 'anythingllm', completed: 1, total: 1 });
        return result;
      }
      if (type === 'nodejs') {
        return await binaryManager.downloadNodeJS(appDir, (progress) => event.sender.send('download-progress', progress));
      }
      if (type === 'arduino-cli') {
        return await binaryManager.downloadArduinoCli(appDir, (progress) => event.sender.send('download-progress', progress));
      }
      if (type === 'esptool') {
        return await binaryManager.downloadEsptool(appDir, (progress) => event.sender.send('download-progress', progress));
      }
      if (type === 'git') {
        return await binaryManager.downloadGit(appDir, (progress) => event.sender.send('download-progress', progress));
      }
      if (type === 'llama-cpp') {
        return await binaryManager.downloadLlamaCpp(appDir, (progress) => event.sender.send('download-progress', progress));
      }
      return { success: false, message: `Unknown binary type: ${type}` };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('launch-ollama', async () => {
    try {
      const startResult = await ensureTerminalOllamaSession();
      if (!startResult?.success) {
        return { success: false, message: startResult?.message || 'Failed to start BMOC terminal session.' };
      }
      const port = Number(startResult.ollamaPort || startResult.port || 0);
      return {
        success: true,
        port,
        ollamaPort: port,
        sessionId: startResult.sessionId || null,
        message: startResult.reused
          ? `Using existing BMOC terminal session on port ${port}`
          : `Started BMOC terminal session on port ${port}`
      };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('ensure-terminal-llamacpp-session', async (event, payload = {}) => {
    try {
      return await ensureTerminalLlamaCppSession(payload || {}, event);
    } catch (err) {
      return { success: false, message: err.message || String(err) };
    }
  });

  ipcMain.handle('terminal-switch-provider', async (event, payload = {}) => {
    try {
      const ownerWindow = event && event.sender ? BrowserWindow.fromWebContents(event.sender) : null;
      const ownerWindowId = Number(ownerWindow?.id || 0) || null;
      if (!ownerWindowId) {
        return { success: false, message: 'Terminal window context unavailable for provider switch.' };
      }

      const provider = String(payload?.provider || '').trim().toLowerCase();
      if (provider !== 'ollama' && provider !== 'llama.cpp') {
        return { success: false, message: `Unsupported provider "${provider}"` };
      }

      if (provider === 'llama.cpp') {
        await closeWindowOwnedTerminalSessions(ownerWindowId, 'ollama');
        const startResult = await ensureTerminalLlamaCppSession(payload || {}, event);
        if (!startResult?.success) {
          return { success: false, message: startResult?.message || 'Failed to start llama.cpp provider session.' };
        }
        return {
          success: true,
          provider: 'llama.cpp',
          port: Number(startResult.port || startResult.ollamaPort || 0),
          sessionId: startResult.sessionId || null,
          baseUrl: startResult.baseUrl || null
        };
      }

      await closeWindowOwnedTerminalSessions(ownerWindowId, 'llama-cpp');
      const startResult = await sessionManager.startOllamaForService('terminal', appDir, getGpuInfo());
      if (!startResult?.success) {
        return { success: false, message: startResult?.message || 'Failed to start Ollama provider session.' };
      }
      const sessionId = String(startResult.sessionId || '').trim();
      if (sessionId) {
        const existing = sessionManager.getSession?.(sessionId) || null;
        const existingMeta = (existing?.metadata && typeof existing.metadata === 'object') ? existing.metadata : {};
        sessionManager.updateSession?.(sessionId, {
          metadata: {
            ...existingMeta,
            backend: 'ollama',
            ownerWindowId,
            serviceType: 'terminal',
            startedVia: 'terminal-switch-provider'
          }
        });
      }
      trackTerminalSession(ownerWindowId, sessionId, 'ollama', Number(startResult.ollamaPort || startResult.port || 0));
      return {
        success: true,
        provider: 'ollama',
        port: Number(startResult.ollamaPort || startResult.port || 0),
        sessionId: sessionId || null
      };
    } catch (err) {
      return { success: false, message: err.message || String(err) };
    }
  });

  ipcMain.handle('terminal-list-llamacpp-models', async () => {
    try {
      return listTerminalLlamaCppModels();
    } catch (err) {
      return { success: false, message: err.message || String(err), models: [] };
    }
  });

  ipcMain.handle('open-ollama-terminal', async (event, modelName, modelVramMB = 0, ollamaPort = null, collection = null, modelId = null, launchOptions = null) => {
    try {
      const options = (launchOptions && typeof launchOptions === 'object' && !Array.isArray(launchOptions))
        ? launchOptions
        : {};
      const preferredProvider = normalizeTerminalProvider(
        options.provider || settingsManager.getInferenceBackend?.(appDir) || 'ollama'
      );
      let startResult = null;
      let terminalPort = Number(ollamaPort || 0);
      const ownerWindow = event && event.sender ? BrowserWindow.fromWebContents(event.sender) : null;
      const ownerWindowId = Number(ownerWindow?.id || 0) || null;
      let modelConfig = null;
      if (collection && modelId) {
        const configResult = modelConfigManager.getModelConfig(appDir, collection, modelId);
        if (configResult.success) modelConfig = configResult;
      }
      const modelParams = (modelConfig?.params && typeof modelConfig.params === 'object') ? modelConfig.params : {};

      if (preferredProvider === 'llama.cpp') {
        await closeWindowOwnedTerminalSessions(ownerWindowId, 'ollama');
        const explicitLlamaCppModelPath = String(options.modelPath || options.llamaCppModelPath || '').trim();
        const explicitProjectorPath = String(options.projectorPath || options.mmprojPath || '').trim();
        const explicitLlamaCppModelName = String(options.modelName || modelName || '').trim();
        if (explicitLlamaCppModelPath || explicitLlamaCppModelName) {
          startResult = await ensureTerminalLlamaCppSession({
            ...options,
            modelName: explicitLlamaCppModelName,
            modelPath: explicitLlamaCppModelPath,
            projectorPath: explicitProjectorPath,
            llamaCppModelPath: String(options.llamaCppModelPath || options.modelPath || '').trim(),
            contextSize: Number.isFinite(Number(options.contextSize))
              ? Number(options.contextSize)
              : (Number.isFinite(Number(modelParams.num_ctx)) ? Number(modelParams.num_ctx) : undefined),
            gpuLayers: Number.isFinite(Number(options.gpuLayers))
              ? Number(options.gpuLayers)
              : (Number.isFinite(Number(modelParams.num_gpu)) ? Number(modelParams.num_gpu) : undefined)
          }, event);
          if (!startResult?.success) {
            return { success: false, message: startResult?.message || 'Failed to start BMOC llama.cpp terminal session.' };
          }
          terminalPort = Number(startResult.port || startResult.ollamaPort || 0);
        } else {
          startResult = {
            success: true,
            sessionId: null,
            reused: false,
            selectorOnly: true,
            modelPath: '',
            modelName: '',
            forceCpu: options.forceCpu === true
          };
          terminalPort = 0;
        }
      } else {
        if (terminalPort <= 0) {
          // For dedicated Terminal windows, always create a fresh BMOC terminal session/port
          // so each window is isolated and can be linked distinctly.
          startResult = await sessionManager.startOllamaForService('terminal', appDir, getGpuInfo());
          if (!startResult?.success) {
            return { success: false, message: startResult?.message || 'Failed to start BMOC terminal session.' };
          }
          terminalPort = Number(startResult.ollamaPort || startResult.port || 0);
        } else {
          // Strict BMOC gate: explicit ports are only allowed if BMOC already owns them.
          const sessions = sessionManager.getActiveSessionsForService?.('terminal') || [];
          const matchedSession = Array.isArray(sessions)
            ? sessions.find((session) => Number(session?.ollamaPort || 0) === terminalPort)
            : null;
          if (!matchedSession?.sessionId) {
            return { success: false, message: `BMOC rejected non-owned terminal port ${terminalPort}.` };
          }
          startResult = {
            success: true,
            ollamaPort: terminalPort,
            sessionId: matchedSession.sessionId,
            reused: true
          };
        }
      }
      if (!startResult?.sessionId && terminalPort > 0) {
        const sessions = sessionManager.getActiveSessionsForService?.('terminal') || [];
        const matchedSession = Array.isArray(sessions)
          ? sessions.find((session) => Number(session?.ollamaPort || 0) === terminalPort)
          : null;
        if (matchedSession?.sessionId) {
          startResult = { ...(startResult || {}), sessionId: matchedSession.sessionId };
        }
      }
      const openResult = await ollamaManager.openOllamaTerminal(
        appDir,
        modelName,
        path.join(appDir, 'preload.js'),
        path.join(appDir, 'src', 'terminal.html'),
        getGpuInfo(),
        modelVramMB,
        terminalPort,
        modelConfig,
        startResult?.sessionId || null,
        {
          provider: preferredProvider,
          baseUrl: preferredProvider === 'llama.cpp'
            ? (terminalPort > 0 ? `http://127.0.0.1:${terminalPort}` : '')
            : String(options.baseUrl || '').trim(),
          providerModel: String(options.providerModel || options.modelName || modelName || '').trim(),
          llamaCppModelPath: String(startResult?.modelPath || options.llamaCppModelPath || options.modelPath || '').trim(),
          projectorPath: String(startResult?.projectorPath || options.projectorPath || '').trim(),
          llamaCppForceCpu: options.forceCpu === true || startResult?.forceCpu === true || catalogForceCpuForModel(
            startResult?.modelPath || options.llamaCppModelPath || options.modelPath || '',
            options.modelName || modelName || ''
          )
        }
      );
      const openedWindowId = Number(openResult?.windowId || 0);
      const openedSessionId = String(startResult?.sessionId || '').trim();
      if (openResult?.success && openedWindowId > 0 && openedSessionId) {
        const existing = sessionManager.getSession?.(openedSessionId) || null;
        const existingMeta = (existing?.metadata && typeof existing.metadata === 'object') ? existing.metadata : {};
        sessionManager.updateSession?.(openedSessionId, {
          metadata: {
            ...existingMeta,
            backend: normalizeSessionBackend(preferredProvider),
            ownerWindowId: openedWindowId,
            serviceType: 'terminal',
            startedVia: existingMeta.startedVia || 'open-ollama-terminal'
          }
        });
        trackTerminalSession(openedWindowId, openedSessionId, preferredProvider, terminalPort);
      }
      return { ...openResult, provider: preferredProvider };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('launch-model-in-ollama', async (event, modelPath, projectorPath = null, modelId = null, forceCpu = false) => {
    const preferredProvider = normalizeTerminalProvider(settingsManager.getInferenceBackend?.(appDir) || 'ollama');
    if (preferredProvider === 'llama.cpp') {
      const rawModelPath = String(modelPath || '').trim();
      const resolvedModelPath = path.isAbsolute(rawModelPath)
        ? rawModelPath
        : path.resolve(path.join(appDir, '..'), rawModelPath);
      if (!rawModelPath || !fs.existsSync(resolvedModelPath)) {
        return {
          success: false,
          provider: 'llama.cpp',
          message: `llama.cpp model file not found: ${rawModelPath || 'empty'}`
        };
      }
      return {
        success: true,
        provider: 'llama.cpp',
        modelName: path.basename(resolvedModelPath).replace(/\.gguf$/i, ''),
        modelPath: rawModelPath,
        llamaCppModelPath: rawModelPath,
        projectorPath: projectorPath || null,
        forceCpu: !!forceCpu
      };
    }

    const startResult = await ensureTerminalOllamaSession();
    if (!startResult?.success) {
      return { success: false, message: startResult?.message || 'Failed to start BMOC terminal session.' };
    }
    const terminalPort = Number(startResult.ollamaPort || startResult.port || 0);
    if (terminalPort <= 0) {
      return { success: false, message: 'BMOC terminal session did not return a valid Ollama port.' };
    }

    const progressCallback = (progressData) => {
      event.sender.send('blob-upload-progress', { modelId: modelId || 'unknown', ...progressData });
    };
    return await ollamaManager.launchModelInOllama(
      modelPath,
      appDir,
      forceCpu ? null : getGpuInfo(),
      projectorPath,
      progressCallback,
      forceCpu,
      {
        preferredPort: terminalPort,
        preventAutoStart: true,
        bindOnly: true
      }
    );
  });

  ipcMain.handle('ollama-send-message-stream', async (event, modelName, messages, options = {}) => {
    return await ollamaManager.sendMessageStream(modelName, messages, options);
  });

  ipcMain.handle('ollama-stop-stream', async (event, options = {}) => {
    return ollamaManager.stopMessageStream(options);
  });

  ipcMain.handle('build-python-webui', async (event) => {
    return await installationManager.buildPythonWebUI(
      appDir,
      (output) => event.sender.send('python-webui-build-output', output)
    );
  });

  ipcMain.handle('check-voice-runtime', async (event, payload = {}) => {
    try {
      return await checkLocalVoiceRuntime({
        appDir,
        settingsManager
      }, payload || {});
    } catch (err) {
      return { success: false, message: err.message || String(err) };
    }
  });

  ipcMain.handle('install-voice-runtime', async (event, payload = {}) => {
    try {
      return await installLocalVoiceRuntime({
        appDir,
        settingsManager
      }, payload || {});
    } catch (err) {
      return { success: false, message: err.message || String(err) };
    }
  });

  ipcMain.handle('delete-voice-runtime', async (event, payload = {}) => {
    try {
      return await deleteLocalVoiceRuntime({
        appDir,
        settingsManager
      }, payload || {});
    } catch (err) {
      return { success: false, message: err.message || String(err) };
    }
  });

  ipcMain.handle('install-anythingllm', async (event) => {
    return await installationManager.installAnythingLLM(
      appDir,
      (output) => event.sender.send('install-output', { type: 'anythingllm', output })
    );
  });

  ipcMain.handle('delete-installation', async (event, type) => {
    return await installationManager.deleteInstallation(appDir, type);
  });

  ipcMain.handle('compile-project', async (event, config) => {
    return await compileManager.compileProject(
      appDir,
      config,
      (output) => event.sender.send('compile-progress', output)
    );
  });
}

module.exports = {
  registerOpsHandlers
};
