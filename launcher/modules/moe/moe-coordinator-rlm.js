/**
 * MoE coordinator RLM-assist helpers.
 */

const bucketSecurity = require('../security-layer/security-buckets');

function isAgentRlmAssistEnabled(agent, routingConfigByAgentId) {
  const cfg = routingConfigByAgentId instanceof Map ? (routingConfigByAgentId.get(agent?.id) || {}) : {};
  if (typeof cfg.rlmAssist === 'boolean') return cfg.rlmAssist === true;
  return agent?.rlmAssist === true;
}

async function buildAgentRlmAssistContext({
  agent,
  currentInput,
  routingConfigByAgentId,
  deterministicToolsRuntime,
  attachmentStore
}) {
  if (!isAgentRlmAssistEnabled(agent, routingConfigByAgentId)) return '';
  if (!deterministicToolsRuntime || typeof deterministicToolsRuntime.executeTool !== 'function') return '';
  const text = String(currentInput || '').trim();
  const attachmentEvidence = await collectRlmAttachmentEvidence(agent, attachmentStore);
  if (!text && !attachmentEvidence) return '';
  const mergedText = text && attachmentEvidence
    ? `${text}\n\nAttachment Evidence:\n${attachmentEvidence}`
    : (text || attachmentEvidence);

  try {
    const termsRes = await deterministicToolsRuntime.executeTool({
      toolName: 'extract_query_terms',
      args: { message: mergedText, maxTerms: 10 },
      context: { surface: 'moe', role: 'planner' }
    });
    const terms = Array.isArray(termsRes?.output?.terms) ? termsRes.output.terms : [];

    const chunkRes = await deterministicToolsRuntime.executeTool({
      toolName: 'chunk_text',
      args: { text: mergedText, chunkSize: 900, overlap: 90 },
      context: { surface: 'moe', role: 'planner' }
    });
    const chunks = Array.isArray(chunkRes?.output?.chunks) ? chunkRes.output.chunks : [];

    let ranked = [];
    if (chunks.length > 0 && terms.length > 0) {
      const rankRes = await deterministicToolsRuntime.executeTool({
        toolName: 'rank_chunks_by_terms',
        args: { chunks, terms, maxChunks: 8 },
        context: { surface: 'moe', role: 'planner' }
      });
      ranked = Array.isArray(rankRes?.output?.ranked) ? rankRes.output.ranked : [];
    }

    const sourceRows = (ranked.length > 0 ? ranked : chunks)
      .slice(0, 6)
      .map((row) => String(row?.text || '').trim())
      .filter(Boolean);
    if (sourceRows.length === 0) return '';

    const summaryRes = await deterministicToolsRuntime.executeTool({
      toolName: 'accumulate_summaries',
      args: { items: sourceRows, maxChars: 1400 },
      context: { surface: 'moe', role: 'planner' }
    });
    const summary = String(summaryRes?.output?.summary || '').trim();
    if (!summary) return '';
    return summary;
  } catch (_) {
    return '';
  }
}

function getMoeAttachmentSessionId(scope, agentId) {
  if (scope === 'shared') return 'moe-shared';
  const id = String(agentId || '').trim();
  if (!id) return 'moe-agent-unknown';
  return `moe-agent-${id}`;
}

function getRlmAttachmentSessionsForAgent(agent) {
  const explicitAgentSession = String(agent?.rlmAttachmentSessionId || '').trim();
  const explicitSharedSession = String(agent?.rlmSharedAttachmentSessionId || '').trim();
  return [
    explicitAgentSession || getMoeAttachmentSessionId('agent', agent?.id),
    explicitSharedSession || getMoeAttachmentSessionId('shared', agent?.id)
  ];
}

async function collectRlmAttachmentEvidenceFromStore(agent, store) {
  if (!store || typeof store.listAttachments !== 'function') return '';
  const sessionIds = getRlmAttachmentSessionsForAgent(agent);
  const rows = [];
  for (const sessionId of sessionIds) {
    try {
      const listAuth = await bucketSecurity.authorizeBucketAction({
        action: 'list',
        sessionId,
        actor: { userId: 'relay-system' },
        details: { source: 'relay:moe-coordinator:list' }
      });
      if (!listAuth.allowed) continue;
      const listed = await store.listAttachments(sessionId);
      const textAttachments = (Array.isArray(listed) ? listed : [])
        .filter((item) => item && item.textExtractable === true)
        .slice(0, 4);
      for (const item of textAttachments) {
        try {
          const readAuth = await bucketSecurity.authorizeBucketAction({
            action: 'read',
            sessionId,
            actor: { userId: 'relay-system' },
            details: { source: 'relay:moe-coordinator:read', attachmentId: String(item.id || '') }
          });
          if (!readAuth.allowed) continue;
          const read = await store.readAttachmentText({
            sessionId,
            attachmentId: item.id,
            maxBytes: 128 * 1024
          });
          const body = String(read?.text || '').trim();
          if (!body) continue;
          const compact = body.length > 1200 ? `${body.slice(0, 1200)}...` : body;
          rows.push(`[${sessionId}] ${item.displayName || item.id}\n${compact}`);
        } catch (_) {
          // Skip unreadable attachment and continue.
        }
      }
    } catch (_) {
      // Session may not exist.
    }
  }
  if (rows.length === 0) return '';
  return rows.slice(0, 6).join('\n\n');
}

async function collectRlmAttachmentEvidence(agent, attachmentStore) {
  return collectRlmAttachmentEvidenceFromStore(agent, attachmentStore);
}

module.exports = {
  isAgentRlmAssistEnabled,
  buildAgentRlmAssistContext,
  getMoeAttachmentSessionId,
  getRlmAttachmentSessionsForAgent,
  collectRlmAttachmentEvidenceFromStore,
  collectRlmAttachmentEvidence
};
