/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const { spawn } = require('child_process');
const path = require('path');

function createStandardTerminalSessionManager(deps = {}) {
  const {
    activeSessions,
    canStartSession,
    getModelsDir,
    getOllamaBinaryPath,
    allocatePort,
    releasePort,
    generateSessionId,
    waitForOllamaHealth,
    killProcess,
    closeSession
  } = deps;

  async function startTerminalSession() {
    const limitCheck = canStartSession();
    if (!limitCheck.allowed) {
      return { success: false, message: limitCheck.message, limitReached: true };
    }

    const binaryPath = getOllamaBinaryPath();
    if (!binaryPath) {
      return { success: false, message: 'Ollama binary not found for this platform' };
    }

    const ollamaPort = await allocatePort('terminalOllama', 'Terminal Session');
    if (!ollamaPort) {
      return { success: false, message: 'No ports available in Terminal Ollama pool' };
    }

    const sessionId = generateSessionId('terminal');

    console.log('[BMOC-Lite] ----------------------------------------------------');
    console.log(`[BMOC-Lite] Starting Terminal Session: ${sessionId}`);
    console.log(`[BMOC-Lite] Ollama Port: ${ollamaPort} (from Terminal pool)`);
    console.log('[BMOC-Lite] ----------------------------------------------------');

    const env = { ...process.env };
    env.OLLAMA_HOST = `127.0.0.1:${ollamaPort}`;
    env.OLLAMA_MODELS = getModelsDir();

    if (process.platform === 'linux') {
      const libDir = path.join(path.dirname(path.dirname(binaryPath)), 'lib', 'ollama');
      env.LD_LIBRARY_PATH = libDir + (env.LD_LIBRARY_PATH ? ':' + env.LD_LIBRARY_PATH : '');
    }

    return new Promise((resolve) => {
      const proc = spawn(binaryPath, ['serve'], {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false
      });

      const pid = proc.pid;
      console.log(`[BMOC-Lite] Ollama started - PID: ${pid}, Port: ${ollamaPort}`);

      activeSessions.set(sessionId, {
        type: 'terminal',
        ollamaPort,
        ollamaPID: pid,
        ollamaProcess: proc,
        startTime: Date.now()
      });

      proc.stdout.on('data', (data) => {
        console.log(`[Ollama:${sessionId}]`, data.toString().trim());
      });

      proc.stderr.on('data', (data) => {
        console.log(`[Ollama:${sessionId}]`, data.toString().trim());
      });

      proc.on('error', (err) => {
        console.error(`[BMOC-Lite] Ollama error (${sessionId}):`, err.message);
        closeSession(sessionId);
        resolve({ success: false, message: err.message });
      });

      proc.on('exit', (code) => {
        console.log(`[BMOC-Lite] Ollama exited (${sessionId}) with code ${code}`);
        if (activeSessions.has(sessionId)) {
          releasePort('terminalOllama', ollamaPort);
          activeSessions.delete(sessionId);
        }
      });

      waitForOllamaHealth(ollamaPort, 45000).then((healthy) => {
        if (healthy) {
          console.log(`[BMOC-Lite] ✓ Terminal session ready: ${sessionId}`);
          resolve({
            success: true,
            sessionId,
            ollamaPort,
            ollamaPID: pid,
            message: 'Terminal session started'
          });
        } else {
          console.error(`[BMOC-Lite] ✗ Terminal session failed health check: ${sessionId}`);
          closeSession(sessionId);
          resolve({ success: false, message: 'Ollama failed to start (health check timeout)' });
        }
      });
    });
  }

  async function closeTerminalSession(sessionId) {
    const session = activeSessions.get(sessionId);

    if (!session || session.type !== 'terminal') {
      return { success: false, message: 'Terminal session not found' };
    }

    if (session.closing) {
      return { success: true, message: 'Session already closing' };
    }
    session.closing = true;

    console.log('[BMOC-Lite] ----------------------------------------------------');
    console.log(`[BMOC-Lite] Closing Terminal Session: ${sessionId}`);
    console.log(`[BMOC-Lite] Killing Ollama PID ${session.ollamaPID} on port ${session.ollamaPort}`);
    console.log('[BMOC-Lite] ----------------------------------------------------');

    await killProcess(session.ollamaPID, `Ollama (${sessionId})`);
    releasePort('terminalOllama', session.ollamaPort);
    activeSessions.delete(sessionId);

    console.log(`[BMOC-Lite] ✓ Terminal session closed: ${sessionId} - VRAM FREED`);
    return { success: true, message: 'Terminal session closed' };
  }

  return {
    startTerminalSession,
    closeTerminalSession
  };
}

module.exports = createStandardTerminalSessionManager;
