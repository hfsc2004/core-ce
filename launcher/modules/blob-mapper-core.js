/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
const path = require('path');
const {
  parseManifest,
  discoverManifests,
  getBlobInventory
} = require('./blob-mapper-discovery');
const {
  convertDigestFormat,
  getStatusIcon,
  getStatusColor,
  formatBytes
} = require('./blob-mapper-utils');

function buildModelToBlobMap(fromPath) {
  const models = discoverManifests(fromPath);
  const blobInventory = getBlobInventory(fromPath);
  const modelMap = new Map();

  for (const model of models) {
    const parsed = parseManifest(model.manifestPath);

    if (!parsed) {
      modelMap.set(model.fullName, {
        ...model,
        status: 'error',
        error: 'Failed to parse manifest',
        blobs: [],
        missingBlobs: [],
        presentBlobs: []
      });
      continue;
    }

    const blobs = [];
    const missingBlobs = [];
    const presentBlobs = [];

    for (const digestInfo of parsed.digests) {
      const blobInfo = blobInventory.get(digestInfo.digest);
      const exists = blobInfo ? blobInfo.exists : false;

      const blobData = {
        digest: digestInfo.digest,
        expectedSize: digestInfo.size,
        mediaType: digestInfo.mediaType,
        exists,
        actualSize: exists ? blobInfo.size : null,
        path: exists ? blobInfo.path : null,
        filename: convertDigestFormat(digestInfo.digest, 'dash')
      };

      blobs.push(blobData);
      if (exists) presentBlobs.push(blobData);
      else missingBlobs.push(blobData);
    }

    let status;
    if (missingBlobs.length === 0 && blobs.length > 0) status = 'complete';
    else if (missingBlobs.length === blobs.length) status = 'missing';
    else if (missingBlobs.length > 0) status = 'partial';
    else status = 'empty';

    modelMap.set(model.fullName, {
      ...model,
      status,
      blobs,
      missingBlobs,
      presentBlobs,
      totalSize: blobs.reduce((sum, b) => sum + (b.expectedSize || 0), 0),
      presentSize: presentBlobs.reduce((sum, b) => sum + (b.actualSize || 0), 0)
    });
  }

  return {
    models: modelMap,
    modelCount: models.length,
    blobInventory,
    blobCount: blobInventory.size
  };
}

function buildBlobToModelMap(fromPath) {
  const { models } = buildModelToBlobMap(fromPath);
  const blobToModels = new Map();

  for (const [modelName, modelData] of models) {
    for (const blob of modelData.blobs) {
      if (!blobToModels.has(blob.digest)) {
        blobToModels.set(blob.digest, []);
      }
      blobToModels.get(blob.digest).push(modelName);
    }
  }

  return blobToModels;
}

function findOrphanBlobs(fromPath) {
  const blobInventory = getBlobInventory(fromPath);
  const blobToModels = buildBlobToModelMap(fromPath);
  const orphans = [];

  for (const [digest, blobInfo] of blobInventory) {
    const models = blobToModels.get(digest);
    if (!models || models.length === 0) {
      orphans.push({ digest, ...blobInfo });
    }
  }

  return orphans;
}

function findSharedBlobs(fromPath) {
  const blobToModels = buildBlobToModelMap(fromPath);
  const shared = [];

  for (const [digest, models] of blobToModels) {
    if (models.length > 1) {
      shared.push({ digest, models, sharedBy: models.length });
    }
  }

  return shared.sort((a, b) => b.sharedBy - a.sharedBy);
}

function resolveModelIntegrityRecord(models, modelName) {
  if (!(models instanceof Map)) return null;
  const raw = String(modelName || '').trim();
  if (!raw) return null;

  const normalize = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^registry\.ollama\.ai\/library\//, '');
  const stripTag = (value) => normalize(value).replace(/:[^:\/]+$/, '');

  const normalizedInput = normalize(raw);
  const inputBase = stripTag(raw);
  const candidates = new Set([normalizedInput, `${inputBase}:latest`]);

  for (const [key, value] of models.entries()) {
    const normalizedKey = normalize(key);
    if (candidates.has(normalizedKey)) return value;
  }

  for (const [key, value] of models.entries()) {
    const keyBase = stripTag(key);
    if (keyBase === inputBase) return value;
  }

  return null;
}

function checkModelIntegrity(modelName, fromPath) {
  const { models } = buildModelToBlobMap(fromPath);
  const modelData = resolveModelIntegrityRecord(models, modelName);

  if (!modelData) {
    return {
      found: false,
      status: 'not_found',
      message: `Model "${modelName}" not found in manifests`
    };
  }

  return {
    found: true,
    name: modelData.fullName,
    status: modelData.status,
    totalBlobs: modelData.blobs.length,
    presentBlobs: modelData.presentBlobs.length,
    missingBlobs: modelData.missingBlobs.length,
    present: modelData.presentBlobs.map((b) => ({
      digest: b.digest,
      filename: b.filename,
      size: b.actualSize || b.expectedSize
    })),
    missing: modelData.missingBlobs.map((b) => b.digest),
    totalSize: modelData.totalSize,
    presentSize: modelData.presentSize,
    complete: modelData.status === 'complete'
  };
}

function checkAllModelsIntegrity(fromPath) {
  const { models, modelCount, blobCount } = buildModelToBlobMap(fromPath);

  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalModels: modelCount,
      totalBlobs: blobCount,
      completeModels: 0,
      partialModels: 0,
      missingModels: 0,
      errorModels: 0
    },
    models: [],
    orphanBlobs: findOrphanBlobs(fromPath),
    sharedBlobs: findSharedBlobs(fromPath)
  };

  for (const [, modelData] of models) {
    switch (modelData.status) {
      case 'complete': report.summary.completeModels++; break;
      case 'partial': report.summary.partialModels++; break;
      case 'missing': report.summary.missingModels++; break;
      case 'error': report.summary.errorModels++; break;
      default: break;
    }

    report.models.push({
      name: modelData.fullName,
      status: modelData.status,
      totalBlobs: modelData.blobs.length,
      presentBlobs: modelData.presentBlobs.length,
      missingBlobs: modelData.missingBlobs.length,
      totalSize: modelData.totalSize,
      presentSize: modelData.presentSize,
      missing: modelData.missingBlobs.map((b) => ({
        digest: b.digest,
        filename: b.filename,
        size: b.expectedSize
      }))
    });
  }

  report.summary.orphanBlobs = report.orphanBlobs.length;
  report.summary.sharedBlobs = report.sharedBlobs.length;
  return report;
}

function canDeleteBlob(digest, excludeModel, fromPath) {
  const blobToModels = buildBlobToModelMap(fromPath);
  const users = blobToModels.get(digest) || [];
  const otherUsers = users.filter((m) => m !== excludeModel);

  return {
    digest,
    canDelete: otherUsers.length === 0,
    usedBy: otherUsers,
    userCount: otherUsers.length
  };
}

function deleteBlobByDigest(digest, fromPath, options = {}) {
  const fs = require('fs');
  let pathManager;
  try {
    pathManager = require('./path-manager/path-manager-common.js');
  } catch (e) {
    pathManager = require('./path-manager-common.js');
  }

  const normalized = String(digest || '').trim();
  if (!normalized) {
    return { success: false, message: 'Digest is required', removed: false };
  }

  const force = options.force === true;
  const excludeModel = String(options.excludeModel || '').trim() || null;
  const safety = canDeleteBlob(normalized, excludeModel, fromPath);
  if (!force && !safety.canDelete) {
    return {
      success: false,
      message: `Blob is shared by ${safety.userCount} other model(s).`,
      removed: false,
      safety
    };
  }

  const blobsDir = pathManager.getBlobsDir(fromPath);
  const filename = convertDigestFormat(normalized, 'dash');
  const target = path.join(blobsDir, filename);
  if (!fs.existsSync(target)) {
    return { success: false, message: `Blob file not found: ${filename}`, removed: false, safety };
  }

  try {
    fs.unlinkSync(target);
    return {
      success: true,
      message: `Deleted blob ${filename}`,
      removed: true,
      digest: normalized,
      filename,
      safety
    };
  } catch (err) {
    return {
      success: false,
      message: err.message || String(err),
      removed: false,
      digest: normalized,
      filename,
      safety
    };
  }
}

function getModelDeletionPlan(modelName, fromPath) {
  const { models } = buildModelToBlobMap(fromPath);
  const modelData = models.get(modelName);

  if (!modelData) {
    return { found: false, error: `Model "${modelName}" not found` };
  }

  const plan = {
    found: true,
    model: modelName,
    manifestPath: modelData.manifestPath,
    blobsToDelete: [],
    blobsToKeep: [],
    spaceToReclaim: 0,
    sharedSpace: 0
  };

  for (const blob of modelData.blobs) {
    const safety = canDeleteBlob(blob.digest, modelName, fromPath);

    if (safety.canDelete) {
      plan.blobsToDelete.push({
        digest: blob.digest,
        filename: blob.filename,
        path: blob.path,
        size: blob.actualSize || blob.expectedSize
      });
      plan.spaceToReclaim += blob.actualSize || blob.expectedSize || 0;
    } else {
      plan.blobsToKeep.push({
        digest: blob.digest,
        filename: blob.filename,
        usedBy: safety.usedBy,
        size: blob.actualSize || blob.expectedSize
      });
      plan.sharedSpace += blob.actualSize || blob.expectedSize || 0;
    }
  }

  return plan;
}

function getModelStatusSummary(fromPath) {
  const report = checkAllModelsIntegrity(fromPath);

  return {
    timestamp: report.timestamp,
    summary: report.summary,
    models: report.models.map((m) => ({
      name: m.name,
      status: m.status,
      statusIcon: getStatusIcon(m.status),
      statusColor: getStatusColor(m.status),
      blobCount: `${m.presentBlobs}/${m.totalBlobs}`,
      sizeDisplay: formatBytes(m.presentSize),
      totalSizeDisplay: formatBytes(m.totalSize),
      isComplete: m.status === 'complete',
      hasMissing: m.missingBlobs > 0,
      missingDetails: m.missing
    })),
    orphanCount: report.orphanBlobs.length,
    orphanSize: formatBytes(report.orphanBlobs.reduce((sum, b) => sum + (b.size || 0), 0)),
    sharedCount: report.sharedBlobs.length
  };
}

module.exports = {
  buildModelToBlobMap,
  buildBlobToModelMap,
  findOrphanBlobs,
  findSharedBlobs,
  resolveModelIntegrityRecord,
  checkModelIntegrity,
  checkAllModelsIntegrity,
  canDeleteBlob,
  deleteBlobByDigest,
  getModelDeletionPlan,
  getModelStatusSummary
};
