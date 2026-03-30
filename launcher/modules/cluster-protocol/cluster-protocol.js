/**
 * PSF Cluster Protocol - PDU Definitions
 * IS-IS inspired protocol for cluster coordination
 * 
 * @module cluster-protocol
 * @version 1.1.3 - March 5, 2026
 */

// =============================================================================
// PDU Types (IS-IS compatible numbering)
// =============================================================================

const PDU_TYPES = {
  // Standard IS-IS types
  IIH_P2P: 17,      // Point-to-Point Hello
  IIH_LAN: 15,      // LAN Hello (broadcast)
  LSP: 18,          // Link State PDU
  CSNP: 24,         // Complete Sequence Numbers
  PSNP: 26,         // Partial Sequence Numbers
  
  // PSF custom types (200+)
  PSF_HEARTBEAT: 240,
  PSF_TASK_ROUTE: 241,
  PSF_MODEL_SYNC: 242,
  PSF_INDEX_SYNC: 243
};

// =============================================================================
// TLV Types (Type-Length-Value)
// =============================================================================

const TLV_TYPES = {
  // Standard IS-IS TLVs
  AREA_ADDRESSES: 1,
  IS_NEIGHBORS: 2,
  ES_NEIGHBORS: 3,
  PADDING: 8,
  LSP_ENTRIES: 9,
  AUTH: 10,
  
  // PSF custom TLVs (200+)
  GPU_CAPABILITIES: 200,
  MODEL_INVENTORY: 201,
  LOAD_METRICS: 202,
  ROUTING_POLICY: 203,
  INFERENCE_CAPACITY: 204,
  RAG_CAPABILITIES: 205,
  SECURITY_CONTEXT: 206,
  ENCRYPTION_KEY: 210,
  AUDIT_CHAIN: 211
};

// =============================================================================
// Flags
// =============================================================================

const FLAGS = {
  OVERLOAD: 0x01,      // Node at capacity
  PARTITION: 0x02,     // Network partition detected
  L1_ONLY: 0x04,       // Local area only
  L2_CAPABLE: 0x08,    // Can participate in backbone
  DIS: 0x10,           // Designated IS (coordinator)
  MAINTENANCE: 0x20,   // Node in maintenance mode
  DC_SECURE: 0x40      // Data Center secure mode
};

// =============================================================================
// PDU Structures
// =============================================================================

/**
 * Create IIH (Hello) PDU
 * @param {Object} options - Hello options
 * @returns {Object} IIH PDU
 */
function createIIH(options = {}) {
  return {
    type: options.lan ? PDU_TYPES.IIH_LAN : PDU_TYPES.IIH_P2P,
    version: 1,
    systemId: options.systemId || generateSystemId(),
    circuitType: options.lan ? 2 : 1,  // 1=L1, 2=L2
    priority: options.priority || 64,
    holdTime: options.holdTime || 30,
    flags: options.flags || 0,
    tlvs: options.tlvs || [],
    timestamp: Date.now()
  };
}

/**
 * Create LSP (Link State PDU)
 * @param {Object} options - LSP options
 * @returns {Object} LSP PDU
 */
function createLSP(options = {}) {
  return {
    type: PDU_TYPES.LSP,
    version: 1,
    systemId: options.systemId || generateSystemId(),
    lspId: options.lspId || `${options.systemId}.00-00`,
    sequenceNumber: options.sequenceNumber || 1,
    remainingLifetime: options.lifetime || 1200,
    flags: options.flags || 0,
    tlvs: options.tlvs || [],
    checksum: 0  // Calculated on serialize
  };
}

/**
 * Create PSF Heartbeat PDU
 * @param {Object} options - Heartbeat options
 * @returns {Object} Heartbeat PDU
 */
function createHeartbeat(options = {}) {
  return {
    type: PDU_TYPES.PSF_HEARTBEAT,
    version: 1,
    systemId: options.systemId,
    flags: options.flags || 0,
    load: options.load || {
      cpu: 0,
      gpu: 0,
      memory: 0,
      queueDepth: 0
    },
    timestamp: Date.now()
  };
}

// =============================================================================
// TLV Builders
// =============================================================================

/**
 * Create GPU Capabilities TLV
 * @param {Object} gpu - GPU info
 * @returns {Object} TLV
 */
function tlvGpuCapabilities(gpu) {
  return {
    type: TLV_TYPES.GPU_CAPABILITIES,
    value: {
      vendor: gpu.vendor,  // 'nvidia', 'amd', 'apple'
      model: gpu.model,
      vram: gpu.vram,      // MB
      compute: gpu.compute, // TFLOPS
      utilization: gpu.utilization || 0
    }
  };
}

/**
 * Create Model Inventory TLV
 * @param {Array} models - Loaded models
 * @returns {Object} TLV
 */
function tlvModelInventory(models) {
  return {
    type: TLV_TYPES.MODEL_INVENTORY,
    value: models.map(m => ({
      name: m.name,
      size: m.size,
      loaded: m.loaded,
      contextWindow: m.contextWindow
    }))
  };
}

/**
 * Create Load Metrics TLV
 * @param {Object} metrics - Current load
 * @returns {Object} TLV
 */
function tlvLoadMetrics(metrics) {
  return {
    type: TLV_TYPES.LOAD_METRICS,
    value: {
      cpu: metrics.cpu || 0,
      gpu: metrics.gpu || 0,
      vramUsed: metrics.vramUsed || 0,
      vramTotal: metrics.vramTotal || 0,
      queueDepth: metrics.queueDepth || 0,
      tokensPerSec: metrics.tokensPerSec || 0
    }
  };
}

/**
 * Create Security Context TLV
 * @param {Object} security - Security info
 * @returns {Object} TLV
 */
function tlvSecurityContext(security) {
  return {
    type: TLV_TYPES.SECURITY_CONTEXT,
    value: {
      edition: security.edition,
      clearance: security.clearance,
      role: security.role,
      encrypted: true  // Would be encrypted in DC edition
    }
  };
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Generate system ID (like MAC address)
 * @returns {string} System ID
 */
function generateSystemId() {
  const bytes = [];
  for (let i = 0; i < 6; i++) {
    bytes.push(Math.floor(Math.random() * 256).toString(16).padStart(2, '0'));
  }
  return bytes.join('.');
}

/**
 * Serialize PDU to buffer (stub)
 * @param {Object} pdu - PDU to serialize
 * @returns {Buffer} Serialized PDU
 */
function serialize(pdu) {
  // STUB: Would implement binary serialization
  return Buffer.from(JSON.stringify(pdu));
}

/**
 * Deserialize buffer to PDU (stub)
 * @param {Buffer} buffer - Buffer to deserialize
 * @returns {Object} PDU
 */
function deserialize(buffer) {
  // STUB: Would implement binary deserialization
  return JSON.parse(buffer.toString());
}

module.exports = {
  PDU_TYPES,
  TLV_TYPES,
  FLAGS,
  createIIH,
  createLSP,
  createHeartbeat,
  tlvGpuCapabilities,
  tlvModelInventory,
  tlvLoadMetrics,
  tlvSecurityContext,
  generateSystemId,
  serialize,
  deserialize
};
