/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
'use strict';

const path = require('path');
const http = require('http');
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

  ipcMain.handle('open-ollama-terminal', async (event, modelName, modelVramMB = 0, ollamaPort = null, collection = null, modelId = null) => {
    try {
      let startResult = null;
      let terminalPort = Number(ollamaPort || 0);
      if (terminalPort <= 0) {
        startResult = await ensureTerminalOllamaSession();
        if (!startResult?.success) {
          return { success: false, message: startResult?.message || 'Failed to start BMOC terminal session.' };
        }
        terminalPort = Number(startResult.ollamaPort || startResult.port || 0);
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

      let modelConfig = null;
      if (collection && modelId) {
        const configResult = modelConfigManager.getModelConfig(appDir, collection, modelId);
        if (configResult.success) modelConfig = configResult;
      }
      return await ollamaManager.openOllamaTerminal(
        appDir,
        modelName,
        path.join(appDir, 'preload.js'),
        path.join(appDir, 'src', 'terminal.html'),
        getGpuInfo(),
        modelVramMB,
        terminalPort,
        modelConfig,
        startResult?.sessionId || null
      );
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('launch-model-in-ollama', async (event, modelPath, projectorPath = null, modelId = null, forceCpu = false) => {
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
