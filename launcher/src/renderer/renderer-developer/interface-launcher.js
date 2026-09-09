/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
// INTERFACE LAUNCHER WITH MODEL SELECTION
// ============================================================================

let showingAllModels = false;
let allModels = [];
let recommendedModels = [];
let originalShowScreen = null;

function ensureCopyableErrorStyles() {
  if (document.getElementById('psf-copyable-error-styles')) return;
  const style = document.createElement('style');
  style.id = 'psf-copyable-error-styles';
  style.textContent = `
    .psf-copyable-error-backdrop {
      position: fixed;
      inset: 0;
      z-index: 100000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: rgba(0, 0, 0, 0.72);
    }
    .psf-copyable-error-dialog {
      width: min(920px, 94vw);
      max-height: 86vh;
      display: grid;
      grid-template-rows: auto minmax(260px, 1fr) auto;
      gap: 12px;
      padding: 16px;
      background: #111827;
      border: 1px solid #374151;
      border-radius: 8px;
      box-shadow: 0 24px 70px rgba(0, 0, 0, 0.5);
      color: #f9fafb;
    }
    .psf-copyable-error-title {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
      user-select: text;
    }
    .psf-copyable-error-text {
      width: 100%;
      min-height: 260px;
      max-height: 62vh;
      resize: vertical;
      padding: 10px;
      background: #020617;
      border: 1px solid #4b5563;
      border-radius: 6px;
      color: #f8fafc;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
      font-size: 12px;
      line-height: 1.45;
      white-space: pre;
      user-select: text;
    }
    .psf-copyable-error-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .psf-copyable-error-actions button {
      padding: 8px 12px;
      border: 1px solid #4b5563;
      border-radius: 6px;
      background: #1f2937;
      color: #f9fafb;
      cursor: pointer;
    }
    .psf-copyable-error-actions button:hover {
      background: #374151;
    }
  `;
  document.head.appendChild(style);
}

async function copyTextToClipboard(text) {
  try {
    if (navigator?.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) {}
  return false;
}

async function showCopyableError(message, title = 'Error') {
  const text = String(message || '');
  await copyTextToClipboard(text);
  ensureCopyableErrorStyles();

  const previous = document.getElementById('psf-copyable-error-backdrop');
  if (previous) previous.remove();

  const backdrop = document.createElement('div');
  backdrop.id = 'psf-copyable-error-backdrop';
  backdrop.className = 'psf-copyable-error-backdrop';

  const dialog = document.createElement('div');
  dialog.className = 'psf-copyable-error-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'psf-copyable-error-title');

  const heading = document.createElement('h2');
  heading.id = 'psf-copyable-error-title';
  heading.className = 'psf-copyable-error-title';
  heading.textContent = title;

  const textarea = document.createElement('textarea');
  textarea.className = 'psf-copyable-error-text';
  textarea.readOnly = true;
  textarea.spellcheck = false;
  textarea.value = text;

  const actions = document.createElement('div');
  actions.className = 'psf-copyable-error-actions';

  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.textContent = 'Copy';
  copyButton.onclick = async () => {
    const copied = await copyTextToClipboard(text);
    copyButton.textContent = copied ? 'Copied' : 'Select Text';
    setTimeout(() => { copyButton.textContent = 'Copy'; }, 1600);
  };

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = 'Close';
  closeButton.onclick = () => backdrop.remove();

  actions.appendChild(copyButton);
  actions.appendChild(closeButton);
  dialog.appendChild(heading);
  dialog.appendChild(textarea);
  dialog.appendChild(actions);
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);

  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) backdrop.remove();
  });
  backdrop.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') backdrop.remove();
  });
  textarea.focus();
  textarea.select();
}

// Load models when entering webui-select screen
async function loadModelsForInterface() {
  console.log('🔄 Loading models for interface...');
  try {
    const catalog = await window.electronAPI.getCatalog();
    const hardware = await window.electronAPI.detectHardware();
    
    console.log('📦 Catalog loaded:', catalog.version);
    console.log('🖥️ Hardware:', hardware);
    
    // Access the collections object
    const collections = catalog.collections || {};
    console.log('📚 Collections found:', Object.keys(collections).length);
    
    // Flatten all models from all collections
    allModels = [];
    Object.entries(collections).forEach(([collectionKey, collection]) => {
      console.log(`Checking collection: ${collectionKey}`);
      if (collection.models && Array.isArray(collection.models)) {
        console.log(`  - Found ${collection.models.length} models in ${collectionKey}`);
        collection.models.forEach(model => {
          allModels.push({
            ...model,
            collection: collectionKey,
            display_name: model.name || model.display_name || model.model_name || model.id,
            model_tag: model.id
          });
        });
      } else {
        console.log(`  - No models array in ${collectionKey}`);
      }
    });
    
    console.log('📋 Total models found:', allModels.length);
    
    // Filter compatible models (same logic as System Info)
    const compatibleModels = allModels.filter(model => {
      if (model.min_ram_gb && hardware.ram_gb < model.min_ram_gb) return false;
      return true;
    });
    
    // Score models (same logic as System Info)
    const scoredModels = compatibleModels.map(model => {
      let score = 0;
      const modelSizeGB = model.size_mb ? model.size_mb / 1024 : model.size_gb || 0;
      
      // Determine if this model fits in GPU VRAM (same logic as System Info)
      const fitsInVRAM = hardware.gpu_detected && modelSizeGB <= hardware.gpu_vram;
      
      if (model.recommended_ram_gb && hardware.ram_gb >= model.recommended_ram_gb) {
        score += 100;
      }
      
      if (hardware.ram_gb >= 32) {
        score += modelSizeGB * 5;
        if (modelSizeGB > 30) score += 150;
        else if (modelSizeGB > 20) score += 100;
      } else if (hardware.ram_gb >= 16) {
        score += modelSizeGB * 2;
      } else {
        score += (10 - modelSizeGB) * 2;
      }
      
      if (hardware.gpu_detected && modelSizeGB > 20) {
        score += 80;
      }
      
      if (model.collection.includes('quick-start') || model.collection.includes('daily-driver')) {
        score += 30;
      }
      
      return { ...model, score, fitsInVRAM };
    });
    
    // Separate into GPU and CPU models based on VRAM fit
    const gpuModels = scoredModels
      .filter(m => m.fitsInVRAM)
      .sort((a, b) => b.score - a.score)
      .slice(0, 15); // Top 15 GPU models
    
    const cpuModels = scoredModels
      .filter(m => !m.fitsInVRAM)
      .sort((a, b) => b.score - a.score)
      .slice(0, 15); // Top 15 CPU models
    
    // Combine for recommended list (GPU first, then CPU)
    recommendedModels = [...gpuModels, ...cpuModels];
    
    console.log('⚡ GPU models (fit in VRAM):', gpuModels.length);
    console.log('🖥️ CPU models:', cpuModels.length);
    
    console.log('⭐ Recommended models:', recommendedModels.length);
    console.log('📊 Top 3:', recommendedModels.slice(0, 3).map(m => m.display_name));
    
    // Populate dropdown with recommended models by default
    updateModelDropdown(false);
    console.log('✅ Model dropdown populated');
    
  } catch (err) {
    console.error('❌ Failed to load models:', err);
    const selector = document.getElementById('model-selector');
    if (selector) {
      selector.innerHTML = '<option value="">Error loading models</option>';
    }
  }
}

function updateModelDropdown(showAll) {
  console.log('📝 Updating dropdown, showAll:', showAll);
  const selector = document.getElementById('model-selector');
  if (!selector) {
    console.error('❌ model-selector element not found!');
    return;
  }
  
  selector.innerHTML = '<option value="">-- Select a model --</option>';
  
  if (showAll) {
    // Show all models without categories
    allModels.forEach(model => {
      const option = document.createElement('option');
      option.value = model.model_tag;
      const size = model.size || model.size_gb + 'GB' || 'Unknown size';
      option.textContent = `${model.display_name} (${size})`;
      selector.appendChild(option);
    });
  } else {
    // Show recommended models with performance categories
    const gpuModels = recommendedModels.filter(m => m.fitsInVRAM);
    const cpuModels = recommendedModels.filter(m => !m.fitsInVRAM);
    
    // Add GPU models section
    if (gpuModels.length > 0) {
      const gpuHeader = document.createElement('option');
      gpuHeader.disabled = true;
      gpuHeader.textContent = '━━━ High Performance (GPU Accelerated) ━━━';
      gpuHeader.style.fontWeight = 'bold';
      gpuHeader.style.color = '#00ff88';
      selector.appendChild(gpuHeader);
      
      gpuModels.forEach(model => {
        const option = document.createElement('option');
        option.value = model.model_tag;
        const sizeGB = model.size_mb ? (model.size_mb / 1024).toFixed(1) : model.size_gb || '?';
        option.textContent = `  ${model.display_name} (${sizeGB}GB)`;
        selector.appendChild(option);
      });
    }
    
    // Add CPU models section
    if (cpuModels.length > 0) {
      const cpuHeader = document.createElement('option');
      cpuHeader.disabled = true;
      cpuHeader.textContent = '━━━ Medium/Low Performance (CPU) ━━━';
      cpuHeader.style.fontWeight = 'bold';
      cpuHeader.style.color = '#ffd400';
      selector.appendChild(cpuHeader);
      
      cpuModels.forEach(model => {
        const option = document.createElement('option');
        option.value = model.model_tag;
        const sizeGB = model.size_mb ? (model.size_mb / 1024).toFixed(1) : model.size_gb || '?';
        option.textContent = `  ${model.display_name} (${sizeGB}GB)`;
        selector.appendChild(option);
      });
    }
  }
  
  console.log('✅ Dropdown now has', selector.options.length, 'options');
}

function toggleAllModels() {
  showingAllModels = !showingAllModels;
  updateModelDropdown(showingAllModels);
  
  const button = document.getElementById('toggle-all-models');
  const info = document.getElementById('model-filter-info');
  
  if (button && info) {
    if (showingAllModels) {
      button.textContent = 'Show Recommended';
      info.textContent = 'Showing all available models';
      info.style.color = 'var(--psf-accent, #00d4ff)';
    } else {
      button.textContent = 'Show All Models';
      info.textContent = 'Showing recommended models for your hardware';
      info.style.color = '#ffd400';
    }
  }
}

async function launchInterfaceWithModel(interfaceType) {
  const selector = document.getElementById('model-selector');
  const selectedModel = selector ? selector.value : '';
  
  if (!selectedModel) {
    alert('Please select a model first!');
    return;
  }
  
  // Store selected model for the interface to use
  localStorage.setItem('selectedModel', selectedModel);
  console.log('Selected model for interface:', selectedModel);
  
  // Find the model file path from the catalog
  try {
    const catalog = await window.electronAPI.getCatalog();
    let modelPath = null;
    let modelName = null;
    
    // Search all collections for the selected model
    for (const [collectionKey, collection] of Object.entries(catalog.collections || {})) {
      if (collection.models && Array.isArray(collection.models)) {
        const model = collection.models.find(m => m.id === selectedModel);
        if (model) {
          const filename = model.filename || model.id + '.gguf';
          modelPath = `models/${collectionKey}/${filename}`;
          modelName = model.id;
          break;
        }
      }
    }
    
    if (!modelPath) {
      await showCopyableError('Could not find model file. Please make sure the model is downloaded.', 'Model File Not Found');
      return;
    }
    
    // Load the model into Ollama first
    console.log('Loading model into Ollama:', modelPath);
    const loadResult = await window.electronAPI.launchModelInOllama(modelPath);
    
    if (!loadResult.success) {
      await showCopyableError(`Failed to load model into Ollama:\n${loadResult.message}`, 'Failed to Load Model');
      return;
    }
    
    console.log('Model loaded successfully:', loadResult.modelName);
    
  } catch (err) {
    console.error('Error preparing model:', err);
    await showCopyableError(`Error preparing model:\n${err.message}`, 'Model Prepare Error');
    return;
  }
  
  // Launch the interface
  try {
    let result;
    if (interfaceType === 'openwebui') {
      result = await window.electronAPI.launchOpenWebUI();
    } else {
      result = await window.electronAPI.launchAnythingLLM();
    }
    
    if (result.success) {
      console.log(`${interfaceType} launched successfully with model: ${selectedModel}`);
    } else {
      await showCopyableError(`Failed to launch ${interfaceType}:\n${result.message}`, 'Interface Launch Failed');
    }
  } catch (err) {
    console.error('Launch failed:', err);
    await showCopyableError(`Error launching ${interfaceType}:\n${err.message}`, 'Interface Launch Error');
  }
}

// Simple interface launcher (no model selection needed)
async function launchInterface(interfaceType) {
  try {
    let result;
    if (interfaceType === 'openwebui') {
      result = await window.electronAPI.launchOpenWebUI();
    } else if (interfaceType === 'anythingllm') {
      result = await window.electronAPI.launchAnythingLLM();
    } else {
      alert(`Unknown interface type: ${interfaceType}`);
      return;
    }
    
    if (result.success) {
      console.log(`${interfaceType} launched successfully`);
    } else {
      await showCopyableError(`Failed to launch ${interfaceType}:\n${result.message}`, 'Interface Launch Failed');
    }
  } catch (err) {
    console.error('Launch failed:', err);
    await showCopyableError(`Error launching ${interfaceType}:\n${err.message}`, 'Interface Launch Error');
  }
}

// ============================================================================
// TERMINAL MODEL SELECTION
// ============================================================================

/**
 * Populate the terminal model dropdown with installed models
 */
async function populateTerminalModels() {
  const select = document.getElementById('terminal-model-select');
  if (!select) return;
  
  try {
    const settings = window.electronAPI?.getSettings ? await window.electronAPI.getSettings() : null;
    const rawProvider = String(settings?.inference_backend || '').trim().toLowerCase();
    const useLlamaCpp = rawProvider === 'llama-cpp' || rawProvider === 'llamacpp' || rawProvider === 'llama.cpp';
    const result = useLlamaCpp && window.electronAPI?.terminalListLlamaCppModels
      ? await window.electronAPI.terminalListLlamaCppModels()
      : await window.electronAPI.getDownloadedModelsWithBlobs();
    
    if (result.success && result.models && result.models.length > 0) {
      select.innerHTML = '';
      
      for (const model of result.models) {
        const option = document.createElement('option');
        option.value = useLlamaCpp ? (model.pathAbs || model.name) : (model.ollamaName || model.name);
        option.textContent = useLlamaCpp
          ? (model.pathRel || model.filename || model.name)
          : (model.displayName || model.ollamaName || model.name);
        if (useLlamaCpp && model.pathAbs) {
          option.dataset.llamaPath = model.pathAbs;
          option.dataset.modelName = model.name || '';
        }
        select.appendChild(option);
      }
    } else {
      select.innerHTML = `<option value="">No ${useLlamaCpp ? 'GGUF' : ''} models installed</option>`;
    }
  } catch (err) {
    console.error('Failed to load models:', err);
    select.innerHTML = '<option value="">Failed to load models</option>';
  }
}

// ============================================================================
// TERMINAL LAUNCHER
// ============================================================================

/**
 * Launch terminal without a pre-selected model
 * Model selection happens inside the terminal window
 */
async function launchTerminal() {
  try {
    const launchOptions = await (async () => {
      try {
        const raw = localStorage.getItem('psf_terminal_provider_defaults');
        const parsed = raw ? JSON.parse(raw) : null;
        const settings = window.electronAPI?.getSettings ? await window.electronAPI.getSettings() : null;
        const provider = String(settings?.inference_backend || parsed?.provider || '').trim();
        if (!provider && (!parsed || typeof parsed !== 'object')) return null;
        const select = document.getElementById('terminal-model-select');
        const selected = select?.selectedOptions?.[0] || null;
        const selectedPath = String(selected?.dataset?.llamaPath || '').trim();
        const selectedName = String(selected?.dataset?.modelName || '').trim();
        return {
          provider,
          baseUrl: String(parsed?.provider_base_url || '').trim(),
          providerModel: selectedName || String(parsed?.provider_model_id || '').trim(),
          modelName: selectedName || '',
          modelPath: selectedPath || '',
          llamaCppModelPath: selectedPath || String(parsed?.llama_cpp_model_path || '').trim()
        };
      } catch (_) {
        return null;
      }
    })();

    // Launch with empty model - terminal will show model selector
    const result = await window.electronAPI.openOllamaTerminal('', 0, null, null, null, launchOptions);
    
    if (result && result.success) {
      console.log('Terminal launched successfully');
    } else {
      await showCopyableError(`Failed to launch terminal:\n${result?.message || 'Unknown error'}`, 'Failed to Launch Terminal');
    }
  } catch (err) {
    console.error('Terminal launch failed:', err);
    await showCopyableError(`Error launching terminal:\n${err.message}`, 'Terminal Launch Error');
  }
}

// Expose to global scope
window.launchTerminal = launchTerminal;

/**
 * Launch the Coding Terminal panel/window.
 */
async function launchCodingTerminal() {
  try {
    const result = await window.electronAPI.openCodingTerminal({ docked: false });
    if (!result?.success) {
      await showCopyableError(`Failed to launch coding terminal:\n${result?.message || 'Unknown error'}`, 'Failed to Launch Coding Terminal');
    }
  } catch (err) {
    console.error('Coding terminal launch failed:', err);
    await showCopyableError(`Error launching coding terminal:\n${err.message}`, 'Coding Terminal Launch Error');
  }
}

window.launchCodingTerminal = launchCodingTerminal;
// ============================================================================
