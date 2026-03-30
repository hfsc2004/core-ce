/**
 * PSF Security Layer - RBAC (Core - Community Edition)
 * Role-Based Access Control for enterprise deployments
 * 
 * @module security-rbac
 * @version 1.1.3 - March 5, 2026
 */

const fs = require('fs');
const path = require('path');

// Role definitions
const ROLES = {
  viewer: {
    name: 'viewer',
    permissions: [
      'rag:query',
      'git:read',
      'model:chat',
      'cluster:view'
    ]
  },
  developer: {
    name: 'developer',
    permissions: [
      'rag:query', 'rag:index',
      'git:read', 'git:commit', 'git:branch',
      'model:chat',
      'cluster:view'
    ]
  },
  admin: {
    name: 'admin',
    permissions: [
      'rag:query', 'rag:index', 'rag:delete', 'rag:config',
      'git:read', 'git:commit', 'git:branch', 'git:push', 'git:admin',
      'model:chat', 'model:config',
      'cluster:view', 'cluster:manage'
    ]
  }
};

// User-role mappings (loaded from config)
let userRoles = {};
let auditLogPath = null;

/**
 * Initialize RBAC security
 */
async function initialize() {
  // Load RBAC policy
  const policyPath = path.join(process.cwd(), 'config', 'rbac-policy.json');
  
  if (fs.existsSync(policyPath)) {
    try {
      const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
      userRoles = policy.users || {};
      auditLogPath = policy.auditLog || path.join(process.cwd(), 'logs', 'security-audit.log');
      console.log('[Security:RBAC] Policy loaded with', Object.keys(userRoles).length, 'users');
    } catch (err) {
      console.error('[Security:RBAC] Policy load error:', err.message);
      userRoles = { default: 'developer' };
    }
  } else {
    console.warn('[Security:RBAC] No policy file, using defaults');
    userRoles = { default: 'developer' };
  }
  
  // Ensure audit log directory exists
  if (auditLogPath) {
    const logDir = path.dirname(auditLogPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }
  
  console.log('[Security:RBAC] Core - Community Edition initialized');
}

/**
 * Check if permission is allowed for current user
 * @param {string} permission - Permission to check
 * @param {Object} context - Request context
 * @returns {Promise<boolean>} True if allowed
 */
async function checkPermission(permission, context = {}) {
  const role = getCurrentRole(context);
  const roleConfig = ROLES[role];
  
  if (!roleConfig) {
    auditLog('permission_denied', { permission, reason: 'unknown_role', role });
    return false;
  }
  
  const allowed = roleConfig.permissions.includes(permission);
  
  if (!allowed) {
    auditLog('permission_denied', { permission, role });
  }
  
  return allowed;
}

/**
 * Get current user's role
 * @param {Object} context - Request context
 * @returns {string} Role name
 */
function getCurrentRole(context = {}) {
  const userId = context.userId || context.user || 'default';
  return userRoles[userId] || userRoles.default || 'viewer';
}

/**
 * Set user role (admin only)
 * @param {string} userId - User ID
 * @param {string} role - Role to assign
 * @returns {boolean} Success
 */
function setUserRole(userId, role) {
  if (!ROLES[role]) {
    return false;
  }
  
  userRoles[userId] = role;
  auditLog('role_changed', { userId, role });
  savePolicy();
  return true;
}

/**
 * Save policy to disk
 */
function savePolicy() {
  const policyPath = path.join(process.cwd(), 'config', 'rbac-policy.json');
  try {
    fs.writeFileSync(policyPath, JSON.stringify({ users: userRoles, auditLog: auditLogPath }, null, 2));
  } catch (err) {
    console.error('[Security:RBAC] Policy save error:', err.message);
  }
}

/**
 * Write to audit log
 * @param {string} action - Action performed
 * @param {Object} details - Action details
 */
function auditLog(action, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    action,
    ...details
  };
  
  console.log('[Security:Audit]', JSON.stringify(entry));
  
  if (auditLogPath) {
    try {
      fs.appendFileSync(auditLogPath, JSON.stringify(entry) + '\n');
    } catch (err) {
      console.error('[Security:RBAC] Audit write error:', err.message);
    }
  }
}

/**
 * Get all roles
 * @returns {Object} Role definitions
 */
function getRoles() {
  return { ...ROLES };
}

module.exports = {
  initialize,
  checkPermission,
  getCurrentRole,
  setUserRole,
  auditLog,
  getRoles
};
