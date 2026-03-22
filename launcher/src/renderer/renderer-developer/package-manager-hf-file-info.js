/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
/**
 * Package Manager model/file metadata helpers and status UI.
 */

let hfModelInfoFetchInFlight = false;
let hfModelInfoFetchEditInFlight = false;
let hfFileInfoFetchInFlight = false;
let hfFileInfoFetchEditInFlight = false;

function showStatus(div, type, message) {
  if (!div) return;
  div.style.display = 'block';
  if (type === 'error') {
    div.style.background = 'rgba(255,107,107,0.2)';
    div.style.color = '#ff6b6b';
  } else if (type === 'loading') {
    div.style.background = 'var(--psf-accent-medium, rgba(0,212,255,0.2))';
    div.style.color = 'var(--psf-accent, #00d4ff)';
  } else if (type === 'success') {
    div.style.background = 'rgba(0,255,136,0.2)';
    div.style.color = '#00ff88';
  }
  div.textContent = message;
}

function setIfPresent(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  const next = String(value || '').trim();
  if (!next) return;
  el.value = next;
}

function formatChecksumFilesText(checksums) {
  if (!checksums || typeof checksums !== 'object') return '';
  const files = checksums.files && typeof checksums.files === 'object' ? checksums.files : null;
  if (!files) return '';
  return Object.entries(files)
    .filter(([filename, hash]) => String(filename || '').trim() && /^[a-fA-F0-9]{64}$/.test(String(hash || '').trim()))
    .map(([filename, hash]) => `${filename} = ${String(hash).trim().toLowerCase()}`)
    .join('\n');
}

function autoFillProjectorFilename() {
  const urlField = document.getElementById('model-projector-url');
  const filenameField = document.getElementById('model-projector-filename');
  if (urlField && filenameField && urlField.value) {
    try {
      const url = new URL(urlField.value);
      const filename = url.pathname.split('/').pop();
      if (filename && filename.endsWith('.gguf')) {
        filenameField.value = filename;
      }
    } catch (e) { /* ignore invalid URLs */ }
  }
}

function autoFillProjectorFilenameEdit() {
  const urlField = document.getElementById('edit-model-projector-url');
  const filenameField = document.getElementById('edit-model-projector-filename');
  if (urlField && filenameField && urlField.value) {
    try {
      const url = new URL(urlField.value);
      const filename = url.pathname.split('/').pop();
      if (filename && filename.endsWith('.gguf')) {
        filenameField.value = filename;
      }
    } catch (e) { /* ignore invalid URLs */ }
  }
}

async function fetchModelInfo() {
  if (hfModelInfoFetchInFlight) return;
  hfModelInfoFetchInFlight = true;
  const statusDiv = document.getElementById('file-fetch-status');
  const modelUrl = document.getElementById('model-url')?.value || '';
  
  if (!modelUrl) {
    showStatus(statusDiv, 'error', '❌ Please enter a HuggingFace Model Page URL first.');
    return;
  }
  
  showStatus(statusDiv, 'loading', '🔄 Fetching model info from HuggingFace API...');
  
  try {
    const result = await window.electronAPI.fetchHuggingFaceModelInfo(modelUrl);
    
    if (result.success) {
      const info = result.info;
      
      // Auto-fill fields
      if (info.name) {
        document.getElementById('model-name').value = info.name;
      }
      document.getElementById('model-description').value = String(info.short_description || info.description || '');
      if (info.license) {
        document.getElementById('model-license').value = info.license;
      }
      if (info.organization) {
        document.getElementById('model-organization').value = info.organization;
      }
      if (info.repo) {
        document.getElementById('model-hf-repo').value = info.repo;
      }
      setIfPresent('model-sha256', info.sha256 || info.checksums?.main);
      setIfPresent('model-checksum-files', formatChecksumFilesText(info.checksums));
      
      // Generate model ID from name if empty
      if (info.name) {
        const modelId = info.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        document.getElementById('model-id').value = modelId;
      }
      
      showStatus(statusDiv, 'success', `✅ Fetched: ${info.name || 'Unknown'} by ${info.organization || 'Unknown'}`);
    } else {
      showStatus(statusDiv, 'error', `❌ ${result.error}`);
    }
  } catch (err) {
    showStatus(statusDiv, 'error', `❌ Error: ${err.message}`);
  } finally {
    hfModelInfoFetchInFlight = false;
  }
}

async function fetchModelInfoEdit() {
  if (hfModelInfoFetchEditInFlight) return;
  hfModelInfoFetchEditInFlight = true;
  const statusDiv = document.getElementById('edit-file-fetch-status');
  const modelUrl = document.getElementById('edit-model-url')?.value || '';
  
  if (!modelUrl) {
    showStatus(statusDiv, 'error', '❌ Please enter a HuggingFace Model Page URL first.');
    return;
  }
  
  showStatus(statusDiv, 'loading', '🔄 Fetching model info from HuggingFace API...');
  
  try {
    const result = await window.electronAPI.fetchHuggingFaceModelInfo(modelUrl);
    
    if (result.success) {
      const info = result.info;
      
      // Auto-fill fields (only if empty for edit form)
      document.getElementById('edit-model-description').value = String(info.short_description || info.description || '');
      if (info.license) {
        document.getElementById('edit-model-license').value = info.license;
      }
      if (info.organization) {
        document.getElementById('edit-model-organization').value = info.organization;
      }
      if (info.repo) {
        document.getElementById('edit-model-hf-repo').value = info.repo;
      }
      setIfPresent('edit-model-sha256', info.sha256 || info.checksums?.main);
      setIfPresent('edit-model-checksum-files', formatChecksumFilesText(info.checksums));
      
      showStatus(statusDiv, 'success', `✅ Fetched: ${info.name || 'Unknown'} by ${info.organization || 'Unknown'}`);
    } else {
      showStatus(statusDiv, 'error', `❌ ${result.error}`);
    }
  } catch (err) {
    showStatus(statusDiv, 'error', `❌ Error: ${err.message}`);
  } finally {
    hfModelInfoFetchEditInFlight = false;
  }
}

async function fetchFileInfo() {
  if (hfFileInfoFetchInFlight) return;
  hfFileInfoFetchInFlight = true;
  const statusDiv = document.getElementById('file-fetch-status');
  const downloadUrl = document.getElementById('model-download-url')?.value || '';
  
  if (!downloadUrl) {
    showStatus(statusDiv, 'error', '❌ Please enter a Direct Download URL first.');
    return;
  }
  
  showStatus(statusDiv, 'loading', '🔄 Fetching file info...');
  
  try {
    const result = await window.electronAPI.fetchFileInfo(downloadUrl);
    
    if (result.success) {
      const info = result.info;
      
      // Auto-fill filename
      if (info.filename) {
        document.getElementById('model-filename').value = info.filename;
        
        // Parse quantization from filename
        const quantMatch = info.filename.match(/[_-](Q[0-9]_[A-Z_]+|Q[0-9]+_[0-9]+|FP16|FP32|BF16)/i);
        if (quantMatch) {
          const quant = quantMatch[1].toUpperCase().replace('-', '_');
          const quantSelect = document.getElementById('model-quantization');
          if (quantSelect) {
            // Try to find matching option
            for (let opt of quantSelect.options) {
              if (opt.value.toUpperCase() === quant || quant.includes(opt.value.toUpperCase())) {
                quantSelect.value = opt.value;
                break;
              }
            }
          }
        }
      }
      
      // Auto-fill file size
      if (info.size_bytes) {
        document.getElementById('model-file-size-bytes').value = info.size_bytes;
        document.getElementById('model-size-mb').value = Math.ceil(info.size_bytes / (1024 * 1024));
      }
      setIfPresent('model-sha256', info.sha256 || info.checksums?.main);
      setIfPresent('model-checksum-files', formatChecksumFilesText(info.checksums));
      
      showStatus(statusDiv, 'success', `✅ Fetched: ${info.filename || 'Unknown'} (${info.size_mb || '?'} MB)`);
      
      // Now that we have size, re-trigger architecture fetch to calculate RAM
      const archStatus = document.getElementById('fetch-status');
      if (archStatus && archStatus.textContent.includes('enter Size MB')) {
        // Re-run the config fetch to calculate RAM
        fetchHuggingFaceConfig();
      }
    } else {
      showStatus(statusDiv, 'error', `❌ ${result.error}`);
    }
  } catch (err) {
    showStatus(statusDiv, 'error', `❌ Error: ${err.message}`);
  } finally {
    hfFileInfoFetchInFlight = false;
  }
}

async function fetchFileInfoEdit() {
  if (hfFileInfoFetchEditInFlight) return;
  hfFileInfoFetchEditInFlight = true;
  const statusDiv = document.getElementById('edit-file-fetch-status');
  const downloadUrl = document.getElementById('edit-model-download-url')?.value || '';
  
  if (!downloadUrl) {
    showStatus(statusDiv, 'error', '❌ Please enter a Direct Download URL first.');
    return;
  }
  
  showStatus(statusDiv, 'loading', '🔄 Fetching file info...');
  
  try {
    const result = await window.electronAPI.fetchFileInfo(downloadUrl);
    
    if (result.success) {
      const info = result.info;
      
      // Auto-fill filename
      if (info.filename) {
        document.getElementById('edit-model-filename').value = info.filename;
        
        // Parse quantization from filename
        const quantMatch = info.filename.match(/[_-](Q[0-9]_[A-Z_]+|Q[0-9]+_[0-9]+|FP16|FP32|BF16)/i);
        if (quantMatch) {
          const quant = quantMatch[1].toUpperCase().replace('-', '_');
          const quantSelect = document.getElementById('edit-model-quantization');
          if (quantSelect) {
            for (let opt of quantSelect.options) {
              if (opt.value.toUpperCase() === quant || quant.includes(opt.value.toUpperCase())) {
                quantSelect.value = opt.value;
                break;
              }
            }
          }
        }
      }
      
      // Auto-fill file size
      if (info.size_bytes) {
        document.getElementById('edit-model-file-size-bytes').value = info.size_bytes;
        document.getElementById('edit-model-size-mb').value = Math.ceil(info.size_bytes / (1024 * 1024));
      }
      setIfPresent('edit-model-sha256', info.sha256 || info.checksums?.main);
      setIfPresent('edit-model-checksum-files', formatChecksumFilesText(info.checksums));
      
      showStatus(statusDiv, 'success', `✅ Fetched: ${info.filename || 'Unknown'} (${info.size_mb || '?'} MB)`);
      
      // Re-trigger architecture fetch to calculate RAM if needed
      const archStatus = document.getElementById('edit-fetch-status');
      if (archStatus && archStatus.textContent.includes('enter Size MB')) {
        fetchHuggingFaceConfigEdit();
      }
    } else {
      showStatus(statusDiv, 'error', `❌ ${result.error}`);
    }
  } catch (err) {
    showStatus(statusDiv, 'error', `❌ Error: ${err.message}`);
  } finally {
    hfFileInfoFetchEditInFlight = false;
  }
}
