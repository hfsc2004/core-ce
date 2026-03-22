/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * PSF Coding Terminal - RAG Bucket Resolution
 *
 * Keeps bucket naming/selection logic isolated from large IPC file.
 */

const crypto = require('crypto');
const path = require('path');
const codingTerminalPlatform = require('./coding-terminal-platform');

function resolveActiveRagBucket({ options = {}, config = {}, projectPath = '' } = {}) {
  const explicitId = normalizeBucketId(options.bucketId || '');
  if (explicitId) {
    return {
      id: explicitId,
      label: String(options.bucketLabel || explicitId)
    };
  }

  const configuredId = normalizeBucketId(config.ragBucketId || '');
  if (configuredId) {
    return {
      id: configuredId,
      label: String(config.ragBucketName || configuredId)
    };
  }

  const namedBucket = normalizeBucketId(config.ragBucketName || '');
  if (namedBucket) {
    return {
      id: `bucket-${namedBucket}`,
      label: String(config.ragBucketName)
    };
  }

  if (projectPath) {
    const normalizedPath = normalizeProjectPath(projectPath);
    const hash = crypto.createHash('sha1').update(normalizedPath).digest('hex').slice(0, 12);
    return {
      id: `project-${hash}`,
      label: `project:${path.basename(projectPath)}`
    };
  }

  return {
    id: 'default',
    label: 'default'
  };
}

function normalizeBucketId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeProjectPath(projectPath) {
  return codingTerminalPlatform.normalizeProjectPath(projectPath);
}

module.exports = {
  resolveActiveRagBucket,
  normalizeBucketId
};
