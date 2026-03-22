/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const fs = require('fs');
const path = require('path');

function readCatalog(appDir) {
  const primary = path.join(path.resolve(appDir, '..'), 'models', 'catalog-master.json');
  const fallback = path.join(path.resolve(appDir, '..'), 'models', 'catalog.json');
  const target = fs.existsSync(primary) ? primary : fallback;
  if (!fs.existsSync(target)) return null;
  try {
    const raw = fs.readFileSync(target, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function findCatalogModel(catalog, collectionId, modelId) {
  if (!catalog || !catalog.collections) return null;
  const collection = catalog.collections[String(collectionId || '').trim()];
  if (!collection || !Array.isArray(collection.models)) return null;
  const model = collection.models.find((m) => String(m?.id || '') === String(modelId || ''));
  if (!model) return null;
  return {
    collectionId: String(collectionId),
    modelId: String(modelId),
    model
  };
}

function resolveVoiceModelFromCatalog(appDir, ref = {}) {
  const collectionId = String(ref.collectionId || '').trim();
  const modelId = String(ref.modelId || '').trim();
  if (!collectionId || !modelId) return null;
  const catalog = readCatalog(appDir);
  return findCatalogModel(catalog, collectionId, modelId);
}

module.exports = {
  resolveVoiceModelFromCatalog
};
