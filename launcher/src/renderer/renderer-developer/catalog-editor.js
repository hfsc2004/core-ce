/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
// CATALOG EDITOR
// ============================================================================

async function loadCatalogEditor() {
  const container = document.getElementById('catalog-editor-content');
  container.innerHTML = '<div class="info-loading"><div class="spinner"></div><p>Loading catalog...</p></div>';
  
  try {
    const catalog = await window.electronAPI.getMasterCatalog();
    window.catalogData = catalog;
    
    displayCatalogEditor(catalog);
  } catch (err) {
    console.error('Failed to load catalog:', err);
    container.innerHTML = '<p style="color: #ff6b6b;">Failed to load catalog. Check console for details.</p>';
  }
}

// ============================================================================
// IMPORT MODELS DIALOG
// ============================================================================

/**
 * Show import dialog to import models from a JSON file
 */
async function showImportDialog() {
  try {
    // Step 1: Select file
    const fileResult = await window.electronAPI.selectImportFile();
    if (!fileResult.success || fileResult.canceled) {
      return; // User canceled
    }
    
    // Step 2: Preview the file contents
    const previewResult = await window.electronAPI.previewImportFile(fileResult.filePath);
    if (!previewResult.success) {
      showScrollableModal('Import Error', previewResult.message || 'Failed to read import file', 'error');
      return;
    }
    
    // Step 3: Show import preview modal
    showImportPreviewModal(fileResult.filePath, previewResult);
    
  } catch (err) {
    console.error('Import dialog error:', err);
    showScrollableModal('Import Error', err.message, 'error');
  }
}

/**
 * Show modal with import preview and selection options
 */
function showImportPreviewModal(filePath, previewData) {
  // Remove existing modal if any
  const existingModal = document.getElementById('import-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
  const models = previewData.models || [];
  const collections = previewData.collections || [];
  
  // Build model list HTML with checkboxes
  let modelListHtml = '';
  if (models.length === 0) {
    modelListHtml = '<p style="color: #aaa;">No models found in file.</p>';
  } else {
    modelListHtml = `
      <div style="margin-bottom: 15px;">
        <label style="display: flex; align-items: center; cursor: pointer; color: var(--psf-accent, #00d4ff);">
          <input type="checkbox" id="import-select-all" onchange="toggleImportSelectAll()" checked 
                 style="margin-right: 10px; width: 18px; height: 18px;">
          <strong>Select All (${models.length} models)</strong>
        </label>
      </div>
      <div style="max-height: 300px; overflow-y: auto; border: 1px solid #333; border-radius: 5px; padding: 10px;">
    `;
    
    for (const model of models) {
      const sizeStr = model.file_size ? `(${formatFileSize(model.file_size)})` : '';
      modelListHtml += `
        <label style="display: flex; align-items: center; padding: 8px; border-bottom: 1px solid #222; cursor: pointer;">
          <input type="checkbox" class="import-model-checkbox" value="${escapeHtml(model.id)}" checked
                 style="margin-right: 10px; width: 16px; height: 16px;">
          <div style="flex: 1;">
            <div style="color: #fff; font-weight: bold;">${escapeHtml(model.name || model.id)}</div>
            <div style="color: #888; font-size: 12px;">${escapeHtml(model.id)} ${sizeStr}</div>
          </div>
        </label>
      `;
    }
    modelListHtml += '</div>';
  }
  
  // Build collection selector
  let collectionOptions = '<option value="">Keep original collection</option>';
  if (window.catalogData && window.catalogData.collections) {
    for (const [colId, col] of Object.entries(window.catalogData.collections)) {
      collectionOptions += `<option value="${escapeHtml(colId)}">${escapeHtml(col.name || colId)}</option>`;
    }
  }
  
  const modalHTML = `
    <div id="import-modal" style="
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
    ">
      <div style="
        background: #1a1a2e;
        border: 2px solid var(--psf-accent, #00d4ff);
        border-radius: 10px;
        max-width: 700px;
        max-height: 85vh;
        width: 90%;
        display: flex;
        flex-direction: column;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      ">
        <div style="
          padding: 15px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          font-size: 18px;
          font-weight: bold;
          color: #fff;
        ">
          📥 Import Models
        </div>
        
        <div style="padding: 20px; overflow-y: auto; flex: 1;">
          <div style="margin-bottom: 15px; color: #aaa; font-size: 13px;">
            <strong>File:</strong> ${escapeHtml(filePath.split(/[/\\]/).pop())}
          </div>
          
          <div style="margin-bottom: 20px;">
            <label style="display: block; color: #aaa; margin-bottom: 8px;">Import into collection:</label>
            <select id="import-target-collection" style="
              width: 100%;
              padding: 10px;
              background: rgba(255,255,255,0.1);
              border: 1px solid var(--psf-border, #0f3460);
              border-radius: 5px;
              color: #fff;
              font-size: 14px;
            ">
              ${collectionOptions}
            </select>
          </div>
          
          <div style="margin-bottom: 15px;">
            <label style="display: block; color: #aaa; margin-bottom: 8px;">Select models to import:</label>
            ${modelListHtml}
          </div>
          
          <div style="margin-top: 15px;">
            <label style="display: flex; align-items: center; cursor: pointer; color: #ffaa00;">
              <input type="checkbox" id="import-overwrite" style="margin-right: 10px; width: 16px; height: 16px;">
              Overwrite existing models with same ID
            </label>
          </div>
        </div>
        
        <div style="
          padding: 15px 20px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          justify-content: flex-end;
          gap: 10px;
        ">
          <button onclick="closeImportModal()" style="
            background: #333;
            color: white;
            border: none;
            padding: 10px 25px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
          ">Cancel</button>
          <button onclick="executeImport('${escapeHtml(filePath)}')" style="
            background: var(--psf-accent, #00d4ff);
            color: #000;
            border: none;
            padding: 10px 25px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
          ">Import Selected</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  // Close on Escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      closeImportModal();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
}

/**
 * Toggle all import checkboxes
 */
function toggleImportSelectAll() {
  const selectAll = document.getElementById('import-select-all');
  const checkboxes = document.querySelectorAll('.import-model-checkbox');
  checkboxes.forEach(cb => cb.checked = selectAll.checked);
}

/**
 * Close import modal
 */
function closeImportModal() {
  const modal = document.getElementById('import-modal');
  if (modal) {
    modal.remove();
  }
}

/**
 * Execute the import operation
 */
async function executeImport(filePath) {
  // Gather selected model IDs
  const checkboxes = document.querySelectorAll('.import-model-checkbox:checked');
  const selectedIds = Array.from(checkboxes).map(cb => cb.value);
  
  if (selectedIds.length === 0) {
    alert('Please select at least one model to import.');
    return;
  }
  
  const targetCollection = document.getElementById('import-target-collection').value || null;
  const overwrite = document.getElementById('import-overwrite').checked;
  
  // Close modal and show progress
  closeImportModal();
  showScrollableModal('Importing...', `Importing ${selectedIds.length} models...`, 'info');
  
  try {
    const result = await window.electronAPI.importModelsFromFile(filePath, targetCollection, {
      selectedIds,
      overwrite
    });
    
    closeScrollableModal();
    
    if (result.success) {
      let message = result.message + '\n\n';
      
      if (result.imported && result.imported.length > 0) {
        message += `Imported (${result.imported.length}):\n`;
        result.imported.forEach(id => message += `  + ${id}\n`);
      }
      
      if (result.skipped && result.skipped.length > 0) {
        message += `\nSkipped (${result.skipped.length}):\n`;
        result.skipped.forEach(item => message += `  - ${item.id}: ${item.reason}\n`);
      }
      
      showScrollableModal('Import Complete', message, 'success');
      
      // Refresh catalog editor if on that screen
      if (document.getElementById('catalog-editor').classList.contains('active')) {
        loadCatalogEditor();
      }
    } else {
      showScrollableModal('Import Failed', result.message || 'Unknown error', 'error');
    }
  } catch (err) {
    closeScrollableModal();
    console.error('Import error:', err);
    showScrollableModal('Import Error', err.message, 'error');
  }
}

/**
 * Format file size for display
 */
function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ... [rest of catalog editor functions remain the same] ...

// ============================================================================
