/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
// GROUP MANAGER
// ============================================================================

// Listen for refresh events from model editor window
if (window.electronAPI && window.electronAPI.onRefreshPackageManager) {
  window.electronAPI.onRefreshPackageManager(() => {
    console.log('[Group Manager] Received refresh event from model editor');
    loadPackageManager();
  });
}

const {
  initDraggableModal = () => {},
  centerModal = () => {}
} = window.packageManagerModalUtils || {};

const {
  inferParametersLabel = () => ''
} = window.modelParameterUtils || {};

async function loadPackageManager() {
  const container = document.getElementById('package-manager-content');
  container.innerHTML = '<div class="info-loading"><div class="spinner"></div><p>Loading groups...</p></div>';
  
  try {
    const [catalog, skuManifest] = await Promise.all([
      window.electronAPI.getMasterCatalog(),
      window.electronAPI.getSKUManifest().catch(() => null)
    ]);
    window.catalogData = catalog;
    window.skuManifest = skuManifest;
    
    displayPackageManager(catalog);
  } catch (err) {
    console.error('Failed to load groups:', err);
    container.innerHTML = '<p style="color: #ff6b6b;">Failed to load groups. Check console for details.</p>';
  }
}

function displayPackageManager(catalog) {
  const container = document.getElementById('package-manager-content');
  
  const collections = catalog.collections || {};
  const collectionKeys = Object.keys(collections);

  const skuDefinitions = (window.skuManifest && window.skuManifest.skus) ? window.skuManifest.skus : {};
  const activeSkuEntries = Object.entries(skuDefinitions).filter(([, sku]) => sku && sku.active !== false);
  const skuCount = activeSkuEntries.length;
  
  let html = `
    <div style="max-width: 1400px; margin: 0 auto;">
      <div style="background: var(--psf-accent-light, rgba(0,212,255,0.1)); border: 2px solid var(--psf-accent, #00d4ff); border-radius: 10px; padding: 20px; margin-bottom: 30px;">
        <h3 style="color: var(--psf-accent, #00d4ff); margin-bottom: 10px;">📊 Group Statistics</h3>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 15px;">
          <div>
            <p style="color: #aaa; font-size: 14px;">Total Groups</p>
            <p style="color: var(--psf-accent, #00d4ff); font-size: 24px; font-weight: bold;">${collectionKeys.length}</p>
          </div>
          <div>
            <p style="color: #aaa; font-size: 14px;">SKU Groups</p>
            <p style="color: var(--psf-accent, #00d4ff); font-size: 24px; font-weight: bold;">${skuCount}</p>
          </div>
          <div>
            <p style="color: #aaa; font-size: 14px;">Catalog Version</p>
            <p style="color: var(--psf-accent, #00d4ff); font-size: 24px; font-weight: bold;">${catalog.version}</p>
          </div>
        </div>
      </div>
      
      <div style="margin-bottom: 20px;">
        <input type="text" id="package-search" placeholder="🔍 Search groups..." 
               onkeyup="filterPackages()" 
               style="width: 100%; padding: 12px; background: rgba(255,255,255,0.1); border: 1px solid var(--psf-border, #0f3460); border-radius: 5px; color: #fff; font-size: 16px;">
      </div>
      
      <div id="package-list" style="display: grid; gap: 15px;">
        ${collectionKeys.map(key => createPackageRow(key, collections[key], skuDefinitions)).join('')}
      </div>
    </div>
  `;
  
  container.innerHTML = html;
}

function createPackageRow(collectionKey, collection, skuDefinitions) {
  const modelCount = collection.models?.length || 0;
  
  // Determine which SKUs include this collection
  const includedInSkus = [];
  for (const [skuId, skuInfo] of Object.entries(skuDefinitions)) {
    if (!skuInfo || skuInfo.active === false) continue;
    if (skuInfo.collections === 'all' || skuInfo.collections.includes(collectionKey)) {
      const badge = skuInfo.legacy ? `${skuInfo.name} (legacy)` : skuInfo.name;
      includedInSkus.push(badge);
    }
  }
  
  return `
    <div class="package-row" data-collection-id="${collectionKey}" data-collection-name="${collection.name.toLowerCase()}">
      <div style="background: rgba(255,255,255,0.05); border: 2px solid var(--psf-border, #0f3460); border-radius: 10px; padding: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: start;">
          <div style="flex: 1;">
            <h4 style="color: var(--psf-accent, #00d4ff); margin-bottom: 5px;">${collection.name}</h4>
            <p style="color: #888; font-size: 14px; margin-bottom: 5px;">
              Group ID: ${collectionKey} • Drive Size: ${collection.drive_size || 'N/A'} • Models: ${modelCount}
            </p>
            <p style="color: #aaa; font-size: 13px; margin-bottom: 10px;">${collection.description || 'No description'}</p>
            <div style="margin-top: 10px;">
              <p style="color: #666; font-size: 12px; margin-bottom: 5px;">Included in SKUs:</p>
              <div style="display: flex; flex-wrap: wrap; gap: 5px;">
                ${includedInSkus.map(sku => `
                  <span style="background: var(--psf-accent-medium, rgba(0,212,255,0.2)); color: var(--psf-accent, #00d4ff); padding: 4px 10px; border-radius: 12px; font-size: 12px;">
                    ${sku}
                  </span>
                `).join('')}
              </div>
            </div>
          </div>
          <div style="display: flex; gap: 10px; margin-left: 20px;">
             <button class="btn-secondary" onclick="editCollection('${collectionKey}')" style="white-space: nowrap;">
              ✏️ Edit
            </button>
            <button class="btn-secondary" onclick="deleteCollection('${collectionKey}')" style="white-space: nowrap; background: rgba(255,107,107,0.2); border-color: #ff6b6b;">
              🗑️ Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function filterPackages() {
  const searchTerm = document.getElementById('package-search').value.toLowerCase();
  const packageRows = document.querySelectorAll('.package-row');
  
  packageRows.forEach(row => {
    const collectionName = row.getAttribute('data-collection-name');
    const collectionId = row.getAttribute('data-collection-id');
    if (collectionName.includes(searchTerm) || collectionId.includes(searchTerm)) {
      row.style.display = 'block';
    } else {
      row.style.display = 'none';
    }
  });
}

function displayCatalogEditor(catalog) {
  const container = document.getElementById('catalog-editor-content');
  
  // Flatten all models
  const allModels = [];
  for (const collectionKey in catalog.collections) {
    const collection = catalog.collections[collectionKey];
    collection.models.forEach(model => {
      allModels.push({
        ...model,
        collectionKey: collectionKey,
        collectionName: collection.name
      });
    });
  }
  
  let html = `
    <div style="max-width: 1400px; margin: 0 auto;">
      <div style="background: var(--psf-accent-light, rgba(0,212,255,0.1)); border: 2px solid var(--psf-accent, #00d4ff); border-radius: 10px; padding: 20px; margin-bottom: 30px;">
        <h3 style="color: var(--psf-accent, #00d4ff); margin-bottom: 10px;">📊 Catalog Statistics</h3>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 15px;">
          <div>
            <p style="color: #aaa; font-size: 14px;">Total Models</p>
            <p style="color: var(--psf-accent, #00d4ff); font-size: 24px; font-weight: bold;">${allModels.length}</p>
          </div>
          <div>
            <p style="color: #aaa; font-size: 14px;">Groups</p>
            <p style="color: var(--psf-accent, #00d4ff); font-size: 24px; font-weight: bold;">${Object.keys(catalog.collections).length}</p>
          </div>
          <div>
            <p style="color: #aaa; font-size: 14px;">Catalog Version</p>
            <p style="color: var(--psf-accent, #00d4ff); font-size: 24px; font-weight: bold;">${catalog.version}</p>
          </div>
        </div>
      </div>
      
      <div style="margin-bottom: 20px;">
        <input type="text" id="model-search" placeholder="🔍 Search models..." 
               onkeyup="filterModels()" 
               style="width: 100%; padding: 12px; background: rgba(255,255,255,0.1); border: 1px solid var(--psf-border, #0f3460); border-radius: 5px; color: #fff; font-size: 16px;">
      </div>
      
      <div id="model-list" style="display: grid; gap: 15px;">
        ${allModels.map(m => createModelRow(m)).join('')}
      </div>
    </div>
  `;
  
  container.innerHTML = html;
}

function createModelRow(model) {
  const sizeGB = model.size_mb ? (model.size_mb/1024).toFixed(1) : (model.size_gb || 0).toFixed(1);
  
  return `
    <div class="model-row" data-model-id="${model.id}" data-model-name="${model.name.toLowerCase()}">
      <div style="background: rgba(255,255,255,0.05); border: 2px solid var(--psf-border, #0f3460); border-radius: 10px; padding: 20px; display: flex; justify-content: space-between; align-items: center;">
        <div style="flex: 1;">
          <h4 style="color: var(--psf-accent, #00d4ff); margin-bottom: 5px;">${model.name}</h4>
          <p style="color: #888; font-size: 14px; margin-bottom: 5px;">
            ${sizeGB} GB • ${model.quantization || 'N/A'} • Group: ${model.collectionName}
          </p>
          <p style="color: #aaa; font-size: 13px;">${model.description || 'No description'}</p>
        </div>
        <div style="display: flex; gap: 10px;">
          <button class="btn-secondary" onclick="editModel('${model.id}', '${model.collectionKey}')" style="white-space: nowrap;">
            ✏️ Edit
          </button>
          <button class="btn-secondary" onclick="deleteModelFromCatalogPM('${model.id}', '${model.collectionKey}')" style="white-space: nowrap; background: rgba(255,107,107,0.2); border-color: #ff6b6b;">
            🗑️ Delete
          </button>
        </div>
      </div>
    </div>
  `;
}

function filterModels() {
  const searchTerm = document.getElementById('model-search').value.toLowerCase();
  const modelRows = document.querySelectorAll('.model-row');
  
  modelRows.forEach(row => {
    const modelName = row.getAttribute('data-model-name');
    if (modelName.includes(searchTerm)) {
      row.style.display = 'block';
    } else {
      row.style.display = 'none';
    }
  });
}

async function showAddModelForm() {
  // Get collections list
  const collectionsResponse = await window.electronAPI.getCollections();
  if (!collectionsResponse.success) {
    alert('Failed to load collections');
    return;
  }
  
  const collections = collectionsResponse.collections;
  
  // Open the model editor in a separate draggable window
  const result = await window.electronAPI.openModelEditor('add', null, collections);
  if (!result.success && result.error !== 'Editor window already open') {
    alert('Failed to open model editor: ' + result.error);
  }
}

// Fetch architecture details from HuggingFace config.json


// Auto-fill projector filename from URL




// Fetch model info from HuggingFace API




// Fetch file info (size, filename) from Direct Download URL




// Helper to show status messages

function closeAddModelForm(event) {
  if (event && event.target !== event.currentTarget) return;
  const overlay = document.getElementById('add-model-overlay');
  if (overlay) overlay.remove();
}

async function submitAddModel(event) {
  event.preventDefault();
  
  const collectionId = document.getElementById('model-collection').value;
  const useCasesStr = document.getElementById('model-use-cases').value;
  const languagesStr = document.getElementById('model-languages').value;
  
  const modelData = {
    // Basic Info
    id: document.getElementById('model-id').value.trim(),
    name: document.getElementById('model-name').value.trim(),
    model_family: document.getElementById('model-family').value.trim() || null,
    version: document.getElementById('model-version').value.trim() || null,
    organization: document.getElementById('model-organization').value.trim() || null,
    description: document.getElementById('model-description').value.trim(),
    
    // Files & Downloads
    url: document.getElementById('model-url').value.trim(),
    download_url: document.getElementById('model-download-url').value.trim() || null,
    filename: document.getElementById('model-filename').value.trim() || null,
    huggingface_repo: document.getElementById('model-hf-repo').value.trim() || null,
    sha256: document.getElementById('model-sha256').value.trim() || null,
    size_mb: parseInt(document.getElementById('model-size-mb').value),
    file_size_bytes: document.getElementById('model-file-size-bytes').value ? parseInt(document.getElementById('model-file-size-bytes').value) : null,
    
    // Projector File (Vision Models)
    projector_url: document.getElementById('model-projector-url').value.trim() || null,
    projector_filename: document.getElementById('model-projector-filename').value.trim() || null,
    
    // Model Properties
    quantization: document.getElementById('model-quantization').value,
    context_length: document.getElementById('model-context').value ? parseInt(document.getElementById('model-context').value) : null,
    parameter_count: document.getElementById('model-parameter-count').value ? parseInt(document.getElementById('model-parameter-count').value) : null,
    parameters: inferParametersLabel({
      name: document.getElementById('model-name').value.trim(),
      id: document.getElementById('model-id').value.trim(),
      filename: document.getElementById('model-filename').value.trim(),
      model_family: document.getElementById('model-family').value.trim(),
      parameter_count: document.getElementById('model-parameter-count').value ? parseInt(document.getElementById('model-parameter-count').value) : null
    }) || null,
    architecture: document.getElementById('model-architecture').value.trim() || null,
    release_date: document.getElementById('model-release-date').value || null,
    
    // Capabilities
    supports_vision: document.getElementById('model-supports-vision').checked,
    supports_function_calling: document.getElementById('model-supports-function-calling').checked,
    supports_code: document.getElementById('model-supports-code').checked,
    languages: languagesStr ? languagesStr.split(',').map(s => s.trim()) : [],
    use_cases: useCasesStr ? useCasesStr.split(',').map(s => s.trim()) : [],
    
    // Hardware Requirements
    min_ram_gb: parseInt(document.getElementById('model-min-ram').value),
    recommended_ram_gb: parseInt(document.getElementById('model-rec-ram').value),
    gpu_layers: document.getElementById('model-gpu-layers').value ? parseInt(document.getElementById('model-gpu-layers').value) : null,
    
    // Architecture Details (for KV cache calculation)
    base_model_url: document.getElementById('model-base-url').value.trim() || null,
    hidden_size: document.getElementById('model-hidden-size').value ? parseInt(document.getElementById('model-hidden-size').value) : null,
    num_layers: document.getElementById('model-num-layers').value ? parseInt(document.getElementById('model-num-layers').value) : null,
    num_kv_heads: document.getElementById('model-num-kv-heads').value ? parseInt(document.getElementById('model-num-kv-heads').value) : null,
    num_attention_heads: document.getElementById('model-num-attn-heads').value ? parseInt(document.getElementById('model-num-attn-heads').value) : null,
    
    // License
    license: document.getElementById('model-license').value.trim(),
    license_url: document.getElementById('model-license-url').value.trim() || null,
    copyright: document.getElementById('model-copyright').value.trim() || null
  };
  
  const result = await window.electronAPI.addModel(collectionId, modelData);
  
  if (result.success) {
    alert(`✅ Model "${modelData.name}" added successfully!`);
    closeAddModelForm();
    loadCatalogEditor(); // Reload the editor
  } else {
    alert(`❌ Failed to add model:\n${result.message}`);
  }
}

async function editModel(modelId, collectionKey) {
  // Get the model data
  const catalog = window.catalogData;
  const collection = catalog.collections[collectionKey];
  if (!collection) {
    alert('Group not found');
    return;
  }
  
  const model = collection.models.find(m => m.id === modelId);
  if (!model) {
    alert('Model not found');
    return;
  }
  
  // Get collections list
  const collectionsResponse = await window.electronAPI.getCollections();
  if (!collectionsResponse.success) {
    alert('Failed to load collections');
    return;
  }
  
  const collections = collectionsResponse.collections;
  
  // Add collection info to model data for the editor
  const modelWithCollection = { ...model, collectionId: collectionKey };
  
  // Open the model editor in a separate draggable window
  const result = await window.electronAPI.openModelEditor('edit', modelWithCollection, collections);
  if (!result.success && result.error !== 'Editor window already open') {
    alert('Failed to open model editor: ' + result.error);
  }
}

// Fetch architecture details from HuggingFace config.json (Edit form version)


function closeEditModelForm(event) {
  if (event && event.target !== event.currentTarget) return;
  const overlay = document.getElementById('edit-model-overlay');
  if (overlay) overlay.remove();
}

async function submitEditModel(event, modelId, collectionKey) {
  event.preventDefault();
  
  const useCasesStr = document.getElementById('edit-model-use-cases').value;
  const languagesStr = document.getElementById('edit-model-languages').value;
  
  const updatedModelData = {
    // Basic Info
    id: modelId, // Keep same ID
    name: document.getElementById('edit-model-name').value.trim(),
    model_family: document.getElementById('edit-model-family').value.trim() || null,
    version: document.getElementById('edit-model-version').value.trim() || null,
    organization: document.getElementById('edit-model-organization').value.trim() || null,
    description: document.getElementById('edit-model-description').value.trim(),
    
    // Files & Downloads
    url: document.getElementById('edit-model-url').value.trim(),
    download_url: document.getElementById('edit-model-download-url').value.trim() || null,
    filename: document.getElementById('edit-model-filename').value.trim() || null,
    huggingface_repo: document.getElementById('edit-model-hf-repo').value.trim() || null,
    sha256: document.getElementById('edit-model-sha256').value.trim() || null,
    size_mb: parseInt(document.getElementById('edit-model-size-mb').value),
    file_size_bytes: document.getElementById('edit-model-file-size-bytes').value ? parseInt(document.getElementById('edit-model-file-size-bytes').value) : null,
    
    // Projector File (Vision Models)
    projector_url: document.getElementById('edit-model-projector-url').value.trim() || null,
    projector_filename: document.getElementById('edit-model-projector-filename').value.trim() || null,
    
    // Model Properties
    quantization: document.getElementById('edit-model-quantization').value,
    context_length: document.getElementById('edit-model-context').value ? parseInt(document.getElementById('edit-model-context').value) : null,
    parameter_count: document.getElementById('edit-model-parameter-count').value ? parseInt(document.getElementById('edit-model-parameter-count').value) : null,
    parameters: inferParametersLabel({
      name: document.getElementById('edit-model-name').value.trim(),
      id: modelId,
      filename: document.getElementById('edit-model-filename').value.trim(),
      model_family: document.getElementById('edit-model-family').value.trim(),
      parameter_count: document.getElementById('edit-model-parameter-count').value ? parseInt(document.getElementById('edit-model-parameter-count').value) : null
    }) || null,
    architecture: document.getElementById('edit-model-architecture').value.trim() || null,
    release_date: document.getElementById('edit-model-release-date').value || null,
    
    // Capabilities
    supports_vision: document.getElementById('edit-model-supports-vision').checked,
    supports_function_calling: document.getElementById('edit-model-supports-function-calling').checked,
    supports_code: document.getElementById('edit-model-supports-code').checked,
    languages: languagesStr ? languagesStr.split(',').map(s => s.trim()) : [],
    use_cases: useCasesStr ? useCasesStr.split(',').map(s => s.trim()) : [],
    
    // Hardware Requirements
    min_ram_gb: parseInt(document.getElementById('edit-model-min-ram').value),
    recommended_ram_gb: parseInt(document.getElementById('edit-model-rec-ram').value),
    gpu_layers: document.getElementById('edit-model-gpu-layers').value ? parseInt(document.getElementById('edit-model-gpu-layers').value) : null,
    
    // Architecture Details (for KV cache calculation)
    base_model_url: document.getElementById('edit-model-base-url').value.trim() || null,
    hidden_size: document.getElementById('edit-model-hidden-size').value ? parseInt(document.getElementById('edit-model-hidden-size').value) : null,
    num_layers: document.getElementById('edit-model-num-layers').value ? parseInt(document.getElementById('edit-model-num-layers').value) : null,
    num_kv_heads: document.getElementById('edit-model-num-kv-heads').value ? parseInt(document.getElementById('edit-model-num-kv-heads').value) : null,
    num_attention_heads: document.getElementById('edit-model-num-attn-heads').value ? parseInt(document.getElementById('edit-model-num-attn-heads').value) : null,
    
    // License
    license: document.getElementById('edit-model-license').value.trim(),
    license_url: document.getElementById('edit-model-license-url').value.trim() || null,
    copyright: document.getElementById('edit-model-copyright').value.trim() || null
  };
  
  const result = await window.electronAPI.editModel(collectionKey, modelId, updatedModelData);
  
  if (result.success) {
    alert(`✅ Model "${updatedModelData.name}" updated successfully!`);
    closeEditModelForm();
    loadCatalogEditor(); // Reload the editor
  } else {
    alert(`❌ Failed to update model:\n${result.message}`);
  }
}


// ============================================================================
