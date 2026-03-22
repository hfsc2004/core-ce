/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
/**
 * Group Manager extracted group + catalog action handlers.
 */

function showAddCollectionForm() {
  const formHTML = `
    <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 1000;" onclick="closeAddCollectionForm(event)">
      <div style="background: #1a1a2e; border: 2px solid var(--psf-border, #0f3460); border-radius: 15px; padding: 30px; max-width: 700px; width: 90%; max-height: 90vh; overflow-y: auto;" onclick="event.stopPropagation()">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 style="color: var(--psf-accent, #00d4ff); margin: 0;">Add New Group</h2>
          <button onclick="closeAddCollectionForm()" style="background: transparent; border: none; color: #fff; font-size: 24px; cursor: pointer;">&times;</button>
        </div>
        
        <form id="add-collection-form" onsubmit="submitAddCollection(event)">
          <div style="display: grid; gap: 15px;">
            <div>
              <label style="color: #aaa; display: block; margin-bottom: 5px;">Group ID * (lowercase, hyphens only)</label>
              <input type="text" id="collection-id" required pattern="[a-z0-9-]+" placeholder="new-collection-1tb" style="width: 100%; padding: 10px; background: rgba(255,255,255,0.1); border: 1px solid var(--psf-border, #0f3460); border-radius: 5px; color: #fff;">
              <p style="color: #666; font-size: 12px; margin-top: 5px;">Note: ID cannot be changed after creation</p>
            </div>
            
            <div>
              <label style="color: #aaa; display: block; margin-bottom: 5px;">Group Name *</label>
              <input type="text" id="collection-name" required placeholder="AI Researcher's Toolkit" style="width: 100%; padding: 10px; background: rgba(255,255,255,0.1); border: 1px solid var(--psf-border, #0f3460); border-radius: 5px; color: #fff;">
            </div>
            
            <div>
              <label style="color: #aaa; display: block; margin-bottom: 5px;">Drive Size *</label>
              <select id="collection-drive-size" required style="width: 100%; padding: 10px; background: rgba(255,255,255,0.1); border: 1px solid var(--psf-border, #0f3460); border-radius: 5px; color: #fff;">
                <option value="">Select drive size...</option>
                <option value="128GB">128GB</option>
                <option value="256GB">256GB</option>
                <option value="512GB">512GB</option>
                <option value="1TB">1TB</option>
                <option value="2TB">2TB</option>
                <option value="4TB">4TB</option>
              </select>
            </div>
            
            <div>
              <label style="color: #aaa; display: block; margin-bottom: 5px;">Total Size (GB)</label>
              <input type="number" id="collection-total-size" placeholder="50" min="0" style="width: 100%; padding: 10px; background: rgba(255,255,255,0.1); border: 1px solid var(--psf-border, #0f3460); border-radius: 5px; color: #fff;">
              <p style="color: #666; font-size: 12px; margin-top: 5px;">Estimated total size of all models in this group</p>
            </div>
            
            <div>
              <label style="color: #aaa; display: block; margin-bottom: 5px;">Description *</label>
              <textarea id="collection-description" required rows="3" placeholder="Group description..." style="width: 100%; padding: 10px; background: rgba(255,255,255,0.1); border: 1px solid var(--psf-border, #0f3460); border-radius: 5px; color: #fff; font-family: inherit;"></textarea>
            </div>
            
            <div style="background: rgba(255,212,0,0.1); border: 2px solid #ffd400; border-radius: 10px; padding: 15px;">
              <h4 style="color: #ffd400; margin: 0 0 10px 0;">⚠️ SKU Assignment</h4>
              <p style="color: #aaa; font-size: 14px; margin: 0;">
                After creating this group, update <code>models/sku-manifest.json</code> to assign it to specific SKUs.
              </p>
            </div>
          </div>
          
          <div style="display: flex; gap: 10px; margin-top: 25px;">
            <button type="submit" class="btn-primary" style="flex: 1;">Create Group</button>
            <button type="button" onclick="closeAddCollectionForm()" class="btn-secondary" style="flex: 1;">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', formHTML);
}

function closeAddCollectionForm(event) {
  if (event && event.target !== event.currentTarget) return;
  const modal = document.querySelector('[style*="position: fixed"]');
  if (modal) modal.remove();
}

async function submitAddCollection(event) {
  event.preventDefault();
  
  const collectionId = document.getElementById('collection-id').value.trim();
  const totalSize = document.getElementById('collection-total-size').value;
  
  const collectionData = {
    name: document.getElementById('collection-name').value.trim(),
    drive_size: document.getElementById('collection-drive-size').value,
    total_size_gb: totalSize ? parseInt(totalSize) : 0,
    description: document.getElementById('collection-description').value.trim()
  };
  
  const result = await window.electronAPI.addCollection(collectionId, collectionData);
  
  if (result.success) {
    alert(`✅ Group "${collectionData.name}" created successfully!\n\nNote: Remember to update models/sku-manifest.json to assign this group to SKU groups.`);
    closeAddCollectionForm();
    loadPackageManager(); // Reload
  } else {
    alert(`❌ Failed to create group:\n${result.message}`);
  }
}

async function editCollection(collectionKey) {
  // Get the current collection data
  const catalog = window.catalogData;
  const collection = catalog.collections[collectionKey];
  
  if (!collection) {
    alert('Group not found');
    return;
  }
  
  const formHTML = `
    <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 1000;" onclick="closeEditCollectionForm(event)">
      <div style="background: #1a1a2e; border: 2px solid var(--psf-border, #0f3460); border-radius: 15px; padding: 30px; max-width: 700px; width: 90%; max-height: 90vh; overflow-y: auto;" onclick="event.stopPropagation()">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 style="color: var(--psf-accent, #00d4ff); margin: 0;">Edit Group: ${collection.name}</h2>
          <button onclick="closeEditCollectionForm()" style="background: transparent; border: none; color: #fff; font-size: 24px; cursor: pointer;">&times;</button>
        </div>
        
        <form id="edit-collection-form" onsubmit="submitEditCollection(event, '${collectionKey}')">
          <div style="display: grid; gap: 15px;">
            <div>
              <label style="color: #aaa; display: block; margin-bottom: 5px;">Group ID</label>
              <input type="text" value="${collectionKey}" readonly style="width: 100%; padding: 10px; background: rgba(255,255,255,0.05); border: 1px solid var(--psf-border, #0f3460); border-radius: 5px; color: #888;">
              <p style="color: #666; font-size: 12px; margin-top: 5px;">Group ID cannot be changed</p>
            </div>
            
            <div>
              <label style="color: #aaa; display: block; margin-bottom: 5px;">Group Name *</label>
              <input type="text" id="edit-collection-name" required value="${collection.name}" style="width: 100%; padding: 10px; background: rgba(255,255,255,0.1); border: 1px solid var(--psf-border, #0f3460); border-radius: 5px; color: #fff;">
            </div>
            
            <div>
              <label style="color: #aaa; display: block; margin-bottom: 5px;">Drive Size *</label>
              <select id="edit-collection-drive-size" required style="width: 100%; padding: 10px; background: rgba(255,255,255,0.1); border: 1px solid var(--psf-border, #0f3460); border-radius: 5px; color: #fff;">
                <option value="128GB" ${collection.drive_size === '128GB' ? 'selected' : ''}>128GB</option>
                <option value="256GB" ${collection.drive_size === '256GB' ? 'selected' : ''}>256GB</option>
                <option value="512GB" ${collection.drive_size === '512GB' ? 'selected' : ''}>512GB</option>
                <option value="1TB" ${collection.drive_size === '1TB' ? 'selected' : ''}>1TB</option>
                <option value="2TB" ${collection.drive_size === '2TB' ? 'selected' : ''}>2TB</option>
                <option value="4TB" ${collection.drive_size === '4TB' ? 'selected' : ''}>4TB</option>
              </select>
            </div>
            
            <div>
              <label style="color: #aaa; display: block; margin-bottom: 5px;">Total Size (GB)</label>
              <input type="number" id="edit-collection-total-size" value="${collection.total_size_gb || 0}" min="0" style="width: 100%; padding: 10px; background: rgba(255,255,255,0.1); border: 1px solid var(--psf-border, #0f3460); border-radius: 5px; color: #fff;">
            </div>
            
            <div>
              <label style="color: #aaa; display: block; margin-bottom: 5px;">Description *</label>
              <textarea id="edit-collection-description" required rows="3" style="width: 100%; padding: 10px; background: rgba(255,255,255,0.1); border: 1px solid var(--psf-border, #0f3460); border-radius: 5px; color: #fff; font-family: inherit;">${collection.description || ''}</textarea>
            </div>
            
            <div style="background: var(--psf-accent-light, rgba(0,212,255,0.1)); border: 2px solid var(--psf-accent, #00d4ff); border-radius: 10px; padding: 15px;">
              <h4 style="color: var(--psf-accent, #00d4ff); margin: 0 0 10px 0;">📊 Group Info</h4>
              <p style="color: #aaa; font-size: 14px; margin: 0;">
                This group currently contains <strong style="color: var(--psf-accent, #00d4ff);">${collection.models?.length || 0} models</strong>.
              </p>
            </div>
          </div>
          
          <div style="display: flex; gap: 10px; margin-top: 25px;">
            <button type="submit" class="btn-primary" style="flex: 1;">Save Changes</button>
            <button type="button" onclick="closeEditCollectionForm()" class="btn-secondary" style="flex: 1;">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', formHTML);
}

function closeEditCollectionForm(event) {
  if (event && event.target !== event.currentTarget) return;
  const modal = document.querySelector('[style*="position: fixed"]');
  if (modal) modal.remove();
}

async function submitEditCollection(event, collectionKey) {
  event.preventDefault();
  
  const totalSize = document.getElementById('edit-collection-total-size').value;
  
  const updatedCollectionData = {
    name: document.getElementById('edit-collection-name').value.trim(),
    drive_size: document.getElementById('edit-collection-drive-size').value,
    total_size_gb: totalSize ? parseInt(totalSize) : 0,
    description: document.getElementById('edit-collection-description').value.trim()
  };
  
  const result = await window.electronAPI.editCollection(collectionKey, updatedCollectionData);
  
  if (result.success) {
    alert(`✅ Group "${updatedCollectionData.name}" updated successfully!`);
    closeEditCollectionForm();
    loadPackageManager(); // Reload
  } else {
    alert(`❌ Failed to update group:\n${result.message}`);
  }
}

async function deleteCollection(collectionKey) {
  // Get collection info for confirmation
  const catalog = window.catalogData;
  const collection = catalog.collections[collectionKey];
  
  if (!collection) {
    alert('Group not found');
    return;
  }
  
  const modelCount = collection.models?.length || 0;
  let confirmMessage = `Are you sure you want to delete group "${collection.name}"?\n\n`;
  confirmMessage += `Group ID: ${collectionKey}\n`;
  
  if (modelCount > 0) {
    confirmMessage += `⚠️ WARNING: This group contains ${modelCount} model(s) that will also be removed!\n\n`;
  }
  
  confirmMessage += `This action cannot be undone!`;
  
  if (!confirm(confirmMessage)) {
    return;
  }
  
  const result = await window.electronAPI.deleteCollection(collectionKey);
  
  if (result.success) {
    let message = `✅ Group "${collection.name}" deleted successfully!`;
    if (result.modelsRemoved > 0) {
      message += `\n\n${result.modelsRemoved} model(s) were removed.`;
    }
    alert(message);
    loadPackageManager(); // Reload
  } else {
    alert(`❌ Failed to delete group:\n${result.message}`);
  }
}

async function deleteModelFromCatalogPM(modelId, collectionKey) {
  if (!confirm(`Are you sure you want to delete model "${modelId}"?\n\nThis will remove it from the master catalog.`)) {
    return;
  }
  
  const result = await window.electronAPI.deleteModelFromCatalog(collectionKey, modelId);
  
  if (result.success) {
    alert(`✅ Model "${modelId}" deleted successfully!`);
    loadCatalogEditor(); // Reload the editor
  } else {
    alert(`❌ Failed to delete model:\n${result.message}`);
  }
}

async function verifyModelChecksum(modelId, collectionKey, filename, expectedSHA256) {
  const verifyBtn = document.getElementById(`verify-btn-${modelId}`);
  const resultDiv = document.getElementById(`verify-result-${modelId}`);
  
  if (!verifyBtn || !resultDiv) {
    alert('UI elements not found');
    return;
  }
  
  // Show loading state
  verifyBtn.disabled = true;
  verifyBtn.textContent = '⏳ Verifying...';
  resultDiv.style.display = 'block';
  resultDiv.style.background = 'var(--psf-accent-medium, rgba(0,212,255,0.2))';
  resultDiv.style.color = 'var(--psf-accent, #00d4ff)';
  resultDiv.textContent = '🔍 Calculating SHA256 checksum...';
  
  try {
    const filepath = `models/${collectionKey}/${filename}`;
    const result = await window.electronAPI.verifyModelChecksum(filepath, expectedSHA256);
    
    if (result.valid) {
      // Success - checksum matches
      resultDiv.style.background = 'rgba(0,255,136,0.2)';
      resultDiv.style.color = '#00ff88';
      resultDiv.innerHTML = `✅ <strong>Checksum Valid!</strong><br><small>SHA256: ${result.actualHash.substring(0, 16)}...</small>`;
    } else {
      // Mismatch - file corrupted
      resultDiv.style.background = 'rgba(255,107,107,0.2)';
      resultDiv.style.color = '#ff6b6b';
      resultDiv.innerHTML = `
        ❌ <strong>Checksum Mismatch!</strong><br>
        <small>Expected: ${result.expectedHash.substring(0, 16)}...</small><br>
        <small>Actual: ${result.actualHash.substring(0, 16)}...</small><br>
        <small style="color: #ff8888;">File may be corrupted. Consider re-downloading.</small>
      `;
    }
    
    // Reset button
    verifyBtn.disabled = false;
    verifyBtn.textContent = '🔍 Verify Checksum';
    
    // Hide result after 10 seconds
    setTimeout(() => {
      resultDiv.style.display = 'none';
    }, 10000);
    
  } catch (err) {
    console.error('Verification error:', err);
    resultDiv.style.background = 'rgba(255,107,107,0.2)';
    resultDiv.style.color = '#ff6b6b';
    resultDiv.textContent = `❌ Verification failed: ${err.message}`;
    
    verifyBtn.disabled = false;
    verifyBtn.textContent = '🔍 Verify Checksum';
  }
}

// ============================================================================
// APPLY CATALOG CHANGES
// ============================================================================

/**
 * Apply catalog changes - builds all SKU catalogs from master catalog
 */
async function applyCatalogChanges() {
  const skuManifest = window.skuManifest || null;
  const skuIds = skuManifest && skuManifest.skus
    ? Object.entries(skuManifest.skus)
        .filter(([, sku]) => sku && sku.active !== false)
        .map(([skuId]) => skuId)
    : ['sku-001', 'sku-002', 'sku-003', 'sku-004', 'sku-005'];
  const skuCatalogLines = skuIds.map((skuId) => `  • catalog-${skuId}.json`).join('\n');

  // Show confirmation dialog
  const confirmed = confirm(
    '✅ Apply Catalog Changes?\n\n' +
    'This will regenerate all SKU catalog files:\n' +
    `${skuCatalogLines}\n\n` +
    'The files will be built from the current master catalog.\n\n' +
    'Continue?'
  );
  
  if (!confirmed) {
    return;
  }
  
  try {
    // Show loading state
    const btn = document.querySelector('button[onclick="applyCatalogChanges()"]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Building...';
    }
    
    const result = await window.electronAPI.buildSKUCatalogs();
    
    if (result.success) {
      alert(
        '✅ SKU Catalogs Built Successfully!\n\n' +
        `Built ${result.catalogsBuilt || skuIds.length} catalog files.\n\n` +
        (result.details ? result.details : '')
      );
    } else {
      alert(`❌ Failed to build SKU catalogs:\n\n${result.message || 'Unknown error'}`);
    }
    
    // Restore button
    if (btn) {
      btn.disabled = false;
      btn.textContent = '✅ Apply Changes';
    }
    
  } catch (err) {
    console.error('Apply catalog changes error:', err);
    alert(`❌ Error building SKU catalogs:\n\n${err.message}`);
    
    // Restore button on error
    const btn = document.querySelector('button[onclick="applyCatalogChanges()"]');
    if (btn) {
      btn.disabled = false;
      btn.textContent = '✅ Apply Changes';
    }
  }
}
