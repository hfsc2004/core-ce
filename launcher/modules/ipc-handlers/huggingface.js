/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
function createHuggingFaceHandlers() {
  return {
    'fetch-huggingface-config': (ctx, event, modelUrl) => {
      const hfToken = ctx.settingsManager.getHuggingFaceToken(ctx.appDir);
      return ctx.huggingfaceAPI.fetchConfig(modelUrl, hfToken);
    },

    'fetch-huggingface-model-info': (ctx, event, modelUrl) => {
      const hfToken = ctx.settingsManager.getHuggingFaceToken(ctx.appDir);
      return ctx.huggingfaceAPI.fetchModelInfo(modelUrl, hfToken);
    },

    'fetch-file-info': (ctx, event, downloadUrl) => {
      const hfToken = ctx.settingsManager.getHuggingFaceToken(ctx.appDir);
      return ctx.huggingfaceAPI.fetchFileInfo(downloadUrl, hfToken);
    }
  };
}

module.exports = { createHuggingFaceHandlers };
