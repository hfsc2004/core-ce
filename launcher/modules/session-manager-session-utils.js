/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
function normalizeServiceType(serviceType) {
  if (!serviceType) return null;

  const type = serviceType.toLowerCase().trim();
  const typeMap = {
    webui: 'openwebui',
    openwebui: 'openwebui',
    'open-webui': 'openwebui',
    open_webui: 'openwebui',
    anythingllm: 'anythingllm',
    'anything-llm': 'anythingllm',
    anything_llm: 'anythingllm',
    terminal: 'terminal',
    'ollama-terminal': 'terminal',
    ollama_terminal: 'terminal',
    'moe-agent': 'moe-agent',
    moe_agent: 'moe-agent',
    agent: 'moe-agent'
  };

  return typeMap[type] || null;
}

function generateSessionId(type) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${type}-${timestamp}-${random}`;
}

function getOllamaPortForService(activeSessions, serviceType) {
  const normalizedType = normalizeServiceType(serviceType);
  if (!normalizedType) {
    console.warn(`[Session Manager] getOllamaPortForService: Invalid service type: ${serviceType}`);
    return null;
  }

  for (const session of Object.values(activeSessions || {})) {
    if (session.type === normalizedType && session.ollamaPort) {
      return session.ollamaPort;
    }
  }
  return null;
}

function hasActiveSession(activeSessions, serviceType) {
  const normalizedType = normalizeServiceType(serviceType);
  if (!normalizedType) return false;

  for (const session of Object.values(activeSessions || {})) {
    if (session.type === normalizedType) {
      return true;
    }
  }
  return false;
}

function getActiveSessionsForService(activeSessions, serviceType) {
  const normalizedType = normalizeServiceType(serviceType);
  if (!normalizedType) return [];

  const results = [];
  for (const [sessionId, session] of Object.entries(activeSessions || {})) {
    if (session.type === normalizedType) {
      results.push({ sessionId, ...session });
    }
  }
  return results;
}

function getSessionCount(activeSessions) {
  return Object.keys(activeSessions || {}).length;
}

function getSessionStats(activeSessions) {
  const stats = {
    total: 0,
    openwebui: 0,
    anythingllm: 0,
    terminal: 0
  };

  Object.values(activeSessions || {}).forEach((session) => {
    stats.total++;
    stats[session.type] = (stats[session.type] || 0) + 1;
  });

  return stats;
}

function getSessionSummary(activeSessions) {
  const stats = getSessionStats(activeSessions);
  const sessions = Object.entries(activeSessions || {});

  const summary = [
    '╔══════════════════════════════════════════════════════════════════╗',
    '║              SESSION MANAGER STATUS (BMOC)                       ║',
    '╠══════════════════════════════════════════════════════════════════╣',
    `║  Total Sessions: ${String(stats.total).padEnd(4)}                                          ║`,
    `║    WebUI:        ${String(stats.openwebui).padEnd(4)}                                          ║`,
    `║    AnythingLLM:  ${String(stats.anythingllm).padEnd(4)}                                          ║`,
    `║    Terminal:     ${String(stats.terminal).padEnd(4)}                                          ║`,
    '╠══════════════════════════════════════════════════════════════════╣'
  ];

  if (sessions.length > 0) {
    summary.push('║  Active Sessions:                                                 ║');
    for (const [sessionId, session] of sessions) {
      const shortId = sessionId.substring(0, 25);
      summary.push(`║    ${shortId.padEnd(26)} Port: ${String(session.ollamaPort).padEnd(5)} PID: ${String(session.ollamaPID).padEnd(7)}║`);
    }
  } else {
    summary.push('║  No active sessions                                               ║');
  }

  summary.push('╚══════════════════════════════════════════════════════════════════╝');
  return summary.join('\n');
}

module.exports = {
  normalizeServiceType,
  generateSessionId,
  getOllamaPortForService,
  hasActiveSession,
  getActiveSessionsForService,
  getSessionCount,
  getSessionStats,
  getSessionSummary
};
