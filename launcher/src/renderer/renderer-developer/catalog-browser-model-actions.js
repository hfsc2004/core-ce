/**
 * Catalog Browser model-level actions (download, edit, checksum, blob map).
 */

function cbEscapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cbShowCopyableErrorDialog(title, message) {
  const existing = document.getElementById('cb-model-action-error-modal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'cb-model-action-error-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:99999;';
  const safeTitle = cbEscapeHtml(title || 'Error');
  const safeMessage = cbEscapeHtml(message || 'Unknown error');
  modal.innerHTML = `
    <div style="width:min(760px,92vw);max-height:80vh;overflow:auto;background:#121826;border:1px solid #2b3650;border-radius:10px;padding:14px;">
      <div style="font-weight:700;color:#ff6b6b;margin-bottom:8px;">${safeTitle}</div>
      <pre style="white-space:pre-wrap;word-break:break-word;background:#0b1220;border:1px solid #24324d;color:#dbe7ff;padding:10px;border-radius:8px;font-size:12px;">${safeMessage}</pre>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;">
        <button id="cb-model-action-error-copy" style="padding:8px 12px;border-radius:8px;border:1px solid #345ea8;background:#173a73;color:#fff;cursor:pointer;">Copy</button>
        <button id="cb-model-action-error-close" style="padding:8px 12px;border-radius:8px;border:1px solid #3a3a3a;background:#1c1c1c;color:#ddd;cursor:pointer;">Close</button>
      </div>
    </div>
  `;
  modal.addEventListener('click', (event) => {
    if (event.target === modal) modal.remove();
  });
  document.body.appendChild(modal);
  const closeBtn = document.getElementById('cb-model-action-error-close');
  const copyBtn = document.getElementById('cb-model-action-error-copy');
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

async function launchFromCatalogBrowser(collectionKey, filename, projectorFilename, modelId) {
  console.log(`[Catalog Browser] Launching: ${modelId}`);
  
  let actualFilename = getMergedFilename(filename);
  if (actualFilename !== filename) {
    console.log(`[Catalog Browser] Split file detected: ${filename} → ${actualFilename}`);
  }
  
  const modelPath = `models/${collectionKey}/${actualFilename}`;
  const projectorPath = projectorFilename ? `models/${collectionKey}/${projectorFilename}` : null;
  
  // Look up force_cpu from catalog if available
  let forceCpu = false;
  const catalog = window.catalogBrowserState.catalog;
  if (catalog?.collections?.[collectionKey]) {
    const model = catalog.collections[collectionKey].models?.find(m => m.id === modelId);
    if (model?.force_cpu) {
      forceCpu = true;
      console.log(`[Catalog Browser] Force CPU mode enabled for ${modelId}`);
    }
  }
  
  // Get cb-prefixed progress elements
  const progressDiv = document.getElementById(`cb-download-progress-${modelId}`);
  const progressBar = document.getElementById(`cb-progress-bar-${modelId}`);
  const progressText = document.getElementById(`cb-progress-text-${modelId}`);
  
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
        console.log(`[Catalog Browser] Terminal launched: window ${terminalResult.windowId} on port ${terminalResult.port}`);
        
        // Update wrap status
        window.catalogBrowserState.downloadStatus[modelId] = {
          ...window.catalogBrowserState.downloadStatus[modelId],
          wrapped: true,
          modelName: modelName
        };
        renderCatalogBrowser();
      } else {
        cbShowCopyableErrorDialog(
          `Model loaded in Ollama: ${modelName}`,
          terminalResult.message || `Please open a terminal and run:\nollama run ${modelName}`
        );
      }
    } else {
      // Hide progress on error
      if (progressDiv) progressDiv.style.display = 'none';
      cbShowCopyableErrorDialog('Failed to launch in Ollama', result.message || 'Unknown launch failure.');
    }
  } catch (err) {
    console.error('[Catalog Browser] Launch failed:', err);
    if (progressDiv) progressDiv.style.display = 'none';
    cbShowCopyableErrorDialog('Error launching model', err.message || String(err));
  } finally {
    if (removeListener && typeof removeListener === 'function') {
      removeListener();
    }
  }
}

async function downloadFromCatalogBrowser(modelId, downloadUrl, collectionKey, filename, projectorUrl, projectorFilename, sha256) {
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

  console.log(`[Catalog Browser] Downloading: ${modelId}`);
  console.log(`[Catalog Browser] URL: ${downloadUrl}, Collection: ${collectionKey}, File: ${filename}`);
  
  // Get cb-prefixed UI elements
  const downloadBtn = document.getElementById(`cb-download-btn-${modelId}`);
  const progressDiv = document.getElementById(`cb-download-progress-${modelId}`);
  const progressBar = document.getElementById(`cb-progress-bar-${modelId}`);
  const progressText = document.getElementById(`cb-progress-text-${modelId}`);
  
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
      window.catalogBrowserState.downloadStatus[modelId] = {
        downloaded: true,
        wrapped: false
      };
      
      // Hide progress and re-render after delay
      setTimeout(() => {
        if (progressDiv) progressDiv.style.display = 'none';
        renderCatalogBrowser();
      }, 2000);
      
    } else {
      // Failed
      if (result.alreadyExists) {
        if (progressDiv) progressDiv.style.display = 'none';
        window.catalogBrowserState.downloadStatus[modelId] = {
          downloaded: true,
          wrapped: false
        };
        alert(`File already exists:
${result.message}`);
        renderCatalogBrowser();
      } else {
        if (progressBar) progressBar.style.background = '#ff6b6b';
        if (progressText) progressText.textContent = `❌ ${result.message}`;
        if (downloadBtn) {
          downloadBtn.disabled = false;
          downloadBtn.textContent = '🔥 Retry Download';
        }
        alert(`Download failed:
${result.message}`);
      }
    }
    
  } catch (err) {
    console.error('[Catalog Browser] Download error:', err);
    if (progressBar) progressBar.style.background = '#ff6b6b';
    if (progressText) progressText.textContent = `❌ Error: ${err.message}`;
    if (downloadBtn) {
      downloadBtn.disabled = false;
      downloadBtn.textContent = '🔥 Retry Download';
    }
    alert(`Download error:
${err.message}`);
  } finally {
    // Clean up progress listener
    if (removeListener && typeof removeListener === 'function') {
      removeListener();
    }
  }
}

async function editModelFromCatalogBrowser(modelId, collectionKey) {
  console.log(`[Catalog Browser] Editing: ${modelId}`);
  
  try {
    const collectionsResponse = await window.electronAPI.getCollections();
    if (!collectionsResponse.success) {
      alert('Failed to load collections');
      return;
    }
    
    const model = window.catalogBrowserState.catalog?.collections?.[collectionKey]?.models?.find(m => m.id === modelId);
    
    const result = await window.electronAPI.openModelEditor('edit', { 
      ...model, 
      collectionKey 
    }, collectionsResponse.collections);
    
    if (result.success) {
      // Refresh after edit
      await loadCatalogBrowser();
    }
  } catch (err) {
    console.error('[Catalog Browser] Edit failed:', err);
    alert(`Failed to open editor: ${err.message}`);
  }
}

async function deleteModelFromCatalogBrowser(modelId, collectionKey, modelName) {
  if (!confirm(`Delete "${modelName}" from the catalog?

This removes the catalog entry only.
Downloaded model files will NOT be deleted.`)) {
    return;
  }
  
  console.log(`[Catalog Browser] Deleting from catalog: ${modelId}`);
  
  try {
    const result = await window.electronAPI.deleteModelFromCatalog(collectionKey, modelId);
    
    if (result.success) {
      alert(`✅ Removed "${modelName}" from catalog.`);
      await loadCatalogBrowser(); // Refresh
    } else {
      alert(`❌ Failed to delete: ${result.message}`);
    }
  } catch (err) {
    console.error('[Catalog Browser] Delete failed:', err);
    alert(`Error: ${err.message}`);
  }
}

function openModelConfigFromBrowser(modelId, collectionKey, filename, ollamaModel) {
  console.log(`[Catalog Browser] Opening config for: ${modelId}`);
  
  if (window.ModelConfig && window.ModelConfig.open) {
    window.ModelConfig.open(modelId, collectionKey, filename, ollamaModel);
  } else if (typeof openModelConfig === 'function') {
    openModelConfig(modelId, collectionKey, filename, ollamaModel);
  } else {
    console.error('[Catalog Browser] ModelConfig module not loaded');
    alert('Configuration module not available. Please refresh the page.');
  }
}

async function toggleForceCpuFromBrowser(collectionKey, modelId, forceCpu) {
  console.log(`[Catalog Browser] Setting force_cpu=${forceCpu} for ${modelId}`);
  
  try {
    const result = await window.electronAPI.editModel(collectionKey, modelId, { force_cpu: forceCpu });
    
    if (result && result.success !== false) {
      // Update local catalog state
      const model = window.catalogBrowserState.catalog?.collections?.[collectionKey]?.models?.find(m => m.id === modelId);
      if (model) {
        model.force_cpu = forceCpu;
      }
      console.log(`[Catalog Browser] ✅ Force CPU ${forceCpu ? 'enabled' : 'disabled'}`);
    } else {
      console.error('[Catalog Browser] Failed to update force_cpu:', result);
      // Revert checkbox
      const checkbox = document.getElementById(`cb-force-cpu-${modelId}`);
      if (checkbox) checkbox.checked = !forceCpu;
      alert('Failed to save setting');
    }
  } catch (err) {
    console.error('[Catalog Browser] Error toggling force_cpu:', err);
    const checkbox = document.getElementById(`cb-force-cpu-${modelId}`);
    if (checkbox) checkbox.checked = !forceCpu;
  }
}

async function verifyChecksumFromBrowser(modelId, collectionKey, filename, expectedSha256) {
  const verifyBtn = document.getElementById(`cb-verify-btn-${modelId}`);
  const resultDiv = document.getElementById(`cb-verify-result-${modelId}`);
  
  if (!verifyBtn || !resultDiv) return;
  
  // Show loading state
  verifyBtn.disabled = true;
  verifyBtn.textContent = '⏳ Verifying...';
  resultDiv.style.display = 'block';
  resultDiv.style.background = 'var(--psf-accent-medium, rgba(0,212,255,0.2))';
  resultDiv.style.color = 'var(--psf-accent, #00d4ff)';
  resultDiv.textContent = '🔍 Calculating SHA256 checksum...';
  
  try {
    const filepath = `models/${collectionKey}/${filename}`;
    const result = await window.electronAPI.verifyModelChecksum(filepath, expectedSha256);
    
    if (result.valid) {
      resultDiv.style.background = 'rgba(0,255,136,0.2)';
      resultDiv.style.color = '#00ff88';
      resultDiv.textContent = '✅ Checksum verified! File integrity confirmed.';
    } else {
      resultDiv.style.background = 'rgba(255,107,107,0.2)';
      resultDiv.style.color = '#ff6b6b';
      const actual = String(result.actual || result.actualHash || '').trim();
      resultDiv.textContent = `❌ Checksum mismatch! Expected: ${expectedSha256.substring(0, 16)}... Got: ${actual.substring(0, 16) || 'unknown'}...`;
    }
  } catch (err) {
    console.error('[Catalog Browser] Verification error:', err);
    resultDiv.style.background = 'rgba(255,107,107,0.2)';
    resultDiv.style.color = '#ff6b6b';
    resultDiv.textContent = `❌ Verification failed: ${err.message}`;
  }
  
  verifyBtn.disabled = false;
  verifyBtn.textContent = '🔍 Verify';
  
  // Hide result after 10 seconds
  setTimeout(() => {
    resultDiv.style.display = 'none';
  }, 10000);
}

async function evaluateModelFromCatalogBrowser(modelId, modelName) {
  if (!window.CatalogBrowserModelEvalActions?.evaluateModelFromCatalogBrowser) {
    cbShowCopyableErrorDialog('Model evaluation failed', 'Evaluation helper module is not loaded.');
    return;
  }
  await window.CatalogBrowserModelEvalActions.evaluateModelFromCatalogBrowser({
    modelId,
    modelName,
    onErrorDialog: cbShowCopyableErrorDialog
  });
}

function showBlobMapFromBrowser(filename) {
  const raw = String(filename || '').trim();
  if (!raw) return;
  const modelName = raw.replace(/\.gguf$/i, '');
  if (typeof showBlobDetails === 'function') {
    showBlobDetails(modelName);
    return;
  }
  alert('Blob mapper UI is not available in this build.');
}

async function deleteModelFileFromBrowser(modelId, collectionKey, filename, modelName) {
  if (!confirm(`Delete model file "${modelName}"?

This will delete:
• The GGUF file
• Ollama blob and manifest

The model will remain in the catalog and can be downloaded again.`)) {
    return;
  }
  
  console.log(`[Catalog Browser] Deleting model file: ${modelId}`);
  
  try {
    // Use the existing deleteModel function which deletes the actual file
    if (typeof deleteModel === 'function') {
      await deleteModel(modelId, collectionKey, filename);
    } else {
      const filepath = `models/${collectionKey}/${filename}`;
      await window.electronAPI.deleteModel(filepath);
    }
    
    // Update status to show not downloaded
    window.catalogBrowserState.downloadStatus[modelId] = {
      downloaded: false,
      wrapped: false
    };
    
    alert(`✅ Model file deleted. You can download "${modelName}" again.`);
    renderCatalogBrowser();
    
  } catch (err) {
    console.error('[Catalog Browser] Delete file failed:', err);
    alert(`❌ Failed to delete file: ${err.message}`);
  }
}

window.launchFromCatalogBrowser = launchFromCatalogBrowser;
window.downloadFromCatalogBrowser = downloadFromCatalogBrowser;
window.openModelConfigFromBrowser = openModelConfigFromBrowser;
window.toggleForceCpuFromBrowser = toggleForceCpuFromBrowser;
window.verifyChecksumFromBrowser = verifyChecksumFromBrowser;
window.evaluateModelFromCatalogBrowser = evaluateModelFromCatalogBrowser;
window.showBlobMapFromBrowser = showBlobMapFromBrowser;
window.deleteModelFileFromBrowser = deleteModelFileFromBrowser;
window.editModelFromCatalogBrowser = editModelFromCatalogBrowser;
window.deleteModelFromCatalogBrowser = deleteModelFromCatalogBrowser;
