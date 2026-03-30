/**
 * Model ordering actions (save/launch/download/delete/verify).
 * @module model-ordering-actions
 * @version 1.1.3 - March 5, 2026
 */

function moEscapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function moShowCopyableErrorDialog(title, message) {
  const existing = document.getElementById('mo-model-action-error-modal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'mo-model-action-error-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:99999;';
  const safeTitle = moEscapeHtml(title || 'Error');
  const safeMessage = moEscapeHtml(message || 'Unknown error');
  modal.innerHTML = `
    <div style="width:min(760px,92vw);max-height:80vh;overflow:auto;background:#121826;border:1px solid #2b3650;border-radius:10px;padding:14px;">
      <div style="font-weight:700;color:#ff6b6b;margin-bottom:8px;">${safeTitle}</div>
      <pre style="white-space:pre-wrap;word-break:break-word;background:#0b1220;border:1px solid #24324d;color:#dbe7ff;padding:10px;border-radius:8px;font-size:12px;">${safeMessage}</pre>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;">
        <button id="mo-model-action-error-copy" style="padding:8px 12px;border-radius:8px;border:1px solid #345ea8;background:#173a73;color:#fff;cursor:pointer;">Copy</button>
        <button id="mo-model-action-error-close" style="padding:8px 12px;border-radius:8px;border:1px solid #3a3a3a;background:#1c1c1c;color:#ddd;cursor:pointer;">Close</button>
      </div>
    </div>
  `;
  modal.addEventListener('click', (event) => {
    if (event.target === modal) modal.remove();
  });
  document.body.appendChild(modal);
  const closeBtn = document.getElementById('mo-model-action-error-close');
  const copyBtn = document.getElementById('mo-model-action-error-copy');
  if (closeBtn) closeBtn.addEventListener('click', () => modal.remove());
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(String(message || ''));
        copyBtn.textContent = 'Copied';
      } catch (_err) {
        copyBtn.textContent = 'Copy failed';
      }
      setTimeout(() => { if (copyBtn) copyBtn.textContent = 'Copy'; }, 1200);
    });
  }
}

async function saveModelOrdering() {
  try {
    const { orderingData, groups } = window.modelOrderingState;
    
    // Update groups in ordering data
    orderingData.groups = groups;
    orderingData.lastModified = new Date().toISOString();
    
    const result = await window.electronAPI.saveModelOrdering(orderingData);
    
    if (result.success) {
      alert('✅ Model ordering saved successfully!');
    } else {
      alert(`❌ Failed to save: ${result.message}`);
    }
  } catch (err) {
    console.error('[Model Ordering] Save failed:', err);
    alert(`❌ Error saving: ${err.message}`);
  }
}

async function checkAllDownloadStatus() {
  const { catalog } = window.modelOrderingState;
  window.modelOrderingState.downloadStatus = {};
  
  console.log('[Model Ordering] Checking model status (filesystem-based)...');
  
  // Build list of models to check
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
  
  if (modelsToCheck.length === 0) {
    console.log('[Model Ordering] No models to check');
    return;
  }
  
  try {
    // Batch check all models at once (efficient single IPC call)
    const results = await window.electronAPI.checkAllModelFiles(modelsToCheck);
    
    // Store results in state
    for (const [modelId, status] of Object.entries(results)) {
      window.modelOrderingState.downloadStatus[modelId] = {
        downloaded: status.downloaded,
        wrapped: status.wrapped,
        modelName: status.modelName
      };
    }
    
    const downloadedCount = Object.values(window.modelOrderingState.downloadStatus)
      .filter(s => s.downloaded).length;
    const wrappedCount = Object.values(window.modelOrderingState.downloadStatus)
      .filter(s => s.wrapped).length;
    
    console.log(`[Model Ordering] Status check complete: ${downloadedCount} downloaded, ${wrappedCount} wrapped`);
    
  } catch (err) {
    console.error('[Model Ordering] Failed to check model status:', err);
    
    // Fallback: mark all as unknown
    for (const model of modelsToCheck) {
      window.modelOrderingState.downloadStatus[model.id] = {
        downloaded: false,
        wrapped: false,
        modelName: model.filename.replace(/\.gguf$/i, '')
      };
    }
  }
}

async function refreshDownloadStatus() {
  await checkAllDownloadStatus();
  renderModelOrdering();
}

async function launchModelFromOrdering(collectionKey, filename, projectorFilename, modelId) {
  console.log(`[Model Ordering] Launching model: ${modelId}`);
  
  // Check if this is a split file pattern and convert to merged filename
  const SPLIT_FILE_PATTERN = /-(\d{5})-of-(\d{5})\.gguf$/i;
  let actualFilename = filename;
  if (SPLIT_FILE_PATTERN.test(filename)) {
    actualFilename = filename.replace(SPLIT_FILE_PATTERN, '.gguf');
    console.log(`[Model Ordering] Split file detected: ${filename} → ${actualFilename}`);
  }
  
  const modelPath = `models/${collectionKey}/${actualFilename}`;
  const projectorPath = projectorFilename ? `models/${collectionKey}/${projectorFilename}` : null;
  
  // Look up force_cpu from catalog if available
  let forceCpu = false;
  const catalog = window.modelOrderingState.catalog;
  if (catalog?.collections?.[collectionKey]) {
    const model = catalog.collections[collectionKey].models?.find(m => m.id === modelId);
    if (model?.force_cpu) {
      forceCpu = true;
      console.log(`[Model Ordering] Force CPU mode enabled for ${modelId}`);
    }
  }
  
  // Get moe-prefixed progress elements
  const progressDiv = document.getElementById(`moe-progress-${modelId}`);
  const progressBar = document.getElementById(`moe-progress-bar-${modelId}`);
  const progressText = document.getElementById(`moe-progress-text-${modelId}`);
  
  // Show progress
  if (progressDiv) {
    progressDiv.style.display = 'block';
    if (progressBar) progressBar.style.width = '5%';
    if (progressText) progressText.textContent = 'Preparing to launch...';
  }
  
  // Set up blob upload progress listener
  const blobProgressHandler = (data) => {
    if (data.modelId === modelId && progressBar && progressText && progressDiv) {
      progressDiv.style.display = 'block';
      
      if (data.stage === 'calculating') {
        progressBar.style.width = '10%';
        progressText.textContent = data.message || 'Calculating digest...';
      } else if (data.stage === 'uploading' && data.progress) {
        progressBar.style.width = `${data.progress}%`;
        
        const uploadedMB = (data.uploadedBytes / 1024 / 1024).toFixed(1);
        const totalMB = (data.totalBytes / 1024 / 1024).toFixed(1);
        const speedMBps = (data.speed / 1024 / 1024).toFixed(2);
        
        progressText.textContent = `Uploading ${data.fileName}: ${data.progress}% • ${uploadedMB}/${totalMB} MB • ${speedMBps} MB/s`;
        
        if (data.complete) {
          progressText.textContent = `✅ ${data.fileName} uploaded successfully!`;
        }
      } else if (data.stage === 'creating') {
        progressBar.style.width = '95%';
        progressText.textContent = data.message || 'Creating model...';
      }
    }
  };
  
  const removeListener = window.electronAPI.onBlobUploadProgress(blobProgressHandler);
  
  try {
    // Launch model in Ollama
    const result = await window.electronAPI.launchModelInOllama(modelPath, projectorPath, modelId, forceCpu);
    
    if (result.success) {
      const modelName = result.modelName || actualFilename.replace('.gguf', '');
      
      // Open terminal
      const terminalResult = await window.electronAPI.openOllamaTerminal(modelName, 0, result.port, collectionKey, modelId);
      
      // Hide progress after success
      if (progressDiv) {
        setTimeout(() => {
          progressDiv.style.display = 'none';
        }, 2000);
      }
      
      if (terminalResult.success) {
        console.log(`[Model Ordering] Terminal launched: window ${terminalResult.windowId} on port ${terminalResult.port}`);
        
        // Update wrap status
        window.modelOrderingState.downloadStatus[modelId] = {
          ...window.modelOrderingState.downloadStatus[modelId],
          wrapped: true,
          modelName: modelName
        };
        renderModelOrdering();
      } else {
        moShowCopyableErrorDialog(
          `Model loaded in Ollama: ${modelName}`,
          terminalResult.message || `Please open a terminal and run:\nollama run ${modelName}`
        );
      }
    } else {
      // Hide progress on error
      if (progressDiv) progressDiv.style.display = 'none';
      moShowCopyableErrorDialog('Failed to launch in Ollama', result.message || 'Unknown launch failure.');
    }
  } catch (err) {
    console.error('[Model Ordering] Launch failed:', err);
    if (progressDiv) progressDiv.style.display = 'none';
    moShowCopyableErrorDialog('Error launching model', err.message || String(err));
  } finally {
    if (removeListener && typeof removeListener === 'function') {
      removeListener();
    }
  }
}

/**
 * Toggle edit/reorder mode
 */
function toggleEditMode() {
  window.modelOrderingState.editMode = !window.modelOrderingState.editMode;
  
  // Clear selection when exiting edit mode
  if (!window.modelOrderingState.editMode) {
    window.modelOrderingState.selectedModels.clear();
  }
  
  console.log(`[Model Ordering] Edit mode: ${window.modelOrderingState.editMode ? 'ON' : 'OFF'}`);
  renderModelOrdering();
}

/**
 * Open model configuration from ordering screen
 */
function openModelConfigFromOrdering(modelId, collectionKey, filename, ollamaModel) {
  console.log(`[Model Ordering] Opening config for: ${modelId}`);
  
  if (typeof openModelConfig === 'function') {
    openModelConfig(modelId, collectionKey, filename, ollamaModel);
  } else if (window.ModelConfig && window.ModelConfig.open) {
    window.ModelConfig.open(modelId, collectionKey, filename, ollamaModel);
  } else {
    alert('Configuration module not available. Please use the Browse & Download screen.');
  }
}

/**
 * Verify model checksum from ordering screen
 */
async function verifyModelFromOrdering(modelId, collectionKey, filename, expectedSha256) {
  console.log(`[Model Ordering] Verifying checksum for: ${modelId}`);
  
  if (typeof verifyModelChecksum === 'function') {
    await verifyModelChecksum(modelId, collectionKey, filename, expectedSha256);
  } else {
    try {
      const filepath = `models/${collectionKey}/${filename}`;
      const result = await window.electronAPI.verifyModelChecksum(filepath, expectedSha256);
      
      if (result.valid) {
        alert(`✅ Checksum verified!\n\nFile: ${filename}\nSHA256 matches expected value.`);
      } else {
        alert(`❌ Checksum mismatch!\n\nFile: ${filename}\nExpected: ${expectedSha256.substring(0, 16)}...\nActual: ${result.actual?.substring(0, 16) || 'unknown'}...`);
      }
    } catch (err) {
      alert(`Failed to verify checksum: ${err.message}`);
    }
  }
}

/**
 * Delete model from ordering screen
 */
async function deleteModelFromOrdering(modelId, collectionKey, filename) {
  console.log(`[Model Ordering] Deleting model: ${modelId}`);
  
  if (!confirm(`Are you sure you want to delete ${filename}?\n\nThis will remove the model file but keep it in the catalog.`)) {
    return;
  }
  
  if (typeof deleteModel === 'function') {
    await deleteModel(modelId, collectionKey, filename);
  } else {
    try {
      const filepath = `models/${collectionKey}/${filename}`;
      await window.electronAPI.deleteModel(filepath);
      alert(`Model file deleted: ${filename}`);
    } catch (err) {
      alert(`Failed to delete model: ${err.message}`);
    }
  }
  
  // Refresh download status
  await refreshDownloadStatus();
}

/**
 * Download a model from the ordering screen
 * Self-contained download handler with moe-prefixed element IDs
 */
async function downloadModelFromOrdering(modelId, downloadUrl, collectionKey, filename, projectorUrl, projectorFilename, sha256) {
  const resolveChecksumSpec = () => {
    if (sha256 && typeof sha256 === 'object') return sha256;
    if (typeof sha256 === 'string') {
      const raw = sha256.trim();
      if (raw && raw !== '[object Object]') {
        if (raw.startsWith('{') || raw.startsWith('[')) {
          try { return JSON.parse(raw); } catch (_) {}
        }
        return raw;
      }
    }
    const collection = window.catalogData?.collections?.[collectionKey];
    const model = Array.isArray(collection?.models)
      ? collection.models.find((m) => String(m?.id || '') === String(modelId || ''))
      : null;
    if (!model || typeof model !== 'object') return null;
    return model.checksums || model.sha256 || model.checksum || null;
  };
  const checksumSpec = resolveChecksumSpec();

  console.log(`[Model Ordering] Starting download: ${modelId}`);
  console.log(`[Model Ordering] URL: ${downloadUrl}, Collection: ${collectionKey}, File: ${filename}`);
  
  // Get moe-prefixed UI elements
  const downloadBtn = document.getElementById(`moe-download-btn-${modelId}`);
  const progressDiv = document.getElementById(`moe-progress-${modelId}`);
  const progressBar = document.getElementById(`moe-progress-bar-${modelId}`);
  const progressText = document.getElementById(`moe-progress-text-${modelId}`);
  
  // Show progress UI
  if (downloadBtn) {
    downloadBtn.disabled = true;
    downloadBtn.textContent = '⏳ Downloading...';
  }
  if (progressDiv) progressDiv.style.display = 'block';
  if (progressBar) progressBar.style.width = '0%';
  if (progressText) progressText.textContent = projectorUrl ? 'Downloading model (1/2)...' : 'Initializing download...';
  
  // Set up progress listener for this specific download
  const progressHandler = (data) => {
    if (data.modelId === modelId && progressBar && progressText) {
      progressBar.style.width = `${data.progress}%`;
      
      const eta = data.etaSeconds > 60 
        ? `${Math.floor(data.etaSeconds / 60)}m ${data.etaSeconds % 60}s`
        : `${data.etaSeconds}s`;
      
      progressText.textContent = `${data.progress}% • ${data.downloadedMB}/${data.totalMB} MB • ${data.speedMBps} MB/s • ETA: ${eta}`;
    }
  };
  
  // Register progress listener
  const removeListener = window.electronAPI.onDownloadProgress(progressHandler);
  
  try {
    // Call electronAPI directly
    const result = await window.electronAPI.downloadModel(
      modelId, 
      downloadUrl, 
      collectionKey,
      filename || null,
      projectorUrl || null,
      projectorFilename || null,
      checksumSpec || null
    );
    
    if (result.success) {
      // Success!
      if (progressBar) progressBar.style.width = '100%';
      
      if (result.projectorDownloaded) {
        if (progressText) progressText.textContent = `✅ Model + Projector downloaded! (${result.sizeMB} MB + ${result.projectorSizeMB} MB)`;
      } else {
        if (progressText) progressText.textContent = `✅ Download complete! (${result.sizeMB} MB)`;
      }
      
      // Update status
      window.modelOrderingState.downloadStatus[modelId] = {
        downloaded: true,
        wrapped: false
      };
      
      // Hide progress and re-render after delay
      setTimeout(() => {
        if (progressDiv) progressDiv.style.display = 'none';
        renderModelOrdering();
      }, 2000);
      
    } else {
      // Failed
      if (result.alreadyExists) {
        if (progressDiv) progressDiv.style.display = 'none';
        window.modelOrderingState.downloadStatus[modelId] = {
          downloaded: true,
          wrapped: false
        };
        alert(`File already exists:\n${result.message}`);
        renderModelOrdering();
      } else {
        if (progressBar) progressBar.style.background = '#ff6b6b';
        if (progressText) progressText.textContent = `❌ ${result.message}`;
        if (downloadBtn) {
          downloadBtn.disabled = false;
          downloadBtn.textContent = '🔥 Retry Download';
        }
        alert(`Download failed:\n${result.message}`);
      }
    }
    
  } catch (err) {
    console.error('[Model Ordering] Download error:', err);
    if (progressBar) progressBar.style.background = '#ff6b6b';
    if (progressText) progressText.textContent = `❌ Error: ${err.message}`;
    if (downloadBtn) {
      downloadBtn.disabled = false;
      downloadBtn.textContent = '🔥 Retry Download';
    }
    alert(`Download error:\n${err.message}`);
  } finally {
    // Clean up progress listener
    if (removeListener && typeof removeListener === 'function') {
      removeListener();
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

window.saveModelOrdering = saveModelOrdering;
window.checkAllDownloadStatus = checkAllDownloadStatus;
window.refreshDownloadStatus = refreshDownloadStatus;
window.launchModelFromOrdering = launchModelFromOrdering;
window.toggleEditMode = toggleEditMode;
window.openModelConfigFromOrdering = openModelConfigFromOrdering;
window.verifyModelFromOrdering = verifyModelFromOrdering;
window.deleteModelFromOrdering = deleteModelFromOrdering;
window.downloadModelFromOrdering = downloadModelFromOrdering;
