/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { createLoadingWindow } = require('./session-manager-standard-loading');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createStandardAnythingLLMSessionManager(deps = {}) {
  const {
    activeSessions,
    canStartSession,
    getModelsDir,
    getOllamaBinaryPath,
    findAnythingLLMInstallation,
    createAnythingLLMEnvFiles,
    allocatePort,
    releasePort,
    generateSessionId,
    waitForOllamaHealth,
    waitForAnythingLLMReady,
    killProcess,
    killProcessGroup,
    closeAnythingLLMSession: closeAnythingLLMSessionHandler
  } = deps;

  async function startAnythingLLMSession() {
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

    const anythingInfo = findAnythingLLMInstallation();
    if (!anythingInfo.found) {
      return { success: false, message: anythingInfo.message };
    }

    const ollamaPort = await allocatePort('anythingllmOllama', 'AnythingLLM Ollama');
    if (!ollamaPort) {
      return { success: false, message: 'No ports available in AnythingLLM Ollama pool' };
    }

    const servicePort = await allocatePort('anythingllmService', 'AnythingLLM Service');
    if (!servicePort) {
      releasePort('anythingllmOllama', ollamaPort);
      return { success: false, message: 'No ports available in AnythingLLM Service pool' };
    }

    const sessionId = generateSessionId('anythingllm');

    console.log('[BMOC-Lite] ----------------------------------------------------');
    console.log(`[BMOC-Lite] Starting AnythingLLM Session: ${sessionId}`);
    console.log(`[BMOC-Lite] Ollama Port: ${ollamaPort} (from AnythingLLM Ollama pool)`);
    console.log(`[BMOC-Lite] Service Port: ${servicePort} (from AnythingLLM Service pool)`);
    console.log(`[BMOC-Lite] Installation: ${anythingInfo.type}`);
    console.log('[BMOC-Lite] ----------------------------------------------------');

    const loading = createLoadingWindow(BrowserWindow, {
      sessionId,
      initialStatus: 'Starting AnythingLLM...'
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
        releasePort('anythingllmOllama', ollamaPort);
        releasePort('anythingllmService', servicePort);
        return { success: false, message: 'Ollama failed to start' };
      }

      loading.updateStatus('Starting AnythingLLM...');

      let anythingProc = null;
      let frontendProc = null;
      let frontendPort = servicePort;

      if (anythingInfo.type === 'compiled') {
        const binaryDir = path.dirname(anythingInfo.binaryPath);
        const storageDir = path.join(binaryDir, 'storage');

        if (!fs.existsSync(storageDir)) {
          fs.mkdirSync(storageDir, { recursive: true });
        }

        const anythingEnv = {
          ...process.env,
          SERVER_PORT: servicePort.toString(),
          LLM_PROVIDER: 'ollama',
          OLLAMA_BASE_PATH: `http://127.0.0.1:${ollamaPort}`,
          STORAGE_DIR: storageDir,
          JWT_SECRET: 'psf-standard-' + Date.now(),
          DISABLE_TELEMETRY: 'true'
        };

        anythingProc = spawn(anythingInfo.binaryPath, [], {
          cwd: binaryDir,
          env: anythingEnv,
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: false
        });

        console.log(`[BMOC-Lite] AnythingLLM (compiled) started - PID: ${anythingProc.pid}`);
      } else if (anythingInfo.type === 'portable') {
        const platformBase = path.join(anythingInfo.basePath, anythingInfo.platformDir);
        const serverDir = anythingInfo.serverDir;
        const serverArchive = anythingInfo.serverArchive;
        const nodePath = anythingInfo.binaryPath;
        const storageDir = path.join(platformBase, 'storage');
        const frontendDist = path.join(platformBase, 'frontend-dist');

        if (!fs.existsSync(serverDir) && fs.existsSync(serverArchive)) {
          console.log('[BMOC-Lite] First run - extracting server archive...');
          loading.updateStatus('First-time setup (30-60s)...');
          try {
            execSync(`tar -xzf "${serverArchive}" -C "${platformBase}"`, {
              stdio: 'pipe',
              timeout: 300000
            });
            console.log('[BMOC-Lite] Server extracted successfully');
          } catch (extractErr) {
            loading.close();
            releasePort('anythingllmOllama', ollamaPort);
            releasePort('anythingllmService', servicePort);
            return { success: false, message: `Failed to extract server archive: ${extractErr.message}` };
          }
        }

        if (!fs.existsSync(serverDir)) {
          loading.close();
          releasePort('anythingllmOllama', ollamaPort);
          releasePort('anythingllmService', servicePort);
          return { success: false, message: 'Server directory not found after extraction' };
        }

        if (!fs.existsSync(storageDir)) {
          fs.mkdirSync(storageDir, { recursive: true });
        }

        const serverPublicDir = path.join(serverDir, 'public');
        if (fs.existsSync(frontendDist) && !fs.existsSync(serverPublicDir)) {
          console.log('[BMOC-Lite] Creating server/public symlink to frontend-dist');
          try {
            fs.symlinkSync(frontendDist, serverPublicDir, 'junction');
            console.log(`[BMOC-Lite] Symlinked: ${serverPublicDir} -> ${frontendDist}`);
          } catch {
            console.log('[BMOC-Lite] Symlink failed, copying frontend-dist to server/public');
            try {
              if (process.platform === 'win32') {
                execSync(`xcopy "${frontendDist}" "${serverPublicDir}" /E /I /H /Y`, { stdio: 'pipe' });
              } else {
                execSync(`cp -r "${frontendDist}" "${serverPublicDir}"`, { stdio: 'pipe' });
              }
            } catch (copyErr) {
              console.warn('[BMOC-Lite] Frontend copy also failed:', copyErr.message);
            }
          }
        }

        const frontendIndexJs = path.join(serverPublicDir, 'index.js');
        if (fs.existsSync(frontendIndexJs)) {
          try {
            let jsContent = fs.readFileSync(frontendIndexJs, 'utf8');
            if (jsContent.includes('http://localhost:3001/api')) {
              jsContent = jsContent.split('http://localhost:3001/api').join('/api');
              fs.writeFileSync(frontendIndexJs, jsContent, 'utf8');
              console.log('[BMOC-Lite] Patched frontend API URL: localhost:3001 -> relative /api');
            }
          } catch (patchErr) {
            console.warn('[BMOC-Lite] Failed to patch frontend API URL:', patchErr.message);
          }
        }

        let entryPoint = 'index.js';
        const serverPkgPath = path.join(serverDir, 'package.json');
        if (fs.existsSync(serverPkgPath)) {
          try {
            const pkg = JSON.parse(fs.readFileSync(serverPkgPath, 'utf8'));
            entryPoint = pkg.main || 'index.js';
          } catch {
            // Use default entrypoint.
          }
        }

        const anythingEnv = {
          ...process.env,
          SERVER_PORT: servicePort.toString(),
          LLM_PROVIDER: 'ollama',
          OLLAMA_BASE_PATH: `http://127.0.0.1:${ollamaPort}`,
          OLLAMA_BASE_URL: `http://127.0.0.1:${ollamaPort}`,
          STORAGE_DIR: storageDir,
          JWT_SECRET: 'psf-standard-portable-' + Date.now(),
          DISABLE_TELEMETRY: 'true',
          OFFLINE_MODE: 'true',
          TZ: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
        };

        if (fs.existsSync(frontendDist)) {
          anythingEnv.FRONTEND_BUILD_DIR = frontendDist;
        }

        anythingProc = spawn(nodePath, [path.join(serverDir, entryPoint)], {
          cwd: serverDir,
          env: anythingEnv,
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: false
        });

        console.log(`[BMOC-Lite] AnythingLLM (portable) started - PID: ${anythingProc.pid}`);
      } else {
        createAnythingLLMEnvFiles(anythingInfo.basePath, ollamaPort, servicePort);

        const anythingEnv = {
          ...process.env,
          SERVER_PORT: servicePort.toString(),
          OLLAMA_BASE_URL: `http://127.0.0.1:${ollamaPort}`,
          OLLAMA_BASE_PATH: `http://127.0.0.1:${ollamaPort}`,
          STORAGE_DIR: path.join(anythingInfo.basePath, 'server', 'storage')
        };

        anythingProc = spawn('yarn', ['dev:server'], {
          cwd: anythingInfo.basePath,
          env: anythingEnv,
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: true,
          detached: true
        });

        console.log(`[BMOC-Lite] AnythingLLM backend started - PID: ${anythingProc.pid}`);
        await sleep(5000);

        frontendPort = servicePort;
        frontendProc = spawn('yarn', ['dev:frontend', '--port', String(servicePort + 1000)], {
          cwd: anythingInfo.basePath,
          env: { ...anythingEnv, PORT: String(servicePort + 1000) },
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: true,
          detached: true
        });

        console.log(`[BMOC-Lite] AnythingLLM frontend started - PID: ${frontendProc.pid}`);
        frontendPort = servicePort + 1000;
      }

      anythingProc.stdout.on('data', (data) => console.log(`[AnythingLLM:${sessionId}]`, data.toString().trim()));
      anythingProc.stderr.on('data', (data) => console.log(`[AnythingLLM:${sessionId}]`, data.toString().trim()));

      activeSessions.set(sessionId, {
        type: 'anythingllm',
        ollamaPort,
        ollamaPID: ollamaProc.pid,
        ollamaProcess: ollamaProc,
        servicePort,
        servicePID: anythingProc.pid,
        serviceProcess: anythingProc,
        frontendPort,
        frontendPID: frontendProc ? frontendProc.pid : null,
        frontendProcess: frontendProc,
        installationType: anythingInfo.type,
        startTime: Date.now()
      });

      loading.updateStatus('Waiting for AnythingLLM...');
      const anythingReady = await waitForAnythingLLMReady(frontendPort, 90000);
      if (!anythingReady) {
        loading.close();
        await closeAnythingLLMSessionHandler(sessionId);
        return { success: false, message: 'AnythingLLM failed to start' };
      }

      loading.close();
      const url = `http://127.0.0.1:${frontendPort}`;
      console.log(`[BMOC-Lite] ✓ AnythingLLM session ready: ${sessionId}`);
      console.log(`[BMOC-Lite] Opening AnythingLLM window: ${url}`);

      const anythingBounds = getSafeWindowBounds({
        screenRef: screen,
        width: 1400,
        height: 900,
        minWidth: 900,
        minHeight: 620
      });
      const anythingWindow = new BrowserWindow({
        ...anythingBounds,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        },
        backgroundColor: '#1a1a2e',
        autoHideMenuBar: true,
        title: 'AnythingLLM - Pseudo Science Fiction'
      });

      const session = activeSessions.get(sessionId);
      if (session) {
        session.anythingWindow = anythingWindow;
        session.anythingWindowId = anythingWindow.id;
      }

      anythingWindow.on('closed', async () => {
        console.log(`[BMOC-Lite] AnythingLLM window closed - cleaning up session: ${sessionId}`);
        await closeAnythingLLMSessionHandler(sessionId);
      });

      anythingWindow.loadURL(url);

      return {
        success: true,
        sessionId,
        ollamaPort,
        servicePort,
        frontendPort,
        anythingWindowId: anythingWindow.id,
        url,
        message: 'AnythingLLM session started'
      };
    } catch (err) {
      loading.close();
      console.error('[BMOC-Lite] Error starting AnythingLLM session:', err);
      if (activeSessions.has(sessionId)) {
        await closeAnythingLLMSessionHandler(sessionId);
      } else {
        releasePort('anythingllmOllama', ollamaPort);
        releasePort('anythingllmService', servicePort);
      }
      return { success: false, message: err.message };
    }
  }

  async function closeAnythingLLMSession(sessionId) {
    const session = activeSessions.get(sessionId);

    if (!session || session.type !== 'anythingllm') {
      return { success: false, message: 'AnythingLLM session not found' };
    }

    if (session.closing) {
      return { success: true, message: 'Session already closing' };
    }
    session.closing = true;

    console.log('[BMOC-Lite] ----------------------------------------------------');
    console.log(`[BMOC-Lite] Closing AnythingLLM Session: ${sessionId}`);
    console.log(`[BMOC-Lite] Killing AnythingLLM backend PID ${session.servicePID} on port ${session.servicePort}`);
    if (session.frontendPID) {
      console.log(`[BMOC-Lite] Killing AnythingLLM frontend PID ${session.frontendPID}`);
    }
    console.log(`[BMOC-Lite] Killing Ollama PID ${session.ollamaPID} on port ${session.ollamaPort}`);
    console.log('[BMOC-Lite] ----------------------------------------------------');

    if (session.anythingWindow && !session.anythingWindow.isDestroyed()) {
      session.anythingWindow.removeAllListeners('closed');
      session.anythingWindow.close();
    }

    if (session.frontendPID) {
      await killProcessGroup(session.frontendPID, `AnythingLLM Frontend (${sessionId})`);
    }

    await killProcess(session.servicePID, `AnythingLLM Backend (${sessionId})`);
    await killProcess(session.ollamaPID, `Ollama (${sessionId})`);

    releasePort('anythingllmService', session.servicePort);
    releasePort('anythingllmOllama', session.ollamaPort);

    activeSessions.delete(sessionId);

    console.log(`[BMOC-Lite] ✓ AnythingLLM session closed: ${sessionId} - VRAM FREED`);
    return { success: true, message: 'AnythingLLM session closed' };
  }

  return {
    startAnythingLLMSession,
    closeAnythingLLMSession
  };
}

module.exports = createStandardAnythingLLMSessionManager;
