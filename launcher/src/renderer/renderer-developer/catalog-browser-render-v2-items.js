/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * Catalog Browser render helpers (row/expanded)
 * Extracted from catalog-browser-render-v2.js (structural split only).
 */

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
  const primaryRuntime = Array.isArray(model.runtimes) && model.runtimes.length > 0 ? model.runtimes[0] : 'runtime?';
  const selectedProfile = String(window.catalogBrowserState.profileFilter || 'all');
  const profileBadge = selectedProfile !== 'all'
    ? modelProfileAvailability(model, selectedProfile)
    : '';
  const score = Number.isFinite(Number(model.catalog_score)) ? Number(model.catalog_score) : null;
  const rec = recommendationBadge(model);
  
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
        <div style="font-size: 10px; color: #8aa5c5; margin-top: 3px;">
          ${primaryRuntime}${profileBadge && profileBadge !== 'all' ? ` · ${selectedProfile}:${profileBadge}` : ''}${score != null ? ` · score:${score}` : ''}
        </div>
      </div>
      ${rec ? `<span style="margin-right:8px;padding:3px 7px;border:1px solid ${rec.border};border-radius:999px;color:${rec.fg};font-size:10px;">${rec.label}</span>` : ''}
      
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
  const runtimes = Array.isArray(model.runtimes) ? model.runtimes : [];
  const accelerators = Array.isArray(model.accelerators) ? model.accelerators : [];
  const activeProfile = String(window.catalogBrowserState.profileFilter || 'all');
  const profileAvailability = activeProfile !== 'all' ? modelProfileAvailability(model, activeProfile) : '';
  const score = Number.isFinite(Number(model.catalog_score)) ? Number(model.catalog_score) : null;
  const rec = recommendationBadge(model);
  const scoreSource = String(model?.psf_score?.source || 'heuristic');
  const breakdown = model?.psf_score?.breakdown || {};
  const reasons = scoreReasonBullets(model);
  
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

      <!-- Runtime Matrix -->
      <div style="margin-bottom: 15px;">
        <div style="color: #666; font-size: 11px; margin-bottom: 6px;">RUNTIME MATRIX</div>
        <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:6px;">
          ${runtimes.length ? runtimes.map((runtime) => `
            <span style="padding:4px 8px; border:1px solid #2a5d85; border-radius:999px; color:#9fd9ff; font-size:11px;">${runtime}</span>
          `).join('') : '<span style="color:#777;font-size:11px;">No runtime metadata</span>'}
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          ${accelerators.length ? accelerators.map((acc) => `
            <span style="padding:4px 8px; border:1px solid #3b4f2a; border-radius:999px; color:#bbf7a1; font-size:11px;">${acc}</span>
          `).join('') : ''}
          ${profileAvailability ? `
            <span style="padding:4px 8px; border:1px solid #4a3d14; border-radius:999px; color:#ffe08a; font-size:11px;">${activeProfile}: ${profileAvailability}</span>
          ` : ''}
          ${score != null ? `
            <span style="padding:4px 8px; border:1px solid #2a5d85; border-radius:999px; color:#9fd9ff; font-size:11px;">PSF Score: ${score}</span>
          ` : ''}
          ${rec ? `
            <span style="padding:4px 8px; border:1px solid ${rec.border}; border-radius:999px; color:${rec.fg}; font-size:11px;">${rec.label}</span>
          ` : ''}
        </div>
      </div>

      ${score != null ? `
      <!-- Score Breakdown -->
      <div style="margin-bottom: 15px;">
        <div style="color: #666; font-size: 11px; margin-bottom: 6px;">WHY THIS SCORE</div>
        <div style="color:#9fb2cc; font-size:12px; margin-bottom:8px;">
          PSF Score <strong style="color:#cce7ff;">${score}</strong> · source: <span style="color:#8ad0ff;">${scoreSource}</span>
        </div>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap:8px; margin-bottom:8px;">
          <div style="padding:6px 8px; border:1px solid #2d3e54; border-radius:6px; color:#c9d9e8; font-size:11px;">Quality: <strong>${Number.isFinite(Number(breakdown.quality)) ? Math.round(Number(breakdown.quality)) : 'n/a'}</strong></div>
          <div style="padding:6px 8px; border:1px solid #2d3e54; border-radius:6px; color:#c9d9e8; font-size:11px;">Deployability: <strong>${Number.isFinite(Number(breakdown.deployability)) ? Math.round(Number(breakdown.deployability)) : 'n/a'}</strong></div>
          <div style="padding:6px 8px; border:1px solid #2d3e54; border-radius:6px; color:#c9d9e8; font-size:11px;">Performance: <strong>${Number.isFinite(Number(breakdown.performance)) ? Math.round(Number(breakdown.performance)) : 'n/a'}</strong></div>
          <div style="padding:6px 8px; border:1px solid #2d3e54; border-radius:6px; color:#c9d9e8; font-size:11px;">Reliability: <strong>${Number.isFinite(Number(breakdown.reliability)) ? Math.round(Number(breakdown.reliability)) : 'n/a'}</strong></div>
          <div style="padding:6px 8px; border:1px solid #2d3e54; border-radius:6px; color:#c9d9e8; font-size:11px;">Utility: <strong>${Number.isFinite(Number(breakdown.utility)) ? Math.round(Number(breakdown.utility)) : 'n/a'}</strong></div>
          <div style="padding:6px 8px; border:1px solid #2d3e54; border-radius:6px; color:#c9d9e8; font-size:11px;">Discipline: <strong>${Number.isFinite(Number(breakdown.discipline)) ? Math.round(Number(breakdown.discipline)) : 'n/a'}</strong></div>
        </div>
        <div style="display:flex; flex-direction:column; gap:4px;">
          ${reasons.map((line) => `<div style="color:#8ea6c1; font-size:11px;">• ${line}</div>`).join('')}
        </div>
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

window.renderCatalogBrowserRow = renderCatalogBrowserRow;
window.renderCatalogBrowserExpanded = renderCatalogBrowserExpanded;
