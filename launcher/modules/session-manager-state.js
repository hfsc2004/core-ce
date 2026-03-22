/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const fs = require('fs');
const path = require('path');

function createSessionStateManager(deps = {}) {
  const processUtils = deps.processUtils || {};
  const sessionUtils = deps.sessionUtils || {};

  const isProcessRunning = processUtils.isProcessRunning || (async () => false);
  const killProcess = processUtils.killProcess || (async () => false);

  const normalizeServiceType = sessionUtils.normalizeServiceType || ((v) => String(v || ''));
  const generateSessionId = sessionUtils.generateSessionId || ((type) => `${String(type || 'session')}-${Date.now()}`);
  const getOllamaPortForService = sessionUtils.getOllamaPortForService || (() => null);
  const hasActiveSession = sessionUtils.hasActiveSession || (() => false);
  const getActiveSessionsForService = sessionUtils.getActiveSessionsForService || (() => []);
  const getSessionCount = sessionUtils.getSessionCount || (() => 0);
  const getSessionStats = sessionUtils.getSessionStats || (() => ({}));
  const getSessionSummary = sessionUtils.getSessionSummary || (() => '');

  let appPath = null;
  let sessionsFile = null;
  let activeSessions = {};

  function initialize(nextAppPath) {
    appPath = nextAppPath;
    sessionsFile = path.join(nextAppPath, '..', 'sessions.json');
    return sessionsFile;
  }

  function getAppPath() {
    return appPath;
  }

  function getSessionsFile() {
    return sessionsFile;
  }

  function loadSessions() {
    try {
      if (fs.existsSync(sessionsFile)) {
        const data = fs.readFileSync(sessionsFile, 'utf8');
        activeSessions = JSON.parse(data);
        console.log(`[Session Manager] Loaded ${Object.keys(activeSessions).length} session(s) from disk`);
      } else {
        activeSessions = {};
        console.log('[Session Manager] No existing sessions file - starting fresh');
      }
    } catch (err) {
      console.error('[Session Manager] Error loading sessions:', err.message);
      activeSessions = {};
    }
    return { ...activeSessions };
  }

  function saveSessions() {
    try {
      fs.writeFileSync(sessionsFile, JSON.stringify(activeSessions, null, 2), 'utf8');
    } catch (err) {
      console.error('[Session Manager] Error saving sessions:', err.message);
    }
  }

  async function validateSessions() {
    console.log('[Session Manager] Validating sessions from previous run...');

    const sessionIds = Object.keys(activeSessions);
    if (sessionIds.length === 0) {
      console.log('[Session Manager] No sessions to validate');
      return;
    }

    let orphansKilled = 0;

    for (const sessionId of sessionIds) {
      const session = activeSessions[sessionId];
      const ollamaRunning = await isProcessRunning(session.ollamaPID);
      const serviceRunning = session.servicePID ? await isProcessRunning(session.servicePID) : false;

      if (ollamaRunning || serviceRunning) {
        console.log(`[Session Manager] Found orphaned session: ${sessionId}`);
        if (ollamaRunning) {
          await killProcess(session.ollamaPID, 'Ollama');
          orphansKilled += 1;
        }
        if (serviceRunning) {
          await killProcess(session.servicePID, session.type);
          orphansKilled += 1;
        }
      }

      delete activeSessions[sessionId];
    }

    if (orphansKilled > 0) {
      console.log(`[Session Manager] ✅ Killed ${orphansKilled} orphaned process(es)`);
      saveSessions();
    } else {
      console.log('[Session Manager] No orphaned processes found');
    }
  }

  function registerSession(config) {
    const sessionId = generateSessionId(config.type);

    activeSessions[sessionId] = {
      type: config.type,
      ollamaPort: config.ollamaPort,
      ollamaPID: config.ollamaPID,
      servicePort: config.servicePort || null,
      servicePID: config.servicePID || null,
      metadata: config.metadata || {},
      startTime: new Date().toISOString()
    };

    saveSessions();

    console.log(`[Session Manager] ✅ Registered session: ${sessionId}`);
    console.log(`[Session Manager]    Type: ${config.type}`);
    console.log(`[Session Manager]    Ollama: PID ${config.ollamaPID} on port ${config.ollamaPort}`);
    if (config.servicePID) {
      console.log(`[Session Manager]    Service: PID ${config.servicePID} on port ${config.servicePort}`);
    }

    return sessionId;
  }

  async function closeSession(sessionId, portPools) {
    const session = activeSessions[sessionId];

    if (!session) {
      console.warn(`[Session Manager] Session not found: ${sessionId}`);
      return false;
    }

    console.log(`[Session Manager] Closing session: ${sessionId}`);

    try {
      if (session.servicePID) {
        await killProcess(session.servicePID, session.type);

        if (session.servicePort && portPools) {
          if (session.type === 'openwebui' && portPools.webui) {
            portPools.webui.releasePort(session.servicePort);
          } else if (session.type === 'anythingllm' && portPools.anythingllm) {
            portPools.anythingllm.releasePort(session.servicePort);
          }
        }
      }

      if (session.ollamaPID) {
        await killProcess(session.ollamaPID, 'Ollama');

        if (session.ollamaPort && portPools && portPools.ollama) {
          portPools.ollama.releasePort(session.ollamaPort);
        }
      }

      delete activeSessions[sessionId];
      saveSessions();

      console.log(`[Session Manager] ✅ Session closed: ${sessionId}`);
      return true;
    } catch (err) {
      console.error(`[Session Manager] Error closing session ${sessionId}:`, err.message);
      delete activeSessions[sessionId];
      saveSessions();
      return false;
    }
  }

  function updateSession(sessionId, updates) {
    if (!activeSessions[sessionId]) {
      console.warn(`[Session Manager] Cannot update - session not found: ${sessionId}`);
      return false;
    }

    activeSessions[sessionId] = {
      ...activeSessions[sessionId],
      ...updates
    };

    saveSessions();
    console.log(`[Session Manager] Updated session: ${sessionId}`);
    return true;
  }

  function getSession(sessionId) {
    return activeSessions[sessionId] || null;
  }

  function getAllSessions() {
    return { ...activeSessions };
  }

  function removeSession(sessionId) {
    const session = activeSessions[sessionId];
    if (!session) return null;
    delete activeSessions[sessionId];
    saveSessions();
    return session;
  }

  function getSessionsByType(type) {
    return Object.entries(activeSessions).filter(([_, session]) => session.type === type);
  }

  async function closeSessionsByType(type, portPools) {
    const sessions = getSessionsByType(type);
    console.log(`[Session Manager] Closing ${sessions.length} session(s) of type: ${type}`);
    for (const [sessionId] of sessions) {
      await closeSession(sessionId, portPools);
    }
  }

  async function closeAllSessions(portPools) {
    const sessionIds = Object.keys(activeSessions);
    if (sessionIds.length === 0) {
      console.log('[Session Manager] No active sessions to close');
      return;
    }

    console.log(`[Session Manager] Closing ${sessionIds.length} session(s)...`);
    for (const sessionId of sessionIds) {
      await closeSession(sessionId, portPools);
    }
    console.log('[Session Manager] ✅ All sessions closed');
  }

  return {
    initialize,
    getAppPath,
    getSessionsFile,
    loadSessions,
    saveSessions,
    validateSessions,
    registerSession,
    closeSession,
    updateSession,
    getSession,
    getAllSessions,
    removeSession,
    getSessionsByType,
    closeSessionsByType,
    closeAllSessions,
    normalizeServiceType: (serviceType) => normalizeServiceType(serviceType),
    generateSessionId: (type) => generateSessionId(type),
    getOllamaPortForService: (serviceType) => getOllamaPortForService(activeSessions, serviceType),
    hasActiveSession: (serviceType) => hasActiveSession(activeSessions, serviceType),
    getActiveSessionsForService: (serviceType) => getActiveSessionsForService(activeSessions, serviceType),
    getSessionCount: () => getSessionCount(activeSessions),
    getSessionStats: () => getSessionStats(activeSessions),
    getSessionSummary: () => getSessionSummary(activeSessions)
  };
}

module.exports = createSessionStateManager;
