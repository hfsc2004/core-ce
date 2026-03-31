/**
 * ============================================================================
 * MOE STATE - Shared State & Data Templates
 * ============================================================================
 * 
 * Central state management for Model Ordering and MoE Pipeline screens.
 * All UI modules reference window.modelOrderingState for shared state.
 * 
 * @module moe-state
 * @version 1.1.3 - March 5, 2026
 * ============================================================================
 */

// ============================================================================
// SHARED STATE (Global - accessed by all ordering/MoE modules)
// ============================================================================

window.modelOrderingState = {
  // Catalog & Ordering
  catalog: null,
  orderingData: null,
  viewMode: 'compact',
  scopeMode: 'pipeline',
  selectedModels: new Set(),
  draggedItem: null,
  isDragging: false,
  currentCollection: null,
  groups: [],
  downloadStatus: {},
  expandedModelId: null,
  editMode: false,
  
  // MoE Pipeline State
  moeItems: [],
  selectedMoeItem: null,
  expandedMoeItem: null,
  expandedMoeItems: [],
  serialDevices: [],
  serialDevicesUpdatedAt: null,
  endpointRegistry: {
    enabled: false,
    includeLocalAgents: true,
    selection: 'priority',
    defaultTimeoutMs: 120000,
    maxConsecutiveFailures: 2,
    cooldownMs: 20000,
    agentRoleMap: {},
    roles: {}
  },
  moeAttachmentCounts: {
    byAgentId: {},
    shared: { count: 0 },
    signature: '',
    loading: false
  },
  moeDeployStatusSummary: 'IDLE',
  moeDeployLogLines: [],
  moeDeployFrameState: 'idle',
  
  // MoE Model Filter
  showAllModels: false  // false = downloaded only, true = show full catalog
};

// ============================================================================
// MOE DATA STRUCTURE TEMPLATES
// ============================================================================

/**
 * Create a new Agent
 * @param {string} name - Agent display name
 * @returns {Object} Agent configuration object
 */
function createAgent(name = 'New Agent') {
  return {
    id: `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: 'agent',
    name: name,
    provider: 'llama.cpp',
    modelId: null,
    modelName: null,
    collectionKey: null,
    filename: null,
    systemPrompt: '',
    multiGpuSplit: true,
    routingMode: 'dynamic',
    routingRules: [],
    groups: [],
    rlmAssist: false,
    rlmAttachmentBucketId: '',
    rlmAttachmentSessionId: '',
    rlmSharedAttachmentBucketId: '',
    rlmSharedAttachmentSessionId: '',
    tools: [],
    enabled: true
  };
}

/**
 * Create a new Channel
 * @param {string} direction - 'bidirectional' or 'unidirectional'
 * @returns {Object} Channel configuration object
 */
function createChannel(direction = 'bidirectional') {
  return {
    id: `channel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: 'channel',
    mode: 'direct',               // direct | broadcast | group
    direction: direction,
    fromAgentId: '',
    toAgentId: '',
    groupId: '',
    label: '',
    when: 'always',               // always | on_success | on_failure | on_match
    matchRule: '',                // used when when=on_match
    flowCondition: 'always',      // legacy alias of "when"
    retryCount: 0,                // retries after first attempt
    timeoutMs: 120000,            // per-agent timeout on this edge
    onFailure: 'stop',            // stop | continue
    enabled: true
  };
}

/**
 * Create a new Gateway
 * @param {string} name - Gateway display name
 * @returns {Object} Gateway configuration object
 */
function createGateway(name = 'User Gateway') {
  return {
    id: `gateway-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: 'gateway',
    name: name,
    position: 'input',
    sources: {
      api: { enabled: false, port: 52434, endpoint: '/v1/chat' },
      terminal: { enabled: true },
      serial: { enabled: false, port: 'auto', baudRate: 115200 }
    },
    irg: {
      enabled: true,
      executeMode: 'live',
      entryMode: 'deterministic-first',
      deterministicFallbackMode: 'on-gaps-or-low-confidence',
      deterministicConfidenceThreshold: 0.9,
      autoExecuteLive: true,
      requireLlmPlanForLive: false,
      live: {
        executor: 'mpremote',
        timeoutMs: 60000
      },
      pico: {
        defaultGpio: 25,
        defaultPeriodMs: 500,
        defaultIterations: 20
      },
      esp32: {
        fqbn: 'esp32:esp32:esp32',
        sketchName: 'psf_irg_esp32',
        compileTimeoutMs: 180000,
        uploadTimeoutMs: 120000,
        monitorBaudRate: 115200,
        wifiSsid: '',
        wifiPassword: '',
        wifiHost: '',
        wifiPort: 8080,
        wifiTimeoutMs: 5000,
        wifiDriveSpeed: 170,
        wifiDriveSwapSides: false,
        wifiDriveInvertLeft: false,
        wifiDriveInvertRight: false,
        wifiNumControlsEnabled: false,
        wifiAiDriveEnabled: false,
        wifiAiDriveAgentId: '',
        wifiAiDriveObjective: 'Explore safely and avoid obstacles.',
        wifiAiDriveTickMs: 420,
        wifiDriveMapForward: 'turn_left',
        wifiDriveMapReverse: 'turn_right',
        wifiDriveMapLeft: 'rev',
        wifiDriveMapRight: 'fwd',
        wifiObstacleFrontThreshold: 1500,
        wifiTakeControl: false,
        wifiCameraEnabled: false,
        wifiCameraSsid: '',
        wifiCameraPassword: '',
        wifiCameraHost: '',
        wifiCameraPort: 81,
        wifiCameraStreamPath: '/stream',
        wifiCameraSnapshotPath: '/capture',
        wifiCameraFlashStatusPath: '/health',
        wifiCameraFqbn: 'esp32:esp32:esp32cam',
        wifiCameraBoardProfile: 'ai-thinker-esp32cam',
        wifiCameraPinProfile: '',
        wifiCameraLibraryPath: '',
        wifiCameraStaEnabled: true,
        wifiCameraUsbCdcOnBoot: true,
        wifiCameraEraseBeforeUpload: false,
        wifiCameraCaptureRuntimeSerial: true,
        wifiCameraRuntimeSerialCaptureMs: 20000,
        wifiCameraStaticEnabled: false,
        wifiCameraStaticIp: '',
        wifiCameraStaticCidr: 24,
        wifiCameraStaticGatewayEnabled: false,
        wifiCameraStaticGateway: '',
        wifiStaticEnabled: false,
        wifiStaticIp: '',
        wifiStaticCidr: 24,
        wifiStaticGatewayEnabled: false,
        wifiStaticGateway: ''
      }
    },
    enabled: true
  };
}

/**
 * Create a new Bindings block (user-defined runtime variables)
 * @param {string} name - Block display name
 * @returns {Object} Bindings configuration object
 */
function createBindings(name = 'Runtime Bindings') {
  return {
    id: `bindings-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: 'bindings',
    name,
    entries: [
      { key: 'gpio.red', value: '2' },
      { key: 'gpio.blue', value: '3' },
      { key: 'gpio.green', value: '4' }
    ],
    enabled: true
  };
}

/**
 * Create a CLI Agent node.
 * This node is stateless execution capability; ownerAgentId selects which agent can invoke it.
 * @param {string} name - Node display name
 * @returns {Object} CLI Agent configuration object
 */
function createCliAgent(name = 'CLI Agent') {
  return {
    id: `cli-agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: 'cli_agent',
    name,
    ownerAgentId: '',
    projectPath: '',
    executionMode: 'on-tool', // on-tool | auto | manual | on-control
    policyProfile: 'workspace-write', // read-only | workspace-write | privileged-approval
    stepBudget: 50,
    tokenBudget: 8000,
    timeoutMs: 300000,
    hooks: {
      runCommand: true,
      writeFile: true,
      runTests: true,
      gitDiff: true,
      flashFirmware: false
    },
    enabled: true
  };
}

/**
 * Create the Distributed Endpoint Registry pipeline item (singleton).
 * Registry data lives in modelOrderingState.endpointRegistry.
 * @returns {Object} Endpoint Registry item
 */
function createEndpointRegistryItem() {
  return {
    id: 'endpoint-registry',
    type: 'endpoint_registry',
    name: 'Distributed Endpoint Registry',
    enabled: true
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

window.createAgent = createAgent;
window.createChannel = createChannel;
window.createGateway = createGateway;
window.createBindings = createBindings;
window.createCliAgent = createCliAgent;
window.createEndpointRegistryItem = createEndpointRegistryItem;
