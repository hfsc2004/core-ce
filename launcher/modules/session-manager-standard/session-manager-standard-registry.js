/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
function createStandardSessionRegistry(deps = {}) {
  const {
    activeSessions,
    closeTerminalSession,
    closeWebUISession,
    closeAnythingLLMSession
  } = deps;

  async function closeSession(sessionId) {
    const session = activeSessions.get(sessionId);

    if (!session) {
      return { success: false, message: 'Session not found' };
    }

    switch (session.type) {
      case 'terminal':
        return closeTerminalSession(sessionId);
      case 'webui':
        return closeWebUISession(sessionId);
      case 'anythingllm':
        return closeAnythingLLMSession(sessionId);
      default:
        return { success: false, message: `Unknown session type: ${session.type}` };
    }
  }

  function getSession(sessionId) {
    return activeSessions.get(sessionId) || null;
  }

  function getAllSessions() {
    const sessions = [];
    for (const [sessionId, session] of activeSessions) {
      sessions.push({ sessionId, ...session });
    }
    return sessions;
  }

  function getSessionsByType(type) {
    return getAllSessions().filter((s) => s.type === type);
  }

  return {
    closeSession,
    getSession,
    getAllSessions,
    getSessionsByType
  };
}

module.exports = createStandardSessionRegistry;
