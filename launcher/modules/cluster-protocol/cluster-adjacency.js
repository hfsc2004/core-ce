/**
 * PSF Cluster Protocol - Adjacency Manager
 * Node discovery via mDNS and static configuration
 * 
 * @module cluster-adjacency
 * @version 1.1.2 - March 5, 2026
 */

const protocol = require('./cluster-protocol');

// Adjacency states (IS-IS style)
const ADJACENCY_STATE = {
  DOWN: 'down',
  INIT: 'init',
  UP: 'up'
};

// Configuration
const CONFIG = {
  SERVICE_TYPE: '_psf-cluster._tcp.local',
  PORT: 52400,
  HELLO_INTERVAL: 10000,  // 10 seconds
  DEAD_INTERVAL: 30000,   // 30 seconds
  DIS_PRIORITY_DEFAULT: 64
};

// State
let localSystemId = null;
let adjacencies = new Map();  // systemId -> adjacency
let mdnsBrowser = null;
let helloTimer = null;
let initialized = false;

/**
 * Initialize adjacency manager
 * @param {Object} options - Init options
 */
async function initialize(options = {}) {
  if (initialized) return;
  
  localSystemId = options.systemId || protocol.generateSystemId();
  
  // Try mDNS discovery
  if (options.mdns !== false) {
    await initializeMdns();
  }
  
  // Load static peers
  if (options.staticPeers) {
    for (const peer of options.staticPeers) {
      addStaticPeer(peer);
    }
  }
  
  // Start hello timer
  helloTimer = setInterval(sendHellos, CONFIG.HELLO_INTERVAL);
  
  initialized = true;
  console.log(`[Cluster:Adjacency] Initialized with systemId: ${localSystemId}`);
}

/**
 * Initialize mDNS discovery
 */
async function initializeMdns() {
  try {
    // Dynamic import of multicast-dns
    const mdns = require('multicast-dns')();
    
    // Advertise our presence
    mdns.on('query', (query) => {
      const dominated = query.questions.some(q => 
        q.name === CONFIG.SERVICE_TYPE && q.type === 'PTR'
      );
      
      if (dominated) {
        mdns.respond({
          answers: [{
            name: CONFIG.SERVICE_TYPE,
            type: 'PTR',
            data: `${localSystemId}.${CONFIG.SERVICE_TYPE}`
          }, {
            name: `${localSystemId}.${CONFIG.SERVICE_TYPE}`,
            type: 'SRV',
            data: {
              port: CONFIG.PORT,
              target: localSystemId
            }
          }]
        });
      }
    });
    
    // Listen for other nodes
    mdns.on('response', (response) => {
      for (const answer of response.answers) {
        if (answer.type === 'SRV' && answer.name.includes(CONFIG.SERVICE_TYPE)) {
          const systemId = answer.name.split('.')[0];
          if (systemId !== localSystemId) {
            handleDiscovery(systemId, answer.data);
          }
        }
      }
    });
    
    // Query for existing nodes
    mdns.query({
      questions: [{
        name: CONFIG.SERVICE_TYPE,
        type: 'PTR'
      }]
    });
    
    mdnsBrowser = mdns;
    console.log('[Cluster:Adjacency] mDNS discovery active');
  } catch (err) {
    console.warn('[Cluster:Adjacency] mDNS unavailable:', err.message);
  }
}

/**
 * Add static peer
 * @param {Object} peer - Peer configuration
 */
function addStaticPeer(peer) {
  const adj = {
    systemId: peer.systemId,
    address: peer.address,
    port: peer.port || CONFIG.PORT,
    state: ADJACENCY_STATE.DOWN,
    priority: peer.priority || CONFIG.DIS_PRIORITY_DEFAULT,
    lastHello: 0,
    static: true
  };
  
  adjacencies.set(peer.systemId, adj);
  console.log(`[Cluster:Adjacency] Added static peer: ${peer.systemId}`);
}

/**
 * Handle discovered node
 * @param {string} systemId - Discovered system ID
 * @param {Object} data - Discovery data
 */
function handleDiscovery(systemId, data) {
  if (!adjacencies.has(systemId)) {
    const adj = {
      systemId,
      address: data.target,
      port: data.port || CONFIG.PORT,
      state: ADJACENCY_STATE.DOWN,
      priority: CONFIG.DIS_PRIORITY_DEFAULT,
      lastHello: 0,
      static: false
    };
    
    adjacencies.set(systemId, adj);
    console.log(`[Cluster:Adjacency] Discovered node: ${systemId}`);
  }
}

/**
 * Process received IIH (Hello)
 * @param {Object} iih - IIH PDU
 * @param {string} fromAddress - Source address
 */
function processIIH(iih, fromAddress) {
  const systemId = iih.systemId;
  
  let adj = adjacencies.get(systemId);
  if (!adj) {
    adj = {
      systemId,
      address: fromAddress,
      port: CONFIG.PORT,
      state: ADJACENCY_STATE.DOWN,
      priority: iih.priority || CONFIG.DIS_PRIORITY_DEFAULT,
      lastHello: 0,
      static: false
    };
    adjacencies.set(systemId, adj);
  }
  
  // Update adjacency
  adj.lastHello = Date.now();
  adj.priority = iih.priority;
  adj.flags = iih.flags;
  
  // State machine
  if (adj.state === ADJACENCY_STATE.DOWN) {
    adj.state = ADJACENCY_STATE.INIT;
    console.log(`[Cluster:Adjacency] ${systemId}: DOWN -> INIT`);
  } else if (adj.state === ADJACENCY_STATE.INIT) {
    // Check if they see us (bidirectional)
    const seesUs = iih.tlvs?.some(tlv => 
      tlv.type === protocol.TLV_TYPES.IS_NEIGHBORS && 
      tlv.value?.includes(localSystemId)
    );
    
    if (seesUs) {
      adj.state = ADJACENCY_STATE.UP;
      console.log(`[Cluster:Adjacency] ${systemId}: INIT -> UP`);
      electDIS();
    }
  }
}

/**
 * Send hello to all adjacencies
 */
function sendHellos() {
  const iih = protocol.createIIH({
    systemId: localSystemId,
    priority: CONFIG.DIS_PRIORITY_DEFAULT,
    tlvs: [
      {
        type: protocol.TLV_TYPES.IS_NEIGHBORS,
        value: getUpAdjacencies().map(a => a.systemId)
      }
    ]
  });
  
  // STUB: Would broadcast/unicast to all adjacencies
  for (const [systemId, adj] of adjacencies) {
    // sendToNode(adj.address, adj.port, iih);
  }
  
  // Check for dead adjacencies
  checkDeadAdjacencies();
}

/**
 * Check for dead adjacencies
 */
function checkDeadAdjacencies() {
  const now = Date.now();
  
  for (const [systemId, adj] of adjacencies) {
    if (adj.state !== ADJACENCY_STATE.DOWN && 
        now - adj.lastHello > CONFIG.DEAD_INTERVAL) {
      adj.state = ADJACENCY_STATE.DOWN;
      console.log(`[Cluster:Adjacency] ${systemId}: -> DOWN (timeout)`);
      electDIS();
    }
  }
}

/**
 * Elect Designated IS (coordinator)
 * Highest priority wins, tie-breaker: higher system ID
 */
function electDIS() {
  const upAdjs = getUpAdjacencies();
  
  // Include ourselves
  const candidates = [
    { systemId: localSystemId, priority: CONFIG.DIS_PRIORITY_DEFAULT },
    ...upAdjs.map(a => ({ systemId: a.systemId, priority: a.priority }))
  ];
  
  // Sort by priority (desc), then systemId (desc)
  candidates.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    return b.systemId.localeCompare(a.systemId);
  });
  
  const dis = candidates[0];
  console.log(`[Cluster:Adjacency] DIS elected: ${dis.systemId}`);
  
  return dis.systemId;
}

/**
 * Get all UP adjacencies
 * @returns {Array} UP adjacencies
 */
function getUpAdjacencies() {
  return Array.from(adjacencies.values())
    .filter(a => a.state === ADJACENCY_STATE.UP);
}

/**
 * Get all adjacencies
 * @returns {Array} All adjacencies
 */
function getAllAdjacencies() {
  return Array.from(adjacencies.values());
}

/**
 * Shutdown adjacency manager
 */
function shutdown() {
  if (helloTimer) {
    clearInterval(helloTimer);
    helloTimer = null;
  }
  
  if (mdnsBrowser) {
    mdnsBrowser.destroy();
    mdnsBrowser = null;
  }
  
  adjacencies.clear();
  initialized = false;
  console.log('[Cluster:Adjacency] Shutdown complete');
}

module.exports = {
  ADJACENCY_STATE,
  CONFIG,
  initialize,
  addStaticPeer,
  processIIH,
  electDIS,
  getUpAdjacencies,
  getAllAdjacencies,
  shutdown
};
