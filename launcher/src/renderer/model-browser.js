/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
// ============================================================================
// PSF OFFLINE ARCHIVE COLLECTION
// Renderer - Model Browser
// ============================================================================
// Shared by both Standard and Community Editions
// ============================================================================

const MODEL_BROWSER_SPLIT_FILE_PATTERN = /-(\d{5})-of-(\d{5})\.gguf$/i;

function getMergedFilename(filename) {
  const raw = String(filename || '');
  if (!raw) return raw;
  return MODEL_BROWSER_SPLIT_FILE_PATTERN.test(raw) ? raw.replace(MODEL_BROWSER_SPLIT_FILE_PATTERN, '.gguf') : raw;
}

async function loadModelCatalog() {
  const grid = document.getElementById('model-grid');
  grid.innerHTML = '<div class="info-loading"><div class="spinner"></div><p>Loading catalog...</p></div>';
  
  try {
    const skuConfig = await window.electronAPI.getSKUConfig();
    const catalog = await window.electronAPI.getCatalog();
    
    window.skuConfig = skuConfig;
    window.catalogData = catalog;
    
    displayPackageView(skuConfig, catalog);
    
  } catch (err) {
    console.error('Failed to load catalog:', err);
    grid.innerHTML = '<p style="color: #ff6b6b;">Failed to load model catalog. Check console for details.</p>';
  }
}

function displayPackageView(skuConfig, catalog) {
  const container = document.getElementById('model-grid');
  
  let totalModels = 0;
  for (const collection of Object.values(catalog.collections || {})) {
    totalModels += collection.models?.length || 0;
  }
  
  let html = '';
  
  const collections = catalog.collections || {};
  const collectionKeys = Object.keys(collections);
  
  if (collectionKeys.length === 0) {
    html += '<p style="color: #aaa; text-align: center;">No collections available in this package.</p>';
  } else {
    for (const collectionKey of collectionKeys) {
      const collection = collections[collectionKey];
      const modelCount = collection.models?.length || 0;
      
      html += `
        <div class="collection-section">
          <div class="collection-header" onclick="toggleCollection('${collectionKey}')">
            <div class="collection-title">
              <h3>${collection.name}</h3>
              <span class="collection-count">${modelCount} model${modelCount !== 1 ? 's' : ''}</span>
            </div>
            <span class="collection-toggle" id="toggle-${collectionKey}">▼</span>
          </div>
          ${collection.description ? `<div class="collection-description">${collection.description}</div>` : ''}
          <div class="collection-models" id="models-${collectionKey}">
            ${buildModelCards(collection.models || [], collectionKey)}
          </div>
        </div>
      `;
    }
  }
  
  container.innerHTML = html;
  
  // After rendering, check which models are downloaded
  checkDownloadedModels();
}

async function checkDownloadedModels() {
  const modelCards = document.querySelectorAll('.model-card');
  
  for (const card of modelCards) {
    const modelId = card.getAttribute('data-model-id');
    const collection = card.getAttribute('data-collection');
    const filename = card.getAttribute('data-filename');
    const actualFilenameAttr = card.getAttribute('data-actual-filename');
    
    if (!modelId || !collection || !filename) continue;
    
    // Check if file exists
    const actualFilename = actualFilenameAttr || getMergedFilename(filename);
    const modelPath = `models/${collection}/${actualFilename}`;
    const exists = await window.electronAPI.checkFileExists(modelPath);
    
    if (exists) {
      // Hide download button, show launch buttons and force CPU toggle
      const downloadBtn = document.getElementById(`download-btn-${modelId}`);
      const launchButtons = document.getElementById(`launch-buttons-${modelId}`);
      const forceCpuToggle = document.getElementById(`force-cpu-toggle-${modelId}`);
      
      if (downloadBtn) {
        downloadBtn.style.display = 'none';
      }
      
      if (launchButtons) {
        launchButtons.style.display = 'block';
      }
      
      if (forceCpuToggle) {
        forceCpuToggle.style.display = 'block';
      }
    }
  }
}

function buildModelCards(models, collectionKey) {
  if (models.length === 0) {
    return '<p style="color: #aaa; grid-column: 1/-1; text-align: center;">No models in this collection.</p>';
  }
  
  return models.map(m => {
    const sizeGB = m.size_mb ? (m.size_mb/1024).toFixed(1) : (m.size_gb || 0).toFixed(1);
    const ctx = m.context_length ? (m.context_length/1000).toFixed(0)+'K' : 'N/A';
    const modelFilename = m.filename || m.id + '.gguf';
    const actualFilename = getMergedFilename(modelFilename);
    const projectorFilename = m.projector_filename || '';
    const forceCpuChecked = m.force_cpu ? 'checked' : '';
    
    // Show vision indicator if model has projector
    const visionBadge = m.projector_url ? '<span style="background: #8a2be2; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-left: 5px;">👁️ Vision</span>' : '';
    // Show Ollama badge
    const ollamaBadge = '<span style="background: #1a1a2e; color: #888; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-left: 5px; border: 1px solid #444;">Ollama</span>';
    
    return `
      <div class="model-card" id="model-card-${m.id}" data-model-id="${m.id}" data-collection="${collectionKey}" data-filename="${modelFilename}" data-actual-filename="${actualFilename}">
        <h4>🤖 ${m.name}${visionBadge}${ollamaBadge}</h4>
        <p class="model-size" style="color: #60A5FA;">${sizeGB} GB</p>
        <p class="model-desc">${m.description || 'No description available'}</p>
        <div class="model-meta" style="font-size: 12px; color: #666; margin: 10px 0;">
          <div>VRAM: ${m.min_vram_gb || m.min_ram_gb}GB+</div>
          <div>Context: ${ctx}</div>
          <div>File: ${actualFilename}</div>
        </div>
        
        <!-- Force CPU Toggle -->
        <div id="force-cpu-toggle-${m.id}" style="display: none; margin: 8px 0; padding: 6px; background: rgba(255,193,7,0.1); border-radius: 5px; border: 1px solid #ffc107;">
          <label style="display: flex; align-items: center; cursor: pointer; font-size: 11px; color: #ffc107;">
            <input type="checkbox" id="force-cpu-${m.id}" ${forceCpuChecked} onchange="toggleForceCpu('${collectionKey}', '${m.id}', this.checked)" style="margin-right: 6px;">
            🖥️ Force CPU (disable GPU)
          </label>
        </div>
        
        <!-- Launch Button (Standard Edition only shows launch for pre-downloaded models) -->
        <div id="launch-buttons-${m.id}" style="display: none;">
          <button class="btn-primary" style="width: 100%; background: rgba(0,255,136,0.2); border-color: #00ff88;" onclick="launchInOllama('${collectionKey}','${modelFilename}','${projectorFilename}','${m.id}')">
            🖥️ Launch PSF Terminal
          </button>
        </div>
        
        <!-- Download button (hidden by default in Standard Edition - models are pre-loaded) -->
        <button class="btn-primary" id="download-btn-${m.id}" style="width: 100%; display: none;" disabled>
          Pre-loaded
        </button>
      </div>
    `;
  }).join('');
}

function toggleCollection(collectionKey) {
  const modelsDiv = document.getElementById(`models-${collectionKey}`);
  const toggleIcon = document.getElementById(`toggle-${collectionKey}`);
  
  if (modelsDiv.classList.contains('visible')) {
    modelsDiv.classList.remove('visible');
    toggleIcon.classList.remove('expanded');
  } else {
    modelsDiv.classList.add('visible');
    toggleIcon.classList.add('expanded');
  }
}

function expandAllCollections() {
  const allModelsContainers = document.querySelectorAll('.collection-models');
  const allToggleIcons = document.querySelectorAll('.collection-toggle');
  
  allModelsContainers.forEach(div => div.classList.add('visible'));
  allToggleIcons.forEach(icon => icon.classList.add('expanded'));
}

function collapseAllCollections() {
  const allModelsContainers = document.querySelectorAll('.collection-models');
  const allToggleIcons = document.querySelectorAll('.collection-toggle');
  
  allModelsContainers.forEach(div => div.classList.remove('visible'));
  allToggleIcons.forEach(icon => icon.classList.remove('expanded'));
}

function toggleAllCollections() {
  const allModelsContainers = document.querySelectorAll('.collection-models');
  const allToggleIcons = document.querySelectorAll('.collection-toggle');
  
  const anyVisible = Array.from(allModelsContainers).some(div => div.classList.contains('visible'));
  
  if (anyVisible) {
    collapseAllCollections();
  } else {
    expandAllCollections();
  }
}

/**
 * Toggle Force CPU setting for a model
 * Saves to catalog and updates local state
 */
async function toggleForceCpu(collectionId, modelId, forceCpu) {
  console.log(`[Model Browser] Setting force_cpu=${forceCpu} for ${modelId} in ${collectionId}`);
  
  try {
    // Update catalog via IPC
    const result = await window.electronAPI.editModel(collectionId, modelId, { force_cpu: forceCpu });
    
    if (result && result.success !== false) {
      // Update local catalogData so launch picks up the change immediately
      if (window.catalogData && window.catalogData.collections && window.catalogData.collections[collectionId]) {
        const model = window.catalogData.collections[collectionId].models?.find(m => m.id === modelId);
        if (model) {
          model.force_cpu = forceCpu;
        }
      }
      console.log(`[Model Browser] ✅ Force CPU ${forceCpu ? 'enabled' : 'disabled'} for ${modelId}`);
    } else {
      console.error('[Model Browser] Failed to update force_cpu:', result);
      // Revert checkbox
      const checkbox = document.getElementById(`force-cpu-${modelId}`);
      if (checkbox) checkbox.checked = !forceCpu;
      alert('Failed to save setting');
    }
  } catch (err) {
    console.error('[Model Browser] Error toggling force_cpu:', err);
    // Revert checkbox
    const checkbox = document.getElementById(`force-cpu-${modelId}`);
    if (checkbox) checkbox.checked = !forceCpu;
  }
}
// ============================================================================
