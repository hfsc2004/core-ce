/**
 * Pseudo Science Fiction Core Collection - WebUI Manager Linux x64
 * Platform-specific implementation for Linux x64 systems
 * @version 1.1.3 - March 5, 2026
 */

const { BrowserWindow } = require('electron');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { promisify } = require('util');
const execPromise = promisify(exec);

const ollamaManager = require('../ollama-manager/ollama-manager');
const WebUIPortPool = require('../port-pool/port-pool-webui');
const sessionManager = require('../session-manager');
const common = require('./webui-manager-common');
const privacyEnv = require('../privacy-env');

let openWebuiProcess = null;
let openWebuiWindow = null;
let webuiPort = null;
let currentSessionId = null;

async function killAllOllama() {
  console.log('[WebUI Linux x64] 🪓 Checking for existing Ollama processes...');
  
  try {
    await execPromise('pkill -9 ollama 2>/dev/null || true');
    console.log('[WebUI Linux x64] ✅ Killed existing Ollama processes');
  } catch (e) {
    console.log('[WebUI Linux x64] ℹ️  No existing Ollama processes found');
  }
}

function forceKillProcess(proc, name) {
  if (proc && !proc.killed) {
    try {
      proc.kill('SIGTERM');
      setTimeout(() => {
        if (proc && !proc.killed) {
          proc.kill('SIGKILL');
        }
      }, 5000);
      console.log(`[WebUI Linux x64] Killed ${name}`);
    } catch (err) {
      console.error(`[WebUI Linux x64] Error killing ${name}:`, err);
    }
  }
}

async function ensurePythonVenv(platformDir, dirname) {
  const webuiDir = path.join(dirname, '..', 'binaries', 'python-webui');
  const pythonExe = path.join(webuiDir, platformDir, 'venv', 'bin', 'python');
  
  if (fs.existsSync(pythonExe)) {
    console.log('[WebUI Linux x64] ✅ Python WebUI environment found');
    return true;
  }
  
  console.log('[WebUI Linux x64] ⚠️  Python WebUI environment not found, building...');
  
  const buildScript = path.join(dirname, 'build-python-webui.sh');
  
  if (!fs.existsSync(buildScript)) {
    console.error('[WebUI Linux x64] ❌ Build script not found:', buildScript);
    return false;
  }
  
  return new Promise((resolve) => {
    console.log('[WebUI Linux x64] 🔨 Building Python WebUI environment...');
    
    try {
      fs.chmodSync(buildScript, '755');
    } catch (e) {}
    
    const buildProcess = spawn('bash', [buildScript], {
      cwd: dirname,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    buildProcess.stdout?.on('data', (data) => {
      console.log('[Build]', data.toString().trim());
    });
    
    buildProcess.stderr?.on('data', (data) => {
      console.error('[Build Error]', data.toString().trim());
    });
    
    buildProcess.on('close', (code) => {
      if (code === 0) {
        console.log('[WebUI Linux x64] ✅ Python WebUI built successfully');
        resolve(true);
      } else {
        console.error(`[WebUI Linux x64] ❌ Build failed with code ${code}`);
        resolve(false);
      }
    });
    
    buildProcess.on('error', (err) => {
      console.error('[WebUI Linux x64] ❌ Build error:', err);
      resolve(false);
    });
  });
}

async function getLinuxPortOwnerDiagnostics(port) {
  const details = [];

  try {
    const { stdout } = await execPromise(`ss -ltnp 'sport = :${port}' 2>/dev/null || true`);
    const trimmed = String(stdout || '').trim();
    if (trimmed) {
      details.push(`ss: ${trimmed.replace(/\s+/g, ' ')}`);
      const pidMatch = trimmed.match(/pid=(\d+)/);
      if (pidMatch && pidMatch[1]) {
        const pid = pidMatch[1];
        const psResult = await execPromise(`ps -p ${pid} -o pid=,ppid=,user=,etime=,cmd= 2>/dev/null || true`);
        const psTrimmed = String(psResult.stdout || '').trim();
        if (psTrimmed) {
          details.push(`ps: ${psTrimmed.replace(/\s+/g, ' ')}`);
        }
      }
    }
  } catch {}

  // Fallback in case ss is unavailable or returns nothing
  if (details.length === 0) {
    try {
      const { stdout } = await execPromise(`lsof -nP -iTCP:${port} -sTCP:LISTEN 2>/dev/null || true`);
      const trimmed = String(stdout || '').trim();
      if (trimmed) {
        details.push(`lsof: ${trimmed.replace(/\s+/g, ' ')}`);
      }
    } catch {}
  }

  return details.length ? details.join(' | ') : `No listener details found for :${port}`;
}

async function launchOpenWebUI(dirname, gpuInfo = null) {
  const debugLog = (msg) => {
    const logPath = path.join(dirname, '..', 'webui-debug.log');
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logPath, `[${timestamp}] ${msg}\n`);
    console.log(msg);
  };
  
  debugLog('[WebUI Linux x64] ================================================');
  debugLog('[WebUI Linux x64] 🚀 LAUNCH OPEN WEBUI CALLED');
  debugLog('[WebUI Linux x64] ================================================');
  
  try {
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
    
    const loadingHTML = `<!DOCTYPE html><html><head><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);color:#00ffff;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;border-radius:15px;border:2px solid #00ffff;overflow:hidden;-webkit-app-region:drag;cursor:move}.logo{font-size:28px;font-weight:bold;margin-bottom:10px;text-shadow:0 0 10px #00ffff}.subtitle{font-size:14px;color:#888;margin-bottom:30px}.spinner{width:60px;height:60px;border:4px solid rgba(0,255,255,0.2);border-top:4px solid #00ffff;border-radius:50%;animation:spin 1s linear infinite;margin-bottom:25px}@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}.status{font-size:16px;color:#fff;margin-bottom:10px}.substatus{font-size:12px;color:#666}.footer{position:absolute;bottom:15px;font-size:11px;color:#444}</style></head><body><div class="logo">Pseudo Science Fiction</div><div class="subtitle">AI / LLM Archive Collection</div><div class="spinner"></div><div class="status" id="status">Starting Open WebUI...</div><div class="substatus" id="substatus">This may take a moment on first launch</div><div class="footer">Preparing your AI experience...</div></body></html>`;
    
    loadingWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(loadingHTML));
    
    const updateLoadingStatus = (status, substatus = '') => {
      if (loadingWindow && !loadingWindow.isDestroyed()) {
        loadingWindow.webContents.executeJavaScript(`document.getElementById('status').innerText='${status}';document.getElementById('substatus').innerText='${substatus}';`).catch(() => {});
      }
    };
    
    const closeLoadingWindow = () => {
      if (loadingWindow && !loadingWindow.isDestroyed()) {
        loadingWindow.close();
        loadingWindow = null;
      }
    };
    
    debugLog('[WebUI Linux x64] 🏴‍☠️ Starting PSF Ollama via BMOC...');
    updateLoadingStatus('Starting Ollama...', 'Initializing AI backend');
    
    // =========================================================================
    // CHANGE 1: Start Ollama via BMOC (sessionManager.startOllamaForService)
    // =========================================================================
    let ollamaPort;
    try {
      const ollamaResult = await sessionManager.startOllamaForService('webui', dirname, gpuInfo);
      if (!ollamaResult.success) {
        console.error('[WebUI Linux x64] Failed to start PSF Ollama:', ollamaResult.message);
        closeLoadingWindow();
        return { success: false, message: 'Failed to start Ollama service: ' + ollamaResult.message };
      }
      currentSessionId = ollamaResult.sessionId;
      ollamaPort = ollamaResult.ollamaPort;
      console.log(`[WebUI Linux x64] ✅ PSF Ollama started on port ${ollamaPort}`);
      debugLog(`[WebUI Linux x64] ✅ PSF Ollama running on port ${ollamaPort} (Session: ${currentSessionId})`);
    } catch (ollamaErr) {
      console.error('[WebUI Linux x64] Failed to start PSF Ollama:', ollamaErr);
      closeLoadingWindow();
      return { success: false, message: 'Failed to start Ollama service.' };
    }
    
    // Verify Ollama responding
    updateLoadingStatus('Checking Ollama...', 'Verifying backend connection');
    
    const ollamaReady = await new Promise((resolve) => {
      const req = http.get(`http://localhost:${ollamaPort}/api/tags`, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(5000, () => {
        req.destroy();
        resolve(false);
      });
    });
    
    if (!ollamaReady) {
      console.warn('[WebUI Linux x64] ⚠️  Ollama may not be responding yet, but continuing...');
    } else {
      console.log(`[WebUI Linux x64] ✅ Ollama is responding on port ${ollamaPort}`);
    }
    
    updateLoadingStatus('Loading Open WebUI...', 'Preparing interface');
    
    // Determine platform directory
    const arch = process.arch;
    const webuiDir = path.join(dirname, '..', 'binaries', 'python-webui');
    const platformDir = arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
    
    console.log(`[WebUI Linux x64] 📦 Platform: linux-${arch}`);
    
    // Ensure Python venv exists
    updateLoadingStatus('Checking Python Environment...', 'This may take several minutes on first launch');
    
    const venvReady = await ensurePythonVenv(platformDir, dirname);
    if (!venvReady) {
      closeLoadingWindow();
      return { success: false, message: 'Failed to build Python WebUI environment.' };
    }
    
    // Check if already running
    if (openWebuiProcess && !openWebuiProcess.killed) {
      console.log('[WebUI Linux x64] ℹ️  Open WebUI already running');
      
      if (!openWebuiWindow || openWebuiWindow.isDestroyed()) {
        openWebuiWindow = await common.createWebuiWindow('Open WebUI', `http://localhost:${webuiPort}`);
      } else {
        openWebuiWindow.focus();
      }
      
      closeLoadingWindow();
      return { success: true, message: 'Open WebUI already running' };
    }
    
    // Setup paths
    const pythonExe = path.join(webuiDir, platformDir, 'venv', 'bin', 'python');
    const bundlePath = path.join(webuiDir, platformDir);
    const dataDir = path.join(bundlePath, 'data');
    
    // Create data dir
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // Allocate WebUI port
    webuiPort = WebUIPortPool.getWebUIPort('Open WebUI');
    if (!webuiPort) {
      console.error('[WebUI Linux x64] ❌ Failed to allocate WebUI port');
      closeLoadingWindow();
      return { success: false, message: 'Failed to allocate port for Open WebUI' };
    }
    console.log(`[WebUI Linux x64] ✅ Allocated WebUI port: ${webuiPort}`);
    
    // Launch Open WebUI
    console.log('[WebUI Linux x64] 🚀 Launching Open WebUI...');
    updateLoadingStatus('Starting Open WebUI...', 'Initializing server...');
    
    console.log('[WebUI DEBUG] dirname:', dirname);
    console.log('[WebUI DEBUG] webuiDir:', webuiDir);
    console.log('[WebUI DEBUG] bundlePath:', bundlePath);
    
    if (!fs.existsSync(pythonExe)) {
      closeLoadingWindow();
      return { success: false, message: `Python executable not found: ${pythonExe}` };
    }
    const command = pythonExe;
    console.log('[WebUI DEBUG] command:', command);
    const args = ['-c', `from open_webui import serve; serve(host='0.0.0.0', port=${webuiPort})`];

    let attachedToExistingWebUI = false;
    let portCollisionDetails = '';

    openWebuiProcess = spawn(command, args, {
      cwd: bundlePath,
      shell: false,
      env: {
        ...process.env,
      ...privacyEnv.getPrivacyHardeningEnv(dirname),
        OLLAMA_API_BASE_URL: `http://127.0.0.1:${ollamaPort}/api`,
        DATA_DIR: dataDir,
        WEBUI_SECRET_KEY: 'psf-robotics-' + Date.now(),
        WEBUI_AUTH: 'False', // 'False' disables Log in
        PORT: String(webuiPort),
        ...(gpuInfo && gpuInfo.accelerationType === 'nvidia' && gpuInfo.uuid ? {
          CUDA_VISIBLE_DEVICES: gpuInfo.uuid
        } : {})
      },
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    openWebuiProcess.stdout.on('data', (data) => {
      console.log('[WebUI]', data.toString().trim());
    });
    
    openWebuiProcess.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      // Filter out noisy warnings that alarm users
      if (msg.includes('CORS_ALLOW_ORIGIN')) return;
      if (msg.includes('address already in use')) {
        attachedToExistingWebUI = true;
        console.warn('[WebUI Linux x64] ℹ️  Port already in use; probing owner diagnostics...');
        getLinuxPortOwnerDiagnostics(webuiPort)
          .then((diagnostics) => {
            portCollisionDetails = diagnostics;
            console.warn(`[WebUI Linux x64] ⚠️  Port collision on :${webuiPort} -> ${diagnostics}`);
          })
          .catch((diagErr) => {
            console.warn(`[WebUI Linux x64] ⚠️  Port collision diagnostics failed: ${diagErr.message}`);
          });
        return;
      }
      console.error('[WebUI Error]', msg);
    });
    
    openWebuiProcess.on('exit', (code) => {
      console.log(`[WebUI Linux x64] ⚠️  Open WebUI exited with code ${code}`);
      openWebuiProcess = null;
    });
    
    openWebuiProcess.on('error', (err) => {
      console.error('[WebUI Linux x64] ❌ Open WebUI spawn error:', err.message);
    });
    
    console.log('[WebUI Linux x64] ✅ Open WebUI process started');
    
    // Wait for WebUI to be ready
    console.log('[WebUI Linux x64] ⏳ Waiting for Open WebUI to start...');
    
    let webuiReady = false;
    const maxWaitSeconds = 120;
    
    for (let i = 0; i < maxWaitSeconds; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      updateLoadingStatus('Starting Open WebUI...', `Waiting for server... (${i + 1}/${maxWaitSeconds})`);
      
      const checkReady = await new Promise((resolve) => {
        const req = http.get(`http://localhost:${webuiPort}/api/config`, (res) => {
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
        console.log(`[WebUI Linux x64] ✅ Open WebUI ready after ${i + 1} seconds`);
        break;
      }
      
      if ((i + 1) % 5 === 0) {
        console.log(`[WebUI Linux x64] ⏳ Still waiting... (${i + 1}/${maxWaitSeconds})`);
      }
    }
    
    if (!webuiReady) {
      console.error('[WebUI Linux x64] ❌ Open WebUI did not start in time');
      closeLoadingWindow();
      const collisionHint = attachedToExistingWebUI
        ? ` Port ${webuiPort} appears occupied. ${portCollisionDetails || 'See launcher logs for owner diagnostics.'}`
        : '';
      return { success: false, message: `Open WebUI failed to start.${collisionHint}` };
    }
    
    // Wait for Ollama connection
    console.log('[WebUI Linux x64] ⏳ Waiting for Open WebUI to connect to Ollama...');
    updateLoadingStatus('Connecting to Ollama...', 'Loading models...');
    
    let ollamaConnected = false;
    const maxOllamaWait = 15;
    
    for (let i = 0; i < maxOllamaWait; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const checkOllama = await new Promise((resolve) => {
        const req = http.get(`http://localhost:${webuiPort}/ollama/api/tags`, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              if (parsed && Array.isArray(parsed.models)) {
                resolve(true);
              } else {
                resolve(false);
              }
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
        console.log(`[WebUI Linux x64] ✅ Open WebUI connected to Ollama after ${i + 1} seconds`);
        break;
      }
      
      if ((i + 1) % 3 === 0) {
        console.log(`[WebUI Linux x64] ⏳ Still connecting... (${i + 1}/${maxOllamaWait})`);
      }
    }
    
    if (!ollamaConnected) {
      console.warn('[WebUI Linux x64] ⚠️  May not be fully connected, but opening anyway...');
    }
    
    updateLoadingStatus('Ready!', 'Opening Open WebUI...');
    await new Promise(resolve => setTimeout(resolve, 500));
    
    closeLoadingWindow();
    
    // Open browser window
    openWebuiWindow = await common.createWebuiWindow('Open WebUI', `http://localhost:${webuiPort}`);
    
    // =========================================================================
    // CHANGE 2: Update session with WebUI process info (Ollama already registered by BMOC)
    // =========================================================================
    const servicePid = openWebuiProcess && Number.isInteger(openWebuiProcess.pid) ? openWebuiProcess.pid : null;
    sessionManager.updateSession(currentSessionId, {
      servicePort: webuiPort,
      servicePID: servicePid,
      metadata: {
        platform: 'linux-x64',
        startedAt: new Date().toISOString(),
        attachedToExistingWebUI
      }
    });
    console.log(`[WebUI Linux x64] Updated session: ${currentSessionId}`);
    
    // =========================================================================
    // CHANGE 3: Simplified window close cleanup - BMOC handles Ollama
    // =========================================================================
    openWebuiWindow.on('closed', () => {
      console.log('[WebUI Linux x64] 🛑 Window closed, stopping backend...');
      
      // Kill WebUI process
      forceKillProcess(openWebuiProcess, 'Open WebUI');
      openWebuiProcess = null;
      
      // Release WebUI port
      if (webuiPort) {
        console.log(`[WebUI Linux x64] 🛑 Releasing WebUI port ${webuiPort}...`);
        WebUIPortPool.releasePort(webuiPort);
        webuiPort = null;
      }
      
      // Close session via BMOC (handles Ollama shutdown and port release)
      if (currentSessionId) {
        sessionManager.closeSession(currentSessionId);
        currentSessionId = null;
      }
      
      openWebuiWindow = null;
    });
    
    return { success: true, message: 'Open WebUI launched successfully' };
    
  } catch (err) {
    console.error('[WebUI Linux x64] ❌ Launch error:', err);
    return { success: false, message: `Failed to launch: ${err.message}` };
  }
}

module.exports = {
  killAllOllama,
  forceKillProcess,
  ensurePythonVenv,
  launchOpenWebUI
};
