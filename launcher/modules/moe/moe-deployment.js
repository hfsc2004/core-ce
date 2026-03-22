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
 * @version 1.1.2 - March 5, 2026
 * @license SEE LICENSE.txt
 * ============================================================================
 */

const moeEndpoint = require('./moe-endpoint');
const http = require('http');
const settingsManager = require('../settings-manager');
const networkHost = require('../network-host');
const createIngressTools = require('./moe-deployment-ingress');

// ============================================================================
// STATE
// ============================================================================

let activeDeployment = null;

let bmoc = {
  startOllamaForService: null,
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
 * Deploy a single agent via BMOC
 * 
 * NO PULLING - models are already wrapped and ready.
 * Just start Ollama and wait for it to be ready.
 */
async function deployAgent(agent, appPath, gpuInfo) {
  console.log(`[MoE Deployment]    🤖 ${agent.name} (model: ${agent.modelName || agent.modelId})`);
  
  // 1. Start Ollama via BMOC
  const t1 = Date.now();
  const result = await bmoc.startOllamaForService('moe-agent', appPath, gpuInfo);
  console.log(`[MoE Deployment]    ⏱️ BMOC start: ${Date.now() - t1}ms`);
  
  if (!result.success) {
    throw new Error(`Failed to start Ollama for ${agent.name}: ${result.message}`);
  }
  
  console.log(`[MoE Deployment]    Port ${result.ollamaPort}, PID ${result.ollamaPID}`);
  
  // 2. Create endpoint
  const endpoint = moeEndpoint.createLocalEndpoint(result.ollamaPort);
  
  // 3. Register agent (model is already there - no pull needed!)
  activeDeployment.agents[agent.id] = {
    sessionId: result.sessionId,
    name: agent.name,
    role: String(agent.role || agent.routingRole || '').trim() || null,
    modelId: agent.modelId,  // Use exact name from catalog
    catalogModelId: agent.modelId,
    modelName: agent.modelName,
    endpoint,
    port: result.ollamaPort,
    pid: result.ollamaPID,
    routingMode: agent.routingMode,
    routingRules: Array.isArray(agent.routingRules) ? agent.routingRules : [],
    rlmAssist: agent.rlmAssist === true,
    rlmAttachmentSessionId: String(agent.rlmAttachmentSessionId || `moe-agent-${agent.id}`),
    systemPrompt: agent.systemPrompt,
    tools: agent.tools || [],
    status: 'starting'
  };
  
  // 4. Wait for Ollama to be ready (it will see the already-wrapped model)
  const t2 = Date.now();
  const ready = await waitForOllama(result.ollamaPort, 10000);
  console.log(`[MoE Deployment]    ⏱️ Ollama ready: ${Date.now() - t2}ms`);
  
  if (ready) {
    activeDeployment.agents[agent.id].status = 'ready';
    console.log(`[MoE Deployment]    ✅ ${agent.name} ready`);
  } else {
    activeDeployment.agents[agent.id].status = 'timeout';
    console.warn(`[MoE Deployment]    ⚠️ ${agent.name} - Ollama not responding`);
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
  activeDeployment.channels.push({
    id: channel.id,
    direction: channel.direction,
    label: channel.label || '',
    flowCondition: channel.flowCondition || 'always',
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
    agents: { ...activeDeployment.agents },
    gateways: { ...activeDeployment.gateways },
    channels: [...activeDeployment.channels ],
    bindings: [...activeDeployment.bindings],
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
