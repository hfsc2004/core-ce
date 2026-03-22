/**
 * Pseudo Science Fiction - Standard Edition Preload Script
 * 
 * Exposes only the essential APIs needed for compiled Standard Edition products.
 * This is a subset of the full Core-CE preload.js.
 * 
 * @version 1.1.2 - March 5, 2026
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ============================================================================
  // Theme & Settings APIs
  // ============================================================================
  getTheme: () => ipcRenderer.invoke('get-theme'),
  saveTheme: (theme) => ipcRenderer.invoke('save-theme', theme),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  
  // ============================================================================
  // Catalog APIs
  // ============================================================================
  getCatalog: () => ipcRenderer.invoke('get-catalog'),
  getSKUConfig: () => ipcRenderer.invoke('get-sku-config'),  // Returns null for Standard Edition
  
  // ============================================================================
  // Hardware Detection
  // ============================================================================
  detectHardware: () => ipcRenderer.invoke('detect-hardware'),
  getGPUInfo: () => ipcRenderer.invoke('get-gpu-info'),
  getModelCompatibility: (model) => ipcRenderer.invoke('get-model-compatibility', model),
  
  // ============================================================================
  // File Operations
  // ============================================================================
  checkFileExists: (filepath) => ipcRenderer.invoke('check-file-exists', filepath),
  
  // ============================================================================
  // Ollama / Model Launch APIs
  // ============================================================================
  launchModelInOllama: (modelPath, projectorPath, modelId, forceCpu) => 
    ipcRenderer.invoke('launch-model-in-ollama', modelPath, projectorPath, modelId, forceCpu),
  openOllamaTerminal: (modelName, vramMB, port, collection, modelId, sessionId) => 
    ipcRenderer.invoke('open-ollama-terminal', modelName, vramMB, port, collection, modelId, sessionId),
  onBlobUploadProgress: (callback) => ipcRenderer.on('blob-upload-progress', (event, data) => callback(data)),
  
  // ============================================================================
  // Ollama Terminal Communication APIs
  // ============================================================================
  ollamaSendMessage: (modelName, messages, options) => 
    ipcRenderer.invoke('ollama-send-message', modelName, messages, options),
  ollamaSendMessageStream: (modelName, messages, options) => 
    ipcRenderer.invoke('ollama-send-message-stream', modelName, messages, options),
  ollamaStopStream: (options = {}) => ipcRenderer.invoke('ollama-stop-stream', options),
  onOllamaStreamData: (callback) => ipcRenderer.on('ollama-stream-data', (event, data) => callback(data)),
  ollamaListModels: (options) => ipcRenderer.invoke('ollama-list-models', options),
  
  // ============================================================================
  // Open WebUI APIs (BMOC-Lite)
  // ============================================================================
  startWebUI: () => ipcRenderer.invoke('start-webui'),
  stopWebUI: () => ipcRenderer.invoke('stop-webui'),
  
  // ============================================================================
  // AnythingLLM APIs (BMOC-Lite)
  // ============================================================================
  startAnythingLLM: () => ipcRenderer.invoke('start-anythingllm'),
  stopAnythingLLM: () => ipcRenderer.invoke('stop-anythingllm'),
  
  // ============================================================================
  // Session Management APIs (BMOC-Lite - NEW)
  // ============================================================================
  closeSession: (sessionId) => ipcRenderer.invoke('close-session', sessionId),
  shutdownAll: () => ipcRenderer.invoke('shutdown-all'),
  
  // ============================================================================
  // Session Status (BMOC-Lite)
  // ============================================================================
  getSessionStatus: () => ipcRenderer.invoke('get-session-status'),
  
  // ============================================================================
  // License APIs
  // ============================================================================
  getLicenseFiles: () => ipcRenderer.invoke('get-license-files'),
  getLicenseContent: (filename) => ipcRenderer.invoke('get-license-content', filename),
  getDocContent: (docPath) => ipcRenderer.invoke('get-doc-content', docPath),
  
  // ============================================================================
  // External Links
  // ============================================================================
  openURL: (url) => ipcRenderer.invoke('open-url', url),
  openExternal: (url) => ipcRenderer.invoke('open-url', url),
  
  // ============================================================================
  // Dialog APIs
  // ============================================================================
  showConfirmDialog: (options) => ipcRenderer.invoke('show-confirm-dialog', options)
});

console.log('[Preload] Standard Edition APIs loaded');
