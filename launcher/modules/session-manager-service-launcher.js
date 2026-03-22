/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
function createSessionServiceLauncher(deps = {}) {
  const {
    normalizeServiceType,
    registerSession,
    getRuntimeContext,
    closeTerminalLlamaSession // not used here directly; reserved for parity hooks
  } = deps;
  void closeTerminalLlamaSession;

  async function startOllamaForService(serviceType, appPath, gpuInfo) {
    console.log(`[Session Manager] 🚀 startOllamaForService called for: ${serviceType}`);

    const normalizedType = normalizeServiceType(serviceType);

    if (!normalizedType) {
      return {
        success: false,
        sessionId: null,
        ollamaPort: null,
        ollamaPID: null,
        message: `Invalid service type: ${serviceType}. Use 'webui', 'anythingllm', or 'terminal'.`
      };
    }

    try {
      const PortPool = require('./port-pool/port-pool-ollama');
      const ollamaManager = require('./ollama-manager/ollama-manager');

      let port;
      switch (normalizedType) {
        case 'openwebui':
          port = PortPool.getWebUIPort(`WebUI Ollama [${serviceType}]`);
          break;
        case 'anythingllm':
          port = PortPool.getAnythingLLMPort(`AnythingLLM Ollama [${serviceType}]`);
          break;
        case 'terminal':
          port = PortPool.getTerminalPort(`Terminal Ollama [${serviceType}]`);
          break;
        case 'moe-agent':
          port = PortPool.getAgentPort({ label: `MoE Agent [${serviceType}]` });
          break;
        default:
          return {
            success: false,
            sessionId: null,
            ollamaPort: null,
            ollamaPID: null,
            message: `Unknown normalized type: ${normalizedType}`
          };
      }

      if (!port) {
        return {
          success: false,
          sessionId: null,
          ollamaPort: null,
          ollamaPID: null,
          message: `Failed to allocate port from ${normalizedType} pool - pool exhausted`
        };
      }

      console.log(`[Session Manager] Allocated port ${port} from ${normalizedType} pool`);
      const ollamaResult = await ollamaManager.startOllamaServerOnPort(appPath, gpuInfo, port);

      if (!ollamaResult || !ollamaResult.pid) {
        PortPool.releasePort(port);
        return {
          success: false,
          sessionId: null,
          ollamaPort: null,
          ollamaPID: null,
          message: 'Failed to start Ollama server'
        };
      }

      const sessionId = registerSession({
        type: normalizedType,
        ollamaPort: port,
        ollamaPID: ollamaResult.pid,
        metadata: {
          gpu: gpuInfo?.name || 'CPU',
          serviceType: serviceType,
          startedVia: 'startOllamaForService'
        }
      });

      if (typeof ollamaManager.bindSessionToPort === 'function') {
        try {
          ollamaManager.bindSessionToPort(port, sessionId);
        } catch (_) {
          // Best effort only; session remains tracked in BMOC even if binding fails.
        }
      }

      console.log(`[Session Manager] ✅ Ollama started for ${serviceType}`);
      console.log(`[Session Manager]    Session: ${sessionId}`);
      console.log(`[Session Manager]    Port: ${port} (${normalizedType} pool)`);
      console.log(`[Session Manager]    PID: ${ollamaResult.pid}`);

      return {
        success: true,
        sessionId: sessionId,
        ollamaPort: port,
        ollamaPID: ollamaResult.pid,
        message: `Ollama started on port ${port} for ${serviceType}`
      };
    } catch (err) {
      console.error(`[Session Manager] Error starting Ollama for ${serviceType}:`, err.message);
      return {
        success: false,
        sessionId: null,
        ollamaPort: null,
        ollamaPID: null,
        message: err.message
      };
    }
  }

  async function startLlamaCppForService(serviceType, appPath, options = {}) {
    console.log(`[Session Manager] 🚀 startLlamaCppForService called for: ${serviceType}`);

    const normalizedType = normalizeServiceType(serviceType);
    if (!normalizedType) {
      return {
        success: false,
        sessionId: null,
        port: null,
        pid: null,
        message: `Invalid service type: ${serviceType}. Use 'terminal' or 'moe-agent'.`
      };
    }

    if (normalizedType !== 'terminal' && normalizedType !== 'moe-agent') {
      return {
        success: false,
        sessionId: null,
        port: null,
        pid: null,
        message: `llama.cpp service type "${normalizedType}" is not supported by BMOC yet`
      };
    }

    try {
      const PortPool = require('./port-pool/port-pool-ollama');
      const llamaCppManager = require('./llama-cpp-manager');
      const maxStartAttempts = 3;
      let startResult = null;
      let startPort = null;
      let lastErr = null;

      for (let attempt = 1; attempt <= maxStartAttempts; attempt++) {
        const port = normalizedType === 'terminal'
          ? PortPool.getTerminalPort(`Terminal llama.cpp [${serviceType}]`)
          : PortPool.getAgentPort({ label: `MoE Agent llama.cpp [${serviceType}]` });

        if (!port) {
          return {
            success: false,
            sessionId: null,
            port: null,
            pid: null,
            message: `Failed to allocate port from ${normalizedType} pool - pool exhausted`
          };
        }

        try {
          startResult = await llamaCppManager.startLlamaServerOnPort(appPath, {
            port,
            modelPath: options.modelPath,
            contextSize: options.contextSize,
            threads: options.threads,
            parallel: options.parallel,
            gpuLayers: options.gpuLayers,
            forceCpu: options.forceCpu === true,
            splitMode: options.splitMode,
            mainGpuIndex: options.mainGpuIndex,
            cudaVisibleDevices: options.cudaVisibleDevices,
            startupTimeoutMs: options.startupTimeoutMs
          });
          startPort = port;
          break;
        } catch (err) {
          lastErr = err;
          PortPool.releasePort(port);
          const msg = String(err?.message || '');
          const bindFailure = /couldn'?t bind HTTP server socket|address already in use|EADDRINUSE/i.test(msg);
          if (!bindFailure || attempt >= maxStartAttempts) {
            throw err;
          }
          console.warn(
            `[Session Manager] llama.cpp bind/start failure on port ${port} (attempt ${attempt}/${maxStartAttempts}); retrying...`
          );
        }
      }

      if (!startResult || !startResult.pid || !startPort) {
        return {
          success: false,
          sessionId: null,
          port: null,
          pid: null,
          message: lastErr?.message || 'Failed to start llama.cpp server'
        };
      }

      const sessionId = registerSession({
        type: normalizedType,
        ollamaPort: startPort,
        ollamaPID: startResult.pid,
        metadata: {
          backend: 'llama-cpp',
          modelPath: startResult.modelPath || options.modelPath || null,
          serviceType: serviceType,
          startedVia: 'startLlamaCppForService'
        }
      });

      console.log(`[Session Manager] ✅ llama.cpp started for ${serviceType}`);
      console.log(`[Session Manager]    Session: ${sessionId}`);
      console.log(`[Session Manager]    Port: ${startPort} (${normalizedType} pool)`);
      console.log(`[Session Manager]    PID: ${startResult.pid}`);

      return {
        success: true,
        sessionId,
        port: startPort,
        pid: startResult.pid,
        message: `llama.cpp started on port ${startPort} for ${serviceType}`
      };
    } catch (err) {
      console.error(`[Session Manager] Error starting llama.cpp for ${serviceType}:`, err.message);
      return {
        success: false,
        sessionId: null,
        port: null,
        pid: null,
        message: err.message
      };
    }
  }

  return {
    startOllamaForService,
    startLlamaCppForService,
    getRuntimeContext: () => (typeof getRuntimeContext === 'function' ? getRuntimeContext() : {})
  };
}

module.exports = createSessionServiceLauncher;
