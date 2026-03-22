/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
async function getCollections(ctx, fromPath) {
  try {
    const catalog = ctx.readJson(ctx.masterCatalogPath(fromPath));
    const collections = Object.keys(catalog.collections).map((key) => ({
      id: key,
      name: catalog.collections[key].name
    }));
    return { success: true, collections };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

async function addCollection(ctx, fromPath, collectionId, collectionData) {
  try {
    const catalogPath = ctx.masterCatalogPath(fromPath);
    const catalog = ctx.readJson(catalogPath);

    if (catalog.collections[collectionId]) {
      return { success: false, message: `Collection "${collectionId}" already exists` };
    }

    catalog.collections[collectionId] = {
      name: collectionData.name,
      drive_size: collectionData.drive_size,
      total_size_gb: collectionData.total_size_gb || 0,
      description: collectionData.description,
      models: []
    };

    catalog.last_updated = new Date().toISOString().split('T')[0];
    ctx.writeCatalogWithBackup(catalogPath, catalog);
    return { success: true, message: 'Collection added successfully', catalog };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

async function editCollection(ctx, fromPath, collectionId, updatedCollectionData) {
  try {
    const catalogPath = ctx.masterCatalogPath(fromPath);
    const catalog = ctx.readJson(catalogPath);

    if (!catalog.collections[collectionId]) {
      return { success: false, message: `Collection "${collectionId}" not found` };
    }

    const existingModels = catalog.collections[collectionId].models;
    catalog.collections[collectionId] = {
      name: updatedCollectionData.name,
      drive_size: updatedCollectionData.drive_size,
      total_size_gb: updatedCollectionData.total_size_gb || 0,
      description: updatedCollectionData.description,
      models: existingModels
    };

    catalog.last_updated = new Date().toISOString().split('T')[0];
    ctx.writeCatalogWithBackup(catalogPath, catalog);
    return { success: true, message: 'Collection updated successfully', catalog };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

async function deleteCollection(ctx, fromPath, collectionId) {
  try {
    const catalogPath = ctx.masterCatalogPath(fromPath);
    const catalog = ctx.readJson(catalogPath);

    if (!catalog.collections[collectionId]) {
      return { success: false, message: `Collection "${collectionId}" not found` };
    }

    const modelCount = catalog.collections[collectionId].models?.length || 0;
    const deletedCollection = catalog.collections[collectionId];
    delete catalog.collections[collectionId];

    catalog.last_updated = new Date().toISOString().split('T')[0];
    ctx.writeCatalogWithBackup(catalogPath, catalog);

    return {
      success: true,
      message: 'Collection deleted successfully',
      catalog,
      deletedCollection,
      modelsRemoved: modelCount
    };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

module.exports = {
  getCollections,
  addCollection,
  editCollection,
  deleteCollection
};
