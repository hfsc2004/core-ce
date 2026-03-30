/**
 * ============================================================================
 * MODEL ORDERING UI - Coordinator / Entry Point
 * ============================================================================
 * 
 * THIS FILE MUST LOAD FIRST - before other model-ordering-*.js modules.
 * 
 * Sets up shared state that other modules depend on:
 *   - window.modelOrderingState (shared application state)
 *   - Data structure templates (createAgent, createChannel, createGateway)
 * 
 * Module Loading Order in index-developer.html:
 *   1. moe-state.js           - MoE state templates
 *   2. model-ordering-ui.js   - THIS FILE (coordinator, state init)
 *   3. model-ordering-core.js - Main render dispatcher
 *   4. model-ordering-render.js - Model row rendering
 *   5. model-ordering-dnd.js  - Selection, drag/drop
 *   6. model-ordering-actions.js - Save, launch, download
 *   7. moe-pipeline-render.js - MoE pipeline rendering
 *   8. moe-pipeline-ops.js    - MoE operations & chat
 * 
 * @module model-ordering-ui
 * @version 1.1.3 - March 5, 2026
 * ============================================================================
 */

// ============================================================================
// STATE MANAGEMENT - Initialize shared state
// ============================================================================

// Use global state from moe-state.js if available, otherwise create
if (!window.modelOrderingState) {
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
    showAllModels: false
  };
}

// Convenience reference for this module
const modelOrderingState = window.modelOrderingState;

// ============================================================================
// DATA STRUCTURE TEMPLATES (fallbacks if moe-state.js not loaded)
// ============================================================================

if (!window.createAgent) {
  /**
   * Create a new Agent
   */
  window.createAgent = function(name = 'New Agent') {
    return {
      id: `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'agent',
      name: name,
      modelId: null,
      modelName: null,
      collectionKey: null,
      filename: null,
      systemPrompt: '',
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
  };
}

if (!window.createChannel) {
  /**
   * Create a new Channel
   */
  window.createChannel = function(direction = 'bidirectional') {
    return {
      id: `channel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'channel',
      mode: 'direct',
      direction: direction,
      fromAgentId: '',
      toAgentId: '',
      groupId: '',
      label: '',
      when: 'always',
      matchRule: '',
      flowCondition: 'always',
      retryCount: 0,
      timeoutMs: 120000,
      onFailure: 'stop',
      enabled: true
    };
  };
}

if (!window.createGateway) {
  /**
   * Create a new Gateway
   */
  window.createGateway = function(name = 'User Gateway') {
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
        autoExecuteLive: false,
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
          wifiStaticEnabled: false,
          wifiStaticIp: '',
          wifiStaticCidr: 24,
          wifiStaticGatewayEnabled: false,
          wifiStaticGateway: ''
        }
      },
      enabled: true
    };
  };
}

if (!window.createBindings) {
  /**
   * Create a new Bindings block
   */
  window.createBindings = function(name = 'Runtime Bindings') {
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
  };
}

if (!window.createCliAgent) {
  /**
   * Create a CLI Agent node (fallback)
   */
  window.createCliAgent = function(name = 'CLI Agent') {
    return {
      id: `cli-agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'cli_agent',
      name,
      ownerAgentId: '',
      executionMode: 'on-tool',
      policyProfile: 'workspace-write',
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
  };
}

if (!window.createEndpointRegistryItem) {
  /**
   * Create Endpoint Registry item (singleton in pipeline list)
   */
  window.createEndpointRegistryItem = function() {
    return {
      id: 'endpoint-registry',
      type: 'endpoint_registry',
      name: 'Distributed Endpoint Registry',
      enabled: true
    };
  };
}

// ============================================================================
// MODULE LOADING VERIFICATION
// ============================================================================

console.log('[Model Ordering] Coordinator loaded - state initialized');

// Verify dependent modules loaded (called after all scripts load)
window.verifyModelOrderingModules = function() {
  const required = [
    'renderModelOrdering',
    'renderModelRow',
    'handleDragStart',
    'saveModelOrdering',
    'renderMoePipeline',
    'addMoeAgent'
  ];
  
  const missing = required.filter(fn => typeof window[fn] !== 'function');
  
  if (missing.length > 0) {
    console.error('[Model Ordering] Missing modules:', missing);
    return false;
  }
  
  console.log('[Model Ordering] All modules loaded successfully');
  return true;
};
