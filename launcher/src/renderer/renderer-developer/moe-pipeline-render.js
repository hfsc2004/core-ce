/**
 * ============================================================================
 * MOE PIPELINE RENDER - Pipeline UI Rendering
 * ============================================================================
 * 
 * Renders the MoE pipeline interface including agents, channels, gateways,
 * and the chat interface.
 * 
 * THEME INTEGRATION: Uses global CSS theme variables for colors
 * 
 * @module moe-pipeline-render
 * @version 1.1.3 - March 5, 2026
 * ============================================================================
 */

// ============================================================================
// THEME HELPER
// ============================================================================

/**
 * Get current MoE theme colors (with fallbacks)
 * @returns {Object} Theme color object
 */
function getMoeTheme() {
  const styles = getComputedStyle(document.documentElement);
  const readVar = (name, fallback) => String(styles.getPropertyValue(name) || '').trim() || fallback;
  return {
    accent: readVar('--psf-accent', '#00d4ff'),
    accentLight: readVar('--psf-accent-light', 'rgba(0,212,255,0.1)'),
    accentMedium: readVar('--psf-accent-medium', 'rgba(0,212,255,0.2)'),
    accentDark: readVar('--psf-accent-dark', '#0099cc'),
    success: readVar('--psf-success', '#00ff88'),
    warning: readVar('--psf-warning', '#ffd400'),
    error: readVar('--psf-error', '#ff6b6b')
  };
}

function escapeMoeLogHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ============================================================================
// MODEL HELPERS
// ============================================================================

/**
 * Get downloaded models (provider-specific readiness is resolved in agent renderer)
 * @returns {Array} Array of downloaded model objects
 */
function getDownloadedModels() {
  const { catalog, downloadStatus } = window.modelOrderingState;
  const downloaded = [];
  
  for (const [collKey, collection] of Object.entries(catalog?.collections || {})) {
    for (const model of collection.models || []) {
      const status = downloadStatus[model.id];
      if (status?.downloaded) {
        downloaded.push({
          id: model.id,
          name: model.name,
          collectionKey: collKey,
          filename: model.filename,
          projectorFilename: model.projector_filename || null,
          runtimes: Array.isArray(model.runtimes) ? model.runtimes : [],
          ollamaModel: String(model.ollama_model || '').trim(),
          isDownloaded: true,
          isWrapped: Boolean(status?.wrapped),
          isReady: Boolean(status?.wrapped)
        });
      }
    }
  }
  return downloaded;
}

/**
 * Get all models from catalog (for "Show All" view)
 * @returns {Array} Array of all model objects with download/wrap status
 */
function getAllModelsForDropdown() {
  const { catalog, downloadStatus } = window.modelOrderingState;
  const models = [];
  
  for (const [collKey, collection] of Object.entries(catalog?.collections || {})) {
    for (const model of collection.models || []) {
      const status = downloadStatus[model.id] || {};
      const isDownloaded = status.downloaded || false;
      const isWrapped = status.wrapped || false;
      
      models.push({
        id: model.id,
        name: model.name,
        collectionKey: collKey,
        filename: model.filename,
        projectorFilename: model.projector_filename || null,
        runtimes: Array.isArray(model.runtimes) ? model.runtimes : [],
        ollamaModel: String(model.ollama_model || '').trim(),
        isDownloaded,
        isWrapped,
        // Ready for MoE = downloaded AND wrapped
        isReady: isDownloaded && isWrapped
      });
    }
  }
  return models;
}

// ============================================================================
// MAIN PIPELINE RENDER
// ============================================================================

/**
 * Render the MoE pipeline view
 * @returns {string} HTML string
 */
function renderMoePipeline() {
  const { moeItems, showAllModels } = window.modelOrderingState;
  const downloadedModels = getDownloadedModels();
  const allModels = showAllModels ? getAllModelsForDropdown() : null;
  const modelsForDropdown = showAllModels ? allModels : downloadedModels;
  const theme = getMoeTheme();
  const deploySummary = String(window.modelOrderingState?.moeDeployStatusSummary || 'IDLE').trim() || 'IDLE';
  const deployLogs = Array.isArray(window.modelOrderingState?.moeDeployLogLines)
    ? window.modelOrderingState.moeDeployLogLines
    : [];
  const deployDirty = window.modelOrderingState?.moePostDeployDirty === true;
  const deployFrameState = String(window.modelOrderingState?.moeDeployFrameState || 'idle').toLowerCase();
  const graphMode = window.modelOrderingState?.moeGraphMode === true;
  const graphZoomRaw = Number(window.modelOrderingState?.moeGraphZoom);
  const graphZoom = Number.isFinite(graphZoomRaw) ? Math.max(0.45, Math.min(3.0, graphZoomRaw)) : 0.7;
  const graphZoomPct = Math.round(graphZoom * 100);
  const graphFullscreen = graphMode && window.modelOrderingState?.moeGraphFullscreen === true;
  const frameBorderColor = deployFrameState === 'active'
    ? '#22c55e'
    : (deployFrameState === 'stopping' || deployFrameState === 'error' ? '#ef4444' : '#6b7280');
  const frameShadow = deployFrameState === 'active'
    ? '0 0 0 1px rgba(34,197,94,0.55), 0 0 18px rgba(34,197,94,0.28)'
    : (deployFrameState === 'stopping' || deployFrameState === 'error'
      ? '0 0 0 1px rgba(239,68,68,0.55), 0 0 18px rgba(239,68,68,0.26)'
      : 'none');
  const deployLogHtml = deployLogs.length > 0
    ? deployLogs.map((entry) => {
      const level = String(entry?.level || 'info').toLowerCase();
      const color = level === 'error'
        ? '#ff9b9b'
        : level === 'warn'
          ? '#ffd38a'
          : level === 'success'
            ? '#8dffbd'
            : '#9fb2cc';
      return `<div style="color:${color};">[${escapeMoeLogHtml(entry?.stamp || '')}] ${escapeMoeLogHtml(entry?.message || '')}</div>`;
    }).join('')
    : '<div>No deployment activity yet.</div>';
  
  // Empty state - no pipeline items AND no downloaded models
  if (moeItems.length === 0 && downloadedModels.length === 0) {
    return `
      <div style="text-align: center; padding: 60px 20px; background: rgba(255,107,107,0.05); border: 2px dashed ${theme.error}; border-radius: 10px;">
        <div style="font-size: 48px; margin-bottom: 15px;">📭</div>
        <h3 style="color: ${theme.error}; margin-bottom: 10px;">No Models Downloaded</h3>
        <p style="color: #888; margin-bottom: 25px; max-width: 600px; margin-left: auto; margin-right: auto;">
          Please go to <strong style="color: var(--psf-accent, #00d4ff);">'Browse &amp; Download Models'</strong> and download a model.<br><br>
          Be sure to run the model once via <strong style="color: #ffa500;">'Launch in Ollama'</strong> to wrap the blob.
        </p>
        <button onclick="showScreen('model-browser')" 
                style="padding: 12px 24px; background: var(--psf-accent-medium, rgba(0,212,255,0.2)); border: 2px solid var(--psf-accent, #00d4ff); border-radius: 8px; color: var(--psf-accent, #00d4ff); cursor: pointer; font-size: 14px;">
          🔍 Go to Browse &amp; Download
        </button>
      </div>
    `;
  }
  
  // Empty pipeline but models exist
  if (moeItems.length === 0) {
    return `
    <div class="psf-relay-synth-empty" style="position:relative; min-height: 360px; border:1px dashed rgba(88,166,255,0.18); border-radius:8px; overflow:hidden; background:#0c1520; display:flex; align-items:center; justify-content:center; padding:40px 24px;">
        <svg viewBox="0 0 800 340" fill="none" preserveAspectRatio="xMidYMid slice"
             style="position:absolute; inset:0; width:100%; height:100%; opacity:0.18;">
          <line x1="0" y1="80" x2="800" y2="80" stroke="#58a6ff" stroke-width="0.5" stroke-dasharray="6 4"/>
          <line x1="0" y1="170" x2="800" y2="170" stroke="#58a6ff" stroke-width="0.5" stroke-dasharray="6 4"/>
          <line x1="0" y1="260" x2="800" y2="260" stroke="#58a6ff" stroke-width="0.5" stroke-dasharray="6 4"/>

          <line x1="120" y1="0" x2="120" y2="340" stroke="#58a6ff" stroke-width="0.5" stroke-dasharray="6 4"/>
          <line x1="280" y1="0" x2="280" y2="340" stroke="#58a6ff" stroke-width="0.5" stroke-dasharray="6 4"/>
          <line x1="440" y1="0" x2="440" y2="340" stroke="#58a6ff" stroke-width="0.5" stroke-dasharray="6 4"/>
          <line x1="600" y1="0" x2="600" y2="340" stroke="#58a6ff" stroke-width="0.5" stroke-dasharray="6 4"/>

          <rect x="60" y="50" width="120" height="60" rx="4" stroke="#3fb950" stroke-width="1" fill="none"/>
          <line x1="75" y1="72" x2="125" y2="72" stroke="#3fb950" stroke-width="0.8"/>
          <line x1="75" y1="84" x2="155" y2="84" stroke="#3fb950" stroke-width="0.8"/>
          <text x="90" y="67" font-family="JetBrains Mono" font-size="8" fill="#3fb950">Gateway</text>

          <rect x="220" y="140" width="120" height="60" rx="4" stroke="#22c5c2" stroke-width="1" fill="none"/>
          <text x="248" y="167" font-family="JetBrains Mono" font-size="8" fill="#22c5c2">Agent</text>
          <line x1="235" y1="175" x2="315" y2="175" stroke="#22c5c2" stroke-width="0.8"/>
          <circle cx="252" cy="182" r="3" stroke="#22c5c2" stroke-width="0.8" fill="none"/>

          <rect x="390" y="50" width="120" height="60" rx="4" stroke="#d2991e" stroke-width="1" fill="none"/>
          <text x="415" y="67" font-family="JetBrains Mono" font-size="8" fill="#d2991e">Bindings</text>
          <line x1="405" y1="75" x2="490" y2="75" stroke="#d2991e" stroke-width="0.8"/>
          <line x1="405" y1="84" x2="465" y2="84" stroke="#d2991e" stroke-width="0.8"/>
          <line x1="405" y1="93" x2="480" y2="93" stroke="#d2991e" stroke-width="0.8"/>

          <rect x="550" y="140" width="120" height="60" rx="4" stroke="#f0883e" stroke-width="1" fill="none"/>
          <text x="568" y="167" font-family="JetBrains Mono" font-size="8" fill="#f0883e">Endpoint</text>
          <circle cx="610" cy="183" r="8" stroke="#f0883e" stroke-width="0.8" fill="none"/>
          <circle cx="610" cy="183" r="3" stroke="#f0883e" stroke-width="0.8" fill="none"/>

          <path d="M180,80 L220,80 L220,140" stroke="#58a6ff" stroke-width="0.8" fill="none"/>
          <path d="M340,170 L390,170 L390,80" stroke="#58a6ff" stroke-width="0.8" fill="none"/>
          <path d="M510,80 L550,80 L550,140" stroke="#58a6ff" stroke-width="0.8" fill="none"/>
          <path d="M280,200 L390,200 L390,260 L670,260 L670,200 L670,170" stroke="#58a6ff" stroke-width="0.8" fill="none" stroke-dasharray="4 3"/>

          <circle cx="220" cy="80" r="2.5" fill="#58a6ff"/>
          <circle cx="390" cy="80" r="2.5" fill="#58a6ff"/>
          <circle cx="550" cy="80" r="2.5" fill="#58a6ff"/>
          <circle cx="390" cy="170" r="2.5" fill="#58a6ff"/>

          <polyline points="170,77 180,80 170,83" stroke="#58a6ff" stroke-width="0.8" fill="none"/>
          <polyline points="337,167 347,170 337,173" stroke="#58a6ff" stroke-width="0.8" fill="none"/>

          <path d="M20,20 L20,35 M20,20 L35,20" stroke="#58a6ff" stroke-width="0.8"/>
          <path d="M780,20 L780,35 M780,20 L765,20" stroke="#58a6ff" stroke-width="0.8"/>
          <path d="M20,320 L20,305 M20,320 L35,320" stroke="#58a6ff" stroke-width="0.8"/>
          <path d="M780,320 L780,305 M780,320 L765,320" stroke="#58a6ff" stroke-width="0.8"/>

          <text x="22" y="16" font-family="JetBrains Mono" font-size="7" fill="#58a6ff">0,0</text>
          <text x="730" y="16" font-family="JetBrains Mono" font-size="7" fill="#58a6ff">800,0</text>
        </svg>

        <div style="position:relative; z-index:2; text-align:center; display:flex; flex-direction:column; align-items:center; gap:14px;">
          <div style="font-size:18px; font-weight:600; color:${theme.accent}; letter-spacing:0.02em;">Build Your Agent Pipeline</div>
          <div style="font-size:12px; color:#8b949e; line-height:1.7; max-width:520px;">
            Create a Mixture of Experts/Industrial Reflex Gateway pipeline by adding Agents, Channels, Gateways, and Bindings.<br>
            Agents are Large Language Model-powered roles. Channels connect them. Gateways handle input and output. Bindings define runtime variables.
          </div>
          <div style="font-size:11px; color:${theme.success}; font-family:'JetBrains Mono',monospace;">
            ✓ ${downloadedModels.length} model${downloadedModels.length !== 1 ? 's' : ''} ready for use
          </div>

          <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:center; margin-top:8px;">
            <button onclick="addMoeGateway()"
                    style="display:flex; align-items:center; gap:7px; padding:9px 18px; border:1px solid rgba(63,185,80,0.4); border-radius:6px; background:transparent; color:${theme.success}; cursor:pointer; font-size:12px; font-weight:500;">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="${theme.success}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="11" height="7" rx="1.5"/><line x1="3.5" y1="6" x2="7" y2="6"/><line x1="3.5" y1="8.5" x2="9.5" y2="8.5"/></svg>
              Add Input Gateway
            </button>
            <button onclick="addMoeAgent()"
                    style="display:flex; align-items:center; gap:7px; padding:9px 18px; border:1px solid rgba(34,197,194,0.4); border-radius:6px; background:transparent; color:#22c5c2; cursor:pointer; font-size:12px; font-weight:500;">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#22c5c2" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="6.5" cy="5" r="2.8"/><path d="M1,12 Q1,9 6.5,9 Q12,9 12,12"/></svg>
              Add First Agent
            </button>
            <button onclick="addMoeBindings()"
                    style="display:flex; align-items:center; gap:7px; padding:9px 18px; border:1px solid rgba(210,153,34,0.4); border-radius:6px; background:transparent; color:${theme.warning}; cursor:pointer; font-size:12px; font-weight:500;">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="${theme.warning}" stroke-width="1.7" stroke-linecap="round"><path d="M3,6.5 C3,4.5 10,4.5 10,6.5 C10,8.5 3,8.5 3,6.5Z"/><line x1="1" y1="6.5" x2="3" y2="6.5"/><line x1="10" y1="6.5" x2="12" y2="6.5"/></svg>
              Add Bindings
            </button>
            <button onclick="addMoeEndpointRegistry()"
                    style="display:flex; align-items:center; gap:7px; padding:9px 18px; border:1px solid rgba(240,136,62,0.4); border-radius:6px; background:transparent; color:#f0883e; cursor:pointer; font-size:12px; font-weight:500;">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#f0883e" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="6.5" cy="6.5" r="2"/><circle cx="6.5" cy="6.5" r="5.5"/><line x1="6.5" y1="1" x2="6.5" y2="4.5"/><line x1="6.5" y1="8.5" x2="6.5" y2="12"/><line x1="1" y1="6.5" x2="4.5" y2="6.5"/><line x1="8.5" y1="6.5" x2="12" y2="6.5"/></svg>
              Add Endpoint Registry
            </button>
            <button onclick="addMoeCliAgent()"
                    style="display:flex; align-items:center; gap:7px; padding:9px 18px; border:1px solid rgba(188,140,255,0.45); border-radius:6px; background:transparent; color:#dec8ff; cursor:pointer; font-size:12px; font-weight:500;">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#bc8cff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="1.2" y="2.2" width="10.6" height="8.6" rx="1.4"></rect><path d="M3.1 5.1l1.7 1.4-1.7 1.4"></path><line x1="6.2" y1="8.1" x2="9.6" y2="8.1"></line></svg>
              Add CLI Agent
            </button>
          </div>
        </div>
      </div>
    `;
  }
  
  return `
    <div id="moe-pipeline-frame" class="psf-relay-synth-frame ${graphFullscreen ? 'moe-graph-fullscreen' : ''}"
         style="border:1px solid ${frameBorderColor}; box-shadow:${frameShadow}; border-radius:10px; padding:10px 12px 12px; transition:border-color 220ms ease, box-shadow 220ms ease; display:flex; flex-direction:column; max-height:min(72vh, 860px);">
      <div class="psf-relay-synth-list ${graphMode ? 'graph-mode' : 'list-mode'}" style="${graphMode
        ? 'display:block; position:relative; overflow:auto; padding-right:6px; min-height:760px; flex:1 1 auto;'
        : 'display:flex; flex-direction:column; gap:4px; overflow-y:auto; padding-right:6px; min-height:260px; flex:1 1 auto;'}"
           id="moe-pipeline-list"
           onmousedown="handleMoeGraphPanMouseDown(event)"
           onauxclick="handleMoeGraphPanAuxClick(event)"
           ondragover="handleMoeDragOver(event)"
           ondrop="handleMoeDrop(event)">
        ${graphMode ? `
        <div class="moe-graph-controls-overlay" aria-label="Graph controls">
          <div class="moe-graph-zoom-control">
            <button onclick="adjustMoeGraphZoom(-0.1)" title="Zoom out" aria-label="Zoom out">−</button>
            <input type="range" min="45" max="300" step="1" value="${Math.max(45, Math.min(300, graphZoomPct))}"
                   oninput="setMoeGraphZoom(Number(this.value) / 100, true)"
                   title="Pipeline zoom"
                   aria-label="Pipeline zoom">
            <button onclick="adjustMoeGraphZoom(0.1)" title="Zoom in" aria-label="Zoom in">+</button>
            <span>${graphZoomPct}%</span>
          </div>
          <button class="moe-graph-fullscreen-btn"
                  onclick="toggleMoeGraphFullscreen()"
                  title="${graphFullscreen ? 'Restore graph size' : 'Expand graph fullscreen'}"
                  aria-label="${graphFullscreen ? 'Restore graph size' : 'Expand graph fullscreen'}">
            ${graphFullscreen
              ? '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 1H1v4"/><path d="M1 1l4 4"/><path d="M9 13h4V9"/><path d="M13 13l-4-4"/></svg>'
              : '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 1H1v4"/><path d="M1 1l4 4"/><path d="M9 1h4v4"/><path d="M13 1L9 5"/><path d="M1 9v4h4"/><path d="M1 13l4-4"/><path d="M13 9v4H9"/><path d="M13 13L9 9"/></svg>'}
          </button>
        </div>
        <div id="moe-graph-canvas"
             style="position:relative; min-height:1200px; width:2200px; transform:scale(${graphZoom}); transform-origin: top left;">
          <svg id="moe-graph-edges" class="psf-relay-graph-edges" aria-hidden="true">
            <defs>
              <marker id="moe-edge-arrow-end" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L8,3.5 L0,7 z" fill="#86b8ff"></path>
              </marker>
              <marker id="moe-edge-arrow-start" markerWidth="9" markerHeight="7" refX="1" refY="3.5" orient="auto" markerUnits="strokeWidth">
                <path d="M8,0 L0,3.5 L8,7 z" fill="#86b8ff"></path>
              </marker>
              <marker id="moe-edge-arrow-end-blue" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L8,3.5 L0,7 z" fill="#58a6ff"></path>
              </marker>
              <marker id="moe-edge-arrow-start-blue" markerWidth="9" markerHeight="7" refX="1" refY="3.5" orient="auto" markerUnits="strokeWidth">
                <path d="M8,0 L0,3.5 L8,7 z" fill="#58a6ff"></path>
              </marker>
              <marker id="moe-edge-arrow-end-white" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L8,3.5 L0,7 z" fill="#ffffff"></path>
              </marker>
              <marker id="moe-edge-arrow-start-white" markerWidth="9" markerHeight="7" refX="1" refY="3.5" orient="auto" markerUnits="strokeWidth">
                <path d="M8,0 L0,3.5 L8,7 z" fill="#ffffff"></path>
              </marker>
            </defs>
          </svg>
          ${moeItems.map((item, index) => renderMoeItem(item, index, modelsForDropdown)).join('')}
        </div>
        ` : moeItems.map((item, index) => renderMoeItem(item, index, modelsForDropdown)).join('')}
      </div>

      <!-- Pipeline Legend -->
      <div class="psf-relay-synth-legend" style="margin-top: 12px; padding: 6px 2px 2px; border-radius: 8px;">
      <div style="display: flex; gap: 14px; flex-wrap: wrap;">
        <div style="display:flex; align-items:center; gap:6px; font-size:10px; color:#484f58;">
          <div style="width:10px; height:10px; border-radius:2px; background:rgba(63,185,80,0.25); border:1px solid #3fb950;"></div>
          Gateway - I/O Point
        </div>
        <div style="display:flex; align-items:center; gap:6px; font-size:10px; color:#484f58;">
          <div style="width:10px; height:10px; border-radius:2px; background:rgba(210,153,34,0.25); border:1px solid #d2991e;"></div>
          Bindings - Runtime Variables
        </div>
        <div style="display:flex; align-items:center; gap:6px; font-size:10px; color:#484f58;">
          <div style="width:10px; height:10px; border-radius:2px; background:rgba(88,166,255,0.25); border:1px solid #58a6ff;"></div>
          Channel - Connection
        </div>
        <div style="display:flex; align-items:center; gap:6px; font-size:10px; color:#484f58;">
          <div style="width:10px; height:10px; border-radius:2px; background:rgba(56,189,248,0.25); border:1px solid #38bdf8;"></div>
          Agent - LLM Role
        </div>
        <div style="display:flex; align-items:center; gap:6px; font-size:10px; color:#484f58;">
          <div style="width:10px; height:10px; border-radius:2px; background:rgba(240,136,62,0.25); border:1px solid #f0883e;"></div>
          Endpoint Registry - Distributed Worker Routing
        </div>
        <div style="display:flex; align-items:center; gap:6px; font-size:10px; color:#484f58;">
          <div style="width:10px; height:10px; border-radius:2px; background:rgba(188,140,255,0.25); border:1px solid #bc8cff;"></div>
          CLI Agent - Stateless Tool Execution
        </div>
        <div style="display:flex; align-items:center; gap:6px; font-size:10px; color:#484f58;">
          <span style="width:24px; height:0; border-top:2px solid #86b8ff; display:inline-block;"></span>
          Solid Wire - Communication Flow
        </div>
        <div style="display:flex; align-items:center; gap:6px; font-size:10px; color:#484f58;">
          <span style="width:24px; height:0; border-top:2px dashed #86b8ff; display:inline-block;"></span>
          Dashed Wire - Ownership / Membership
        </div>
      </div>
      </div>

      <div id="moe-deploy-status-panel" class="psf-relay-synth-status" style="margin-top: 12px; padding: 9px 14px; background: #111c2a; border: 1px solid rgba(139,148,158,0.12); border-radius: 6px;">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:6px;">
        <div style="display:flex; align-items:center; gap:8px; font-size:12px; color:#8b949e; font-weight:500;">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#484f58" stroke-width="1.5" stroke-linecap="round"><rect x="1" y="1" width="11" height="11" rx="2"></rect><line x1="4" y1="5" x2="9" y2="5"></line><line x1="4" y1="8" x2="7" y2="8"></line></svg>
          Deployment Status
        </div>
        <span id="moe-deploy-status-summary" style="font-size:10px; color:#484f58; border:1px solid rgba(139,148,158,0.18); border-radius:3px; padding:2px 8px; letter-spacing:0.1em;">${escapeMoeLogHtml(deploySummary)}</span>
      </div>
      ${deployDirty ? `
      <div style="margin-bottom:8px; padding:7px 9px; border:1px solid rgba(245,158,11,0.65); border-radius:6px; background:rgba(245,158,11,0.14); color:#fbbf24; font-size:11px; font-weight:600;">
        Settings changed after deployment. Stop and Deploy again to apply changes.
      </div>
      ` : ''}
      <div id="moe-deploy-status-body" style="max-height:150px; overflow:auto; color:#9fb2cc; font-size:12px; line-height:1.45;">
        ${deployLogHtml}
      </div>
      </div>
    </div>
  `;
}

function getEnabledGraphNodeIds(items) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => (item?.type === 'agent' || item?.type === 'gateway') && item?.enabled !== false)
    .map((item) => String(item.id || '').trim())
    .filter(Boolean);
}

function getGraphSourceNodeIds(channel, items, channelIndex) {
  const enabledNodeIds = new Set(getEnabledGraphNodeIds(items));
  const explicit = (Array.isArray(channel?.fromNodeIds) ? channel.fromNodeIds : [])
    .map((id) => String(id || '').trim())
    .filter((id) => id && enabledNodeIds.has(id));
  if (explicit.length > 0) return Array.from(new Set(explicit));
  const legacy = String(channel?.fromAgentId || '').trim();
  if (legacy && enabledNodeIds.has(legacy)) return [legacy];
  for (let i = channelIndex - 1; i >= 0; i -= 1) {
    const item = items[i];
    if (item?.type === 'agent' && item?.enabled !== false) return [String(item.id || '').trim()];
  }
  return [];
}

function getGraphTargetNodeIds(channel, items, sourceNodeIds, channelIndex) {
  const mode = String(channel?.mode || 'direct').trim().toLowerCase();
  const sourceSet = new Set(Array.isArray(sourceNodeIds) ? sourceNodeIds.map((id) => String(id || '').trim()) : []);
  const enabledAgents = items.filter((item) => item?.type === 'agent' && item?.enabled !== false);
  const enabledNodes = items.filter((item) => (item?.type === 'agent' || item?.type === 'gateway') && item?.enabled !== false);
  const enabledNodeIds = new Set(enabledNodes.map((item) => String(item.id || '').trim()).filter(Boolean));
  const explicitTargets = (Array.isArray(channel?.toNodeIds) ? channel.toNodeIds : [])
    .map((id) => String(id || '').trim())
    .filter((id) => id && enabledNodeIds.has(id) && !sourceSet.has(id));
  if (explicitTargets.length > 0) return Array.from(new Set(explicitTargets));
  if (mode === 'broadcast') {
    return enabledAgents
      .map((agent) => String(agent.id || '').trim())
      .filter((id) => id && !sourceSet.has(id));
  }
  if (mode === 'group') {
    const groupId = String(channel?.groupId || '').trim();
    if (!groupId) return [];
    return enabledAgents
      .filter((agent) => Array.isArray(agent.groups) && agent.groups.map((g) => String(g || '').trim()).includes(groupId))
      .map((agent) => String(agent.id || '').trim())
      .filter((id) => id && !sourceSet.has(id));
  }
  const explicit = String(channel?.toAgentId || '').trim();
  if (explicit && enabledNodes.some((item) => String(item.id || '').trim() === explicit)) return [explicit];
  for (let i = channelIndex + 1; i < items.length; i += 1) {
    const item = items[i];
    if (item?.type === 'agent' && item?.enabled !== false) {
      const id = String(item.id || '').trim();
      if (id && !sourceSet.has(id)) return [id];
      break;
    }
  }
  return [];
}

function getGraphAnchor(el, side) {
  const left = Number(el.offsetLeft || 0);
  const top = Number(el.offsetTop || 0);
  const width = Number(el.offsetWidth || 0);
  const height = Number(el.offsetHeight || 0);
  const cardType = String(el.getAttribute('data-moe-type') || '').trim().toLowerCase();
  const outwardByType = {
    gateway: 4,
    agent: -4,
    cli_agent: -9,
    bindings: -2,
    endpoint_registry: -2
  };
  const outward = Number.isFinite(Number(outwardByType[cardType])) ? Number(outwardByType[cardType]) : 0;
  const centerX = left + Math.round(width * 0.5);
  const centerY = top + Math.max(24, Math.round(height * 0.45));
  if (side === 'left') return { x: left + 1 - outward, y: centerY };
  if (side === 'top') return { x: centerX, y: top + 1 - outward };
  if (side === 'bottom') return { x: centerX, y: top + Math.max(8, height - 1) + outward };
  return { x: left + Math.max(8, width - 1) + outward, y: centerY };
}

function buildEdgePath(from, to) {
  const forward = from.x <= to.x;
  const sourceSide = forward ? 'right' : 'left';
  const targetSide = forward ? 'left' : 'right';
  const dx = Math.max(40, Math.round(Math.abs(to.x - from.x) * 0.35));
  const c1x = from.x + (sourceSide === 'right' ? dx : -dx);
  const c2x = to.x + (targetSide === 'left' ? -dx : dx);
  return `M ${from.x} ${from.y} C ${c1x} ${from.y}, ${c2x} ${to.y}, ${to.x} ${to.y}`;
}

function isPointInRect(point, rect, padding = 0) {
  const x = Number(point?.x || 0);
  const y = Number(point?.y || 0);
  const left = Number(rect?.left || 0) - padding;
  const right = Number(rect?.right || 0) + padding;
  const top = Number(rect?.top || 0) - padding;
  const bottom = Number(rect?.bottom || 0) + padding;
  return x > left && x < right && y > top && y < bottom;
}

function ccw(a, b, c) {
  return (Number(c.y) - Number(a.y)) * (Number(b.x) - Number(a.x))
    > (Number(b.y) - Number(a.y)) * (Number(c.x) - Number(a.x));
}

function segmentsIntersect(a, b, c, d) {
  const ab = ccw(a, c, d) !== ccw(b, c, d);
  const cd = ccw(a, b, c) !== ccw(a, b, d);
  return ab && cd;
}

function segmentIntersectsRect(a, b, rect, padding = 0) {
  if (!rect) return false;
  if (isPointInRect(a, rect, padding) || isPointInRect(b, rect, padding)) return true;
  const left = Number(rect.left || 0) - padding;
  const right = Number(rect.right || 0) + padding;
  const top = Number(rect.top || 0) - padding;
  const bottom = Number(rect.bottom || 0) + padding;
  const r1 = { x: left, y: top };
  const r2 = { x: right, y: top };
  const r3 = { x: right, y: bottom };
  const r4 = { x: left, y: bottom };
  return (
    segmentsIntersect(a, b, r1, r2) ||
    segmentsIntersect(a, b, r2, r3) ||
    segmentsIntersect(a, b, r3, r4) ||
    segmentsIntersect(a, b, r4, r1)
  );
}

function polylineIntersectionCount(points, rects, padding = 2) {
  if (!Array.isArray(points) || points.length < 2) return 0;
  if (!Array.isArray(rects) || rects.length === 0) return 0;
  let hits = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    for (const rect of rects) {
      if (segmentIntersectsRect(a, b, rect, padding)) {
        hits += 1;
      }
    }
  }
  return hits;
}

function pathFromPoints(points) {
  if (!Array.isArray(points) || points.length === 0) return '';
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i += 1) {
    path += ` L ${points[i].x} ${points[i].y}`;
  }
  return path;
}

function normalizeRoutePoints(points, minSegment = 18) {
  if (!Array.isArray(points) || points.length < 2) return Array.isArray(points) ? points : [];
  const out = [];
  for (const raw of points) {
    const p = { x: Number(raw?.x || 0), y: Number(raw?.y || 0) };
    if (out.length === 0) {
      out.push(p);
      continue;
    }
    const prev = out[out.length - 1];
    const dist = Math.hypot(p.x - prev.x, p.y - prev.y);
    if (dist < minSegment) continue;
    out.push(p);
  }
  if (out.length < 2) return points;

  const simplified = [out[0]];
  for (let i = 1; i < out.length - 1; i += 1) {
    const a = simplified[simplified.length - 1];
    const b = out[i];
    const c = out[i + 1];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const bcx = c.x - b.x;
    const bcy = c.y - b.y;
    const cross = Math.abs(abx * bcy - aby * bcx);
    const nearlyCollinear = cross < 0.001;
    if (nearlyCollinear) continue;
    simplified.push(b);
  }
  simplified.push(out[out.length - 1]);
  return simplified;
}

function smoothPathFromPoints(points, radius = 22) {
  if (!Array.isArray(points) || points.length < 2) return '';
  const clean = normalizeRoutePoints(points, 16);
  if (clean.length === 2) return buildEdgePath(clean[0], clean[1]);
  const safeRadius = Math.max(0, Number(radius) || 0);
  let d = `M ${clean[0].x} ${clean[0].y}`;
  for (let i = 1; i < clean.length - 1; i += 1) {
    const prev = clean[i - 1];
    const curr = clean[i];
    const next = clean[i + 1];
    const v1x = curr.x - prev.x;
    const v1y = curr.y - prev.y;
    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;
    const len1 = Math.hypot(v1x, v1y);
    const len2 = Math.hypot(v2x, v2y);
    if (len1 < 1 || len2 < 1) {
      d += ` L ${curr.x} ${curr.y}`;
      continue;
    }
    const r = Math.min(safeRadius, len1 * 0.45, len2 * 0.45);
    const inX = curr.x - (v1x / len1) * r;
    const inY = curr.y - (v1y / len1) * r;
    const outX = curr.x + (v2x / len2) * r;
    const outY = curr.y + (v2y / len2) * r;
    d += ` L ${inX} ${inY} Q ${curr.x} ${curr.y} ${outX} ${outY}`;
  }
  const last = clean[clean.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

function buildRoutedEdgePath(from, to, options = {}) {
  const direct = buildEdgePath(from, to);
  const obstacles = Array.isArray(options.obstacles) ? options.obstacles : [];
  if (obstacles.length === 0) return direct;
  const excludeSet = new Set((Array.isArray(options.excludeIds) ? options.excludeIds : []).map((id) => String(id || '').trim()).filter(Boolean));
  const relevant = obstacles.filter((rect) => !excludeSet.has(String(rect?.id || '').trim()));
  if (relevant.length === 0) return direct;

  // Quick accept: if straight segment between anchors does not intersect cards, keep smooth path.
  if (polylineIntersectionCount([from, to], relevant, 2) === 0) return direct;

  const minTop = Math.min(...relevant.map((r) => Number(r.top || 0)), Number(from.y), Number(to.y));
  const maxBottom = Math.max(...relevant.map((r) => Number(r.bottom || 0)), Number(from.y), Number(to.y));
  const minLeft = Math.min(...relevant.map((r) => Number(r.left || 0)), Number(from.x), Number(to.x));
  const maxRight = Math.max(...relevant.map((r) => Number(r.right || 0)), Number(from.x), Number(to.x));
  const bounds = options?.routeBounds && typeof options.routeBounds === 'object'
    ? options.routeBounds
    : {};
  const minX = Number.isFinite(Number(bounds.minX)) ? Number(bounds.minX) : 16;
  const maxX = Number.isFinite(Number(bounds.maxX)) ? Number(bounds.maxX) : 4000;
  const minY = Number.isFinite(Number(bounds.minY)) ? Number(bounds.minY) : 16;
  const maxY = Number.isFinite(Number(bounds.maxY)) ? Number(bounds.maxY) : 4000;
  const lanePads = [34, 72, 120, 180, 250, 330];
  const candidates = [];
  lanePads.forEach((pad) => {
    const topLane = Math.max(minY, minTop - pad);
    const bottomLane = Math.min(maxY, maxBottom + pad);
    const leftLane = Math.max(minX, minLeft - pad);
    const rightLane = Math.min(maxX, maxRight + pad);
    candidates.push([from, { x: from.x, y: topLane }, { x: to.x, y: topLane }, to]);
    candidates.push([from, { x: from.x, y: bottomLane }, { x: to.x, y: bottomLane }, to]);
    candidates.push([from, { x: leftLane, y: from.y }, { x: leftLane, y: to.y }, to]);
    candidates.push([from, { x: rightLane, y: from.y }, { x: rightLane, y: to.y }, to]);
  });
  let best = candidates[0];
  let bestHits = Number.POSITIVE_INFINITY;
  let bestLen = Number.POSITIVE_INFINITY;
  for (const poly of candidates) {
    const hits = polylineIntersectionCount(poly, relevant, 2);
    let len = 0;
    for (let i = 0; i < poly.length - 1; i += 1) {
      len += Math.hypot(poly[i + 1].x - poly[i].x, poly[i + 1].y - poly[i].y);
    }
    if (hits < bestHits || (hits === bestHits && len < bestLen)) {
      best = poly;
      bestHits = hits;
      bestLen = len;
    }
    if (hits === 0 && len <= bestLen) break;
  }
  return smoothPathFromPoints(best, 22);
}

function pushGraphEdge(lines, from, to, options = {}) {
  if (!from || !to) return;
  const d = buildRoutedEdgePath(from, to, options);
  pushGraphPath(lines, d, options);
}

function pushGraphPath(lines, d, options = {}) {
  if (!d) return;
  const color = String(options.color || '#86b8ff');
  const glowWidth = Number.isFinite(Number(options.glowWidth)) ? Number(options.glowWidth) : 5;
  const strokeWidth = Number.isFinite(Number(options.strokeWidth)) ? Number(options.strokeWidth) : 1.6;
  const glowOpacity = Number.isFinite(Number(options.glowOpacity)) ? Number(options.glowOpacity) : 0.22;
  const dash = String(options.dash || '').trim();
  const markerEndId = String(options.markerEndId || 'moe-edge-arrow-end').trim();
  const markerStartId = String(options.markerStartId || 'moe-edge-arrow-start').trim();
  const markerEnd = options.markerEnd === false ? '' : `url(#${markerEndId})`;
  const markerStart = options.markerStart === true ? `url(#${markerStartId})` : '';
  lines.push(`
    <path d="${d}" stroke="${color}" stroke-opacity="${glowOpacity}" stroke-width="${glowWidth}" stroke-linecap="round" fill="none" ${dash ? `stroke-dasharray="${dash}"` : ''}></path>
    <path d="${d}" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" fill="none"
          ${dash ? `stroke-dasharray="${dash}"` : ''}
          ${markerEnd ? `marker-end="${markerEnd}"` : ''}
          ${markerStart ? `marker-start="${markerStart}"` : ''}></path>
  `);
}

function pushAlternatingDottedEdge(lines, from, to, options = {}) {
  if (!from || !to) return;
  const d = buildRoutedEdgePath(from, to, options);
  const colorA = String(options.colorA || '#58a6ff');
  const colorB = String(options.colorB || '#ffffff');
  const dashLen = Number.isFinite(Number(options.dashLen)) ? Number(options.dashLen) : 8;
  const gapLen = Number.isFinite(Number(options.gapLen)) ? Number(options.gapLen) : 8;
  const strokeWidth = Number.isFinite(Number(options.strokeWidth)) ? Number(options.strokeWidth) : 2;
  const markerStart = options.markerStart === true ? `url(#${String(options.markerStartId || 'moe-edge-arrow-start')})` : '';
  const markerEnd = options.markerEnd === false ? '' : `url(#${String(options.markerEndId || 'moe-edge-arrow-end')})`;
  const pattern = `${dashLen} ${dashLen + gapLen}`;
  const offset = `${dashLen + gapLen}`;
  lines.push(`
    <path d="${d}" stroke="${colorA}" stroke-width="${strokeWidth}" stroke-linecap="round" fill="none"
          stroke-dasharray="${pattern}" stroke-dashoffset="0"
          ${markerStart ? `marker-start="${markerStart}"` : ''}
          ${markerEnd ? `marker-end="${markerEnd}"` : ''}></path>
    <path d="${d}" stroke="${colorB}" stroke-width="${strokeWidth}" stroke-linecap="round" fill="none"
          stroke-dasharray="${pattern}" stroke-dashoffset="${offset}"></path>
  `);
}

function getDirectAnchorSides(fromEl, toEl) {
  const fromCx = Number(fromEl.offsetLeft || 0) + Number(fromEl.offsetWidth || 0) * 0.5;
  const fromCy = Number(fromEl.offsetTop || 0) + Number(fromEl.offsetHeight || 0) * 0.5;
  const toCx = Number(toEl.offsetLeft || 0) + Number(toEl.offsetWidth || 0) * 0.5;
  const toCy = Number(toEl.offsetTop || 0) + Number(toEl.offsetHeight || 0) * 0.5;
  const dx = toCx - fromCx;
  const dy = toCy - fromCy;
  if (Math.abs(dy) > Math.abs(dx)) {
    return {
      fromSide: dy >= 0 ? 'bottom' : 'top',
      toSide: dy >= 0 ? 'top' : 'bottom'
    };
  }
  return {
    fromSide: dx >= 0 ? 'right' : 'left',
    toSide: dx >= 0 ? 'left' : 'right'
  };
}

function getCardType(el) {
  return String(el?.getAttribute?.('data-moe-type') || '').trim().toLowerCase();
}

function enforceAgentAnchorSides(fromEl, toEl, sides) {
  const out = { ...(sides || {}) };
  if (getCardType(fromEl) === 'agent') out.fromSide = 'right';
  if (getCardType(toEl) === 'agent') out.toSide = 'left';
  return out;
}

function getVerticalAnchorSides(fromEl, toEl) {
  const fromCy = Number(fromEl.offsetTop || 0) + Number(fromEl.offsetHeight || 0) * 0.5;
  const toCy = Number(toEl.offsetTop || 0) + Number(toEl.offsetHeight || 0) * 0.5;
  const fromSide = toCy >= fromCy ? 'bottom' : 'top';
  const toSide = toCy >= fromCy ? 'top' : 'bottom';
  return { fromSide, toSide };
}

function drawGatewayToAgentEdge(lines, gatewayEl, agentEl, position, options = {}) {
  const mode = String(position || 'input').trim().toLowerCase();
  if (mode === 'bidirectional') {
    const sides = enforceAgentAnchorSides(gatewayEl, agentEl, getDirectAnchorSides(gatewayEl, agentEl));
    const from = getGraphAnchor(gatewayEl, sides.fromSide);
    const to = getGraphAnchor(agentEl, sides.toSide);
    pushAlternatingDottedEdge(lines, from, to, {
      colorA: '#58a6ff',
      colorB: '#ffffff',
      markerStart: true,
      markerEnd: true,
      markerStartId: 'moe-edge-arrow-start-blue',
      markerEndId: 'moe-edge-arrow-end-white',
      obstacles: options?.obstacles || [],
      excludeIds: options?.excludeIds || []
    });
    return;
  }
  if (mode === 'output') {
    const gatewayAnchor = getGraphAnchor(gatewayEl, 'right');
    const targetSide = 'left';
    const targetAnchor = getGraphAnchor(agentEl, targetSide);
    pushGraphEdge(lines, gatewayAnchor, targetAnchor, {
      color: '#ffffff',
      markerStart: false,
      markerEnd: true,
      markerEndId: 'moe-edge-arrow-end-white',
      glowOpacity: 0.14,
      glowWidth: 4,
      obstacles: options?.obstacles || [],
      excludeIds: options?.excludeIds || []
    });
    return;
  }
  const sourceIsRight = Number(agentEl.offsetLeft || 0) > Number(gatewayEl.offsetLeft || 0);
  const sourceSide = 'right';
  const sourceAnchor = getGraphAnchor(agentEl, sourceSide);
  const gatewayAnchor = getGraphAnchor(gatewayEl, 'left');
  if (sourceIsRight) {
    const sourceTop = Number(agentEl.offsetTop || 0);
    const sourceBottom = sourceTop + Number(agentEl.offsetHeight || 0);
    const gatewayTop = Number(gatewayEl.offsetTop || 0);
    const gatewayBottom = gatewayTop + Number(gatewayEl.offsetHeight || 0);
    const routeAbove = sourceTop <= gatewayTop;
    const bounds = options?.routeBounds && typeof options.routeBounds === 'object'
      ? options.routeBounds
      : {};
    const minY = Number.isFinite(Number(bounds.minY)) ? Number(bounds.minY) : 16;
    const maxY = Number.isFinite(Number(bounds.maxY)) ? Number(bounds.maxY) : 4000;
    const minX = Number.isFinite(Number(bounds.minX)) ? Number(bounds.minX) : 16;
    const baseViaY = routeAbove
      ? Math.min(sourceAnchor.y, gatewayAnchor.y) - 42
      : Math.max(sourceBottom, gatewayBottom) + 42;
    const gatewayLeft = Number(gatewayEl.offsetLeft || 0);
    const baseApproachX = Math.max(minX, gatewayLeft - 42);
    const pads = [0, 40, 90, 150, 220];
    let bestPoints = null;
    let bestHits = Number.POSITIVE_INFINITY;
    for (const p of pads) {
      const viaY = routeAbove
        ? Math.max(minY, baseViaY - p)
        : Math.min(maxY, baseViaY + p);
      const approachX = Math.max(minX, baseApproachX - Math.round(p * 0.4));
      const poly = [
        sourceAnchor,
        { x: sourceAnchor.x - 70 - p, y: sourceAnchor.y },
        { x: sourceAnchor.x - 70 - p, y: viaY },
        { x: approachX, y: viaY },
        { x: approachX, y: gatewayAnchor.y },
        gatewayAnchor
      ];
      const hits = polylineIntersectionCount(
        poly,
        Array.isArray(options?.obstacles) ? options.obstacles.filter((r) => {
          const exclude = new Set((Array.isArray(options?.excludeIds) ? options.excludeIds : []).map((id) => String(id || '').trim()).filter(Boolean));
          return !exclude.has(String(r?.id || '').trim());
        }) : [],
        2
      );
      if (hits < bestHits) {
        bestHits = hits;
        bestPoints = poly;
      }
      if (hits === 0) break;
    }
    const d = smoothPathFromPoints(bestPoints || [sourceAnchor, gatewayAnchor], 20);
    pushGraphPath(lines, d, {
      color: '#58a6ff',
      markerStart: false,
      markerEnd: true,
      markerEndId: 'moe-edge-arrow-end-blue',
      obstacles: options?.obstacles || [],
      excludeIds: options?.excludeIds || [],
      routeBounds: options?.routeBounds || null
    });
    return;
  }
  pushGraphEdge(lines, sourceAnchor, gatewayAnchor, {
    color: '#58a6ff',
    markerStart: false,
    markerEnd: true,
    markerEndId: 'moe-edge-arrow-end-blue',
    obstacles: options?.obstacles || [],
    excludeIds: options?.excludeIds || [],
    routeBounds: options?.routeBounds || null
  });
}

function findNearestAgentId(items, fromIndex, direction = 'forward') {
  if (!Array.isArray(items) || !Number.isInteger(fromIndex)) return '';
  if (direction === 'backward') {
    for (let i = fromIndex - 1; i >= 0; i -= 1) {
      const item = items[i];
      if (item?.type === 'agent' && item?.enabled !== false) return String(item.id || '').trim();
    }
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const item = items[i];
      if (item?.type === 'agent' && item?.enabled !== false) return String(item.id || '').trim();
    }
    return '';
  }
  for (let i = fromIndex + 1; i < items.length; i += 1) {
    const item = items[i];
    if (item?.type === 'agent' && item?.enabled !== false) return String(item.id || '').trim();
  }
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (item?.type === 'agent' && item?.enabled !== false) return String(item.id || '').trim();
  }
  return '';
}

function resolveChannelDirection(directionRaw) {
  const dir = String(directionRaw || 'bidirectional').trim().toLowerCase();
  if (dir === 'unidirectional') return 'unidirectional_egress';
  if (dir === 'unidirectional_ingress' || dir === 'unidirectional_egress' || dir === 'bidirectional') return dir;
  return 'bidirectional';
}

function getChannelArrowMode(directionRaw) {
  const dir = resolveChannelDirection(directionRaw);
  if (dir === 'unidirectional_ingress') {
    return {
      markerStart: true,
      markerEnd: false,
      color: '#58a6ff',
      markerStartId: 'moe-edge-arrow-start-blue',
      markerEndId: 'moe-edge-arrow-end-blue'
    };
  }
  if (dir === 'unidirectional_egress') {
    return {
      markerStart: false,
      markerEnd: true,
      color: '#ffffff',
      markerStartId: 'moe-edge-arrow-start-white',
      markerEndId: 'moe-edge-arrow-end-white',
      glowOpacity: 0.14,
      glowWidth: 4
    };
  }
  return {
    markerStart: true,
    markerEnd: true,
    color: '#86b8ff',
    markerStartId: 'moe-edge-arrow-start',
    markerEndId: 'moe-edge-arrow-end'
  };
}

function drawChannelEdge(lines, fromEl, toEl, directionRaw, options = {}) {
  const fromId = String(fromEl?.getAttribute?.('data-moe-id') || '').trim();
  const toId = String(toEl?.getAttribute?.('data-moe-id') || '').trim();
  const direction = resolveChannelDirection(directionRaw);
  const arrows = getChannelArrowMode(direction);
  const computedSides = direction === 'bidirectional'
    ? getDirectAnchorSides(fromEl, toEl)
    : getVerticalAnchorSides(fromEl, toEl);
  const sides = enforceAgentAnchorSides(fromEl, toEl, computedSides);
  const from = getGraphAnchor(fromEl, sides.fromSide);
  const to = getGraphAnchor(toEl, sides.toSide);
  if (direction === 'bidirectional') {
    pushAlternatingDottedEdge(lines, from, to, {
      colorA: '#58a6ff',
      colorB: '#ffffff',
      markerStart: true,
      markerEnd: true,
      markerStartId: 'moe-edge-arrow-start-blue',
      markerEndId: 'moe-edge-arrow-end-white',
      dashLen: 7,
      gapLen: 7,
      strokeWidth: 1.9,
      obstacles: options?.obstacles || [],
      excludeIds: [fromId, toId],
      routeBounds: options?.routeBounds || null
    });
    return;
  }
  pushGraphEdge(lines, from, to, {
    color: arrows.color,
    markerStart: arrows.markerStart,
    markerEnd: arrows.markerEnd,
    markerStartId: arrows.markerStartId,
    markerEndId: arrows.markerEndId,
    glowOpacity: arrows.glowOpacity,
    glowWidth: arrows.glowWidth,
    obstacles: options?.obstacles || [],
    excludeIds: [fromId, toId],
    routeBounds: options?.routeBounds || null
  });
}

function refreshMoeGraphEdges() {
  if (window.modelOrderingState?.moeGraphMode !== true) return;
  const list = document.getElementById('moe-pipeline-list');
  const canvas = document.getElementById('moe-graph-canvas');
  const svg = document.getElementById('moe-graph-edges');
  if (!(list instanceof HTMLElement) || !(canvas instanceof HTMLElement) || !(svg instanceof SVGElement)) return;

  const items = Array.isArray(window.modelOrderingState?.moeItems) ? window.modelOrderingState.moeItems : [];
  const channels = items
    .map((item, index) => ({ item, index }))
    .filter((row) => row.item?.type === 'channel' && row.item?.enabled !== false);

  const cardEls = canvas.querySelectorAll('.moe-item[data-moe-id]');
  const cardMap = new Map();
  cardEls.forEach((el) => {
    const id = String(el.getAttribute('data-moe-id') || '').trim();
    if (id) cardMap.set(id, el);
  });

  const canvasW = Math.max(canvas.scrollWidth, canvas.clientWidth, 1200);
  const canvasH = Math.max(canvas.scrollHeight, canvas.clientHeight, 760);
  const edgeMargin = 72;
  let adjustedCards = false;
  for (const [id, el] of cardMap.entries()) {
    const item = items.find((entry) => String(entry?.id || '').trim() === id);
    if (!item) continue;
    const width = Number(el.offsetWidth || 0);
    const height = Number(el.offsetHeight || 0);
    const currentX = Number(item?.canvasPos?.x ?? el.offsetLeft ?? 0);
    const currentY = Number(item?.canvasPos?.y ?? el.offsetTop ?? 0);
    const clampedX = Math.max(edgeMargin, Math.min(Math.max(edgeMargin, canvasW - width - edgeMargin), Math.round(currentX)));
    const clampedY = Math.max(edgeMargin, Math.min(Math.max(edgeMargin, canvasH - height - edgeMargin), Math.round(currentY)));
    if (clampedX !== currentX || clampedY !== currentY) {
      item.canvasPos = { x: clampedX, y: clampedY };
      el.style.left = `${clampedX}px`;
      el.style.top = `${clampedY}px`;
      adjustedCards = true;
    }
  }
  if (adjustedCards) {
    cardMap.forEach((el) => { el.getBoundingClientRect(); });
  }
  const obstacleRects = Array.from(cardMap.entries()).map(([id, el]) => ({
    id,
    left: Number(el.offsetLeft || 0),
    top: Number(el.offsetTop || 0),
    right: Number(el.offsetLeft || 0) + Number(el.offsetWidth || 0),
    bottom: Number(el.offsetTop || 0) + Number(el.offsetHeight || 0)
  }));
  const routeBounds = {
    minX: edgeMargin * 0.5,
    maxX: canvasW - edgeMargin * 0.5,
    minY: edgeMargin * 0.5,
    maxY: canvasH - edgeMargin * 0.5
  };
  svg.setAttribute('viewBox', `0 0 ${canvasW} ${canvasH}`);
  svg.setAttribute('width', String(canvasW));
  svg.setAttribute('height', String(canvasH));

  const defs = svg.querySelector('defs');
  const lines = [];

  // Channel links: explicit card-to-card flow (source -> channel -> target).
  for (const row of channels) {
    const channel = row.item;
    const channelId = String(channel?.id || '').trim();
    const sourceIds = getGraphSourceNodeIds(channel, items, row.index);
    const targets = getGraphTargetNodeIds(channel, items, sourceIds, row.index);
    if (!channelId || !sourceIds.length || !targets.length) continue;
    const channelEl = cardMap.get(channelId);
    if (!channelEl) continue;
    for (const sourceId of sourceIds) {
      const sourceEl = cardMap.get(sourceId);
      if (!sourceEl) continue;
      drawChannelEdge(lines, sourceEl, channelEl, channel?.direction, { obstacles: obstacleRects, routeBounds });
    }

    for (const targetId of targets) {
      const targetEl = cardMap.get(targetId);
      if (!targetEl) continue;
      drawChannelEdge(lines, channelEl, targetEl, channel?.direction, { obstacles: obstacleRects, routeBounds });
    }
  }

  // Gateway links (fixed direction by position).
  const gateways = items
    .map((item, index) => ({ item, index }))
    .filter((row) => row.item?.type === 'gateway' && row.item?.enabled !== false);
  const gatewayInputRows = gateways.filter((row) => String(row.item?.position || 'input').trim().toLowerCase() !== 'output');
  const gatewayOutputRows = gateways.filter((row) => String(row.item?.position || 'input').trim().toLowerCase() === 'output');
  const gatewayAgentIds = items
    .filter((item) => item?.type === 'agent' && item?.enabled !== false)
    .map((item) => String(item.id || '').trim())
    .filter(Boolean);
  for (const row of gateways) {
    const gateway = row.item;
    const gatewayId = String(gateway.id || '').trim();
    if (!gatewayId) continue;
    const gatewayEl = cardMap.get(gatewayId);
    if (!gatewayEl) continue;
    const position = String(gateway?.position || 'input').trim().toLowerCase();
    const assignedIds = Array.isArray(gateway?.assignedAgentIds)
      ? gateway.assignedAgentIds.map((id) => String(id || '').trim()).filter(Boolean)
      : [];
    const explicitTargets = assignedIds.filter((id) => gatewayAgentIds.includes(id));

    if (explicitTargets.length > 0) {
      for (const targetAgentId of explicitTargets) {
        const agentEl = cardMap.get(targetAgentId);
        if (!agentEl) continue;
        drawGatewayToAgentEdge(lines, gatewayEl, agentEl, position, {
          obstacles: obstacleRects,
          excludeIds: [gatewayId, targetAgentId],
          routeBounds
        });
      }
      continue;
    }

    let targetAgentId = '';
    if (gatewayAgentIds.length > 0) {
      if (position === 'output') {
        const outputIdx = Math.max(0, gatewayOutputRows.findIndex((entry) => String(entry?.item?.id || '') === gatewayId));
        const agentIdx = Math.max(0, gatewayAgentIds.length - 1 - Math.min(outputIdx, gatewayAgentIds.length - 1));
        targetAgentId = gatewayAgentIds[agentIdx] || '';
      } else {
        const inputIdx = Math.max(0, gatewayInputRows.findIndex((entry) => String(entry?.item?.id || '') === gatewayId));
        const agentIdx = Math.min(inputIdx, gatewayAgentIds.length - 1);
        targetAgentId = gatewayAgentIds[agentIdx] || '';
      }
    }
    if (!targetAgentId) {
      targetAgentId = position === 'output'
        ? findNearestAgentId(items, row.index, 'backward')
        : findNearestAgentId(items, row.index, 'forward');
    }
    if (!targetAgentId) continue;
    const agentEl = cardMap.get(targetAgentId);
    if (!agentEl) continue;
    drawGatewayToAgentEdge(lines, gatewayEl, agentEl, position, {
      obstacles: obstacleRects,
      excludeIds: [gatewayId, targetAgentId],
      routeBounds
    });
  }

  // Runtime bindings feed gateways (one-way).
  const bindingsRows = items
    .map((item, index) => ({ item, index }))
    .filter((row) => row.item?.type === 'bindings' && row.item?.enabled !== false);
  const enabledGatewayIds = items
    .filter((item) => item?.type === 'gateway' && item?.enabled !== false)
    .map((item) => String(item.id || '').trim())
    .filter(Boolean);
  for (const row of bindingsRows) {
    const bindingsId = String(row.item.id || '').trim();
    const bindingsEl = cardMap.get(bindingsId);
    if (!bindingsEl) continue;
    const assignedIds = Array.isArray(row.item?.assignedGatewayIds)
      ? row.item.assignedGatewayIds.map((id) => String(id || '').trim()).filter(Boolean)
      : (Array.isArray(row.item?.assignedAgentIds)
        ? row.item.assignedAgentIds.map((id) => String(id || '').trim()).filter(Boolean)
        : []);
    const explicitTargets = assignedIds.filter((id) => enabledGatewayIds.includes(id));
    const targetIds = explicitTargets.length > 0 ? explicitTargets : enabledGatewayIds;
    for (const gatewayId of targetIds) {
      const gatewayEl = cardMap.get(gatewayId);
      if (!gatewayEl) continue;
      const sourceForward = Number(bindingsEl.offsetLeft || 0) <= Number(gatewayEl.offsetLeft || 0);
      const from = getGraphAnchor(bindingsEl, sourceForward ? 'right' : 'left');
      const to = getGraphAnchor(gatewayEl, sourceForward ? 'left' : 'right');
      pushGraphEdge(lines, from, to, {
        color: '#d2991e',
        dash: '3 4',
        markerEnd: false,
        obstacles: obstacleRects,
        excludeIds: [bindingsId, gatewayId],
        routeBounds
      });
    }
  }

  // CLI Agent ownership links (owner agent -> CLI agent).
  const cliRows = items
    .map((item, index) => ({ item, index }))
    .filter((row) => row.item?.type === 'cli_agent' && row.item?.enabled !== false);
  for (const row of cliRows) {
    const cliItem = row.item;
    const cliId = String(cliItem.id || '').trim();
    const ownerId = String(cliItem.ownerAgentId || '').trim();
    if (!cliId || !ownerId) continue;
    const cliEl = cardMap.get(cliId);
    const ownerEl = cardMap.get(ownerId);
    if (!cliEl || !ownerEl) continue;
    const sourceForward = Number(ownerEl.offsetLeft || 0) <= Number(cliEl.offsetLeft || 0);
    const from = getGraphAnchor(ownerEl, getCardType(ownerEl) === 'agent' ? 'right' : (sourceForward ? 'right' : 'left'));
    const to = getGraphAnchor(cliEl, sourceForward ? 'left' : 'right');
    pushGraphEdge(lines, from, to, {
      color: '#bc8cff',
      dash: '2 3',
      markerEnd: false,
      obstacles: obstacleRects,
      excludeIds: [ownerId, cliId],
      routeBounds
    });
  }

  svg.innerHTML = `${defs ? defs.outerHTML : ''}
    <g class="psf-relay-graph-edge-layer">
      ${lines.join('')}
    </g>`;
}

function enforceMoeGraphFitZoom() {
  if (window.modelOrderingState?.moeGraphMode !== true) return false;
  const canvas = document.getElementById('moe-graph-canvas');
  if (!(canvas instanceof HTMLElement)) return false;
  const cards = canvas.querySelectorAll('.moe-item[data-moe-id]');
  if (!cards || cards.length === 0) return false;

  let maxRight = 0;
  let maxBottom = 0;
  cards.forEach((el) => {
    const right = Number(el.offsetLeft || 0) + Number(el.offsetWidth || 0) + 24;
    const bottom = Number(el.offsetTop || 0) + Number(el.offsetHeight || 0) + 24;
    if (right > maxRight) maxRight = right;
    if (bottom > maxBottom) maxBottom = bottom;
  });

  const canvasW = Number(canvas.clientWidth || canvas.offsetWidth || 0);
  const canvasH = Number(canvas.clientHeight || canvas.offsetHeight || 0);
  if (canvasW <= 0 || canvasH <= 0) return false;

  const currentZoomRaw = Number(window.modelOrderingState?.moeGraphZoom);
  const currentZoom = Number.isFinite(currentZoomRaw) ? Math.max(0.45, Math.min(3.0, currentZoomRaw)) : 0.7;
  // Auto-fit only when cards exceed the graph canvas dimensions, not the viewport.
  // This avoids repeatedly forcing tiny zoom levels during normal editing.
  const minZoom = 0.7;
  const exceedsCanvas = (maxRight > canvasW) || (maxBottom > canvasH);
  if (exceedsCanvas && currentZoom > minZoom + 0.0001) {
    window.modelOrderingState.moeGraphZoom = minZoom;
    if (typeof renderModelOrdering === 'function') {
      renderModelOrdering();
      return true;
    }
  }
  return false;
}

/**
 * Render MoE chat interface section
 * @returns {string} HTML string
 */
function renderMoeChat() {
  const { moeItems } = window.modelOrderingState;
  const theme = getMoeTheme();
  const activityLines = Array.isArray(window.modelOrderingState?.moeActivityLogLines)
    ? window.modelOrderingState.moeActivityLogLines
    : [];
  const activityHtml = activityLines.length > 0
    ? activityLines.map((entry) => {
      const level = String(entry?.level || 'info').toLowerCase();
      const color = level === 'error'
        ? '#ff9b9b'
        : level === 'warn'
          ? '#ffd38a'
          : level === 'success'
            ? '#8dffbd'
            : '#9fb2cc';
      return `<div style="color:${color};">[${escapeMoeLogHtml(entry?.stamp || '')}] ${escapeMoeLogHtml(entry?.message || '')}</div>`;
    }).join('')
    : '<div style="color:#666;">No activity yet.</div>';
  
  return `
    <div id="moe-chat-section" style="margin-top: 25px; border-top: 1px solid #333; padding-top: 20px;">
      <style>
        #moe-chat-input {
          caret-color: var(--psf-accent, #00d4ff) !important;
        }
        #moe-chat-input:focus {
          caret-color: var(--psf-accent, #00d4ff) !important;
          outline: none;
        }
      </style>
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px;">
        <h3 style="color: ${theme.accent}; margin: 0; display: flex; align-items: center; gap: 10px;">
          💬 Pipeline Chat
          <span id="moe-chat-status" style="font-size: 12px; font-weight: normal; color: #888;">(Deploy pipeline first)</span>
        </h3>
        
        <div style="display: flex; align-items: center; gap: 15px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="color: #888; font-size: 12px;">🎛️ KVM:</span>
            <select id="moe-kvm-select" onchange="updateKvmSelection()"
                    style="padding: 6px 12px; background: rgba(255,255,255,0.1); border: 1px solid ${theme.accent}; 
                           border-radius: 4px; color: #fff; font-size: 12px; min-width: 180px;">
              <option value="pipeline" style="background: #1a1a2e;">🔗 Full Pipeline (Chain All)</option>
              ${moeItems.filter(i => i.type === 'agent').map(agent => `
                <option value="${agent.id}" style="background: #1a1a2e;">🤖 ${agent.name}${agent.modelName ? ` (${agent.modelName})` : ''}</option>
              `).join('')}
            </select>
            <span id="moe-kvm-indicator" style="font-size: 10px; color: ${theme.success};">● Pipeline</span>
          </div>
          
          <!-- Open Full Chat Window Button -->
          <button onclick="openMoeChatWindowFromPipeline()" 
                  style="padding: 10px 20px; background: linear-gradient(135deg, ${theme.accent} 0%, ${theme.accentDark} 100%); 
                         border: none; border-radius: 8px; color: #fff; cursor: pointer; font-weight: bold;
                         display: flex; align-items: center; gap: 8px; transition: all 0.2s;"
                  onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 5px 20px ${theme.accentMedium}';"
                  onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none';">
            🗗 Open Chat Window
          </button>
        </div>
      </div>
      
      <!-- Mini Preview Chat (Quick Messages) -->
      <div id="moe-chat-messages" style="background: rgba(0,0,0,0.3); border: 1px solid #333; border-radius: 8px; 
           height: 250px; overflow-y: auto; padding: 12px; margin-bottom: 12px; font-family: monospace; font-size: 12px;">
        <div style="color: #666; text-align: center; padding: 15px;">
          Deploy pipeline to chat • Click "Open Chat Window" for full experience
        </div>
      </div>
      
      <div style="display: flex; gap: 10px;">
        <input type="text" id="moe-chat-input" placeholder="Quick message (or open chat window for full experience)..."
               onclick="activateMoeChatInput(this)"
               onfocus="activateMoeChatInput(this)"
               onkeydown="handleMoeChatInputKeydown(event)"
               style="flex: 1; padding: 10px 15px; background: rgba(255,255,255,0.1); border: 1px solid #333; 
                      border-radius: 8px; color: #fff; font-size: 13px; caret-color: var(--psf-accent, #00d4ff); user-select: text; -webkit-user-select: text;">
        <button onclick="sendMoeChatMessage()" 
                style="padding: 10px 20px; background: ${theme.accentMedium}; border: 2px solid ${theme.accent}; 
                       border-radius: 8px; color: ${theme.accent}; cursor: pointer; font-weight: bold;">
          Send
        </button>
      </div>

      <div style="margin-top: 12px; padding: 9px 12px; border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; background: rgba(8,12,18,0.55);">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
          <div style="display:flex; align-items:center; gap:8px; color:#9fb2cc; font-size:12px; font-weight:600;">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#9fb2cc" stroke-width="1.4" stroke-linecap="round"><rect x="1.2" y="1.2" width="9.6" height="9.6" rx="1.6"></rect><line x1="3.2" y1="4.2" x2="8.8" y2="4.2"></line><line x1="3.2" y1="6.2" x2="8.8" y2="6.2"></line><line x1="3.2" y1="8.2" x2="6.8" y2="8.2"></line></svg>
            Activity
          </div>
          <button onclick="clearMoeActivityLog()"
                  style="padding:4px 8px; background:rgba(255,255,255,0.06); border:1px solid #555; border-radius:6px; color:#bbb; cursor:pointer; font-size:11px;">
            Clear
          </button>
        </div>
        <div id="moe-activity-log"
             style="max-height: 180px; overflow-y: auto; font-family: monospace; font-size: 11px; line-height: 1.4; color: #9fb2cc;">
          ${activityHtml}
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// TOGGLE HANDLER
// ============================================================================

/**
 * Toggle "Show All Models" mode
 */
function toggleShowAllModels(showAll) {
  window.modelOrderingState.showAllModels = showAll;
  renderModelOrdering();
}

// ============================================================================
// EXPORTS
// ============================================================================

window.getMoeTheme = getMoeTheme;
window.getDownloadedModels = getDownloadedModels;
window.getAllModelsForDropdown = getAllModelsForDropdown;
window.renderMoePipeline = renderMoePipeline;
window.refreshMoeGraphEdges = refreshMoeGraphEdges;
window.enforceMoeGraphFitZoom = enforceMoeGraphFitZoom;
window.toggleShowAllModels = toggleShowAllModels;
