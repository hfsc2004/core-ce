/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { createLoadingWindow } = require('./session-manager-standard-loading');

function createStandardWebuiSessionManager(deps = {}) {
  const {
    activeSessions,
    canStartSession,
    getModelsDir,
    getOllamaBinaryPath,
    getWebUIBinaryPath,
    allocatePort,
    releasePort,
    generateSessionId,
    waitForOllamaHealth,
    waitForWebUIReady,
    killProcess,
    closeWebUISession: closeWebUISessionHandler
  } = deps;

  async function startWebUISession() {
const { BrowserWindow, screen } = require('electron');
const { getSafeWindowBounds } = require('../window-bounds');

    const limitCheck = canStartSession();
    if (!limitCheck.allowed) {
      return { success: false, message: limitCheck.message, limitReached: true };
    }

    const ollamaBinaryPath = getOllamaBinaryPath();
    if (!ollamaBinaryPath) {
      return { success: false, message: 'Ollama binary not found for this platform' };
    }

    const webuiBinary = getWebUIBinaryPath();
    if (!webuiBinary) {
      return { success: false, message: 'WebUI binary not found for this platform' };
    }

    const ollamaPort = await allocatePort('webuiOllama', 'WebUI Ollama');
    if (!ollamaPort) {
      return { success: false, message: 'No ports available in WebUI Ollama pool' };
    }

    const webuiPort = await allocatePort('webuiService', 'WebUI Service');
    if (!webuiPort) {
      releasePort('webuiOllama', ollamaPort);
      return { success: false, message: 'No ports available in WebUI Service pool' };
    }

    const sessionId = generateSessionId('webui');

    console.log('[BMOC-Lite] ----------------------------------------------------');
    console.log(`[BMOC-Lite] Starting WebUI Session: ${sessionId}`);
    console.log(`[BMOC-Lite] Ollama Port: ${ollamaPort} (from WebUI Ollama pool)`);
    console.log(`[BMOC-Lite] WebUI Port: ${webuiPort} (from WebUI Service pool)`);
    console.log('[BMOC-Lite] ----------------------------------------------------');

    const loading = createLoadingWindow(BrowserWindow, {
      sessionId,
      initialStatus: 'Starting Open WebUI...'
    });

    try {
      loading.updateStatus('Starting Ollama backend...');

      const ollamaEnv = { ...process.env };
      ollamaEnv.OLLAMA_HOST = `127.0.0.1:${ollamaPort}`;
      ollamaEnv.OLLAMA_MODELS = getModelsDir();

      if (process.platform === 'linux') {
        const libDir = path.join(path.dirname(path.dirname(ollamaBinaryPath)), 'lib', 'ollama');
        ollamaEnv.LD_LIBRARY_PATH = libDir + (ollamaEnv.LD_LIBRARY_PATH ? ':' + ollamaEnv.LD_LIBRARY_PATH : '');
      }

      const ollamaProc = spawn(ollamaBinaryPath, ['serve'], {
        env: ollamaEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false
      });

      console.log(`[BMOC-Lite] Ollama started - PID: ${ollamaProc.pid}`);
      ollamaProc.stdout.on('data', (data) => console.log(`[Ollama:${sessionId}]`, data.toString().trim()));
      ollamaProc.stderr.on('data', (data) => console.log(`[Ollama:${sessionId}]`, data.toString().trim()));

      loading.updateStatus('Waiting for Ollama...');
      const ollamaHealthy = await waitForOllamaHealth(ollamaPort, 45000);
      if (!ollamaHealthy) {
        loading.close();
        ollamaProc.kill('SIGTERM');
        releasePort('webuiOllama', ollamaPort);
        releasePort('webuiService', webuiPort);
        return { success: false, message: 'Ollama failed to start' };
      }

      loading.updateStatus('Starting Open WebUI...');

      const dataDir = path.join(webuiBinary.workingDir, 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const webuiArgs = webuiBinary.isCompiled
        ? ['--port', String(webuiPort)]
        : ['serve', '--port', String(webuiPort)];

      const webuiEnv = {
        ...process.env,
        OLLAMA_API_BASE_URL: `http://127.0.0.1:${ollamaPort}/api`,
        DATA_DIR: dataDir,
        OFFLINE_MODE: 'true',
        WEBUI_SECRET_KEY: 'psf-standard-' + Date.now(),
        WEBUI_AUTH: 'False',
        PORT: String(webuiPort)
      };

      if (webuiBinary.isCompiled) {
        webuiEnv.FRONTEND_BUILD_DIR = path.join(webuiBinary.workingDir, '_internal', 'open_webui', 'frontend');
      }

      const webuiProc = spawn(webuiBinary.path, webuiArgs, {
        cwd: webuiBinary.workingDir,
        env: webuiEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false
      });

      console.log(`[BMOC-Lite] WebUI started - PID: ${webuiProc.pid}`);
      webuiProc.stdout.on('data', (data) => console.log(`[WebUI:${sessionId}]`, data.toString().trim()));
      webuiProc.stderr.on('data', (data) => {
        const msg = data.toString().trim();
        if (!msg.includes('CORS_ALLOW_ORIGIN') && !msg.includes('SyntaxWarning')) {
          console.log(`[WebUI:${sessionId}]`, msg);
        }
      });

      activeSessions.set(sessionId, {
        type: 'webui',
        ollamaPort,
        ollamaPID: ollamaProc.pid,
        ollamaProcess: ollamaProc,
        webuiPort,
        webuiPID: webuiProc.pid,
        webuiProcess: webuiProc,
        startTime: Date.now()
      });

      loading.updateStatus('Waiting for WebUI to be ready...');
      const webuiReady = await waitForWebUIReady(webuiPort, 120000);
      if (!webuiReady) {
        loading.close();
        await closeWebUISessionHandler(sessionId);
        return { success: false, message: 'WebUI failed to start' };
      }

      loading.close();
      const url = `http://127.0.0.1:${webuiPort}`;
      console.log(`[BMOC-Lite] ✓ WebUI session ready: ${sessionId}`);
      console.log(`[BMOC-Lite] Opening WebUI window: ${url}`);

      const webuiBounds = getSafeWindowBounds({
        screenRef: screen,
        width: 1400,
        height: 900,
        minWidth: 900,
        minHeight: 620
      });
      const webuiWindow = new BrowserWindow({
        ...webuiBounds,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        },
        backgroundColor: '#1a1a2e',
        autoHideMenuBar: true,
        title: 'Open WebUI - Pseudo Science Fiction'
      });

      const session = activeSessions.get(sessionId);
      if (session) {
        session.webuiWindow = webuiWindow;
        session.webuiWindowId = webuiWindow.id;
      }

      webuiWindow.on('closed', async () => {
        console.log(`[BMOC-Lite] WebUI window closed - cleaning up session: ${sessionId}`);
        await closeWebUISessionHandler(sessionId);
      });

      webuiWindow.loadURL(url);

      return {
        success: true,
        sessionId,
        ollamaPort,
        webuiPort,
        webuiWindowId: webuiWindow.id,
        url,
        message: 'WebUI session started'
      };
    } catch (err) {
      loading.close();
      console.error('[BMOC-Lite] Error starting WebUI session:', err);
      if (activeSessions.has(sessionId)) {
        await closeWebUISessionHandler(sessionId);
      } else {
        releasePort('webuiOllama', ollamaPort);
        releasePort('webuiService', webuiPort);
      }
      return { success: false, message: err.message };
    }
  }

  async function closeWebUISession(sessionId) {
    const session = activeSessions.get(sessionId);

    if (!session || session.type !== 'webui') {
      return { success: false, message: 'WebUI session not found' };
    }

    if (session.closing) {
      return { success: true, message: 'Session already closing' };
    }
    session.closing = true;

    console.log('[BMOC-Lite] ----------------------------------------------------');
    console.log(`[BMOC-Lite] Closing WebUI Session: ${sessionId}`);
    console.log(`[BMOC-Lite] Killing WebUI PID ${session.webuiPID} on port ${session.webuiPort}`);
    console.log(`[BMOC-Lite] Killing Ollama PID ${session.ollamaPID} on port ${session.ollamaPort}`);
    console.log('[BMOC-Lite] ----------------------------------------------------');

    if (session.webuiWindow && !session.webuiWindow.isDestroyed()) {
      session.webuiWindow.removeAllListeners('closed');
      session.webuiWindow.close();
    }

    await killProcess(session.webuiPID, `WebUI (${sessionId})`);
    await killProcess(session.ollamaPID, `Ollama (${sessionId})`);

    releasePort('webuiService', session.webuiPort);
    releasePort('webuiOllama', session.ollamaPort);

    activeSessions.delete(sessionId);

    console.log(`[BMOC-Lite] ✓ WebUI session closed: ${sessionId} - VRAM FREED`);
    return { success: true, message: 'WebUI session closed' };
  }

  return {
    startWebUISession,
    closeWebUISession
  };
}

module.exports = createStandardWebuiSessionManager;
