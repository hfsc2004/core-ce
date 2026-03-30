/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * Compile manager model discovery and manifest/blob copy operations.
 */
'use strict';

const fs = require('fs');
const path = require('path');

async function getDownloadedModelsWithBlobs(fromPath) {
  try {
    const projectRoot = path.join(fromPath, '..');
    const blobsDir = path.join(projectRoot, 'models', 'blobs');
    const manifestsDir = path.join(projectRoot, 'models', 'manifests', 'registry.ollama.ai', 'library');
    
    // Check if Ollama directories exist
    if (!fs.existsSync(manifestsDir)) {
      return { success: true, models: [], message: 'No Ollama manifests found' };
    }
    
    // Load master catalog to get model info
    const catalogPath = path.join(fromPath, '..', 'models', 'catalog-master.json');
    let catalogModels = {};
    
    if (fs.existsSync(catalogPath)) {
      const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
      for (const collKey in catalog.collections) {
        for (const model of catalog.collections[collKey].models || []) {
          // Map by model name (derived from filename)
          const modelKey = (model.filename || model.id + '.gguf').replace('.gguf', '').toLowerCase();
          catalogModels[modelKey] = model;
        }
      }
    }
    
    // Read Ollama manifests to find models
    const models = [];
    const modelDirs = fs.readdirSync(manifestsDir);
    
    for (const modelName of modelDirs) {
      const modelManifestDir = path.join(manifestsDir, modelName);
      if (!fs.statSync(modelManifestDir).isDirectory()) continue;
      
      // Look for tag files (usually 'latest')
      const tags = fs.readdirSync(modelManifestDir);
      for (const tag of tags) {
        const manifestPath = path.join(modelManifestDir, tag);
        if (fs.statSync(manifestPath).isDirectory()) continue;
        
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          
          // Count blobs and calculate total size
          let blobCount = 0;
          let totalSize = 0;
          const blobDigests = [];
          
          // Include config blob (required by Ollama!)
          if (manifest.config && manifest.config.digest) {
            const configBlobPath = path.join(blobsDir, manifest.config.digest.replace(':', '-'));
            if (fs.existsSync(configBlobPath)) {
              blobCount++;
              const stats = fs.statSync(configBlobPath);
              totalSize += stats.size;
              blobDigests.push(manifest.config.digest);
            }
          }
          
          // Include layer blobs
          if (manifest.layers) {
            for (const layer of manifest.layers) {
              if (layer.digest) {
                const blobPath = path.join(blobsDir, layer.digest.replace(':', '-'));
                if (fs.existsSync(blobPath)) {
                  blobCount++;
                  const stats = fs.statSync(blobPath);
                  totalSize += stats.size;
                  blobDigests.push(layer.digest);
                }
              }
            }
          }
          
          // Get catalog metadata if available
          const catalogKey = modelName.toLowerCase();
          const catalogData = catalogModels[catalogKey] || {};
          
          models.push({
            id: modelName,
            tag: tag,
            name: catalogData.name || modelName,
            description: catalogData.description || '',
            blob_count: blobCount,
            blob_digests: blobDigests,
            size_mb: Math.round(totalSize / 1024 / 1024),
            has_blobs: blobCount > 0,
            manifest_path: manifestPath,
            catalog_data: catalogData
          });
        } catch (err) {
          console.error(`[Compile Manager Common] Error reading manifest ${manifestPath}:`, err.message);
        }
      }
    }
    
    return {
      success: true,
      models: models,
      message: `Found ${models.length} models with blobs`
    };
    
  } catch (err) {
    console.error('[Compile Manager Common] Error scanning models:', err);
    return { success: false, message: err.message };
  }
}

function getCurrentPlatform() {
  const platform = process.platform;
  const arch = process.arch;
  
  if (platform === 'win32') {
    return arch === 'arm64' ? 'windows-arm64' : 'windows-x64';
  } else if (platform === 'darwin') {
    return arch === 'arm64' ? 'macos-arm' : 'macos-intel';
  } else {
    return arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
  }
}

function generateProductCatalog(config) {
  const productCatalog = {
    package: {
      name: config.productName,
      version: config.version,
      storage: config.storageLabel,
      storage_type: 'SSD'
    },
    collections: {}
  };
  
  // Add collections sorted by total size (smallest first)
  const collectionsWithSize = config.collections.map(coll => {
    let totalSize = 0;
    const modelsData = [];
    
    for (const modelId of coll.models) {
      const model = config.models.find(m => m.id === modelId);
      if (model) {
        totalSize += model.size_mb;
        modelsData.push(model);
      }
    }
    
    // Sort models by size within collection
    modelsData.sort((a, b) => a.size_mb - b.size_mb);
    
    return { ...coll, totalSize, modelsData };
  });
  
  collectionsWithSize.sort((a, b) => a.totalSize - b.totalSize);
  
  for (const coll of collectionsWithSize) {
    productCatalog.collections[coll.id] = {
      name: coll.name,
      description: coll.description || '',
      models: coll.modelsData
    };
  }
  
  return productCatalog;
}

async function copyBlobs(fromPath, config, destBlobsDir, progressCallback = null) {
  const sendProgress = (status, progress, log = null) => {
    if (progressCallback) {
      progressCallback({ status, progress, log });
    }
    console.log(`[Compile Manager Common] [${progress}%] ${status}${log ? ': ' + log : ''}`);
  };
  
  const projectRoot = path.join(fromPath, '..');
  const sourceBlobsDir = path.join(projectRoot, 'models', 'blobs');
  const blobsToCopy = new Set();
  
  // Debug: Log config structure
  console.log('[copyBlobs] Source blobs dir:', sourceBlobsDir);
  console.log('[copyBlobs] Dest blobs dir:', destBlobsDir);
  console.log('[copyBlobs] Collections count:', config.collections?.length || 0);
  console.log('[copyBlobs] Models count:', config.models?.length || 0);
  
  // Collect all blob digests from selected models
  for (const coll of config.collections) {
    console.log(`[copyBlobs] Collection "${coll.name}" has ${coll.models?.length || 0} models`);
    for (const modelId of coll.models) {
      const model = config.models.find(m => m.id === modelId);
      if (model) {
        console.log(`[copyBlobs] Model "${modelId}" has ${model.blob_digests?.length || 0} blob_digests`);
        if (model.blob_digests) {
          for (const digest of model.blob_digests) {
            blobsToCopy.add(digest);
          }
        }
      } else {
        console.log(`[copyBlobs] WARNING: Model "${modelId}" not found in config.models!`);
        // Debug: List all model IDs to help diagnose
        console.log('[copyBlobs] Available model IDs:', config.models.map(m => m.id));
      }
    }
  }
  
  sendProgress('Copying blob files...', 20, `Found ${blobsToCopy.size} blobs to copy`);
  
  // Yield to allow UI to update
  await new Promise(resolve => setImmediate(resolve));
  
  let blobsCopied = 0;
  let blobsSkipped = 0;
  const blobsArray = Array.from(blobsToCopy);
  
  for (let i = 0; i < blobsArray.length; i++) {
    const digest = blobsArray[i];
    const blobFilename = digest.replace(':', '-');
    const sourcePath = path.join(sourceBlobsDir, blobFilename);
    const destPath = path.join(destBlobsDir, blobFilename);
    
    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, destPath);
      blobsCopied++;
      
      const copyProgress = 20 + Math.round((i / blobsArray.length) * 20);
      if (i % 5 === 0 || i === blobsArray.length - 1) {
        sendProgress('Copying blobs...', copyProgress, `${blobsCopied}/${blobsArray.length}`);
        // Yield to allow UI to update
        await new Promise(resolve => setImmediate(resolve));
      }
    } else {
      blobsSkipped++;
      console.log(`[copyBlobs] WARNING: Blob not found: ${sourcePath}`);
    }
  }
  
  if (blobsSkipped > 0) {
    console.log(`[copyBlobs] WARNING: ${blobsSkipped} blobs were not found and skipped!`);
  }
  
  sendProgress('Blobs copied', 40, `Copied ${blobsCopied} blobs`);
  return blobsCopied;
}

async function copyManifests(fromPath, config, destModelsDir, progressCallback = null) {
  const sendProgress = (status, progress, log = null) => {
    if (progressCallback) {
      progressCallback({ status, progress, log });
    }
    console.log(`[Compile Manager Common] [${progress}%] ${status}${log ? ': ' + log : ''}`);
  };
  
  const projectRoot = path.join(fromPath, '..');
  const sourceManifestsDir = path.join(projectRoot, 'models', 'manifests');
  const destManifestsDir = path.join(destModelsDir, 'manifests');
  
  sendProgress('Copying manifests...', 42, 'Preparing manifest copy...');
  
  let manifestsCopied = 0;
  
  // Copy manifests for each selected model
  for (const coll of config.collections) {
    for (const modelId of coll.models) {
      const model = config.models.find(m => m.id === modelId);
      if (model && model.manifest_path) {
        const relPath = path.relative(sourceManifestsDir, model.manifest_path);
        const destPath = path.join(destManifestsDir, relPath);
        
        // Create directory structure
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        
        // Copy manifest file
        fs.copyFileSync(model.manifest_path, destPath);
        manifestsCopied++;
      }
    }
  }
  
  sendProgress('Manifests copied', 45, `Copied ${manifestsCopied} manifests`);
  return manifestsCopied;
}

module.exports = {
  getDownloadedModelsWithBlobs,
  getCurrentPlatform,
  generateProductCatalog,
  copyBlobs,
  copyManifests
};
