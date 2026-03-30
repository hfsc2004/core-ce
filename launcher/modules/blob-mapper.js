/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * Pseudo Science Fiction Core Collection - Blob Mapper Module
 * Refactored orchestration layer.
 */

const {
  parseManifest,
  discoverManifests,
  getBlobInventory,
  checkModelManifestExists,
  getWrappedModelNames
} = require('./blob-mapper-discovery');

const {
  convertDigestFormat,
  formatBytes,
  getStatusIcon,
  getStatusColor
} = require('./blob-mapper-utils');

const {
  buildModelToBlobMap,
  buildBlobToModelMap,
  findOrphanBlobs,
  findSharedBlobs,
  checkModelIntegrity,
  checkAllModelsIntegrity,
  canDeleteBlob,
  deleteBlobByDigest,
  getModelDeletionPlan,
  getModelStatusSummary
} = require('./blob-mapper-core');

module.exports = {
  // Core parsing
  parseManifest,
  discoverManifests,
  getBlobInventory,

  // Mapping operations
  buildModelToBlobMap,
  buildBlobToModelMap,
  convertDigestFormat,

  // Discovery
  findOrphanBlobs,
  findSharedBlobs,

  // Integrity checking
  checkModelIntegrity,
  checkAllModelsIntegrity,

  // Deletion safety
  canDeleteBlob,
  deleteBlobByDigest,
  getModelDeletionPlan,

  // UI helpers
  getModelStatusSummary,
  formatBytes,
  getStatusIcon,
  getStatusColor,

  // MoE status checks
  checkModelManifestExists,
  getWrappedModelNames
};
