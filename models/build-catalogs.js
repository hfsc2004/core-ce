/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
/**
 * PSF Robotics Archive Collection
 * SKU Catalog Build Script
 * 
 * Generates SKU-specific catalogs from the master catalog
 * Usage: node build-catalogs.js
 */

const fs = require('fs');
const path = require('path');

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

// Legacy fallback definitions (used only if sku-manifest.json is missing)
const LEGACY_SKU_DEFINITIONS = {
  'sku-001': {
    name: 'Entry Bundle',
    storage: '256GB',
    price: 49.99,
    collections: [
      'quick-start-128gb',
      'daily-driver-256gb',
      'code-specialist-256gb'
    ]
  },
  'sku-002': {
    name: 'Enthusiast Bundle',
    storage: '512GB',
    price: 89.99,
    collections: [
      'generalist-512gb',
      'developer-512gb',
      'researcher-512gb',
      'uncensored-512gb',
      'lightweight-max-512gb'
    ]
  },
  'sku-003': {
    name: 'Pro Archive Bundle',
    storage: '1TB',
    price: 149.99,
    collections: [
      'complete-archive-1tb',
      'power-user-1tb',
      'polyglot-1tb',
      'specialist-suite-1tb',
      'no-guardrails-1tb'
    ]
  },
  'sku-004': {
    name: 'Archivist & LLM Engineer\'s Bundle',
    storage: '2TB',
    price: 249.99,
    collections: [
      'the-arsenal-2tb',
      'multiverse-2tb'
    ]
  },
  'sku-005': {
    name: 'The VAULT',
    storage: '4TB',
    price: 449.99,
    collections: 'all'  // Special: includes everything
  }
};

/**
 * Load canonical SKU manifest
 */
function loadSKUManifest() {
  const manifestPath = path.join(__dirname, 'sku-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.warn(`${colors.yellow}⚠️  sku-manifest.json not found, using legacy embedded SKU definitions${colors.reset}`);
    return {
      schema_version: 'legacy-fallback',
      runtime_default_sku: 'sku-005',
      skus: LEGACY_SKU_DEFINITIONS
    };
  }

  try {
    const data = fs.readFileSync(manifestPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`${colors.red}❌ Error loading sku-manifest.json:${colors.reset}`, error.message);
    process.exit(1);
  }
}

/**
 * Normalize manifest skus into runtime build definitions
 */
function getActiveSKUDefinitions(manifest) {
  const source = manifest?.skus || {};
  const definitions = {};

  for (const [skuId, sku] of Object.entries(source)) {
    if (sku?.active === false) continue;

    definitions[skuId] = {
      name: sku.name || skuId,
      storage: sku.storage || sku.storage_size || 'N/A',
      price: typeof sku.price === 'number' ? sku.price : 0,
      collections: sku.collections || []
    };
  }

  return definitions;
}

/**
 * Resolve runtime default sku from manifest with safe fallback
 */
function resolveDefaultRuntimeSKU(manifest, skuDefinitions) {
  const configured = manifest?.runtime_default_sku;
  if (configured && skuDefinitions[configured]) {
    return configured;
  }
  if (skuDefinitions['sku-005']) {
    return 'sku-005';
  }
  return Object.keys(skuDefinitions)[0] || null;
}

/**
 * Load the master catalog
 */
function loadMasterCatalog() {
  try {
    const masterPath = path.join(__dirname, 'catalog-master.json');
    const data = fs.readFileSync(masterPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`${colors.red}❌ Error loading master catalog:${colors.reset}`, error.message);
    process.exit(1);
  }
}

/**
 * Build a SKU-specific catalog
 */
function buildSKUCatalog(skuId, skuInfo, masterCatalog) {
  const skuCatalog = {
    version: masterCatalog.version,
    last_updated: masterCatalog.last_updated,
    sku_id: skuId,
    sku_name: skuInfo.name,
    storage: skuInfo.storage,
    price: skuInfo.price,
    collections: {}
  };

  // Add collections based on SKU definition
  if (skuInfo.collections === 'all') {
    // SKU-005: Include everything
    skuCatalog.collections = JSON.parse(JSON.stringify(masterCatalog.collections));
  } else {
    // Other SKUs: Only include specified collections
    for (const collectionId of skuInfo.collections) {
      if (masterCatalog.collections[collectionId]) {
        skuCatalog.collections[collectionId] = JSON.parse(
          JSON.stringify(masterCatalog.collections[collectionId])
        );
      } else {
        console.warn(`${colors.yellow}⚠️  Collection '${collectionId}' not found in master catalog${colors.reset}`);
      }
    }
  }

  return skuCatalog;
}

/**
 * Count total models in a catalog
 */
function countModels(catalog) {
  let total = 0;
  for (const collection of Object.values(catalog.collections)) {
    total += collection.models ? collection.models.length : 0;
  }
  return total;
}

/**
 * Save catalog to file
 */
function saveCatalog(skuId, catalog) {
  const filename = `catalog-${skuId}.json`;
  const filepath = path.join(__dirname, filename);
  
  try {
    fs.writeFileSync(filepath, JSON.stringify(catalog, null, 2));
    return filename;
  } catch (error) {
    console.error(`${colors.red}❌ Error saving ${filename}:${colors.reset}`, error.message);
    return null;
  }
}

/**
 * Validate catalog for issues
 */
function validateCatalog(catalog) {
  const issues = [];
  
  // Check for duplicate model IDs
  const modelIds = new Set();
  for (const collection of Object.values(catalog.collections)) {
    if (collection.models) {
      for (const model of collection.models) {
        if (modelIds.has(model.id)) {
          issues.push(`Duplicate model ID: ${model.id}`);
        }
        modelIds.add(model.id);
      }
    }
  }
  
  return issues;
}

/**
 * Main build process
 */
function main() {
  console.log(`${colors.cyan}╔═══════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║    PSF Robotics Archive Collection - Catalog Build Script    ║${colors.reset}`);
  console.log(`${colors.cyan}╚═══════════════════════════════════════════════════════════════╝${colors.reset}\n`);

  const manifest = loadSKUManifest();
  const SKU_DEFINITIONS = getActiveSKUDefinitions(manifest);
  const skuEntries = Object.entries(SKU_DEFINITIONS);
  if (skuEntries.length === 0) {
    console.error(`${colors.red}❌ No active SKUs found in manifest${colors.reset}`);
    process.exit(1);
  }

  // Load master catalog
  console.log('📖 Loading master catalog...');
  const masterCatalog = loadMasterCatalog();
  const masterModelCount = countModels(masterCatalog);
  console.log(`${colors.green}✅ Master catalog loaded: ${masterModelCount} unique models${colors.reset}\n`);

  // Validate master catalog
  const masterIssues = validateCatalog(masterCatalog);
  if (masterIssues.length > 0) {
    console.error(`${colors.red}❌ Master catalog has issues:${colors.reset}`);
    masterIssues.forEach(issue => console.error(`   ${issue}`));
    process.exit(1);
  }

  // Build each SKU catalog
  console.log('🔨 Building SKU catalogs...\n');
  
  let successCount = 0;
  let totalModels = 0;

  for (const [skuId, skuInfo] of skuEntries) {
    const catalog = buildSKUCatalog(skuId, skuInfo, masterCatalog);
    const modelCount = countModels(catalog);
    
    // Validate SKU catalog
    const issues = validateCatalog(catalog);
    if (issues.length > 0) {
      console.warn(`${colors.yellow}⚠️  ${skuId} has issues:${colors.reset}`);
      issues.forEach(issue => console.warn(`   ${issue}`));
    }
    
    // Save catalog
    const filename = saveCatalog(skuId, catalog);
    if (filename) {
      console.log(`${colors.green}✅ ${filename.padEnd(25)}${colors.reset} - ${skuInfo.name.padEnd(37)} (${modelCount.toString().padStart(3)} models)`);
      successCount++;
      totalModels += modelCount;
    }
  }

  // Create default catalog.json and sku-config.json for Developer Edition
  console.log(`\n📝 Creating default runtime files...`);
  
  try {
    // Default runtime SKU comes from manifest
    const defaultSKU = resolveDefaultRuntimeSKU(manifest, SKU_DEFINITIONS);
    if (!defaultSKU) {
      throw new Error('No default SKU could be resolved');
    }
    const defaultSKUInfo = SKU_DEFINITIONS[defaultSKU];
    
    // Copy catalog-sku-005.json to catalog.json
    const sourceCatalog = path.join(__dirname, `catalog-${defaultSKU}.json`);
    const targetCatalog = path.join(__dirname, 'catalog.json');
    
    if (fs.existsSync(sourceCatalog)) {
      const catalogData = fs.readFileSync(sourceCatalog, 'utf8');
      fs.writeFileSync(targetCatalog, catalogData);
      console.log(`${colors.green}✅ catalog.json${colors.reset} created (Developer Edition default)`);
    }
    
    // Create sku-config.json (runtime pointer)
    const skuConfig = {
      package_key: (defaultSKUInfo.name || defaultSKU).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
      package_name: defaultSKUInfo.name,
      storage_size: defaultSKUInfo.storage,
      storage_type: 'NVMe SSD (USB-C)',
      catalog_file: 'catalog.json',
      sku_id: defaultSKU,
      version: masterCatalog.version,
      price: defaultSKUInfo.price,
      sku_manifest: 'sku-manifest.json'
    };
    
    const skuConfigPath = path.join(__dirname, 'sku-config.json');
    fs.writeFileSync(skuConfigPath, JSON.stringify(skuConfig, null, 2));
    console.log(`${colors.green}✅ sku-config.json${colors.reset} created (${defaultSKUInfo.name})`);
    
  } catch (error) {
    console.error(`${colors.red}❌ Error creating runtime files:${colors.reset}`, error.message);
  }

  // Summary
  console.log(`\n${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.green}✅ Build complete!${colors.reset}`);
  console.log(`   Generated: ${successCount}/${skuEntries.length} SKU catalogs`);
  console.log(`   Total models across all SKUs: ${totalModels}`);
  console.log(`   Runtime files: catalog.json, sku-config.json`);
  console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}\n`);
}

// Run the build
main();
