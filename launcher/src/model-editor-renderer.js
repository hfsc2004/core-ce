/**
 * MODEL EDITOR RENDERER
 * Client-side logic for the model editor popup window.
 * Handles form population, validation, API fetches, and submission.
 * 
 * @module model-editor-renderer
 * @version 1.1.3 - March 5, 2026
 * @changes Merged model mappings from ollama-name-helper.js (now deprecated)
 * @license SEE LICENSE.txt
 */

(function() {
  'use strict';
  
  let isEditMode = false;
  let originalModelId = '';
  let originalCollectionId = '';
  let splitHintActive = false;
  const fetchLocks = {
    arch: false,
    modelInfo: false,
    fileInfo: false
  };
  const utils = window.ModelEditorUtils || {};
  const inferParametersLabel = utils.inferParametersLabel || (() => '');
  const setFieldValue = utils.setFieldValue || (() => {});
  const setFieldChecked = utils.setFieldChecked || (() => {});
  const showStatus = utils.showStatus || (() => {});
  const helpers = window.ModelEditorRendererHelpers || {};
  const formatChecksumFilesText = helpers.formatChecksumFilesText || (() => '');
  const applyFetchedChecksums = helpers.applyFetchedChecksums || (() => {});
  const validateSplitDownloadConfig = helpers.validateSplitDownloadConfig || (() => ({ ok: true, hasSplit: false, hint: '' }));
  const buildModelData = helpers.buildModelData || (() => ({ ok: false, error: 'Model helper not loaded.' }));
  
  function initialize(data) {
    console.log('[Model Editor] Initializing with data:', data);
    
    const { mode, modelData, collections } = data;
    const model = modelData || {};
    
    isEditMode = mode === 'edit';
    originalModelId = model.id || '';
    originalCollectionId = model.collectionId || '';
    
    // Update title
    const title = isEditMode ? `Edit Model: ${model.name || 'Unknown'}` : 'Add New Model';
    document.getElementById('editor-title').textContent = `${isEditMode ? '✏️' : '📝'} ${title}`;
    document.title = title;
    
    // Populate collections dropdown
    populateCollections(collections, originalCollectionId);
    
    // Show collection move hint in edit mode
    if (isEditMode) {
      document.getElementById('collection-hint').style.display = 'block';
    }
    
    // Populate form fields if editing
    if (isEditMode && model) {
      populateForm(model);
      
      // Make ID readonly in edit mode
      const idField = document.getElementById('model-id');
      idField.readOnly = true;
      document.getElementById('model-id-label').textContent = 'Model ID * (readonly)';
    }
    
    // Update submit button text
    document.getElementById('btn-submit').textContent = isEditMode ? 'Save Changes' : 'Add Model';
    
    // Hide loading overlay
    document.getElementById('loading-overlay').classList.add('hidden');
    
    console.log('[Model Editor] Initialization complete');
  }
  
  function populateCollections(collections, selectedId) {
    const select = document.getElementById('model-collection');
    select.innerHTML = '';
    
    if (Array.isArray(collections)) {
      // Collections is an array of {id, name} objects
      collections.forEach(col => {
        const option = document.createElement('option');
        option.value = col.id;
        option.textContent = col.name || col.id;
        if (col.id === selectedId) option.selected = true;
        select.appendChild(option);
      });
    } else {
      // Collections is an object with collection IDs as keys
      Object.entries(collections || {}).forEach(([id, col]) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = col.name || id;
        if (id === selectedId) option.selected = true;
        select.appendChild(option);
      });
    }
  }
  
  function populateForm(model) {
    // Basic info
    setFieldValue('model-id', model.id);
    setFieldValue('model-name', model.name);
    setFieldValue('model-family', model.model_family);
    setFieldValue('model-organization', model.organization);
    setFieldValue('model-version', model.version);
    setFieldValue('model-description', model.description);
    
    // Files & Downloads
    setFieldValue('model-url', model.url);
    setFieldValue('model-download-url', model.download_url);
    setFieldValue('model-filename', model.filename);
    setFieldValue('model-hf-repo', model.huggingface_repo);
    setFieldValue('model-size-mb', model.size_mb);
    setFieldValue('model-file-size-bytes', model.file_size_bytes);
    setFieldValue('model-sha256', model.sha256 || model.checksums?.main || null);
    setFieldValue('model-checksum-files', formatChecksumFilesText(model.checksums));
    setFieldValue('model-projector-url', model.projector_url);
    setFieldValue('model-projector-filename', model.projector_filename);
    setFieldValue('model-projector-sha256', model.checksums?.projector || model.projector_sha256 || null);
    
    // Architecture
    setFieldValue('model-base-url', model.base_model_url);
    setFieldValue('model-hidden-size', model.hidden_size);
    setFieldValue('model-num-layers', model.num_layers);
    setFieldValue('model-num-kv-heads', model.num_kv_heads);
    setFieldValue('model-num-attn-heads', model.num_attention_heads);
    
    // Model Properties
    setFieldValue('model-quantization', model.quantization);
    setFieldValue('model-context', model.context_length);
    setFieldValue('model-architecture', model.architecture);
    setFieldChecked('model-supports-vision', model.supports_vision);
    setFieldChecked('model-supports-code', model.supports_code);
    setFieldChecked('model-supports-function-calling', model.supports_function_calling);
    setFieldChecked('model-supports-stt', model.supports_stt);
    setFieldChecked('model-supports-tts', model.supports_tts);
    
    // Hardware
    setFieldValue('model-min-ram', model.min_ram_gb);
    setFieldValue('model-rec-ram', model.recommended_ram_gb);
    setFieldValue('model-gpu-layers', model.gpu_layers);
    
    // License
    setFieldValue('model-license', model.license);
    setFieldValue('model-license-url', model.license_url);
    
    // Integration
    setFieldValue('model-ollama-name', model.ollama_model);
  }

  async function fetchArchitecture() {
    if (fetchLocks.arch) return;
    fetchLocks.arch = true;
    const baseUrl = document.getElementById('model-base-url').value;
    const modelUrl = document.getElementById('model-url').value;
    const urlToFetch = baseUrl || modelUrl;
    
    if (!urlToFetch) {
      showStatus('arch-status', 'error', '❌ Enter a Base Model URL or Model Page URL first');
      return;
    }
    
    showStatus('arch-status', 'loading', '🔄  Fetching config.json...');
    
    try {
      const result = await window.electronAPI.fetchHuggingFaceConfig(urlToFetch);
      if (result.success) {
        const cfg = result.config;
        const tc = cfg.text_config || {};
        const pc = tc.perceiver_config || {};
        
        const hidden = cfg.hidden_size || tc.hidden_size;
        const layers = cfg.num_hidden_layers || tc.num_hidden_layers;
        let kvHeads = cfg.num_key_value_heads || tc.num_key_value_heads || pc.num_key_value_heads;
        let attnHeads = cfg.num_attention_heads || tc.num_attention_heads;
        const headDim = cfg.head_dim || tc.head_dim;
        const context = cfg.max_position_embeddings || tc.max_position_embeddings;
        const arch = cfg.model_type || tc.model_type;
        
        if (!attnHeads && hidden && headDim) attnHeads = Math.floor(hidden / headDim);
        if (!kvHeads && attnHeads) kvHeads = attnHeads;
        
        if (hidden) document.getElementById('model-hidden-size').value = hidden;
        if (layers) document.getElementById('model-num-layers').value = layers;
        if (kvHeads) document.getElementById('model-num-kv-heads').value = kvHeads;
        if (attnHeads) document.getElementById('model-num-attn-heads').value = attnHeads;
        if (layers) document.getElementById('model-gpu-layers').value = layers;
        if (context) document.getElementById('model-context').value = context;
        if (arch) document.getElementById('model-architecture').value = arch;
        
        if (cfg.vision_config || arch?.toLowerCase().includes('vlm')) {
          document.getElementById('model-supports-vision').checked = true;
        }
        
        showStatus('arch-status', 'success', '✅ Fetched! Hidden: ' + (hidden||'N/A') + ', Layers: ' + (layers||'N/A'));
        
        // Try to calculate RAM
        calculateRAM();
      } else {
        showStatus('arch-status', 'error', '❌ ' + result.error);
      }
    } catch (err) {
      showStatus('arch-status', 'error', '❌ ' + err.message);
    } finally {
      fetchLocks.arch = false;
    }
  }
  
  async function fetchModelInfo() {
    if (fetchLocks.modelInfo) return;
    fetchLocks.modelInfo = true;
    const modelUrl = document.getElementById('model-url').value;
    if (!modelUrl) {
      showStatus('file-status', 'error', '❌ Enter Model Page URL first');
      return;
    }
    
    showStatus('file-status', 'loading', '🔄  Fetching model info...');
    
    try {
      const result = await window.electronAPI.fetchHuggingFaceModelInfo(modelUrl);
      if (result.success) {
        const info = result.info;
        if (info.name) {
          document.getElementById('model-name').value = info.name;
          if (!isEditMode) {
            document.getElementById('model-id').value = info.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          }
        }
        if (info.organization) {
          document.getElementById('model-organization').value = info.organization;
        }
        if (info.repo) {
          document.getElementById('model-hf-repo').value = info.repo;
        }
        if (info.license) {
          document.getElementById('model-license').value = info.license;
        }
        const preferredDescription = String(info.short_description || info.description || '').trim();
        document.getElementById('model-description').value = preferredDescription
          ? preferredDescription.substring(0, 500)
          : '';
        applyFetchedChecksums(info);
        showStatus('file-status', 'success', '✅ Fetched: ' + (info.name||'Unknown'));
      } else {
        showStatus('file-status', 'error', '❌ ' + result.error);
      }
    } catch (err) {
      showStatus('file-status', 'error', '❌ ' + err.message);
    } finally {
      fetchLocks.modelInfo = false;
    }
  }
  
  async function fetchFileInfo() {
    if (fetchLocks.fileInfo) return;
    fetchLocks.fileInfo = true;
    const downloadUrl = document.getElementById('model-download-url').value;
    if (!downloadUrl) {
      showStatus('file-status', 'error', '❌ Enter Download URL first');
      return;
    }
    
    showStatus('file-status', 'loading', '🔄  Fetching file info...');
    
    try {
      const result = await window.electronAPI.fetchFileInfo(downloadUrl);
      if (result.success) {
        const info = result.info;
        if (info.filename) {
          document.getElementById('model-filename').value = info.filename;
          // Parse quantization
          const qMatch = info.filename.match(/[_-](Q[0-9]_[A-Z_]+|Q[0-9]+_[0-9]+|FP16|FP32|BF16|F16|F32)/i);
          if (qMatch) {
            const q = qMatch[1].toUpperCase().replace('-', '_');
            const sel = document.getElementById('model-quantization');
            for (let opt of sel.options) {
              if (opt.value === q || q.includes(opt.value)) {
                sel.value = opt.value;
                break;
              }
            }
          }
        }
        if (info.size_bytes) {
          document.getElementById('model-file-size-bytes').value = info.size_bytes;
          document.getElementById('model-size-mb').value = Math.ceil(info.size_bytes / (1024 * 1024));
        }
        applyFetchedChecksums(info);
        showStatus('file-status', 'success', '✅ ' + (info.filename||'Unknown') + ' (' + (info.size_mb||'?') + ' MB)');
        refreshSplitDownloadHint();
        calculateRAM();
      } else {
        showStatus('file-status', 'error', '❌ ' + result.error);
      }
    } catch (err) {
      showStatus('file-status', 'error', '❌ ' + err.message);
    } finally {
      fetchLocks.fileInfo = false;
    }
  }
  
  async function calculateRAM() {
    const sizeMb = parseInt(document.getElementById('model-size-mb').value) || 0;
    const hidden = parseInt(document.getElementById('model-hidden-size').value) || 0;
    const layers = parseInt(document.getElementById('model-num-layers').value) || 0;
    const kvHeads = parseInt(document.getElementById('model-num-kv-heads').value) || 0;
    
    if (sizeMb && hidden && layers && kvHeads) {
      try {
        const modelData = {
          id: document.getElementById('model-id').value.trim(),
          name: document.getElementById('model-name').value.trim(),
          filename: document.getElementById('model-filename').value.trim(),
          parameters: inferParametersLabel({
            name: document.getElementById('model-name').value.trim(),
            id: document.getElementById('model-id').value.trim(),
            filename: document.getElementById('model-filename').value.trim(),
            model_family: document.getElementById('model-family').value.trim()
          }) || '',
          quantization: document.getElementById('model-quantization').value.trim() || '',
          size_mb: sizeMb,
          hidden_size: hidden,
          num_layers: layers,
          num_kv_heads: kvHeads,
          num_attention_heads: parseInt(document.getElementById('model-num-attn-heads').value) || kvHeads,
          context_length: parseInt(document.getElementById('model-context').value) || 4096,
          supports_vision: document.getElementById('model-supports-vision').checked
        };
        const reqs = await window.electronAPI.calculateModelRequirements(modelData);
        if (reqs && reqs.min_ram_gb) {
          document.getElementById('model-min-ram').value = Math.ceil(reqs.min_ram_gb);
          document.getElementById('model-rec-ram').value = Math.ceil(reqs.recommended_ram_gb);
        }
      } catch (e) {
        console.error('[Model Editor] RAM calc error:', e);
      }
    }
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

  function setFileHint(message = '') {
    const el = document.getElementById('file-status');
    if (!el) return;
    if (!message) {
      el.className = 'status-msg';
      el.textContent = '';
      splitHintActive = false;
      return;
    }
    splitHintActive = true;
    showStatus('file-status', 'loading', message);
  }

  function refreshSplitDownloadHint() {
    const downloadUrl = document.getElementById('model-download-url')?.value || '';
    const filename = document.getElementById('model-filename')?.value || '';
    const check = validateSplitDownloadConfig({ downloadUrl, filename });
    if (!check.ok) {
      showStatus('file-status', 'error', `❌ ${check.error}`);
      splitHintActive = false;
    } else if (check.hasSplit) {
      setFileHint(check.hint || '');
    } else if (splitHintActive) {
      setFileHint('');
    }
    return check;
  }
  
  async function handleSubmit(e) {
    e.preventDefault();

    const splitCheck = refreshSplitDownloadHint();
    if (!splitCheck.ok) {
      alert(splitCheck.error);
      return;
    }
    
    const built = buildModelData(inferParametersLabel);
    if (!built.ok) {
      alert(built.error || 'Unable to build model data.');
      return;
    }
    const modelData = built.modelData;
    
    const collectionId = document.getElementById('model-collection').value;
    
    try {
      let result;
      if (isEditMode) {
        // Check if collection changed (model needs to move)
        if (collectionId !== originalCollectionId) {
          console.log('[Model Editor] Moving model from', originalCollectionId, 'to', collectionId);
          const moveResult = await window.electronAPI.moveModel(originalCollectionId, collectionId, originalModelId);
          if (!moveResult || moveResult.success === false) {
            alert('Error moving model: ' + (moveResult?.message || 'Move failed'));
            return;
          }
          console.log('[Model Editor] Move successful, now updating model data');
          // After move, edit in the NEW collection
          result = await window.electronAPI.editModel(collectionId, originalModelId, modelData);
        } else {
          // Same collection - just edit
          console.log('[Model Editor] Editing model:', originalModelId, 'in collection:', originalCollectionId);
          result = await window.electronAPI.editModel(originalCollectionId, originalModelId, modelData);
        }
      } else {
        console.log('[Model Editor] Adding model to collection:', collectionId);
        console.log('[Model Editor] Model data:', modelData);
        result = await window.electronAPI.addModel(collectionId, modelData);
      }
      
      console.log('[Model Editor] Result:', result);
      
      // Check for success
      if (result && result.success === true) {
        window.electronAPI.refreshPackageManager();
        window.electronAPI.closeModelEditor();
      } else if (result && result.success === false) {
        alert('Error: ' + (result.error || result.message || 'Operation failed'));
      } else {
        // Assume success if we got a result without explicit success:false
        window.electronAPI.refreshPackageManager();
        window.electronAPI.closeModelEditor();
      }
    } catch (err) {
      console.error('[Model Editor] Error:', err);
      alert('Error: ' + err.message);
    }
  }
  
  if (window.electronAPI && window.electronAPI.onModelEditorData) {
    window.electronAPI.onModelEditorData((data) => {
      initialize(data);
    });
  }

  if (typeof window.installPsfTextInputFallback === 'function') {
    window.installPsfTextInputFallback();
  }
  
  document.getElementById('btn-minimize').addEventListener('click', () => {
    window.electronAPI.minimizeModelEditor();
  });
  
  document.getElementById('btn-close').addEventListener('click', () => {
    window.electronAPI.closeModelEditor();
  });
  
  document.getElementById('btn-cancel').addEventListener('click', () => {
    window.electronAPI.closeModelEditor();
  });
  
  document.getElementById('btn-fetch-arch').addEventListener('click', fetchArchitecture);
  document.getElementById('btn-fetch-model').addEventListener('click', fetchModelInfo);
  document.getElementById('btn-fetch-file').addEventListener('click', fetchFileInfo);
  
  document.getElementById('model-projector-url').addEventListener('input', autoFillProjectorFilename);
  document.getElementById('model-download-url').addEventListener('input', refreshSplitDownloadHint);
  document.getElementById('model-filename').addEventListener('input', refreshSplitDownloadHint);
  
  document.getElementById('model-form').addEventListener('submit', handleSubmit);
  
  console.log('[Model Editor] Renderer loaded, waiting for data...');
})();
