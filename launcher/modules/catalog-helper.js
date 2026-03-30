/**
 * ============================================================================
 * PSF ROBOTICS CATALOG HELPER (REFACTORED)
 * ============================================================================
 * 
 * HIGH-LEVEL catalog-aware functions with better function decomposition.
 * All functions kept under 50 lines for maintainability.
 * 
 * Author: Pseudo Science Fiction
 * Version: 1.1.3 (Refactored)
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const downloadManager = require('./download-manager');
const ollamaManager = require('./ollama-manager/ollama-manager');
const sessionManager = require('./session-manager');
const { searchCatalogModels } = require('./catalog-helper-search');

// ============================================================================
// CATALOG READING
// ============================================================================

/**
 * Get the full catalog
 */
async function getCatalog(appPath, useMaster = false) {
  try {
    const projectRoot = path.join(appPath, '..');
    const catalogFile = useMaster ? 'catalog-master.json' : 'catalog.json';
    const catalogPath = path.join(projectRoot, 'models', catalogFile);
    
    const data = fs.readFileSync(catalogPath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('[Catalog Helper] Failed to read catalog:', err);
    throw err;
  }
}

/**
 * Get a specific model by ID
 */
async function getModelById(appPath, collectionId, modelId) {
  try {
    const catalog = await getCatalog(appPath);
    
    if (!catalog.collections[collectionId]) {
      return null;
    }
    
    const model = catalog.collections[collectionId].models.find(m => m.id === modelId);
    return model || null;
  } catch (err) {
    console.error('[Catalog Helper] Failed to get model:', err);
    return null;
  }
}

/**
 * Get all models in a collection
 */
async function getCollectionModels(appPath, collectionId) {
  try {
    const catalog = await getCatalog(appPath);
    
    if (!catalog.collections[collectionId]) {
      return [];
    }
    
    return catalog.collections[collectionId].models || [];
  } catch (err) {
    console.error('[Catalog Helper] Failed to get collection models:', err);
    return [];
  }
}

/**
 * Search models by criteria (NOW ONLY 25 LINES!)
 */
async function searchModels(appPath, criteria = {}) {
  try {
    const catalog = await getCatalog(appPath);
    return searchCatalogModels(catalog, criteria);
  } catch (err) {
    console.error('[Catalog Helper] Search failed:', err);
    return [];
  }
}

// ============================================================================
// MODEL LAUNCHING
// ============================================================================

/**
 * Build paths for model and projector
 */
function buildModelPaths(collectionId, model) {
  const modelPath = path.join('models', collectionId, model.filename || `${model.id}.gguf`);
  
  let projectorPath = null;
  if (model.supports_vision && model.projector_filename) {
    projectorPath = path.join('models', collectionId, model.projector_filename);
    console.log(`[Catalog Helper] 📷 Vision model detected! Using projector: ${model.projector_filename}`);
  }
  
  return { modelPath, projectorPath };
}

/**
 * Launch a model from catalog (NOW ONLY 30 LINES!)
 */
async function launchModelFromCatalog(appPath, collectionId, modelId) {
  try {
    const model = await getModelById(appPath, collectionId, modelId);
    
    if (!model) {
      return {
        success: false,
        message: `Model ${modelId} not found in collection ${collectionId}`
      };
    }
    
    const { modelPath, projectorPath } = buildModelPaths(collectionId, model);
    
    const existingPort = Number(sessionManager.getOllamaPortForService('terminal') || 0);
    const startResult = existingPort > 0
      ? { success: true, ollamaPort: existingPort }
      : await sessionManager.startOllamaForService('terminal', appPath, null);
    if (!startResult?.success) {
      return { success: false, message: startResult?.message || 'Failed to start BMOC terminal session.' };
    }
    const terminalPort = Number(startResult.ollamaPort || startResult.port || 0);
    if (!terminalPort) {
      return { success: false, message: 'BMOC terminal session did not provide a valid Ollama port.' };
    }

    // Call with correct parameter order: (modelPath, appPath, gpuConfig, projectorPath, progressCallback, forceCpu, runtimeOptions)
    const result = await ollamaManager.launchModelInOllama(
      modelPath,
      appPath,
      null,
      projectorPath,
      null,
      model.force_cpu || false,
      { preferredPort: terminalPort, preventAutoStart: true, bindOnly: true }
    );
    
    return {
      ...result,
      modelInfo: {
        name: model.name,
        hasVision: model.supports_vision || false,
        hasCode: model.supports_code || false,
        hasFunctionCalling: model.supports_function_calling || false
      }
    };
    
  } catch (err) {
    console.error('[Catalog Helper] Failed to launch model:', err);
    return { success: false, message: err.message };
  }
}

/**
 * Open Ollama Terminal for a catalog model
 * Loads the model into Ollama first if not already loaded
 */
async function openTerminalForModel(appPath, collectionId, modelId, gpuInfo = null) {
  try {
    const model = await getModelById(appPath, collectionId, modelId);
    
    if (!model) {
      return { success: false, message: `Model ${modelId} not found` };
    }
    
    // First, ensure model is loaded into Ollama
    console.log('[Catalog Helper] Loading model into Ollama before opening terminal...');
    const loadResult = await launchModelFromCatalog(appPath, collectionId, modelId);
    
    if (!loadResult.success) {
      return {
        success: false,
        message: `Failed to load model: ${loadResult.message}`
      };
    }
    
    // Now open terminal with the loaded model
    const modelName = model.filename?.replace('.gguf', '') || modelId;
    const terminalPort = Number(loadResult.port || loadResult.ollamaPort || 0);
    return await ollamaManager.openOllamaTerminal(
      appPath,
      modelName,
      path.join(appPath, 'preload.js'),
      path.join(appPath, 'src', 'terminal.html'),
      gpuInfo,
      0,
      terminalPort || null,
      null
    );
    
  } catch (err) {
    console.error('[Catalog Helper] Failed to open terminal:', err);
    return { success: false, message: err.message };
  }
}

// ============================================================================
// MODEL DOWNLOADING (SPLIT INTO SMALLER FUNCTIONS)
// ============================================================================

/**
 * Download main model file
 */
async function downloadMainModel(appPath, model, collectionId, modelId, progressCallback) {
  const downloadUrl = model.download_url || model.url;
  
  if (!downloadUrl) {
    return {
      success: false,
      message: `No download URL found for model ${modelId}`
    };
  }
  
  const filename = model.filename || `${modelId}.gguf`;
  
  console.log(`[Catalog Helper] Downloading ${model.name} from catalog...`);
  console.log(`[Catalog Helper] URL: ${downloadUrl}`);
  console.log(`[Catalog Helper] Size: ${model.size_mb}MB`);
  
  return await downloadManager.downloadModel(
    appPath,
    modelId,
    downloadUrl,
    collectionId,
    filename,
    null,
    null,
    progressCallback
  );
}

/**
 * Download projector file for vision models
 */
async function downloadProjector(appPath, model, collectionId, modelId, progressCallback) {
  if (!model.supports_vision || !model.projector_filename || !model.projector_url) {
    return null;
  }
  
  console.log(`[Catalog Helper] 📷 Downloading vision projector: ${model.projector_filename}`);
  
  return await downloadManager.downloadModel(
    appPath,
    `${modelId}-projector`,
    model.projector_url,
    collectionId,
    model.projector_filename,
    null,
    null,
    (progress) => {
      if (progressCallback) {
        progressCallback({
          ...progress,
          modelId: `${modelId}-projector`,
          isProjector: true
        });
      }
    }
  );
}

/**
 * Download a model from catalog (NOW ONLY 40 LINES!)
 */
async function downloadModelFromCatalog(appPath, collectionId, modelId, progressCallback) {
  try {
    const model = await getModelById(appPath, collectionId, modelId);
    
    if (!model) {
      return {
        success: false,
        message: `Model ${modelId} not found in catalog`
      };
    }
    
    // Download main model
    const mainResult = await downloadMainModel(appPath, model, collectionId, modelId, progressCallback);
    
    if (!mainResult.success) {
      return mainResult;
    }
    
    // Download projector if vision model
    const projectorResult = await downloadProjector(appPath, model, collectionId, modelId, progressCallback);
    
    if (projectorResult) {
      return {
        success: true,
        message: `Downloaded ${model.name} with vision projector`,
        mainModel: mainResult,
        projector: projectorResult,
        hasVision: true
      };
    }
    
    return {
      success: true,
      message: `Downloaded ${model.name}`,
      mainModel: mainResult,
      hasVision: false
    };
    
  } catch (err) {
    console.error('[Catalog Helper] Download failed:', err);
    return { success: false, message: err.message };
  }
}

// ============================================================================
// HARDWARE-AWARE FILTERING
// ============================================================================

/**
 * Get models suitable for user's hardware
 */
async function getModelsForHardware(appPath, availableRAM, hasGPU = false) {
  try {
    const catalog = await getCatalog(appPath);
    const suitableModels = [];
    
    for (const [collectionId, collection] of Object.entries(catalog.collections)) {
      for (const model of collection.models || []) {
        const minRAM = model.min_ram_gb || 0;
        const recRAM = model.recommended_ram_gb || minRAM;
        const requiredRAM = hasGPU ? recRAM : minRAM;
        
        if (requiredRAM <= availableRAM) {
          suitableModels.push({
            ...model,
            collectionId,
            collectionName: collection.name,
            ramFit: availableRAM >= recRAM ? 'recommended' : 'minimum'
          });
        }
      }
    }
    
    // Sort by recommended RAM ascending
    suitableModels.sort((a, b) => {
      const aRAM = a.recommended_ram_gb || a.min_ram_gb || 0;
      const bRAM = b.recommended_ram_gb || b.min_ram_gb || 0;
      return aRAM - bRAM;
    });
    
    return suitableModels;
    
  } catch (err) {
    console.error('[Catalog Helper] Hardware filtering failed:', err);
    return [];
  }
}

/**
 * Get recommended models for specific use case
 */
async function getModelsForUseCase(appPath, useCase) {
  try {
    const catalog = await getCatalog(appPath);
    const matches = [];
    
    for (const [collectionId, collection] of Object.entries(catalog.collections)) {
      for (const model of collection.models || []) {
        const useCases = model.use_cases || [];
        
        if (useCases.includes(useCase)) {
          matches.push({
            ...model,
            collectionId,
            collectionName: collection.name
          });
        }
      }
    }
    
    return matches;
    
  } catch (err) {
    console.error('[Catalog Helper] Use case filtering failed:', err);
    return [];
  }
}

// ============================================================================
// MODEL STATUS CHECKING
// ============================================================================

/**
 * Check if main model file exists
 */
async function checkMainModelExists(appPath, collectionId, model) {
  const filename = model.filename || `${model.id}.gguf`;
  const filepath = path.join('models', collectionId, filename);
  return await downloadManager.checkFileExists(appPath, filepath);
}

/**
 * Check if projector file exists
 */
async function checkProjectorExists(appPath, collectionId, model) {
  if (!model.supports_vision || !model.projector_filename) {
    return { exists: false, notNeeded: true };
  }
  
  const projectorPath = path.join('models', collectionId, model.projector_filename);
  return await downloadManager.checkFileExists(appPath, projectorPath);
}

/**
 * Check if a catalog model is downloaded
 */
async function checkModelDownloaded(appPath, collectionId, modelId) {
  try {
    const model = await getModelById(appPath, collectionId, modelId);
    
    if (!model) {
      return { exists: false, message: 'Model not in catalog' };
    }
    
    const mainResult = await checkMainModelExists(appPath, collectionId, model);
    
    if (!mainResult.exists) {
      return { exists: false, message: 'Model not downloaded' };
    }
    
    // Check projector for vision models
    if (model.supports_vision && model.projector_filename) {
      const projectorResult = await checkProjectorExists(appPath, collectionId, model);
      
      return {
        exists: true,
        mainModel: mainResult,
        hasProjector: projectorResult.exists,
        projectorMissing: !projectorResult.exists,
        isVisionModel: true
      };
    }
    
    return {
      exists: true,
      mainModel: mainResult,
      isVisionModel: false
    };
    
  } catch (err) {
    console.error('[Catalog Helper] Status check failed:', err);
    return { exists: false, error: err.message };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Catalog reading
  getCatalog,
  getModelById,
  getCollectionModels,
  searchModels,
  
  // Intelligent launching
  launchModelFromCatalog,
  openTerminalForModel,
  
  // Intelligent downloading
  downloadModelFromCatalog,
  
  // Hardware-aware
  getModelsForHardware,
  getModelsForUseCase,
  
  // Status checking
  checkModelDownloaded
};
