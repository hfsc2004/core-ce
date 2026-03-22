/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const terminalSessions = new Map();

function makePortKey(port) {
  return `port-${port}`;
}

function setPortSession(port, session) {
  terminalSessions.set(makePortKey(port), session);
}

function getPortSession(port) {
  return terminalSessions.get(makePortKey(port));
}

function deletePortSession(port) {
  terminalSessions.delete(makePortKey(port));
}

function movePortSessionToWindow(port, windowId, fallback = {}) {
  const fromPort = getPortSession(port);
  if (fromPort) {
    deletePortSession(port);
  }

  const merged = {
    process: fromPort?.process || null,
    port,
    sessionId: fallback.sessionId || fromPort?.sessionId || null,
    window: fallback.window || null,
    modelName: fallback.modelName || null
  };

  terminalSessions.set(windowId, merged);
  return merged;
}

function bindSessionIdToPort(port, sessionId) {
  const key = makePortKey(port);
  const existing = terminalSessions.get(key);
  if (!existing) return false;
  terminalSessions.set(key, {
    ...existing,
    sessionId: sessionId || existing.sessionId || null
  });
  return true;
}

function setWindowSession(windowId, session) {
  terminalSessions.set(windowId, session);
}

function getWindowSession(windowId) {
  return terminalSessions.get(windowId);
}

function deleteWindowSession(windowId) {
  terminalSessions.delete(windowId);
}

function entries() {
  return Array.from(terminalSessions.entries());
}

function values() {
  return Array.from(terminalSessions.values());
}

function keys() {
  return Array.from(terminalSessions.keys());
}

function size() {
  return terminalSessions.size;
}

module.exports = {
  makePortKey,
  setPortSession,
  getPortSession,
  deletePortSession,
  movePortSessionToWindow,
  bindSessionIdToPort,
  setWindowSession,
  getWindowSession,
  deleteWindowSession,
  entries,
  values,
  keys,
  size
};
