/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */

const {
  getMergedFilename: cbGetMergedFilename = (filename) => String(filename || ''),
  escapeAttr: cbEscapeAttr = (value) => String(value || ''),
  modelMatchesCatalogSearch: cbModelMatchesCatalogSearch = () => true
} = window.catalogBrowserUtils || {};

const {
  inferParametersLabel: cbInferParametersLabel = () => '',
  parseParametersToCount: cbParseParametersToCount = () => null
} = window.modelParameterUtils || {};


function renderCatalogBrowser() {
  const container = document.getElementById('model-grid');
  if (!container) return;
  
  const { catalog, editMode, viewScope, currentCollection, searchQuery } = window.catalogBrowserState;
  const draftQuery = window.catalogBrowserState.searchDraft != null
    ? String(window.catalogBrowserState.searchDraft)
    : String(searchQuery || '');
  if (!catalog) return;
  
  // Build flat model list with collection info
  const allModels = [];
  for (const [collectionKey, collection] of Object.entries(catalog.collections || {})) {
    for (const model of (collection.models || [])) {
      allModels.push({
        ...model,
        collectionKey,
        collectionName: collection.name
      });
    }
  }
  
  // Count stats
  const totalModels = allModels.length;
  const downloadedCount = Object.values(window.catalogBrowserState.downloadStatus)
    .filter(s => s.downloaded).length;
  
  container.innerHTML = `
    <div style="width: 95%; max-width: 1600px; margin: 0 auto;">
      
      <!-- Controls Bar -->
      <div style="background: var(--psf-accent-light, rgba(0,212,255,0.1)); border: 2px solid var(--psf-accent, #00d4ff); border-radius: 10px; padding: 15px; margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px;">
          
          <!-- Left: Stats -->
          <div style="color: #aaa; font-size: 13px;">
            📊 <span style="color: var(--psf-accent, #00d4ff); font-weight: bold;">${totalModels}</span> models in catalog · 
            <span style="color: #00ff88;">${downloadedCount}</span> downloaded
          </div>
          
          <!-- Center: View Toggle -->
          <div style="display: flex; border: 1px solid var(--psf-border, #0f3460); border-radius: 5px; overflow: hidden;">
            <button onclick="setCatalogBrowserScope('collection')" 
                    class="${viewScope === 'collection' ? 'cb-scope-btn-active' : 'cb-scope-btn'}"
                    style="padding: 8px 15px; border: none; cursor: pointer; transition: all 0.2s;">
              📁 By Collection
            </button>
            <button onclick="setCatalogBrowserScope('parameters')" 
                    class="${viewScope === 'parameters' ? 'cb-scope-btn-active' : 'cb-scope-btn'}"
                    title="Sort by parameter count (${window.catalogBrowserState.parameterSortDirection === 'desc' ? 'high to low' : 'low to high'}). Click again to toggle direction."
                    style="padding: 8px 15px; border: none; cursor: pointer; transition: all 0.2s;">
              🔢 By Parameters ${viewScope === 'parameters' ? (window.catalogBrowserState.parameterSortDirection === 'desc' ? '↓' : '↑') : ''}
            </button>
            <button onclick="setCatalogBrowserScope('all')" 
                    class="${viewScope === 'all' ? 'cb-scope-btn-active' : 'cb-scope-btn'}"
                    style="padding: 8px 15px; border: none; cursor: pointer; transition: all 0.2s;">
              🌐 All Models
            </button>
          </div>
          
          <!-- Right: Edit Mode Toggle -->
          <div style="display: flex; gap: 10px; align-items: center;">
            ${editMode ? `
              <span style="color: #ffd400; font-size: 12px;">✏️ Reorder Mode</span>
            ` : ''}
            <button onclick="toggleCatalogBrowserEditMode()" 
                    style="padding: 8px 15px; background: ${editMode ? 'rgba(255,212,0,0.2)' : 'rgba(255,255,255,0.1)'}; border: 1px solid ${editMode ? '#ffd400' : '#0f3460'}; border-radius: 5px; color: ${editMode ? '#ffd400' : '#888'}; cursor: pointer;">
              ${editMode ? '✓ Done' : '↕️ Reorder'}
            </button>
            <button onclick="refreshCatalogBrowser()" 
                    style="padding: 8px 15px; background: rgba(255,255,255,0.1); border: 1px solid var(--psf-border, #0f3460); border-radius: 5px; color: #888; cursor: pointer;">
              🔄 Refresh
            </button>
            <button onclick="toggleAllCatalogBrowserExpand()" 
                    title="${window.catalogBrowserState.allExpanded ? 'Collapse All' : 'Expand All'}"
                    style="padding: 8px 12px; background: rgba(255,255,255,0.1); border: 1px solid var(--psf-border, #0f3460); border-radius: 5px; color: #888; cursor: pointer; font-size: 16px;">
              ${window.catalogBrowserState.allExpanded ? '▲' : '▼'}
            </button>
          </div>
        </div>

        <!-- Model Search -->
        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--psf-accent-medium, rgba(0,212,255,0.2)); display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
          <label for="cb-model-search" style="color: #888; font-size: 12px;">🔎 Search:</label>
          <input id="cb-model-search" type="text" value="${cbEscapeAttr(draftQuery)}"
                 oninput="setCatalogBrowserSearchDraft(this.value)"
                 onkeydown="handleCatalogBrowserSearchKeydown(event)"
                 placeholder="Search by name, id, filename, collection..."
                 style="min-width: 320px; flex: 1; max-width: 640px; padding: 8px 10px; background: rgba(255,255,255,0.08); border: 1px solid var(--psf-border, #0f3460); border-radius: 5px; color: #fff;">
          <button onclick="applyCatalogBrowserSearch()"
                  style="padding: 8px 12px; background: var(--psf-accent-medium, rgba(0,212,255,0.2)); border: 1px solid var(--psf-accent, #00d4ff); border-radius: 5px; color: #9fe8ff; cursor: pointer;">
            Search
          </button>
          <button onclick="clearCatalogBrowserSearch()"
                  style="padding: 8px 12px; background: rgba(255,255,255,0.1); border: 1px solid var(--psf-border, #0f3460); border-radius: 5px; color: #aaa; cursor: pointer;">
            Clear
          </button>
        </div>
        
        ${viewScope === 'collection' ? `
          <!-- Collection Selector -->
          <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--psf-accent-medium, rgba(0,212,255,0.2));">
            <select id="cb-collection-selector" onchange="selectCatalogBrowserCollection(this.value)"
                    style="padding: 10px 15px; background: rgba(255,255,255,0.1); border: 1px solid var(--psf-border, #0f3460); border-radius: 5px; color: #fff; min-width: 250px; font-size: 14px;">
              ${Object.entries(catalog.collections || {}).map(([key, col]) => `
                <option value="${key}" ${currentCollection === key ? 'selected' : ''}>
                  ${col.name} (${col.models?.length || 0} models)
                </option>
              `).join('')}
            </select>
          </div>
        ` : ''}
      </div>
      
      <!-- Model List -->
      <div id="cb-model-list" style="display: flex; flex-direction: column; gap: 4px;">
        ${renderCatalogBrowserModels()}
      </div>
    </div>
  `;
  
  addCatalogBrowserStyles();
}

function renderCatalogBrowserModels() {
  const { catalog, viewScope, currentCollection, searchQuery } = window.catalogBrowserState;
  
  let models = [];
  
  if (viewScope === 'collection') {
    // Filter to selected collection
    const collectionKeys = Object.keys(catalog.collections || {});
    let collKey = currentCollection;
    if (!collKey || !collectionKeys.includes(collKey)) {
      collKey = collectionKeys[0] || null;
    }
    window.catalogBrowserState.currentCollection = collKey;

    const collection = collKey ? catalog.collections?.[collKey] : null;
    if (collection) {
      models = (collection.models || []).map(m => ({
        ...m,
        collectionKey: collKey,
        collectionName: collection.name
      }));
    }
  } else {
    // All models across all collections
    for (const [collectionKey, collection] of Object.entries(catalog.collections || {})) {
      for (const model of (collection.models || [])) {
        models.push({
          ...model,
          collectionKey,
          collectionName: collection.name
        });
      }
    }

    if (viewScope === 'parameters') {
      const direction = window.catalogBrowserState.parameterSortDirection === 'asc' ? 1 : -1;
      models.sort((a, b) => {
        const av = cbParseParametersToCount(a);
        const bv = cbParseParametersToCount(b);
        if (av == null && bv == null) return String(a.name || a.id || '').localeCompare(String(b.name || b.id || ''));
        if (av == null) return 1;
        if (bv == null) return -1;
        if (av === bv) return String(a.name || a.id || '').localeCompare(String(b.name || b.id || ''));
        return (av - bv) * direction;
      });
    }
  }

  if (searchQuery) {
    models = models.filter((model) => cbModelMatchesCatalogSearch(model, searchQuery));
  }
  
  if (models.length === 0) {
    return '<p style="color: #888; text-align: center; padding: 40px;">No models found.</p>';
  }
  
  return models.map((model, index) => renderCatalogBrowserRow(model, index)).join('');
}

function renderCatalogBrowserRow(model, index) {
  const { editMode, expandedModelIds, downloadStatus, selectedModels } = window.catalogBrowserState;
  const isExpanded = expandedModelIds.has(model.id);
  const isSelected = selectedModels.has(model.id);
  const status = downloadStatus[model.id] || {};
  const isDownloaded = status.downloaded || false;
  const isWrapped = status.wrapped || false;
  
  // Status indicator
  let statusIndicator = '';
  if (isDownloaded && isWrapped) {
    statusIndicator = '<span title="Downloaded & Ready" style="color: #00ff88;">●</span>';
  } else if (isDownloaded) {
    statusIndicator = '<span title="Downloaded (needs Launch)" style="color: #ffd400;">●</span>';
  } else {
    statusIndicator = '<span title="Not downloaded" style="color: #666;">○</span>';
  }
  
  const sizeGB = model.size_mb ? (model.size_mb / 1024).toFixed(1) : '?';
  
  return `
    <div class="cb-model-row ${isSelected ? 'selected' : ''}" 
         data-model-id="${model.id}"
         data-collection="${model.collectionKey}"
         data-index="${index}"
         draggable="${editMode ? 'true' : 'false'}"
         ondragstart="handleCBDragStart(event, '${model.id}', '${model.collectionKey}')"
         ondragover="handleCBDragOver(event)"
         ondragend="handleCBDragEnd(event)"
         ondrop="handleCBDrop(event, '${model.collectionKey}', ${index})"
         onclick="toggleCatalogBrowserExpand('${model.id}')"
         style="
           display: flex;
           align-items: center;
           padding: 12px 15px;
           background: ${isSelected ? 'var(--psf-accent-light, rgba(0,212,255,0.15))' : 'rgba(255,255,255,0.03)'};
           border-radius: 8px;
           cursor: ${editMode ? 'grab' : 'pointer'};
           transition: all 0.2s ease;
         ">
      
      ${editMode ? `
        <span class="cb-drag-handle" style="color: #555; margin-right: 12px; cursor: grab;">⋮⋮</span>
      ` : ''}
      
      <span style="margin-right: 12px; font-size: 16px;">${statusIndicator}</span>
      
      <div style="flex: 1; min-width: 0;">
        <div style="font-weight: 500; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${model.name}
        </div>
        <div style="font-size: 11px; color: #666; margin-top: 2px;">
          ${model.collectionName} · ${sizeGB} GB · ${cbInferParametersLabel(model) || 'Unknown params'}
        </div>
      </div>
      
      <span style="color: #555; font-size: 14px;">${isExpanded ? '▼' : '▶'}</span>
    </div>
    
    ${isExpanded ? renderCatalogBrowserExpanded(model, isDownloaded) : ''}
  `;
}

function renderCatalogBrowserExpanded(model, isDownloaded) {
  const status = window.catalogBrowserState.downloadStatus[model.id] || {};
  const filename = model.filename || model.id + '.gguf';
  const actualFilename = cbGetMergedFilename(filename);
  const projectorFilename = model.projector_filename || '';
  const ollamaModel = model.ollama_model || '';
  const sha256 = model.sha256 || '';
  const forceCpuChecked = model.force_cpu ? 'checked' : '';
  
  return `
    <div class="cb-expanded-details" style="
      background: rgba(0,0,0,0.3);
      border-radius: 0 0 8px 8px;
      padding: 15px 20px;
      margin: -4px 0 8px 0;
      border-left: 2px solid var(--psf-accent, #00d4ff);
    ">
      <!-- Model Details Grid -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; margin-bottom: 15px;">
        <div>
          <div style="color: #666; font-size: 11px; margin-bottom: 4px;">PARAMETERS</div>
          <div style="color: #fff;">${cbInferParametersLabel(model) || 'Unknown'}</div>
        </div>
        <div>
          <div style="color: #666; font-size: 11px; margin-bottom: 4px;">SIZE</div>
          <div style="color: #fff;">${model.size_mb ? (model.size_mb / 1024).toFixed(1) + ' GB' : 'Unknown'}</div>
        </div>
        <div>
          <div style="color: #666; font-size: 11px; margin-bottom: 4px;">CONTEXT LENGTH</div>
          <div style="color: #fff;">${model.context_length?.toLocaleString() || 'Unknown'}</div>
        </div>
        <div>
          <div style="color: #666; font-size: 11px; margin-bottom: 4px;">QUANTIZATION</div>
          <div style="color: #fff;">${model.quantization || 'Unknown'}</div>
        </div>
        <div>
          <div style="color: #666; font-size: 11px; margin-bottom: 4px;">MIN RAM</div>
          <div style="color: #fff;">${model.min_ram_gb ? model.min_ram_gb + ' GB' : 'Unknown'}</div>
        </div>
        <div>
          <div style="color: #666; font-size: 11px; margin-bottom: 4px;">STATUS</div>
          <div style="color: ${isDownloaded ? '#00ff88' : '#888'};">
            ${isDownloaded ? '✓ Downloaded' : '○ Not downloaded'}
            ${status.wrapped ? ' · Wrapped' : ''}
          </div>
        </div>
      </div>
      
      <!-- Filename -->
      <div style="margin-bottom: 15px;">
        <div style="color: #666; font-size: 11px; margin-bottom: 4px;">FILENAME</div>
        <div style="color: #888; font-family: monospace; font-size: 12px; word-break: break-all;">
          ${actualFilename}
        </div>
      </div>
      
      <!-- Description -->
      ${model.description ? `
        <div style="margin-bottom: 15px;">
          <div style="color: #666; font-size: 11px; margin-bottom: 4px;">DESCRIPTION</div>
          <div style="color: #aaa; font-size: 13px;">${model.description}</div>
        </div>
      ` : ''}
      
      <!-- Download Progress (hidden by default) -->
      <div id="cb-download-progress-${model.id}" style="display: none; margin-bottom: 15px;">
        <div style="background: rgba(255,255,255,0.1); border-radius: 5px; height: 20px; overflow: hidden;">
          <div id="cb-progress-bar-${model.id}" style="background: linear-gradient(90deg, var(--psf-accent, #00d4ff), #00ff88); height: 100%; width: 0%; transition: width 0.3s;"></div>
        </div>
        <div id="cb-progress-text-${model.id}" style="color: #aaa; font-size: 12px; margin-top: 5px;">Starting download...</div>
      </div>
      
      <!-- Action Buttons -->
      <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
        ${isDownloaded ? `
          <!-- Launch Button -->
          <button onclick="event.stopPropagation(); launchFromCatalogBrowser('${model.collectionKey}', '${filename}', '${projectorFilename}', '${model.id}')"
                  style="padding: 8px 16px; background: rgba(0,255,136,0.2); border: 1px solid #00ff88; border-radius: 5px; color: #00ff88; cursor: pointer;">
            🚀 Launch
          </button>
          
          <!-- Config Button -->
          <button onclick="event.stopPropagation(); openModelConfigFromBrowser('${model.id}', '${model.collectionKey}', '${filename}', '${ollamaModel}')"
                  style="padding: 8px 16px; background: rgba(233,69,96,0.2); border: 1px solid #e94560; border-radius: 5px; color: #e94560; cursor: pointer;">
            ⚙️ Config
          </button>

          <!-- Blob Mapper Button -->
          <button onclick="event.stopPropagation(); showBlobMapFromBrowser('${actualFilename}')"
                  style="padding: 8px 16px; background: rgba(111,66,193,0.2); border: 1px solid #6f42c1; border-radius: 5px; color: #c8a2ff; cursor: pointer;">
            🧬 Blob Map
          </button>

          <!-- Evaluate Button -->
          <button id="cb-eval-btn-${model.id}"
                  onclick="event.stopPropagation(); evaluateModelFromCatalogBrowser('${model.id}', '${model.name.replace(/'/g, "\\'")}')"
                  style="padding: 8px 16px; background: rgba(255,180,0,0.18); border: 1px solid #ffb400; border-radius: 5px; color: #ffd37a; cursor: pointer;">
            🧪 Evaluate
          </button>

          <label style="display:flex; align-items:center; gap:6px; color:#b7c6d8; font-size:12px; padding:6px 10px; border:1px solid #3a4a5f; border-radius:5px; background:rgba(255,255,255,0.04);">
            <input id="cb-eval-verbose-${model.id}" type="checkbox" checked onclick="event.stopPropagation();" style="cursor:pointer;">
            Verbose log
          </label>
          
          <!-- Force CPU Toggle -->
          <div style="padding: 6px 12px; background: rgba(255,193,7,0.1); border-radius: 5px; border: 1px solid #ffc107;">
            <label style="display: flex; align-items: center; cursor: pointer; font-size: 12px; color: #ffc107;">
              <input type="checkbox" id="cb-force-cpu-${model.id}" ${forceCpuChecked} 
                     onclick="event.stopPropagation();"
                     onchange="toggleForceCpuFromBrowser('${model.collectionKey}', '${model.id}', this.checked)" 
                     style="margin-right: 6px;">
              🖥️ Force CPU
            </label>
          </div>
          
          ${sha256 ? `
          <!-- Verify Checksum Button -->
          <button id="cb-verify-btn-${model.id}" 
                  onclick="event.stopPropagation(); verifyChecksumFromBrowser('${model.id}', '${model.collectionKey}', '${actualFilename}', '${sha256}')"
                  style="padding: 8px 16px; background: var(--psf-accent-medium, rgba(0,212,255,0.2)); border: 1px solid var(--psf-accent, #00d4ff); border-radius: 5px; color: var(--psf-accent, #00d4ff); cursor: pointer;">
            🔍 Verify
          </button>
          ` : ''}
          
          <!-- Delete Model File Button -->
          <button onclick="event.stopPropagation(); deleteModelFileFromBrowser('${model.id}', '${model.collectionKey}', '${filename}', '${model.name.replace(/'/g, "\\'")}')"
                  style="padding: 8px 16px; background: rgba(255,107,107,0.2); border: 1px solid #ff6b6b; border-radius: 5px; color: #ff6b6b; cursor: pointer;">
            🗑️ Delete File
          </button>
        ` : `
          <!-- Download Button -->
          <button id="cb-download-btn-${model.id}"
                  onclick="event.stopPropagation(); downloadFromCatalogBrowser('${model.id}', '${model.download_url || ''}', '${model.collectionKey}', '${filename}', '${model.projector_url || ''}', '${projectorFilename}', '${sha256}')"
                  style="padding: 8px 16px; background: rgba(0,255,136,0.2); border: 1px solid #00ff88; border-radius: 5px; color: #00ff88; cursor: pointer;">
            ⬇️ Download${model.projector_url ? ' + Projector' : ''}
          </button>
        `}
        
        <!-- View on HuggingFace -->
        <button onclick="event.stopPropagation(); openExternal('${model.url || model.download_url || ''}')"
                style="padding: 8px 16px; background: rgba(255,255,255,0.1); border: 1px solid #555; border-radius: 5px; color: #888; cursor: pointer;">
         🤗 HuggingFace
        </button>
      </div>
      
      <!-- Verification Result (hidden by default) -->
      <div id="cb-verify-result-${model.id}" style="display: none; margin-top: 10px; padding: 10px; border-radius: 5px; font-size: 12px;"></div>
      <div id="cb-eval-result-${model.id}" style="display: none; margin-top: 8px; padding: 10px; border-radius: 5px; font-size: 12px;"></div>
      <details open style="margin-top: 8px;">
        <summary style="cursor: pointer; color: #8aa5c5; font-size: 12px;">Evaluation log</summary>
        <pre id="cb-eval-log-${model.id}" style="max-height: 220px; overflow: auto; margin-top: 8px; background: #0b1220; border: 1px solid #24324d; border-radius: 6px; color: #dbe7ff; font-size: 11px; padding: 10px; white-space: pre-wrap; word-break: break-word;"></pre>
      </details>
    </div>
  `;
}

window.renderCatalogBrowser = renderCatalogBrowser;
window.renderCatalogBrowserModels = renderCatalogBrowserModels;
window.renderCatalogBrowserRow = renderCatalogBrowserRow;
window.renderCatalogBrowserExpanded = renderCatalogBrowserExpanded;
