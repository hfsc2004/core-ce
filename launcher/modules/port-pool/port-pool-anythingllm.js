/**
 * ============================================================================
 * PORT POOL MANAGER - ANYTHINGLLM SERVICE
 * ============================================================================
 * 
 * Manages port allocation for AnythingLLM services.
 * Port range: 52470-52479 (10 ports)
 * 
 * Builds on core port-pool.js for allocation logic.
 * 
 * @module port-pool-anythingllm
 * @version 1.1.3 - March 5, 2026
 * @license SEE LICENSE.txt
 * ============================================================================
 */

const PortPool = require('./port-pool');

// ============================================================================
// CONFIGURATION
// ============================================================================

// AnythingLLM Port Range (for AnythingLLM instances)
const ANYTHINGLLM_PORT_START = 52470;
const ANYTHINGLLM_PORT_END = 52479;
const TOTAL_ANYTHINGLLM_PORTS = ANYTHINGLLM_PORT_END - ANYTHINGLLM_PORT_START + 1; // 10 ports

// ============================================================================
// PORT ALLOCATION FUNCTIONS
// ============================================================================

/**
 * Get the next available ANYTHINGLLM port
 * 
 * @param {string} owner - Optional description of who is using this port
 * @returns {number|null} Port number, or null if pool is exhausted
 */
function getAnythingLLMPort(owner = 'AnythingLLM') {
  const port = PortPool.allocatePort(
    ANYTHINGLLM_PORT_START,
    ANYTHINGLLM_PORT_END,
    owner,
    'anythingllm',
    'ANYTHINGLLM'
  );
  
  if (port !== null) {
    logStats();
  }
  
  return port;
}

/**
 * Release a port back to the pool
 * 
 * @param {number} port - Port number to release
 * @returns {boolean} True if port was released, false if it wasn't allocated
 */
function releasePort(port) {
  const result = PortPool.releasePort(port);
  
  if (result) {
    logStats();
  }
  
  return result;
}

/**
 * Check if a specific port is available
 * 
 * @param {number} port - Port number to check
 * @returns {boolean} True if available, false if in use
 */
function isPortAvailable(port) {
  // Check if port is in valid AnythingLLM range
  if (port < ANYTHINGLLM_PORT_START || port > ANYTHINGLLM_PORT_END) {
    console.warn(`[PortPool:AnythingLLM] Port ${port} is outside valid AnythingLLM range (${ANYTHINGLLM_PORT_START}-${ANYTHINGLLM_PORT_END})`);
    return false;
  }
  
  return PortPool.isPortAvailable(port);
}

/**
 * Get all AnythingLLM ports currently in use
 * 
 * @returns {Array<Object>} Array of {port, owner, allocated, allocatedSince, type} objects
 */
function getPortsInUse() {
  return PortPool.getPortsInUseFromRange(ANYTHINGLLM_PORT_START, ANYTHINGLLM_PORT_END);
}

/**
 * Get pool statistics for AnythingLLM services
 * 
 * @returns {Object} Statistics about AnythingLLM port pool
 */
function getStats() {
  return PortPool.getRangeStats(
    ANYTHINGLLM_PORT_START,
    ANYTHINGLLM_PORT_END,
    'ANYTHINGLLM'
  );
}

/**
 * Release all AnythingLLM ports (emergency cleanup)
 * WARNING: Only use this for cleanup/shutdown
 * 
 * @returns {number} Number of ports that were released
 */
function releaseAllPorts() {
  console.log('[PortPool:AnythingLLM] Releasing all AnythingLLM ports...');
  
  const count = PortPool.releaseRangePorts(ANYTHINGLLM_PORT_START, ANYTHINGLLM_PORT_END);
  
  console.log(`[PortPool:AnythingLLM] Released ${count} AnythingLLM port(s)`);
  
  return count;
}

/**
 * Log current port usage statistics
 * @private
 */
function logStats() {
  const portsInUse = getPortsInUse();
  console.log(`[PortPool:AnythingLLM] Ports in use: ${portsInUse.length}/${TOTAL_ANYTHINGLLM_PORTS}`);
}

/**
 * Initialize the AnythingLLM port pool (called on module load)
 * @private
 */
function initialize() {
  console.log('[PortPool:AnythingLLM] Initialized AnythingLLM port range:');
  console.log(`[PortPool:AnythingLLM]   ANYTHINGLLM: ${ANYTHINGLLM_PORT_START}-${ANYTHINGLLM_PORT_END} (${TOTAL_ANYTHINGLLM_PORTS} ports)`);
}

// Initialize on module load
initialize();

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Primary methods
  getAnythingLLMPort,
  releasePort,
  isPortAvailable,
  
  // Query methods
  getPortsInUse,
  getStats,
  
  // Cleanup
  releaseAllPorts,
  
  // Constants (read-only)
  ANYTHINGLLM_PORT_START,
  ANYTHINGLLM_PORT_END,
  TOTAL_ANYTHINGLLM_PORTS
};
