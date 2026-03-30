/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
function createModelFileHandlers() {
  return {
    'load-modelfile': (ctx, event, collection, modelId) =>
      ctx.modelConfigManager.loadModelfile(ctx.appDir, collection, modelId),
    'save-modelfile': (ctx, event, collection, modelId, content, cachedConfig) =>
      ctx.modelConfigManager.saveModelfile(ctx.appDir, collection, modelId, content, cachedConfig),
    'fetch-ollama-config': (ctx, event, ollamaModel, collection, modelId) =>
      ctx.modelConfigManager.fetchOllamaConfig(ctx.appDir, ollamaModel, collection, modelId),
    'get-model-config': (ctx, event, collection, modelId) =>
      ctx.modelConfigManager.getModelConfig(ctx.appDir, collection, modelId)
  };
}

module.exports = { createModelFileHandlers };
