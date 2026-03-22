/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
const fs = require('fs');

async function previewImportFile(importFilePath) {
  try {
    if (!fs.existsSync(importFilePath)) {
      return { success: false, message: `File not found: ${importFilePath}` };
    }

    const importData = JSON.parse(fs.readFileSync(importFilePath, 'utf8'));
    const models = [];
    const collections = [];
    let format = 'unknown';

    if (importData.collections) {
      format = 'catalog';
      for (const [colId, collection] of Object.entries(importData.collections)) {
        collections.push({ id: colId, name: collection.name || colId });
        for (const model of collection.models || []) {
          models.push({
            id: model.id,
            name: model.name,
            sourceCollection: colId,
            sourceCollectionName: collection.name || colId,
            size_mb: model.size_mb,
            model_family: model.model_family || null
          });
        }
      }
    } else if (Array.isArray(importData.models)) {
      format = 'models-array';
      for (const model of importData.models) {
        models.push({
          id: model.id,
          name: model.name,
          sourceCollection: null,
          sourceCollectionName: 'Unknown',
          size_mb: model.size_mb,
          model_family: model.model_family || null
        });
      }
    } else if (Array.isArray(importData)) {
      format = 'plain-array';
      for (const model of importData) {
        models.push({
          id: model.id,
          name: model.name,
          sourceCollection: null,
          sourceCollectionName: 'Unknown',
          size_mb: model.size_mb,
          model_family: model.model_family || null
        });
      }
    } else {
      return { success: false, message: 'Unrecognized file format' };
    }

    return {
      success: true,
      models,
      collections,
      format,
      totalModels: models.length
    };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

async function importModelsFromFile(ctx, fromPath, importFilePath, targetCollectionId = null, options = {}) {
  try {
    const { skipDuplicates = true, overwriteDuplicates = false, selectedModelIds = null } = options;

    if (!fs.existsSync(importFilePath)) {
      return { success: false, message: `Import file not found: ${importFilePath}` };
    }

    const importData = JSON.parse(fs.readFileSync(importFilePath, 'utf8'));
    const catalogPath = ctx.masterCatalogPath(fromPath);
    const catalog = ctx.readJson(catalogPath);

    const existingIds = new Map();
    for (const [colId, collection] of Object.entries(catalog.collections)) {
      for (const model of collection.models || []) {
        existingIds.set(model.id, { collectionId: colId, model });
      }
    }

    const results = { imported: [], skipped: [], overwritten: [], errors: [] };
    let modelsToImport = [];

    if (importData.collections) {
      for (const [colId, collection] of Object.entries(importData.collections)) {
        for (const model of collection.models || []) {
          modelsToImport.push({ model, targetCollection: targetCollectionId || colId });
        }
      }
    } else if (Array.isArray(importData.models)) {
      for (const model of importData.models) {
        if (!targetCollectionId) {
          results.errors.push({ model: model.id || 'unknown', error: 'No target collection specified' });
          continue;
        }
        modelsToImport.push({ model, targetCollection: targetCollectionId });
      }
    } else if (Array.isArray(importData)) {
      for (const model of importData) {
        if (!targetCollectionId) {
          results.errors.push({ model: model.id || 'unknown', error: 'No target collection specified' });
          continue;
        }
        modelsToImport.push({ model, targetCollection: targetCollectionId });
      }
    } else {
      return { success: false, message: 'Unrecognized import format' };
    }

    if (selectedModelIds && selectedModelIds.length > 0) {
      const selectedSet = new Set(selectedModelIds);
      modelsToImport = modelsToImport.filter(({ model }) => selectedSet.has(model.id));
    }

    for (const { model, targetCollection } of modelsToImport) {
      try {
        if (!model.id || !model.name) {
          results.errors.push({ model: model.id || 'unknown', error: 'Missing required fields' });
          continue;
        }
        if (!catalog.collections[targetCollection]) {
          results.errors.push({ model: model.id, error: `Collection "${targetCollection}" not found` });
          continue;
        }

        if (existingIds.has(model.id)) {
          if (overwriteDuplicates) {
            const existing = existingIds.get(model.id);
            const idx = catalog.collections[existing.collectionId].models.findIndex((m) => m.id === model.id);
            if (idx !== -1) {
              catalog.collections[existing.collectionId].models[idx] = model;
              results.overwritten.push({ id: model.id, collection: existing.collectionId });
            }
          } else if (skipDuplicates) {
            results.skipped.push({ id: model.id, reason: 'duplicate' });
          }
          continue;
        }

        catalog.collections[targetCollection].models.push(model);
        existingIds.set(model.id, { collectionId: targetCollection, model });
        results.imported.push({ id: model.id, name: model.name, collection: targetCollection });
      } catch (err) {
        results.errors.push({ model: model.id || 'unknown', error: err.message });
      }
    }

    if (results.imported.length > 0 || results.overwritten.length > 0) {
      catalog.last_updated = new Date().toISOString().split('T')[0];
      ctx.writeCatalogWithBackup(catalogPath, catalog);
    }

    return {
      success: true,
      message: `Import complete: ${results.imported.length} imported, ${results.skipped.length} skipped`,
      ...results
    };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

module.exports = {
  previewImportFile,
  importModelsFromFile
};
