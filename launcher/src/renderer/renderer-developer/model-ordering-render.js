/**
 * ============================================================================
 * MODEL ORDERING RENDER - Model Row Rendering
 * ============================================================================
 * 
 * Handles rendering of model rows, expanded details, and groups.
 * Uses shared state from window.modelOrderingState (moe-state.js).
 * 
 * @module model-ordering-render
 * @version 1.1.2 - March 5, 2026
 * ============================================================================
 */

// ============================================================================
// MODEL ROW RENDERING
// ============================================================================

const moInferParametersLabel = window.modelParameterUtils?.inferParametersLabel || (() => "");

/**
 * Render a single model row
 */
function renderModelRow(model, index) {
  const { selectedModels, editMode, downloadStatus, expandedModelId, groups } = window.modelOrderingState;
  const isSelected = selectedModels.has(model.id);
  const isExpanded = expandedModelId === model.id;
  const status = downloadStatus[model.id] || {};
  const isDownloaded = status.downloaded || false;
  const isWrapped = status.wrapped || false;
  
  // Check if model is in a group
  const inGroup = groups.find(g => g.modelIds.includes(model.id));
  
  // Status indicators
  let statusIndicator = '';
  if (isDownloaded && isWrapped) {
    statusIndicator = '<span title="Downloaded & Ready" style="color: #00ff88;">●</span>';
  } else if (isDownloaded) {
    statusIndicator = '<span title="Downloaded (needs Launch)" style="color: #ffd400;">◐</span>';
  } else {
    statusIndicator = '<span title="Not downloaded" style="color: #666;">○</span>';
  }
  
  const rowHtml = `
    <div class="model-ordering-row ${isSelected ? 'selected' : ''}" 
         data-model-id="${model.id}"
         data-index="${index}"
         tabindex="0"
         draggable="${editMode ? 'true' : 'false'}"
         ondragstart="handleDragStart(event, '${model.id}')"
         ondragover="handleDragOver(event)"
         ondragend="handleDragEnd(event)"
         ondrop="handleDrop(event)"
         onclick="handleRowClick(event, '${model.id}')"
         style="
           display: flex;
           align-items: center;
           padding: 12px 15px;
           background: ${isSelected ? 'var(--psf-accent-light, rgba(0,212,255,0.15))' : 'rgba(255,255,255,0.03)'};
           border-radius: 8px;
           margin-bottom: 4px;
           cursor: ${editMode ? 'grab' : 'pointer'};
           transition: all 0.2s ease;
           ${inGroup ? `border-left: 3px solid ${inGroup.color || 'var(--psf-accent, #00d4ff)'};` : ''}
         ">
      
      ${editMode ? `
        <span class="drag-handle" style="color: #555; margin-right: 12px; cursor: grab;">⠿</span>
        <input type="checkbox" 
               ${isSelected ? 'checked' : ''} 
               onclick="event.stopPropagation(); toggleModelSelection('${model.id}')"
               style="margin-right: 12px; cursor: pointer;">
      ` : ''}
      
      <span style="margin-right: 12px; font-size: 16px;">${statusIndicator}</span>
      
      <div style="flex: 1; min-width: 0;">
        <div style="font-weight: 500; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${model.name}
        </div>
        <div style="font-size: 11px; color: #666; margin-top: 2px;">
          ${model.collectionName} · ${formatSize(model.size_mb)} · ${moInferParametersLabel(model) || 'Unknown params'}
        </div>
      </div>
      
      ${inGroup ? `<span style="font-size: 11px; color: ${inGroup.color || 'var(--psf-accent, #00d4ff)'}; margin-right: 10px;">${inGroup.name}</span>` : ''}
      
      <span style="color: #555; font-size: 14px;">${isExpanded ? '▼' : '▶'}</span>
    </div>
    
    ${isExpanded ? renderExpandedDetails(model, isDownloaded) : ''}
  `;
  
  return rowHtml;
}

/**
 * Render expanded details for a model
 */
function renderExpandedDetails(model, isDownloaded) {
  const status = window.modelOrderingState.downloadStatus[model.id] || {};
  
  return `
    <div style="
      background: rgba(0,0,0,0.3);
      border-radius: 0 0 8px 8px;
      padding: 15px 20px;
      margin: -4px 0 8px 0;
      border-left: 2px solid var(--psf-accent, #00d4ff);
    ">
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 15px;">
        <div>
          <div style="color: #666; font-size: 11px; margin-bottom: 4px;">PARAMETERS</div>
          <div style="color: #fff;">${moInferParametersLabel(model) || 'Unknown'}</div>
        </div>
        <div>
          <div style="color: #666; font-size: 11px; margin-bottom: 4px;">SIZE</div>
          <div style="color: #fff;">${formatSize(model.size_mb)}</div>
        </div>
        <div>
          <div style="color: #666; font-size: 11px; margin-bottom: 4px;">CONTEXT LENGTH</div>
          <div style="color: #fff;">${model.context_length?.toLocaleString() || 'Unknown'}</div>
        </div>
        <div>
          <div style="color: #666; font-size: 11px; margin-bottom: 4px;">QUANTIZATION</div>
          <div style="color: #fff;">${model.quantization || 'Unknown'}</div>
        </div>
      </div>
      
      <div style="margin-bottom: 15px;">
        <div style="color: #666; font-size: 11px; margin-bottom: 4px;">FILENAME</div>
        <div style="color: #888; font-family: monospace; font-size: 12px; word-break: break-all;">
          ${model.filename || 'N/A'}
        </div>
      </div>
      
      ${model.description ? `
        <div style="margin-bottom: 15px;">
          <div style="color: #666; font-size: 11px; margin-bottom: 4px;">DESCRIPTION</div>
          <div style="color: #aaa; font-size: 13px;">${model.description}</div>
        </div>
      ` : ''}
      
      <!-- Progress Bar (hidden by default) -->
      <div id="moe-progress-${model.id}" style="display: none; margin-bottom: 15px;">
        <div style="background: rgba(255,255,255,0.1); border-radius: 5px; height: 20px; overflow: hidden;">
          <div id="moe-progress-bar-${model.id}" style="background: linear-gradient(90deg, var(--psf-accent, #00d4ff), #00ff88); height: 100%; width: 0%; transition: width 0.3s;"></div>
        </div>
        <div id="moe-progress-text-${model.id}" style="color: #aaa; font-size: 12px; margin-top: 5px;">Starting...</div>
      </div>
      
      <div style="display: flex; gap: 10px; flex-wrap: wrap;">
        ${isDownloaded ? `
          <button onclick="launchModelFromOrdering('${model.collectionKey}', '${model.filename}', '${model.projector_filename || ''}', '${model.id}')"
                  style="padding: 8px 16px; background: rgba(0,255,136,0.2); border: 1px solid #00ff88; border-radius: 5px; color: #00ff88; cursor: pointer;">
            🚀 Launch
          </button>
          <button onclick="openModelConfigFromOrdering('${model.id}', '${model.collectionKey}', '${model.filename}', '${model.ollama_model || ''}')"
                  style="padding: 8px 16px; background: rgba(255,212,0,0.2); border: 1px solid #ffd400; border-radius: 5px; color: #ffd400; cursor: pointer;">
            ⚙️ Config
          </button>
          <button onclick="verifyModelFromOrdering('${model.id}', '${model.collectionKey}', '${model.filename}', '${model.sha256 || ''}')"
                  style="padding: 8px 16px; background: var(--psf-accent-medium, rgba(0,212,255,0.2)); border: 1px solid var(--psf-accent, #00d4ff); border-radius: 5px; color: var(--psf-accent, #00d4ff); cursor: pointer;">
            ✓ Verify
          </button>
          <button onclick="deleteModelFromOrdering('${model.id}', '${model.collectionKey}', '${model.filename}')"
                  style="padding: 8px 16px; background: rgba(255,107,107,0.2); border: 1px solid #ff6b6b; border-radius: 5px; color: #ff6b6b; cursor: pointer;">
            🗑️ Delete
          </button>
        ` : `
          <button id="moe-download-btn-${model.id}"
                  onclick="downloadModelFromOrdering('${model.id}', '${model.download_url || ''}', '${model.collectionKey}', '${model.filename}', '${model.projector_url || ''}', '${model.projector_filename || ''}', '${model.sha256 || ''}')"
                  style="padding: 8px 16px; background: rgba(0,255,136,0.2); border: 1px solid #00ff88; border-radius: 5px; color: #00ff88; cursor: pointer;">
            ⬇️ Download
          </button>
        `}
      </div>
      
      ${isDownloaded ? `
        <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #333;">
          <div style="color: #666; font-size: 11px; margin-bottom: 4px;">OLLAMA STATUS</div>
          <div style="font-size: 12px; color: ${status.wrapped ? '#00ff88' : '#ffd400'};">
            ${status.wrapped ? '✓ Wrapped in Ollama' : '○ Not yet wrapped (Launch to wrap)'}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Render groups section
 */
function renderGroups() {
  const { groups } = window.modelOrderingState;
  
  if (groups.length === 0) return '';
  
  let html = `
    <div style="margin-bottom: 20px; padding: 15px; background: rgba(255,212,0,0.05); border: 1px solid rgba(255,212,0,0.2); border-radius: 8px;">
      <div style="color: #ffd400; font-weight: 600; margin-bottom: 10px;">Groups</div>
      <div style="display: flex; flex-wrap: wrap; gap: 10px;">
  `;
  
  for (const group of groups) {
    html += `
      <div style="display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: rgba(255,255,255,0.05); border-radius: 5px; border-left: 3px solid ${group.color || 'var(--psf-accent, #00d4ff)'};">
        <span style="color: #fff;">${group.name}</span>
        <span style="color: #666; font-size: 11px;">(${group.modelIds.length})</span>
        <button onclick="editGroup('${group.id}')" style="background: none; border: none; color: #888; cursor: pointer; padding: 2px;">✏️</button>
        <button onclick="dissolveGroup('${group.id}')" style="background: none; border: none; color: #888; cursor: pointer; padding: 2px;">✕</button>
      </div>
    `;
  }
  
  html += '</div></div>';
  return html;
}

/**
 * Format size in MB to human-readable
 */
function formatSize(mb) {
  if (!mb) return 'Unknown';
  if (mb >= 1024) {
    return (mb / 1024).toFixed(1) + ' GB';
  }
  return mb.toFixed(0) + ' MB';
}

/**
 * Toggle model expansion
 */
function toggleModelExpand(modelId) {
  if (window.modelOrderingState.expandedModelId === modelId) {
    window.modelOrderingState.expandedModelId = null;
  } else {
    window.modelOrderingState.expandedModelId = modelId;
  }
  renderModelOrdering();
}

// ============================================================================
// EXPORTS
// ============================================================================

window.renderModelRow = renderModelRow;
window.renderExpandedDetails = renderExpandedDetails;
window.renderGroups = renderGroups;
window.formatSize = formatSize;
window.toggleModelExpand = toggleModelExpand;
