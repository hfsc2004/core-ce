/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
// LAUNCH MODELS
// ============================================================================

// Regex pattern for split GGUF files (matches: model-00001-of-00005.gguf)
const MODEL_ACTIONS_SPLIT_FILE_PATTERN = /-(\d{5})-of-(\d{5})\.gguf$/i;

/**
 * Convert a split/shard filename to its merged filename
 * e.g., "model-00001-of-00002.gguf" → "model.gguf"
 * Returns original filename if not a split file
 */
function getMergedFilename(filename) {
  if (MODEL_ACTIONS_SPLIT_FILE_PATTERN.test(filename)) {
    return filename.replace(MODEL_ACTIONS_SPLIT_FILE_PATTERN, '.gguf');
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
    console.log(`[Launch] Split file detected: ${filename} → ${actualFilename}`);
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
  
  // Show progress UI immediately
  const progressDiv = document.getElementById(`download-progress-${modelId}`);
  const progressBar = document.getElementById(`progress-bar-${modelId}`);
  const progressText = document.getElementById(`progress-text-${modelId}`);
  
  if (progressDiv && progressBar && progressText) {
    progressDiv.style.display = 'block';
    progressBar.style.width = '5%';
    progressText.textContent = 'Preparing to launch...';
  }
  
  try {
    // First, load the model into Ollama (with projector if available)
    // Pass modelId and forceCpu so progress events can be tracked
    const result = await window.electronAPI.launchModelInOllama(modelPath, projectorPath, modelId, forceCpu);
    
    if (result.success) {
      const modelName = result.modelName || actualFilename.replace('.gguf', '');
      
      // Hide progress bar after success
      if (progressDiv) {
        setTimeout(() => {
          progressDiv.style.display = 'none';
        }, 2000); // Keep visible for 2 seconds to show "Creating model..." completion
      }
      
      // Then open terminal to interact with it - pass collection/modelId for system prompt lookup
      const terminalResult = await window.electronAPI.openOllamaTerminal(modelName, 0, result.port, collection, modelId);
      
      if (terminalResult.success) {
        // Success - terminal opened!
        console.log(`Terminal launched: window ${terminalResult.windowId} on port ${terminalResult.port}`);
        
        // Refresh blob status to update "Ollama Ready" indicator
        if (typeof refreshBlobStatus === 'function') {
          refreshBlobStatus();
        }
      } else {
        // Terminal failed to open - show manual instructions
        showCopyableErrorDialog(
          `Model loaded in Ollama: ${modelName}`,
          terminalResult.message || `Please open a terminal and run:\nollama run ${modelName}`
        );
      }
    } else {
      // Hide progress bar on error
      if (progressDiv) {
        progressDiv.style.display = 'none';
      }
      showCopyableErrorDialog('Failed to launch in Ollama', result.message || 'Unknown launch failure.');
    }
  } catch (err) {
    // Hide progress bar on error
    if (progressDiv) {
      progressDiv.style.display = 'none';
    }
    showCopyableErrorDialog('Error launching model', err.message || String(err));
  }
}

async function launchInWebUI(collection, filename) {
  const modelPath = `models/${collection}/${filename}`;
  console.log(`Opening Open-WebUI with model: ${modelPath}`);
  
  // Open-WebUI typically runs on http://localhost:8080
  const webUIUrl = 'http://localhost:8080';
  
  try {
    await window.electronAPI.openURL(webUIUrl);
    alert(`🌐 Open-WebUI opening in your browser!\n\nModel available: ${filename}\n\nIf Open-WebUI isn't running, start it first with:\ndocker run -d -p 8080:8080 ghcr.io/open-webui/open-webui:main`);
  } catch (err) {
    alert(`❌ Error opening Open-WebUI:\n${err.message}\n\nMake sure Open-WebUI is installed and running.`);
  }
}

async function launchInAnythingLLM(collection, filename) {
  const modelPath = `models/${collection}/${filename}`;
  console.log(`Opening AnythingLLM with model: ${modelPath}`);
  
  // AnythingLLM typically runs on http://localhost:3001
  const anythingLLMUrl = 'http://localhost:3001';
  
  try {
    await window.electronAPI.openURL(anythingLLMUrl);
    alert(`💬 AnythingLLM opening in your browser!\n\nModel location: ${modelPath}\n\nAdd this model in AnythingLLM settings under LLM Provider > Ollama.\n\nIf AnythingLLM isn't running, start it first.`);
  } catch (err) {
    alert(`❌ Error opening AnythingLLM:\n${err.message}\n\nMake sure AnythingLLM is installed and running.`);
  }
}

async function deleteModel(modelId, collection, filename) {
  const actualFilename = getMergedFilename(filename);
  const modelPath = `models/${collection}/${actualFilename}`;
  
  if (!confirm(`⚠️ Delete Model File?\n\n${actualFilename}\n\nThis will permanently delete the .gguf file from your storage. You can re-download it later if needed.\n\nAre you sure?`)) {
    return;
  }
  
  try {
    const result = await window.electronAPI.deleteModel(modelPath);
    
    if (result.success) {
      alert(`✅ Model deleted successfully!\n\n${actualFilename}`);
      
      // Update UI - hide launch buttons, show download button
      const launchButtons = document.getElementById(`launch-buttons-${modelId}`);
      const downloadBtn = document.getElementById(`download-btn-${modelId}`);
      
      if (launchButtons) {
        launchButtons.style.display = 'none';
      }
      
      if (downloadBtn) {
        downloadBtn.style.display = 'block';
        downloadBtn.disabled = false;
        downloadBtn.innerHTML = '&#128229; Download Model';  // Reset button text
      }

      // Refresh blob status to update "Ollama Ready" indicator
      if (typeof refreshBlobStatus === 'function') {
        refreshBlobStatus();
      }
    } else {
      alert(`❌ Failed to delete model:\n${result.message}`);
    }
  } catch (err) {
    alert(`❌ Error deleting model:\n${err.message}`);
  }
}

// Listen for download progress updates globally
// Unified download progress listener (handles both models and binaries)
window.electronAPI.onDownloadProgress((data) => {
  // Handle model downloads (has modelId)
  if (data.modelId) {
    const progressBar = document.getElementById(`progress-bar-${data.modelId}`);
    const progressText = document.getElementById(`progress-text-${data.modelId}`);
    
    if (progressBar && progressText) {
      progressBar.style.width = `${data.progress}%`;
      
      const eta = data.etaSeconds > 60 
        ? `${Math.floor(data.etaSeconds / 60)}m ${data.etaSeconds % 60}s`
        : `${data.etaSeconds}s`;
      
      progressText.textContent = `${data.progress}% • ${data.downloadedMB}/${data.totalMB} MB • ${data.speedMBps} MB/s • ETA: ${eta}`;
    }
  }
  
  // Handle binary downloads (has filename)
  else if (data.filename) {
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const currentFile = document.getElementById('current-file');
    const filesCompleted = document.getElementById('files-completed');
    const downloadSpeed = document.getElementById('download-speed');
    
    if (progressBar && progressText) {
      progressBar.style.width = `${data.progress}%`;
      const stageMap = {
        prepare: 'Preparing',
        downloading: 'Downloading',
        extracting: 'Extracting',
        'installing-index': 'Installing index',
        'installing-core': 'Installing ESP32 core',
        verifying: 'Verifying',
        completed: 'Completed'
      };
      const stageLabel = stageMap[String(data.stage || '').toLowerCase()] || 'Working';
      progressText.textContent = `${Math.round(Number(data.progress || 0))}% • ${stageLabel}`;
      if (currentFile) {
        currentFile.textContent = data.message
          ? data.message
          : `Downloading: ${data.filename}`;
      }
      if (filesCompleted) {
        const completed = Number(data.completed || 0);
        const total = Number(data.total || 0);
        if (total > 1024 * 1024) {
          const completedMB = (completed / (1024 * 1024)).toFixed(1);
          const totalMB = (total / (1024 * 1024)).toFixed(1);
          filesCompleted.textContent = `Transferred: ${completedMB}/${totalMB} MB`;
        } else if (total > 0) {
          filesCompleted.textContent = `Files: ${completed}/${total}`;
        } else {
          filesCompleted.textContent = 'Transferred: calculating...';
        }
      }
      if (downloadSpeed) {
        const localBuild = String(data.filename || '').toLowerCase() === 'llama.cpp';
        downloadSpeed.textContent = localBuild
          ? 'Local build (CPU)'
          : (data.speed && Number(data.speed) > 0 ? formatSpeed(data.speed) : 'Working...');
      }
    }
  }
});

// Listen for blob upload progress (model launching)
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
    
    // If complete, show success
    if (data.complete) {
      progressText.textContent = `✅ ${data.fileName} uploaded successfully!`;
    }
  }
  else if (data.stage === 'creating') {
    progressBar.style.width = '95%';
    progressText.textContent = data.message || 'Creating model...';
  }
});

async function downloadModel(modelId, url, collectionId, filename = '', projectorUrl = '', projectorFilename = '', sha256 = '') {
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
    const collection = window.catalogData?.collections?.[collectionId];
    const model = Array.isArray(collection?.models)
      ? collection.models.find((m) => String(m?.id || '') === String(modelId || ''))
      : null;
    if (!model || typeof model !== 'object') return null;
    return model.checksums || model.sha256 || model.checksum || null;
  };
  const checksumSpec = resolveChecksumSpec();

  console.log(`Starting download: ${modelId} from ${url} to collection ${collectionId}`);
  console.log(`Using filename: ${filename || '(from URL)'}`);
  if (checksumSpec) {
    console.log('Checksum verification enabled for this model');
  }
  if (projectorUrl) {
    console.log(`Also downloading projector: ${projectorFilename}`);
  }
  
  // Get UI elements
  const downloadBtn = document.getElementById(`download-btn-${modelId}`);
  const launchButtons = document.getElementById(`launch-buttons-${modelId}`);
  const progressDiv = document.getElementById(`download-progress-${modelId}`);
  const progressBar = document.getElementById(`progress-bar-${modelId}`);
  const progressText = document.getElementById(`progress-text-${modelId}`);
  
  if (!downloadBtn || !progressDiv) {
    alert('UI elements not found. Please refresh and try again.');
    return;
  }
  
  // Disable button and show progress
  downloadBtn.disabled = true;
  downloadBtn.textContent = '⏳ Downloading...';
  progressDiv.style.display = 'block';
  progressBar.style.width = '0%';
  progressText.textContent = projectorUrl ? 'Downloading model (1/2)...' : 'Initializing download...';
  
  try {
    // Pass filename, projector URL and filename, and SHA256 if available
    const result = await window.electronAPI.downloadModel(
      modelId, 
      url, 
      collectionId,
      filename || null,
      projectorUrl || null,
      projectorFilename || null,
      checksumSpec || null
    );
    
    if (result.success) {
      // Success!
      progressBar.style.width = '100%';
      
      // Show appropriate completion message
      if (result.projectorDownloaded) {
        progressText.textContent = `✅ Model + Projector downloaded! (${result.sizeMB} MB + ${result.projectorSizeMB} MB)`;
      } else {
        progressText.textContent = `✅ Download complete! (${result.sizeMB} MB)`;
      }
      
      // Hide download button and progress after 2 seconds, show launch buttons
      setTimeout(() => {
        downloadBtn.style.display = 'none';
        progressDiv.style.display = 'none';
        
        // Show launch buttons
        if (launchButtons) {
          launchButtons.style.display = 'block';
        }
      }, 2000);
      
    } else {
      // Failed
      if (result.alreadyExists) {
        progressDiv.style.display = 'none';
        downloadBtn.style.display = 'none';
        
        // Show launch buttons if file exists
        if (launchButtons) {
          launchButtons.style.display = 'block';
        }
        
        alert(`File already exists:\n${result.message}`);
      } else {
        progressBar.style.background = '#ff6b6b';
        progressText.textContent = `❌ ${result.message}`;
        downloadBtn.disabled = false;
        downloadBtn.textContent = '📥 Retry Download';
        alert(`Download failed:\n${result.message}`);
      }
    }
    
  } catch (err) {
    console.error('Download error:', err);
    progressBar.style.background = '#ff6b6b';
    progressText.textContent = `❌ Error: ${err.message}`;
    downloadBtn.disabled = false;
    downloadBtn.textContent = '📥 Retry Download';
    alert(`Download error:\n${err.message}`);
  }
}

// ============================================================================
