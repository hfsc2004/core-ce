/**
 * ============================================================================
 * PORT POOL MANAGER - CORE ENGINE
 * ============================================================================
 * 
 * Generic port allocation/release engine with no service-specific logic.
 * 
 * This is the foundation that service-specific managers build upon:
 * - port-pool-ollama.js (SERVER 52434-52443, TERMINAL 52450-52459)
 * - port-pool-webui.js (WEBUI 52460-52469)
 * - port-pool-anythingllm.js (ANYTHINGLLM 52470-52479)
 * 
 * "Good House Guest" philosophy:
 * - Dynamic port allocation from managed pools
 * - Automatic cleanup on release
 * - No hardcoded ports
 * - Safe for multiple concurrent services
 * 
 * @module port-pool
 * @version 1.1.2 - March 5, 2026
 * @license SEE LICENSE.txt
 * ============================================================================
 */

const fs = require('fs');

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

// Track which ports are currently in use
// Key: port number
// Value: { allocated: timestamp, owner: description, type: string, range: string }
const portsInUse = new Map();

// ============================================================================
// SYSTEM PORT AVAILABILITY (OS-LEVEL)
// ============================================================================

/**
 * Parse Linux /proc net tables and detect LISTEN state for a TCP port.
 *
 * @param {number} port
 * @returns {boolean} true when LISTEN socket exists for this port
 */
function isLinuxTcpPortListening(port) {
  const tables = ['/proc/net/tcp', '/proc/net/tcp6'];
  const targetHex = port.toString(16).toUpperCase().padStart(4, '0');

  for (const table of tables) {
    let content = '';
    try {
      content = fs.readFileSync(table, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n').slice(1);
    for (const line of lines) {
      if (!line.trim()) continue;

      const parts = line.trim().split(/\s+/);
      if (parts.length < 4) continue;

      const localAddress = parts[1] || '';
      const state = parts[3] || '';
      const localPortHex = localAddress.split(':')[1]?.toUpperCase();

      // 0A = TCP_LISTEN
      if (state === '0A' && localPortHex === targetHex) {
        return true;
      }
    }
  }

  return false;
}

/**
 * OS-level availability check.
 * Falls back to "unknown => available" on non-Linux to avoid false negatives.
 *
 * @param {number} port
 * @returns {boolean} true when port appears available at OS level
 */
function isSystemPortAvailable(port) {
  if (process.platform === 'linux') {
    return !isLinuxTcpPortListening(port);
  }
  return true;
}

// ============================================================================
// CORE PORT MANAGEMENT FUNCTIONS
// ============================================================================

/**
 * Allocate the next available port from a specific range
 * 
 * @param {number} rangeStart - First port in range (inclusive)
 * @param {number} rangeEnd - Last port in range (inclusive)
 * @param {string} owner - Description of who is using this port
 * @param {string} type - Type of service (e.g., 'ollama-server', 'webui', etc.)
 * @param {string} rangeName - Human-readable name for this range (for logging)
 * @returns {number|null} Port number, or null if range is exhausted
 */
function allocatePort(rangeStart, rangeEnd, owner, type, rangeName) {
  // Validate inputs
  if (!Number.isInteger(rangeStart) || !Number.isInteger(rangeEnd)) {
    console.error('[PortPool] ERROR: Range start/end must be integers');
    return null;
  }
  
  if (rangeStart > rangeEnd) {
    console.error('[PortPool] ERROR: Range start cannot be greater than range end');
    return null;
  }
  
  // Try each port in the range
  for (let port = rangeStart; port <= rangeEnd; port++) {
    if (!portsInUse.has(port) && isSystemPortAvailable(port)) {
      // Port is available - allocate it
      portsInUse.set(port, {
        allocated: Date.now(),
        owner: owner,
        type: type,
        range: rangeName
      });
      
      console.log(`[PortPool] Allocated port ${port} from ${rangeName} to: ${owner}`);
      
      return port;
    }
  }
  
  // Range is exhausted
  const totalPorts = rangeEnd - rangeStart + 1;
  console.error(`[PortPool] ERROR: All ${totalPorts} ports in ${rangeName} (${rangeStart}-${rangeEnd}) are in use!`);
  return null;
}

/**
 * Release a port back to the pool
 * 
 * @param {number} port - Port number to release
 * @returns {boolean} True if port was released, false if it wasn't allocated
 */
function releasePort(port) {
  if (portsInUse.has(port)) {
    const portInfo = portsInUse.get(port);
    portsInUse.delete(port);
    
    console.log(`[PortPool] Released port ${port} (was: ${portInfo.owner})`);
    
    return true;
  } else {
    console.warn(`[PortPool] WARNING: Attempted to release port ${port} that wasn't allocated`);
    return false;
  }
}

/**
 * Check if a specific port is available
 * 
 * @param {number} port - Port number to check
 * @returns {boolean} True if available, false if in use
 */
function isPortAvailable(port) {
  return !portsInUse.has(port) && isSystemPortAvailable(port);
}

/**
 * Get all ports currently in use from a specific range
 * 
 * @param {number} rangeStart - First port in range (inclusive)
 * @param {number} rangeEnd - Last port in range (inclusive)
 * @returns {Array<Object>} Array of {port, owner, allocated, allocatedSince, type} objects
 */
function getPortsInUseFromRange(rangeStart, rangeEnd) {
  const result = [];
  
  for (const [port, info] of portsInUse.entries()) {
    if (port >= rangeStart && port <= rangeEnd) {
      result.push({
        port: port,
        owner: info.owner,
        allocated: info.allocated,
        allocatedSince: Date.now() - info.allocated,
        type: info.type,
        range: info.range
      });
    }
  }
  
  return result;
}

/**
 * Get all ports currently in use (across all ranges)
 * 
 * @returns {Array<Object>} Array of {port, owner, allocated, allocatedSince, type} objects
 */
function getAllPortsInUse() {
  const result = [];
  
  for (const [port, info] of portsInUse.entries()) {
    result.push({
      port: port,
      owner: info.owner,
      allocated: info.allocated,
      allocatedSince: Date.now() - info.allocated,
      type: info.type,
      range: info.range
    });
  }
  
  return result;
}

/**
 * Get statistics for a specific range
 * 
 * @param {number} rangeStart - First port in range (inclusive)
 * @param {number} rangeEnd - Last port in range (inclusive)
 * @param {string} rangeName - Human-readable name for this range
 * @returns {Object} Statistics about the port range
 */
function getRangeStats(rangeStart, rangeEnd, rangeName) {
  const portsInRange = getPortsInUseFromRange(rangeStart, rangeEnd);
  const totalPorts = rangeEnd - rangeStart + 1;
  
  return {
    rangeName: rangeName,
    rangeStart: rangeStart,
    rangeEnd: rangeEnd,
    totalPorts: totalPorts,
    portsInUse: portsInRange.length,
    portsAvailable: totalPorts - portsInRange.length,
    utilizationPercent: Math.round((portsInRange.length / totalPorts) * 100),
    ports: portsInRange
  };
}

/**
 * Release all ports in a specific range
 * 
 * @param {number} rangeStart - First port in range (inclusive)
 * @param {number} rangeEnd - Last port in range (inclusive)
 * @returns {number} Number of ports that were released
 */
function releaseRangePorts(rangeStart, rangeEnd) {
  let count = 0;
  
  for (let port = rangeStart; port <= rangeEnd; port++) {
    if (portsInUse.has(port)) {
      const portInfo = portsInUse.get(port);
      portsInUse.delete(port);
      console.log(`[PortPool] Released port ${port} (${portInfo.owner})`);
      count++;
    }
  }
  
  if (count > 0) {
    console.log(`[PortPool] Released ${count} port(s) from range ${rangeStart}-${rangeEnd}`);
  }
  
  return count;
}

/**
 * Release all ports (emergency cleanup)
 * WARNING: Only use this for cleanup/shutdown
 * 
 * @returns {number} Number of ports that were released
 */
function releaseAllPorts() {
  const count = portsInUse.size;
  
  console.log(`[PortPool] Releasing all ${count} allocated ports...`);
  
  for (const [port, info] of portsInUse.entries()) {
    console.log(`[PortPool]   - Port ${port} (${info.owner})`);
  }
  
  portsInUse.clear();
  console.log('[PortPool] All ports released');
  
  return count;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Core allocation/release
  allocatePort,
  releasePort,
  isPortAvailable,
  
  // Query functions
  getPortsInUseFromRange,
  getAllPortsInUse,
  getRangeStats,
  
  // Cleanup functions
  releaseRangePorts,
  releaseAllPorts
};
