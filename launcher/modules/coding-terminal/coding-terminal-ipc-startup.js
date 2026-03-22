/**
 * PSF Coding Terminal - IPC Startup/Session Helpers
 */

'use strict';
const createStartupGpuTools = require('./coding-terminal-ipc-startup-gpu');

function createStartupTools(deps = {}) {
  const sessionManager = deps.sessionManager;
  const PortPoolOllama = deps.PortPoolOllama;
  const path = deps.path;
  const execFileSync = deps.execFileSync;
  const getBackend = deps.getBackend;
  const getRuntimeContext = deps.getRuntimeContext;
  const getConfig = deps.getConfig;
  const emitModelStartupStatus = deps.emitModelStartupStatus;
  const onTerminalOllamaClosed = typeof deps.onTerminalOllamaClosed === 'function' ? deps.onTerminalOllamaClosed : () => {};
  const onRagOllamaClosed = typeof deps.onRagOllamaClosed === 'function' ? deps.onRagOllamaClosed : () => {};
  const gpuTools = createStartupGpuTools({ execFileSync });
  const resolvePreferredNvidiaGpuIndex = gpuTools.resolvePreferredNvidiaGpuIndex;
  const resolvePreferredNvidiaGpuUuid = gpuTools.resolvePreferredNvidiaGpuUuid;

  let terminalOllamaSessionId = null;
  let terminalOllamaPort = null;
  let terminalLlamaSessionId = null;
  let terminalLlamaPort = null;
  let terminalLlamaModelPath = null;
  let terminalLlamaStandbySessionId = null;
  let terminalLlamaStandbyPort = null;
  let terminalLlamaStandbyModelPath = null;
  let routerOllamaSessionId = null;
  let routerOllamaPort = null;
  let routerLlamaSessionId = null;
  let routerLlamaPort = null;
  let ragOllamaSessionId = null;
  let ragOllamaPort = null;
  let terminalOllamaStartPromise = null;
  let terminalLlamaStartPromise = null;
  let terminalLlamaSwapPromise = null;
  let routerOllamaStartPromise = null;
  let routerLlamaStartPromise = null;
  let ragOllamaStartPromise = null;

  async function ensureTerminalOllamaReady() {
    if (getBackend() !== 'ollama') {
      return { success: true };
    }
    if (terminalOllamaSessionId && terminalOllamaPort) {
      return { success: true };
    }
    if (terminalOllamaStartPromise) return terminalOllamaStartPromise;
    terminalOllamaStartPromise = (async () => {
      const runtimeContext = getRuntimeContext();
      if (!runtimeContext?.appDir) {
        return { success: false, error: 'Coding Terminal runtime context missing appDir' };
      }
      const result = await sessionManager.startOllamaForService(
        'terminal',
        runtimeContext.appDir,
        runtimeContext.gpuInfo || null
      );
      if (!result.success) {
        return { success: false, error: result.message || 'Failed to start BMOC terminal Ollama session' };
      }
      terminalOllamaSessionId = result.sessionId;
      terminalOllamaPort = result.ollamaPort;
      return { success: true };
    })().finally(() => {
      terminalOllamaStartPromise = null;
    });
    return terminalOllamaStartPromise;
  }

  async function ensureTerminalLlamaReady(options = {}) {
    const sender = options?.sender || null;
    if (getBackend() !== 'llama-cpp') {
      return { success: true };
    }
    const cfg = getConfig() || {};
    const requestedModelPath = String(options?.modelPath || cfg?.llamaCppModelPath || '').trim();
    if (!requestedModelPath) {
      emitModelStartupStatus(sender, {
        phase: 'config',
        status: 'error',
        detail: 'No GGUF path configured for llama.cpp'
      });
      return {
        success: false,
        error: 'llama.cpp backend selected but no GGUF path configured (`llamaCppModelPath` in coding-terminal config).'
      };
    }

    if (terminalLlamaSessionId && terminalLlamaPort && terminalLlamaModelPath === requestedModelPath) {
      emitModelStartupStatus(sender, {
        phase: 'reuse',
        status: 'ready',
        detail: `Using active llama.cpp session @${terminalLlamaPort}`
      });
      return { success: true };
    }
    if (terminalLlamaSessionId && terminalLlamaPort && terminalLlamaModelPath !== requestedModelPath) {
      return swapTerminalLlamaModel({ modelPath: requestedModelPath, sender });
    }
    if (
      terminalLlamaStandbySessionId &&
      terminalLlamaStandbyPort &&
      terminalLlamaStandbyModelPath === requestedModelPath
    ) {
      terminalLlamaSessionId = terminalLlamaStandbySessionId;
      terminalLlamaPort = terminalLlamaStandbyPort;
      terminalLlamaModelPath = terminalLlamaStandbyModelPath;
      terminalLlamaStandbySessionId = null;
      terminalLlamaStandbyPort = null;
      terminalLlamaStandbyModelPath = null;
      emitModelStartupStatus(sender, {
        phase: 'promote',
        status: 'ok',
        detail: `Promoted warm standby llama.cpp session @${terminalLlamaPort}`
      });
      return { success: true };
    }
    if (terminalLlamaStartPromise) return terminalLlamaStartPromise;
    terminalLlamaStartPromise = (async () => {
      const started = await startTerminalLlamaSession({
        modelPath: requestedModelPath,
        sender,
        phase: 'start'
      });
      if (!started.success) {
        return { success: false, error: started.error };
      }
      terminalLlamaSessionId = started.sessionId;
      terminalLlamaPort = started.port;
      terminalLlamaModelPath = requestedModelPath;
      return { success: true };
    })().finally(() => {
      terminalLlamaStartPromise = null;
    });
    return terminalLlamaStartPromise;
  }

  async function startTerminalLlamaSession(options = {}) {
    const sender = options?.sender || null;
    const phase = String(options?.phase || 'start').trim();
    const modelPath = String(options?.modelPath || '').trim();
    const runtimeContext = getRuntimeContext();
    if (!runtimeContext?.appDir) {
      return { success: false, error: 'Coding Terminal runtime context missing appDir' };
    }
    if (!modelPath) {
      return { success: false, error: 'No GGUF path configured for llama.cpp.' };
    }
    const cfg = getConfig() || {};
    const gpuInfo = runtimeContext.gpuInfo || null;
    const nvidiaDetected = String(gpuInfo?.accelerationType || '').toLowerCase() === 'nvidia';
    const preferredMainGpuIndex = resolvePreferredNvidiaGpuIndex(gpuInfo, cfg?.llamaCppMainGpuIndex);
    const preferredMainGpuUuid = resolvePreferredNvidiaGpuUuid(gpuInfo, cfg?.llamaCppMainGpuUuid);
    const configuredGpuLayers = Number(cfg?.llamaCppGpuLayers);
    const effectiveGpuLayers = Number.isFinite(configuredGpuLayers)
      ? configuredGpuLayers
      : (nvidiaDetected && cfg?.llamaCppForceCpu !== true ? 999 : null);
    const startupStartedAt = Date.now();

    emitModelStartupStatus(sender, {
      phase,
      status: 'begin',
      detail: `Starting llama.cpp session for ${path.basename(modelPath)}`
    });
    const result = await sessionManager.startLlamaCppForService(
      'terminal',
      runtimeContext.appDir,
      {
        modelPath,
        contextSize: Number(cfg?.llamaCppContextSize) || 8192,
        threads: Number(cfg?.llamaCppThreads) || 0,
        parallel: Number(cfg?.llamaCppParallel) || 1,
        gpuLayers: effectiveGpuLayers,
        forceCpu: cfg?.llamaCppForceCpu === true,
        splitMode: nvidiaDetected && cfg?.llamaCppForceCpu !== true ? 'none' : null,
        mainGpuIndex: nvidiaDetected && cfg?.llamaCppForceCpu !== true
          ? (preferredMainGpuUuid ? 0 : preferredMainGpuIndex)
          : null,
        cudaVisibleDevices: nvidiaDetected && cfg?.llamaCppForceCpu !== true ? preferredMainGpuUuid : null
      }
    );
    if (!result.success) {
      emitModelStartupStatus(sender, {
        phase,
        status: 'error',
        detail: result.message || 'Failed to start llama.cpp session'
      });
      return { success: false, error: result.message || 'Failed to start BMOC terminal llama.cpp session' };
    }
    emitModelStartupStatus(sender, {
      phase,
      status: 'ok',
      detail: `llama.cpp ready @${result.port} (${Date.now() - startupStartedAt}ms)`
    });
    return {
      success: true,
      sessionId: result.sessionId,
      port: result.port
    };
  }

  async function closeTerminalLlamaSessionById(sessionId) {
    if (!sessionId) return;
    await sessionManager.closeSession(sessionId, { ollama: PortPoolOllama });
  }

  async function swapTerminalLlamaModel(options = {}) {
    if (getBackend() !== 'llama-cpp') {
      return { success: true, skipped: true, reason: 'backend-not-llama-cpp' };
    }
    const sender = options?.sender || null;
    const cfg = getConfig() || {};
    const targetModelPath = String(options?.modelPath || cfg?.llamaCppModelPath || '').trim();
    if (!targetModelPath) {
      return { success: false, error: 'No GGUF path configured for llama.cpp swap.' };
    }
    if (terminalLlamaSwapPromise) return terminalLlamaSwapPromise;
    terminalLlamaSwapPromise = (async () => {
      if (terminalLlamaSessionId && terminalLlamaPort && terminalLlamaModelPath === targetModelPath) {
        return { success: true, reused: true, sessionId: terminalLlamaSessionId, port: terminalLlamaPort };
      }
      const oldSessionId = terminalLlamaSessionId;
      const oldPort = terminalLlamaPort;

      if (
        terminalLlamaStandbySessionId &&
        terminalLlamaStandbyPort &&
        terminalLlamaStandbyModelPath === targetModelPath
      ) {
        terminalLlamaSessionId = terminalLlamaStandbySessionId;
        terminalLlamaPort = terminalLlamaStandbyPort;
        terminalLlamaModelPath = terminalLlamaStandbyModelPath;
        terminalLlamaStandbySessionId = null;
        terminalLlamaStandbyPort = null;
        terminalLlamaStandbyModelPath = null;
        emitModelStartupStatus(sender, {
          phase: 'promote',
          status: 'ok',
          detail: `Promoted warm standby llama.cpp session @${terminalLlamaPort}`
        });
      } else {
        if (terminalLlamaStandbySessionId) {
          const staleStandbyId = terminalLlamaStandbySessionId;
          terminalLlamaStandbySessionId = null;
          terminalLlamaStandbyPort = null;
          terminalLlamaStandbyModelPath = null;
          try {
            await closeTerminalLlamaSessionById(staleStandbyId);
          } catch {}
        }

        const started = await startTerminalLlamaSession({
          modelPath: targetModelPath,
          sender,
          phase: 'warm-standby'
        });
        if (!started.success) {
          return { success: false, error: started.error || 'Failed to warm standby llama.cpp session' };
        }
        terminalLlamaStandbySessionId = started.sessionId;
        terminalLlamaStandbyPort = started.port;
        terminalLlamaStandbyModelPath = targetModelPath;

        terminalLlamaSessionId = terminalLlamaStandbySessionId;
        terminalLlamaPort = terminalLlamaStandbyPort;
        terminalLlamaModelPath = terminalLlamaStandbyModelPath;
        terminalLlamaStandbySessionId = null;
        terminalLlamaStandbyPort = null;
        terminalLlamaStandbyModelPath = null;
        emitModelStartupStatus(sender, {
          phase: 'swap',
          status: 'ok',
          detail: `Swapped active llama.cpp session to @${terminalLlamaPort}`
        });
      }

      if (oldSessionId && oldSessionId !== terminalLlamaSessionId) {
        try {
          await closeTerminalLlamaSessionById(oldSessionId);
        } catch {}
        emitModelStartupStatus(sender, {
          phase: 'cleanup',
          status: 'ok',
          detail: `Closed previous llama.cpp session @${oldPort || 'unknown'}`
        });
      }
      return { success: true, sessionId: terminalLlamaSessionId, port: terminalLlamaPort };
    })().finally(() => {
      terminalLlamaSwapPromise = null;
    });
    return terminalLlamaSwapPromise;
  }

  async function closeTerminalOllamaSession() {
    if (!terminalOllamaSessionId) return;
    const sessionId = terminalOllamaSessionId;
    terminalOllamaSessionId = null;
    terminalOllamaPort = null;
    onTerminalOllamaClosed();
    await sessionManager.closeSession(sessionId, { ollama: PortPoolOllama });
  }

  async function closeTerminalLlamaSession() {
    const sessionId = terminalLlamaSessionId;
    const standbySessionId = terminalLlamaStandbySessionId;
    terminalLlamaSessionId = null;
    terminalLlamaPort = null;
    terminalLlamaModelPath = null;
    terminalLlamaStandbySessionId = null;
    terminalLlamaStandbyPort = null;
    terminalLlamaStandbyModelPath = null;
    if (sessionId) {
      await closeTerminalLlamaSessionById(sessionId);
    }
    if (standbySessionId && standbySessionId !== sessionId) {
      await closeTerminalLlamaSessionById(standbySessionId);
    }
  }

  async function ensureRouterOllamaReady() {
    if (getBackend() !== 'ollama') {
      return { success: false, error: 'Router currently requires Ollama backend in Coding Terminal.' };
    }
    if (routerOllamaSessionId && routerOllamaPort) {
      return { success: true };
    }
    if (routerOllamaStartPromise) return routerOllamaStartPromise;
    routerOllamaStartPromise = (async () => {
      const runtimeContext = getRuntimeContext();
      if (!runtimeContext?.appDir) {
        return { success: false, error: 'Coding Terminal runtime context missing appDir' };
      }
      const result = await sessionManager.startOllamaForService(
        'moe-agent',
        runtimeContext.appDir,
        runtimeContext.gpuInfo || null
      );
      if (!result.success) {
        return { success: false, error: result.message || 'Failed to start BMOC router Ollama session' };
      }
      routerOllamaSessionId = result.sessionId;
      routerOllamaPort = result.ollamaPort;
      return { success: true };
    })().finally(() => {
      routerOllamaStartPromise = null;
    });
    return routerOllamaStartPromise;
  }

  async function ensureRouterLlamaReady() {
    if (getBackend() !== 'llama-cpp') {
      return { success: false, error: 'Router llama.cpp session requested while backend is not llama-cpp.' };
    }
    if (routerLlamaSessionId && routerLlamaPort) {
      return { success: true };
    }
    if (routerLlamaStartPromise) return routerLlamaStartPromise;
    routerLlamaStartPromise = (async () => {
      const runtimeContext = getRuntimeContext();
      if (!runtimeContext?.appDir) {
        return { success: false, error: 'Coding Terminal runtime context missing appDir' };
      }
      const cfg = getConfig() || {};
      const gpuInfo = runtimeContext.gpuInfo || null;
      const nvidiaDetected = String(gpuInfo?.accelerationType || '').toLowerCase() === 'nvidia';
      const preferredMainGpuIndex = resolvePreferredNvidiaGpuIndex(gpuInfo, cfg?.llamaCppRouterMainGpuIndex);
      const preferredMainGpuUuid = resolvePreferredNvidiaGpuUuid(gpuInfo, cfg?.llamaCppRouterMainGpuUuid);
      const modelPath = String(cfg?.llamaCppRouterModelPath || '').trim();
      if (!modelPath) {
        return {
          success: false,
          error: 'llama.cpp router requires dedicated router model path (`llamaCppRouterModelPath`). Select a Router model for llama.cpp.'
        };
      }
      const configuredRouterGpuLayers = Number(cfg?.llamaCppRouterGpuLayers);
      const routerForceCpuConfig = cfg?.llamaCppRouterForceCpu;
      const effectiveRouterForceCpu = routerForceCpuConfig === false
        ? false
        : true;
      const fallbackGpuLayers = nvidiaDetected && !effectiveRouterForceCpu ? 16 : null;
      const effectiveRouterGpuLayers = Number.isFinite(configuredRouterGpuLayers)
        ? configuredRouterGpuLayers
        : fallbackGpuLayers;

      const result = await sessionManager.startLlamaCppForService(
        'moe-agent',
        runtimeContext.appDir,
        {
          modelPath,
          contextSize: Number(cfg?.llamaCppRouterContextSize || cfg?.llamaCppContextSize) || 4096,
          threads: Number(cfg?.llamaCppRouterThreads || cfg?.llamaCppThreads) || 0,
          parallel: Number(cfg?.llamaCppRouterParallel || cfg?.llamaCppParallel) || 1,
          gpuLayers: effectiveRouterGpuLayers,
          forceCpu: effectiveRouterForceCpu,
          splitMode: nvidiaDetected && !effectiveRouterForceCpu ? 'none' : null,
          mainGpuIndex: nvidiaDetected && !effectiveRouterForceCpu
            ? (preferredMainGpuUuid ? 0 : preferredMainGpuIndex)
            : null,
          cudaVisibleDevices: nvidiaDetected && !effectiveRouterForceCpu ? preferredMainGpuUuid : null
        }
      );
      if (!result.success) {
        return { success: false, error: result.message || 'Failed to start BMOC router llama.cpp session' };
      }
      routerLlamaSessionId = result.sessionId;
      routerLlamaPort = result.port;
      return { success: true };
    })().finally(() => {
      routerLlamaStartPromise = null;
    });
    return routerLlamaStartPromise;
  }

  async function closeRouterOllamaSession() {
    if (!routerOllamaSessionId) return;
    const sessionId = routerOllamaSessionId;
    routerOllamaSessionId = null;
    routerOllamaPort = null;
    await sessionManager.closeSession(sessionId, { ollama: PortPoolOllama });
  }

  async function closeRouterLlamaSession() {
    if (!routerLlamaSessionId) return;
    const sessionId = routerLlamaSessionId;
    routerLlamaSessionId = null;
    routerLlamaPort = null;
    await sessionManager.closeSession(sessionId, { ollama: PortPoolOllama });
  }

  async function ensureRagEmbeddingOllamaReady() {
    if (ragOllamaSessionId && ragOllamaPort) {
      return { success: true };
    }
    if (ragOllamaStartPromise) return ragOllamaStartPromise;
    ragOllamaStartPromise = (async () => {
      const runtimeContext = getRuntimeContext();
      if (!runtimeContext?.appDir) {
        return { success: false, error: 'Coding Terminal runtime context missing appDir' };
      }
      const result = await sessionManager.startOllamaForService(
        'terminal',
        runtimeContext.appDir,
        runtimeContext.gpuInfo || null
      );
      if (!result.success) {
        return { success: false, error: result.message || 'Failed to start BMOC RAG embedding Ollama session' };
      }
      ragOllamaSessionId = result.sessionId;
      ragOllamaPort = result.ollamaPort;
      return { success: true };
    })().finally(() => {
      ragOllamaStartPromise = null;
    });
    return ragOllamaStartPromise;
  }

  async function closeRagOllamaSession() {
    if (!ragOllamaSessionId) return;
    const sessionId = ragOllamaSessionId;
    ragOllamaSessionId = null;
    ragOllamaPort = null;
    onRagOllamaClosed();
    await sessionManager.closeSession(sessionId, { ollama: PortPoolOllama });
  }

  function getTerminalOllamaPort() { return terminalOllamaPort; }
  function getTerminalLlamaPort() { return terminalLlamaPort; }
  function getRouterOllamaPort() { return routerOllamaPort; }
  function getRouterLlamaPort() { return routerLlamaPort; }
  function getRagOllamaPort() { return ragOllamaPort; }

  return {
    ensureTerminalOllamaReady,
    ensureTerminalLlamaReady,
    swapTerminalLlamaModel,
    closeTerminalOllamaSession,
    closeTerminalLlamaSession,
    ensureRouterOllamaReady,
    ensureRouterLlamaReady,
    closeRouterOllamaSession,
    closeRouterLlamaSession,
    ensureRagEmbeddingOllamaReady,
    closeRagOllamaSession,
    getTerminalOllamaPort,
    getTerminalLlamaPort,
    getRouterOllamaPort,
    getRouterLlamaPort,
    getRagOllamaPort
  };
}

module.exports = createStartupTools;
