/**
 * PSF Cluster Protocol - Gateway (Enterprise/Desktop -> DC)
 *
 * STUB ONLY: contract for routing requests from clients into the
 * cluster coordinator API boundary.
 *
 * Policy: See EditionSecurityPolicy_1_0_38b.md for edition cluster-join rules.
 * @module cluster-gateway
 * @version 1.1.2 - March 5, 2026
 */

let initialized = false;
let config = {
  mode: 'stub',
  endpoint: null,
  auth: 'none',
  edition: String(process.env.PSF_EDITION || 'standard').toLowerCase()
};

function canUseGateway(edition) {
  return String(edition || '').toLowerCase() !== 'standard';
}

async function initialize(options = {}) {
  config = { ...config, ...options };
  initialized = true;
  console.log('[Cluster:Gateway] Initialized (stub)', config);
  return { success: true, mode: config.mode };
}

async function authorizeClient(context = {}) {
  if (!initialized) {
    return { allowed: false, reason: 'not_initialized' };
  }

  const edition = String(context.edition || config.edition || 'standard').toLowerCase();
  if (!canUseGateway(edition)) {
    return { allowed: false, reason: 'cluster_gateway_not_allowed_for_standard' };
  }

  return { allowed: true, reason: 'stub_allow' };
}

async function routeRequest(payload = {}, context = {}) {
  if (!initialized) {
    return { success: false, error: 'gateway_not_initialized' };
  }

  const authz = await authorizeClient(context);
  if (!authz.allowed) {
    return { success: false, error: authz.reason };
  }

  return {
    success: false,
    error: 'cluster_gateway_stub_unimplemented',
    payloadType: payload?.type || 'unknown'
  };
}

function getStatus() {
  return {
    initialized,
    config: { ...config }
  };
}

function shutdown() {
  initialized = false;
}

module.exports = {
  initialize,
  authorizeClient,
  routeRequest,
  getStatus,
  shutdown,
  canUseGateway
};
