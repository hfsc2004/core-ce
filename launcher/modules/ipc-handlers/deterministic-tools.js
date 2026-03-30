/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
function createDeterministicToolHandlers() {
  return {
    'deterministic-tools-list': (ctx) => ctx.sessionManager.listDeterministicTools(),
    'deterministic-tools-execute': async (ctx, event, toolName, args = {}, context = {}, options = {}) =>
      ctx.sessionManager.executeDeterministicTool(toolName, args, context, options),
    'deterministic-tools-traces': (ctx, event, limit = 100) =>
      ctx.sessionManager.getDeterministicToolTraces(limit),
    'deterministic-tools-clear-traces': (ctx) =>
      ctx.sessionManager.clearDeterministicToolTraces(),
    'deterministic-tools-get-policy': (ctx) =>
      ctx.sessionManager.getDeterministicToolPolicy(),
    'deterministic-tools-set-policy': (ctx, event, policy) =>
      ctx.sessionManager.setDeterministicToolPolicy(policy || {}),
    'deterministic-tools-list-policy-presets': (ctx) =>
      ctx.sessionManager.listDeterministicToolPolicyPresets(),
    'deterministic-tools-apply-policy-preset': (ctx, event, presetName) =>
      ctx.sessionManager.applyDeterministicToolPolicyPreset(presetName)
  };
}

module.exports = { createDeterministicToolHandlers };
