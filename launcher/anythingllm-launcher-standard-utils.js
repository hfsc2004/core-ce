/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const { BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const http = require('http');

function detectPlatformDir(platform = process.platform, arch = process.arch) {
  if (platform === 'linux' && arch === 'x64') return 'linux-x64';
  if (platform === 'linux' && arch === 'arm64') return 'linux-arm64';
  if (platform === 'darwin' && arch === 'arm64') return 'macos-arm';
  if (platform === 'darwin' && arch === 'x64') return 'macos-intel';
  if (platform === 'win32' && arch === 'x64') return 'windows-x64';
  if (platform === 'win32' && arch === 'arm64') return 'windows-arm64';
  return null;
}

function createEnvFiles(anythingPath, ollamaPort, backendPortNum, frontendPortNum) {
  const rootEnv = `
OLLAMA_BASE_URL=http://localhost:${ollamaPort}
OLLAMA_BASE_PATH=http://localhost:${ollamaPort}
SERVER_PORT=${backendPortNum}
VITE_API_BASE=http://localhost:${backendPortNum}/api
PORT=${frontendPortNum}
STORAGE_DIR=${path.join(anythingPath, 'server', 'storage')}
`.trim();

  fs.writeFileSync(path.join(anythingPath, '.env'), rootEnv);

  const serverEnvPath = path.join(anythingPath, 'server', '.env');
  if (fs.existsSync(path.dirname(serverEnvPath))) {
    fs.writeFileSync(serverEnvPath, `
SERVER_PORT=${backendPortNum}
OLLAMA_BASE_URL=http://localhost:${ollamaPort}
STORAGE_DIR=${path.join(anythingPath, 'server', 'storage')}
`.trim());
  }

  const frontendEnvPath = path.join(anythingPath, 'frontend', '.env');
  if (fs.existsSync(path.dirname(frontendEnvPath))) {
    fs.writeFileSync(frontendEnvPath, `
VITE_API_BASE=http://localhost:${backendPortNum}/api
`.trim());
  }

  console.log('[AnythingLLM Standard] Created .env files');
}

function checkYarnAvailable() {
  try {
    const { execSync } = require('child_process');
    execSync('yarn --version', { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch (_err) {
    return false;
  }
}

function ensureStorageDir(anythingPath) {
  const storageDir = path.join(anythingPath, 'server', 'storage');
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }
  return storageDir;
}

function installDependenciesIfNeeded(anythingPath, updateStatus) {
  const nodeModulesPath = path.join(anythingPath, 'node_modules');
  const serverNodeModules = path.join(anythingPath, 'server', 'node_modules');
  const frontendNodeModules = path.join(anythingPath, 'frontend', 'node_modules');

  const needsInstall = !fs.existsSync(nodeModulesPath) ||
    !fs.existsSync(serverNodeModules) ||
    !fs.existsSync(frontendNodeModules);

  if (!needsInstall) {
    return;
  }

  console.log('[AnythingLLM Standard] First run - installing dependencies...');
  updateStatus('Installing dependencies...', 'First run only - please wait');

  const { execSync } = require('child_process');

  if (!fs.existsSync(nodeModulesPath)) {
    console.log('[AnythingLLM Standard] Installing root dependencies...');
    updateStatus('Installing dependencies...', 'Root packages');
    execSync('yarn install', { cwd: anythingPath, stdio: 'inherit', timeout: 300000 });
  }

  if (!fs.existsSync(serverNodeModules) && fs.existsSync(path.join(anythingPath, 'server', 'package.json'))) {
    console.log('[AnythingLLM Standard] Installing server dependencies...');
    updateStatus('Installing dependencies...', 'Server packages');
    execSync('yarn install', { cwd: path.join(anythingPath, 'server'), stdio: 'inherit', timeout: 300000 });
  }

  if (!fs.existsSync(frontendNodeModules) && fs.existsSync(path.join(anythingPath, 'frontend', 'package.json'))) {
    console.log('[AnythingLLM Standard] Installing frontend dependencies...');
    updateStatus('Installing dependencies...', 'Frontend packages');
    execSync('yarn install', { cwd: path.join(anythingPath, 'frontend'), stdio: 'inherit', timeout: 300000 });
  }

  console.log('[AnythingLLM Standard] Dependencies installed successfully');
}

function createLoadingWindow(backendPort, frontendPort) {
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
    <div class="ports">Backend: ${backendPort} | Frontend: ${frontendPort}</div>
  </body></html>`;

  loadingWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loadingHTML)}`);

  return {
    updateStatus: (status, substatus = '') => {
      if (loadingWindow && !loadingWindow.isDestroyed()) {
        loadingWindow.webContents.executeJavaScript(
          `document.getElementById('status').innerText='${status}';` +
          `document.getElementById('substatus').innerText='${substatus}';`
        ).catch(() => {});
      }
    },
    close: () => {
      if (loadingWindow && !loadingWindow.isDestroyed()) {
        loadingWindow.close();
      }
      loadingWindow = null;
    }
  };
}

function checkHttpReady(url, allow304 = false) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      const ok = allow304 ? (res.statusCode === 200 || res.statusCode === 304) : res.statusCode === 200;
      resolve(ok);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServersReady(backendPort, frontendPort, updateStatus, timeoutMs = 90000) {
  const startTime = Date.now();
  let backendReady = false;
  let frontendReady = false;

  while (Date.now() - startTime < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    if (!backendReady) {
      backendReady = await checkHttpReady(`http://localhost:${backendPort}/api/ping`);
      if (backendReady) {
        console.log('[AnythingLLM Standard] Backend is ready');
      }
    }

    if (!frontendReady) {
      frontendReady = await checkHttpReady(`http://localhost:${frontendPort}`, true);
      if (frontendReady) {
        console.log('[AnythingLLM Standard] Frontend is ready');
      }
    }

    if (backendReady && frontendReady) {
      return { backendReady, frontendReady };
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    if (elapsed % 10 === 0) {
      console.log(`[AnythingLLM Standard] Still waiting... (${elapsed}s) Backend: ${backendReady}, Frontend: ${frontendReady}`);
      updateStatus(`Waiting for servers... (${elapsed}s)`);
    }
  }

  return { backendReady, frontendReady };
}

async function killManagedProcess(proc, name) {
  if (!proc) {
    return;
  }

  const pid = proc.pid;
  console.log(`[AnythingLLM Standard] Stopping ${name} - PID: ${pid}`);

  try {
    if (process.platform !== 'win32') {
      try {
        process.kill(-pid, 'SIGTERM');
      } catch (_groupErr) {
        proc.kill('SIGTERM');
      }
    } else {
      proc.kill('SIGTERM');
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));

    if (!proc.killed) {
      console.log(`[AnythingLLM Standard] Force killing ${name}`);
      if (process.platform !== 'win32') {
        try {
          process.kill(-pid, 'SIGKILL');
        } catch (_groupErr) {
          proc.kill('SIGKILL');
        }
      } else {
        proc.kill('SIGKILL');
      }
    }
  } catch (err) {
    console.log(`[AnythingLLM Standard] Error stopping ${name}:`, err.message);
  }
}

module.exports = {
  detectPlatformDir,
  createEnvFiles,
  checkYarnAvailable,
  ensureStorageDir,
  installDependenciesIfNeeded,
  createLoadingWindow,
  waitForServersReady,
  killManagedProcess
};
