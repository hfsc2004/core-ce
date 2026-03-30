/**
 * MODEL CONFIGURATION (MODELFILE EDITION)
 * Per-model configuration using Ollama's native Modelfile format.
 * @module model-config
 * @version 1.1.3 - March 5, 2026
 */

const DEFAULT_PARAMS = {
  temperature: 0.8, top_p: 0.9, top_k: 40, repeat_penalty: 1.1,
  num_ctx: 2048, num_predict: -1, seed: 0
};

let currentConfigModel = null;
let fetchedConfig = null;

function getConfigModalHTML() {
  return `
    <div id="model-config-modal" class="config-modal-overlay" style="display: none;">
      <div class="config-modal">
        <div class="config-modal-header">
          <h2>&#9881; Model Configuration</h2>
          <span id="config-model-name" style="color: #888; font-size: 14px;"></span>
          <button id="config-close-btn" class="config-close-btn">&#10005;</button>
        </div>
        <div class="config-modal-body">
          <div id="config-source" style="margin-bottom: 15px; padding: 10px; background: rgba(0,212,255,0.1); border-radius: 6px; font-size: 12px; color: #888;">Loading...</div>
          <div class="config-section">
            <label>System Prompt</label>
            <textarea id="config-system" rows="4" placeholder="You are a helpful assistant..."></textarea>
          </div>
          <div class="config-section">
            <label>Temperature: <span id="val-temperature">0.8</span></label>
            <input type="range" id="param-temperature" min="0" max="2" step="0.1" value="0.8" />
            <span style="font-size: 11px; color: #666;">Creativity level (lower = focused, higher = creative)</span>
          </div>
          <div class="config-section">
            <label>Top-P: <span id="val-top_p">0.9</span></label>
            <input type="range" id="param-top_p" min="0" max="1" step="0.05" value="0.9" />
            <span style="font-size: 11px; color: #666;">Response variety (lower = focused, higher = diverse)</span>
          </div>
          <div class="config-section">
            <label>Top-K: <span id="val-top_k">40</span></label>
            <input type="range" id="param-top_k" min="1" max="100" step="1" value="40" />
            <span style="font-size: 11px; color: #666;">Limits vocabulary choices (lower = more focused)</span>
          </div>
          <div class="config-section">
            <label>Repeat Penalty: <span id="val-repeat_penalty">1.1</span></label>
            <input type="range" id="param-repeat_penalty" min="0.5" max="2.0" step="0.05" value="1.1" />
            <span style="font-size: 11px; color: #666;">Penalizes repetition (1.0 = off, higher = less repetition)</span>
          </div>
          <div class="config-section">
            <label>Context Length</label>
            <select id="param-num_ctx">
              <option value="2048">2K</option><option value="4096">4K</option><option value="8192">8K</option>
              <option value="16384">16K</option><option value="32768">32K</option><option value="65536">64K</option>
            </select>
            <span style="font-size: 11px; color: #666;">Memory window size (higher = more context, uses more VRAM)</span>
          </div>
          <div class="config-section">
            <label>Max Tokens (num_predict)</label>
            <select id="param-num_predict">
              <option value="-1">Unlimited (-1)</option>
              <option value="128">128</option><option value="256">256</option><option value="512">512</option>
              <option value="1024">1K</option><option value="2048">2K</option><option value="4096">4K</option>
            </select>
            <span style="font-size: 11px; color: #666;">Maximum tokens to generate per response</span>
          </div>
          <div class="config-section">
            <label>Seed</label>
            <input type="number" id="param-seed" min="0" value="0" placeholder="0 = random" />
            <span style="font-size: 11px; color: #666;">0 = random, set value for reproducible outputs</span>
          </div>
          <div class="config-section">
            <label>Stop Sequences</label>
            <input type="text" id="config-stop" placeholder="Comma-separated" />
            <span style="font-size: 11px; color: #666;">Text patterns that stop generation (e.g., User:, ###)</span>
          </div>
          <details class="config-advanced">
            <summary>Advanced: Raw Modelfile</summary>
            <textarea id="config-modelfile-raw" rows="10" style="font-family: monospace; font-size: 12px; width: 100%;"></textarea>
          </details>
        </div>
        <div class="config-modal-footer">
          <button id="config-fetch-btn" class="config-btn config-btn-secondary">&#8635; Fetch from Ollama</button>
          <button id="config-reset-btn" class="config-btn config-btn-secondary">&#8634; Reset</button>
          <button id="config-save-btn" class="config-btn config-btn-primary">&#128190; Save Modelfile</button>
        </div>
      </div>
    </div>`;
}

function getConfigModalCSS() {
  return `<style id="model-config-styles">
    .config-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: flex-start; overflow-y: auto; padding: 12px; z-index: 10000; }
    .config-modal { background: #1a1a2e; border: 1px solid var(--psf-border, #0f3460); border-radius: 12px; width: min(600px, calc(100vw - 24px)); max-height: calc(100vh - 24px); overflow: hidden; display: flex; flex-direction: column; position: absolute; left: 50%; top: 12px; transform: translateX(-50%); }
    .config-modal-header { padding: 20px; border-bottom: 1px solid var(--psf-border, #0f3460); display: flex; align-items: center; gap: 15px; cursor: move; user-select: none; }
    .config-modal-header h2 { margin: 0; color: #fff; flex-grow: 1; }
    .config-close-btn { background: transparent; border: none; color: #888; font-size: 24px; cursor: pointer; }
    .config-modal-body { padding: 20px; overflow-y: auto; flex-grow: 1; }
    .config-section { margin-bottom: 15px; }
    .config-section label { display: block; color: #fff; margin-bottom: 5px; }
    .config-section input, .config-section textarea, .config-section select { width: 100%; padding: 10px; background: rgba(255,255,255,0.05); border: 1px solid var(--psf-border, #0f3460); border-radius: 6px; color: #fff; box-sizing: border-box; }
    .config-section input[type="range"] { padding: 0; }
    .config-advanced { margin-top: 15px; padding: 10px; background: rgba(255,255,255,0.02); border: 1px solid var(--psf-border, #0f3460); border-radius: 8px; }
    .config-advanced summary { color: #888; cursor: pointer; }
    .config-modal-footer { padding: 15px 20px; border-top: 1px solid var(--psf-border, #0f3460); display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; }
    .config-btn { padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer; }
    .config-btn-primary { background: #e94560; color: #fff; }
    .config-btn-secondary { background: rgba(255,255,255,0.1); color: #fff; }
    @media (max-height: 760px) {
      .config-modal-header { padding: 14px; }
      .config-modal-body { padding: 14px; }
      .config-modal-footer { padding: 12px 14px; }
    }
  </style>`;
}

function initConfigModal() {
  if (document.getElementById('model-config-modal')) return;
  document.head.insertAdjacentHTML('beforeend', getConfigModalCSS());
  document.body.insertAdjacentHTML('beforeend', getConfigModalHTML());
  
  document.getElementById('config-close-btn').addEventListener('click', closeConfigModal);
  document.getElementById('model-config-modal').addEventListener('click', (e) => {
    if (e.target.id === 'model-config-modal') closeConfigModal();
  });
  document.getElementById('config-save-btn').addEventListener('click', saveModelfile);
  document.getElementById('config-reset-btn').addEventListener('click', resetToDefaults);
  document.getElementById('config-fetch-btn').addEventListener('click', fetchFromRegistry);
  
  ['temperature', 'top_p', 'top_k', 'repeat_penalty'].forEach(param => {
    const input = document.getElementById(`param-${param}`);
    const display = document.getElementById(`val-${param}`);
    if (input && display) {
      input.addEventListener('input', () => { display.textContent = input.value; updateRawModelfile(); });
    }
  });
  
  document.getElementById('config-system').addEventListener('input', updateRawModelfile);
  document.getElementById('param-num_predict').addEventListener('change', updateRawModelfile);
  document.getElementById('param-seed').addEventListener('input', updateRawModelfile);
  document.getElementById('param-num_ctx').addEventListener('change', updateRawModelfile);
  
  // Make modal draggable
  initDraggable();
}

function initDraggable() {
  const modal = document.querySelector('.config-modal');
  const header = document.querySelector('.config-modal-header');
  let isDragging = false;
  let offsetX = 0, offsetY = 0;
  
  header.addEventListener('mousedown', (e) => {
    if (e.target.closest('.config-close-btn')) return;
    isDragging = true;
    const rect = modal.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    modal.style.transition = 'none';
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const nextX = e.clientX - offsetX;
    const nextY = e.clientY - offsetY;
    const modalRect = modal.getBoundingClientRect();
    const maxX = Math.max(8, window.innerWidth - modalRect.width - 8);
    const maxY = Math.max(8, window.innerHeight - modalRect.height - 8);
    const x = Math.min(Math.max(8, nextX), maxX);
    const y = Math.min(Math.max(8, nextY), maxY);
    modal.style.left = `${x}px`;
    modal.style.top = `${y}px`;
    modal.style.transform = 'none';
  });
  
  document.addEventListener('mouseup', () => {
    isDragging = false;
    if (modal) modal.style.transition = '';
  });
}

async function openConfigModal(modelId, collection, filename, ollamaModel) {
  initConfigModal();
  currentConfigModel = { modelId, collection, filename, ollamaModel };
  document.getElementById('config-model-name').textContent = filename || modelId;
  
  // Reset position to center
  const modal = document.querySelector('.config-modal');
  if (modal) {
    modal.style.left = '50%';
    const shouldCenter = window.innerHeight >= 760;
    if (shouldCenter) {
      modal.style.top = '50%';
      modal.style.transform = 'translate(-50%, -50%)';
    } else {
      modal.style.top = '12px';
      modal.style.transform = 'translateX(-50%)';
    }
  }
  
  const sourceDiv = document.getElementById('config-source');
  sourceDiv.innerHTML = 'Loading...';
  document.getElementById('model-config-modal').style.display = 'flex';
  
  try {
    const existingResult = await window.electronAPI.loadModelfile(collection, modelId);
    if (existingResult.success && existingResult.modelfile) {
      fetchedConfig = existingResult.cachedConfig || null;
      document.getElementById('config-modelfile-raw').value = existingResult.modelfile;
      parseAndPopulateForm(existingResult.modelfile);
      sourceDiv.innerHTML = '&#9989; Loaded from saved Modelfile';
      sourceDiv.style.background = 'rgba(0,255,136,0.1)';
    } else if (ollamaModel) {
      sourceDiv.innerHTML = 'Fetching from Ollama registry...';
      const fetchResult = await window.electronAPI.fetchOllamaConfig(ollamaModel, collection, modelId);
      if (fetchResult.success) {
        fetchedConfig = fetchResult.config;
        populateFormFromConfig(fetchResult.config);
        updateRawModelfile();
        sourceDiv.innerHTML = '&#9989; Fetched from Ollama registry';
        sourceDiv.style.background = 'rgba(0,212,255,0.1)';
      } else {
        throw new Error(fetchResult.message);
      }
    } else {
      resetToDefaults();
      sourceDiv.innerHTML = '&#9888; No Ollama mapping - using defaults';
      sourceDiv.style.background = 'rgba(255,200,0,0.1)';
    }
  } catch (err) {
    resetToDefaults();
    sourceDiv.innerHTML = '&#10060; Error: ' + err.message;
    sourceDiv.style.background = 'rgba(255,100,100,0.1)';
  }
}

function closeConfigModal() {
  document.getElementById('model-config-modal').style.display = 'none';
  currentConfigModel = null;
  fetchedConfig = null;
}

function populateFormFromConfig(config) {
  document.getElementById('config-system').value = config.system || '';
  const params = config.params || {};
  document.getElementById('param-temperature').value = params.temperature || DEFAULT_PARAMS.temperature;
  document.getElementById('val-temperature').textContent = params.temperature || DEFAULT_PARAMS.temperature;
  document.getElementById('param-top_p').value = params.top_p || DEFAULT_PARAMS.top_p;
  document.getElementById('val-top_p').textContent = params.top_p || DEFAULT_PARAMS.top_p;
  document.getElementById('param-top_k').value = params.top_k || DEFAULT_PARAMS.top_k;
  document.getElementById('val-top_k').textContent = params.top_k || DEFAULT_PARAMS.top_k;
  document.getElementById('param-repeat_penalty').value = params.repeat_penalty || DEFAULT_PARAMS.repeat_penalty;
  document.getElementById('val-repeat_penalty').textContent = params.repeat_penalty || DEFAULT_PARAMS.repeat_penalty;
  document.getElementById('param-num_ctx').value = params.num_ctx || DEFAULT_PARAMS.num_ctx;
  document.getElementById('param-num_predict').value = params.num_predict !== undefined ? params.num_predict : DEFAULT_PARAMS.num_predict;
  document.getElementById('param-seed').value = params.seed || DEFAULT_PARAMS.seed;
  const stops = params.stop;
  document.getElementById('config-stop').value = stops ? (Array.isArray(stops) ? stops.join(', ') : stops) : '';
}

function parseAndPopulateForm(modelfile) {
  const systemMatch = modelfile.match(/SYSTEM\s+"""([\s\S]*?)"""/i);
  document.getElementById('config-system').value = systemMatch ? systemMatch[1].trim() : '';
  
  const tempMatch = modelfile.match(/PARAMETER\s+temperature\s+(\S+)/i);
  if (tempMatch) {
    document.getElementById('param-temperature').value = tempMatch[1];
    document.getElementById('val-temperature').textContent = tempMatch[1];
  }
  
  const topPMatch = modelfile.match(/PARAMETER\s+top_p\s+(\S+)/i);
  if (topPMatch) {
    document.getElementById('param-top_p').value = topPMatch[1];
    document.getElementById('val-top_p').textContent = topPMatch[1];
  }
  
  const topKMatch = modelfile.match(/PARAMETER\s+top_k\s+(\S+)/i);
  if (topKMatch) {
    document.getElementById('param-top_k').value = topKMatch[1];
    document.getElementById('val-top_k').textContent = topKMatch[1];
  }
  
  const repeatMatch = modelfile.match(/PARAMETER\s+repeat_penalty\s+(\S+)/i);
  if (repeatMatch) {
    document.getElementById('param-repeat_penalty').value = repeatMatch[1];
    document.getElementById('val-repeat_penalty').textContent = repeatMatch[1];
  }
  
  const ctxMatch = modelfile.match(/PARAMETER\s+num_ctx\s+(\S+)/i);
  if (ctxMatch) document.getElementById('param-num_ctx').value = ctxMatch[1];
  
  const predictMatch = modelfile.match(/PARAMETER\s+num_predict\s+(\S+)/i);
  if (predictMatch) document.getElementById('param-num_predict').value = predictMatch[1];
  
  const seedMatch = modelfile.match(/PARAMETER\s+seed\s+(\S+)/i);
  if (seedMatch) document.getElementById('param-seed').value = seedMatch[1];
}

function buildModelfileFromForm() {
  const lines = ['# Modelfile generated by Pseudo Science Fiction Archive', '', 'FROM ./model.gguf', ''];
  
  if (fetchedConfig && fetchedConfig.template) {
    lines.push(`TEMPLATE """${fetchedConfig.template}"""`, '');
  }
  
  const system = document.getElementById('config-system').value.trim();
  if (system) lines.push(`SYSTEM """${system}"""`, '');
  
  lines.push(`PARAMETER temperature ${document.getElementById('param-temperature').value}`);
  lines.push(`PARAMETER top_p ${document.getElementById('param-top_p').value}`);
  lines.push(`PARAMETER top_k ${document.getElementById('param-top_k').value}`);
  lines.push(`PARAMETER repeat_penalty ${document.getElementById('param-repeat_penalty').value}`);
  lines.push(`PARAMETER num_ctx ${document.getElementById('param-num_ctx').value}`);
  lines.push(`PARAMETER num_predict ${document.getElementById('param-num_predict').value}`);
  
  const seed = document.getElementById('param-seed').value;
  if (seed && seed !== '0') {
    lines.push(`PARAMETER seed ${seed}`);
  }
  
  const stopInput = document.getElementById('config-stop').value.trim();
  if (stopInput) {
    stopInput.split(',').map(s => s.trim()).filter(s => s).forEach(s => {
      lines.push(`PARAMETER stop "${s}"`);
    });
  } else if (fetchedConfig && fetchedConfig.params && fetchedConfig.params.stop) {
    const stops = Array.isArray(fetchedConfig.params.stop) ? fetchedConfig.params.stop : [fetchedConfig.params.stop];
    stops.forEach(s => lines.push(`PARAMETER stop "${s}"`));
  }
  
  return lines.join('\n');
}

function updateRawModelfile() {
  document.getElementById('config-modelfile-raw').value = buildModelfileFromForm();
}

async function saveModelfile() {
  if (!currentConfigModel) return;
  const modelfileContent = document.getElementById('config-modelfile-raw').value || buildModelfileFromForm();
  
  try {
    const result = await window.electronAPI.saveModelfile(
      currentConfigModel.collection, currentConfigModel.modelId, modelfileContent, fetchedConfig
    );
    
    if (result.success) {
      const btn = document.getElementById('config-save-btn');
      btn.textContent = 'Saved!';
      btn.style.background = '#00ff88';
      
      const configBtn = document.getElementById(`config-btn-${currentConfigModel.modelId}`);
      if (configBtn) {
        configBtn.innerHTML = '&#9881; Configure <span style="color: #00ff88;">&#9679;</span>';
      }
      
      setTimeout(() => {
        btn.innerHTML = '&#128190; Save Modelfile';
        btn.style.background = '';
        closeConfigModal();
      }, 1000);
    } else {
      alert('Failed to save: ' + result.message);
    }
  } catch (err) {
    alert('Error saving: ' + err.message);
  }
}

function resetToDefaults() {
  document.getElementById('config-system').value = '';
  document.getElementById('param-temperature').value = DEFAULT_PARAMS.temperature;
  document.getElementById('val-temperature').textContent = DEFAULT_PARAMS.temperature;
  document.getElementById('param-top_p').value = DEFAULT_PARAMS.top_p;
  document.getElementById('val-top_p').textContent = DEFAULT_PARAMS.top_p;
  document.getElementById('param-top_k').value = DEFAULT_PARAMS.top_k;
  document.getElementById('val-top_k').textContent = DEFAULT_PARAMS.top_k;
  document.getElementById('param-repeat_penalty').value = DEFAULT_PARAMS.repeat_penalty;
  document.getElementById('val-repeat_penalty').textContent = DEFAULT_PARAMS.repeat_penalty;
  document.getElementById('param-num_ctx').value = DEFAULT_PARAMS.num_ctx;
  document.getElementById('param-num_predict').value = DEFAULT_PARAMS.num_predict;
  document.getElementById('param-seed').value = DEFAULT_PARAMS.seed;
  document.getElementById('config-stop').value = '';
  updateRawModelfile();
}

async function fetchFromRegistry() {
  if (!currentConfigModel || !currentConfigModel.ollamaModel) {
    alert('No Ollama model mapping configured.');
    return;
  }
  
  const sourceDiv = document.getElementById('config-source');
  sourceDiv.innerHTML = 'Fetching...';
  
  try {
    const result = await window.electronAPI.fetchOllamaConfig(
      currentConfigModel.ollamaModel, currentConfigModel.collection, currentConfigModel.modelId
    );
    if (result.success) {
      fetchedConfig = result.config;
      populateFormFromConfig(result.config);
      updateRawModelfile();
      sourceDiv.innerHTML = '&#9989; Refreshed from Ollama registry';
      sourceDiv.style.background = 'rgba(0,212,255,0.1)';
    } else {
      throw new Error(result.message);
    }
  } catch (err) {
    sourceDiv.innerHTML = '&#10060; ' + err.message;
    sourceDiv.style.background = 'rgba(255,100,100,0.1)';
  }
}

window.ModelConfig = { open: openConfigModal, close: closeConfigModal, DEFAULT_PARAMS };
console.log('[Model Config] Module loaded');
