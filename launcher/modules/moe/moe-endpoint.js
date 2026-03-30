/**
 * ============================================================================
 * MOE ENDPOINT MANAGER
 * ============================================================================
 * 
 * Handles endpoint addressing for MoE agents across:
 * - Local TCP (IPv4/IPv6)
 * - Unix sockets (Enterprise local)
 * - Remote peers (LAN/WireGuard)
 * 
 * BMOC uses this module to build URLs for agent communication.
 * Designed for Single Edition (localhost) but ready for Enterprise.
 * 
 * @module moe-endpoint
 * @version 1.1.3 - March 5, 2026
 * @license SEE LICENSE.txt
 * ============================================================================
 */

// ============================================================================
// ENDPOINT TYPE DEFINITIONS
// ============================================================================

/**
 * Endpoint types supported by the system
 */
const ENDPOINT_TYPES = {
  LOCAL: 'local',           // Same machine, TCP port
  UNIX_SOCKET: 'unix',      // Same machine, Unix socket (faster)
  REMOTE: 'remote',         // Different machine (LAN or WireGuard)
};

/**
 * Protocol types
 */
const PROTOCOLS = {
  HTTP: 'http',
  HTTPS: 'https'
};

// ============================================================================
// ENDPOINT FACTORY
// ============================================================================

/**
 * Create a local TCP endpoint (IPv4)
 * 
 * @param {number} port - Port number
 * @param {string} [host='127.0.0.1'] - Host address
 * @returns {Object} Endpoint configuration
 */
function createLocalEndpoint(port, host = '127.0.0.1') {
  return {
    type: ENDPOINT_TYPES.LOCAL,
    host: host,
    port: port,
    socket: null,
    protocol: PROTOCOLS.HTTP
  };
}

/**
 * Create a local IPv6 endpoint
 * 
 * @param {number} port - Port number
 * @param {string} [host='::1'] - IPv6 host address
 * @returns {Object} Endpoint configuration
 */
function createLocalIPv6Endpoint(port, host = '::1') {
  return {
    type: ENDPOINT_TYPES.LOCAL,
    host: host,
    port: port,
    socket: null,
    protocol: PROTOCOLS.HTTP
  };
}

/**
 * Create a Unix socket endpoint (Enterprise)
 * 
 * @param {string} socketPath - Full path to socket file
 * @returns {Object} Endpoint configuration
 */
function createUnixSocketEndpoint(socketPath) {
  return {
    type: ENDPOINT_TYPES.UNIX_SOCKET,
    host: null,
    port: null,
    socket: socketPath,
    protocol: PROTOCOLS.HTTP
  };
}

/**
 * Create a remote endpoint (LAN or WireGuard peer)
 * 
 * @param {string} host - Remote host (IPv4, IPv6, or hostname)
 * @param {number} port - Port number
 * @param {boolean} [secure=false] - Use HTTPS
 * @returns {Object} Endpoint configuration
 */
function createRemoteEndpoint(host, port, secure = false) {
  return {
    type: ENDPOINT_TYPES.REMOTE,
    host: host,
    port: port,
    socket: null,
    protocol: secure ? PROTOCOLS.HTTPS : PROTOCOLS.HTTP
  };
}

// ============================================================================
// URL BUILDING
// ============================================================================

/**
 * Check if a host string is IPv6
 * 
 * @param {string} host - Host string to check
 * @returns {boolean} True if IPv6
 */
function isIPv6(host) {
  if (!host) return false;
  // IPv6 contains colons (but not in IPv4:port format)
  return host.includes(':') && !host.match(/^\d+\.\d+\.\d+\.\d+$/);
}

/**
 * Format host for URL (brackets for IPv6)
 * 
 * @param {string} host - Host address
 * @returns {string} Formatted host
 */
function formatHostForURL(host) {
  if (!host) return null;
  
  // Already bracketed
  if (host.startsWith('[') && host.endsWith(']')) {
    return host;
  }
  
  // IPv6 needs brackets
  if (isIPv6(host)) {
    return `[${host}]`;
  }
  
  return host;
}

/**
 * Build URL from endpoint configuration
 * Handles IPv4, IPv6, and Unix sockets
 * 
 * @param {Object} endpoint - Endpoint configuration
 * @param {string} [path='/api/chat'] - API path
 * @returns {string} Complete URL
 * @throws {Error} If endpoint configuration is invalid
 */
function buildEndpointURL(endpoint, path = '/api/chat') {
  if (!endpoint) {
    throw new Error('Endpoint configuration is required');
  }
  
  // Unix socket - special format
  if (endpoint.type === ENDPOINT_TYPES.UNIX_SOCKET || endpoint.socket) {
    if (!endpoint.socket) {
      throw new Error('Unix socket endpoint requires socket path');
    }
    // Format: http://unix:/path/to/socket:/api/path
    return `http://unix:${endpoint.socket}:${path}`;
  }
  
  // TCP endpoint (local or remote)
  if (!endpoint.host || !endpoint.port) {
    throw new Error('TCP endpoint requires host and port');
  }
  
  const protocol = endpoint.protocol || PROTOCOLS.HTTP;
  const host = formatHostForURL(endpoint.host);
  
  return `${protocol}://${host}:${endpoint.port}${path}`;
}

/**
 * Build Ollama-specific chat URL
 * 
 * @param {Object} endpoint - Endpoint configuration
 * @returns {string} Ollama chat API URL
 */
function buildOllamaChatURL(endpoint) {
  return buildEndpointURL(endpoint, '/api/chat');
}

/**
 * Build Ollama-specific generate URL
 * 
 * @param {Object} endpoint - Endpoint configuration
 * @returns {string} Ollama generate API URL
 */
function buildOllamaGenerateURL(endpoint) {
  return buildEndpointURL(endpoint, '/api/generate');
}

/**
 * Build Ollama tags (model list) URL
 * 
 * @param {Object} endpoint - Endpoint configuration
 * @returns {string} Ollama tags API URL
 */
function buildOllamaTagsURL(endpoint) {
  return buildEndpointURL(endpoint, '/api/tags');
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate an endpoint configuration
 * 
 * @param {Object} endpoint - Endpoint to validate
 * @returns {Object} { valid: boolean, errors: string[] }
 */
function validateEndpoint(endpoint) {
  const errors = [];
  
  if (!endpoint) {
    return { valid: false, errors: ['Endpoint is null or undefined'] };
  }
  
  // Check type
  if (!Object.values(ENDPOINT_TYPES).includes(endpoint.type)) {
    errors.push(`Invalid endpoint type: ${endpoint.type}`);
  }
  
  // Type-specific validation
  if (endpoint.type === ENDPOINT_TYPES.UNIX_SOCKET) {
    if (!endpoint.socket) {
      errors.push('Unix socket endpoint requires socket path');
    }
  } else {
    // TCP endpoint
    if (!endpoint.host) {
      errors.push('TCP endpoint requires host');
    }
    if (!endpoint.port) {
      errors.push('TCP endpoint requires port');
    }
    if (endpoint.port && (endpoint.port < 1 || endpoint.port > 65535)) {
      errors.push(`Invalid port number: ${endpoint.port}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate IPv4 address format
 * 
 * @param {string} ip - IP address to validate
 * @returns {boolean} True if valid IPv4
 */
function isValidIPv4(ip) {
  if (!ip) return false;
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  return parts.every(part => {
    const num = parseInt(part, 10);
    return num >= 0 && num <= 255 && part === num.toString();
  });
}

/**
 * Validate IPv6 address format (simplified)
 * 
 * @param {string} ip - IP address to validate
 * @returns {boolean} True if valid IPv6
 */
function isValidIPv6(ip) {
  if (!ip) return false;
  // Remove brackets if present
  const clean = ip.replace(/^\[|\]$/g, '');
  // Basic IPv6 pattern (not exhaustive but catches most cases)
  const ipv6Pattern = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  return ipv6Pattern.test(clean) || clean === '::1' || clean === '::';
}

// ============================================================================
// NETWORK IDENTITY (Enterprise - Stubbed)
// ============================================================================

/**
 * Create a network identity for an agent (Enterprise)
 * Stubbed for future WireGuard integration
 * 
 * @param {Object} options - Network configuration
 * @returns {Object} Network identity
 */
function createNetworkIdentity(options = {}) {
  return {
    ipv4: options.ipv4 || null,
    ipv6: options.ipv6 || null,
    hostname: options.hostname || null,
    wireguard: options.wireguard || null
    // Future: WireGuard config
    // wireguard: {
    //   address: '10.0.0.x',
    //   publicKey: 'xxx',
    //   endpoint: 'peer:51820'
    // }
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Constants
  ENDPOINT_TYPES,
  PROTOCOLS,
  
  // Factories
  createLocalEndpoint,
  createLocalIPv6Endpoint,
  createUnixSocketEndpoint,
  createRemoteEndpoint,
  createNetworkIdentity,
  
  // URL Building
  buildEndpointURL,
  buildOllamaChatURL,
  buildOllamaGenerateURL,
  buildOllamaTagsURL,
  formatHostForURL,
  
  // Validation
  validateEndpoint,
  isIPv6,
  isValidIPv4,
  isValidIPv6
};
