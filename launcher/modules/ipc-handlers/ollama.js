/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
function createOllamaHandlers() {
  async function ensureTerminalOllamaSession(ctx) {
    const existingPort = Number(ctx?.sessionManager?.getOllamaPortForService?.('terminal') || 0);
    if (existingPort > 0) {
      return { success: true, ollamaPort: existingPort, reused: true };
    }
    return ctx?.sessionManager?.startOllamaForService?.('terminal', ctx.appDir, ctx.gpuInfo)
      || { success: false, message: 'Session manager unavailable.' };
  }

  return {
    'check-ollama': async (ctx) => {
      const running = await ctx.ollamaManager.checkOllamaRunning();
      return { running };
    },

    'check-ollama-status': async (ctx) => {
      const bundledRunning = await ctx.ollamaManager.checkOllamaRunning(52434);
      return { bundled: { running: bundledRunning, port: 52434 } };
    },

    'load-model-into-ollama': async (ctx, event, modelTag) => {
      const startResult = await ensureTerminalOllamaSession(ctx);
      if (!startResult?.success) {
        return { success: false, message: startResult?.message || 'Failed to start BMOC terminal session.' };
      }
      const port = Number(startResult.ollamaPort || startResult.port || 0);
      if (port <= 0) {
        return { success: false, message: 'BMOC terminal session did not return a valid Ollama port.' };
      }
      return ctx.ollamaManager.launchModelInOllama(
        modelTag,
        ctx.appDir,
        ctx.gpuInfo,
        null,
        null,
        false,
        {
          preferredPort: port,
          preventAutoStart: true,
          bindOnly: true
        }
      );
    },

    'ollama-list-models': async (ctx, event, options = {}) => {
      try {
        return await ctx.ollamaManager.listModels(options);
      } catch (err) {
        console.error('[Ollama List] Error:', err);
        return { models: [], error: err.message };
      }
    },

    'ollama-send-message': (ctx, event, modelName, messages, options = {}) =>
      ctx.ollamaManager.sendMessage(modelName, messages, options)
  };
}

module.exports = { createOllamaHandlers };
