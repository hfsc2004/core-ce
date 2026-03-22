/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const fs = require('fs');
const path = require('path');

function projectRoot(fromPath) {
  return path.join(fromPath, '..');
}

function masterCatalogPath(fromPath) {
  return path.join(projectRoot(fromPath), 'models', 'catalog-master.json');
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

async function getMasterCatalog(fromPath) {
  return readJson(masterCatalogPath(fromPath));
}

async function getCatalog(fromPath) {
  return readJson(path.join(projectRoot(fromPath), 'models', 'catalog.json'));
}

async function getSKUConfig(fromPath) {
  return readJson(path.join(projectRoot(fromPath), 'models', 'sku-config.json'));
}

async function getSKUManifest(fromPath) {
  return readJson(path.join(projectRoot(fromPath), 'models', 'sku-manifest.json'));
}

function cleanupOldBackups(modelsDir) {
  try {
    const files = fs.readdirSync(modelsDir);
    const backupFiles = files.filter((f) => /^catalog-master\.backup\.\d+\.json$/.test(f));
    if (backupFiles.length <= 1) return;

    backupFiles.sort((a, b) => {
      const timestampA = parseInt(a.match(/\.(\d+)\.json$/)[1], 10);
      const timestampB = parseInt(b.match(/\.(\d+)\.json$/)[1], 10);
      return timestampB - timestampA;
    });

    for (const file of backupFiles.slice(1)) {
      fs.unlinkSync(path.join(modelsDir, file));
    }
  } catch (err) {
    console.warn('[Catalog Manager] Backup cleanup warning:', err.message);
  }
}

function writeCatalogWithBackup(catalogPath, catalog) {
  const modelsDir = path.dirname(catalogPath);
  if (fs.existsSync(catalogPath)) {
    const backupPath = path.join(modelsDir, `catalog-master.backup.${Date.now()}.json`);
    fs.copyFileSync(catalogPath, backupPath);
    cleanupOldBackups(modelsDir);
  }
  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));
}

async function saveMasterCatalog(fromPath, catalogData) {
  try {
    writeCatalogWithBackup(masterCatalogPath(fromPath), catalogData);
    return { success: true, message: 'Catalog saved successfully' };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

module.exports = {
  projectRoot,
  masterCatalogPath,
  readJson,
  getMasterCatalog,
  getCatalog,
  getSKUConfig,
  getSKUManifest,
  cleanupOldBackups,
  writeCatalogWithBackup,
  saveMasterCatalog
};
