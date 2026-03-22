/**
 * PSF Cluster Protocol - Election Manager
 * Designated IS (Coordinator) election logic
 * 
 * @module cluster-election
 * @version 1.1.2 - March 5, 2026
 */

const adjacency = require('./cluster-adjacency');
const protocol = require('./cluster-protocol');

// Election state
let currentDIS = null;
let localSystemId = null;
let localPriority = 64;
let isLocalDIS = false;

/**
 * Initialize election manager
 * @param {Object} options - Init options
 */
function initialize(options = {}) {
  localSystemId = options.systemId;
  localPriority = options.priority || 64;
  
  console.log('[Cluster:Election] Initialized');
}

/**
 * Run DIS election
 * IS-IS style: Highest priority wins, preemptive
 * @returns {Object} Election result
 */
function runElection() {
  const upAdjs = adjacency.getUpAdjacencies();
  
  // Build candidate list (include self)
  const candidates = [
    {
      systemId: localSystemId,
      priority: localPriority,
      local: true
    },
    ...upAdjs.map(adj => ({
      systemId: adj.systemId,
      priority: adj.priority || 64,
      local: false
    }))
  ];
  
  // Filter out overloaded nodes
  const eligible = candidates.filter(c => {
    const adj = adjacency.getAllAdjacencies().find(a => a.systemId === c.systemId);
    if (!adj) return true;  // Local node
    return !(adj.flags & protocol.FLAGS.OVERLOAD);
  });
  
  if (eligible.length === 0) {
    console.warn('[Cluster:Election] No eligible candidates');
    return { dis: null, reason: 'no_eligible' };
  }
  
  // Sort: priority desc, then systemId desc (tie-breaker)
  eligible.sort((a, b) => {
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }
    return b.systemId.localeCompare(a.systemId);
  });
  
  const winner = eligible[0];
  const previousDIS = currentDIS;
  
  currentDIS = winner.systemId;
  isLocalDIS = winner.local;
  
  const result = {
    dis: currentDIS,
    isLocal: isLocalDIS,
    priority: winner.priority,
    candidates: eligible.length,
    changed: previousDIS !== currentDIS
  };
  
  if (result.changed) {
    console.log(`[Cluster:Election] DIS changed: ${previousDIS || 'none'} -> ${currentDIS}`);
    if (isLocalDIS) {
      onBecomeDIS();
    } else if (previousDIS === localSystemId) {
      onResignDIS();
    }
  }
  
  return result;
}

/**
 * Handle becoming DIS
 */
function onBecomeDIS() {
  console.log('[Cluster:Election] This node is now DIS');
  // Would start coordinator duties:
  // - Sending CSNPs
  // - Managing LSP database
  // - Coordinating task routing
}

/**
 * Handle resigning as DIS
 */
function onResignDIS() {
  console.log('[Cluster:Election] This node resigned as DIS');
  // Would stop coordinator duties
}

/**
 * Set local priority
 * @param {number} priority - New priority (0-127)
 */
function setLocalPriority(priority) {
  localPriority = Math.max(0, Math.min(127, priority));
  console.log(`[Cluster:Election] Local priority set to ${localPriority}`);
  
  // Trigger re-election if we might become DIS
  if (localPriority > 64) {
    runElection();
  }
}

/**
 * Get current DIS
 * @returns {Object} Current DIS info
 */
function getCurrentDIS() {
  return {
    systemId: currentDIS,
    isLocal: isLocalDIS
  };
}

/**
 * Check if local node is DIS
 * @returns {boolean}
 */
function isLocalNodeDIS() {
  return isLocalDIS;
}

/**
 * Force election (for testing/recovery)
 */
function forceElection() {
  console.log('[Cluster:Election] Forcing election');
  currentDIS = null;
  isLocalDIS = false;
  return runElection();
}

module.exports = {
  initialize,
  runElection,
  setLocalPriority,
  getCurrentDIS,
  isLocalNodeDIS,
  forceElection
};
