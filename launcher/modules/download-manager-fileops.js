/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const fs = require('fs');
const path = require('path');
const { parseSplitFilename } = require('./download-manager-split');

async function checkFileExists(fromPath, relativePath) {
  try {
    const projectRoot = path.join(fromPath, '..');
    const normalizedRelative = String(relativePath || '');
    const fullPath = path.join(projectRoot, normalizedRelative);
    if (fs.existsSync(fullPath)) return true;

    const parsed = parseSplitFilename(path.basename(normalizedRelative));
    if (!parsed) return false;
    const mergedRelative = path.join(path.dirname(normalizedRelative), parsed.baseName);
    const mergedPath = path.join(projectRoot, mergedRelative);
    return fs.existsSync(mergedPath);
  } catch (err) {
    console.error('[Download Manager] Error checking file:', err);
    return false;
  }
}

async function cleanupOllamaArtifacts(projectRoot, modelName) {
  const result = { manifestDeleted: false, blobsDeleted: 0 };

  const normalizeManifestModelName = (value) => {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/:[^/\\]+$/g, '')
      .replace(/[_\s.]+/g, '-')
      .replace(/[^a-z0-9-]+/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const collectModelAliases = () => {
    const aliases = new Set();
    const base = String(modelName || '').trim();
    if (base) aliases.add(base);
    if (base) aliases.add(base.replace(/_/g, '-'));
    if (base) aliases.add(base.replace(/-/g, '_'));

    const catalogPath = path.join(projectRoot, 'models', 'catalog-master.json');
    if (!fs.existsSync(catalogPath)) {
      return aliases;
    }

    try {
      const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
      const collections = catalog && catalog.collections ? catalog.collections : {};
      for (const coll of Object.values(collections)) {
        const models = Array.isArray(coll?.models) ? coll.models : [];
        for (const entry of models) {
          const filenameBase = String(entry?.filename || '').replace(/\.gguf$/i, '').trim();
          const idBase = String(entry?.id || '').trim();
          if (!filenameBase && !idBase) continue;
          const filenameMatch = filenameBase && filenameBase.toLowerCase() === base.toLowerCase();
          const idMatch = idBase && idBase.toLowerCase() === base.toLowerCase();
          if (!filenameMatch && !idMatch) continue;

          const ollamaModel = String(entry?.ollama_model || '').trim();
          if (ollamaModel) aliases.add(ollamaModel.replace(/:[^/\\]+$/g, ''));
          if (filenameBase) aliases.add(filenameBase);
          if (idBase) aliases.add(idBase);
        }
      }
    } catch (err) {
      console.warn('[Download Manager] Could not parse catalog-master.json for manifest aliases:', err.message);
    }

    return aliases;
  };

  try {
    const manifestsBaseDir = path.join(projectRoot, 'models', 'manifests', 'registry.ollama.ai', 'library');
    const blobsDir = path.join(projectRoot, 'models', 'blobs');
    const aliasSet = collectModelAliases();
    const aliasKeys = new Set(Array.from(aliasSet).map((v) => normalizeManifestModelName(v)).filter(Boolean));
    const manifestDirsToDelete = [];
    if (fs.existsSync(manifestsBaseDir)) {
      const modelDirs = fs.readdirSync(manifestsBaseDir).filter((d) => {
        const full = path.join(manifestsBaseDir, d);
        if (!fs.statSync(full).isDirectory()) return false;
        const normalized = normalizeManifestModelName(d);
        return normalized && aliasKeys.has(normalized);
      });
      for (const d of modelDirs) {
        manifestDirsToDelete.push(path.join(manifestsBaseDir, d));
      }
    }

    const blobsToConsider = new Set();

    for (const modelManifestDir of manifestDirsToDelete) {
      const tags = fs.readdirSync(modelManifestDir);
      for (const tag of tags) {
        const manifestPath = path.join(modelManifestDir, tag);
        if (fs.statSync(manifestPath).isFile()) {
          try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
            if (manifest.layers) {
              for (const layer of manifest.layers) {
                if (layer.digest) blobsToConsider.add(layer.digest);
              }
            }
            if (manifest.config && manifest.config.digest) {
              blobsToConsider.add(manifest.config.digest);
            }
          } catch (e) {
            console.warn(`[Download Manager] Could not parse manifest ${manifestPath}:`, e.message);
          }
        }
      }

      fs.rmSync(modelManifestDir, { recursive: true, force: true });
      result.manifestDeleted = true;
    }

    const blobsInUse = new Set();

    if (fs.existsSync(manifestsBaseDir)) {
      const otherModels = fs.readdirSync(manifestsBaseDir);
      for (const otherModel of otherModels) {
        const otherModelDir = path.join(manifestsBaseDir, otherModel);
        if (!fs.statSync(otherModelDir).isDirectory()) continue;

        const otherTags = fs.readdirSync(otherModelDir);
        for (const tag of otherTags) {
          const manifestPath = path.join(otherModelDir, tag);
          if (fs.statSync(manifestPath).isFile()) {
            try {
              const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
              if (manifest.layers) {
                for (const layer of manifest.layers) {
                  if (layer.digest) blobsInUse.add(layer.digest);
                }
              }
              if (manifest.config && manifest.config.digest) {
                blobsInUse.add(manifest.config.digest);
              }
            } catch {
              // ignore
            }
          }
        }
      }
    }

    if (fs.existsSync(blobsDir)) {
      for (const digest of blobsToConsider) {
        if (!blobsInUse.has(digest)) {
          const blobFilename = digest.replace(':', '-');
          const blobPath = path.join(blobsDir, blobFilename);
          if (fs.existsSync(blobPath)) {
            fs.unlinkSync(blobPath);
            result.blobsDeleted++;
          }
        }
      }
    }
  } catch (err) {
    console.error('[Download Manager] Error during Ollama cleanup:', err);
  }

  return result;
}

async function deleteModel(fromPath, relativePath, cleanupOllama = true) {
  try {
    const projectRoot = path.join(fromPath, '..');
    const normalizedRelative = String(relativePath || '');
    let fullPath = path.join(projectRoot, normalizedRelative);

    if (!fs.existsSync(fullPath)) {
      const parsed = parseSplitFilename(path.basename(normalizedRelative));
      if (parsed) {
        const mergedRelative = path.join(path.dirname(normalizedRelative), parsed.baseName);
        const mergedPath = path.join(projectRoot, mergedRelative);
        if (fs.existsSync(mergedPath)) {
          fullPath = mergedPath;
        }
      }
    }

    if (!fs.existsSync(fullPath)) {
      if (cleanupOllama) {
        const missingFilename = path.basename(normalizedRelative);
        const inferredModelName = String(missingFilename || '').replace(/\.gguf$/i, '');
        if (inferredModelName) {
          const ollamaCleanup = await cleanupOllamaArtifacts(projectRoot, inferredModelName);
          if (ollamaCleanup.manifestDeleted || ollamaCleanup.blobsDeleted > 0) {
            return {
              success: true,
              message: `Model file not found, but cleaned Ollama artifacts (removed ${ollamaCleanup.blobsDeleted} blobs)`,
              blobsDeleted: ollamaCleanup.blobsDeleted,
              manifestDeleted: ollamaCleanup.manifestDeleted
            };
          }
        }
      }
      return { success: false, message: 'File not found' };
    }

    const filename = path.basename(fullPath);
    const modelName = filename.replace('.gguf', '');

    fs.unlinkSync(fullPath);

    const dir = path.dirname(fullPath);
    const projectorPatterns = [
      `${modelName}-mmproj.gguf`,
      `${modelName}_mmproj.gguf`,
      `mmproj-${modelName}.gguf`
    ];

    for (const projPattern of projectorPatterns) {
      const projPath = path.join(dir, projPattern);
      if (fs.existsSync(projPath)) fs.unlinkSync(projPath);
    }

    let blobsDeleted = 0;
    let manifestDeleted = false;

    if (cleanupOllama) {
      const ollamaCleanup = await cleanupOllamaArtifacts(projectRoot, modelName);
      blobsDeleted = ollamaCleanup.blobsDeleted;
      manifestDeleted = ollamaCleanup.manifestDeleted;
    }

    const message = blobsDeleted > 0 || manifestDeleted
      ? `Model deleted successfully (also removed ${blobsDeleted} blob files)`
      : 'Model deleted successfully';

    return { success: true, message, blobsDeleted, manifestDeleted };
  } catch (err) {
    console.error('[Download Manager] Error deleting file:', err);
    return { success: false, message: err.message };
  }
}

async function getFileSize(fromPath, relativePath) {
  try {
    const projectRoot = path.join(fromPath, '..');
    const fullPath = path.join(projectRoot, relativePath);

    if (!fs.existsSync(fullPath)) {
      return { success: false, message: 'File not found' };
    }

    const stats = fs.statSync(fullPath);
    return {
      success: true,
      sizeMB: (stats.size / 1024 / 1024).toFixed(2),
      sizeBytes: stats.size
    };
  } catch (err) {
    console.error('[Download Manager] Error getting file size:', err);
    return { success: false, message: err.message };
  }
}

module.exports = {
  checkFileExists,
  deleteModel,
  cleanupOllamaArtifacts,
  getFileSize
};
