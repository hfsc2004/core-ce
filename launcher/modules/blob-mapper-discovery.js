/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const fs = require('fs');
const path = require('path');

let pathManager;
try {
  pathManager = require('./path-manager/path-manager-common.js');
} catch (e) {
  pathManager = require('./path-manager-common.js');
}

function parseManifest(manifestPath) {
  try {
    const content = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(content);

    const digests = [];
    if (manifest.layers && Array.isArray(manifest.layers)) {
      for (const layer of manifest.layers) {
        if (layer.digest) {
          digests.push({
            digest: layer.digest,
            size: layer.size || 0,
            mediaType: layer.mediaType || 'unknown'
          });
        }
      }
    }

    if (manifest.config && manifest.config.digest) {
      digests.push({
        digest: manifest.config.digest,
        size: manifest.config.size || 0,
        mediaType: manifest.config.mediaType || 'config'
      });
    }

    return {
      schemaVersion: manifest.schemaVersion || 2,
      digests,
      raw: manifest
    };
  } catch (err) {
    console.error(`[Blob Mapper] Failed to parse manifest ${manifestPath}:`, err.message);
    return null;
  }
}

function discoverManifests(fromPath) {
  const manifestsDir = pathManager.getManifestsDir(fromPath);
  const models = [];

  if (!fs.existsSync(manifestsDir)) {
    console.warn(`[Blob Mapper] Manifests directory not found: ${manifestsDir}`);
    return models;
  }

  const registryPath = path.join(manifestsDir, 'registry.ollama.ai', 'library');
  if (!fs.existsSync(registryPath)) {
    console.warn(`[Blob Mapper] Registry path not found: ${registryPath}`);
    return models;
  }

  try {
    const modelDirs = fs.readdirSync(registryPath, { withFileTypes: true });

    for (const modelDir of modelDirs) {
      if (!modelDir.isDirectory()) continue;

      const modelPath = path.join(registryPath, modelDir.name);
      const tags = fs.readdirSync(modelPath);

      for (const tag of tags) {
        const manifestPath = path.join(modelPath, tag);
        const stat = fs.statSync(manifestPath);

        if (stat.isFile()) {
          models.push({
            name: modelDir.name,
            tag,
            fullName: `${modelDir.name}:${tag}`,
            manifestPath,
            ollamaName: `registry.ollama.ai/library/${modelDir.name}:${tag}`
          });
        }
      }
    }
  } catch (err) {
    console.error('[Blob Mapper] Error discovering manifests:', err.message);
  }

  return models;
}

function getBlobInventory(fromPath) {
  const blobsDir = pathManager.getBlobsDir(fromPath);
  const inventory = new Map();

  if (!fs.existsSync(blobsDir)) {
    console.warn(`[Blob Mapper] Blobs directory not found: ${blobsDir}`);
    return inventory;
  }

  try {
    const files = fs.readdirSync(blobsDir);

    for (const file of files) {
      const filePath = path.join(blobsDir, file);
      const stat = fs.statSync(filePath);

      if (stat.isFile()) {
        const digest = file.startsWith('sha256-') ? `sha256:${file.slice(7)}` : file;
        inventory.set(digest, {
          path: filePath,
          filename: file,
          size: stat.size,
          exists: true
        });
      }
    }
  } catch (err) {
    console.error('[Blob Mapper] Error reading blobs directory:', err.message);
  }

  return inventory;
}

function checkModelManifestExists(modelName, fromPath) {
  const manifestsDir = pathManager.getManifestsDir(fromPath);
  const manifestPath = path.join(manifestsDir, 'registry.ollama.ai', 'library', modelName, 'latest');
  return fs.existsSync(manifestPath);
}

function getWrappedModelNames(fromPath) {
  const manifestsDir = pathManager.getManifestsDir(fromPath);
  const registryPath = path.join(manifestsDir, 'registry.ollama.ai', 'library');

  if (!fs.existsSync(registryPath)) return [];

  try {
    const modelDirs = fs.readdirSync(registryPath, { withFileTypes: true });
    const wrappedNames = [];

    for (const modelDir of modelDirs) {
      if (modelDir.isDirectory()) {
        const modelPath = path.join(registryPath, modelDir.name);
        const tags = fs.readdirSync(modelPath);
        if (tags.length > 0) wrappedNames.push(modelDir.name.toLowerCase());
      }
    }

    return wrappedNames;
  } catch (err) {
    console.error('[Blob Mapper] Error getting wrapped model names:', err.message);
    return [];
  }
}

module.exports = {
  parseManifest,
  discoverManifests,
  getBlobInventory,
  checkModelManifestExists,
  getWrappedModelNames
};
