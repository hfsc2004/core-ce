/**
 * Pseudo Science Fiction Core Collection - Blob Mapper UI
 * Visual blob/model integrity display for Browse Models
 * 
 * @module blob-mapper-ui
 * @version 1.1.3 - March 5, 2026
 * @license SEE LICENSE.txt
 */

// ============================================================================
// BLOB STATUS STATE
// ============================================================================

let blobStatusCache = null;
let blobStatusLoading = false;

// ============================================================================
// LOAD & REFRESH
// ============================================================================

async function loadBlobStatus() {
  if (blobStatusLoading) return;
  blobStatusLoading = true;
  
  try {
    console.log('[Blob Status] Loading blob status summary...');
    blobStatusCache = await window.electronAPI.getBlobStatusSummary();
    console.log('[Blob Status] Loaded:', blobStatusCache?.summary);
    
    // Delay to ensure DOM is fully rendered, then update cards
    setTimeout(() => updateModelCardsWithBlobStatus(), 100);
    setTimeout(() => updateModelCardsWithBlobStatus(), 500);
    setTimeout(() => updateModelCardsWithBlobStatus(), 1500);
  } catch (err) {
    console.error('[Blob Status] Failed to load:', err);
    blobStatusCache = null;
  } finally {
    blobStatusLoading = false;
  }
}

async function refreshBlobStatus() {
  blobStatusCache = null;
  await loadBlobStatus();
  updateBlobStatusPanel();
}

// ============================================================================
// MODEL CARD BLOB STATUS
// ============================================================================

function updateModelCardsWithBlobStatus() {
  if (!blobStatusCache || !blobStatusCache.models) return;
  
  const modelCards = document.querySelectorAll('.model-card');
  
  for (const card of modelCards) {
    const modelId = card.getAttribute('data-model-id');
    const filename = card.getAttribute('data-actual-filename') || card.getAttribute('data-filename');
    if (!modelId || !filename) continue;
    
    const modelName = filename.replace('.gguf', '');
    const blobInfo = findBlobStatusForModel(modelName);
    updateBlobStatusElement(card, modelId, blobInfo);
  }
}

function findBlobStatusForModel(modelName) {
  if (!blobStatusCache || !blobStatusCache.models) return null;
  
  const lowerName = modelName.toLowerCase();
  return blobStatusCache.models.find(m => {
    const mLower = m.name.toLowerCase();
    return mLower === lowerName || 
           mLower === `${lowerName}:latest` ||
           mLower.startsWith(lowerName + ':');
  });
}

function updateBlobStatusElement(card, modelId, blobInfo) {
  let container = card.querySelector('.blob-status-container');
  
  if (!container) {
    container = document.createElement('div');
    container.className = 'blob-status-container';
    container.style.cssText = 'margin: 10px 0; padding: 8px; border-radius: 6px; font-size: 12px;';
    
    const insertPoint = card.querySelector(`[id^="download-progress-"]`) || 
                        card.querySelector(`[id^="download-btn-"]`);
    if (insertPoint) {
      insertPoint.parentNode.insertBefore(container, insertPoint);
    } else {
      card.appendChild(container);
    }
  }
  
  if (!blobInfo) {
    container.innerHTML = `
      <div style="color: #888; display: flex; align-items: center; gap: 6px;">
        <span style="font-size: 14px;">📋</span>
        <span>Not loaded in Ollama</span>
      </div>`;
    container.style.background = 'rgba(128, 128, 128, 0.1)';
    container.style.border = '1px solid rgba(128, 128, 128, 0.3)';
  } else if (blobInfo.isComplete) {
    container.innerHTML = `
      <div style="color: #00ff88; display: flex; align-items: center; gap: 6px;">
        <span style="font-size: 14px;">${blobInfo.statusIcon}</span>
        <span>Ollama Ready</span>
        <span style="color: #888; margin-left: auto;">${blobInfo.blobCount} • ${blobInfo.sizeDisplay}</span>
      </div>
      <div style="margin-top: 4px;">
        <button onclick="showBlobDetails('${blobInfo.name}')" 
                style="background: none; border: none; color: var(--psf-accent, #00d4ff); cursor: pointer; font-size: 11px; padding: 0;">
          View blob details →
        </button>
      </div>`;
    container.style.background = 'rgba(0, 255, 136, 0.1)';
    container.style.border = '1px solid rgba(0, 255, 136, 0.3)';
  } else if (blobInfo.hasMissing) {
    const missingCount = blobInfo.missingDetails?.length || 0;
    container.innerHTML = `
      <div style="color: #ffaa00; display: flex; align-items: center; gap: 6px;">
        <span style="font-size: 14px;">${blobInfo.statusIcon}</span>
        <span>Missing ${missingCount} blob${missingCount !== 1 ? 's' : ''}</span>
        <span style="color: #888; margin-left: auto;">${blobInfo.blobCount}</span>
      </div>
      <div style="margin-top: 4px;">
        <button onclick="showBlobDetails('${blobInfo.name}')" 
                style="background: none; border: none; color: #ff6b6b; cursor: pointer; font-size: 11px; padding: 0;">
          View missing blobs →
        </button>
      </div>`;
    container.style.background = 'rgba(255, 170, 0, 0.1)';
    container.style.border = '1px solid rgba(255, 170, 0, 0.3)';
  } else {
    container.innerHTML = `
      <div style="color: #ff6b6b; display: flex; align-items: center; gap: 6px;">
        <span style="font-size: 14px;">${blobInfo.statusIcon || '?'}</span>
        <span>${blobInfo.status || 'Unknown status'}</span>
      </div>`;
    container.style.background = 'rgba(255, 107, 107, 0.1)';
    container.style.border = '1px solid rgba(255, 107, 107, 0.3)';
  }
}

// ============================================================================
// BLOB STATUS PANEL (for Browse Models header)
// ============================================================================

function buildBlobStatusPanel() {
  if (!blobStatusCache) {
    return `
      <div id="blob-status-panel" style="background: rgba(128,128,128,0.1); border: 1px solid #333; border-radius: 8px; padding: 12px; margin-bottom: 20px;">
        <div style="color: #888; text-align: center;">
          <span class="spinner" style="display: inline-block; margin-right: 8px;"></span>
          Loading blob status...
        </div>
      </div>`;
  }
  
  const s = blobStatusCache.summary;
  
  return `
    <div id="blob-status-panel" style="background: rgba(0,212,255,0.05); border: 1px solid var(--psf-border, #0f3460); border-radius: 8px; padding: 15px; margin-bottom: 20px;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
        <h4 style="color: var(--psf-accent, #00d4ff); margin: 0;">ðŸ—„ï¸ Ollama Blob Storage</h4>
        <button onclick="refreshBlobStatus()" 
                style="background: var(--psf-accent-medium, rgba(0,212,255,0.2)); border: 1px solid var(--psf-accent, #00d4ff); color: var(--psf-accent, #00d4ff); padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 11px;">
          â†» Refresh
        </button>
      </div>
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; text-align: center;">
        <div>
          <div style="color: #00ff88; font-size: 24px; font-weight: bold;">${s.completeModels}</div>
          <div style="color: #888; font-size: 11px;">✓ Ready</div>
        </div>
        <div>
          <div style="color: #ffaa00; font-size: 24px; font-weight: bold;">${s.partialModels}</div>
          <div style="color: #888; font-size: 11px;">⚠ Partial</div>
        </div>
        <div>
          <div style="color: #ff6b6b; font-size: 24px; font-weight: bold;">${s.missingModels}</div>
          <div style="color: #888; font-size: 11px;">âœ— Missing</div>
        </div>
        <div>
          <div style="color: #888; font-size: 24px; font-weight: bold;">${s.orphanBlobs || 0}</div>
          <div style="color: #888; font-size: 11px;">🗑️ Orphans</div>
        </div>
      </div>
      ${s.orphanBlobs > 0 ? `
        <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #333;">
          <button onclick="showOrphanBlobs()" 
                  style="background: rgba(255,107,107,0.2); border: 1px solid #ff6b6b; color: #ff6b6b; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">
            View ${s.orphanBlobs} orphan blob${s.orphanBlobs !== 1 ? 's' : ''} (${blobStatusCache.orphanSize})
          </button>
        </div>` : ''}
    </div>`;
}

function updateBlobStatusPanel() {
  const panel = document.getElementById('blob-status-panel');
  if (panel) panel.outerHTML = buildBlobStatusPanel();
}

// ============================================================================
// DETAIL MODALS
// ============================================================================

async function showBlobDetails(modelName) {
  try {
    const integrity = await window.electronAPI.checkModelBlobIntegrity(modelName);
    
    if (!integrity.found) {
      alert(`Model "${modelName}" not found in Ollama manifests.`);
      return;
    }
    
    let html = `
      <div style="max-height: 400px; overflow-y: auto;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
          <div style="background: var(--psf-accent-light, rgba(0,212,255,0.1)); padding: 10px; border-radius: 6px;">
            <div style="color: #888; font-size: 11px;">STATUS</div>
            <div style="color: ${integrity.complete ? '#00ff88' : '#ffaa00'}; font-size: 18px; font-weight: bold;">
              ${integrity.complete ? '✓ Complete' : '⚠ Incomplete'}
            </div>
          </div>
          <div style="background: var(--psf-accent-light, rgba(0,212,255,0.1)); padding: 10px; border-radius: 6px;">
            <div style="color: #888; font-size: 11px;">BLOBS</div>
            <div style="color: var(--psf-accent, #00d4ff); font-size: 18px; font-weight: bold;">
              ${integrity.presentBlobs}/${integrity.totalBlobs}
            </div>
          </div>
        </div>`;
    
    if (integrity.missingBlobs > 0 && integrity.missing) {
      html += `
        <div style="margin-bottom: 15px;">
          <h4 style="color: #ff6b6b; margin-bottom: 8px;">❌ Missing Blobs (${integrity.missingBlobs})</h4>
          <div style="background: rgba(255,107,107,0.1); padding: 10px; border-radius: 6px; font-family: monospace; font-size: 11px;">`;
      
      for (const digest of integrity.missing) {
        const blobFilename = digest.replace('sha256:', 'sha256-');
        html += `<div style="margin-bottom: 4px; color: #ff6b6b; word-break: break-all;">• ${blobFilename}</div>`;
      }
      html += `</div></div>`;
    }
    
    // Show PRESENT blobs with their SHA256
    if (integrity.presentBlobs > 0 && integrity.present) {
      html += `
        <div style="margin-bottom: 15px;">
          <h4 style="color: #00ff88; margin-bottom: 8px;">✓ Present Blobs (${integrity.presentBlobs})</h4>
          <div style="background: rgba(0,255,136,0.1); padding: 10px; border-radius: 6px; font-family: monospace; font-size: 11px;">`;
      
      for (const blob of integrity.present) {
        const digest = typeof blob === 'string' ? blob : blob.digest;
        const size = typeof blob === 'object' && blob.size ? ` (${formatBlobBytes(blob.size)})` : '';
        const blobFilename = digest.replace('sha256:', 'sha256-');
        html += `
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:4px; padding:4px 6px; border-radius:4px; background:rgba(0,0,0,0.2);">
            <span style="color:#00ff88; word-break:break-all;">• ${blobFilename}${size}</span>
            <button onclick="deleteBlobFromMap('${digest}', '${String(modelName).replace(/'/g, "\\'")}')"
                    title="Delete blob file"
                    style="background: rgba(255,107,107,0.15); border: 1px solid #ff6b6b; color: #ff6b6b; border-radius:4px; cursor:pointer; padding:2px 6px; font-size:11px;">
              🗑️
            </button>
          </div>`;
      }
      html += `</div></div>`;
    }
    
    html += `
      <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 6px;">
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #888;">Present on disk:</span>
          <span style="color: #00ff88;">${formatBlobBytes(integrity.presentSize)}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #888;">Expected total:</span>
          <span style="color: var(--psf-accent, #00d4ff);">${formatBlobBytes(integrity.totalSize)}</span>
        </div>
      </div>
    </div>`;
    
    showScrollableModalHtml(`Blob Details: ${modelName}`, html, 'info');
  } catch (err) {
    console.error('[Blob Details] Error:', err);
    alert(`Error loading blob details: ${err.message}`);
  }
}

async function showOrphanBlobs() {
  try {
    const orphans = await window.electronAPI.getOrphanBlobs();
    
    if (orphans.length === 0) {
      alert('No orphan blobs found!');
      return;
    }
    
    let html = `
      <div style="max-height: 400px; overflow-y: auto;">
        <p style="color: #888; margin-bottom: 15px;">
          These blobs are not referenced by any model manifest and may be safe to delete:
        </p>
        <div style="font-family: monospace; font-size: 11px;">`;
    
    let totalSize = 0;
    for (const orphan of orphans) {
      const blobFilename = orphan.digest.replace('sha256:', 'sha256-');
      totalSize += orphan.size || 0;
      html += `
        <div style="display: flex; justify-content: space-between; padding: 6px; background: rgba(255,255,255,0.05); margin-bottom: 4px; border-radius: 4px;">
          <span style="color: #ff6b6b; word-break: break-all; flex: 1;">${blobFilename}</span>
          <span style="color: #888; white-space: nowrap; margin-left: 10px;">${formatBlobBytes(orphan.size)}</span>
          <button onclick="deleteBlobFromMap('${orphan.digest}', '')"
                  title="Delete orphan blob file"
                  style="background: rgba(255,107,107,0.15); border: 1px solid #ff6b6b; color: #ff6b6b; border-radius:4px; cursor:pointer; padding:2px 6px; font-size:11px; margin-left:8px;">
            🗑️
          </button>
        </div>`;
    }
    
    html += `
        </div>
        <div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid #333; text-align: right;">
          <strong style="color: #ff6b6b;">Total: ${formatBlobBytes(totalSize)}</strong>
        </div>
      </div>`;
    
    showScrollableModalHtml(`Orphan Blobs (${orphans.length})`, html, 'warning');
  } catch (err) {
    console.error('[Orphan Blobs] Error:', err);
    alert(`Error loading orphan blobs: ${err.message}`);
  }
}

// ============================================================================
// UTILITY
// ============================================================================

function formatBlobBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function deleteBlobFromMap(digest, modelName = '') {
  if (!window.electronAPI?.deleteBlobByDigest) {
    alert('Blob delete API is not available in this build.');
    return;
  }
  const normalizedDigest = String(digest || '').trim();
  if (!normalizedDigest) return;

  let safety = null;
  if (window.electronAPI?.checkBlobDeleteSafety) {
    try {
      safety = await window.electronAPI.checkBlobDeleteSafety(normalizedDigest, String(modelName || '').trim());
    } catch (_) {}
  }

  let proceed = false;
  if (safety && safety.canDelete === false) {
    proceed = window.confirm(
      `This blob is shared by ${safety.userCount || 0} other model(s).\n\nDelete anyway?`
    );
  } else {
    proceed = window.confirm(`Delete blob ${normalizedDigest.replace('sha256:', 'sha256-')}?`);
  }
  if (!proceed) return;

  const result = await window.electronAPI.deleteBlobByDigest(normalizedDigest, {
    force: !!(safety && safety.canDelete === false),
    excludeModel: String(modelName || '').trim() || null
  });
  if (!result || result.success === false) {
    alert(`Delete failed: ${result?.message || 'unknown error'}`);
    return;
  }

  await refreshBlobStatus();
  const name = String(modelName || '').trim();
  if (name) {
    await showBlobDetails(name);
  } else {
    await showOrphanBlobs();
  }
}
