/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
/**
 * Catalog Browser extracted interaction/action handlers.
 */

function handleCBDragStart(event, modelId, collectionKey) {
  if (!window.catalogBrowserState.editMode) {
    event.preventDefault();
    return;
  }
  
  window.catalogBrowserState.draggedModelId = modelId;
  event.dataTransfer.effectAllowed = 'move';
  event.target.style.opacity = '0.5';
}

/**
 * Handle drag over
 */
function handleCBDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
}

/**
 * Handle drag end
 */
function handleCBDragEnd(event) {
  event.target.style.opacity = '1';
  window.catalogBrowserState.draggedModelId = null;
}

/**
 * Handle drop - reorder within collection and save to catalog
 */
async function handleCBDrop(event, targetCollectionKey, targetIndex) {
  event.preventDefault();
  
  const draggedId = window.catalogBrowserState.draggedModelId;
  if (!draggedId) return;
  
  const { catalog, viewScope, currentCollection } = window.catalogBrowserState;
  
  // Find source model
  let sourceCollectionKey = null;
  let sourceIndex = -1;
  
  for (const [collKey, coll] of Object.entries(catalog.collections || {})) {
    const idx = coll.models?.findIndex(m => m.id === draggedId);
    if (idx !== -1) {
      sourceCollectionKey = collKey;
      sourceIndex = idx;
      break;
    }
  }
  
  if (!sourceCollectionKey || sourceIndex === -1) return;
  
  // If viewing by collection, only allow reorder within same collection
  if (viewScope === 'collection') {
    if (sourceCollectionKey !== currentCollection) {
      alert('Cannot move models between collections in this view.');
      return;
    }
    
    // Reorder within collection
    const collection = catalog.collections[sourceCollectionKey];
    const models = [...collection.models];
    const [movedModel] = models.splice(sourceIndex, 1);
    models.splice(targetIndex, 0, movedModel);
    collection.models = models;
    
  } else {
    // In "all models" view, we can only reorder within the same collection
    if (sourceCollectionKey !== targetCollectionKey) {
      // Moving between collections - use moveModel IPC
      try {
        const result = await window.electronAPI.moveModel(sourceCollectionKey, targetCollectionKey, draggedId);
        if (!result.success) {
          alert(`Failed to move model: ${result.message}`);
          return;
        }
      } catch (err) {
        alert(`Error moving model: ${err.message}`);
        return;
      }
    } else {
      // Same collection, just reorder
      const collection = catalog.collections[sourceCollectionKey];
      const models = [...collection.models];
      const [movedModel] = models.splice(sourceIndex, 1);
      models.splice(targetIndex, 0, movedModel);
      collection.models = models;
    }
  }
  
  // Save updated catalog
  try {
    const result = await window.electronAPI.saveMasterCatalog(catalog);
    if (result.success) {
      console.log('[Catalog Browser] Order saved to catalog');
    } else {
      console.error('[Catalog Browser] Failed to save order:', result.message);
    }
  } catch (err) {
    console.error('[Catalog Browser] Error saving order:', err);
  }
  
  window.catalogBrowserState.draggedModelId = null;
  renderCatalogBrowser();
}

// ============================================================================
// MODEL ACTIONS
// ============================================================================

/**
 * Launch model from catalog browser
 * Self-contained launch handler with proper progress display
 */


/**
 * Download model from catalog browser
 * Self-contained download handler using cb-prefixed element IDs
 */


/**
 * Edit model catalog entry
 */


/**
 * Delete model from catalog (metadata only)
 */


/**
 * Open model configuration (Modelfile editor)
 */


/**
 * Toggle Force CPU setting for a model
 */


/**
 * Verify model checksum
 */




/**
 * Delete model FILE (GGUF, blob, manifest) - NOT catalog entry
 */


// ============================================================================
// STYLES
// ============================================================================

/**
 * Add catalog browser styles
 */

// Exports for moved action handlers
window.handleCBDragStart = handleCBDragStart;
window.handleCBDragOver = handleCBDragOver;
window.handleCBDragEnd = handleCBDragEnd;
window.handleCBDrop = handleCBDrop;
