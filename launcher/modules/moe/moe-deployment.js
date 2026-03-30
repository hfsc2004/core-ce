/**
 * ============================================================================
 * MOE DEPLOYMENT MANAGER
 * ============================================================================
 * 
 * Handles deployment and teardown of MoE agent pipelines.
 * 
 * IMPORTANT: MoE is a CONSUMER of already-prepared models.
 * - Models are downloaded via Browse & Download screen
 * - Models are wrapped via "Launch in Ollama" (at least once)
 * - MoE NEVER downloads or pulls anything
 * 
 * All service management goes through BMOC (session-manager.js).
 * 
 * @module moe-deployment
 * @version 1.1.3 - March 5, 2026
 * @license SEE LICENSE.txt
 * ============================================================================
 */

const moeEndpoint = require('./moe-endpoint');
const http = require('http');
const fs = require('fs');
const path = require('path');
const settingsManager = require('../settings-manager');
const networkHost = require('../network-host');
const createIngressTools = require('./moe-deployment-ingress');

// ============================================================================
// STATE
// ============================================================================

let activeDeployment = null;

let bmoc = {
  startOllamaForService: null,
  startLlamaCppForService: null,
  closeSession: null,
  registerSession: null,
  getSession: null,
  removeSession: null,
  allocateCoordinatorPort: null,
  releaseCoordinatorPort: null
};

let coordinatorBridge = {
  routeMoEMessage: null
};
let catalogModelRuntimeIndex = null;
const DEFAULT_LLAMA_GPU_LAYERS = 999;
const ingressTools = createIngressTools({
  http,
  settingsManager,
  networkHost,
  getActiveDeployment: () => activeDeployment,
  getBmoc: () => bmoc,
  getCoordinatorBridge: () => coordinatorBridge,
  setIngress: (ingress) => {
    if (!activeDeployment) return;
    activeDeployment.ingress = ingress;
  }
});

// ============================================================================
// INITIALIZATION
// ============================================================================

function initialize(bmocFunctions) {
  bmoc = bmocFunctions;
  coordinatorBridge.routeMoEMessage =
    typeof bmocFunctions?.routeMoEMessage === 'function' ? bmocFunctions.routeMoEMessage : null;
  console.log('[MoE Deployment] Initialized with BMOC functions');
}

function normalizeModelToken(value) {
  return String(value || '').trim().toLowerCase();
}

function loadCatalogModelRuntimeIndex(appPath) {
  if (catalogModelRuntimeIndex) return catalogModelRuntimeIndex;
  const map = new Map();
  const modelRoots = [
    path.join(appPath, '..', 'models', 'catalog-master.json')
  ];
  for (const fullPath of modelRoots) {
    if (!fs.existsSync(fullPath)) continue;
    let parsed = null;
    try {
      parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    } catch (_) {
      continue;
    }
    const collections = parsed?.collections && typeof parsed.collections === 'object'
      ? Object.entries(parsed.collections)
      : [];
    for (const [collectionKey, collection] of collections) {
      const models = Array.isArray(collection?.models) ? collection.models : [];
      for (const model of models) {
        const key = normalizeModelToken(model?.id);
        if (!key) continue;
        const runtimeTag = String(model?.ollama_model || '').trim();
        const filename = String(model?.filename || '').trim();
        const fileStem = filename.replace(/\.gguf$/i, '').trim();
        map.set(key, {
          runtimeTag: runtimeTag || null,
          filename: filename || null,
          collectionKey: String(collectionKey || '').trim() || null,
          fileStem: fileStem || null,
          modelName: String(model?.name || '').trim() || null
        });
      }
    }
  }
  catalogModelRuntimeIndex = map;
  return catalogModelRuntimeIndex;
}

function resolveAgentRuntimeModelTag(agent, appPath) {
  const rawModelId = String(agent?.modelId || '').trim();
  const rawModelName = String(agent?.modelName || '').trim();
  const rawFilenameStem = String(agent?.filename || '').replace(/\.gguf$/i, '').trim();

  // Already a direct Ollama tag
  if (rawModelId.includes(':')) {
    return {
      runtimeModelTag: rawModelId,
      catalogModelId: rawModelId,
      source: 'direct-tag'
    };
  }

  const index = loadCatalogModelRuntimeIndex(appPath);
  const idxHit = index.get(normalizeModelToken(rawModelId));
  if (idxHit?.runtimeTag) {
    return {
      runtimeModelTag: idxHit.runtimeTag,
      catalogModelId: rawModelId || null,
      source: 'catalog-ollama-model'
    };
  }

  // Fallbacks when catalog lacks ollama_model.
  if (rawFilenameStem) {
    return {
      runtimeModelTag: rawFilenameStem,
      catalogModelId: rawModelId || null,
      source: 'filename-stem'
    };
  }
  if (rawModelName) {
    return {
      runtimeModelTag: rawModelName,
      catalogModelId: rawModelId || null,
      source: 'model-name'
    };
  }
  return {
    runtimeModelTag: rawModelId,
    catalogModelId: rawModelId || null,
    source: 'model-id'
  };
}

function normalizeAgentProvider(agent = {}) {
  const explicit = String(agent?.provider || '').trim().toLowerCase();
  if (explicit === 'llama.cpp') return 'llama.cpp';
  if (explicit === 'ollama') return 'ollama';
  const modelId = String(agent?.modelId || '').trim().toLowerCase();
  const filename = String(agent?.filename || '').trim().toLowerCase();
  if (modelId.includes('gguf') || filename.endsWith('.gguf')) return 'llama.cpp';
  return 'ollama';
}

function resolveModelPathFromCatalog(agent, appPath) {
  const modelsRoot = path.join(appPath, '..', 'models');
  const index = loadCatalogModelRuntimeIndex(appPath);
  const hit = index.get(normalizeModelToken(agent?.modelId));
  const filename = String(agent?.filename || hit?.filename || '').trim();
  if (!filename) return null;

  const candidatePaths = [];
  const collectionKey = String(agent?.collectionKey || hit?.collectionKey || '').trim();
  if (collectionKey) {
    candidatePaths.push(path.join(modelsRoot, collectionKey, filename));
  }
  candidatePaths.push(path.join(modelsRoot, filename));

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) return candidate;
  }

  // Slow fallback: search one collection level deep by exact filename.
  try {
    const children = fs.readdirSync(modelsRoot, { withFileTypes: true });
    for (const child of children) {
      if (!child?.isDirectory?.()) continue;
      const candidate = path.join(modelsRoot, child.name, filename);
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch (_) {
    // Keep fail-fast; caller raises explicit error when null.
  }

  return null;
}

// ============================================================================
// DEPLOYMENT
// ============================================================================

async function deployPipeline(pipelineConfig, appPath, gpuInfo) {
  const deployStart = Date.now();
  console.log('[MoE Deployment] ═══════════════════════════════════════════════════════════');
  console.log('[MoE Deployment] 🧠 DEPLOYING PIPELINE (via BMOC)');
  console.log('[MoE Deployment] ═══════════════════════════════════════════════════════════');
  
  if (!pipelineConfig || !Array.isArray(pipelineConfig.items)) {
    return { success: false, message: 'Invalid pipeline configuration: missing items array' };
  }
  
  if (activeDeployment) {
    console.log('[MoE Deployment] Tearing down existing deployment...');
    await teardownPipeline();
  }
  
  activeDeployment = {
    id: `moe-${Date.now()}`,
    startedAt: new Date().toISOString(),
    agents: {},
    gateways: {},
    channels: [],
    bindings: [],
    cliAgents: [],
    ingress: null,
    config: pipelineConfig
  };
  
  try {
    let agentIndex = 0;
    for (const item of pipelineConfig.items) {
      if (!item.enabled) continue;
      
      switch (item.type) {
        case 'agent':
          if (item.modelId) {
            const t = Date.now();
            console.log(`[MoE Deployment] ⏱️ Agent ${++agentIndex}: ${item.name}...`);
            await deployAgent(item, appPath, gpuInfo);
            console.log(`[MoE Deployment] ⏱️ Agent ${item.name}: ${Date.now() - t}ms`);
          }
          break;
        case 'gateway':
          deployGateway(item);
          break;
        case 'channel':
          deployChannel(item);
          break;
        case 'bindings':
          deployBindings(item);
          break;
        case 'cli_agent':
        case 'deep_agent':
        case 'executor':
          deployCliAgent(item);
          break;
      }
    }
    
    const agentCount = Object.keys(activeDeployment.agents).length;
    await deployIngressIfConfigured(appPath);
    const totalTime = Date.now() - deployStart;
    
    console.log('[MoE Deployment] ═══════════════════════════════════════════════════════════');
    console.log(`[MoE Deployment] ✅ COMPLETE: ${agentCount} agents in ${totalTime}ms`);
    console.log('[MoE Deployment] ═══════════════════════════════════════════════════════════');
    
    return {
      success: true,
      deploymentId: activeDeployment.id,
      agents: activeDeployment.agents,
      gateways: activeDeployment.gateways,
    channels: activeDeployment.channels,
    bindings: activeDeployment.bindings,
    cliAgents: activeDeployment.cliAgents,
    ingress: ingressTools.sanitizeIngress(activeDeployment.ingress),
    message: `Deployed ${agentCount} agents (${(totalTime/1000).toFixed(1)}s)`
  };
    
  } catch (err) {
    console.error('[MoE Deployment] Failed:', err);
    await teardownPipeline();
    return { success: false, message: `Deployment failed: ${err.message}` };
  }
}

/**
 * Deploy a single agent via BMOC.
 * Provider-specific startup:
 * - ollama: start Ollama and route /api/chat
 * - llama.cpp: start llama-server with resolved GGUF path and route /v1/chat/completions
 */
async function deployAgent(agent, appPath, gpuInfo) {
  const provider = normalizeAgentProvider(agent);
  const resolvedModel = resolveAgentRuntimeModelTag(agent, appPath);
  const resolvedModelPath = provider === 'llama.cpp'
    ? resolveModelPathFromCatalog(agent, appPath)
    : null;

  if (provider === 'llama.cpp' && !resolvedModelPath) {
    throw new Error(
      `Agent "${agent.name}" requires a GGUF file for llama.cpp, but no local model file was found ` +
      `for "${agent.modelName || agent.modelId || 'unknown model'}".`
    );
  }

  console.log(
    `[MoE Deployment]    🤖 ${agent.name} (${provider}) ` +
    `(model: ${agent.modelName || agent.modelId})` +
    ` -> runtime tag: ${resolvedModel.runtimeModelTag} [${resolvedModel.source}]`
  );
  if (provider === 'llama.cpp') {
    console.log(`[MoE Deployment]    📦 llama.cpp model path: ${resolvedModelPath}`);
  }

  const t1 = Date.now();
  let endpoint = null;
  let sessionId = null;
  let port = null;
  let pid = null;
  let chatTemplate = null;
  let chatTemplateSource = 'none';

  if (provider === 'llama.cpp') {
    if (typeof bmoc.startLlamaCppForService !== 'function') {
      throw new Error('BMOC startLlamaCppForService is unavailable for Relay deploy.');
    }
    const result = await bmoc.startLlamaCppForService('moe-agent', appPath, {
      modelPath: resolvedModelPath,
      modelName: agent.modelName || agent.modelId || path.basename(String(resolvedModelPath || '')),
      gpuLayers: Number.isFinite(Number(agent?.gpuLayers))
        ? Number(agent.gpuLayers)
        : DEFAULT_LLAMA_GPU_LAYERS,
      forceCpu: agent?.forceCpu === true,
      contextSize: Number.isFinite(Number(agent?.contextSize)) ? Number(agent.contextSize) : 8192,
      threads: Number.isFinite(Number(agent?.threads)) ? Number(agent.threads) : 0,
      parallel: Number.isFinite(Number(agent?.parallel)) ? Number(agent.parallel) : 1
    });
    if (!result?.success) {
      throw new Error(`Failed to start llama.cpp for ${agent.name}: ${result?.message || 'unknown error'}`);
    }
    sessionId = result.sessionId;
    port = Number(result.port);
    pid = result.pid;
    chatTemplate = result.chatTemplate || null;
    chatTemplateSource = result.chatTemplateSource || 'none';
    endpoint = moeEndpoint.createLocalEndpoint(port);
  } else {
    const result = await bmoc.startOllamaForService('moe-agent', appPath, gpuInfo);
    if (!result?.success) {
      throw new Error(`Failed to start Ollama for ${agent.name}: ${result?.message || 'unknown error'}`);
    }
    sessionId = result.sessionId;
    port = Number(result.ollamaPort);
    pid = result.ollamaPID;
    endpoint = moeEndpoint.createLocalEndpoint(port);
  }

  console.log(`[MoE Deployment]    ⏱️ BMOC start: ${Date.now() - t1}ms`);
  console.log(`[MoE Deployment]    Port ${port}, PID ${pid}`);

  activeDeployment.agents[agent.id] = {
    sessionId,
    name: agent.name,
    role: String(agent.role || agent.routingRole || '').trim() || null,
    provider,
    modelId: resolvedModel.runtimeModelTag,
    catalogModelId: resolvedModel.catalogModelId || agent.modelId,
    modelName: agent.modelName,
    modelPath: resolvedModelPath || null,
    chatTemplate,
    chatTemplateSource,
    endpoint,
    port,
    pid,
    routingMode: agent.routingMode,
    routingRules: Array.isArray(agent.routingRules) ? agent.routingRules : [],
    rlmAssist: agent.rlmAssist === true,
    rlmAttachmentSessionId: String(agent.rlmAttachmentSessionId || `moe-agent-${agent.id}`),
    systemPrompt: agent.systemPrompt,
    tools: agent.tools || [],
    status: 'starting'
  };

  const t2 = Date.now();
  const ready = await waitForProvider(provider, port, 10000);
  console.log(`[MoE Deployment]    ⏱️ ${provider} ready: ${Date.now() - t2}ms`);

  if (ready) {
    activeDeployment.agents[agent.id].status = 'ready';
    console.log(`[MoE Deployment]    ✅ ${agent.name} ready`);
  } else {
    activeDeployment.agents[agent.id].status = 'timeout';
    console.warn(`[MoE Deployment]    ⚠️ ${agent.name} - ${provider} not responding`);
  }
}

/**
 * Wait for Ollama to respond on a port
 */
async function waitForOllama(port, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const ok = await new Promise((resolve) => {
        const req = require('http').get(`http://localhost:${port}/`, (res) => {
          resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(1000, () => { req.destroy(); resolve(false); });
      });
      if (ok) return true;
    } catch (e) { /* retry */ }
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
}

async function waitForProvider(provider, port, timeoutMs = 10000) {
  const p = String(provider || '').trim().toLowerCase();
  if (p === 'llama.cpp') {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const ok = await new Promise((resolve) => {
          const req = require('http').get(`http://127.0.0.1:${port}/health`, (res) => {
            resolve(res.statusCode >= 200 && res.statusCode < 500);
          });
          req.on('error', () => resolve(false));
          req.setTimeout(1000, () => { req.destroy(); resolve(false); });
        });
        if (ok) return true;
      } catch (_) {
        // retry
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    return false;
  }
  return waitForOllama(port, timeoutMs);
}

// ============================================================================
// GATEWAY/CHANNEL
// ============================================================================

function deployGateway(gateway) {
  activeDeployment.gateways[gateway.id] = {
    name: gateway.name,
    position: gateway.position,
    enabled: gateway.enabled !== false,
    sources: { ...gateway.sources },
    irg: {
      enabled: gateway?.irg?.enabled !== false,
      executeMode: String(gateway?.irg?.executeMode || 'simulate').toLowerCase(),
      entryMode: String(gateway?.irg?.entryMode || 'deterministic-first').toLowerCase(),
      deterministicFallbackMode: String(gateway?.irg?.deterministicFallbackMode || 'on-gaps-or-low-confidence').toLowerCase(),
      deterministicConfidenceThreshold: Number.isFinite(Number(gateway?.irg?.deterministicConfidenceThreshold))
        ? Math.max(0, Math.min(1, Number(gateway.irg.deterministicConfidenceThreshold)))
        : 0.9,
      autoExecuteLive: gateway?.irg?.autoExecuteLive === true,
      requireLlmPlanForLive: gateway?.irg?.requireLlmPlanForLive === true,
      live: {
        ...(gateway?.irg?.live || {})
      },
      targets: Array.isArray(gateway?.irg?.targets) ? [...gateway.irg.targets] : ['raspberry-pi-pico', 'esp32'],
      pico: {
        ...(gateway?.irg?.pico || {})
      },
      esp32: {
        ...(gateway?.irg?.esp32 || {})
      }
    }
  };
  console.log(`[MoE Deployment] 📡 Gateway: ${gateway.name}`);
}

function deployChannel(channel) {
  const when = String(channel.when || channel.flowCondition || 'always').trim().toLowerCase();
  const mode = String(channel.mode || 'direct').trim().toLowerCase();
  activeDeployment.channels.push({
    id: channel.id,
    mode: ['direct', 'broadcast', 'group'].includes(mode) ? mode : 'direct',
    direction: channel.direction,
    fromAgentId: String(channel.fromAgentId || '').trim(),
    toAgentId: String(channel.toAgentId || '').trim(),
    groupId: String(channel.groupId || '').trim(),
    label: channel.label || '',
    when,
    flowCondition: when, // legacy alias
    matchRule: String(channel.matchRule || '').trim(),
    retryCount: Number.isInteger(Number(channel.retryCount)) ? Number(channel.retryCount) : 0,
    timeoutMs: Number.isFinite(Number(channel.timeoutMs)) ? Number(channel.timeoutMs) : 120000,
    onFailure: channel.onFailure || 'stop'
  });
  console.log(`[MoE Deployment] 🔗 Channel: ${channel.direction}`);
}

function deployBindings(bindings) {
  const entries = Array.isArray(bindings?.entries) ? bindings.entries : [];
  activeDeployment.bindings.push({
    id: bindings.id,
    name: bindings.name || 'Runtime Bindings',
    enabled: bindings.enabled !== false,
    entries: entries
      .map((entry) => ({
        key: String(entry?.key || '').trim(),
        value: String(entry?.value || '')
      }))
      .filter((entry) => entry.key)
  });
  console.log(`[MoE Deployment] 🧩 Bindings: ${bindings.name || bindings.id} (${entries.length} entries)`);
}

function deployCliAgent(node) {
  const hooks = node?.hooks && typeof node.hooks === 'object' ? node.hooks : {};
  const deployed = {
    id: node.id,
    name: node.name || 'CLI Agent',
    enabled: node.enabled !== false,
    ownerAgentId: String(node.ownerAgentId || '').trim(),
    executionMode: String(node.executionMode || 'on-tool').trim().toLowerCase(),
    policyProfile: String(node.policyProfile || 'workspace-write').trim().toLowerCase(),
    stepBudget: Number.isInteger(Number(node.stepBudget)) ? Number(node.stepBudget) : 50,
    tokenBudget: Number.isInteger(Number(node.tokenBudget)) ? Number(node.tokenBudget) : 8000,
    timeoutMs: Number.isInteger(Number(node.timeoutMs)) ? Number(node.timeoutMs) : 300000,
    hooks: {
      runCommand: hooks.runCommand === true,
      writeFile: hooks.writeFile === true,
      runTests: hooks.runTests === true,
      gitDiff: hooks.gitDiff === true,
      flashFirmware: hooks.flashFirmware === true
    }
  };
  activeDeployment.cliAgents.push(deployed);
  console.log(`[MoE Deployment] ⚡ CLI Agent: ${deployed.name} (owner=${deployed.ownerAgentId || 'unassigned'})`);
}

// ============================================================================
// TEARDOWN
// ============================================================================

async function teardownPipeline() {
  console.log('[MoE Deployment] 🛑 Teardown...');
  
  if (!activeDeployment) {
    return { success: true, message: 'No active deployment' };
  }
  
  const deploymentId = activeDeployment.id;
  let closedCount = 0;
  const errors = [];
  
  if (activeDeployment.ingress?.server) {
    await ingressTools.closeIngressServer(activeDeployment.ingress.server, activeDeployment.ingress.port);
  }

  for (const [agentId, agent] of Object.entries(activeDeployment.agents)) {
    try {
      console.log(`[MoE Deployment]    Closing ${agent.name}...`);
      if (bmoc.closeSession) {
        await bmoc.closeSession(agent.sessionId);
      } else if (bmoc.removeSession) {
        bmoc.removeSession(agent.sessionId);
        if (agent.pid) {
          try { process.kill(agent.pid, 'SIGTERM'); } catch (e) { }
        }
      }
      closedCount++;
    } catch (err) {
      errors.push(`${agent.name}: ${err.message}`);
    }
  }
  
  activeDeployment = null;
  console.log(`[MoE Deployment] ✅ Closed ${closedCount} agents`);
  
  return {
    success: errors.length === 0,
    deploymentId,
    closedAgents: closedCount,
    errors: errors.length > 0 ? errors : undefined
  };
}

// ============================================================================
// STATUS
// ============================================================================

function getStatus() {
  if (!activeDeployment) return null;
  
  return {
    id: activeDeployment.id,
    startedAt: activeDeployment.startedAt,
    agentCount: Object.keys(activeDeployment.agents).length,
    gatewayCount: Object.keys(activeDeployment.gateways).length,
    channelCount: activeDeployment.channels.length,
    bindingsCount: activeDeployment.bindings.length,
    cliAgentsCount: Array.isArray(activeDeployment.cliAgents) ? activeDeployment.cliAgents.length : 0,
    agents: { ...activeDeployment.agents },
    gateways: { ...activeDeployment.gateways },
    channels: [...activeDeployment.channels ],
    bindings: [...activeDeployment.bindings],
    cliAgents: [...(activeDeployment.cliAgents || [])],
    ingress: ingressTools.sanitizeIngress(activeDeployment.ingress),
    config: activeDeployment.config
  };
}

function isActive() {
  return activeDeployment !== null;
}

function getAgent(agentId) {
  if (!activeDeployment) return null;
  return activeDeployment.agents[agentId] || null;
}

function getAgentsInOrder() {
  if (!activeDeployment) return [];
  const orderedIds = (activeDeployment.config?.items || [])
    .filter(item => item.type === 'agent' && item.enabled && item.modelId)
    .map(item => item.id);
  return orderedIds.map(id => activeDeployment.agents[id]).filter(Boolean);
}

function getGateway(gatewayId) {
  if (!activeDeployment) return null;
  return activeDeployment.gateways[gatewayId] || null;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  initialize,
  deployPipeline,
  teardownPipeline,
  getStatus,
  isActive,
  getAgent,
  getAgentsInOrder,
  getGateway
};

async function deployIngressIfConfigured(appPath) {
  return ingressTools.deployIngressIfConfigured(appPath);
}
