/**
 * PSF Inference Adapter - llama.cpp (stub wrapper)
 *
 * @module adapter-llamacpp
 * @version 1.1.3 - March 5, 2026
 */

const llamaCppManager = require('../llama-cpp-manager');

module.exports = {
  name: 'llama-cpp',
  async listModels(appDir, options = {}) {
    return llamaCppManager.listModels(appDir, options);
  },
  async sendMessage(appDir, model, messages, options = {}) {
    return llamaCppManager.sendMessage(appDir, model, messages, options);
  },
  async sendMessageStream(appDir, model, messages, options = {}) {
    return llamaCppManager.sendMessageStream(appDir, model, messages, options);
  }
};
