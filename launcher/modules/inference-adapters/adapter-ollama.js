/**
 * PSF Inference Adapter - Ollama (stub wrapper)
 *
 * @module adapter-ollama
 * @version 1.1.2 - March 5, 2026
 */

const ollamaManager = require('../ollama-manager/ollama-manager');

module.exports = {
  name: 'ollama',
  async listModels(_appDir, options = {}) {
    return ollamaManager.listModels(options);
  },
  async sendMessage(_appDir, model, messages, options = {}) {
    return ollamaManager.sendMessage(model, messages, options);
  },
  async sendMessageStream(_appDir, model, messages, options = {}) {
    return ollamaManager.sendMessageStream(model, messages, options);
  }
};
