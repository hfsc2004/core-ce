/**
 * Pseudo Science Fiction Core Collection - Inference Manager
 *
 * Shared backend abstraction for text inference across terminals/features.
 * Keeps existing Ollama behavior as default while introducing a single place
 * to switch to llama.cpp backend.
 *
 * @module inference-manager
 * @version 1.1.2 - March 5, 2026
 */

const settingsManager = require('./settings-manager');
const ollamaManager = require('./ollama-manager/ollama-manager');
const llamaCppManager = require('./llama-cpp-manager');

function normalizeBackend(value) {
  const raw = String(value || '').trim().toLowerCase();
  return raw === 'llama-cpp' ? 'llama-cpp' : 'ollama';
}

function getBackend(appDir) {
  return normalizeBackend(settingsManager.getInferenceBackend(appDir));
}

function setBackend(appDir, backend) {
  const normalized = normalizeBackend(backend);
  const saved = settingsManager.setInferenceBackend(appDir, normalized);
  return {
    success: !!saved?.success,
    backend: normalized,
    message: saved?.success ? `Inference backend set to ${normalized}` : (saved?.error || 'Failed to save backend')
  };
}

function getBackendAvailability(appDir) {
  return {
    backend: getBackend(appDir),
    ollama: { success: true, available: true },
    llamaCpp: llamaCppManager.checkAvailable(appDir)
  };
}

async function listModels(appDir, options = {}) {
  const backend = normalizeBackend(options?.backend || getBackend(appDir));
  if (backend === 'llama-cpp') {
    return llamaCppManager.listModels(appDir, options);
  }
  return ollamaManager.listModels(options);
}

async function sendMessage(appDir, modelName, messages, options = {}) {
  const backend = normalizeBackend(options?.backend || getBackend(appDir));
  if (backend === 'llama-cpp') {
    return llamaCppManager.sendMessage(appDir, modelName, messages, options);
  }
  return ollamaManager.sendMessage(modelName, messages, options);
}

async function sendMessageStream(appDir, modelName, messages, options = {}) {
  const backend = normalizeBackend(options?.backend || getBackend(appDir));
  if (backend === 'llama-cpp') {
    return llamaCppManager.sendMessageStream(appDir, modelName, messages, options);
  }
  return ollamaManager.sendMessageStream(modelName, messages, options);
}

async function launchModel(appDir, modelPath, gpuInfo, projectorPath = null, progressCallback = null, forceCpu = false) {
  const backend = getBackend(appDir);
  if (backend === 'llama-cpp') {
    return llamaCppManager.launchModel(appDir, modelPath, gpuInfo, projectorPath, progressCallback, forceCpu);
  }
  return ollamaManager.launchModelInOllama(modelPath, appDir, forceCpu ? null : gpuInfo, projectorPath, progressCallback, forceCpu);
}

async function openTerminal(appDir, modelName, preloadPath, htmlPath, gpuInfo, modelVramMB = 0, port = null, modelConfig = null) {
  const backend = getBackend(appDir);
  if (backend === 'llama-cpp') {
    return llamaCppManager.openTerminal(appDir, modelName, preloadPath, htmlPath, gpuInfo, modelVramMB, port, modelConfig);
  }
  return ollamaManager.openOllamaTerminal(
    appDir,
    modelName,
    preloadPath,
    htmlPath,
    gpuInfo,
    modelVramMB,
    port,
    modelConfig
  );
}

module.exports = {
  normalizeBackend,
  getBackend,
  setBackend,
  getBackendAvailability,
  listModels,
  sendMessage,
  sendMessageStream,
  launchModel,
  openTerminal
};
