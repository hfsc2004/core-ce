/**
 * AnythingLLM Manager Linux x64 - Platform-specific implementation
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */

const { spawn } = require('child_process');
const { BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const common = require('./anythingllm-manager-common');
const privacyEnv = require('../privacy-env');
const sessionManager = require('../session-manager');
const AnythingLLMPortPool = require('../port-pool/port-pool-anythingllm');
const support = require('./anythingllm-manager-linux-x64-support');

let anythingLLMWindow = null;
let anythingLLMBackendProcess = null;
let anythingLLMFrontendProcess = null;
let anythingLLMSessionId = null;
let backendPort = null;
let frontendPort = null;
let ollamaPort = null;

function createLoadingWindow(backend, frontend) {
  const loadingWindow = new BrowserWindow({
    width: 450,
    height: 300,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });

  const loadingHTML = `<!DOCTYPE html><html><head><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
      color: #00ffff; display: flex; flex-direction: column; align-items: center;
      justify-content: center; height: 100vh; border-radius: 15px;
      border: 2px solid #00ffff; -webkit-app-region: drag; cursor: move;
    }
    .logo { font-size: 28px; font-weight: bold; margin-bottom: 10px; text-shadow: 0 0 10px #00ffff; }
    .spinner { width: 60px; height: 60px; border: 4px solid rgba(0,255,255,0.2);
      border-top: 4px solid #00ffff; border-radius: 50%; animation: spin 1s linear infinite; margin: 20px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .ports { font-size: 12px; opacity: 0.7; margin-top: 10px; }
    </style></head><body>
    <div class="logo">Pseudo Science Fiction</div>
    <div class="spinner"></div>
    <div id="status">Starting AnythingLLM...</div>
    <div class="ports">Backend: ${backend} | Frontend: ${frontend}</div>
    </body></html>`;

  loadingWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loadingHTML)}`);
  return loadingWindow;
}

function buildAnythingEnv(__dirname, anythingPath) {
  const storageDir = path.join(anythingPath, 'server', 'storage');
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }

  return {
    ...process.env,
    ...privacyEnv.getPrivacyHardeningEnv(__dirname),
    OLLAMA_BASE_URL: `http://localhost:${ollamaPort}`,
    OLLAMA_BASE_PATH: `http://localhost:${ollamaPort}`,
    OLLAMA_API_BASE_PATH: `http://localhost:${ollamaPort}`,
    OLLAMA_HOST: `http://localhost:${ollamaPort}`,
    SERVER_PORT: backendPort.toString(),
    VITE_API_BASE: `http://localhost:${backendPort}/api`,
    PORT: frontendPort.toString(),
    VITE_PORT: frontendPort.toString(),
    FRONTEND_PORT: frontendPort.toString(),
    DEV_SERVER_PORT: frontendPort.toString(),
    STORAGE_DIR: storageDir,
    DOTENV_CONFIG_PATH: path.join(anythingPath, '.env')
  };
}

function spawnAnythingProcesses(anythingPath, env) {
  console.log('[AnythingLLM Linux x64] Starting backend on port', backendPort);
  anythingLLMBackendProcess = spawn('yarn', ['dev:server'], {
    cwd: anythingPath,
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
    shell: true,
    env
  });

  return new Promise((resolve) => {
    setTimeout(() => {
      console.log('[AnythingLLM Linux x64] Starting frontend on port', frontendPort);
      anythingLLMFrontendProcess = spawn('yarn', ['dev:frontend', '--port', frontendPort.toString()], {
        cwd: anythingPath,
        detached: true,
        stdio: ['ignore', 'ignore', 'ignore'],
        shell: true,
        env
      });
      resolve();
    }, 8000);
  });
}

async function waitForServersReady() {
  console.log('[AnythingLLM Linux x64] Waiting for servers...');
  console.log(`[AnythingLLM Linux x64] Checking backend on port ${backendPort}, frontend on port ${frontendPort}`);

  const maxWait = 90000;
  const startTime = Date.now();
  let backendReady = false;
  let frontendReady = false;

  while (Date.now() - startTime < maxWait) {
    if (!backendReady) {
      backendReady = await common.checkIfServerReady(backendPort);
      if (backendReady) console.log(`[AnythingLLM Linux x64] ✅ Backend ready on port ${backendPort}`);
    }
    if (!frontendReady) {
      frontendReady = await common.checkIfServerReady(frontendPort);
      if (frontendReady) console.log(`[AnythingLLM Linux x64] ✅ Frontend ready on port ${frontendPort}`);
    }
    if (backendReady && frontendReady) break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  return { backendReady, frontendReady };
}

function registerAnythingSession() {
  if (!anythingLLMSessionId) {
    anythingLLMSessionId = sessionManager.registerSession({
      type: 'anythingllm',
      ollamaPort,
      ollamaPID: null,
      servicePort: backendPort,
      servicePID: anythingLLMBackendProcess.pid,
      metadata: {
        platform: 'linux-x64',
        frontendPort,
        frontendPID: anythingLLMFrontendProcess.pid
      }
    });
    console.log(`[AnythingLLM Linux x64] Session registered: ${anythingLLMSessionId}`);
    return;
  }

  sessionManager.updateSession(anythingLLMSessionId, {
    servicePort: backendPort,
    servicePID: anythingLLMBackendProcess?.pid || null,
    metadata: {
      frontendPort,
      frontendPID: anythingLLMFrontendProcess?.pid || null,
      platform: 'linux-x64',
      startedVia: 'session-manager'
    }
  });
  console.log(`[AnythingLLM Linux x64] Session updated: ${anythingLLMSessionId}`);
}

async function launchAnythingLLM(__dirname, gpuInfo = null) {
  try {
    const anythingPath = path.join(__dirname, '..', 'binaries', 'anythingllm');

    const checkResult = await common.checkAnythingLLM(__dirname);
    if (!checkResult.installed) {
      return { success: false, message: 'AnythingLLM not installed. Please install it first.' };
    }

    console.log('[AnythingLLM Linux x64] Starting dedicated Ollama instance via session-manager...');
    ollamaPort = null;

    try {
      const startResult = await sessionManager.startOllamaForService('anythingllm', __dirname, gpuInfo);
      if (!startResult?.success) {
        return { success: false, message: `Failed to start PSF Ollama: ${startResult?.message || 'unknown error'}` };
      }
      anythingLLMSessionId = String(startResult.sessionId || '').trim() || null;
      ollamaPort = Number(startResult.ollamaPort || startResult.port || 0);
      if (!ollamaPort) {
        return { success: false, message: 'Session-manager did not return a valid AnythingLLM Ollama port.' };
      }
      console.log(`[AnythingLLM Linux x64] PSF Ollama started on port ${ollamaPort}`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (err) {
      return { success: false, message: `Failed to start PSF Ollama: ${err.message}` };
    }

    backendPort = AnythingLLMPortPool.getAnythingLLMPort('AnythingLLM Backend');
    frontendPort = AnythingLLMPortPool.getAnythingLLMPort('AnythingLLM Frontend');

    if (!backendPort || !frontendPort) {
      console.error('[AnythingLLM Linux x64] Failed to allocate ports from pool');
      if (backendPort) AnythingLLMPortPool.releasePort(backendPort);
      if (frontendPort) AnythingLLMPortPool.releasePort(frontendPort);
      return { success: false, message: 'Failed to allocate ports for AnythingLLM' };
    }

    console.log(`[AnythingLLM Linux x64] Allocated ports - Backend: ${backendPort}, Frontend: ${frontendPort}`);

    support.createEnvFiles(anythingPath, ollamaPort, backendPort, frontendPort);
    await support.updateOllamaUrlInDatabase(anythingPath, ollamaPort);

    const loadingWindow = createLoadingWindow(backendPort, frontendPort);

    const env = buildAnythingEnv(__dirname, anythingPath);
    await spawnAnythingProcesses(anythingPath, env);
    registerAnythingSession();

    const readiness = await waitForServersReady();
    if (!readiness.backendReady || !readiness.frontendReady) {
      console.error(`[AnythingLLM Linux x64] Timeout waiting for servers. Backend: ${readiness.backendReady}, Frontend: ${readiness.frontendReady}`);
      await cleanupAnythingLLM();
      if (loadingWindow && !loadingWindow.isDestroyed()) loadingWindow.close();
      return {
        success: false,
        message: `AnythingLLM failed to start within timeout. Backend ready: ${readiness.backendReady}, Frontend ready: ${readiness.frontendReady}`
      };
    }

    console.log('[AnythingLLM Linux x64] ✅ Both servers ready!');

    anythingLLMWindow = common.createAnythingLLMWindow(`http://localhost:${frontendPort}`);
    anythingLLMWindow.on('closed', async () => {
      console.log('[AnythingLLM Linux x64] Window closed, cleanup...');
      await cleanupAnythingLLM();
    });

    setTimeout(() => {
      if (loadingWindow && !loadingWindow.isDestroyed()) loadingWindow.close();
    }, 2000);

    return { success: true, message: 'AnythingLLM started successfully!', url: `http://localhost:${frontendPort}` };
  } catch (err) {
    console.error('[AnythingLLM Linux x64] Error:', err);
    await cleanupAnythingLLM();
    return { success: false, message: err.message };
  }
}

async function cleanupAnythingLLM() {
  console.log('[AnythingLLM Linux x64] Starting cleanup...');

  if (anythingLLMBackendProcess) {
    await support.killProcessGroup(anythingLLMBackendProcess, 'backend');
    anythingLLMBackendProcess = null;
  }

  if (anythingLLMFrontendProcess) {
    await support.killProcessGroup(anythingLLMFrontendProcess, 'frontend');
    anythingLLMFrontendProcess = null;
  }

  await support.killRemainingAnythingLLMProcesses(backendPort, frontendPort);

  if (anythingLLMSessionId) {
    const portPools = {
      anythingllm: AnythingLLMPortPool,
      ollama: require('../port-pool/port-pool-ollama')
    };
    await sessionManager.closeSession(anythingLLMSessionId, portPools);
    anythingLLMSessionId = null;
  }

  if (backendPort) {
    AnythingLLMPortPool.releasePort(backendPort);
    console.log(`[AnythingLLM Linux x64] Released backend port ${backendPort}`);
    backendPort = null;
  }

  if (frontendPort) {
    AnythingLLMPortPool.releasePort(frontendPort);
    console.log(`[AnythingLLM Linux x64] Released frontend port ${frontendPort}`);
    frontendPort = null;
  }

  ollamaPort = null;
  anythingLLMWindow = null;

  console.log('[AnythingLLM Linux x64] ✅ Cleanup complete');
}

async function stopAnythingLLM() {
  if (anythingLLMWindow && !anythingLLMWindow.isDestroyed()) {
    anythingLLMWindow.close();
  } else {
    await cleanupAnythingLLM();
  }
}

module.exports = {
  launchAnythingLLM,
  stopAnythingLLM
};
