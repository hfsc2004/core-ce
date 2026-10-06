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

  const ktGateway = require('./moe/moe-kt-emulator').createGatewayClient({
    getStatus: () => moeDeployment.getStatus(),
    getStateStatus: (id) => deps.getSessionStateStatus(id)
  });
  const ngiExperiment = require('./moe/moe-ngi-experiment').createController({
    getStatus: () => moeDeployment.getStatus(),
    getStateStatus: (id) => deps.getSessionStateStatus?.(id),
    native: {
      capabilities:deps.getSessionObservationCapabilities,
      configure:deps.configureSessionObservation,
      activate:deps.activateSessionObservation,
      clear:deps.clearSessionObservation,
      reset:deps.resetSessionState
    },
    emulator:(id,operation) => ktGateway.runExperiment(id,operation),
    callHelper: (id, messages) => moeCoordinator.callNgiHelper(id, messages)
  });
  let moeInitialized = false;

  function initializeMoE() {
    if (moeInitialized) return;

    try {
      moeDeployment.initialize({
        startOllamaForService,
        startLlamaCppForService,
        pingSession: deps.pingSession,
        closeSession,
        registerSession,
        getSession,
        removeSession,
        routeMoEMessage: (message, options = {}) => moeCoordinator.routeMessage(message, options),
        ngiCommand: (payload) => payload.action === 'ngi_list' ? {
          success: true, gateways: Object.entries(moeDeployment.getStatus()?.gateways || {})
            .filter(([, gateway]) => gateway.adapter === 'kt-emulator-http')
            .map(([id, gateway]) => ({ id, name: gateway.name }))
        } : ngiExperiment.command(payload.gatewayId, payload.action, payload.params || {}, { kind: 'user', surface: 'cli' }),
        allocateCoordinatorPort,
        releaseCoordinatorPort
      });

      moeCoordinator.initialize(moeDeployment, {
        runSessionTurn: deps.runSessionTurn,
        pingSession: deps.pingSession,
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
    await ngiExperiment.stopAll();
    return moeDeployment.deployPipeline(ngiExperiment.pipelineConfig(pipelineConfig), appPath, gpuInfo);
  }

  function getMoEStatus() {
    const status = moeDeployment.getStatus();
    if (!status) return status;
    return { ...status, gateways: Object.fromEntries(Object.entries(status.gateways || {}).map(([id, gateway]) =>
      [id, { ...gateway, ...(gateway.adapter === 'kt-emulator-http' ? { ngiExperimentState: ngiExperiment.inspect(id) } : {}) }])) };
  }

  async function teardownMoEPipeline() {
    await ngiExperiment.stopAll();
    return moeDeployment.teardownPipeline();
  }

  function saveMoEPipelineConfig(pipelineConfig, appPath, options = {}) {
    return moeConfig.saveConfig(ngiExperiment.pipelineConfig(pipelineConfig), appPath, options);
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
    const ngiResult = await ngiExperiment.chat(agentId, message);
    if (ngiResult) return ngiResult;
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
    consumeCompletedTurn:ngiExperiment.consumeTurn,
    onSessionLifecycle:ngiExperiment.onLifecycle,
    commandMoENgiExperiment: (gatewayId, action, params = {}) => {
      initializeMoE();
      return ngiExperiment.command(gatewayId, action, params, { kind: 'user', surface: 'ui' });
    },
    getMoENgiKnowledge: () => require('./moe/moe-ngi-knowledge').inspect(),
    getMoENgiExperiment: (id) => ngiExperiment.inspect(id),
    requestMoENgiHelper: (gatewayId, helperId, message) => {
      initializeMoE();
      return ngiExperiment.request(gatewayId, helperId, message);
    },
    runMoEKtGateway: async (id, command) => {
      const result=await ktGateway.run(id,command); ngiExperiment.manualOperation(id,result); return result;
    },
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
