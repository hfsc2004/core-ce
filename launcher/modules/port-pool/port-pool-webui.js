/**
 * ============================================================================
 * PORT POOL MANAGER - OPEN WEBUI SERVICE
 * ============================================================================
 * 
 * Manages port allocation for Open WebUI (Python WebUI) services.
 * Port range: 52460-52469 (10 ports)
 * 
 * Builds on core port-pool.js for allocation logic.
 * 
 * @module port-pool-webui
 * @version 1.1.2 - March 5, 2026
 * @license SEE LICENSE.txt
 * ============================================================================
 */

const PortPool = require('./port-pool');

// ============================================================================
// CONFIGURATION
// ============================================================================

// WebUI Port Range (for Open WebUI / Python WebUI instances)
const WEBUI_PORT_START = 52460;
const WEBUI_PORT_END = 52469;
const TOTAL_WEBUI_PORTS = WEBUI_PORT_END - WEBUI_PORT_START + 1; // 10 ports

// ============================================================================
// PORT ALLOCATION FUNCTIONS
// ============================================================================

/**
 * Get the next available WEBUI port
 * 
 * @param {string} owner - Optional description of who is using this port
 * @returns {number|null} Port number, or null if pool is exhausted
 */
function getWebUIPort(owner = 'Open WebUI') {
  const port = PortPool.allocatePort(
    WEBUI_PORT_START,
    WEBUI_PORT_END,
    owner,
    'webui',
    'WEBUI'
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
  // Check if port is in valid WebUI range
  if (port < WEBUI_PORT_START || port > WEBUI_PORT_END) {
    console.warn(`[PortPool:WebUI] Port ${port} is outside valid WebUI range (${WEBUI_PORT_START}-${WEBUI_PORT_END})`);
    return false;
  }
  
  return PortPool.isPortAvailable(port);
}

/**
 * Get all WebUI ports currently in use
 * 
 * @returns {Array<Object>} Array of {port, owner, allocated, allocatedSince, type} objects
 */
function getPortsInUse() {
  return PortPool.getPortsInUseFromRange(WEBUI_PORT_START, WEBUI_PORT_END);
}

/**
 * Get pool statistics for WebUI services
 * 
 * @returns {Object} Statistics about WebUI port pool
 */
function getStats() {
  return PortPool.getRangeStats(
    WEBUI_PORT_START,
    WEBUI_PORT_END,
    'WEBUI'
  );
}

/**
 * Release all WebUI ports (emergency cleanup)
 * WARNING: Only use this for cleanup/shutdown
 * 
 * @returns {number} Number of ports that were released
 */
function releaseAllPorts() {
  console.log('[PortPool:WebUI] Releasing all WebUI ports...');
  
  const count = PortPool.releaseRangePorts(WEBUI_PORT_START, WEBUI_PORT_END);
  
  console.log(`[PortPool:WebUI] Released ${count} WebUI port(s)`);
  
  return count;
}

/**
 * Log current port usage statistics
 * @private
 */
function logStats() {
  const portsInUse = getPortsInUse();
  console.log(`[PortPool:WebUI] Ports in use: ${portsInUse.length}/${TOTAL_WEBUI_PORTS}`);
}

/**
 * Initialize the WebUI port pool (called on module load)
 * @private
 */
function initialize() {
  console.log('[PortPool:WebUI] Initialized WebUI port range:');
  console.log(`[PortPool:WebUI]   WEBUI: ${WEBUI_PORT_START}-${WEBUI_PORT_END} (${TOTAL_WEBUI_PORTS} ports)`);
}

// Initialize on module load
initialize();

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Primary methods
  getWebUIPort,
  releasePort,
  isPortAvailable,
  
  // Query methods
  getPortsInUse,
  getStats,
  
  // Cleanup
  releaseAllPorts,
  
  // Constants (read-only)
  WEBUI_PORT_START,
  WEBUI_PORT_END,
  TOTAL_WEBUI_PORTS
};
