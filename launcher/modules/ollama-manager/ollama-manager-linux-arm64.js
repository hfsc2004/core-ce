/**
 * ollama-manager-linux-arm64.js
 * Linux ARM64 Platform-Specific Implementation
 * Version: 1.1.3 - January 13, 2026
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
 * Kill stale PSF Ollama processes (Linux ARM64 implementation)
 */
async function killStalePSFOllama(appPath) {
  console.log('[Linux ARM64] Checking for stale PSF Ollama processes...');
  
  const binariesPath = path.join(appPath, '..', 'binaries', 'ollama', 'linux-arm64', 'bin');
  
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
        const { stdout } = await execPromise(`lsof -ti:${port}`);
        const pids = stdout.trim().split('\n').filter(p => p);
        
        for (const pid of pids) {
          // Verify this is OUR Ollama binary
          const { stdout: cmdline } = await execPromise(`ps -p ${pid} -o command=`);
          
          if (cmdline.includes(binariesPath)) {
            console.log(`[Linux ARM64] Killing stale PSF Ollama process on port ${port} (PID: ${pid})`);
            try {
              // Try to kill process group first (catches runners)
              process.kill(-parseInt(pid), 'SIGTERM');
            } catch (groupErr) {
              // Fallback to killing just the process
              process.kill(parseInt(pid), 'SIGTERM');
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
 * 
 * @param {string} appPath - Application __dirname path
 * @param {Object} gpuInfo - GPU information from gpu-detector
 * @param {number} port - Pre-allocated port from session-manager
 * @returns {Promise<Object>} Result with { pid, port, process }
 */
async function startOllamaServerOnPort(appPath, gpuInfo, port) {
  console.log(`[Linux ARM64] Starting Ollama server on pre-allocated port ${port}...`);
  
  if (!port) {
    throw new Error('Port is required - must be pre-allocated by session-manager');
  }
  
  // Kill any stale processes first
  await killStalePSFOllama(appPath);
  
  // Get Ollama binary path
  const ollamaPath = pathManager.getOllamaPath(appPath, 'linux-arm64');
  
  // Build environment
  const ollamaEnv = {
    ...process.env,
    OLLAMA_HOST: `0.0.0.0:${port}`,
    OLLAMA_ORIGINS: '*',
    OLLAMA_MODELS: path.join(appPath, '..', 'models')
  };
  
  // GPU configuration (Mali, NPU, etc.)
  if (gpuInfo) {
    console.log(`[Linux ARM64] Using ${gpuInfo.accelerationType} acceleration`);
  }
  
  // Spawn process with detached:true for process group management
  const ollamaProcess = spawn(ollamaPath, ['serve'], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: ollamaEnv
  });
  
  // Store globally for terminal reuse
  psfOllamaProcess = ollamaProcess;
  psfOllamaPort = port;
  
  // Capture output for debugging
  ollamaProcess.stdout.on('data', (data) => {
    console.log('[Linux ARM64] Ollama stdout:', data.toString().trim());
  });
  
  ollamaProcess.stderr.on('data', (data) => {
    console.log('[Linux ARM64] Ollama stderr:', data.toString().trim());
  });
  
  console.log(`[Linux ARM64] ✅ Ollama ready: PID ${ollamaProcess.pid} on port ${port}`);
  
  // Return structured result for session-manager
  return {
    pid: ollamaProcess.pid,
    port: port,
    process: ollamaProcess
  };
}

/**
 * Start PSF Ollama Server (Linux ARM64)
 * BACKWARD COMPATIBLE - allocates its own port from segregated pools
 * 
 * @param {string} appPath - Application __dirname path
 * @param {Object} gpuInfo - GPU information from gpu-detector
 * @param {string} serviceType - Service type: 'webui', 'anythingllm', or 'terminal' (default)
 * @returns {number} Port number of the server
 */
async function startOllamaServer(appPath, gpuInfo, serviceType = 'terminal') {
  console.log(`[Linux ARM64] Starting Ollama server (serviceType: ${serviceType})...`);
  
  // Kill any stale processes first
  await killStalePSFOllama(appPath);
  
  // Return existing if already running
  if (psfOllamaProcess && psfOllamaPort) {
    console.log(`[Linux ARM64] PSF Ollama already running on port ${psfOllamaPort}`);
    return psfOllamaPort;
  }
  
  // Get Ollama binary path
  const ollamaPath = pathManager.getOllamaPath(appPath, 'linux-arm64');
  
  // Allocate port from the CORRECT segregated pool based on serviceType
  let port;
  const normalizedType = serviceType.toLowerCase().trim();
  
  switch (normalizedType) {
    case 'webui':
    case 'openwebui':
    case 'open-webui':
      port = PortPool.getWebUIPort(`WebUI Ollama [direct]`);
      console.log(`[Linux ARM64] Allocated port ${port} from WEBUI pool`);
      break;
    case 'anythingllm':
    case 'anything-llm':
      port = PortPool.getAnythingLLMPort(`AnythingLLM Ollama [direct]`);
      console.log(`[Linux ARM64] Allocated port ${port} from ANYTHINGLLM pool`);
      break;
    case 'terminal':
    default:
      port = PortPool.getTerminalPort(`Terminal Ollama [direct]`);
      console.log(`[Linux ARM64] Allocated port ${port} from TERMINAL pool`);
      break;
  }
  
  psfOllamaPort = port;
  
  // Build environment
  const ollamaEnv = {
    ...process.env,
    OLLAMA_HOST: `0.0.0.0:${port}`,
    OLLAMA_ORIGINS: '*',
    OLLAMA_MODELS: path.join(appPath, '..', 'models')
  };
  
  // GPU configuration (Mali, NPU, etc.)
  if (gpuInfo) {
    console.log(`[Linux ARM64] Using ${gpuInfo.accelerationType} acceleration`);
  }
  
  // Spawn process with detached:true to create new process group
  psfOllamaProcess = spawn(ollamaPath, ['serve'], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: ollamaEnv
  });
  
  // Register session for tracking and cleanup
  psfOllamaSessionId = sessionManager.registerSession({
    type: normalizedType === 'webui' || normalizedType === 'openwebui' ? 'openwebui' : 
          normalizedType === 'anythingllm' ? 'anythingllm' : 'terminal',
    ollamaPort: port,
    ollamaPID: psfOllamaProcess.pid,
    metadata: { 
      gpu: gpuInfo?.name || 'CPU', 
      platform: 'linux-arm64',
      serviceType: serviceType,
      startedVia: 'startOllamaServer'
    }
  });
  
  // Capture Ollama output for debugging
  psfOllamaProcess.stdout.on('data', (data) => {
    console.log('[Linux ARM64] Ollama stdout:', data.toString().trim());
  });
  
  psfOllamaProcess.stderr.on('data', (data) => {
    console.log('[Linux ARM64] Ollama stderr:', data.toString().trim());
  });
  
  console.log(`[Linux ARM64] ✅ PSF Ollama Server started on port ${port} (PID: ${psfOllamaProcess.pid})`);
  
  return port;
}

/**
 * Stop PSF Ollama Server (Linux ARM64)
 * Kills entire process group to include runner subprocesses
 */
function stopOllamaServer() {
  if (psfOllamaProcess) {
    console.log('[Linux ARM64] Stopping PSF Ollama Server (killing process group)...');
    const pid = psfOllamaProcess.pid;
    try {
      // Kill entire process group (negative PID) - this kills runners too
      process.kill(-pid, 'SIGTERM');
      console.log(`[Linux ARM64] Killed process group ${pid}`);
    } catch (err) {
      // Fallback to killing just the process
      try {
        psfOllamaProcess.kill('SIGTERM');
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
 * Open Ollama Terminal (Linux ARM64)
 * Uses the EXISTING psfOllamaProcess - does NOT start a new server
 * Session manager controls the lifecycle
 */
async function openOllamaTerminal(appPath, modelName, preloadPath, terminalHtmlPath, gpuInfo, modelVramMB = 0, collection = '', modelConfig = null) {
  const { BrowserWindow, screen } = require('electron');
  
  console.log('[Linux ARM64] Opening Ollama Terminal...');
  
  // Use the EXISTING server that launchModelInOllama started
  if (!psfOllamaProcess || !psfOllamaPort) {
    console.error('[Linux ARM64] ERROR: No Ollama server running! Model must be loaded first.');
    return { success: false, message: 'No Ollama server running. Load model first.' };
  }
  
  const port = psfOllamaPort;
  console.log(`[Linux ARM64] Using existing Ollama server on port ${port}`);
  
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
  
  // Build URL with optional system prompt
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
    console.log(`[Linux ARM64] Including model config in terminal URL`);
  }
  terminalWindow.loadURL(url);
  
  // Cleanup on close - kill the MAIN server since terminal is done
  terminalWindow.on('closed', async () => {
    console.log('[Linux ARM64] Terminal window closed, closing Ollama session...');
    
    // Kill the main server process group (including runners)
    if (psfOllamaProcess) {
      const pid = psfOllamaProcess.pid;
      try {
        process.kill(-pid, 'SIGTERM');
        console.log(`[Linux ARM64] Killed Ollama process group ${pid}`);
      } catch (err) {
        try { psfOllamaProcess.kill('SIGTERM'); } catch (e) {}
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
    
    console.log('[Linux ARM64] Ollama session closed');
  });
  
  return { success: true, port: port, windowId: terminalWindow.id };
}

/**
 * Stop all instances (Linux ARM64)
 * Single Ollama server architecture - kill main server and cleanup
 */
async function stopAllInstances() {
  console.log('[Linux ARM64] Stopping all Ollama instances...');
  
  // Close terminal window first
  if (terminalWindow) {
    terminalWindow.close();
    terminalWindow = null;
  }
  
  // Kill main server process group
  if (psfOllamaProcess) {
    const pid = psfOllamaProcess.pid;
    try {
      process.kill(-pid, 'SIGTERM');
      console.log(`[Linux ARM64] Killed Ollama process group ${pid}`);
    } catch (err) {
      try { psfOllamaProcess.kill('SIGTERM'); } catch (e) {}
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
    const { stdout } = await execPromise(`pgrep -f "binaries/ollama/linux-arm64"`);
    const pids = stdout.trim().split('\n').filter(p => p);
    
    for (const pid of pids) {
      try {
        console.log(`[Linux ARM64] Killing remaining Ollama process PID: ${pid}`);
        process.kill(parseInt(pid), 'SIGTERM');
      } catch (err) {
        // Process may already be dead
      }
    }
    if (pids.length > 0) {
      console.log(`[Linux ARM64] Cleaned up ${pids.length} remaining Ollama process(es)`);
    }
  } catch (err) {
    // No matching processes found - that's fine
  }
  
  console.log('[Linux ARM64] All Ollama instances stopped');
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  killStalePSFOllama,
  startOllamaServer,
  startOllamaServerOnPort,  // NEW: For session-manager orchestration
  stopOllamaServer,
  openOllamaTerminal,
  stopAllInstances,
  getPSFOllamaPort: () => {
    console.warn('[Linux ARM64] ⚠️  DEPRECATED: getPSFOllamaPort() called. Use session-manager.getOllamaPortForService() instead.');
    return psfOllamaPort;
  },
  getTerminalWindow: () => terminalWindow
};
