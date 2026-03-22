/**
 * Version Manager branding/security helpers.
 */

const fs = require('fs');
const path = require('path');

function getBrandingConfigPath(fromPath) {
  return path.join(fromPath, 'config', 'version-branding.json');
}

function getDefaultBrandingMetadata() {
  return {
    companyName: 'Pseudo SF',
    productName: 'Pseudo Science Fiction - Core',
    website: 'https://pseudosf.com'
  };
}

function normalizeBrandingMetadata(input = {}) {
  const defaults = getDefaultBrandingMetadata();
  const out = { ...defaults };
  if (!input || typeof input !== 'object') return out;
  if (String(input.companyName || '').trim()) out.companyName = String(input.companyName).trim();
  if (String(input.productName || '').trim()) out.productName = String(input.productName).trim();
  if (String(input.website || '').trim()) out.website = String(input.website).trim();
  return out;
}

function detectMacProvider() {
  try {
    if (process.platform !== 'linux') return 'NONE';
    const selinuxEnforce = '/sys/fs/selinux/enforce';
    if (fs.existsSync(selinuxEnforce)) {
      return 'SELINUX';
    }
    const apparmorEnabled = '/sys/module/apparmor/parameters/enabled';
    if (fs.existsSync(apparmorEnabled)) {
      try {
        const marker = String(fs.readFileSync(apparmorEnabled, 'utf8') || '').trim().toUpperCase();
        if (marker.startsWith('Y')) return 'APPARMOR';
      } catch {
        return 'APPARMOR';
      }
    }
  } catch {
    // Fall through to NONE
  }
  return 'NONE';
}

function deriveSecurityProfile() {
  let edition = String(process.env.PSF_EDITION || '').trim().toLowerCase();
  let model = String(process.env.PSF_SECURITY_MODEL || '').trim().toLowerCase();
  try {
    const securityLayer = require('../security-layer/security-layer');
    if (!edition && typeof securityLayer.detectEdition === 'function') {
      edition = String(securityLayer.detectEdition() || '').trim().toLowerCase();
    }
    if (!model && typeof securityLayer.resolveSecurityModel === 'function') {
      model = String(securityLayer.resolveSecurityModel(edition || 'standard') || '').trim().toLowerCase();
    }
  } catch {
    // Keep env/default fallbacks only.
  }
  if (!edition) edition = 'standard';
  if (!model) {
    if (edition === 'standard') model = 'none';
    else if (edition === 'government') model = 'mac';
    else model = 'rbac';
  }

  const fipsRequested = String(process.env.PSF_FIPS_MODE || '').trim().toLowerCase() === 'true';
  const provider = detectMacProvider();

  let securityTag = 'Community Edition';
  if (edition === 'datacenter') {
    if (model === 'mac') {
      if (provider === 'SELINUX') securityTag = 'SEC:DATACENTER-HARDENED-RHEL';
      else if (provider === 'APPARMOR') securityTag = 'SEC:DATACENTER-HARDENED-DEBIAN';
      else securityTag = 'SEC:DATACENTER-HARDENED';
    } else {
      securityTag = 'SEC:DATACENTER-STANDARD';
    }
  } else if (edition === 'government') {
    if (provider === 'SELINUX') securityTag = 'SEC:GOV-STIG-BASELINE-RHEL';
    else if (provider === 'APPARMOR') securityTag = 'SEC:GOV-STIG-BASELINE-DEBIAN';
    else securityTag = 'SEC:GOV-STIG-BASELINE';
  } else if (edition === 'enterprise' || edition === 'standard') {
    if (model === 'mac') {
      if (provider === 'SELINUX') securityTag = 'Community Edition Hardened (RHEL)';
      else if (provider === 'APPARMOR') securityTag = 'Community Edition Hardened (Debian)';
      else securityTag = 'Community Edition Hardened';
    } else {
      securityTag = 'Community Edition';
    }
  }

  if (fipsRequested) securityTag = `${securityTag}/FIPS`;
  const enforcement = provider === 'NONE' ? model.toUpperCase() : `${model.toUpperCase()}:${provider}`;
  return { securityTag, enforcement };
}

function readBrandingMetadata(fromPath) {
  const brandingPath = getBrandingConfigPath(fromPath);
  const defaults = getDefaultBrandingMetadata();
  if (!fs.existsSync(brandingPath)) {
    return { branding: defaults, path: brandingPath, exists: false };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(brandingPath, 'utf8'));
    return {
      branding: normalizeBrandingMetadata(parsed),
      path: brandingPath,
      exists: true
    };
  } catch {
    return { branding: defaults, path: brandingPath, exists: true };
  }
}

function writeBrandingMetadata(fromPath, metadata = {}) {
  const brandingPath = getBrandingConfigPath(fromPath);
  const dir = path.dirname(brandingPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const normalized = normalizeBrandingMetadata(metadata);
  fs.writeFileSync(brandingPath, JSON.stringify(normalized, null, 2) + '\n', 'utf8');
  return { path: brandingPath, branding: normalized };
}

module.exports = {
  getBrandingConfigPath,
  getDefaultBrandingMetadata,
  normalizeBrandingMetadata,
  detectMacProvider,
  deriveSecurityProfile,
  readBrandingMetadata,
  writeBrandingMetadata
};
