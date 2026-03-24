// session-manager.js
// Version: 1.1.2

const createSessionGpuMonitor = require('./session-manager-gpu-monitor');
const {
  isProcessRunning,
  killProcess,
  killProcessesOnPort
} = require('./session-manager-process-utils');
const {
  normalizeServiceType: normalizeServiceTypeValue,
  generateSessionId: generateSessionIdValue,
  getOllamaPortForService: getOllamaPortForServiceValue,
  hasActiveSession: hasActiveSessionValue,
  getActiveSessionsForService: getActiveSessionsForServiceValue,
  getSessionCount: getSessionCountValue,
  getSessionStats: getSessionStatsValue,
  getSessionSummary: getSessionSummaryValue
} = require('./session-manager-session-utils');
const createSessionServiceLauncher = require('./session-manager-service-launcher');
const createSessionStateManager = require('./session-manager-state');
const createSessionManagerDeterministic = require('./session-manager-deterministic');
const createSessionManagerMoe = require('./session-manager-moe');
const attachments = require('./attachments');

const sessionState = createSessionStateManager({
  processUtils: {
    isProcessRunning,
    killProcess,
    killProcessesOnPort
  },
  sessionUtils: {
    normalizeServiceType: normalizeServiceTypeValue,
    generateSessionId: generateSessionIdValue,
    getOllamaPortForService: getOllamaPortForServiceValue,
    hasActiveSession: hasActiveSessionValue,
    getActiveSessionsForService: getActiveSessionsForServiceValue,
    getSessionCount: getSessionCountValue,
    getSessionStats: getSessionStatsValue,
    getSessionSummary: getSessionSummaryValue
  }
});

const deterministic = createSessionManagerDeterministic();
const gpuMonitorManager = createSessionGpuMonitor();
const attachmentStore = attachments.createAttachmentStore({
  baseDir: require('path').join(__dirname, '..', '..', '.psf', 'attachments')
});

const serviceLauncher = createSessionServiceLauncher({
  normalizeServiceType: normalizeServiceTypeValue,
  registerSession: (config) => sessionState.registerSession(config),
  getRuntimeContext: () => ({ APP_PATH: sessionState.getAppPath() })
});

const moe = createSessionManagerMoe({
  startOllamaForService,
  startLlamaCppForService,
  closeSession,
  registerSession: (config) => sessionState.registerSession(config),
  getSession: (sessionId) => sessionState.getSession(sessionId),
  removeSession: (sessionId) => sessionState.removeSession(sessionId),
  getDeterministicRuntime: () => deterministic.initializeDeterministicTools(),
  getAttachmentStore: () => attachmentStore
});

function initialize(appPath) {
  const sessionsFile = sessionState.initialize(appPath);

  console.log('[Session Manager] ═══════════════════════════════════════════════════════');
  console.log('[Session Manager] BMOC initialized - Sole authority for all sessions');
  console.log('[Session Manager] Storage:', sessionsFile);
  console.log('[Session Manager] ═══════════════════════════════════════════════════════');

  sessionState.loadSessions();
  deterministic.initializeDeterministicTools();
  sessionState.validateSessions();
}

async function startOllamaForService(serviceType, appPath, gpuInfo) {
  return serviceLauncher.startOllamaForService(serviceType, appPath, gpuInfo);
}

async function startLlamaCppForService(serviceType, appPath, options = {}) {
  return serviceLauncher.startLlamaCppForService(serviceType, appPath, options);
}

function getOllamaPortForService(serviceType) {
  return sessionState.getOllamaPortForService(serviceType);
}

function hasActiveSession(serviceType) {
  return sessionState.hasActiveSession(serviceType);
}

function getActiveSessionsForService(serviceType) {
  return sessionState.getActiveSessionsForService(serviceType);
}

function registerSession(config) {
  return sessionState.registerSession(config);
}

async function closeSession(sessionId, portPools) {
  return sessionState.closeSession(sessionId, portPools);
}

function updateSession(sessionId, updates) {
  return sessionState.updateSession(sessionId, updates);
}

function getSession(sessionId) {
  return sessionState.getSession(sessionId);
}

function getAllSessions() {
  return sessionState.getAllSessions();
}

function getSessionsByType(type) {
  return sessionState.getSessionsByType(type);
}

async function closeSessionsByType(type, portPools) {
  return sessionState.closeSessionsByType(type, portPools);
}

async function closeAllSessions(portPools) {
  return sessionState.closeAllSessions(portPools);
}

function getSessionCount() {
  return sessionState.getSessionCount();
}

function getSessionStats() {
  return sessionState.getSessionStats();
}

function getSessionSummary() {
  return sessionState.getSessionSummary();
}

async function validateSessions() {
  return sessionState.validateSessions();
}

async function deployMoEPipeline(pipelineConfig, appPath, gpuInfo) {
  return moe.deployMoEPipeline(pipelineConfig, appPath, gpuInfo);
}

function getMoEStatus() {
  return moe.getMoEStatus();
}

async function teardownMoEPipeline() {
  return moe.teardownMoEPipeline();
}

function saveMoEPipelineConfig(pipelineConfig, appPath, options = {}) {
  return moe.saveMoEPipelineConfig(pipelineConfig, appPath, options);
}

function loadMoEPipelineConfig(appPath, options = {}) {
  return moe.loadMoEPipelineConfig(appPath, options);
}

function listMoEPipelineConfigs(appPath) {
  return moe.listMoEPipelineConfigs(appPath);
}

function deleteMoEPipelineConfig(appPath, options = {}) {
  return moe.deleteMoEPipelineConfig(appPath, options);
}

async function routeMoEMessage(message, options = {}) {
  return moe.routeMoEMessage(message, options);
}

async function sendToMoEAgent(agentId, message, options = {}) {
  return moe.sendToMoEAgent(agentId, message, options);
}

async function pingMoEAgents() {
  return moe.pingMoEAgents();
}

async function rerunLastMoEIrg(options = {}) {
  return moe.rerunLastMoEIrg(options);
}

async function runMoEIrgContract(contract, options = {}) {
  return moe.runMoEIrgContract(contract, options);
}

function listMoESerialPorts() {
  return moe.listMoESerialPorts();
}

function listDeterministicTools() {
  return deterministic.listDeterministicTools();
}

async function executeDeterministicTool(toolName, args = {}, context = {}, options = {}) {
  return deterministic.executeDeterministicTool(toolName, args, context, options);
}

function getDeterministicToolTraces(limit = 100) {
  return deterministic.getDeterministicToolTraces(limit);
}

function clearDeterministicToolTraces() {
  return deterministic.clearDeterministicToolTraces();
}

function getDeterministicToolPolicy() {
  return deterministic.getDeterministicToolPolicy();
}

function setDeterministicToolPolicy(policy = {}) {
  return deterministic.setDeterministicToolPolicy(policy);
}

function listDeterministicToolPolicyPresets() {
  return deterministic.listDeterministicToolPolicyPresets();
}

function applyDeterministicToolPolicyPreset(presetName) {
  return deterministic.applyDeterministicToolPolicyPreset(presetName);
}

function startGpuMonitor(callback) {
  return gpuMonitorManager.startGpuMonitor(callback);
}

function stopGpuMonitor() {
  return gpuMonitorManager.stopGpuMonitor();
}

function isGpuMonitorRunning() {
  return gpuMonitorManager.isGpuMonitorRunning();
}

module.exports = {
  initialize,
  startOllamaForService,
  startLlamaCppForService,
  getOllamaPortForService,
  hasActiveSession,
  getActiveSessionsForService,
  registerSession,
  closeSession,
  updateSession,
  getSession,
  getAllSessions,
  getSessionsByType,
  closeSessionsByType,
  closeAllSessions,
  getSessionCount,
  getSessionStats,
  getSessionSummary,
  validateSessions,
  deployMoEPipeline,
  getMoEStatus,
  teardownMoEPipeline,
  saveMoEPipelineConfig,
  loadMoEPipelineConfig,
  listMoEPipelineConfigs,
  deleteMoEPipelineConfig,
  routeMoEMessage,
  sendToMoEAgent,
  pingMoEAgents,
  rerunLastMoEIrg,
  runMoEIrgContract,
  listMoESerialPorts,
  listDeterministicTools,
  executeDeterministicTool,
  getDeterministicToolTraces,
  clearDeterministicToolTraces,
  getDeterministicToolPolicy,
  setDeterministicToolPolicy,
  listDeterministicToolPolicyPresets,
  applyDeterministicToolPolicyPreset,
  startGpuMonitor,
  stopGpuMonitor,
  isGpuMonitorRunning
};
