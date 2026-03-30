/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
async function addModel(ctx, fromPath, collectionId, modelData) {
  try {
    const catalogPath = ctx.masterCatalogPath(fromPath);
    const catalog = ctx.readJson(catalogPath);

    if (!catalog.collections[collectionId]) {
      return { success: false, message: `Collection "${collectionId}" not found` };
    }

    if (!Array.isArray(catalog.collections[collectionId].models)) {
      catalog.collections[collectionId].models = [];
    }

    if (!modelData.id && modelData.name) {
      modelData.id = modelData.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    }

    if (!modelData.id) {
      return { success: false, message: 'Model must have an ID or name to generate one from' };
    }
    if (!modelData.name) {
      return { success: false, message: 'Model must have a name' };
    }

    const existingModel = catalog.collections[collectionId].models.find((m) => m && m.id === modelData.id);
    if (existingModel) {
      return { success: false, message: `Model ID "${modelData.id}" already exists in this collection` };
    }

    catalog.collections[collectionId].models.push(modelData);
    catalog.last_updated = new Date().toISOString().split('T')[0];
    ctx.writeCatalogWithBackup(catalogPath, catalog);

    return { success: true, message: 'Model added successfully', catalog };
  } catch (err) {
    return { success: false, message: `Error: ${err.message}` };
  }
}

async function editModel(ctx, fromPath, collectionId, modelId, updatedModelData) {
  try {
    const catalogPath = ctx.masterCatalogPath(fromPath);
    const catalog = ctx.readJson(catalogPath);

    if (!catalog.collections[collectionId]) {
      return { success: false, message: `Collection "${collectionId}" not found` };
    }

    const models = catalog.collections[collectionId].models;
    const modelIndex = models.findIndex((m) => m && m.id === modelId);
    if (modelIndex === -1) {
      return { success: false, message: `Model "${modelId}" not found in collection "${collectionId}"` };
    }

    catalog.collections[collectionId].models[modelIndex] = {
      ...catalog.collections[collectionId].models[modelIndex],
      ...updatedModelData
    };

    catalog.last_updated = new Date().toISOString().split('T')[0];
    ctx.writeCatalogWithBackup(catalogPath, catalog);
    return { success: true, message: 'Model updated successfully', catalog };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

async function deleteModelFromCatalog(ctx, fromPath, collectionId, modelId) {
  try {
    const catalogPath = ctx.masterCatalogPath(fromPath);
    const catalog = ctx.readJson(catalogPath);

    if (!catalog.collections[collectionId]) {
      return { success: false, message: `Collection "${collectionId}" not found` };
    }

    const modelIndex = catalog.collections[collectionId].models.findIndex((m) => m && m.id === modelId);
    if (modelIndex === -1) {
      return { success: false, message: `Model "${modelId}" not found in collection "${collectionId}"` };
    }

    const deletedModel = catalog.collections[collectionId].models.splice(modelIndex, 1)[0];
    catalog.last_updated = new Date().toISOString().split('T')[0];
    ctx.writeCatalogWithBackup(catalogPath, catalog);

    return { success: true, message: 'Model deleted successfully', catalog, deletedModel };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

async function moveModel(ctx, fromPath, fromCollectionId, toCollectionId, modelId) {
  try {
    if (fromCollectionId === toCollectionId) {
      return { success: true, message: 'Model already in target collection', noChange: true };
    }

    const catalogPath = ctx.masterCatalogPath(fromPath);
    const catalog = ctx.readJson(catalogPath);

    if (!catalog.collections[fromCollectionId]) {
      return { success: false, message: `Source collection "${fromCollectionId}" not found` };
    }
    if (!catalog.collections[toCollectionId]) {
      return { success: false, message: `Destination collection "${toCollectionId}" not found` };
    }

    const sourceModels = catalog.collections[fromCollectionId].models || [];
    const modelIndex = sourceModels.findIndex((m) => m.id === modelId);
    if (modelIndex === -1) {
      return { success: false, message: `Model "${modelId}" not found in collection "${fromCollectionId}"` };
    }

    const destModels = catalog.collections[toCollectionId].models || [];
    if (destModels.some((m) => m.id === modelId)) {
      return { success: false, message: `Model with ID "${modelId}" already exists in destination collection` };
    }

    const [model] = sourceModels.splice(modelIndex, 1);
    if (!catalog.collections[toCollectionId].models) {
      catalog.collections[toCollectionId].models = [];
    }
    catalog.collections[toCollectionId].models.push(model);

    catalog.last_updated = new Date().toISOString().split('T')[0];
    ctx.writeCatalogWithBackup(catalogPath, catalog);

    return {
      success: true,
      message: `Model moved to "${catalog.collections[toCollectionId].name}"`,
      catalog,
      model
    };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

module.exports = {
  addModel,
  editModel,
  deleteModelFromCatalog,
  moveModel
};
