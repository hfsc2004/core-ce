/**
 * ============================================================================
 * CATALOG BROWSER - Developer Edition Browse & Download
 * ============================================================================
 * 
 * Expandable/collapsible model list with Edit/Delete catalog actions and
 * drag-and-drop reordering that saves directly to the master catalog.
 * 
 * This is SEPARATE from the MoE model ordering system - changes here affect
 * the catalog order, not the MoE pipeline ordering.
 * 
 * @module catalog-browser
 * @version 1.1.2 - March 5, 2026
 * ============================================================================
 */

// ============================================================================
// STATE (Separate from MoE state)
// ============================================================================

window.catalogBrowserState = {
  catalog: null,
  expandedModelIds: new Set(),  // Multiple models can be expanded
  allExpanded: false,           // Track expand/collapse all state
  downloadStatus: {},
  editMode: false,
  selectedModels: new Set(),
  draggedModelId: null,
  currentCollection: null,  // For collection-scoped view
  viewScope: 'collection',  // 'all' | 'parameters' | 'collection'
  parameterSortDirection: 'desc', // 'desc' (high->low) | 'asc' (low->high)
  searchQuery: '', // applied filter by name/id/filename/description/collection
  searchDraft: '', // in-progress typed query (applies on Enter/Search)
  runtimeFilter: 'all',
  acceleratorFilter: 'all',
  profileFilter: 'all'
};


// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Load and display the catalog browser (Developer Edition)
 */
async function loadCatalogBrowser() {
  const container = document.getElementById('model-grid');
  if (!container) return;

  container.innerHTML = '<div class="info-loading"><div class="spinner"></div><p>Loading catalog...</p></div>';

  try {
    const catalog = await window.electronAPI.getMasterCatalog();
    window.catalogBrowserState.catalog = catalog;

    // Set initial collection if in collection view and none selected
    if (window.catalogBrowserState.viewScope === 'collection') {
      const collectionKeys = Object.keys(catalog?.collections || {});
      const selectedKey = window.catalogBrowserState.currentCollection;
      if (!selectedKey || !collectionKeys.includes(selectedKey)) {
        window.catalogBrowserState.currentCollection = collectionKeys[0] || null;
      }
    }

    // Check download status in background
    checkCatalogBrowserDownloadStatus().then(() => {
      if (typeof window.renderCatalogBrowser === 'function') { window.renderCatalogBrowser(); }
    });

    // Render immediately with unknown status
    if (typeof window.renderCatalogBrowser === 'function') { window.renderCatalogBrowser(); }

  } catch (err) {
    console.error('[Catalog Browser] Failed to load:', err);
    container.innerHTML = '<p style="color: #ff6b6b;">Failed to load catalog. Check console for details.</p>';
  }
}

// ============================================================================
// DOWNLOAD STATUS CHECK
// ============================================================================

/**
 * Check download status for all models (filesystem-based)
 */
async function checkCatalogBrowserDownloadStatus() {
  const { catalog } = window.catalogBrowserState;
  if (!catalog) return;
  
  const modelsToCheck = [];
  
  for (const [collectionKey, collection] of Object.entries(catalog.collections || {})) {
    for (const model of (collection.models || [])) {
      const filename = model.filename || model.id + '.gguf';
      modelsToCheck.push({
        id: model.id,
        collectionKey,
        filename
      });
    }
  }
  
  if (modelsToCheck.length === 0) return;
  
  try {
    const results = await window.electronAPI.checkAllModelFiles(modelsToCheck);
    
    for (const [modelId, status] of Object.entries(results)) {
      window.catalogBrowserState.downloadStatus[modelId] = {
        downloaded: status.downloaded,
        wrapped: status.wrapped,
        modelName: status.modelName
      };
    }
    
    console.log('[Catalog Browser] Status check complete');
    
  } catch (err) {
    console.error('[Catalog Browser] Status check failed:', err);
  }
}

// ============================================================================
// MAIN RENDER
// ============================================================================

/**
 * Render the catalog browser
 */


/**
 * Render model rows based on current view scope
 */


// ============================================================================
// ROW RENDERING
// ============================================================================

/**
 * Render a single model row
 */


/**
 * Render expanded details with Browse & Download actions
 */


// ============================================================================
// VIEW CONTROLS
// ============================================================================

/**
 * Toggle expanded state for a single model
 */
function toggleCatalogBrowserExpand(modelId) {
  if (window.catalogBrowserState.editMode) return; // Don't expand in edit mode
  
  const { expandedModelIds } = window.catalogBrowserState;
  
  if (expandedModelIds.has(modelId)) {
    expandedModelIds.delete(modelId);
  } else {
    expandedModelIds.add(modelId);
  }
  
  // Update allExpanded flag based on current state
  updateAllExpandedState();
  if (typeof window.renderCatalogBrowser === 'function') { window.renderCatalogBrowser(); }
}

/**
 * Toggle expand/collapse all models
 */
function toggleAllCatalogBrowserExpand() {
  if (window.catalogBrowserState.editMode) return;
  
  const { catalog, viewScope, currentCollection, allExpanded } = window.catalogBrowserState;
  
  if (allExpanded) {
    // Collapse all
    window.catalogBrowserState.expandedModelIds.clear();
    window.catalogBrowserState.allExpanded = false;
  } else {
    // Expand all - get all model IDs in current view
    window.catalogBrowserState.expandedModelIds.clear();
    
    if (viewScope === 'collection' && currentCollection) {
      const collection = catalog?.collections?.[currentCollection];
      if (collection?.models) {
        collection.models.forEach(m => window.catalogBrowserState.expandedModelIds.add(m.id));
      }
    } else {
      // All models
      for (const collection of Object.values(catalog?.collections || {})) {
        for (const model of (collection.models || [])) {
          window.catalogBrowserState.expandedModelIds.add(model.id);
        }
      }
    }
    window.catalogBrowserState.allExpanded = true;
  }
  
  if (typeof window.renderCatalogBrowser === 'function') { window.renderCatalogBrowser(); }
}

/**
 * Update allExpanded flag based on current expanded state
 */
function updateAllExpandedState() {
  const { catalog, viewScope, currentCollection, expandedModelIds } = window.catalogBrowserState;
  
  let totalModels = 0;
  
  if (viewScope === 'collection' && currentCollection) {
    const collection = catalog?.collections?.[currentCollection];
    totalModels = collection?.models?.length || 0;
  } else {
    for (const collection of Object.values(catalog?.collections || {})) {
      totalModels += collection.models?.length || 0;
    }
  }
  
  // If all models are expanded, set allExpanded to true
  window.catalogBrowserState.allExpanded = (expandedModelIds.size === totalModels && totalModels > 0);
}

/**
 * Set view scope (all vs collection)
 */
function setCatalogBrowserScope(scope) {
  if (scope === 'parameters' && window.catalogBrowserState.viewScope === 'parameters') {
    window.catalogBrowserState.parameterSortDirection =
      window.catalogBrowserState.parameterSortDirection === 'desc' ? 'asc' : 'desc';
  }
  window.catalogBrowserState.viewScope = scope;
  
  if (scope === 'collection' && !window.catalogBrowserState.currentCollection) {
    const firstCollection = Object.keys(window.catalogBrowserState.catalog?.collections || {})[0];
    window.catalogBrowserState.currentCollection = firstCollection;
  }
  
  // Reset expanded state when changing scope
  window.catalogBrowserState.expandedModelIds.clear();
  window.catalogBrowserState.allExpanded = false;
  
  if (typeof window.renderCatalogBrowser === 'function') { window.renderCatalogBrowser(); }
}

/**
 * Select collection for collection view
 */
function selectCatalogBrowserCollection(collectionKey) {
  window.catalogBrowserState.currentCollection = collectionKey;
  if (typeof window.renderCatalogBrowser === 'function') { window.renderCatalogBrowser(); }
}

/**
 * Toggle edit/reorder mode
 */
function toggleCatalogBrowserEditMode() {
  window.catalogBrowserState.editMode = !window.catalogBrowserState.editMode;
  window.catalogBrowserState.expandedModelId = null; // Collapse when entering edit mode
  window.catalogBrowserState.selectedModels.clear();
  if (typeof window.renderCatalogBrowser === 'function') { window.renderCatalogBrowser(); }
}

function setCatalogBrowserSearchQuery(query) {
  window.catalogBrowserState.searchQuery = String(query || '');
  window.catalogBrowserState.searchDraft = String(query || '');
  if (typeof window.renderCatalogBrowser === 'function') { window.renderCatalogBrowser(); }
}

function setCatalogBrowserSearchDraft(query) {
  window.catalogBrowserState.searchDraft = String(query || '');
}

function applyCatalogBrowserSearch() {
  window.catalogBrowserState.searchQuery = String(window.catalogBrowserState.searchDraft || '');
  if (typeof window.renderCatalogBrowser === 'function') { window.renderCatalogBrowser(); }
}

function handleCatalogBrowserSearchKeydown(event) {
  if (!event) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    applyCatalogBrowserSearch();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    clearCatalogBrowserSearch();
  }
}

function clearCatalogBrowserSearch() {
  window.catalogBrowserState.searchQuery = '';
  window.catalogBrowserState.searchDraft = '';
  if (typeof window.renderCatalogBrowser === 'function') { window.renderCatalogBrowser(); }
}

function setCatalogBrowserRuntimeFilter(value) {
  window.catalogBrowserState.runtimeFilter = String(value || 'all').trim() || 'all';
  if (typeof window.renderCatalogBrowser === 'function') { window.renderCatalogBrowser(); }
}

function setCatalogBrowserAcceleratorFilter(value) {
  window.catalogBrowserState.acceleratorFilter = String(value || 'all').trim() || 'all';
  if (typeof window.renderCatalogBrowser === 'function') { window.renderCatalogBrowser(); }
}

function setCatalogBrowserProfileFilter(value) {
  window.catalogBrowserState.profileFilter = String(value || 'all').trim() || 'all';
  if (typeof window.renderCatalogBrowser === 'function') { window.renderCatalogBrowser(); }
}

/**
 * Refresh catalog browser
 */
async function refreshCatalogBrowser() {
  window.catalogBrowserState.downloadStatus = {};
  await loadCatalogBrowser();
}

// ============================================================================
// DRAG AND DROP (Saves to Catalog)
// ============================================================================

/**
 * Handle drag start
 */
function addCatalogBrowserStyles() {
  if (document.getElementById('catalog-browser-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'catalog-browser-styles';
  style.textContent = `
    /* Override model-grid for catalog browser - full width, centered */
    #model-grid {
      display: block !important;
      grid-template-columns: none !important;
      width: 100% !important;
      max-width: 100% !important;
      padding: 0 40px !important;
      box-sizing: border-box !important;
    }
    
    .cb-scope-btn {
      background: rgba(255,255,255,0.05);
      color: #888;
    }
    .cb-scope-btn:hover {
      background: rgba(255,255,255,0.1);
      color: #fff;
    }
    .cb-scope-btn-active {
      background: var(--psf-accent-medium, rgba(0,212,255,0.2));
      color: var(--psf-accent, #00d4ff);
    }
    .cb-model-row:hover {
      background: rgba(255,255,255,0.08) !important;
    }
    .cb-model-row.selected {
      background: var(--psf-accent-light, rgba(0,212,255,0.15)) !important;
    }
    .cb-drag-handle:hover {
      color: var(--psf-accent, #00d4ff) !important;
    }
  `;
  document.head.appendChild(style);
}

// ============================================================================
// EXPORTS
// ============================================================================

window.loadCatalogBrowser = loadCatalogBrowser;
window.renderCatalogBrowser = (typeof window.renderCatalogBrowser === 'function') ? window.renderCatalogBrowser : function () {};
window.toggleCatalogBrowserExpand = toggleCatalogBrowserExpand;
window.toggleAllCatalogBrowserExpand = toggleAllCatalogBrowserExpand;
window.updateAllExpandedState = updateAllExpandedState;
window.setCatalogBrowserScope = setCatalogBrowserScope;
window.selectCatalogBrowserCollection = selectCatalogBrowserCollection;
window.toggleCatalogBrowserEditMode = toggleCatalogBrowserEditMode;
window.refreshCatalogBrowser = refreshCatalogBrowser;
window.setCatalogBrowserSearchQuery = setCatalogBrowserSearchQuery;
window.setCatalogBrowserSearchDraft = setCatalogBrowserSearchDraft;
window.applyCatalogBrowserSearch = applyCatalogBrowserSearch;
window.handleCatalogBrowserSearchKeydown = handleCatalogBrowserSearchKeydown;
window.clearCatalogBrowserSearch = clearCatalogBrowserSearch;
window.setCatalogBrowserRuntimeFilter = setCatalogBrowserRuntimeFilter;
window.setCatalogBrowserAcceleratorFilter = setCatalogBrowserAcceleratorFilter;
window.setCatalogBrowserProfileFilter = setCatalogBrowserProfileFilter;
