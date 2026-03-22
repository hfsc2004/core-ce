/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */

const path = require('path');
const {
  createPortPools,
  isPortAvailable: isPortAvailableImpl,
  allocatePort: allocatePortFromPool,
  releasePort: releasePortToPool,
  clearAllPools
} = require('./modules/session-manager-standard/session-manager-standard-ports');
const {
  waitForOllamaHealth: waitForOllamaHealthImpl,
  waitForWebUIReady: waitForWebUIReadyImpl,
  waitForAnythingLLMReady: waitForAnythingLLMReadyImpl
} = require('./modules/session-manager-standard/session-manager-standard-health');
const {
  killProcess: killProcessImpl,
  killProcessGroup: killProcessGroupImpl
} = require('./modules/session-manager-standard/session-manager-standard-process');
const {
  getOllamaBinaryPath: resolveOllamaBinaryPath,
  getWebUIBinaryPath: resolveWebUIBinaryPath,
  findAnythingLLMInstallation: resolveAnythingLLMInstallation,
  createAnythingLLMEnvFiles: createAnythingLLMEnvFilesImpl
} = require('./modules/session-manager-standard/session-manager-standard-paths');
const createStandardTerminalSessionManager = require('./modules/session-manager-standard/session-manager-standard-terminal');
const createStandardWebuiSessionManager = require('./modules/session-manager-standard/session-manager-standard-webui');
const createStandardAnythingLLMSessionManager = require('./modules/session-manager-standard/session-manager-standard-anythingllm');
const createStandardStatusLegacyManager = require('./modules/session-manager-standard/session-manager-standard-status-legacy');
const createStandardSessionRegistry = require('./modules/session-manager-standard/session-manager-standard-registry');

// CONFIGURATION - Consumer Edition Limits

const MAX_CONCURRENT_SESSIONS = 3;

// PORT POOL CONFIGURATION - Segregated by Service Type

const PORT_POOLS = createPortPools();

// SESSION TRACKING - Map of sessionId -> session details

// Active sessions: sessionId -> { type, ollamaPort, ollamaPID, servicePort, servicePID, ... }
const activeSessions = new Map();

// Session ID counter
let sessionIdCounter = 0;

// Module-level path configuration (set via init)
let _appDir = null;
let _modelsDir = null;
let _binariesDir = null;

// INITIALIZATION

function init(appDir) {
  _appDir = appDir;
  _modelsDir = path.join(appDir, '..', 'models');
  _binariesDir = path.join(appDir, '..', 'binaries');
  
  console.log('[BMOC-Lite] ════════════════════════════════════════════════════════');
  console.log('[BMOC-Lite] Standard Edition Session Manager Initialized');
  console.log('[BMOC-Lite] THE BOSS - Sole authority for all sessions');
  console.log('[BMOC-Lite] ════════════════════════════════════════════════════════');
  console.log('[BMOC-Lite] App dir:', _appDir);
  console.log('[BMOC-Lite] Models dir:', _modelsDir);
  console.log('[BMOC-Lite] Binaries dir:', _binariesDir);
  console.log('[BMOC-Lite] Max concurrent sessions:', MAX_CONCURRENT_SESSIONS);
  console.log('[BMOC-Lite] Port pools:');
  console.log(`[BMOC-Lite]   Terminal Ollama:     ${PORT_POOLS.terminalOllama.start}-${PORT_POOLS.terminalOllama.end}`);
  console.log(`[BMOC-Lite]   WebUI Ollama:        ${PORT_POOLS.webuiOllama.start}-${PORT_POOLS.webuiOllama.end}`);
  console.log(`[BMOC-Lite]   WebUI Service:       ${PORT_POOLS.webuiService.start}-${PORT_POOLS.webuiService.end}`);
  console.log(`[BMOC-Lite]   AnythingLLM Ollama:  ${PORT_POOLS.anythingllmOllama.start}-${PORT_POOLS.anythingllmOllama.end}`);
  console.log(`[BMOC-Lite]   AnythingLLM Service: ${PORT_POOLS.anythingllmService.start}-${PORT_POOLS.anythingllmService.end}`);
  console.log('[BMOC-Lite] ════════════════════════════════════════════════════════');
}

// PORT ALLOCATION - From Segregated Pools

async function isPortAvailable(port) {
  return isPortAvailableImpl(port);
}

async function allocatePort(poolName, owner) {
  return allocatePortFromPool(PORT_POOLS, poolName, owner, console);
}

function releasePort(poolName, port) {
  return releasePortToPool(PORT_POOLS, poolName, port, console);
}

// SESSION LIMIT ENFORCEMENT

function canStartSession() {
  const count = activeSessions.size;
  
  if (count >= MAX_CONCURRENT_SESSIONS) {
    return {
      allowed: false,
      message: `Session limit reached (${count}/${MAX_CONCURRENT_SESSIONS}). Please close an existing session before starting a new one.`
    };
  }
  
  return {
    allowed: true,
    message: `Session allowed (${count + 1}/${MAX_CONCURRENT_SESSIONS})`
  };
}

function generateSessionId(type) {
  sessionIdCounter++;
  return `${type}-${Date.now()}-${sessionIdCounter}`;
}

// HEALTH CHECKS

async function waitForOllamaHealth(port, timeout = 45000) {
  return waitForOllamaHealthImpl(port, timeout);
}

async function waitForWebUIReady(port, timeout = 120000) {
  return waitForWebUIReadyImpl(port, timeout);
}

// PROCESS MANAGEMENT

async function killProcess(pid, name) {
  return killProcessImpl(pid, name, console);
}

function getOllamaBinaryPath() {
  return resolveOllamaBinaryPath(_binariesDir);
}

function getWebUIBinaryPath() {
  return resolveWebUIBinaryPath(_binariesDir);
}

// TERMINAL SESSION MANAGEMENT

async function startTerminalSession() {
  if (!_appDir) {
    return { success: false, message: 'BMOC-Lite not initialized. Call init() first.' };
  }
  return getTerminalSessionManager().startTerminalSession();
}

async function closeTerminalSession(sessionId) {
  return getTerminalSessionManager().closeTerminalSession(sessionId);
}

// WEBUI SESSION MANAGEMENT

let _terminalSessionManager = null;
let _webuiSessionManager = null;
let _anythingSessionManager = null;
let _sessionRegistry = null;
let _statusLegacyManager = null;

function getTerminalSessionManager() {
  if (_terminalSessionManager) return _terminalSessionManager;
  _terminalSessionManager = createStandardTerminalSessionManager({
    activeSessions,
    canStartSession,
    getModelsDir: () => _modelsDir,
    getOllamaBinaryPath,
    allocatePort,
    releasePort,
    generateSessionId,
    waitForOllamaHealth,
    killProcess,
    closeSession: (sessionId) => closeSession(sessionId)
  });
  return _terminalSessionManager;
}

function getWebuiSessionManager() {
  if (_webuiSessionManager) return _webuiSessionManager;
  _webuiSessionManager = createStandardWebuiSessionManager({
    activeSessions,
    canStartSession,
    getModelsDir: () => _modelsDir,
    getOllamaBinaryPath,
    getWebUIBinaryPath,
    allocatePort,
    releasePort,
    generateSessionId,
    waitForOllamaHealth,
    waitForWebUIReady,
    killProcess,
    closeWebUISession: (sessionId) => closeWebUISession(sessionId)
  });
  return _webuiSessionManager;
}

function getAnythingSessionManager() {
  if (_anythingSessionManager) return _anythingSessionManager;
  _anythingSessionManager = createStandardAnythingLLMSessionManager({
    activeSessions,
    canStartSession,
    getModelsDir: () => _modelsDir,
    getOllamaBinaryPath,
    findAnythingLLMInstallation,
    createAnythingLLMEnvFiles,
    allocatePort,
    releasePort,
    generateSessionId,
    waitForOllamaHealth,
    waitForAnythingLLMReady,
    killProcess,
    killProcessGroup,
    closeAnythingLLMSession: (sessionId) => closeAnythingLLMSession(sessionId)
  });
  return _anythingSessionManager;
}

function getSessionRegistry() {
  if (_sessionRegistry) return _sessionRegistry;
  _sessionRegistry = createStandardSessionRegistry({
    activeSessions,
    closeTerminalSession: (sessionId) => closeTerminalSession(sessionId),
    closeWebUISession: (sessionId) => closeWebUISession(sessionId),
    closeAnythingLLMSession: (sessionId) => closeAnythingLLMSession(sessionId)
  });
  return _sessionRegistry;
}

function getStatusLegacyManager() {
  if (_statusLegacyManager) return _statusLegacyManager;
  _statusLegacyManager = createStandardStatusLegacyManager({
    MAX_CONCURRENT_SESSIONS,
    PORT_POOLS,
    getAllSessions,
    getSessionsByType,
    closeSession,
    clearAllPools,
    startTerminalSession,
    closeTerminalSession,
    startWebUISession,
    closeWebUISession,
    startAnythingLLMSession,
    closeAnythingLLMSession
  });
  return _statusLegacyManager;
}

async function startWebUISession() {
  if (!_appDir) {
    return { success: false, message: 'BMOC-Lite not initialized. Call init() first.' };
  }
  return getWebuiSessionManager().startWebUISession();
}

async function closeWebUISession(sessionId) {
  return getWebuiSessionManager().closeWebUISession(sessionId);
}

// ANYTHINGLLM SESSION MANAGEMENT

async function startAnythingLLMSession() {
  if (!_appDir) {
    return { success: false, message: 'BMOC-Lite not initialized. Call init() first.' };
  }
  return getAnythingSessionManager().startAnythingLLMSession();
}

function findAnythingLLMInstallation() {
  return resolveAnythingLLMInstallation(_binariesDir);
}

function createAnythingLLMEnvFiles(basePath, ollamaPort, serverPort) {
  createAnythingLLMEnvFilesImpl(basePath, ollamaPort, serverPort);
  console.log(`[BMOC-Lite] Created AnythingLLM .env files (Ollama: ${ollamaPort}, Server: ${serverPort})`);
}

async function waitForAnythingLLMReady(port, timeout = 90000) {
  return waitForAnythingLLMReadyImpl(port, timeout);
}

async function closeAnythingLLMSession(sessionId) {
  return getAnythingSessionManager().closeAnythingLLMSession(sessionId);
}

async function killProcessGroup(pid, name) {
  return killProcessGroupImpl(pid, name, console);
}

// GENERIC SESSION MANAGEMENT

async function closeSession(sessionId) {
  return getSessionRegistry().closeSession(sessionId);
}

function getSession(sessionId) {
  return getSessionRegistry().getSession(sessionId);
}

function getAllSessions() {
  return getSessionRegistry().getAllSessions();
}

function getSessionsByType(type) {
  return getSessionRegistry().getSessionsByType(type);
}

// STATUS & UTILITIES

function getStatus() {
  return getStatusLegacyManager().getStatus();
}

async function shutdownAll() {
  return getStatusLegacyManager().shutdownAll();
}

// LEGACY COMPATIBILITY LAYER
// These functions provide backward compatibility with old code

async function startOllama() {
  return getStatusLegacyManager().startOllama();
}

async function stopOllama() {
  return getStatusLegacyManager().stopOllama();
}

async function startWebUI() {
  return getStatusLegacyManager().startWebUI();
}

async function stopWebUI() {
  return getStatusLegacyManager().stopWebUI();
}

async function startAnythingLLM() {
  return getStatusLegacyManager().startAnythingLLM();
}

async function stopAnythingLLM() {
  return getStatusLegacyManager().stopAnythingLLM();
}

function getOllamaPort() {
  return getStatusLegacyManager().getOllamaPort();
}

function getOllamaStatus() {
  return getStatusLegacyManager().getOllamaStatus();
}

// MODULE EXPORTS

module.exports = {
  // Initialization
  init,
  
  // Session Management (NEW API)
  startTerminalSession,
  closeTerminalSession,
  startWebUISession,
  closeWebUISession,
  startAnythingLLMSession,
  closeAnythingLLMSession,
  
  // Generic session operations
  closeSession,
  getSession,
  getAllSessions,
  getSessionsByType,
  canStartSession,
  
  // Status & Utilities
  getStatus,
  shutdownAll,
  
  // Constants
  MAX_CONCURRENT_SESSIONS,
  PORT_POOLS,
  
  // Legacy compatibility (DEPRECATED - will be removed in future versions)
  startOllama,
  stopOllama,
  startWebUI,
  stopWebUI,
  startAnythingLLM,
  stopAnythingLLM,
  getOllamaPort,
  getOllamaStatus,
  getAllStatus: getStatus
};
