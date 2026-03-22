/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * PSF Coding Terminal - Pipeline/Cluster Stubs
 * Transport-agnostic metadata helpers for future clustered orchestration.
 */

const crypto = require('crypto');

const MAX_PIPELINE_EVENTS = 400;
const pipelineEvents = [];

function randomId(prefix = 'id') {
  const tail = crypto.randomBytes(6).toString('hex');
  return `${prefix}_${Date.now().toString(36)}_${tail}`;
}

function createTurnContext({ terminalId = '', projectPath = '' } = {}) {
  return {
    requestId: randomId('req'),
    traceId: randomId('trace'),
    sessionId: randomId('sess'),
    terminalId: String(terminalId || '').trim() || randomId('term'),
    projectPath: String(projectPath || '').trim(),
    createdAt: Date.now()
  };
}

function createMailboxEnvelope({
  from = '',
  to = '',
  type = '',
  payload = {},
  correlationId = '',
  ttlMs = 30000,
  attempt = 1
} = {}) {
  return {
    msgId: randomId('msg'),
    correlationId: String(correlationId || '').trim() || randomId('corr'),
    from: String(from || '').trim(),
    to: String(to || '').trim(),
    type: String(type || '').trim() || 'event',
    payload: payload && typeof payload === 'object' ? payload : {},
    createdAt: Date.now(),
    ttlMs: Math.max(1000, Number(ttlMs) || 30000),
    attempt: Math.max(1, Number(attempt) || 1)
  };
}

function appendPipelineEvent(event = {}) {
  const normalized = {
    id: randomId('evt'),
    at: Date.now(),
    ...event
  };
  pipelineEvents.push(normalized);
  if (pipelineEvents.length > MAX_PIPELINE_EVENTS) {
    pipelineEvents.splice(0, pipelineEvents.length - MAX_PIPELINE_EVENTS);
  }
  return normalized;
}

function getPipelineEvents(limit = 120) {
  const n = Math.max(1, Math.min(Number(limit) || 120, MAX_PIPELINE_EVENTS));
  return pipelineEvents.slice(-n);
}

module.exports = {
  randomId,
  createTurnContext,
  createMailboxEnvelope,
  appendPipelineEvent,
  getPipelineEvents
};

