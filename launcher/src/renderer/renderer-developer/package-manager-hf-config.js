/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * Package Manager HuggingFace config loaders (add/edit forms).
 */

let hfConfigFetchInFlight = false;
let hfConfigFetchEditInFlight = false;

async function fetchHuggingFaceConfig() {
  if (hfConfigFetchInFlight) return;
  hfConfigFetchInFlight = true;
  const statusDiv = document.getElementById('fetch-status');
  const modelUrl = document.getElementById('model-url')?.value || '';
  const baseUrl = document.getElementById('model-base-url')?.value || '';
  
  // Determine which URL to use
  const urlToFetch = baseUrl || modelUrl;
  
  if (!urlToFetch) {
    statusDiv.style.display = 'block';
    statusDiv.style.background = 'rgba(255,107,107,0.2)';
    statusDiv.style.color = '#ff6b6b';
    statusDiv.textContent = '❌ Please enter a HuggingFace Model Page URL or Base Model URL first.';
    return;
  }
  
  // Show loading state
  statusDiv.style.display = 'block';
  statusDiv.style.background = 'var(--psf-accent-medium, rgba(0,212,255,0.2))';
  statusDiv.style.color = 'var(--psf-accent, #00d4ff)';
  statusDiv.textContent = '🔄 Fetching config.json from HuggingFace...';
  
  try {
    const result = await window.electronAPI.fetchHuggingFaceConfig(urlToFetch);
    
    if (result.success) {
      const config = result.config;
      
      // Debug: log the config structure
      console.log('[HF Config] Raw config keys:', Object.keys(config));
      console.log('[HF Config] Has text_config:', !!config.text_config);
      if (config.text_config) {
        console.log('[HF Config] text_config keys:', Object.keys(config.text_config));
      }
      
      // Helper to get value from config or nested text_config (for VLM models)
      const getValue = (key) => {
        // Check top level first
        if (config[key] !== undefined && config[key] !== null) {
          return config[key];
        }
        // Check text_config (for VLM models)
        if (config.text_config) {
          if (config.text_config[key] !== undefined && config.text_config[key] !== null) {
            return config.text_config[key];
          }
          // Check perceiver_config for some values
          if (config.text_config.perceiver_config && config.text_config.perceiver_config[key] !== undefined) {
            return config.text_config.perceiver_config[key];
          }
        }
        return null;
      };
      
      // Extract values (check both top-level and text_config for VLM models)
      const hiddenSize = getValue('hidden_size');
      const numLayers = getValue('num_hidden_layers');
      let numKvHeads = getValue('num_key_value_heads');
      let numAttnHeads = getValue('num_attention_heads');
      const headDim = getValue('head_dim');
      const maxPosEmbed = getValue('max_position_embeddings');
      const modelType = config.model_type || (config.text_config ? config.text_config.model_type : null);
      const hasVision = !!(config.vision_config || config.image_size || (modelType && (modelType.toLowerCase().includes('vlm') || modelType.toLowerCase().includes('vision'))));
      
      // Calculate num_attention_heads if not present but we have hidden_size and head_dim
      if (!numAttnHeads && hiddenSize && headDim) {
        numAttnHeads = Math.floor(hiddenSize / headDim);
        console.log(`[HF Config] Calculated num_attention_heads: ${hiddenSize} / ${headDim} = ${numAttnHeads}`);
      }
      
      // If no KV heads specified, often equals attention heads (MHA) or is a fraction (GQA)
      if (!numKvHeads && numAttnHeads) {
        // Default assumption: MHA (KV heads = attention heads), user can adjust for GQA models
        numKvHeads = numAttnHeads;
        console.log(`[HF Config] Defaulting num_kv_heads to num_attention_heads: ${numKvHeads}`);
      }
      
      // GPU Layers = num_hidden_layers (for full GPU offload)
      const gpuLayers = numLayers;
      
      console.log('[HF Config] Extracted values:', { hiddenSize, numLayers, numKvHeads, numAttnHeads, headDim, maxPosEmbed, modelType, hasVision, gpuLayers });
      
      // Populate architecture fields
      if (hiddenSize) {
        document.getElementById('model-hidden-size').value = hiddenSize;
      }
      if (numLayers) {
        document.getElementById('model-num-layers').value = numLayers;
      }
      if (numKvHeads) {
        document.getElementById('model-num-kv-heads').value = numKvHeads;
      }
      if (numAttnHeads) {
        document.getElementById('model-num-attn-heads').value = numAttnHeads;
      }
      
      // Auto-fill GPU Layers (= num_layers for full offload)
      if (gpuLayers) {
        document.getElementById('model-gpu-layers').value = gpuLayers;
      }
      
      // Also populate context length if available
      const contextField = document.getElementById('model-context');
      if (maxPosEmbed && contextField) {
        contextField.value = maxPosEmbed;
      }
      
      // Also populate model architecture type if available
      const archField = document.getElementById('model-architecture');
      if (modelType && archField) {
        archField.value = modelType;
      }
      
      // Check for vision capability
      const visionCheckbox = document.getElementById('model-supports-vision');
      if (visionCheckbox && hasVision) {
        visionCheckbox.checked = true;
      }
      
      // NOW AUTO-CALCULATE RAM REQUIREMENTS!
      // We need size_mb from the form to calculate properly
      const sizeMbField = document.getElementById('model-size-mb');
      const sizeMb = sizeMbField ? parseInt(sizeMbField.value) : 0;
      
      if (sizeMb > 0 && hiddenSize && numLayers && numKvHeads) {
        try {
          // Build a model object for the calculator
          const modelForCalc = {
            id: document.getElementById('model-id')?.value || '',
            name: document.getElementById('model-name')?.value || '',
            filename: document.getElementById('model-filename')?.value || '',
            parameters: document.getElementById('model-parameters')?.value || '',
            quantization: document.getElementById('model-quantization')?.value || '',
            size_mb: sizeMb,
            hidden_size: hiddenSize,
            num_layers: numLayers,
            num_kv_heads: numKvHeads,
            num_attention_heads: numAttnHeads,
            context_length: maxPosEmbed || 4096,
            supports_vision: hasVision
          };
          
          console.log('[HF Config] Calculating requirements for:', modelForCalc);
          
          const reqs = await window.electronAPI.calculateModelRequirements(modelForCalc);
          console.log('[HF Config] Calculated requirements:', reqs);
          
          if (reqs) {
            // Auto-fill RAM requirements
            const minRamField = document.getElementById('model-min-ram');
            const recRamField = document.getElementById('model-rec-ram');
            
            if (minRamField && reqs.min_ram_gb) {
              minRamField.value = Math.ceil(reqs.min_ram_gb);
            }
            if (recRamField && reqs.recommended_ram_gb) {
              recRamField.value = Math.ceil(reqs.recommended_ram_gb);
            }
          }
        } catch (calcErr) {
          console.error('[HF Config] Error calculating requirements:', calcErr);
        }
      } else {
        console.log('[HF Config] Skipping RAM calculation - need size_mb, hidden_size, num_layers, num_kv_heads');
      }
      
      statusDiv.style.background = 'rgba(0,255,136,0.2)';
      statusDiv.style.color = '#00ff88';
      const ramNote = sizeMb > 0 ? ' + RAM auto-calculated!' : ' (enter Size MB to auto-calc RAM)';
      statusDiv.textContent = `✅ Fetched! Hidden: ${hiddenSize || 'N/A'}, Layers: ${numLayers || 'N/A'}, KV: ${numKvHeads || 'N/A'}, Attn: ${numAttnHeads || 'N/A'}${ramNote}`;
    } else {
      statusDiv.style.background = 'rgba(255,107,107,0.2)';
      statusDiv.style.color = '#ff6b6b';
      statusDiv.textContent = `❌ ${result.error}`;
    }
  } catch (err) {
    statusDiv.style.background = 'rgba(255,107,107,0.2)';
    statusDiv.style.color = '#ff6b6b';
    statusDiv.textContent = `❌ Error: ${err.message}`;
  } finally {
    hfConfigFetchInFlight = false;
  }
}

async function fetchHuggingFaceConfigEdit() {
  if (hfConfigFetchEditInFlight) return;
  hfConfigFetchEditInFlight = true;
  const statusDiv = document.getElementById('edit-fetch-status');
  const modelUrl = document.getElementById('edit-model-url')?.value || '';
  const baseUrl = document.getElementById('edit-model-base-url')?.value || '';
  
  // Determine which URL to use
  const urlToFetch = baseUrl || modelUrl;
  
  if (!urlToFetch) {
    statusDiv.style.display = 'block';
    statusDiv.style.background = 'rgba(255,107,107,0.2)';
    statusDiv.style.color = '#ff6b6b';
    statusDiv.textContent = '❌ Please enter a HuggingFace Model Page URL or Base Model URL first.';
    return;
  }
  
  // Show loading state
  statusDiv.style.display = 'block';
  statusDiv.style.background = 'var(--psf-accent-medium, rgba(0,212,255,0.2))';
  statusDiv.style.color = 'var(--psf-accent, #00d4ff)';
  statusDiv.textContent = '🔄 Fetching config.json from HuggingFace...';
  
  try {
    const result = await window.electronAPI.fetchHuggingFaceConfig(urlToFetch);
    
    if (result.success) {
      const config = result.config;
      
      // Helper to get value from config or nested text_config (for VLM models)
      const getValue = (key) => {
        if (config[key] !== undefined && config[key] !== null) return config[key];
        if (config.text_config) {
          if (config.text_config[key] !== undefined && config.text_config[key] !== null) return config.text_config[key];
          if (config.text_config.perceiver_config && config.text_config.perceiver_config[key] !== undefined) {
            return config.text_config.perceiver_config[key];
          }
        }
        return null;
      };
      
      // Extract values
      const hiddenSize = getValue('hidden_size');
      const numLayers = getValue('num_hidden_layers');
      let numKvHeads = getValue('num_key_value_heads');
      let numAttnHeads = getValue('num_attention_heads');
      const headDim = getValue('head_dim');
      const maxPosEmbed = getValue('max_position_embeddings');
      const modelType = config.model_type || (config.text_config ? config.text_config.model_type : null);
      const hasVision = !!(config.vision_config || config.image_size || (modelType && (modelType.toLowerCase().includes('vlm') || modelType.toLowerCase().includes('vision'))));
      
      // Calculate num_attention_heads if not present
      if (!numAttnHeads && hiddenSize && headDim) {
        numAttnHeads = Math.floor(hiddenSize / headDim);
      }
      
      // Default KV heads to attention heads if not specified
      if (!numKvHeads && numAttnHeads) {
        numKvHeads = numAttnHeads;
      }
      
      // GPU Layers = num_hidden_layers
      const gpuLayers = numLayers;
      
      // Populate architecture fields
      if (hiddenSize) document.getElementById('edit-model-hidden-size').value = hiddenSize;
      if (numLayers) document.getElementById('edit-model-num-layers').value = numLayers;
      if (numKvHeads) document.getElementById('edit-model-num-kv-heads').value = numKvHeads;
      if (numAttnHeads) document.getElementById('edit-model-num-attn-heads').value = numAttnHeads;
      if (gpuLayers) document.getElementById('edit-model-gpu-layers').value = gpuLayers;
      if (maxPosEmbed) document.getElementById('edit-model-context').value = maxPosEmbed;
      if (modelType) document.getElementById('edit-model-architecture').value = modelType;
      if (hasVision) document.getElementById('edit-model-supports-vision').checked = true;
      
      // Auto-calculate RAM requirements
      const sizeMbField = document.getElementById('edit-model-size-mb');
      const sizeMb = sizeMbField ? parseInt(sizeMbField.value) : 0;
      
      if (sizeMb > 0 && hiddenSize && numLayers && numKvHeads) {
        try {
          const modelForCalc = {
            id: document.getElementById('edit-model-id')?.value || '',
            name: document.getElementById('edit-model-name')?.value || '',
            filename: document.getElementById('edit-model-filename')?.value || '',
            parameters: document.getElementById('edit-model-parameters')?.value || '',
            quantization: document.getElementById('edit-model-quantization')?.value || '',
            size_mb: sizeMb,
            hidden_size: hiddenSize,
            num_layers: numLayers,
            num_kv_heads: numKvHeads,
            num_attention_heads: numAttnHeads,
            context_length: maxPosEmbed || 4096,
            supports_vision: hasVision
          };
          
          const reqs = await window.electronAPI.calculateModelRequirements(modelForCalc);
          
          if (reqs) {
            const minRamField = document.getElementById('edit-model-min-ram');
            const recRamField = document.getElementById('edit-model-rec-ram');
            if (minRamField && reqs.min_ram_gb) minRamField.value = Math.ceil(reqs.min_ram_gb);
            if (recRamField && reqs.recommended_ram_gb) recRamField.value = Math.ceil(reqs.recommended_ram_gb);
          }
        } catch (calcErr) {
          console.error('[HF Config Edit] Error calculating requirements:', calcErr);
        }
      }
      
      statusDiv.style.background = 'rgba(0,255,136,0.2)';
      statusDiv.style.color = '#00ff88';
      const ramNote = sizeMb > 0 ? ' + RAM auto-calculated!' : ' (enter Size MB to auto-calc RAM)';
      statusDiv.textContent = `✅ Fetched! Hidden: ${hiddenSize || 'N/A'}, Layers: ${numLayers || 'N/A'}, KV: ${numKvHeads || 'N/A'}, Attn: ${numAttnHeads || 'N/A'}${ramNote}`;
    } else {
      statusDiv.style.background = 'rgba(255,107,107,0.2)';
      statusDiv.style.color = '#ff6b6b';
      statusDiv.textContent = `❌ ${result.error}`;
    }
  } catch (err) {
    statusDiv.style.background = 'rgba(255,107,107,0.2)';
    statusDiv.style.color = '#ff6b6b';
    statusDiv.textContent = `❌ Error: ${err.message}`;
  } finally {
    hfConfigFetchEditInFlight = false;
  }
}
