/**
 * ollama-manager-windows-x64.js
 * Windows x64 Platform-Specific Implementation
 * Version: 1.1.2 - January 13, 2026
 * 
 * SESSION-MANAGER INTEGRATION:
 * - session-manager.js is the BMOC (sole authority) for all sessions
 * - startOllamaServerOnPort() is called BY session-manager with pre-allocated port
 * - startOllamaServer() accepts serviceType for backward compatibility
 * - Segregated port pools: WebUI, AnythingLLM, Terminal
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const { promisify } = require('util');
const PortPool = require('../port-pool/port-pool-ollama');
const execPromise = promisify(exec);
const pathManager = require('../path-manager/path-manager');
const sessionManager = require('../session-manager');
const { getSafeWindowBounds } = require('../window-bounds');

// ============================================================================
// GLOBAL STATE - Single Ollama server per session
// ============================================================================

let psfOllamaProcess = null;
let psfOllamaPort = null;
let psfOllamaSessionId = null;
let terminalWindow = null;  // Terminal UI window (connects to psfOllamaProcess)

// ============================================================================
// PLATFORM-SPECIFIC: Process Management
// ============================================================================

/**
 * Kill stale PSF Ollama processes (Windows x64 implementation)
 */
async function killStalePSFOllama(appPath) {
  console.log('[Windows x64] Checking for stale PSF Ollama processes...');
  
  const binariesPath = path.join(appPath, '..', 'binaries', 'ollama', 'windows-x64', 'bin');
  
  // Port ranges to check (updated for segregated pools)
  const portRanges = [
    { start: 52434, end: 52443, type: 'WEBUI' },
    { start: 52444, end: 52453, type: 'ANYTHINGLLM' },
    { start: 52454, end: 52463, type: 'TERMINAL' }
  ];
  
  for (const range of portRanges) {
    for (let port = range.start; port <= range.end; port++) {
      try {
        // Find PIDs using this port
        const { stdout } = await execPromise(`netstat -ano | findstr :${port}`);
        const lines = stdout.trim().split('\n');
        
        for (const line of lines) {
          const match = line.match(/LISTENING\s+(\d+)/);
          if (match) {
            const pid = match[1];
            
            // Verify this is OUR Ollama binary
            const { stdout: pathOutput } = await execPromise(`wmic process where ProcessId=${pid} get ExecutablePath`);
            
            if (pathOutput.includes(binariesPath)) {
              console.log(`[Windows x64] Killing stale PSF Ollama process on port ${port} (PID: ${pid})`);
              // Use /T to kill process tree (includes runners)
              await execPromise(`taskkill /F /T /PID ${pid}`);
            }
          }
        }
      } catch (err) {
        // Port not in use or process not found - that's fine
      }
    }
  }
}

/**
 * Start Ollama server on a PRE-ALLOCATED port (called by session-manager)
 * THIS IS THE PREFERRED METHOD - session-manager handles port allocation
 */
async function startOllamaServerOnPort(appPath, gpuInfo, port) {
  console.log(`[Windows x64] Starting Ollama server on pre-allocated port ${port}...`);
  
  if (!port) {
    throw new Error('Port is required - must be pre-allocated by session-manager');
  }
  
  await killStalePSFOllama(appPath);
  
  const ollamaPath = pathManager.getOllamaPath(appPath, 'windows-x64');
  
  const ollamaEnv = {
    ...process.env,
    OLLAMA_HOST: `0.0.0.0:${port}`,
    OLLAMA_ORIGINS: '*',
    OLLAMA_MODELS: path.join(appPath, '..', 'models')
  };
  
  if (gpuInfo && gpuInfo.accelerationType === 'nvidia') {
    if (gpuInfo.uuid) {
      ollamaEnv.CUDA_VISIBLE_DEVICES = gpuInfo.uuid;
    } else if (gpuInfo.index !== undefined) {
      ollamaEnv.CUDA_VISIBLE_DEVICES = gpuInfo.index.toString();
    }
  }
  
  const ollamaProcess = spawn(ollamaPath, ['serve'], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: ollamaEnv
  });
  
  psfOllamaProcess = ollamaProcess;
  psfOllamaPort = port;
  
  ollamaProcess.stdout.on('data', (data) => {
    console.log('[Windows x64] Ollama stdout:', data.toString().trim());
  });
  
  ollamaProcess.stderr.on('data', (data) => {
    console.log('[Windows x64] Ollama stderr:', data.toString().trim());
  });
  
  console.log(`[Windows x64] Ollama ready: PID ${ollamaProcess.pid} on port ${port}`);
  
  return { pid: ollamaProcess.pid, port: port, process: ollamaProcess };
}

/**
 * Start PSF Ollama Server (Windows x64)
 * BACKWARD COMPATIBLE - allocates its own port from segregated pools
 */
async function startOllamaServer(appPath, gpuInfo, serviceType = 'terminal') {
  console.log(`[Windows x64] Starting Ollama server (serviceType: ${serviceType})...`);
  
  await killStalePSFOllama(appPath);
  
  if (psfOllamaProcess && psfOllamaPort) {
    console.log(`[Windows x64] PSF Ollama already running on port ${psfOllamaPort}`);
    return psfOllamaPort;
  }
  
  const ollamaPath = pathManager.getOllamaPath(appPath, 'windows-x64');
  
  let port;
  const normalizedType = serviceType.toLowerCase().trim();
  
  switch (normalizedType) {
    case 'webui':
    case 'openwebui':
      port = PortPool.getWebUIPort('WebUI Ollama [direct]');
      console.log(`[Windows x64] Allocated port ${port} from WEBUI pool`);
      break;
    case 'anythingllm':
      port = PortPool.getAnythingLLMPort('AnythingLLM Ollama [direct]');
      console.log(`[Windows x64] Allocated port ${port} from ANYTHINGLLM pool`);
      break;
    case 'terminal':
    default:
      port = PortPool.getTerminalPort('Terminal Ollama [direct]');
      console.log(`[Windows x64] Allocated port ${port} from TERMINAL pool`);
      break;
  }
  
  psfOllamaPort = port;
  
  const ollamaEnv = {
    ...process.env,
    OLLAMA_HOST: `0.0.0.0:${port}`,
    OLLAMA_ORIGINS: '*',
    OLLAMA_MODELS: path.join(appPath, '..', 'models')
  };
  
  if (gpuInfo && gpuInfo.accelerationType === 'nvidia') {
    if (gpuInfo.uuid) {
      ollamaEnv.CUDA_VISIBLE_DEVICES = gpuInfo.uuid;
      console.log(`[Windows x64] CUDA UUID: ${gpuInfo.uuid}`);
    } else if (gpuInfo.index !== undefined) {
      ollamaEnv.CUDA_VISIBLE_DEVICES = gpuInfo.index.toString();
      console.log(`[Windows x64] CUDA Index: ${gpuInfo.index}`);
    }
  }
  
  psfOllamaProcess = spawn(ollamaPath, ['serve'], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: ollamaEnv
  });
  
  psfOllamaSessionId = sessionManager.registerSession({
    type: normalizedType === 'webui' || normalizedType === 'openwebui' ? 'openwebui' : 
          normalizedType === 'anythingllm' ? 'anythingllm' : 'terminal',
    ollamaPort: port,
    ollamaPID: psfOllamaProcess.pid,
    metadata: { gpu: gpuInfo?.name || 'CPU', platform: 'windows-x64', serviceType }
  });
  
  psfOllamaProcess.stdout.on('data', (data) => {
    console.log('[Windows x64] Ollama stdout:', data.toString().trim());
  });
  
  psfOllamaProcess.stderr.on('data', (data) => {
    console.log('[Windows x64] Ollama stderr:', data.toString().trim());
  });
  
  console.log(`[Windows x64] PSF Ollama Server started on port ${port} (PID: ${psfOllamaProcess.pid})`);
  
  return port;
}

/**
 * Stop PSF Ollama Server (Windows x64)
 * Kills entire process tree to include runner subprocesses
 */
async function stopOllamaServer() {
  if (psfOllamaProcess) {
    console.log('[Windows x64] Stopping PSF Ollama Server (killing process tree)...');
    const pid = psfOllamaProcess.pid;
    try {
      // Kill entire process tree with taskkill /T
      await execPromise(`taskkill /F /T /PID ${pid}`);
      console.log(`[Windows x64] Killed process tree ${pid}`);
    } catch (err) {
      // Fallback to killing just the process
      try {
        psfOllamaProcess.kill();
      } catch (e) {
        // Process already dead
      }
    }
    PortPool.releasePort(psfOllamaPort);
    psfOllamaProcess = null;
    psfOllamaPort = null;
  }
}

/**
 * Open Ollama Terminal (Windows x64)
 * Uses the EXISTING psfOllamaProcess - does NOT start a new server
 * Session manager controls the lifecycle
 */
async function openOllamaTerminal(appPath, modelName, preloadPath, terminalHtmlPath, gpuInfo, modelVramMB = 0, collection = '', modelConfig = null) {
  const { BrowserWindow, screen } = require('electron');
  
  console.log('[Windows x64] Opening Ollama Terminal...');
  
  // Use the EXISTING server that launchModelInOllama started
  if (!psfOllamaProcess || !psfOllamaPort) {
    console.error('[Windows x64] ERROR: No Ollama server running! Model must be loaded first.');
    return { success: false, message: 'No Ollama server running. Load model first.' };
  }
  
  const port = psfOllamaPort;
  console.log(`[Windows x64] Using existing Ollama server on port ${port}`);
  
  // Create terminal window
  const terminalBounds = getSafeWindowBounds({
    screenRef: screen,
    widthPct: 0.94,
    heightPct: 0.92,
    minWidth: 760,
    minHeight: 560
  });
  terminalWindow = new BrowserWindow({
    ...terminalBounds,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    },
    backgroundColor: '#1a1a2e',
    autoHideMenuBar: true
  });
  
  // Build URL with model config parameters
  let url = `file://${terminalHtmlPath}?model=${encodeURIComponent(modelName)}&port=${port}&gpuType=${gpuInfo.accelerationType}&collection=${encodeURIComponent(collection || '')}&windowId=${terminalWindow.id}`;
  
  if (modelConfig) {
    if (modelConfig.systemPrompt) {
      url += `&systemPrompt=${encodeURIComponent(modelConfig.systemPrompt)}`;
    }
    if (modelConfig.params) {
      const params = modelConfig.params;
      if (params.temperature !== undefined) url += `&temperature=${params.temperature}`;
      if (params.top_p !== undefined) url += `&top_p=${params.top_p}`;
      if (params.top_k !== undefined) url += `&top_k=${params.top_k}`;
      if (params.num_ctx !== undefined) url += `&num_ctx=${params.num_ctx}`;
      if (params.num_gpu !== undefined) url += `&num_gpu=${params.num_gpu}`;
      if (params.num_predict !== undefined) url += `&num_predict=${params.num_predict}`;
      if (params.repeat_penalty !== undefined) url += `&repeat_penalty=${params.repeat_penalty}`;
      if (params.seed !== undefined) url += `&seed=${params.seed}`;
      if (params.stop) {
        const stops = Array.isArray(params.stop) ? params.stop : [params.stop];
        url += `&stop=${encodeURIComponent(JSON.stringify(stops))}`;
      }
    }
    console.log(`[Windows x64] Including model config in terminal URL`);
  }
  terminalWindow.loadURL(url);
  
  // Cleanup on close - kill the MAIN server since terminal is done
  terminalWindow.on('closed', async () => {
    console.log('[Windows x64] Terminal window closed, closing Ollama session...');
    
    // Kill the main server process tree (including runners)
    if (psfOllamaProcess) {
      const pid = psfOllamaProcess.pid;
      try {
        await execPromise(`taskkill /F /T /PID ${pid}`);
        console.log(`[Windows x64] Killed Ollama process tree ${pid}`);
      } catch (err) {
        try { psfOllamaProcess.kill(); } catch (e) {}
      }
      psfOllamaProcess = null;
    }
    
    // Close session through session manager
    if (psfOllamaSessionId) {
      const portPools = { ollama: PortPool };
      await sessionManager.closeSession(psfOllamaSessionId, portPools);
      psfOllamaSessionId = null;
    }
    
    if (psfOllamaPort) {
      PortPool.releasePort(psfOllamaPort);
      psfOllamaPort = null;
    }
    
    terminalWindow = null;
    
    console.log('[Windows x64] Ollama session closed');
  });
  
  return { success: true, port: port, windowId: terminalWindow.id };
}

/**
 * Stop all instances (Windows x64)
 * Single Ollama server architecture - kill main server and cleanup
 */
async function stopAllInstances() {
  console.log('[Windows x64] Stopping all Ollama instances...');
  
  // Close terminal window first
  if (terminalWindow) {
    terminalWindow.close();
    terminalWindow = null;
  }
  
  // Kill main server process tree
  if (psfOllamaProcess) {
    const pid = psfOllamaProcess.pid;
    try {
      await execPromise(`taskkill /F /T /PID ${pid}`);
      console.log(`[Windows x64] Killed Ollama process tree ${pid}`);
    } catch (err) {
      try { psfOllamaProcess.kill(); } catch (e) {}
    }
    psfOllamaProcess = null;
  }
  
  if (psfOllamaPort) {
    PortPool.releasePort(psfOllamaPort);
    psfOllamaPort = null;
  }
  
  psfOllamaSessionId = null;
  
  // Safety net: Kill any remaining processes matching our bundled Ollama binary
  try {
    const { stdout } = await execPromise(`wmic process where "ExecutablePath like '%binaries\\\\ollama\\\\windows-x64%'" get ProcessId`);
    const pids = stdout.match(/\d+/g) || [];
    
    for (const pid of pids) {
      try {
        console.log(`[Windows x64] Killing remaining Ollama process PID: ${pid}`);
        await execPromise(`taskkill /F /PID ${pid}`);
      } catch (err) {
        // Process may already be dead
      }
    }
    if (pids.length > 0) {
      console.log(`[Windows x64] Cleaned up ${pids.length} remaining Ollama process(es)`);
    }
  } catch (err) {
    // No matching processes found - that's fine
  }
  
  console.log('[Windows x64] All Ollama instances stopped');
}

// ============================================================================
// EXPORTS
// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  killStalePSFOllama,
  startOllamaServer,
  startOllamaServerOnPort,
  stopOllamaServer,
  openOllamaTerminal,
  stopAllInstances,
  getPSFOllamaPort: () => {
    console.warn('[Windows x64] DEPRECATED: getPSFOllamaPort() called. Use session-manager.getOllamaPortForService() instead.');
    return psfOllamaPort;
  },
  getTerminalWindow: () => terminalWindow
};
