/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
function createStandardStatusLegacyManager(deps = {}) {
  const {
    MAX_CONCURRENT_SESSIONS,
    PORT_POOLS,
    getAllSessions,
    getSessionsByType,
    closeSession,
    clearAllPools,
    startTerminalSession,
    closeTerminalSession,
    startWebUISession,
    closeWebUISession,
    startAnythingLLMSession,
    closeAnythingLLMSession
  } = deps;

  function getStatus() {
    const sessions = getAllSessions();

    return {
      sessionCount: sessions.length,
      maxSessions: MAX_CONCURRENT_SESSIONS,
      canStartMore: sessions.length < MAX_CONCURRENT_SESSIONS,

      sessions: sessions.map((s) => ({
        sessionId: s.sessionId,
        type: s.type,
        ollamaPort: s.ollamaPort,
        ollamaPID: s.ollamaPID,
        servicePort: s.webuiPort || s.servicePort || null,
        servicePID: s.webuiPID || s.servicePID || null,
        uptime: Date.now() - s.startTime
      })),

      pools: {
        terminalOllama: {
          inUse: PORT_POOLS.terminalOllama.allocated.size,
          total: PORT_POOLS.terminalOllama.end - PORT_POOLS.terminalOllama.start + 1
        },
        webuiOllama: {
          inUse: PORT_POOLS.webuiOllama.allocated.size,
          total: PORT_POOLS.webuiOllama.end - PORT_POOLS.webuiOllama.start + 1
        },
        webuiService: {
          inUse: PORT_POOLS.webuiService.allocated.size,
          total: PORT_POOLS.webuiService.end - PORT_POOLS.webuiService.start + 1
        },
        anythingllmOllama: {
          inUse: PORT_POOLS.anythingllmOllama.allocated.size,
          total: PORT_POOLS.anythingllmOllama.end - PORT_POOLS.anythingllmOllama.start + 1
        },
        anythingllmService: {
          inUse: PORT_POOLS.anythingllmService.allocated.size,
          total: PORT_POOLS.anythingllmService.end - PORT_POOLS.anythingllmService.start + 1
        }
      }
    };
  }

  async function shutdownAll() {
    console.log('[BMOC-Lite] ════════════════════════════════════════════════════════');
    console.log('[BMOC-Lite] BOSS MODE: Shutting down ALL sessions');
    console.log('[BMOC-Lite] ════════════════════════════════════════════════════════');

    const sessions = getAllSessions();
    console.log(`[BMOC-Lite] Active sessions to close: ${sessions.length}`);

    for (const session of sessions) {
      console.log(`[BMOC-Lite]   - ${session.sessionId} (${session.type})`);
    }

    for (const session of sessions) {
      await closeSession(session.sessionId);
    }

    clearAllPools(PORT_POOLS);

    console.log('[BMOC-Lite] ════════════════════════════════════════════════════════');
    console.log('[BMOC-Lite] BOSS MODE: All sessions closed. Clean exit.');
    console.log('[BMOC-Lite] ════════════════════════════════════════════════════════');
  }

  async function startOllama() {
    console.warn('[BMOC-Lite] startOllama() is deprecated - use startTerminalSession()');
    return startTerminalSession();
  }

  async function stopOllama() {
    console.warn('[BMOC-Lite] stopOllama() is deprecated - use closeSession()');
    const terminalSessions = getSessionsByType('terminal');
    if (terminalSessions.length > 0) {
      return closeTerminalSession(terminalSessions[0].sessionId);
    }
    return { success: true, message: 'No terminal sessions to stop' };
  }

  async function startWebUI() {
    console.warn('[BMOC-Lite] startWebUI() is deprecated - use startWebUISession()');
    return startWebUISession();
  }

  async function stopWebUI() {
    console.warn('[BMOC-Lite] stopWebUI() is deprecated - use closeSession()');
    const webuiSessions = getSessionsByType('webui');
    if (webuiSessions.length > 0) {
      return closeWebUISession(webuiSessions[0].sessionId);
    }
    return { success: true, message: 'No WebUI sessions to stop' };
  }

  async function startAnythingLLM() {
    console.warn('[BMOC-Lite] startAnythingLLM() is deprecated - use startAnythingLLMSession()');
    return startAnythingLLMSession();
  }

  async function stopAnythingLLM() {
    console.warn('[BMOC-Lite] stopAnythingLLM() is deprecated - use closeSession()');
    const sessions = getSessionsByType('anythingllm');
    if (sessions.length > 0) {
      return closeAnythingLLMSession(sessions[0].sessionId);
    }
    return { success: true, message: 'No AnythingLLM sessions to stop' };
  }

  function getOllamaPort() {
    const terminalSessions = getSessionsByType('terminal');
    return terminalSessions.length > 0 ? terminalSessions[0].ollamaPort : null;
  }

  function getOllamaStatus() {
    const sessions = getSessionsByType('terminal');
    if (sessions.length > 0) {
      const s = sessions[0];
      return { running: true, pid: s.ollamaPID, port: s.ollamaPort };
    }
    return { running: false, pid: null, port: null };
  }

  return {
    getStatus,
    shutdownAll,
    startOllama,
    stopOllama,
    startWebUI,
    stopWebUI,
    startAnythingLLM,
    stopAnythingLLM,
    getOllamaPort,
    getOllamaStatus
  };
}

module.exports = createStandardStatusLegacyManager;
