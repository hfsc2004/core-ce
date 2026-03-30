/**
 * ollama-manager-linux-x64.js
 * Linux x64 Platform-Specific Implementation
 * Version: 1.1.3 - January 13, 2026
 *
 * MULTI-INSTANCE ARCHITECTURE:
 * Each terminal window gets its own Ollama server on its own port.
 */

const path = require('path');
const PortPool = require('../port-pool/port-pool-ollama');
const pathManager = require('../path-manager/path-manager');
const logger = require('../logger');
const sessionManager = require('../session-manager');
const processTools = require('./ollama-manager-linux-x64-process');
const sessionStore = require('./ollama-manager-linux-x64-sessions');
const { getSafeWindowBounds } = require('../window-bounds');

const LOG_PREFIX = 'Linux x64';
const PORT_RANGES = [
  { start: 52434, end: 52443, type: 'WEBUI' },
  { start: 52444, end: 52453, type: 'ANYTHINGLLM' },
  { start: 52454, end: 52463, type: 'TERMINAL' }
];

function resolveServiceType(serviceType) {
  const normalized = (serviceType || 'terminal').toLowerCase().trim();
  if (['webui', 'openwebui', 'open-webui'].includes(normalized)) {
    return 'webui';
  }
  if (['anythingllm', 'anything-llm'].includes(normalized)) {
    return 'anythingllm';
  }
  return 'terminal';
}

function allocatePortForService(serviceType) {
  switch (serviceType) {
    case 'webui':
      return PortPool.getWebUIPort('WebUI Ollama [direct]');
    case 'anythingllm':
      return PortPool.getAnythingLLMPort('AnythingLLM Ollama [direct]');
    case 'terminal':
    default:
      return PortPool.getTerminalPort('Terminal Ollama [direct]');
  }
}

function serviceTypeForSession(serviceType) {
  if (serviceType === 'webui') return 'openwebui';
  if (serviceType === 'anythingllm') return 'anythingllm';
  return 'terminal';
}

function logGpuMode(gpuInfo, forceCpu) {
  if (forceCpu) {
    console.log(`[${LOG_PREFIX}] 🖥️ Force CPU mode - GPU disabled (CUDA_VISIBLE_DEVICES="")`);
    return;
  }

  if (gpuInfo && gpuInfo.accelerationType === 'nvidia') {
    console.log(`[${LOG_PREFIX}] Detected GPU: ${gpuInfo.name} (letting Ollama auto-discover)`);
  }
}

async function waitUntilReadyOrFail(ollamaProcess, port, releasePortOnFailure) {
  console.log(`[${LOG_PREFIX}] Waiting for Ollama server to be ready...`);
  const result = await processTools.waitForOllamaReady(port, 30);

  if (result.ready) {
    console.log(`[${LOG_PREFIX}] Ollama server ready on port ${port} (took ${result.seconds}s)`);
    return;
  }

  console.error(`[${LOG_PREFIX}] Ollama server did not become ready in time`);
  try {
    process.kill(-ollamaProcess.pid, 'SIGTERM');
  } catch (_err) {
    // Ignore process cleanup errors.
  }

  if (releasePortOnFailure) {
    PortPool.releasePort(port);
  }

  sessionStore.deletePortSession(port);
  throw new Error('Ollama server startup timeout');
}

function attachExitCleanup(processRef, port) {
  processRef.on('exit', (code, signal) => {
    console.log(`[${LOG_PREFIX}] Ollama process exited (code: ${code}, signal: ${signal})`);
    sessionStore.deletePortSession(port);
  });
}

/**
 * Kill stale PSF Ollama processes (Linux x64 implementation)
 */
async function killStalePSFOllama(appPath) {
  await processTools.killStalePSFProcessesByPorts(
    appPath,
    'linux-x64',
    PORT_RANGES,
    LOG_PREFIX
  );
}

/**
 * Start Ollama server on a pre-allocated port (called by session-manager).
 */
async function startOllamaServerOnPort(appPath, gpuInfo, port) {
  console.log(`[${LOG_PREFIX}] Starting Ollama server on pre-allocated port ${port}...`);

  if (!port) {
    throw new Error('Port is required - must be pre-allocated by session-manager');
  }

  const ollamaPath = pathManager.getOllamaBinaryPath(appPath, 'linux-x64');
  logger.info('Ollama binary path', { path: ollamaPath });

  const env = processTools.createOllamaEnv(appPath, port, false);
  logGpuMode(gpuInfo, false);
  logger.info('Starting Ollama server (via session-manager)', { port });

  const ollamaProcess = processTools.spawnOllamaProcess(ollamaPath, env);
  sessionStore.setPortSession(port, {
    process: ollamaProcess,
    port,
    sessionId: null,
    window: null,
    modelName: null
  });

  attachExitCleanup(ollamaProcess, port);
  await waitUntilReadyOrFail(ollamaProcess, port, false);

  console.log(`[${LOG_PREFIX}] ✅ Ollama ready: PID ${ollamaProcess.pid} on port ${port}`);
  return { pid: ollamaProcess.pid, port, process: ollamaProcess };
}

function bindSessionToPort(port, sessionId) {
  if (!port || !sessionId) return false;
  return sessionStore.bindSessionIdToPort(port, sessionId);
}

/**
 * Start a new PSF Ollama server (backward-compatible path).
 */
async function startOllamaServer(appPath, gpuInfo, serviceType = 'terminal', forceCpu = false) {
  const normalizedType = resolveServiceType(serviceType);
  console.log(`[${LOG_PREFIX}] Starting NEW Ollama server instance (serviceType: ${normalizedType})...`);

  const ollamaPath = pathManager.getOllamaBinaryPath(appPath, 'linux-x64');
  logger.info('Ollama binary path', { path: ollamaPath });

  const port = allocatePortForService(normalizedType);
  if (!port) {
    throw new Error(`Failed to allocate port from ${normalizedType} pool - all ports in use`);
  }
  console.log(`[${LOG_PREFIX}] Allocated port ${port} from ${normalizedType.toUpperCase()} pool`);

  const env = processTools.createOllamaEnv(appPath, port, forceCpu);
  logGpuMode(gpuInfo, forceCpu);
  logger.info('Starting Ollama server', { port, serviceType: normalizedType });

  const ollamaProcess = processTools.spawnOllamaProcess(ollamaPath, env);
  const sessionId = sessionManager.registerSession({
    type: serviceTypeForSession(normalizedType),
    ollamaPort: port,
    ollamaPID: ollamaProcess.pid,
    metadata: {
      gpu: gpuInfo?.name || 'CPU',
      serviceType,
      startedVia: 'startOllamaServer'
    }
  });

  sessionStore.setPortSession(port, {
    process: ollamaProcess,
    port,
    sessionId,
    window: null,
    modelName: null
  });

  attachExitCleanup(ollamaProcess, port);
  await waitUntilReadyOrFail(ollamaProcess, port, true);

  console.log(`[${LOG_PREFIX}] Ollama: PID ${ollamaProcess.pid} on port ${port}`);
  return port;
}

/**
 * Stop a specific Ollama server by port.
 */
async function stopOllamaServer(port) {
  console.log(`[${LOG_PREFIX}] Stopping Ollama server on port ${port}...`);

  for (const [key, session] of sessionStore.entries()) {
    if (session.port === port) {
      await closeTerminalSession(key);
      return;
    }
  }

  await processTools.killProcessesOnPort(port, LOG_PREFIX);
  PortPool.releasePort(port);
  console.log(`[${LOG_PREFIX}] Released port ${port}`);
}

/**
 * Close a terminal session and its Ollama server.
 */
async function closeTerminalSession(windowId) {
  const session = sessionStore.getWindowSession(windowId);
  if (!session) {
    console.log(`[${LOG_PREFIX}] No Ollama session found for window ${windowId} (checking BMOC-owned sessions)`);
  }

  if (session) {
    console.log(`[${LOG_PREFIX}] Closing session for window ${windowId} (port ${session.port})`);
  }

  if (session?.process) {
    const pid = session.process.pid;
    try {
      process.kill(-pid, 'SIGTERM');
      console.log(`[${LOG_PREFIX}] Killed Ollama process group ${pid}`);
    } catch (_err) {
      try {
        session.process.kill('SIGTERM');
      } catch (_e) {
        // Already dead.
      }
    }
  }

  if (session?.port) {
    PortPool.releasePort(session.port);
    console.log(`[${LOG_PREFIX}] Released port ${session.port}`);
  }

  sessionStore.deleteWindowSession(windowId);
  // Critical: close ALL BMOC terminal sessions owned by this window (ollama + llama.cpp).
  const ownerWindowId = Number(windowId || 0);
  const activeTerminalSessions = sessionManager.getActiveSessionsForService?.('terminal') || [];
  let closedCount = 0;
  for (const active of Array.isArray(activeTerminalSessions) ? activeTerminalSessions : []) {
    const sessionId = String(active?.sessionId || '').trim();
    if (!sessionId) continue;
    const owner = Number(active?.metadata?.ownerWindowId || 0);
    if (!ownerWindowId || owner !== ownerWindowId) continue;
    try {
      await sessionManager.closeSession(sessionId, { ollama: PortPool });
      closedCount += 1;
    } catch (err) {
      console.warn(`[${LOG_PREFIX}] Failed closing BMOC session ${sessionId} for window ${windowId}: ${err?.message || err}`);
    }
  }
  console.log(`[${LOG_PREFIX}] Session closed for window ${windowId} (bmocClosed=${closedCount})`);
}

/**
 * Open Ollama terminal connected to an existing server.
 */
async function openOllamaTerminal(appPath, modelName, preloadPath, terminalHtmlPath, gpuInfo, modelVramMB = 0, ollamaPort = null, modelConfig = null, terminalSessionId = null) {
  const { BrowserWindow, screen } = require('electron');

  console.log(`[${LOG_PREFIX}] Opening Ollama Terminal...`);
  console.log(`[${LOG_PREFIX}] Model: ${modelName}, Port: ${ollamaPort}`);

  if (!ollamaPort) {
    console.log(`[${LOG_PREFIX}] No port provided - starting Ollama via session-manager...`);
    ollamaPort = await startOllamaServer(appPath, gpuInfo, 'terminal');
    console.log(`[${LOG_PREFIX}] Ollama started on port ${ollamaPort}`);
  }

  const sessionInfo = sessionStore.getPortSession(ollamaPort);
  if (!sessionInfo) {
    console.warn(`[${LOG_PREFIX}] No session found for port ${ollamaPort} - server may have been started externally`);
  }

  const terminalBounds = getSafeWindowBounds({
    screenRef: screen,
    widthPct: 0.94,
    heightPct: 0.92,
    minWidth: 760,
    minHeight: 560
  });
  const terminalWindow = new BrowserWindow({
    ...terminalBounds,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    },
    backgroundColor: '#1a1a2e',
    autoHideMenuBar: true
  });

  const windowId = terminalWindow.id;
  sessionStore.movePortSessionToWindow(ollamaPort, windowId, {
    window: terminalWindow,
    modelName,
    sessionId: terminalSessionId || null
  });

  console.log(`[${LOG_PREFIX}] Terminal window ${windowId} -> Ollama port ${ollamaPort}`);
  console.log(`[${LOG_PREFIX}] Active terminal sessions: ${sessionStore.size()}`);

  let url = `file://${terminalHtmlPath}?model=${encodeURIComponent(modelName)}&port=${ollamaPort}&gpuType=${gpuInfo?.accelerationType || 'cpu'}&windowId=${windowId}`;

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
    console.log(`[${LOG_PREFIX}] Including model config in terminal URL`);
  }

  terminalWindow.loadURL(url);
  terminalWindow.on('closed', async () => {
    console.log(`[${LOG_PREFIX}] Terminal window ${windowId} closed`);
    await closeTerminalSession(windowId);
    console.log(`[${LOG_PREFIX}] Remaining terminal sessions: ${sessionStore.size()}`);
  });

  return { success: true, port: ollamaPort, windowId };
}

/**
 * Stop all instances for this platform manager.
 */
async function stopAllInstances() {
  console.log(`[${LOG_PREFIX}] Stopping all Ollama instances...`);

  const activeKeys = sessionStore.keys();
  console.log(`[${LOG_PREFIX}] Closing ${activeKeys.length} active session(s)`);

  for (const windowId of activeKeys) {
    const session = sessionStore.getWindowSession(windowId);
    if (session?.window && !session.window.isDestroyed()) {
      session.window.close();
    } else {
      await closeTerminalSession(windowId);
    }
  }

  await processTools.killRemainingByPattern('binaries/ollama/linux-x64', LOG_PREFIX);
  console.log(`[${LOG_PREFIX}] All Ollama instances stopped`);
}

function getActiveSessionCount() {
  return sessionStore.size();
}

function getActivePorts() {
  return sessionStore.values().map((s) => s.port);
}

module.exports = {
  killStalePSFOllama,
  startOllamaServer,
  startOllamaServerOnPort,
  bindSessionToPort,
  stopOllamaServer,
  openOllamaTerminal,
  stopAllInstances,
  closeTerminalSession,
  getActiveSessionCount,
  getActivePorts,
  getPSFOllamaPort: () => {
    console.warn(`[${LOG_PREFIX}] ⚠️  DEPRECATED: getPSFOllamaPort() called. Use session-manager.getOllamaPortForService() instead.`);
    const sessions = sessionStore.values();
    return sessions.length > 0 ? sessions[0].port : null;
  },
  getTerminalWindow: () => {
    const sessions = sessionStore.values();
    return sessions.length > 0 ? sessions[0].window : null;
  },
  getAllTerminalWindows: () => {
    return sessionStore
      .values()
      .filter((s) => s.window && !s.window.isDestroyed())
      .map((s) => s.window);
  }
};
