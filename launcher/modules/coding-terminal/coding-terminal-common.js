/**
 * PSF Coding Terminal - Common Utilities
 * Shared functions and state management
 * 
 * @module coding-terminal-common
 * @version 1.1.2 - March 5, 2026
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sessionMemory = require('../session-memory');
const settingsManager = require('../settings-manager');

// Shared state
let config = {
  defaultWidth: 1500,
  defaultHeight: 900,
  minWidth: 1000,
  minHeight: 620,
  dockedWidthPercent: 0.4,  // 40% of main window when docked
  theme: 'dark',
  terminalId: '',
  modelName: '',
  coderFallbackEnabled: false,
  coderFallbackModelName: '',
  inferenceBackend: 'ollama',
  routerMode: 'off', // off | on
  routerEnabled: false,
  llamaCppRouterForceCpu: false,
  routerModelName: 'smollm2:135m',
  dispatcherModelName: 'smollm2:135m',
  ragEnabled: true,
  ragDebug: false,
  testMode: false,
  diffLegendEnabled: false,
  diffDisplayMode: 'raw',
  deterministicFileRead: false,
  chatMode: 'auto',
  ragBucketId: '',
  ragBucketName: '',
  ragBuckets: [],
  projectPath: '',
  routerTimeoutMs: 8000,
  dispatcherTimeoutMs: 8000,
  firstResponseTimeoutMs: 120000,
  responseTimeoutMs: 45000,
  coderSystemPrompt: '',
  routerSystemPrompt: '',
  coderTemperature: 0.2,
  coderTopP: 0.9,
  coderTopK: 40,
  coderRepeatPenalty: 1.1,
  coderNumPredict: 4096,
  coderNumCtx: 8192,
  coderSeed: null,
  routerTemperature: 0.0,
  routerTopP: 0.9,
  routerTopK: 40,
  routerRepeatPenalty: 1.1,
  routerNumPredict: 256,
  routerNumCtx: 4096,
  routerSeed: null,
  rewriteTemperature: 0.1,
  rewriteTopP: 0.85,
  rewriteTopK: 40,
  rewriteRepeatPenalty: 1.1,
  rewriteNumPredict: 4096
};

let currentProject = null;
let conversationHistory = [];
let latestPlanContract = null;
const planRuns = new Map();
let latestPlanRunId = '';
const APP_DIR = path.join(__dirname, '..', '..');
const PLAN_STATE_DIR = path.join(APP_DIR, '..', '.psf', 'coding-terminal');
const PLAN_STATE_PATH = path.join(PLAN_STATE_DIR, 'plan-runs.json');
const MAX_PLAN_RUNS = 80;
const MAX_STEP_OUTPUT_CHARS = 4000;

/**
 * Initialize common module
 */
function initialize() {
  loadConfig();
  loadPlanState();
  ensureTerminalIdentity();
  console.log('[CodingTerminal:Common] Initialized');
}

/**
 * Load configuration from disk
 */
function loadConfig() {
  try {
    const configPath = path.join(__dirname, '../../config/coding-terminal.json');
    if (fs.existsSync(configPath)) {
      const loaded = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      config = { ...config, ...loaded };
      const diffMode = String(config.diffDisplayMode || '').trim().toLowerCase();
      if (!['raw', 'simplified', 'hidden'].includes(diffMode)) {
        config.diffDisplayMode = 'raw';
      } else {
        config.diffDisplayMode = diffMode;
      }
      if (String(config.routerMode || '').toLowerCase() === 'auto') {
        config.routerMode = 'on';
        config.routerEnabled = true;
      }
      // Strict behavior: never silently switch coder models.
      config.coderFallbackEnabled = false;
      config.coderFallbackModelName = '';
      const persistedProject = String(config?.projectPath || '').trim();
      if (persistedProject && fs.existsSync(persistedProject)) {
        currentProject = persistedProject;
      } else {
        currentProject = null;
      }
    }
  } catch (err) {
    console.warn('[CodingTerminal:Common] Config load failed, using defaults:', err.message);
  }
}

/**
 * Save configuration to disk
 */
function saveConfig() {
  try {
    const configDir = path.join(__dirname, '../../config');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    const configPath = path.join(configDir, 'coding-terminal.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error('[CodingTerminal:Common] Config save failed:', err.message);
  }
}

function ensurePlanStateDir() {
  try {
    if (!fs.existsSync(PLAN_STATE_DIR)) {
      fs.mkdirSync(PLAN_STATE_DIR, { recursive: true });
    }
  } catch {}
}

function sanitizeRunForPersistence(run = {}) {
  const safe = {
    runId: String(run?.runId || '').trim(),
    createdAt: Number(run?.createdAt) || Date.now(),
    updatedAt: Number(run?.updatedAt) || Date.now(),
    goal: String(run?.goal || '').slice(0, 4000),
    finalAcceptance: String(run?.finalAcceptance || '').slice(0, 2000),
    status: String(run?.status || 'running').trim() || 'running',
    steps: []
  };
  const rawSteps = Array.isArray(run?.steps) ? run.steps : [];
  safe.steps = rawSteps.slice(0, 256).map((step, idx) => ({
    id: String(step?.id || `S${idx + 1}`).trim() || `S${idx + 1}`,
    type: String(step?.type || 'coder').trim() || 'coder',
    action: String(step?.action || '').slice(0, 4000),
    dependsOn: Array.isArray(step?.dependsOn)
      ? step.dependsOn.map((v) => String(v || '').trim()).filter(Boolean).slice(0, 16)
      : [],
    acceptance: String(step?.acceptance || '').slice(0, 4000),
    status: String(step?.status || 'pending').trim() || 'pending',
    output: String(step?.output || '').slice(0, MAX_STEP_OUTPUT_CHARS),
    completedAt: step?.completedAt ? Number(step.completedAt) : null
  }));
  return safe;
}

function prunePlanRunsInMemory() {
  if (planRuns.size <= MAX_PLAN_RUNS) return;
  const ordered = Array.from(planRuns.values())
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  planRuns.clear();
  for (const run of ordered.slice(0, MAX_PLAN_RUNS)) {
    if (!run?.runId) continue;
    planRuns.set(run.runId, run);
  }
  if (latestPlanRunId && !planRuns.has(latestPlanRunId)) {
    latestPlanRunId = ordered[0]?.runId || '';
  }
}

function savePlanState() {
  try {
    ensurePlanStateDir();
    const runs = Array.from(planRuns.values())
      .map((run) => sanitizeRunForPersistence(run))
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
      .slice(0, MAX_PLAN_RUNS);
    const payload = {
      schemaVersion: 1,
      savedAt: Date.now(),
      latestPlanRunId: String(latestPlanRunId || ''),
      latestPlanContract: latestPlanContract && typeof latestPlanContract === 'object'
        ? latestPlanContract
        : null,
      runs
    };
    fs.writeFileSync(PLAN_STATE_PATH, JSON.stringify(payload, null, 2), 'utf8');
  } catch (err) {
    console.warn('[CodingTerminal:Common] Plan state save failed:', err.message);
  }
}

function loadPlanState() {
  try {
    if (!fs.existsSync(PLAN_STATE_PATH)) return;
    const raw = fs.readFileSync(PLAN_STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    const runs = Array.isArray(parsed?.runs) ? parsed.runs : [];
    planRuns.clear();
    for (const run of runs.slice(0, MAX_PLAN_RUNS)) {
      const safe = sanitizeRunForPersistence(run);
      if (!safe.runId) continue;
      planRuns.set(safe.runId, safe);
    }
    const persistedLatestId = String(parsed?.latestPlanRunId || '').trim();
    latestPlanRunId = persistedLatestId && planRuns.has(persistedLatestId)
      ? persistedLatestId
      : (Array.from(planRuns.keys())[0] || '');
    const contract = parsed?.latestPlanContract;
    latestPlanContract = contract && typeof contract === 'object' ? contract : null;
  } catch (err) {
    console.warn('[CodingTerminal:Common] Plan state load failed:', err.message);
  }
}

/**
 * Get current configuration
 * @returns {Object} Configuration object
 */
function getConfig() {
  return { ...config };
}

/**
 * Update configuration
 * @param {Object} updates - Configuration updates
 */
function updateConfig(updates) {
  config = { ...config, ...updates };
  saveConfig();
}

function ensureTerminalIdentity() {
  const existing = String(config?.terminalId || '').trim();
  if (existing) return existing;
  const generated = `cterm_${crypto.randomBytes(6).toString('hex')}`;
  config.terminalId = generated;
  saveConfig();
  return generated;
}

/**
 * Set current project path
 * @param {string} projectPath - Path to project root
 */
function setProject(projectPath) {
  const normalized = String(projectPath || '').trim();
  currentProject = normalized || null;
  config.projectPath = currentProject || '';
  saveConfig();
  console.log('[CodingTerminal:Common] Project set:', currentProject || '(none)');
}

/**
 * Get current project path
 * @returns {string|null} Current project path
 */
function getProject() {
  return currentProject;
}

/**
 * Add message to conversation history
 * @param {string} role - 'user' | 'assistant' | 'system'
 * @param {string} content - Message content
 */
function addMessage(role, content) {
  const entry = {
    role,
    content,
    timestamp: Date.now()
  };
  conversationHistory.push(entry);
  const settings = settingsManager.getSettings(APP_DIR) || {};
  if (settings.session_memory_enabled === false) {
    return;
  }
  // Fire-and-forget shared memory persistence for cross-terminal recall.
  sessionMemory.appendEntry(APP_DIR, {
    surface: 'coding-terminal',
    sessionId: String(config?.terminalId || 'coding-terminal'),
    role: String(role || 'unknown'),
    channel: 'chat',
    content: String(content || ''),
    meta: {
      projectPath: currentProject || '',
      timestamp: entry.timestamp
    }
  }).catch(() => {});
}

/**
 * Get conversation history
 * @param {number} limit - Max messages to return (0 = all)
 * @returns {Array} Conversation messages
 */
function getHistory(limit = 0) {
  if (limit > 0) {
    return conversationHistory.slice(-limit);
  }
  return [...conversationHistory];
}

/**
 * Clear conversation history
 */
function clearHistory() {
  conversationHistory = [];
}

/**
 * Generate unique ID
 * @returns {string} Unique identifier
 */
function generateId() {
  return `ct_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function setLatestPlanContract(contract = null) {
  latestPlanContract = contract && typeof contract === 'object'
    ? JSON.parse(JSON.stringify(contract))
    : null;
  savePlanState();
}

function getLatestPlanContract() {
  return latestPlanContract && typeof latestPlanContract === 'object'
    ? JSON.parse(JSON.stringify(latestPlanContract))
    : null;
}

function startPlanRun(contract = {}) {
  const normalized = contract && typeof contract === 'object' ? contract : {};
  const runId = `pr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const steps = Array.isArray(normalized.steps) ? normalized.steps : [];
  const run = {
    runId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    goal: String(normalized.goal || '').trim(),
    finalAcceptance: String(normalized.finalAcceptance || '').trim(),
    status: steps.length > 0 ? 'running' : 'empty',
    steps: steps.map((step, idx) => ({
      id: String(step?.id || `S${idx + 1}`).trim() || `S${idx + 1}`,
      type: String(step?.type || 'coder').trim(),
      action: String(step?.action || '').trim(),
      dependsOn: Array.isArray(step?.dependsOn) ? step.dependsOn.map((v) => String(v || '').trim()).filter(Boolean) : [],
      acceptance: String(step?.acceptance || '').trim(),
      status: 'pending',
      output: '',
      completedAt: null
    }))
  };
  planRuns.set(runId, run);
  latestPlanRunId = runId;
  prunePlanRunsInMemory();
  savePlanState();
  return JSON.parse(JSON.stringify(run));
}

function getPlanRun(runId = '') {
  const id = String(runId || '').trim();
  if (!id || !planRuns.has(id)) return null;
  return JSON.parse(JSON.stringify(planRuns.get(id)));
}

function getLatestPlanRun() {
  if (!latestPlanRunId || !planRuns.has(latestPlanRunId)) return null;
  return JSON.parse(JSON.stringify(planRuns.get(latestPlanRunId)));
}

function listPlanRuns(limit = 20) {
  const rows = Array.from(planRuns.values())
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
    .slice(0, Math.max(1, Number(limit) || 20))
    .map((r) => ({
      runId: r.runId,
      status: r.status,
      goal: r.goal,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      stepsTotal: Array.isArray(r.steps) ? r.steps.length : 0,
      stepsDone: Array.isArray(r.steps) ? r.steps.filter((s) => s.status === 'done').length : 0
    }));
  return JSON.parse(JSON.stringify(rows));
}

function updatePlanRunStep(runId = '', stepId = '', patch = {}) {
  const id = String(runId || '').trim();
  const sid = String(stepId || '').trim().toUpperCase();
  if (!id || !sid || !planRuns.has(id)) return null;
  const run = planRuns.get(id);
  const idx = run.steps.findIndex((s) => String(s.id || '').trim().toUpperCase() === sid);
  if (idx < 0) return null;
  const prev = run.steps[idx];
  const nextStatus = String(patch?.status || prev.status || '').trim() || prev.status;
  run.steps[idx] = {
    ...prev,
    ...patch,
    status: nextStatus,
    completedAt: nextStatus === 'done' ? (patch?.completedAt || Date.now()) : (patch?.completedAt || prev.completedAt || null)
  };
  const total = run.steps.length;
  const done = run.steps.filter((s) => s.status === 'done').length;
  const failed = run.steps.some((s) => s.status === 'failed');
  run.status = failed ? 'failed' : (done === total && total > 0 ? 'done' : 'running');
  run.updatedAt = Date.now();
  planRuns.set(id, run);
  savePlanState();
  return JSON.parse(JSON.stringify(run));
}

function resolveExecutablePlanStep(runId = '', preferredStepId = '') {
  const run = getPlanRun(runId);
  if (!run) return null;
  const preferred = String(preferredStepId || '').trim().toUpperCase();
  if (preferred) {
    const hit = run.steps.find((s) => String(s.id || '').trim().toUpperCase() === preferred);
    if (hit) return hit;
  }
  for (const step of run.steps) {
    if (step.status !== 'pending') continue;
    const deps = Array.isArray(step.dependsOn) ? step.dependsOn : [];
    const depsSatisfied = deps.every((dep) => {
      const depStep = run.steps.find((s) => s.id === dep);
      return depStep && depStep.status === 'done';
    });
    if (depsSatisfied) return step;
  }
  return run.steps.find((s) => s.status === 'pending') || null;
}

function setPlanRunStatus(runId = '', status = 'running') {
  const id = String(runId || '').trim();
  if (!id || !planRuns.has(id)) return null;
  const run = planRuns.get(id);
  run.status = String(status || '').trim() || run.status;
  run.updatedAt = Date.now();
  planRuns.set(id, run);
  savePlanState();
  return JSON.parse(JSON.stringify(run));
}

module.exports = {
  initialize,
  getConfig,
  updateConfig,
  ensureTerminalIdentity,
  setProject,
  getProject,
  addMessage,
  getHistory,
  clearHistory,
  generateId,
  setLatestPlanContract,
  getLatestPlanContract,
  startPlanRun,
  getPlanRun,
  getLatestPlanRun,
  listPlanRuns,
  updatePlanRunStep,
  resolveExecutablePlanStep,
  setPlanRunStatus
};
