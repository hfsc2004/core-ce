/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * PSF Coding Terminal - IPC Inference Backend Helpers
 */

'use strict';

function createInferenceTools(deps = {}) {
  const getConfig = typeof deps.getConfig === 'function' ? deps.getConfig : () => ({});
  const getRuntimeContext = typeof deps.getRuntimeContext === 'function' ? deps.getRuntimeContext : () => ({ appDir: null });
  const ollamaManager = deps.ollamaManager;
  const inferenceManager = deps.inferenceManager;

  function normalizeCodingInferenceBackend(value) {
    const raw = String(value || '').trim().toLowerCase();
    return raw === 'llama-cpp' ? 'llama-cpp' : 'ollama';
  }

  function getCodingInferenceBackend() {
    const cfg = getConfig() || {};
    return normalizeCodingInferenceBackend(cfg?.inferenceBackend);
  }

  async function listInferenceModels(options = {}) {
    const forced = String(options?.backend || '').trim().toLowerCase();
    const backend = forced === 'llama-cpp' || forced === 'ollama'
      ? forced
      : getCodingInferenceBackend();
    if (backend === 'ollama') {
      return ollamaManager.listModels(options);
    }
    const runtimeContext = getRuntimeContext();
    return inferenceManager.listModels(runtimeContext?.appDir || null, options);
  }

  async function sendInferenceMessage(modelName, messages, options = {}) {
    const forced = String(options?.backend || '').trim().toLowerCase();
    const backend = forced === 'llama-cpp' || forced === 'ollama'
      ? forced
      : getCodingInferenceBackend();
    if (backend === 'ollama') {
      return ollamaManager.sendMessage(modelName, messages, options);
    }
    const runtimeContext = getRuntimeContext();
    return inferenceManager.sendMessage(runtimeContext?.appDir || null, modelName, messages, options);
  }

  return {
    normalizeCodingInferenceBackend,
    getCodingInferenceBackend,
    listInferenceModels,
    sendInferenceMessage
  };
}

module.exports = createInferenceTools;

