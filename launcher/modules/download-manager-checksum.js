/**
 * Download manager checksum helpers.
 */

const fs = require('fs');
const path = require('path');
const { verifySHA256 } = require('./download-manager-utils');

function normalizeChecksumSpec(rawSpec = null) {
  const empty = {
    mainHash: '',
    projectorHash: '',
    byFilename: new Map()
  };
  if (!rawSpec) return empty;
  if (typeof rawSpec === 'string') {
    return {
      ...empty,
      mainHash: String(rawSpec).trim()
    };
  }
  if (Array.isArray(rawSpec)) {
    const byFilename = new Map();
    for (const item of rawSpec) {
      if (!item || typeof item !== 'object') continue;
      const filename = String(item.filename || item.file || '').trim().toLowerCase();
      const hash = String(item.sha256 || item.hash || '').trim();
      if (!filename || !hash) continue;
      byFilename.set(filename, hash);
    }
    return { ...empty, byFilename };
  }
  if (typeof rawSpec !== 'object') return empty;

  const byFilename = new Map();
  const fromMaps = [
    rawSpec.files,
    rawSpec.byFilename,
    rawSpec.shards,
    rawSpec.hashes
  ];
  for (const mapLike of fromMaps) {
    if (!mapLike || typeof mapLike !== 'object' || Array.isArray(mapLike)) continue;
    for (const [file, hashRaw] of Object.entries(mapLike)) {
      const filename = String(file || '').trim().toLowerCase();
      const hash = String(hashRaw || '').trim();
      if (!filename || !hash) continue;
      byFilename.set(filename, hash);
    }
  }

  const listLike = Array.isArray(rawSpec.entries) ? rawSpec.entries : null;
  if (listLike) {
    for (const item of listLike) {
      if (!item || typeof item !== 'object') continue;
      const filename = String(item.filename || item.file || '').trim().toLowerCase();
      const hash = String(item.sha256 || item.hash || '').trim();
      if (!filename || !hash) continue;
      byFilename.set(filename, hash);
    }
  }

  return {
    mainHash: String(rawSpec.main || rawSpec.model || rawSpec.sha256 || '').trim(),
    projectorHash: String(rawSpec.projector || rawSpec.projector_sha256 || '').trim(),
    byFilename
  };
}

function resolveExpectedHashForFilename(checksumSpec, filename) {
  const file = String(filename || '').trim().toLowerCase();
  if (!file || !checksumSpec?.byFilename) return '';
  if (checksumSpec.byFilename.has(file)) return checksumSpec.byFilename.get(file);
  const base = path.basename(file);
  if (checksumSpec.byFilename.has(base)) return checksumSpec.byFilename.get(base);
  return '';
}

async function verifyFileChecksum(filepath, expectedHash, failurePrefix = 'Checksum verification failed!') {
  const verification = await verifySHA256(filepath, expectedHash);
  if (verification.valid) return { success: true, verification };
  try {
    fs.unlinkSync(filepath);
  } catch (_) {}
  return {
    success: false,
    message: `${failurePrefix} File was corrupted during download. Please try again.`,
    checksumMismatch: true,
    expectedHash: verification.expectedHash,
    actualHash: verification.actualHash
  };
}

module.exports = {
  normalizeChecksumSpec,
  resolveExpectedHashForFilename,
  verifyFileChecksum
};

