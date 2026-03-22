/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
function isSessionMemoryEnabled(ctx) {
  const settings = ctx.settingsManager.getSettings(ctx.appDir) || {};
  return settings.session_memory_enabled !== false;
}

function createSessionMemoryHandlers() {
  return {
    'session-memory:append': (ctx, event, entry = {}) => {
      if (!isSessionMemoryEnabled(ctx)) {
        return { success: true, skipped: true, reason: 'disabled' };
      }
      return ctx.sessionMemory.appendEntry(ctx.appDir, entry);
    },

    'session-memory:list': (ctx, event, options = {}) => {
      if (!isSessionMemoryEnabled(ctx)) return [];
      return ctx.sessionMemory.listEntries(ctx.appDir, options);
    },

    'session-memory:sessions': (ctx, event, options = {}) => {
      if (!isSessionMemoryEnabled(ctx)) return [];
      return ctx.sessionMemory.listSessions(ctx.appDir, options);
    },

    'session-memory:clear': (ctx, event, options = {}) =>
      ctx.sessionMemory.clearEntries(ctx.appDir, options)
  };
}

module.exports = { createSessionMemoryHandlers };
