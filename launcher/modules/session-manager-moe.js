/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const moeDeployment = require('./moe/moe-deployment');
const moeConfig = require('./moe/moe-config');
const moeCoordinator = require('./moe/moe-coordinator');
const PortPool = require('./port-pool/port-pool');
const {
  COORDINATOR_PORT_START,
  COORDINATOR_PORT_END
} = require('./port-pool/port-pool-ollama-constants');

function createSessionManagerMoe(deps = {}) {
  const startOllamaForService = deps.startOllamaForService;
  const startLlamaCppForService = deps.startLlamaCppForService;
  const closeSession = deps.closeSession;
  const registerSession = deps.registerSession;
  const getSession = deps.getSession;
  const removeSession = deps.removeSession;
  const getDeterministicRuntime = deps.getDeterministicRuntime;
  const getAttachmentStore = deps.getAttachmentStore;

  let moeInitialized = false;

  function initializeMoE() {
    if (moeInitialized) return;

    try {
      moeDeployment.initialize({
        startOllamaForService,
        startLlamaCppForService,
        closeSession,
        registerSession,
        getSession,
        removeSession,
        routeMoEMessage: (message, options = {}) => moeCoordinator.routeMessage(message, options),
        allocateCoordinatorPort,
        releaseCoordinatorPort
      });

      moeCoordinator.initialize(moeDeployment, {
        deterministicToolsRuntime: getDeterministicRuntime(),
        attachmentStore: typeof getAttachmentStore === 'function' ? getAttachmentStore() : null
      });

      moeInitialized = true;
      console.log('[Session Manager] MoE modules initialized (via BMOC)');
    } catch (err) {
      console.error('[Session Manager] Failed to initialize MoE modules:', err);
    }
  }

  function allocateCoordinatorPort(preferredPort, owner = 'MoE Relay Ingress') {
    const preferred = Number.parseInt(String(preferredPort ?? ''), 10);
    if (
      Number.isInteger(preferred)
      && preferred >= COORDINATOR_PORT_START
      && preferred <= COORDINATOR_PORT_END
      && PortPool.isPortAvailable(preferred)
    ) {
      const reserved = PortPool.allocatePort(
        preferred,
        preferred,
        owner,
        'moe-coordinator-ingress',
        'MOE-COORDINATOR'
      );
      if (Number.isInteger(reserved)) return reserved;
    }

    return PortPool.allocatePort(
      COORDINATOR_PORT_START,
      COORDINATOR_PORT_END,
      owner,
      'moe-coordinator-ingress',
      'MOE-COORDINATOR'
    );
  }

  function releaseCoordinatorPort(port) {
    const value = Number.parseInt(String(port ?? ''), 10);
    if (!Number.isInteger(value)) return false;
    return PortPool.releasePort(value);
  }

  async function deployMoEPipeline(pipelineConfig, appPath, gpuInfo) {
    initializeMoE();
    return moeDeployment.deployPipeline(pipelineConfig, appPath, gpuInfo);
  }

  function getMoEStatus() {
    return moeDeployment.getStatus();
  }

  async function teardownMoEPipeline() {
    return moeDeployment.teardownPipeline();
  }

  function saveMoEPipelineConfig(pipelineConfig, appPath, options = {}) {
    return moeConfig.saveConfig(pipelineConfig, appPath, options);
  }

  function loadMoEPipelineConfig(appPath, options = {}) {
    return moeConfig.loadConfig(appPath, options);
  }

  function listMoEPipelineConfigs(appPath) {
    return moeConfig.listConfigs(appPath);
  }

  function deleteMoEPipelineConfig(appPath, options = {}) {
    return moeConfig.deleteConfig(appPath, options);
  }

  async function routeMoEMessage(message, options = {}) {
    initializeMoE();
    return moeCoordinator.routeMessage(message, options);
  }

  async function sendToMoEAgent(agentId, message, options = {}) {
    initializeMoE();
    return moeCoordinator.sendToAgent(agentId, message, options);
  }

  async function pingMoEAgents() {
    return moeCoordinator.pingAllAgents();
  }

  async function rerunLastMoEIrg(options = {}) {
    initializeMoE();
    return moeCoordinator.rerunLastIrg(options);
  }

  async function runMoEIrgContract(contract, options = {}) {
    initializeMoE();
    return moeCoordinator.runIrgContract(contract, options);
  }

  function listMoESerialPorts() {
    initializeMoE();
    return moeCoordinator.listAvailableSerialPorts();
  }

  return {
    initializeMoE,
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
    listMoESerialPorts
  };
}

module.exports = createSessionManagerMoe;
