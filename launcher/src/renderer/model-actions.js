/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
// ============================================================================
// PSF OFFLINE ARCHIVE COLLECTION
// Renderer - Model Actions
// ============================================================================
// Shared by both Standard and Community Editions
// ============================================================================

// Regex pattern for split GGUF files (matches: model-00001-of-00005.gguf)
const SPLIT_FILE_PATTERN = /-(\d{5})-of-(\d{5})\.gguf$/i;

/**
 * Convert a split/shard filename to its merged filename
 * e.g., "model-00001-of-00002.gguf" Ã¢â€ â€™ "model.gguf"
 * Returns original filename if not a split file
 */
function getMergedFilename(filename) {
  if (SPLIT_FILE_PATTERN.test(filename)) {
    return filename.replace(SPLIT_FILE_PATTERN, '.gguf');
  }
  return filename;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showCopyableErrorDialog(title, message) {
  const existing = document.getElementById('model-action-error-modal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'model-action-error-modal';
  modal.style.cssText = [
    'position:fixed',
    'inset:0',
    'background:rgba(0,0,0,0.55)',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'z-index:99999'
  ].join(';');
  const safeTitle = escapeHtml(title || 'Error');
  const safeMessage = escapeHtml(message || 'Unknown error');
  modal.innerHTML = `
    <div style="width:min(760px,92vw); max-height:80vh; overflow:auto; background:#121826; border:1px solid #2b3650; border-radius:10px; padding:14px;">
      <div style="font-weight:700; color:#ff6b6b; margin-bottom:8px;">${safeTitle}</div>
      <pre style="white-space:pre-wrap; word-break:break-word; background:#0b1220; border:1px solid #24324d; color:#dbe7ff; padding:10px; border-radius:8px; font-size:12px;">${safeMessage}</pre>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:10px;">
        <button id="model-action-error-copy" style="padding:8px 12px; border-radius:8px; border:1px solid #345ea8; background:#173a73; color:#fff; cursor:pointer;">Copy</button>
        <button id="model-action-error-close" style="padding:8px 12px; border-radius:8px; border:1px solid #3a3a3a; background:#1c1c1c; color:#ddd; cursor:pointer;">Close</button>
      </div>
    </div>
  `;
  modal.addEventListener('click', (event) => {
    if (event.target === modal) modal.remove();
  });
  document.body.appendChild(modal);
  const closeBtn = document.getElementById('model-action-error-close');
  const copyBtn = document.getElementById('model-action-error-copy');
  if (closeBtn) closeBtn.addEventListener('click', () => modal.remove());
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(String(message || ''));
        copyBtn.textContent = 'Copied';
      } catch (_err) {
        copyBtn.textContent = 'Copy failed';
      }
      setTimeout(() => {
        if (copyBtn) copyBtn.textContent = 'Copy';
      }, 1200);
    });
  }
}

async function launchInOllama(collection, filename, projectorFilename = '', catalogModelId = null) {
  // Check if this is a split file pattern and convert to merged filename
  // Catalog stores shard 1 filename, but after download the actual file is merged
  const actualFilename = getMergedFilename(filename);
  if (actualFilename !== filename) {
    console.log(`[Launch] Split file detected: ${filename} Ã¢â€ â€™ ${actualFilename}`);
  }
  
  const modelPath = `models/${collection}/${actualFilename}`;
  const projectorPath = projectorFilename ? `models/${collection}/${projectorFilename}` : null;
  
  // Use catalog modelId if provided, otherwise derive from filename (fallback)
  // The catalog ID is needed for: DOM element lookups, Modelfile loading
  const modelId = catalogModelId || actualFilename.replace('.gguf', '');
  
  // Look up force_cpu from catalog if available
  let forceCpu = false;
  if (window.catalogData && window.catalogData.collections && window.catalogData.collections[collection]) {
    const model = window.catalogData.collections[collection].models?.find(m => m.id === modelId);
    if (model && model.force_cpu) {
      forceCpu = true;
      console.log(`[Launch] Force CPU mode enabled for ${modelId}`);
    }
  }
  
  console.log(`Launching ${actualFilename} in Ollama from ${modelPath}`);
  console.log(`Using modelId: ${modelId} (catalog: ${catalogModelId || 'derived from filename'})`);
  if (projectorPath) {
    console.log(`With projector: ${projectorPath}`);
  }
  
  // Show progress UI if available
  const progressDiv = document.getElementById(`download-progress-${modelId}`);
  const progressBar = document.getElementById(`progress-bar-${modelId}`);
  const progressText = document.getElementById(`progress-text-${modelId}`);
  
  if (progressDiv && progressBar && progressText) {
    progressDiv.style.display = 'block';
    progressBar.style.width = '10%';
    progressText.textContent = 'Loading model into Ollama...';
  }
  
  try {
    // Load the model into Ollama (with projector if available)
    const result = await window.electronAPI.launchModelInOllama(modelPath, projectorPath, modelId, forceCpu);
    
    if (result.success) {
      const modelName = result.modelName || actualFilename.replace('.gguf', '');
      
      // Hide progress bar after success
      if (progressDiv) {
        setTimeout(() => {
          progressDiv.style.display = 'none';
        }, 2000);
      }
      
      // Open terminal to interact with it - pass sessionId so we use the SAME Ollama instance
      const terminalResult = await window.electronAPI.openOllamaTerminal(
        modelName, 0, result.port, collection, modelId, result.sessionId
      );
      
      if (terminalResult.success) {
        console.log(`Terminal launched: window ${terminalResult.windowId}, session ${terminalResult.sessionId}, port ${terminalResult.port}`);
      } else {
        showCopyableErrorDialog(
          `Model loaded in Ollama: ${modelName}`,
          terminalResult.message || `Please open a terminal and run:\nollama run ${modelName}`
        );
      }
    } else {
      if (progressDiv) {
        progressDiv.style.display = 'none';
      }
      showCopyableErrorDialog('Failed to launch in Ollama', result.message || 'Unknown launch failure.');
    }
  } catch (err) {
    if (progressDiv) {
      progressDiv.style.display = 'none';
    }
    showCopyableErrorDialog('Error launching model', err.message || String(err));
  }
}

async function deleteModel(modelId, collection, filename) {
  const modelPath = `models/${collection}/${filename}`;
  
  if (!confirm(`Ã¢Å¡ Ã¯Â¸Â Delete Model File?\n\n${filename}\n\nThis will permanently delete the .gguf file from your storage. You can re-download it later if needed.\n\nAre you sure?`)) {
    return;
  }
  
  try {
    const result = await window.electronAPI.deleteModel(modelPath);
    
    if (result.success) {
      alert(`Ã¢Å“â€¦ Model deleted successfully!\n\n${filename}`);
      
      // Update UI - hide launch buttons, show download button
      const launchButtons = document.getElementById(`launch-buttons-${modelId}`);
      const downloadBtn = document.getElementById(`download-btn-${modelId}`);
      
      if (launchButtons) {
        launchButtons.style.display = 'none';
      }
      
      if (downloadBtn) {
        downloadBtn.style.display = 'block';
        downloadBtn.disabled = false;
      }
    } else {
      alert(`Ã¢ÂÅ’ Failed to delete model:\n${result.message}`);
    }
  } catch (err) {
    alert(`Ã¢ÂÅ’ Error deleting model:\n${err.message}`);
  }
}

// Listen for blob upload progress (model launching)
if (window.electronAPI && window.electronAPI.onBlobUploadProgress) {
  window.electronAPI.onBlobUploadProgress((data) => {
    const progressBar = document.getElementById(`progress-bar-${data.modelId}`);
    const progressText = document.getElementById(`progress-text-${data.modelId}`);
    const progressDiv = document.getElementById(`download-progress-${data.modelId}`);
    
    if (!progressBar || !progressText || !progressDiv) return;
    
    // Show progress div
    progressDiv.style.display = 'block';
    
    // Handle different stages
    if (data.stage === 'calculating') {
      progressBar.style.width = '10%';
      progressText.textContent = data.message || 'Calculating digest...';
    }
    else if (data.stage === 'uploading' && data.progress) {
      progressBar.style.width = `${data.progress}%`;
      
      const uploadedMB = (data.uploadedBytes / 1024 / 1024).toFixed(1);
      const totalMB = (data.totalBytes / 1024 / 1024).toFixed(1);
      const speedMBps = (data.speed / 1024 / 1024).toFixed(2);
      
      progressText.textContent = `Uploading ${data.fileName}: ${data.progress}% • ${uploadedMB}/${totalMB} MB • ${speedMBps} MB/s`;
      
      if (data.complete) {
        progressText.textContent = `Ã¢Å“â€¦ ${data.fileName} uploaded successfully!`;
      }
    }
    else if (data.stage === 'creating') {
      progressBar.style.width = '95%';
      progressText.textContent = data.message || 'Creating model...';
    }
  });
}

// ============================================================================
