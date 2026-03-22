/**
 * PSF Swarm Client - Enterprise Desktop -> Data Center bridge (stub)
 *
 * Policy: See EditionSecurityPolicy_1_0_38b.md for edition cluster-join rules.
 * @module swarm-client
 * @version 1.1.2 - March 5, 2026
 */

const auth = require('./swarm-auth');
const routing = require('./swarm-routing');
const fallback = require('./swarm-fallback');

let state = {
  initialized: false,
  endpoint: null,
  connected: false,
  edition: String(process.env.PSF_EDITION || 'standard').toLowerCase(),
  policy: { mode: 'prefer-local' }
};

function canJoinCluster(edition) {
  return edition !== 'standard';
}

async function initialize(options = {}) {
  const edition = String(options.edition || process.env.PSF_EDITION || state.edition || 'standard').toLowerCase();
  state = {
    ...state,
    initialized: true,
    edition,
    endpoint: options.endpoint || process.env.PSF_SWARM_ENDPOINT || null,
    policy: { ...state.policy, ...(options.policy || {}) }
  };

  if (!canJoinCluster(edition)) {
    state.connected = false;
    console.log('[SwarmClient] Disabled for standard edition');
    return { success: false, error: 'cluster_join_not_allowed_for_standard' };
  }

  console.log('[SwarmClient] Initialized (stub)', { endpoint: state.endpoint, policy: state.policy, edition });
  return { success: true };
}

async function connect(options = {}) {
  if (!state.initialized) await initialize(options);

  if (!canJoinCluster(state.edition)) {
    state.connected = false;
    return { success: false, error: 'cluster_join_not_allowed_for_standard' };
  }

  const authResult = await auth.getAuthHeaders(options);
  if (!authResult.success) {
    state.connected = false;
    return { success: false, error: authResult.error };
  }

  state.connected = !!state.endpoint;
  return {
    success: state.connected,
    connected: state.connected,
    reason: state.connected ? 'stub_endpoint_present' : 'no_endpoint'
  };
}

async function dispatch(task = {}, options = {}) {
  if (!canJoinCluster(state.edition)) {
    return { success: false, error: 'cluster_dispatch_not_allowed_for_standard' };
  }

  const decision = routing.chooseRoute(task, { ...state.policy, ...(options.policy || {}) });
  if (decision.route === 'local') {
    return { success: true, route: 'local', reason: decision.reason };
  }

  if (!state.connected) {
    return fallback.onSwarmUnavailable(task, options.fallback || {});
  }

  return {
    success: false,
    route: 'swarm',
    error: 'swarm_dispatch_stub_unimplemented',
    reason: decision.reason
  };
}

function getStatus() {
  return { ...state };
}

function shutdown() {
  state.connected = false;
  state.initialized = false;
}

module.exports = {
  initialize,
  connect,
  dispatch,
  getStatus,
  shutdown,
  canJoinCluster
};
