/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
function createHuggingFaceHandlers() {
  const services = new Map();
  const owners = new WeakSet();
  function conversion(ctx, event, operation, payload = {}) {
    if (!services.has(ctx.appDir)) {
      services.set(ctx.appDir, require('../hf-gguf-conversion').createConversionService(ctx.appDir));
    }
    const service = services.get(ctx.appDir);
    const owner = event.sender.id;
    if (!owners.has(event.sender)) {
      owners.add(event.sender);
      event.sender.once('destroyed', () => { service.cancel(owner).catch(() => {}); });
    }
    const emit = message => {
      if (!event.sender.isDestroyed()) event.sender.send('hf-conversion-progress', { message });
    };
    const token = ctx.settingsManager.getHuggingFaceToken(ctx.appDir);
    return Promise.resolve().then(() => {
      if (operation === 'scan') return service.scan(owner, payload, token, emit);
      if (operation === 'prepare') return service.prepare(owner, payload, token);
      if (operation === 'finish') return service.finish(owner, payload, ctx.catalogManager);
      if (operation === 'update') return service.update(emit);
      return service.cancel(owner, payload.sessionId);
    }).then(async result => {
      if (event.sender.isDestroyed()) await service.cancel(owner);
      return result;
    }).catch(error => ({ success: false, error: error.name === 'AbortError' ? 'Conversion cancelled.' : error.message }));
  }
  return {
    'hf-conversion-scan': (ctx, event, payload) => conversion(ctx, event, 'scan', payload),
    'hf-conversion-prepare': (ctx, event, payload) => conversion(ctx, event, 'prepare', payload),
    'hf-conversion-finish': (ctx, event, payload) => conversion(ctx, event, 'finish', payload),
    'hf-conversion-cancel': (ctx, event, payload) => conversion(ctx, event, 'cancel', payload),
    'hf-conversion-update-tools': (ctx, event) => conversion(ctx, event, 'update'),
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
