/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const { contextBridge, ipcRenderer } = require('electron');

function subscribeIpc(channel, callback) {
  const handler = (_event, data) => callback(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('electronAPI', {
  // Hardware detection
  detectHardware: () => ipcRenderer.invoke('detect-hardware'),
  getGPUInfo: () => ipcRenderer.invoke('get-gpu-info'),
  getSecurityStatus: () => ipcRenderer.invoke('get-security-status'),
  getModelCompatibility: (model) => ipcRenderer.invoke('get-model-compatibility', model),
  calculateModelRequirements: (model) => ipcRenderer.invoke('calculate-model-requirements', model),
  fetchHuggingFaceConfig: (modelUrl) => ipcRenderer.invoke('fetch-huggingface-config', modelUrl),
  fetchHuggingFaceModelInfo: (modelUrl) => ipcRenderer.invoke('fetch-huggingface-model-info', modelUrl),
  fetchFileInfo: (downloadUrl) => ipcRenderer.invoke('fetch-file-info', downloadUrl),
  
  // Model Editor Window APIs
  openModelEditor: (mode, modelData, collections) => ipcRenderer.invoke('open-model-editor', mode, modelData, collections),
  openSettingsWindow: () => ipcRenderer.invoke('open-settings-window'),
  closeModelEditor: () => ipcRenderer.invoke('close-model-editor'),
  minimizeModelEditor: () => ipcRenderer.invoke('minimize-model-editor'),
  onModelEditorData: (callback) => ipcRenderer.on('model-editor-data', (event, data) => callback(data)),
  refreshPackageManager: () => ipcRenderer.invoke('refresh-package-manager'),
  onRefreshPackageManager: (callback) => ipcRenderer.on('refresh-package-manager', () => callback()),
  
  // Catalog APIs
  getCatalog: () => ipcRenderer.invoke('get-catalog'),
  getSKUConfig: () => ipcRenderer.invoke('get-sku-config'),
  getSKUManifest: () => ipcRenderer.invoke('get-sku-manifest'),
  
  // Model Download & Management APIs
  downloadModel: (modelId, url, collectionId, filename, projectorUrl, projectorFilename, expectedSHA256) => ipcRenderer.invoke('download-model', modelId, url, collectionId, filename, projectorUrl, projectorFilename, expectedSHA256),
  onDownloadProgress: (callback) => subscribeIpc('download-progress', callback),
  onBlobUploadProgress: (callback) => subscribeIpc('blob-upload-progress', callback),
  checkFileExists: (filepath) => ipcRenderer.invoke('check-file-exists', filepath),
  deleteModel: (filepath) => ipcRenderer.invoke('delete-model', filepath),
  deleteModelFromCatalog: (collectionId, modelId) => ipcRenderer.invoke('delete-model-from-catalog', collectionId, modelId),
  launchModelInOllama: (modelPath, projectorPath, modelId, forceCpu = false) => ipcRenderer.invoke('launch-model-in-ollama', modelPath, projectorPath, modelId, forceCpu),
  verifyModelChecksum: (filepath, expectedSHA256) => ipcRenderer.invoke('verify-model-checksum', filepath, expectedSHA256),
  
  // Launch APIs
  launchOllama: () => ipcRenderer.invoke('launch-ollama'),
  launchOpenWebUI: () => ipcRenderer.invoke('launch-open-webui'),
  launchAnythingLLM: () => ipcRenderer.invoke('launch-anythingllm'),
  openURL: (url) => ipcRenderer.invoke('open-url', url),
  openOllamaTerminal: (modelName, modelVramMB, ollamaPort, collection, modelId) => ipcRenderer.invoke('open-ollama-terminal', modelName, modelVramMB, ollamaPort, collection, modelId),
  
  // Catalog Editor APIs
  loadCatalog: () => ipcRenderer.invoke('load-catalog'),
  saveCatalog: (catalogData) => ipcRenderer.invoke('save-catalog', catalogData),
  addModel: (collectionId, modelData) => ipcRenderer.invoke('add-model', collectionId, modelData),
  updateModel: (modelId, modelData) => ipcRenderer.invoke('update-model', modelId, modelData),
  deleteModel: (modelId) => ipcRenderer.invoke('delete-model', modelId),
  searchModels: (query) => ipcRenderer.invoke('search-models', query),
  getMasterCatalog: () => ipcRenderer.invoke('get-master-catalog'),
  saveMasterCatalog: (catalogData) => ipcRenderer.invoke('save-master-catalog', catalogData),
  getCollections: () => ipcRenderer.invoke('get-collections'),
  
  // Package Manager APIs
  addCollection: (collectionId, collectionData) => ipcRenderer.invoke('add-collection', collectionId, collectionData),
  editCollection: (collectionId, updatedCollectionData) => ipcRenderer.invoke('edit-collection', collectionId, updatedCollectionData),
  deleteCollection: (collectionId) => ipcRenderer.invoke('delete-collection', collectionId),
  editModel: (collectionId, modelId, updatedModelData) => ipcRenderer.invoke('edit-model', collectionId, modelId, updatedModelData),
  deleteModelFromCatalog: (collectionId, modelId) => ipcRenderer.invoke('delete-model-from-catalog', collectionId, modelId),
  moveModel: (fromCollectionId, toCollectionId, modelId) => ipcRenderer.invoke('move-model', fromCollectionId, toCollectionId, modelId),
  
  // Import/Export APIs
  selectImportFile: (options = {}) => ipcRenderer.invoke('select-import-file', options),
  previewImportFile: (importFilePath) => ipcRenderer.invoke('preview-import-file', importFilePath),
  fetchHuggingFaceConfig: (baseModelUrl) => ipcRenderer.invoke('fetch-huggingface-config', baseModelUrl),
  importModelsFromFile: (importFilePath, targetCollectionId, options) => ipcRenderer.invoke('import-models-from-file', importFilePath, targetCollectionId, options),
  
  // Compile Final Project APIs
  getDownloadedModelsWithBlobs: () => ipcRenderer.invoke('get-downloaded-models-with-blobs'),
  listCompileConfigs: () => ipcRenderer.invoke('list-compile-configs'),
  saveCompileConfig: (config) => ipcRenderer.invoke('save-compile-config', config),
  loadCompileConfig: (configName) => ipcRenderer.invoke('load-compile-config', configName),
  deleteCompileConfig: (configName) => ipcRenderer.invoke('delete-compile-config', configName),
  compileProject: (projectData) => ipcRenderer.invoke('compile-project', projectData),
  onCompileProgress: (callback) => ipcRenderer.on('compile-progress', (event, data) => callback(data)),
  
  // Compiled Binary Management APIs
  getCompiledBinaryStatus: () => ipcRenderer.invoke('get-compiled-binary-status'),
  deleteCompiledBinary: (binaryType) => ipcRenderer.invoke('delete-compiled-binary', binaryType),
  
  // Terminal API
  openTerminal: () => ipcRenderer.invoke('open-terminal'),
  sessionMemoryAppend: (entry = {}) => ipcRenderer.invoke('session-memory:append', entry),
  sessionMemoryList: (options = {}) => ipcRenderer.invoke('session-memory:list', options),
  sessionMemorySessions: (options = {}) => ipcRenderer.invoke('session-memory:sessions', options),
  sessionMemoryClear: (options = {}) => ipcRenderer.invoke('session-memory:clear', options),
  rlmRunTurn: (payload = {}) => ipcRenderer.invoke('rlm:run-turn', payload),
  terminalAttachmentsList: (options = {}) => ipcRenderer.invoke('terminal:attachments-list', options),
  terminalAttachmentsAttachFile: (payload = {}) => ipcRenderer.invoke('terminal:attachments-attach-file', payload),
  terminalAttachmentsAttachText: (payload = {}) => ipcRenderer.invoke('terminal:attachments-attach-text', payload),
  terminalAttachmentsAttachBytes: (payload = {}) => ipcRenderer.invoke('terminal:attachments-attach-bytes', payload),
  terminalAttachmentsRemove: (payload = {}) => ipcRenderer.invoke('terminal:attachments-remove', payload),
  terminalAttachmentsClear: (options = {}) => ipcRenderer.invoke('terminal:attachments-clear', options),
  terminalAttachmentsBuildContext: (options = {}) => ipcRenderer.invoke('terminal:attachments-build-context', options),
  terminalAttachmentsReadText: (payload = {}) => ipcRenderer.invoke('terminal:attachments-read-text', payload),
  terminalAttachmentsReadBytes: (payload = {}) => ipcRenderer.invoke('terminal:attachments-read-bytes', payload),
  terminalBucketsList: (options = {}) => ipcRenderer.invoke('terminal:buckets-list', options),
  terminalBucketsCreate: (payload = {}) => ipcRenderer.invoke('terminal:buckets-create', payload),
  terminalBucketsDelete: (payload = {}) => ipcRenderer.invoke('terminal:buckets-delete', payload),
  terminalBucketsGrant: (payload = {}) => ipcRenderer.invoke('terminal:buckets-grant', payload),
  terminalBucketsRevoke: (payload = {}) => ipcRenderer.invoke('terminal:buckets-revoke', payload),
  terminalExportBlock: (payload = {}) => ipcRenderer.invoke('terminal:export-block', payload),
  
  // Coding Terminal API
  openCodingTerminal: (options = {}) => ipcRenderer.invoke('coding-terminal:open', options),
  closeCodingTerminal: () => ipcRenderer.invoke('coding-terminal:close'),
  toggleCodingTerminalDock: () => ipcRenderer.invoke('coding-terminal:toggle-dock'),
  toggleDock: () => ipcRenderer.invoke('coding-terminal:toggle-dock'),
  getCodingTerminalState: () => ipcRenderer.invoke('coding-terminal:get-state'),
  sendCodingMessage: (message) => ipcRenderer.invoke('coding-terminal:send-message', message),
  sendCodingMessageStream: (message) => ipcRenderer.invoke('coding-terminal:send-message-stream', message),
  sendCodingInferenceMessages: (payload = {}) => ipcRenderer.invoke('coding-terminal:send-inference-messages', payload),
  stopCodingMessageStream: (streamId = null) => ipcRenderer.invoke('coding-terminal:stop-stream', streamId),
  onCodingStreamData: (callback) => ipcRenderer.on('coding-terminal:stream-data', (event, data) => callback(data)),
  onCodingStreamDone: (callback) => ipcRenderer.on('coding-terminal:stream-done', (event, data) => callback(data)),
  onCodingStreamError: (callback) => ipcRenderer.on('coding-terminal:stream-error', (event, data) => callback(data)),
  onCodingModelStartupStatus: (callback) => ipcRenderer.on('coding-terminal:model-startup-status', (event, data) => callback(data)),
  removeCodingStreamListeners: () => {
    ipcRenderer.removeAllListeners('coding-terminal:stream-data');
    ipcRenderer.removeAllListeners('coding-terminal:stream-done');
    ipcRenderer.removeAllListeners('coding-terminal:stream-error');
    ipcRenderer.removeAllListeners('coding-terminal:model-startup-status');
  },
  getCodingHistory: (limit = 0) => ipcRenderer.invoke('coding-terminal:get-history', limit),
  clearCodingHistory: () => ipcRenderer.invoke('coding-terminal:clear-history'),
  setCodingProject: (projectPath) => ipcRenderer.invoke('coding-terminal:set-project', projectPath),
  getCodingProject: () => ipcRenderer.invoke('coding-terminal:get-project'),
  codingEditorListFiles: (options = {}) => ipcRenderer.invoke('coding-terminal:editor-list-files', options),
  codingEditorReadFile: (relativePath) => ipcRenderer.invoke('coding-terminal:editor-read-file', relativePath),
  codingEditorSaveFile: (payload) => ipcRenderer.invoke('coding-terminal:editor-save-file', payload),
  selectCodingProjectFolder: () => ipcRenderer.invoke('coding-terminal:select-project-folder'),
  listCodingModels: () => ipcRenderer.invoke('coding-terminal:list-models'),
  selectCodingModel: (selection) => ipcRenderer.invoke('coding-terminal:select-model', selection),
  listCodingRouterModels: () => ipcRenderer.invoke('coding-terminal:list-router-models'),
  selectCodingRouterModel: (selection) => ipcRenderer.invoke('coding-terminal:select-router-model', selection),
  listCodingDispatcherModels: () => ipcRenderer.invoke('coding-terminal:list-dispatcher-models'),
  selectCodingDispatcherModel: (selection) => ipcRenderer.invoke('coding-terminal:select-dispatcher-model', selection),
  ragQuery: (query, options = {}) => ipcRenderer.invoke('coding-terminal:rag-query', query, options),
  ragSources: (options = {}) => ipcRenderer.invoke('coding-terminal:rag-sources', options),
  ragBuckets: (options = {}) => ipcRenderer.invoke('coding-terminal:rag-buckets', options),
  ragDeleteBucket: (bucketId) => ipcRenderer.invoke('coding-terminal:rag-delete-bucket', bucketId),
  ragIndex: (paths, options = {}) => ipcRenderer.invoke('coding-terminal:rag-index', paths, options),
  ragRemovePaths: (paths = [], options = {}) => ipcRenderer.invoke('coding-terminal:rag-remove-paths', paths, options),
  ragClearIndex: (options = {}) => ipcRenderer.invoke('coding-terminal:rag-clear-index', options),
  onCodingRagIndexProgress: (callback) => ipcRenderer.on('coding-terminal:rag-index-progress', (event, data) => callback(data)),
  gitStatus: () => ipcRenderer.invoke('coding-terminal:git-status'),
  gitDiff: (options = {}) => ipcRenderer.invoke('coding-terminal:git-diff', options),
  gitCommit: (message, options = {}) => ipcRenderer.invoke('coding-terminal:git-commit', message, options),
  gitRun: (action, payload = {}) => ipcRenderer.invoke('coding-terminal:git-run', action, payload),
  getCodingConfig: () => ipcRenderer.invoke('coding-terminal:get-config'),
  updateCodingConfig: (updates) => ipcRenderer.invoke('coding-terminal:update-config', updates),
  getCodingPipelineEvents: (options = {}) => ipcRenderer.invoke('coding-terminal:get-pipeline-events', options),
  getCodingPlanRuns: (options = {}) => ipcRenderer.invoke('coding-terminal:get-plan-runs', options),
  getCodingDeterministicRegistry: (options = {}) => ipcRenderer.invoke('coding-terminal:get-deterministic-registry', options),
  getCodingInferenceBackend: () => ipcRenderer.invoke('coding-terminal:get-inference-backend'),
  setCodingInferenceBackend: (backend) => ipcRenderer.invoke('coding-terminal:set-inference-backend', backend),
  onCodingTerminalProjectSet: (callback) => ipcRenderer.on('coding-terminal:set-project', (event, projectPath) => callback(projectPath)),
  
  // Ollama APIs
  ollamaSendMessage: (modelName, messages, options) => ipcRenderer.invoke('ollama-send-message', modelName, messages, options),
  ollamaSendMessageStream: (modelName, messages, options) => ipcRenderer.invoke('ollama-send-message-stream', modelName, messages, options),
  ollamaStopStream: (options = {}) => ipcRenderer.invoke('ollama-stop-stream', options),
  ollamaListModels: (options) => ipcRenderer.invoke('ollama-list-models', options),
  onOllamaStreamData: (callback) => ipcRenderer.on('ollama-stream-data', (event, data) => callback(data)),
  
  // Version Manager API
  updateVersion: (newVersion, copyrightYear, brandingMetadata = {}) => ipcRenderer.invoke('update-version', newVersion, copyrightYear, brandingMetadata),
  getCurrentVersion: () => ipcRenderer.invoke('get-current-version'),
  getVersionStatus: () => ipcRenderer.invoke('get-version-status'),
  getComplianceEvidenceStatus: () => ipcRenderer.invoke('version-manager:get-compliance-evidence'),
  saveComplianceEvidence: (payload = {}) => ipcRenderer.invoke('version-manager:save-compliance-evidence', payload),
  addComplianceTrustedKey: (keyId, publicKeyPem) => ipcRenderer.invoke('version-manager:add-compliance-trusted-key', keyId, publicKeyPem),
  removeComplianceTrustedKey: (keyId) => ipcRenderer.invoke('version-manager:remove-compliance-trusted-key', keyId),
  signComplianceEvidence: (options = {}) => ipcRenderer.invoke('version-manager:sign-compliance-evidence', options),
  createLightweightProjectClone: () => ipcRenderer.invoke('version-manager:create-lightweight-clone'),
  
  // Build Tools API
  buildSKUCatalogs: () => ipcRenderer.invoke('build-sku-catalogs'),
  evaluateCatalogModel: (payload = {}) => ipcRenderer.invoke('catalog:evaluate-model', payload),
  onCatalogEvaluateProgress: (callback) => subscribeIpc('catalog-evaluate-progress', callback),
  onBuildProgress: (callback) => ipcRenderer.on('build-progress', (event, data) => callback(data)),
  
  // Modelfile Configuration APIs
  loadModelfile: (collection, modelId) => ipcRenderer.invoke('load-modelfile', collection, modelId),
  saveModelfile: (collection, modelId, content, cachedConfig) => ipcRenderer.invoke('save-modelfile', collection, modelId, content, cachedConfig),
  fetchOllamaConfig: (ollamaModel, collection, modelId) => ipcRenderer.invoke('fetch-ollama-config', ollamaModel, collection, modelId),
  getModelConfig: (collection, modelId) => ipcRenderer.invoke('get-model-config', collection, modelId),
  
  // Binary Manager APIs
  checkBinaries: (type) => ipcRenderer.invoke('check-binaries', type),
  checkLlamaCppBuild: () => ipcRenderer.invoke('check-llama-cpp-build'),
  downloadBinaries: (type) => ipcRenderer.invoke('download-binaries', type),
  deleteBinaries: (type) => ipcRenderer.invoke('delete-binaries', type),
  killOllamaService: () => ipcRenderer.invoke('kill-ollama-service'),
  checkOllamaStatus: () => ipcRenderer.invoke('check-ollama-status'),
  
  // Binary Version Manager APIs
  getBinaryVersions: () => ipcRenderer.invoke('get-binary-versions'),
  updateBinaryVersion: (binaryType, newVersion) => ipcRenderer.invoke('update-binary-version', binaryType, newVersion),
  checkForBinaryUpdates: (binaryType) => ipcRenderer.invoke('check-for-binary-updates', binaryType),
  
  // Python WebUI APIs
  checkPythonWebUI: () => ipcRenderer.invoke('check-python-webui'),
  buildPythonWebUI: () => ipcRenderer.invoke('build-python-webui'),
  onPythonWebUIBuildOutput: (callback) => ipcRenderer.on('python-webui-build-output', (event, line) => callback(line)),
  checkVoiceRuntime: (payload = {}) => ipcRenderer.invoke('check-voice-runtime', payload),
  installVoiceRuntime: (payload = {}) => ipcRenderer.invoke('install-voice-runtime', payload),
  deleteVoiceRuntime: (payload = {}) => ipcRenderer.invoke('delete-voice-runtime', payload),
  
  // Package Manager APIs
  onPackageUpdate: (callback) => ipcRenderer.on('package-update', (event, data) => callback(data)),
  installPackage: (pkg) => ipcRenderer.invoke('install-package', pkg),
  uninstallPackage: (pkg) => ipcRenderer.invoke('uninstall-package', pkg),
  checkPackageStatus: (pkg) => ipcRenderer.invoke('check-package-status', pkg),
  
  // Config Management APIs
  loadConfigList: () => ipcRenderer.invoke('load-config-list'),
  loadConfig: (configName) => ipcRenderer.invoke('load-config', configName),
  saveConfig: (configName, configData) => ipcRenderer.invoke('save-config', configName, configData),
  deleteConfig: (configName) => ipcRenderer.invoke('delete-config', configName),
  
  // Blob Mapper APIs
  getBlobStatusSummary: () => ipcRenderer.invoke('get-blob-status-summary'),
  checkModelBlobIntegrity: (modelName) => ipcRenderer.invoke('check-model-blob-integrity', modelName),
  getOrphanBlobs: () => ipcRenderer.invoke('get-orphan-blobs'),
  checkBlobDeleteSafety: (digest, excludeModel = null) => ipcRenderer.invoke('check-blob-delete-safety', digest, excludeModel),
  deleteBlobByDigest: (digest, options = {}) => ipcRenderer.invoke('delete-blob-by-digest', digest, options),
  
  // MoE Model Status APIs (Filesystem-based - no Ollama required)
  getWrappedModelNames: () => ipcRenderer.invoke('get-wrapped-model-names'),
  checkModelFiles: (collectionKey, filename) => ipcRenderer.invoke('check-model-files', collectionKey, filename),
  checkAllModelFiles: (models) => ipcRenderer.invoke('check-all-model-files', models),
  
  // Model Ordering APIs (MoE Foundation)
  getModelOrdering: () => ipcRenderer.invoke('get-model-ordering'),
  saveModelOrdering: (orderingData) => ipcRenderer.invoke('save-model-ordering', orderingData),
  
  // MoE Pipeline APIs (Core - Community Edition)
  deployMoEPipeline: (pipelineConfig) => ipcRenderer.invoke('moe-deploy-pipeline', pipelineConfig),
  getMoEStatus: () => ipcRenderer.invoke('moe-get-status'),
  teardownMoEPipeline: () => ipcRenderer.invoke('moe-teardown-pipeline'),
  saveMoEPipeline: (pipelineConfig) => ipcRenderer.invoke('moe-save-pipeline', pipelineConfig),
  loadMoEPipeline: () => ipcRenderer.invoke('moe-load-pipeline'),
  saveMoEPipelineProfile: (pipelineConfig, profileName) => ipcRenderer.invoke('moe-save-pipeline-profile', pipelineConfig, profileName),
  loadMoEPipelineProfile: (profileName) => ipcRenderer.invoke('moe-load-pipeline-profile', profileName),
  listMoEPipelineProfiles: () => ipcRenderer.invoke('moe-list-pipeline-profiles'),
  deleteMoEPipelineProfile: (profileName) => ipcRenderer.invoke('moe-delete-pipeline-profile', profileName),
  
  // MoE Communication APIs
  routeMoEMessage: (message, options) => ipcRenderer.invoke('moe-route-message', message, options),
  rerunLastMoEIrg: (options = {}) => ipcRenderer.invoke('moe-rerun-last-irg', options),
  runMoEIrgContract: (contract, options = {}) => ipcRenderer.invoke('moe-run-irg-contract', contract, options),
  sendToMoEAgent: (agentId, message, options) => ipcRenderer.invoke('moe-send-to-agent', agentId, message, options),
  pingMoEAgents: () => ipcRenderer.invoke('moe-ping-agents'),
  listMoESerialPorts: () => ipcRenderer.invoke('moe-list-serial-ports'),
  moePickCodeFile: () => ipcRenderer.invoke('moe-pick-code-file'),
  moeReadTextFile: (filePath, options = {}) => ipcRenderer.invoke('moe-read-text-file', filePath, options),

  // Deterministic Tools Runtime APIs (shared core)
  listDeterministicTools: () => ipcRenderer.invoke('deterministic-tools-list'),
  executeDeterministicTool: (toolName, args = {}, context = {}, options = {}) =>
    ipcRenderer.invoke('deterministic-tools-execute', toolName, args, context, options),
  getDeterministicToolTraces: (limit = 100) => ipcRenderer.invoke('deterministic-tools-traces', limit),
  clearDeterministicToolTraces: () => ipcRenderer.invoke('deterministic-tools-clear-traces'),
  getDeterministicToolPolicy: () => ipcRenderer.invoke('deterministic-tools-get-policy'),
  setDeterministicToolPolicy: (policy = {}) => ipcRenderer.invoke('deterministic-tools-set-policy', policy),
  listDeterministicToolPolicyPresets: () => ipcRenderer.invoke('deterministic-tools-list-policy-presets'),
  applyDeterministicToolPolicyPreset: (presetName) => ipcRenderer.invoke('deterministic-tools-apply-policy-preset', presetName),
  
  // MoE Chat Window
  openMoeChatWindow: (pipelineConfig) => ipcRenderer.invoke('open-moe-chat-window', pipelineConfig),
  
  // Settings APIs
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  modsPickDirectory: () => ipcRenderer.invoke('mods:pick-directory'),
  modsPickKeyFile: () => ipcRenderer.invoke('mods:pick-key-file'),
  modsListInstalled: () => ipcRenderer.invoke('mods:list-installed'),
  modsListTrustedKeys: () => ipcRenderer.invoke('mods:list-trusted-keys'),
  modsCreateKeypair: (payload = {}) => ipcRenderer.invoke('mods:create-keypair', payload),
  modsSignDirectory: (payload = {}) => ipcRenderer.invoke('mods:sign-directory', payload),
  modsInstallDirectory: (payload = {}) => ipcRenderer.invoke('mods:install-directory', payload),
  modsEnable: (payload = {}) => ipcRenderer.invoke('mods:enable', payload),
  modsDisable: (payload = {}) => ipcRenderer.invoke('mods:disable', payload),
  modsRemove: (payload = {}) => ipcRenderer.invoke('mods:remove', payload),
  modsReadState: (payload = {}) => ipcRenderer.invoke('mods:read-state', payload),
  modsAttest: (payload = {}) => ipcRenderer.invoke('mods:attest', payload),
  modsHasCapability: (payload = {}) => ipcRenderer.invoke('mods:has-capability', payload),
  voiceToTextGetConfig: () => ipcRenderer.invoke('voice-to-text:get-config'),
  voiceToTextSetConfig: (patch = {}) => ipcRenderer.invoke('voice-to-text:set-config', patch),
  voiceToTextGetCapabilities: () => ipcRenderer.invoke('voice-to-text:get-capabilities'),
  voiceToTextTranscribeHf: (payload = {}) => ipcRenderer.invoke('voice-to-text:transcribe-hf', payload),
  voiceToTextTestStt: () => ipcRenderer.invoke('voice-to-text:test-stt'),
  voiceToTextPrewarmStt: (payload = {}) => ipcRenderer.invoke('voice-to-text:prewarm-stt', payload),
  voiceToTextSynthesizeHf: (payload = {}) => ipcRenderer.invoke('voice-to-text:synthesize-hf', payload),
  voiceToTextSynthesizeLocalTransformers: (payload = {}) => ipcRenderer.invoke('voice-to-text:synthesize-local-transformers', payload),
  voiceToTextPrewarmTts: (payload = {}) => ipcRenderer.invoke('voice-to-text:prewarm-tts', payload),
  
  // Theme APIs
  getTheme: () => ipcRenderer.invoke('get-theme'),
  saveTheme: (theme) => ipcRenderer.invoke('save-theme', theme),
  getAvailableLogoFiles: () => ipcRenderer.invoke('get-available-logo-files'),
  onThemeUpdated: (callback) => ipcRenderer.on('theme-updated', (event, theme) => callback(theme)),
  removeThemeUpdatedListener: () => ipcRenderer.removeAllListeners('theme-updated'),
  
  // GPU Monitor APIs
  getGpuMonitorEnabled: () => ipcRenderer.invoke('get-gpu-monitor-enabled'),
  setGpuMonitorEnabled: (enabled) => ipcRenderer.invoke('set-gpu-monitor-enabled', enabled),
  isGpuMonitorRunning: () => ipcRenderer.invoke('is-gpu-monitor-running'),
  startGpuMonitor: () => ipcRenderer.invoke('gpu-monitor-start'),
  stopGpuMonitor: () => ipcRenderer.invoke('gpu-monitor-stop'),
  onGpuMonitorData: (callback) => ipcRenderer.on('gpu-monitor-data', (event, data) => callback(data)),
  removeGpuMonitorListener: () => ipcRenderer.removeAllListeners('gpu-monitor-data'),

  // Workspace Git APIs (Settings > Source Control)
  workspaceGitStatus: () => ipcRenderer.invoke('workspace-git-status'),
  workspaceGitInit: () => ipcRenderer.invoke('workspace-git-init'),
  workspaceGitAddAll: () => ipcRenderer.invoke('workspace-git-add-all'),
  workspaceGitCommit: (message) => ipcRenderer.invoke('workspace-git-commit', message),
  workspaceGitBranches: () => ipcRenderer.invoke('workspace-git-branches'),
  workspaceGitCreateBranch: (branchName, checkout = true) => ipcRenderer.invoke('workspace-git-create-branch', branchName, checkout),
  workspaceGitCheckoutBranch: (branchName) => ipcRenderer.invoke('workspace-git-checkout-branch', branchName),
  workspaceGitMerge: (sourceBranch) => ipcRenderer.invoke('workspace-git-merge', sourceBranch),
  workspaceGitHistory: (limit = 30) => ipcRenderer.invoke('workspace-git-history', limit),
  workspaceGitRollback: (targetRef, mode = 'hard', options = {}) => ipcRenderer.invoke('workspace-git-rollback', targetRef, mode, options),
  workspaceGitPolicy: () => ipcRenderer.invoke('workspace-git-policy'),
  workspaceGitToggleFileTracked: (filePath, track = true) => ipcRenderer.invoke('workspace-git-toggle-file-tracked', filePath, track),
  workspaceGitOpenGuide: () => ipcRenderer.invoke('workspace-git-open-guide'),
  
  // Shell/External APIs
  openExternal: (url) => ipcRenderer.invoke('open-url', url),
  getDocContent: (docPath) => ipcRenderer.invoke('get-doc-content', docPath),
  
  // Dialog APIs (Proper GTK integration to avoid signal handler errors on Linux)
  showConfirmDialog: (options) => ipcRenderer.invoke('show-confirm-dialog', options)
});
