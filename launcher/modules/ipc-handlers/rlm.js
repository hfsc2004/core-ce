/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const { createRlmEngine } = require('../rlm-engine/rlm-engine');
const bucketSecurity = require('../security-layer/security-buckets');

function buildSecureAttachmentStore(rawStore, actor = {}) {
  const store = rawStore || {};
  return {
    async listAttachments(sessionId) {
      const auth = await bucketSecurity.authorizeBucketAction({
        action: 'list',
        sessionId,
        actor,
        details: { source: 'rlm:run-turn:list' }
      });
      if (!auth.allowed) return [];
      if (typeof store.listAttachments !== 'function') return [];
      return store.listAttachments(sessionId);
    },
    async readAttachmentText(options = {}) {
      const sessionId = String(options?.sessionId || '').trim();
      const auth = await bucketSecurity.authorizeBucketAction({
        action: 'read',
        sessionId,
        actor,
        details: { source: 'rlm:run-turn:read-text', attachmentId: String(options?.attachmentId || '') }
      });
      if (!auth.allowed) {
        throw new Error(`Permission denied for bucket session: ${sessionId}`);
      }
      if (typeof store.readAttachmentText !== 'function') {
        throw new Error('attachment store unavailable');
      }
      return store.readAttachmentText(options);
    }
  };
}

function createRlmHandlers() {
  return {
    'rlm:run-turn': async (ctx, event, payload = {}) => {
      const actor = {
        userId: String(payload?.userId || payload?.user || payload?.actorId || 'default')
      };
      const engine = createRlmEngine({
        attachmentStore: buildSecureAttachmentStore(ctx.attachmentStore, actor),
        executeDeterministicTool: (toolName, args = {}, context = {}, options = {}) =>
          ctx.sessionManager.executeDeterministicTool(toolName, args, context, options),
        sendMessage: (modelName, messages, options = {}) =>
          ctx.ollamaManager.sendMessage(modelName, messages, options)
      });
      return engine.runTurn(payload || {});
    }
  };
}

module.exports = { createRlmHandlers };
