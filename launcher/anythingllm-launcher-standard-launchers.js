/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
const { BrowserWindow } = require('electron');
const { spawn, execSync: execSyncLocal } = require('child_process');
const path = require('path');
const fs = require('fs');

async function waitForPing(url, maxWaitMs, intervalMs = 1000) {
  const start = Date.now();
  while ((Date.now() - start) < maxWaitMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return true;
      }
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

function createLoadingWindow(backendPort, frontendPort = null) {
  let loadingWindow = new BrowserWindow({
    width: 450,
    height: 300,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const portLabel = frontendPort !== null
    ? `Backend: ${backendPort} | Frontend: ${frontendPort}`
    : `Port: ${backendPort}`;

  const loadingHTML = `<!DOCTYPE html><html><head><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
      color: #00ffff;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      height: 100vh; border-radius: 15px; border: 2px solid #00ffff;
      -webkit-app-region: drag; cursor: move;
    }
    .logo { font-size: 28px; font-weight: bold; margin-bottom: 10px; text-shadow: 0 0 10px #00ffff; }
    .spinner {
      width: 60px; height: 60px;
      border: 4px solid rgba(0,255,255,0.2); border-top: 4px solid #00ffff;
      border-radius: 50%; animation: spin 1s linear infinite; margin: 20px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .status { font-size: 16px; color: #fff; margin-bottom: 5px; }
    .substatus { font-size: 12px; color: #888; margin-top: 5px; }
    .ports { font-size: 12px; opacity: 0.7; margin-top: 10px; }
  </style></head><body>
    <div class="logo">Pseudo Science Fiction</div>
    <div class="spinner"></div>
    <div class="status" id="status">Starting AnythingLLM...</div>
    <div class="substatus" id="substatus"></div>
    <div class="ports">${portLabel}</div>
  </body></html>`;

  loadingWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(loadingHTML));

  const updateStatus = (status, substatus = '') => {
    if (loadingWindow && !loadingWindow.isDestroyed()) {
      loadingWindow.webContents.executeJavaScript(
        `document.getElementById('status').innerText='${status}';` +
        `document.getElementById('substatus').innerText='${substatus}';`
      ).catch(() => {});
    }
  };

  const closeLoadingWindow = () => {
    if (loadingWindow && !loadingWindow.isDestroyed()) {
      loadingWindow.close();
      loadingWindow = null;
    }
  };

  return { updateStatus, closeLoadingWindow };
}

async function launchCompiledAnythingLLM(options) {
  const { binaryPath, anythingPath, platformDir, ollamaPort } = options;
  const anythingLLMPortPool = require('./modules/port-pool/port-pool-anythingllm.js');

  const allocatedPort = anythingLLMPortPool.getAnythingLLMPort('AnythingLLM Compiled');
  if (allocatedPort === null) {
    return { success: false, message: 'Failed to allocate backend port' };
  }
  const backendPort = allocatedPort;
  const frontendPort = backendPort;

  console.log(`[AnythingLLM Compiled] Binary: ${binaryPath}`);
  console.log(`[AnythingLLM Compiled] Port: ${backendPort}`);
  console.log(`[AnythingLLM Compiled] Ollama: http://127.0.0.1:${ollamaPort}`);

  const storageDir = path.join(anythingPath, platformDir, 'storage');
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }

  const env = {
    ...process.env,
    SERVER_PORT: backendPort.toString(),
    LLM_PROVIDER: 'ollama',
    OLLAMA_BASE_PATH: `http://127.0.0.1:${ollamaPort}`,
    STORAGE_DIR: storageDir,
    JWT_SECRET: 'psf-standard-compiled-' + Date.now(),
    DISABLE_TELEMETRY: 'true',
    TZ: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  };

  const backendProcess = spawn(binaryPath, [], {
    cwd: path.dirname(binaryPath),
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    env
  });

  backendProcess.stdout.on('data', (data) => {
    console.log('[AnythingLLM Compiled]', data.toString().trim());
  });

  backendProcess.stderr.on('data', (data) => {
    console.log('[AnythingLLM Compiled]', data.toString().trim());
  });

  backendProcess.on('exit', (code) => {
    console.log(`[AnythingLLM Compiled] Exited with code ${code}`);
  });

  console.log(`[AnythingLLM Compiled] Started - PID: ${backendProcess.pid}`);

  const ready = await waitForPing(`http://127.0.0.1:${backendPort}/api/ping`, 30000, 1000);
  if (!ready) {
    console.log('[AnythingLLM Compiled] Server failed to start in time');
    backendProcess.kill('SIGTERM');
    return { success: false, message: 'AnythingLLM server failed to start' };
  }

  console.log('[AnythingLLM Compiled] Server ready');
  return {
    success: true,
    backendPort,
    frontendPort,
    backendProcess,
    backendPid: backendProcess.pid,
    message: `Compiled AnythingLLM running on port ${backendPort}`
  };
}

async function launchPortableAnythingLLM(options) {
  const { nodePath, anythingPath, platformDir, ollamaPort } = options;
  const anythingLLMPortPool = require('./modules/port-pool/port-pool-anythingllm.js');

  const platformBase = path.join(anythingPath, platformDir);
  const serverDir = path.join(platformBase, 'server');
  const serverArchive = path.join(platformBase, 'server.tar.gz');
  const storageDir = path.join(platformBase, 'storage');
  const frontendDist = path.join(platformBase, 'frontend-dist');

  const allocatedPort = anythingLLMPortPool.getAnythingLLMPort('AnythingLLM Portable');
  if (allocatedPort === null) {
    return { success: false, message: 'Failed to allocate backend port' };
  }
  const backendPort = allocatedPort;
  const frontendPort = backendPort;

  console.log(`[AnythingLLM Portable] Node: ${nodePath}`);
  console.log(`[AnythingLLM Portable] Port: ${backendPort}`);
  console.log(`[AnythingLLM Portable] Ollama: http://127.0.0.1:${ollamaPort}`);

  const ui = createLoadingWindow(backendPort);

  try {
    if (!fs.existsSync(serverDir) && fs.existsSync(serverArchive)) {
      console.log('[AnythingLLM Portable] First run - extracting server archive...');
      ui.updateStatus('First-time setup...', 'Extracting server files (30-60 seconds)');
      execSyncLocal(`tar -xzf "${serverArchive}" -C "${platformBase}"`, {
        stdio: 'pipe',
        timeout: 300000
      });
      console.log('[AnythingLLM Portable] Server extracted successfully');
      ui.updateStatus('Extraction complete', 'Starting server...');
    }

    if (!fs.existsSync(serverDir)) {
      ui.closeLoadingWindow();
      return { success: false, message: `Server directory not found at ${serverDir}` };
    }

    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }

    ui.updateStatus('Starting AnythingLLM server...');

    const serverPackageJson = path.join(serverDir, 'package.json');
    let entryPoint = 'index.js';
    if (fs.existsSync(serverPackageJson)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(serverPackageJson, 'utf8'));
        entryPoint = pkg.main || 'index.js';
      } catch (_) {}
    }

    const entryPath = path.join(serverDir, entryPoint);
    console.log(`[AnythingLLM Portable] Entry point: ${entryPath}`);

    const env = {
      ...process.env,
      SERVER_PORT: backendPort.toString(),
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
      env.FRONTEND_BUILD_DIR = frontendDist;
    }

    const backendProcess = spawn(nodePath, [entryPath], {
      cwd: serverDir,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      env
    });

    backendProcess.stdout.on('data', (data) => {
      console.log('[AnythingLLM Portable]', data.toString().trim());
    });

    backendProcess.stderr.on('data', (data) => {
      console.log('[AnythingLLM Portable]', data.toString().trim());
    });

    backendProcess.on('exit', (code) => {
      console.log(`[AnythingLLM Portable] Exited with code ${code}`);
    });

    console.log(`[AnythingLLM Portable] Started - PID: ${backendProcess.pid}`);
    ui.updateStatus('Waiting for server...', 'Checking health endpoint');

    const maxWait = 60000;
    const start = Date.now();
    let ready = false;
    while (!ready && (Date.now() - start) < maxWait) {
      ready = await waitForPing(`http://127.0.0.1:${backendPort}/api/ping`, 1000, 1000);
      if (!ready) {
        const elapsed = Math.round((Date.now() - start) / 1000);
        if (elapsed % 5 === 0) {
          ui.updateStatus('Waiting for server...', `${elapsed}s elapsed`);
        }
      }
    }

    ui.closeLoadingWindow();

    if (!ready) {
      console.log('[AnythingLLM Portable] Server failed to start in time');
      backendProcess.kill('SIGTERM');
      return { success: false, message: 'AnythingLLM server failed to start within 60 seconds' };
    }

    console.log('[AnythingLLM Portable] Server ready');
    return {
      success: true,
      backendPort,
      frontendPort,
      port: frontendPort,
      url: `http://127.0.0.1:${frontendPort}`,
      backendProcess,
      backendPid: backendProcess.pid,
      message: `Portable AnythingLLM running on port ${backendPort}`
    };
  } catch (err) {
    console.error('[AnythingLLM Portable] Error:', err);
    ui.closeLoadingWindow();
    return { success: false, message: err.message };
  }
}

module.exports = {
  launchCompiledAnythingLLM,
  launchPortableAnythingLLM
};
