/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
'use strict';

const PROFILE_RULES = Object.freeze({
  'standard-default': {
    denyAll: false,
    denyPrefixes: [],
    allowList: null
  },
  'enterprise-managed': {
    denyAll: false,
    denyPrefixes: ['voice.'],
    allowList: null
  },
  'datacenter-managed': {
    denyAll: false,
    denyPrefixes: ['voice.'],
    allowList: null
  },
  'government-baseline': {
    denyAll: true,
    denyPrefixes: [],
    allowList: ['ui.panel', 'commands.register', 'storage.scoped']
  },
  'government-dod-hardened': {
    denyAll: true,
    denyPrefixes: [],
    allowList: ['ui.panel', 'commands.register', 'storage.scoped']
  }
});

function resolveProfile({ edition = 'standard', preset = '' } = {}) {
  const normalizedEdition = String(edition || 'standard').toLowerCase();
  const normalizedPreset = String(preset || '').toLowerCase();

  if (normalizedEdition === 'government' && normalizedPreset === 'dod-hardened') {
    return 'government-dod-hardened';
  }
  if (normalizedEdition === 'government') return 'government-baseline';
  if (normalizedEdition === 'datacenter') return 'datacenter-managed';
  if (normalizedEdition === 'enterprise') return 'enterprise-managed';
  return 'standard-default';
}

function getProfileRule(profile) {
  return PROFILE_RULES[profile] || null;
}

function isCapabilityAllowed(profile, capability) {
  const c = String(capability || '').trim();
  if (!c) return false;
  const rule = getProfileRule(profile);
  if (!rule) return false;

  if (rule.denyAll) {
    return Array.isArray(rule.allowList) && rule.allowList.includes(c);
  }

  if (Array.isArray(rule.denyPrefixes) && rule.denyPrefixes.some((prefix) => c.startsWith(prefix))) {
    return false;
  }

  if (Array.isArray(rule.allowList)) return rule.allowList.includes(c);
  return true;
}

function requiresSignature(profile) {
  return true;
}

function evaluateCapabilities(profile, capabilities = []) {
  const rule = getProfileRule(profile);
  if (!rule) {
    return {
      ok: false,
      reason: 'unknown_profile',
      allowed: [],
      denied: [...capabilities]
    };
  }

  const allowed = [];
  const denied = [];
  for (const capability of capabilities) {
    if (isCapabilityAllowed(profile, capability)) allowed.push(capability);
    else denied.push(capability);
  }

  return {
    ok: true,
    profile,
    allowed,
    denied
  };
}

module.exports = {
  PROFILE_RULES,
  resolveProfile,
  getProfileRule,
  isCapabilityAllowed,
  requiresSignature,
  evaluateCapabilities
};
