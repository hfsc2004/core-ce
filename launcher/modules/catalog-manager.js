/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * Pseudo Science Fiction Core Collection - Catalog Manager Module
 * Thin orchestrator for catalog CRUD, collections, import, and SKU build.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const io = require('./catalog-manager-io');
const modelOps = require('./catalog-manager-models');
const collectionOps = require('./catalog-manager-collections');
const importOps = require('./catalog-manager-import');

const ctx = {
  masterCatalogPath: io.masterCatalogPath,
  readJson: io.readJson,
  writeCatalogWithBackup: io.writeCatalogWithBackup
};

async function addModel(fromPath, collectionId, modelData) {
  return modelOps.addModel(ctx, fromPath, collectionId, modelData);
}

async function editModel(fromPath, collectionId, modelId, updatedModelData) {
  return modelOps.editModel(ctx, fromPath, collectionId, modelId, updatedModelData);
}

async function deleteModelFromCatalog(fromPath, collectionId, modelId) {
  return modelOps.deleteModelFromCatalog(ctx, fromPath, collectionId, modelId);
}

async function moveModel(fromPath, fromCollectionId, toCollectionId, modelId) {
  return modelOps.moveModel(ctx, fromPath, fromCollectionId, toCollectionId, modelId);
}

async function getCollections(fromPath) {
  return collectionOps.getCollections(ctx, fromPath);
}

async function addCollection(fromPath, collectionId, collectionData) {
  return collectionOps.addCollection(ctx, fromPath, collectionId, collectionData);
}

async function editCollection(fromPath, collectionId, updatedCollectionData) {
  return collectionOps.editCollection(ctx, fromPath, collectionId, updatedCollectionData);
}

async function deleteCollection(fromPath, collectionId) {
  return collectionOps.deleteCollection(ctx, fromPath, collectionId);
}

async function previewImportFile(importFilePath) {
  return importOps.previewImportFile(importFilePath);
}

async function importModelsFromFile(fromPath, importFilePath, targetCollectionId = null, options = {}) {
  return importOps.importModelsFromFile(ctx, fromPath, importFilePath, targetCollectionId, options);
}

async function buildSKUCatalogs(fromPath, progressCallback = null) {
  try {
    const projectRoot = path.join(fromPath, '..');
    const modelsDir = path.join(projectRoot, 'models');
    const buildScriptPath = path.join(modelsDir, 'build-catalogs.js');

    if (!fs.existsSync(buildScriptPath)) {
      return {
        success: false,
        message: 'build-catalogs.js not found in models directory'
      };
    }

    return await new Promise((resolve, reject) => {
      const buildProcess = spawn('node', [buildScriptPath], {
        cwd: modelsDir,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      buildProcess.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        if (progressCallback) progressCallback(output);
      });

      buildProcess.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        if (progressCallback) progressCallback(output);
      });

      buildProcess.on('close', (code) => {
        if (code === 0) {
          resolve({
            success: true,
            message: 'SKU catalogs built successfully',
            output: stdout,
            exitCode: code
          });
        } else {
          resolve({
            success: false,
            message: `Build process exited with code ${code}`,
            output: stdout,
            error: stderr,
            exitCode: code
          });
        }
      });

      buildProcess.on('error', (err) => {
        reject({ success: false, message: err.message });
      });
    });
  } catch (err) {
    return { success: false, message: err.message };
  }
}

module.exports = {
  getMasterCatalog: io.getMasterCatalog,
  saveMasterCatalog: io.saveMasterCatalog,
  getCatalog: io.getCatalog,
  getSKUConfig: io.getSKUConfig,
  getSKUManifest: io.getSKUManifest,

  addModel,
  editModel,
  deleteModelFromCatalog,
  moveModel,

  getCollections,
  addCollection,
  editCollection,
  deleteCollection,

  previewImportFile,
  importModelsFromFile,

  buildSKUCatalogs
};
