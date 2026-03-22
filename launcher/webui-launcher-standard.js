/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
/**
 * webui-launcher-standard.js
 * 
 * Standalone Open WebUI launcher for Standard Edition.
 * Contains proven launch logic extracted from Developer Edition's webui-manager-linux-x64.js
 * 
 * This module is self-contained with no external PSF module dependencies.
 */

const { BrowserWindow, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

// Track the running process
let openWebuiProcess = null;
let openWebuiWindow = null;

/**
 * Launch Open WebUI with loading splash and proper health checking
 * 
 * @param {Object} options - Launch options
 * @param {string} options.appDir - Application directory (where app/ folder is)
 * @param {number} options.ollamaPort - Port where Ollama is running
 * @param {number} options.webuiPort - Port to run WebUI on
 * @param {Object} options.gpuInfo - GPU information (optional)
 * @returns {Promise<Object>} { success, port, url, message, process, pid }
 */
async function launchOpenWebUI(options) {
  const { appDir, ollamaPort, webuiPort, gpuInfo = null } = options;
  
  console.log('[WebUI Standard] ================================================');
  console.log('[WebUI Standard] Launching Open WebUI');
  console.log('[WebUI Standard] ================================================');
  console.log(`[WebUI Standard] App Dir: ${appDir}`);
  console.log(`[WebUI Standard] Ollama Port: ${ollamaPort}`);
  console.log(`[WebUI Standard] WebUI Port: ${webuiPort}`);
  
  // Check if already running
  if (openWebuiProcess && !openWebuiProcess.killed) {
    console.log('[WebUI Standard] Already running');
    if (openWebuiWindow && !openWebuiWindow.isDestroyed()) {
      openWebuiWindow.focus();
    }
    return { 
      success: true, 
      port: webuiPort, 
      url: `http://127.0.0.1:${webuiPort}`,
      message: 'Already running',
      pid: openWebuiProcess.pid
    };
  }
  
  // Show loading splash
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
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
      color: #00ffff;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      height: 100vh; border-radius: 15px; border: 2px solid #00ffff;
      overflow: hidden; -webkit-app-region: drag; cursor: move;
    }
    .logo { font-size: 28px; font-weight: bold; margin-bottom: 10px; text-shadow: 0 0 10px #00ffff; }
    .subtitle { font-size: 14px; color: #888; margin-bottom: 30px; }
    .spinner {
      width: 60px; height: 60px;
      border: 4px solid rgba(0,255,255,0.2); border-top: 4px solid #00ffff;
      border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 25px;
    }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    .status { font-size: 16px; color: #fff; margin-bottom: 10px; }
    .substatus { font-size: 12px; color: #666; }
    .footer { position: absolute; bottom: 15px; font-size: 11px; color: #444; }
  </style></head><body>
    <div class="logo">Pseudo Science Fiction</div>
    <div class="subtitle">AI / LLM Archive Collection</div>
    <div class="spinner"></div>
    <div class="status" id="status">Starting Open WebUI...</div>
    <div class="substatus" id="substatus">This may take a moment on first launch</div>
    <div class="footer">Preparing your AI experience...</div>
  </body></html>`;
  
  loadingWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(loadingHTML));
  
  const updateLoadingStatus = (status, substatus = '') => {
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
  
  try {
    // Verify Ollama is responding
    updateLoadingStatus('Checking Ollama...', 'Verifying backend connection');
    
    const ollamaReady = await new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${ollamaPort}/api/tags`, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(5000, () => {
        req.destroy();
        resolve(false);
      });
    });
    
    if (!ollamaReady) {
      console.warn('[WebUI Standard] Ollama may not be responding yet, but continuing...');
    } else {
      console.log(`[WebUI Standard] Ollama is responding on port ${ollamaPort}`);
    }
    
    updateLoadingStatus('Loading Open WebUI...', 'Preparing interface');
    
    // Determine paths
    const platform = process.platform;
    const arch = process.arch;
    let platformDir;
    
    if (platform === 'linux' && arch === 'x64') platformDir = 'linux-x64';
    else if (platform === 'linux' && arch === 'arm64') platformDir = 'linux-arm64';
    else if (platform === 'darwin' && arch === 'arm64') platformDir = 'macos-arm';
    else if (platform === 'darwin' && arch === 'x64') platformDir = 'macos-intel';
    else if (platform === 'win32' && arch === 'x64') platformDir = 'windows-x64';
    else if (platform === 'win32' && arch === 'arm64') platformDir = 'windows-arm64';
    else {
      closeLoadingWindow();
      return { success: false, message: `Unsupported platform: ${platform}-${arch}` };
    }
    
    const webuiDir = path.join(appDir, '..', 'binaries', 'python-webui');
    const bundlePath = path.join(webuiDir, platformDir);
    const dataDir = path.join(bundlePath, 'data');
    
    // Create data directory
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // Determine binary path - check for compiled binary first
    // Check standalone mode (folder) first, then onefile mode, then venv fallback
    const binaryName = platform === 'win32' ? 'open-webui.exe' : 'open-webui';
    const standaloneBinary = path.join(bundlePath, 'dist', 'open_webui_launcher.dist', binaryName);
    const compiledBinary = path.join(bundlePath, 'dist', binaryName);
    const venvBinary = path.join(bundlePath, 'venv', 'bin', binaryName);
    
    let command;
    let isCompiled = false;
    let workingDir = bundlePath;
    
    if (fs.existsSync(standaloneBinary)) {
      // Use standalone binary (folder with all dependencies)
      command = standaloneBinary;
      isCompiled = true;
      // Standalone mode: run from the .dist folder so it finds its libraries
      workingDir = path.dirname(standaloneBinary);
      console.log('[WebUI Standard] Using standalone binary (folder mode)');
    } else if (fs.existsSync(compiledBinary)) {
      // Use compiled binary (single file - onefile mode)
      command = compiledBinary;
      isCompiled = true;
      console.log('[WebUI Standard] Using compiled binary (onefile mode)');
    } else if (fs.existsSync(venvBinary)) {
      // Fall back to venv binary
      command = venvBinary;
      console.log('[WebUI Standard] Using venv binary');
    } else {
      closeLoadingWindow();
      return { success: false, message: `Open WebUI binary not found. Checked:\n- ${standaloneBinary}\n- ${compiledBinary}\n- ${venvBinary}` };
    }
    
    console.log(`[WebUI Standard] Binary: ${command}`);
    console.log(`[WebUI Standard] Working Dir: ${workingDir}`);
    console.log(`[WebUI Standard] Bundle: ${bundlePath}`);
    console.log(`[WebUI Standard] Data: ${dataDir}`);
    
    // Launch Open WebUI
    updateLoadingStatus('Starting Open WebUI...', 'Initializing server...');
    
    // Compiled binary has different args than venv binary
    const args = isCompiled 
      ? ['--port', String(webuiPort)]  // Compiled: no 'serve' command needed
      : ['serve', '--port', String(webuiPort)];  // Venv: needs 'serve' subcommand
    
    openWebuiProcess = spawn(command, args, {
      cwd: workingDir,  // Use workingDir (different for standalone mode)
      shell: false,
      env: {
        ...process.env,
        OLLAMA_API_BASE_URL: `http://127.0.0.1:${ollamaPort}/api`,
        DATA_DIR: dataDir,
        OFFLINE_MODE: 'true',
        ...(isCompiled ? {
          FRONTEND_BUILD_DIR: path.join(workingDir, '_internal', 'open_webui', 'frontend'),
        } : {}),
        WEBUI_SECRET_KEY: 'psf-standard-' + Date.now(),
        WEBUI_AUTH: 'False',
        PORT: String(webuiPort),
        ...(gpuInfo && gpuInfo.accelerationType === 'nvidia' && gpuInfo.uuid ? {
          CUDA_VISIBLE_DEVICES: gpuInfo.uuid
        } : {})
      },
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    const pid = openWebuiProcess.pid;
    console.log(`[WebUI Standard] Process started - PID: ${pid}`);
    
    openWebuiProcess.stdout.on('data', (data) => {
      console.log('[WebUI]', data.toString().trim());
    });
    
    openWebuiProcess.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      // Filter out noisy warnings
      if (msg.includes('CORS_ALLOW_ORIGIN')) return;
      if (msg.includes('SyntaxWarning')) return;
      console.log('[WebUI]', msg);
    });
    
    openWebuiProcess.on('exit', (code) => {
      console.log(`[WebUI Standard] Process exited with code ${code}`);
      openWebuiProcess = null;
    });
    
    // Wait for WebUI to be ready (check /api/config returns valid JSON)
    console.log('[WebUI Standard] Waiting for WebUI to start...');
    
    let webuiReady = false;
    const maxWaitSeconds = 120;
    
    for (let i = 0; i < maxWaitSeconds; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      updateLoadingStatus('Starting Open WebUI...', `Waiting for server... (${i + 1}/${maxWaitSeconds})`);
      
      const checkReady = await new Promise((resolve) => {
        const req = http.get(`http://127.0.0.1:${webuiPort}/api/config`, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              JSON.parse(data);
              resolve(true);
            } catch {
              resolve(false);
            }
          });
        });
        req.on('error', () => resolve(false));
        req.setTimeout(2000, () => {
          req.destroy();
          resolve(false);
        });
      });
      
      if (checkReady) {
        webuiReady = true;
        console.log(`[WebUI Standard] Ready after ${i + 1} seconds`);
        break;
      }
      
      if ((i + 1) % 10 === 0) {
        console.log(`[WebUI Standard] Still waiting... (${i + 1}/${maxWaitSeconds})`);
      }
    }
    
    if (!webuiReady) {
      console.error('[WebUI Standard] Did not start in time');
      closeLoadingWindow();
      if (openWebuiProcess) {
        openWebuiProcess.kill();
        openWebuiProcess = null;
      }
      return { success: false, message: 'Open WebUI failed to start in time' };
    }
    
    // Wait for Ollama connection via WebUI
    console.log('[WebUI Standard] Checking Ollama connection...');
    updateLoadingStatus('Connecting to Ollama...', 'Loading models...');
    
    let ollamaConnected = false;
    const maxOllamaWait = 15;
    
    for (let i = 0; i < maxOllamaWait; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const checkOllama = await new Promise((resolve) => {
        const req = http.get(`http://127.0.0.1:${webuiPort}/ollama/api/tags`, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              resolve(parsed && Array.isArray(parsed.models));
            } catch {
              resolve(false);
            }
          });
        });
        req.on('error', () => resolve(false));
        req.setTimeout(2000, () => {
          req.destroy();
          resolve(false);
        });
      });
      
      if (checkOllama) {
        ollamaConnected = true;
        console.log(`[WebUI Standard] Connected to Ollama after ${i + 1} seconds`);
        break;
      }
    }
    
    if (!ollamaConnected) {
      console.warn('[WebUI Standard] Could not verify Ollama connection, but WebUI is running');
    }
    
    // Close loading window and open browser
    closeLoadingWindow();
    
    const url = `http://127.0.0.1:${webuiPort}`;
    console.log(`[WebUI Standard] Opening browser: ${url}`);
    shell.openExternal(url);
    
    return {
      success: true,
      port: webuiPort,
      url: url,
      message: 'Open WebUI started successfully',
      pid: pid
    };
    
  } catch (err) {
    console.error('[WebUI Standard] Error:', err);
    closeLoadingWindow();
    return { success: false, message: err.message };
  }
}

/**
 * Stop Open WebUI
 * @returns {Promise<Object>} { success, message }
 */
async function stopOpenWebUI() {
  if (!openWebuiProcess) {
    return { success: true, message: 'Not running' };
  }
  
  const pid = openWebuiProcess.pid;
  console.log(`[WebUI Standard] Stopping WebUI - PID: ${pid}`);
  
  try {
    if (!openWebuiProcess.killed) {
      openWebuiProcess.kill('SIGTERM');
      
      // Wait up to 3 seconds for graceful shutdown
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 3000);
        openWebuiProcess.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
      
      // Force kill if still running
      if (!openWebuiProcess.killed) {
        console.log(`[WebUI Standard] Force killing PID ${pid}`);
        openWebuiProcess.kill('SIGKILL');
        try {
          process.kill(pid, 'SIGKILL');
        } catch (e) {
          // Process may already be dead
        }
      }
    }
  } catch (err) {
    console.log('[WebUI Standard] Error stopping:', err.message);
  }
  
  openWebuiProcess = null;
  
  // Close window if open
  if (openWebuiWindow && !openWebuiWindow.isDestroyed()) {
    openWebuiWindow.close();
    openWebuiWindow = null;
  }
  
  console.log(`[WebUI Standard] Stopped (was PID ${pid})`);
  return { success: true, message: 'Stopped' };
}

/**
 * Check if Open WebUI is running
 * @returns {boolean}
 */
function isRunning() {
  return openWebuiProcess !== null && !openWebuiProcess.killed;
}

/**
 * Get current process info
 * @returns {Object|null}
 */
function getProcessInfo() {
  if (!openWebuiProcess || openWebuiProcess.killed) {
    return null;
  }
  return {
    pid: openWebuiProcess.pid,
    killed: openWebuiProcess.killed
  };
}

module.exports = {
  launchOpenWebUI,
  stopOpenWebUI,
  isRunning,
  getProcessInfo
};
