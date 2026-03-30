/**
 * PSF Swarm Client - Auth (stub)
 *
 * @module swarm-auth
 * @version 1.1.3 - March 5, 2026
 */

function selectAuthMode(options = {}) {
  const preferred = String(options.authMode || process.env.PSF_SWARM_AUTH || 'token').toLowerCase();
  if (['oidc', 'saml', 'cac', 'token'].includes(preferred)) return preferred;
  return 'token';
}

async function getAuthHeaders(options = {}) {
  const mode = selectAuthMode(options);
  if (mode === 'cac') {
    return { success: false, error: 'cac_auth_stub_unimplemented', headers: {} };
  }
  return {
    success: true,
    mode,
    headers: {
      'x-psf-auth-mode': mode,
      'x-psf-client': 'enterprise-desktop-stub'
    }
  };
}

module.exports = {
  selectAuthMode,
  getAuthHeaders
};
