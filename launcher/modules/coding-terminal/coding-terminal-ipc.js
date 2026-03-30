/**
 * PSF Coding Terminal IPC handler registration.
 * @module coding-terminal-ipc
 * @version 1.1.2 - March 5, 2026
 */
const { ipcMain } = require('electron');
const codingTerminalCommon = require('./coding-terminal-common');
const ragEngine = require('../rag-engine/rag-engine');
const gitIntegration = require('../git-integration/git-integration');
const securityLayer = require('../security-layer/security-layer');
const codingTerminalPlatform = require('./coding-terminal-platform');
const codingTerminalIpcRag = require('./coding-terminal-ipc-rag');
const codingTerminalIpcGit = require('./coding-terminal-ipc-git');
const codingTerminalIpcChat = require('./coding-terminal-ipc-chat');
const createGroundingTools = require('./coding-terminal-ipc-grounding');
const createModelTools = require('./coding-terminal-ipc-models');
const createStreamTools = require('./coding-terminal-ipc-stream');
const createEditorTools = require('./coding-terminal-ipc-editor');
const createDeterministicHelpers = require('./coding-terminal-ipc-deterministic');
const createGitCliTools = require('./coding-terminal-ipc-git-cli');
const createRouterTools = require('./coding-terminal-ipc-router');
const createRagFallbackTools = require('./coding-terminal-ipc-rag-fallback');
const createStartupTools = require('./coding-terminal-ipc-startup');
const createInferenceTools = require('./coding-terminal-ipc-inference');
const createChatPrepareTool = require('./coding-terminal-ipc-chat-prepare');
const createGroundingProofTools = require('./coding-terminal-ipc-grounding-proof');
const createIpcRuntimeHandlers = require('./coding-terminal-ipc-runtime');
const createReadinessTools = require('./coding-terminal-ipc-readiness');
const createCliAgentTools = require('./coding-terminal-ipc-cli-agent');
const deterministicRegistry = require('./coding-terminal-ipc-deterministic-registry');
const { withTimeout, getMergedFilename } = require('./coding-terminal-ipc-utils');
const pipelineTools = require('./coding-terminal-pipeline');
const sessionManager = require('../session-manager');
const ollamaManager = require('../ollama-manager/ollama-manager');
const inferenceManager = require('../inference-manager');
const PortPoolOllama = require('../port-pool/port-pool-ollama');
const catalogManager = require('../catalog-manager');
const blobMapper = require('../blob-mapper');
const ragBuckets = require('./rag-buckets');
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { execFile, execFileSync } = require('child_process');
const RAG_SOURCE_INDEX_PATH = path.join(__dirname, '../../data/rag-source-index.json');
const { CODING_SYSTEM_PROMPT, CODING_INSPECT_PROMPT, CODING_GENERATE_PROMPT, GROUNDED_FILE_ANALYSIS_PROMPT, GROUNDED_FILE_REWRITE_PROMPT, GROUNDED_FILE_FULL_REWRITE_PROMPT, GROUNDED_FILE_REWRITE_RETRY_PROMPT, DEFAULT_ROUTER_MODEL, ROUTER_SYSTEM_PROMPT } = require('./coding-terminal-ipc-prompts');

const registeredChannels = [];
let ragReady = false;
let gitReady = false;
let securityReady = false;
let runtimeContext = {
  appDir: null,
  gpuInfo: null
};
const activeStreamRequests = new Map();
const OLLAMA_KEEP_ALIVE = '30m';

function emitModelStartupStatus(sender, payload = {}) {
  try {
    if (!sender || typeof sender.send !== 'function') return;
    sender.send('coding-terminal:model-startup-status', {
      ts: Date.now(),
      ...payload
    });
  } catch {}
}
const inferenceTools = createInferenceTools({
  getConfig: () => (codingTerminalCommon.getConfig ? codingTerminalCommon.getConfig() : {}),
  getRuntimeContext: () => runtimeContext,
  ollamaManager,
  inferenceManager
});
const {
  normalizeCodingInferenceBackend,
  getCodingInferenceBackend,
  listInferenceModels,
  sendInferenceMessage
} = inferenceTools;
const startupTools = createStartupTools({
  sessionManager,
  PortPoolOllama,
  path,
  execFileSync,
  getBackend: () => getCodingInferenceBackend(),
  getRuntimeContext: () => runtimeContext,
  getConfig: () => (codingTerminalCommon.getConfig ? codingTerminalCommon.getConfig() : {}),
  emitModelStartupStatus,
  onTerminalOllamaClosed: () => {
    if (getCodingInferenceBackend() === 'ollama') {
      ragReady = false;
    }
  },
  onRagOllamaClosed: () => {
    ragReady = false;
  }
});
const ensureTerminalOllamaReady = (...args) => startupTools.ensureTerminalOllamaReady(...args);
const ensureTerminalLlamaReady = (...args) => startupTools.ensureTerminalLlamaReady(...args);
const swapTerminalLlamaModel = (...args) => startupTools.swapTerminalLlamaModel(...args);
const closeTerminalOllamaSession = (...args) => startupTools.closeTerminalOllamaSession(...args);
const closeTerminalLlamaSession = (...args) => startupTools.closeTerminalLlamaSession(...args);
const ensureRouterOllamaReady = (...args) => startupTools.ensureRouterOllamaReady(...args);
const ensureRouterLlamaReady = (...args) => startupTools.ensureRouterLlamaReady(...args);
const closeRouterOllamaSession = (...args) => startupTools.closeRouterOllamaSession(...args);
const closeRouterLlamaSession = (...args) => startupTools.closeRouterLlamaSession(...args);
const ensureRagEmbeddingOllamaReady = (...args) => startupTools.ensureRagEmbeddingOllamaReady(...args);
const closeRagOllamaSession = (...args) => startupTools.closeRagOllamaSession(...args);
const resolveActiveRagBucket = (options = {}) => ragBuckets.resolveActiveRagBucket({
  options,
  config: codingTerminalCommon.getConfig(),
  projectPath: codingTerminalCommon.getProject()
});
const runtimeHandlers = createIpcRuntimeHandlers({
  codingTerminalCommon,
  pipelineTools,
  deterministicRegistryTools: deterministicRegistry,
  normalizeCodingInferenceBackend,
  getCodingInferenceBackend,
  sendInferenceMessage,
  getRuntimeContext: () => runtimeContext,
  inferenceManager,
  startupTools,
  ensureTerminalOllamaReady,
  ensureTerminalLlamaReady,
  closeTerminalOllamaSession,
  closeRouterOllamaSession,
  closeTerminalLlamaSession,
  closeRouterLlamaSession,
  closeRagOllamaSession
});
const readinessTools = createReadinessTools({
  getBackend: () => getCodingInferenceBackend(),
  ensureTerminalOllamaReady,
  ensureRagEmbeddingOllamaReady,
  startupTools,
  ragEngine,
  gitIntegration,
  securityLayer,
  getFlags: () => ({ ragReady, gitReady, securityReady }),
  setFlags: (next = {}) => {
    if (Object.prototype.hasOwnProperty.call(next, 'ragReady')) ragReady = !!next.ragReady;
    if (Object.prototype.hasOwnProperty.call(next, 'gitReady')) gitReady = !!next.gitReady;
    if (Object.prototype.hasOwnProperty.call(next, 'securityReady')) securityReady = !!next.securityReady;
  }
});
const { ensureRagReady, ensureGitReady, ensureSecurityReady, checkPermission } = readinessTools;
const groundingTools = createGroundingTools({
  codingTerminalCommon,
  ragEngine,
  resolveActiveRagBucket,
  fs,
  path,
  crypto,
  maxExactFileBytes: 200 * 1024,
  exactContextTtlMs: 20 * 60 * 1000
});
const groundingProofTools = createGroundingProofTools({
  withTimeout,
  getBackend: () => getCodingInferenceBackend(),
  getRuntimeContext: () => runtimeContext,
  ollamaManager,
  inferenceManager,
  groundingTools,
  keepAlive: OLLAMA_KEEP_ALIVE,
  rewriteRetryPrompt: GROUNDED_FILE_REWRITE_RETRY_PROMPT
});
const { formatGroundingProofFooter, retryGroundedRewrite } = groundingProofTools;
let cliAgentPostProcessHook = async ({ text }) => ({ text: String(text || ''), executed: 0 });
const streamTools = createStreamTools({
  http,
  codingTerminalCommon,
  groundingTools,
  activeStreamRequests,
  OLLAMA_KEEP_ALIVE,
  formatGroundingProofFooter,
  retryGroundedRewrite,
  postProcessAssistantText: async (payload = {}) => cliAgentPostProcessHook(payload)
});
const modelTools = createModelTools({
  codingTerminalCommon,
  catalogManager,
  blobMapper,
  ollamaManager: {
    listModels: (options = {}) => {
      const backend = getCodingInferenceBackend();
      if (backend !== 'ollama') {
        return inferenceManager.listModels(runtimeContext.appDir, options);
      }
      return ollamaManager.listModels(options);
    },
    sendMessage: (modelName, messages, options = {}) => {
      const backend = getCodingInferenceBackend();
      if (backend !== 'ollama') {
        return inferenceManager.sendMessage(runtimeContext.appDir, modelName, messages, options);
      }
      return ollamaManager.sendMessage(modelName, messages, options);
    }
  },
  fs,
  path,
  http,
  crypto,
  withTimeout,
  ensureTerminalOllamaReady,
  ensureTerminalLlamaReady,
  swapTerminalLlamaModel,
  closeTerminalLlamaSession,
  ensureRouterOllamaReady,
  ensureRouterLlamaReady,
  getTerminalOllamaPort: () => startupTools.getTerminalOllamaPort(),
  getRouterOllamaPort: () => startupTools.getRouterOllamaPort(),
  getRouterLlamaPort: () => startupTools.getRouterLlamaPort(),
  listInferenceModels,
  sendInferenceMessage,
  getRuntimeContext: () => runtimeContext,
  getMergedFilename,
  sanitizeAssistantText: streamTools.sanitizeAssistantText,
  OLLAMA_KEEP_ALIVE,
  defaultRouterModel: DEFAULT_ROUTER_MODEL,
  routerSystemPrompt: ROUTER_SYSTEM_PROMPT,
  getInferenceBackend: getCodingInferenceBackend,
  pipelineTools
});
const editorTools = createEditorTools({
  codingTerminalCommon,
  fs,
  path
});
const deterministicHelpers = createDeterministicHelpers({
  fs,
  path,
  execFileSync,
  appendPipelineEvent: (event) => pipelineTools.appendPipelineEvent(event),
  setLatestPlanContract: (contract) => codingTerminalCommon.setLatestPlanContract?.(contract),
  getLatestPlanContract: () => codingTerminalCommon.getLatestPlanContract?.(),
  startPlanRun: (contract) => codingTerminalCommon.startPlanRun?.(contract),
  getPlanRun: (runId) => codingTerminalCommon.getPlanRun?.(runId),
  getLatestPlanRun: () => codingTerminalCommon.getLatestPlanRun?.(),
  listPlanRuns: (limit) => codingTerminalCommon.listPlanRuns?.(limit),
  updatePlanRunStep: (runId, stepId, patch) => codingTerminalCommon.updatePlanRunStep?.(runId, stepId, patch),
  resolveExecutablePlanStep: (runId, stepId) => codingTerminalCommon.resolveExecutablePlanStep?.(runId, stepId),
  setPlanRunStatus: (runId, status) => codingTerminalCommon.setPlanRunStatus?.(runId, status)
});
const gitCliTools = createGitCliTools({
  fs,
  path,
  execFile,
  codingTerminalPlatform,
  getAppDir: () => runtimeContext?.appDir || null
});
const {
  wantsGroundedFullFileOutput,
  isProjectFilenameVerificationRequest,
  buildProjectRootFileEvidence,
  buildDeterministicProjectFilenameVerification,
  buildDeterministicReplacementApply,
  buildDeterministicIntegrationFixApply,
  buildDeterministicPlanCreate,
  buildDeterministicPlanValidate,
  buildDeterministicPlanExecuteStep,
  buildDeterministicPlanVerify,
  buildDeterministicPlanRunStart,
  buildDeterministicPlanRunStep,
  buildDeterministicPlanRunAuto,
  buildDeterministicPlanRunStatus,
  buildDeterministicPlanRunVerify,
  buildDeterministicToolRunTests,
  buildDeterministicToolReadFile,
  buildDeterministicToolWriteFile,
  buildDeterministicToolVerify,
  applyRouterRewriteToHistory,
  getEffectiveUserMessage
} = deterministicHelpers;
const cliAgentTools = createCliAgentTools({
  getConfig: () => (codingTerminalCommon.getConfig ? codingTerminalCommon.getConfig() : {}),
  getProjectPath: () => (codingTerminalCommon.getProject ? codingTerminalCommon.getProject() : ''),
  appendPipelineEvent: (event) => pipelineTools.appendPipelineEvent(event),
  buildDeterministicToolRunTests,
  buildDeterministicToolReadFile,
  buildDeterministicToolWriteFile,
  buildDeterministicToolVerify
});
cliAgentPostProcessHook = cliAgentTools.postProcessAssistantText;
const { buildGitArgs, runGitCli } = gitCliTools;
const routerTools = createRouterTools({
  streamTools,
  withTimeout,
  getCodingInferenceBackend,
  ensureRouterLlamaReady,
  ensureRouterOllamaReady,
  listInferenceModels,
  sendInferenceMessage,
  resolveConfiguredModel: modelTools.resolveConfiguredModel,
  getRouterLlamaPort: () => startupTools.getRouterLlamaPort(),
  getRouterOllamaPort: () => startupTools.getRouterOllamaPort(),
  getDefaultRouterModel: () => DEFAULT_ROUTER_MODEL,
  getKeepAlive: () => OLLAMA_KEEP_ALIVE,
  getConfig: () => (codingTerminalCommon.getConfig ? codingTerminalCommon.getConfig() : {}),
  crypto
});
const {
  normalizeRouterModeConfig,
  shortHash,
  buildGenerationOptions,
  isRouterSmalltalkPrompt,
  runRouterSmalltalkTurn,
  runRouterDirectTurn,
  getChatDispatchMode
} = routerTools;
const ragFallbackTools = createRagFallbackTools({
  fs,
  ragEngine,
  ensureRagReady,
  checkPermission,
  resolveActiveRagBucket,
  withTimeout,
  getConfig: () => (codingTerminalCommon.getConfig ? codingTerminalCommon.getConfig() : {}),
  generateId: () => codingTerminalCommon.generateId(),
  sourceIndexPath: RAG_SOURCE_INDEX_PATH
});
const { summarizeRagSources, ragDebugLog, tryGetRagContext } = ragFallbackTools;
const chatPrepareTool = createChatPrepareTool({
  getCodingInferenceBackend,
  ensureTerminalLlamaReady,
  ensureTerminalOllamaReady,
  getTerminalOllamaPort: () => startupTools.getTerminalOllamaPort(),
  getTerminalLlamaPort: () => startupTools.getTerminalLlamaPort(),
  withTimeout,
  listInferenceModels,
  modelTools,
  ragDebugLog,
  codingTerminalCommon,
  getChatDispatchMode,
  pipelineTools,
  normalizeRouterModeConfig,
  isRouterSmalltalkPrompt,
  runRouterSmalltalkTurn,
  shortHash,
  groundingTools,
  wantsGroundedFullFileOutput,
  CODING_INSPECT_PROMPT,
  CODING_GENERATE_PROMPT,
  CODING_SYSTEM_PROMPT,
  GROUNDED_FILE_ANALYSIS_PROMPT,
  GROUNDED_FILE_FULL_REWRITE_PROMPT,
  GROUNDED_FILE_REWRITE_PROMPT,
  isProjectFilenameVerificationRequest,
  buildProjectRootFileEvidence,
  buildDeterministicProjectFilenameVerification,
  buildDeterministicReplacementApply,
  buildDeterministicIntegrationFixApply,
  buildDeterministicPlanCreate,
  buildDeterministicPlanValidate,
  buildDeterministicPlanExecuteStep,
  buildDeterministicPlanVerify,
  buildDeterministicPlanRunStart,
  buildDeterministicPlanRunStep,
  buildDeterministicPlanRunAuto,
  buildDeterministicPlanRunStatus,
  buildDeterministicPlanRunVerify,
  buildDeterministicToolRunTests,
  buildDeterministicToolReadFile,
  buildDeterministicToolWriteFile,
  buildDeterministicToolVerify,
  tryGetRagContext,
  runRouterDirectTurn,
  applyRouterRewriteToHistory,
  getEffectiveUserMessage,
  summarizeRagSources,
  buildGenerationOptions
});

function setRuntimeContext(ctx = {}) {
  runtimeContext = {
    ...runtimeContext,
    ...ctx
  };
}

function registerHandlers() {
  // Chat/completion handlers
  codingTerminalIpcChat.registerChatHandlers({
    register,
    codingTerminalCommon,
    constants: {
      CODING_SYSTEM_PROMPT,
      CODING_INSPECT_PROMPT,
      CODING_GENERATE_PROMPT,
      GROUNDED_FILE_ANALYSIS_PROMPT,
      OLLAMA_KEEP_ALIVE
    },
    deps: {
      tryHandleDeterministicFileRequest: groundingTools.tryHandleDeterministicFileRequest,
      getChatDispatchMode,
      formatGroundingProofFooter,
      ensureTerminalOllamaReady,
      getTerminalOllamaPort: () => startupTools.getTerminalOllamaPort(),
      getTerminalLlamaPort: () => startupTools.getTerminalLlamaPort(),
      withTimeout,
      ollamaManager: {
        sendMessage: (modelName, messages, options = {}) => sendInferenceMessage(modelName, messages, options)
      },
      inferenceManager,
      getInferenceBackend: getCodingInferenceBackend,
      resolveConfiguredModel: modelTools.resolveConfiguredModel,
      extractFileMentions: groundingTools.extractFileMentions,
      tryGetExactFileContext: groundingTools.tryGetExactFileContext,
      buildExactFileResolutionError: groundingTools.buildExactFileResolutionError,
      isGroundedFileAnalysisRequest: groundingTools.isGroundedFileAnalysisRequest,
      tryGetRagContext,
      validateGroundedAnalysis: groundingTools.validateGroundedAnalysis,
      buildGroundingFailureMessage: groundingTools.buildGroundingFailureMessage,
      retryGroundedRewrite,
      applyCliAgentContext: (prepared) => cliAgentTools.applyCliAgentContext(prepared),
      postProcessAssistantText: async (payload = {}) => cliAgentTools.postProcessAssistantText(payload),
      runCliAgentAutonomousTurn: async (payload = {}) => cliAgentTools.runAutonomousTurn(payload),
      prepareChatRequest,
      streamFromBackend: streamTools.streamFromBackend,
      getActiveStreamRequests: () => activeStreamRequests
    }
  });
  
  // Project handlers
  register('coding-terminal:set-project', editorTools.handleSetProject);
  register('coding-terminal:get-project', editorTools.handleGetProject);
  register('coding-terminal:editor-list-files', editorTools.handleEditorListFiles);
  register('coding-terminal:editor-read-file', editorTools.handleEditorReadFile);
  register('coding-terminal:editor-save-file', editorTools.handleEditorSaveFile);
  register('coding-terminal:list-models', modelTools.handleListModels);
  register('coding-terminal:select-model', modelTools.handleSelectModel);
  register('coding-terminal:list-router-models', modelTools.handleListRouterModels);
  register('coding-terminal:select-router-model', modelTools.handleSelectRouterModel);
  register('coding-terminal:list-dispatcher-models', modelTools.handleListDispatcherModels);
  register('coding-terminal:select-dispatcher-model', modelTools.handleSelectDispatcherModel);
  
  // RAG handlers (delegated to rag-engine)
  codingTerminalIpcRag.registerRagHandlers({
    register,
    codingTerminalCommon,
    ragEngine,
    ensureRagReady,
    checkPermission,
    resolveActiveRagBucket
  });
  
  // Git handlers (delegated to git-integration)
  codingTerminalIpcGit.registerGitHandlers({
    register,
    codingTerminalCommon,
    gitIntegration,
    ensureGitReady,
    checkPermission,
    withTimeout,
    buildGitArgs,
    runGitCli
  });
  
  // Config handlers
  register('coding-terminal:get-config', runtimeHandlers.handleGetConfig);
  register('coding-terminal:update-config', runtimeHandlers.handleUpdateConfig);
  register('coding-terminal:get-pipeline-events', runtimeHandlers.handleGetPipelineEvents);
  register('coding-terminal:get-plan-runs', runtimeHandlers.handleGetPlanRuns);
  register('coding-terminal:get-deterministic-registry', runtimeHandlers.handleGetDeterministicRegistry);
  register('coding-terminal:get-inference-backend', runtimeHandlers.handleGetInferenceBackend);
  register('coding-terminal:set-inference-backend', runtimeHandlers.handleSetInferenceBackend);
  register('coding-terminal:send-inference-messages', runtimeHandlers.handleSendInferenceMessages);
  
  console.log(`[CodingTerminal:IPC] Registered ${registeredChannels.length} handlers`);
}

function unregisterHandlers() {
  registeredChannels.forEach(channel => {
    ipcMain.removeHandler(channel);
  });
  for (const req of activeStreamRequests.values()) {
    try { req.destroy(new Error('Coding Terminal shutdown')); } catch {}
  }
  activeStreamRequests.clear();
  registeredChannels.length = 0;
  closeTerminalOllamaSession().catch((err) => {
    console.error('[CodingTerminal:IPC] Failed to close BMOC terminal session:', err.message);
  });
  closeTerminalLlamaSession().catch((err) => {
    console.error('[CodingTerminal:IPC] Failed to close BMOC llama.cpp session:', err.message);
  });
  closeRouterOllamaSession().catch((err) => {
    console.error('[CodingTerminal:IPC] Failed to close BMOC router session:', err.message);
  });
  closeRouterLlamaSession().catch((err) => {
    console.error('[CodingTerminal:IPC] Failed to close BMOC llama.cpp router session:', err.message);
  });
  closeRagOllamaSession().catch((err) => {
    console.error('[CodingTerminal:IPC] Failed to close BMOC RAG embedding session:', err.message);
  });
  console.log('[CodingTerminal:IPC] All handlers unregistered');
}

function register(channel, handler) {
  ipcMain.handle(channel, handler);
  registeredChannels.push(channel);
}

async function prepareChatRequest(message, options = {}) {
  return chatPrepareTool.prepareChatRequest(message, options);
}

module.exports = {
  setRuntimeContext,
  registerHandlers,
  unregisterHandlers,
  closeTerminalOllamaSession,
  closeTerminalLlamaSession,
  closeRouterOllamaSession,
  closeRouterLlamaSession
};
