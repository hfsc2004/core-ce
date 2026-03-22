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
 * @version 1.1.2 - March 5, 2026
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

// ============================================================================
// MODEL HELPERS
// ============================================================================

/**
 * Get only downloaded AND wrapped models (ready for MoE deployment)
 * MoE requires models to be both downloaded AND wrapped (launched at least once)
 * @returns {Array} Array of ready model objects
 */
function getDownloadedModels() {
  const { catalog, downloadStatus } = window.modelOrderingState;
  const ready = [];
  
  for (const [collKey, collection] of Object.entries(catalog?.collections || {})) {
    for (const model of collection.models || []) {
      const status = downloadStatus[model.id];
      // MoE needs models that are both downloaded AND wrapped
      if (status?.downloaded && status?.wrapped) {
        ready.push({
          id: model.id,
          name: model.name,
          collectionKey: collKey,
          filename: model.filename,
          projectorFilename: model.projector_filename || null
        });
      }
    }
  }
  return ready;
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
      <div style="text-align: center; padding: 60px 20px; background: ${theme.accentLight}; border: 2px dashed ${theme.accent}; border-radius: 10px;">
        <div style="font-size: 48px; margin-bottom: 15px;">🧠</div>
        <h3 style="color: ${theme.accent}; margin-bottom: 10px;">Build Your Agent Pipeline</h3>
        <p style="color: #888; margin-bottom: 25px; max-width: 500px; margin-left: auto; margin-right: auto;">
          Create a MoE/IRG pipeline by adding Agents, Channels, Gateways, and Bindings.<br>
          Agents are LLM-powered roles. Channels connect them. Gateways handle I/O. Bindings define runtime variables.
        </p>
        <p style="color: ${theme.success}; font-size: 13px; margin-bottom: 20px;">
          ✓ ${downloadedModels.length} model${downloadedModels.length !== 1 ? 's' : ''} ready for use
        </p>
        <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
          <button onclick="addMoeGateway()" 
                  style="padding: 12px 24px; background: rgba(0,255,136,0.2); border: 2px solid ${theme.success}; border-radius: 8px; color: ${theme.success}; cursor: pointer; font-size: 14px;">
            📡 Add Input Gateway
          </button>
          <button onclick="addMoeAgent()" 
                  style="padding: 12px 24px; background: ${theme.accentMedium}; border: 2px solid ${theme.accent}; border-radius: 8px; color: ${theme.accent}; cursor: pointer; font-size: 14px;">
            🤖 Add First Agent
          </button>
          <button onclick="addMoeBindings()" 
                  style="padding: 12px 24px; background: rgba(255,255,255,0.12); border: 2px solid #bbb; border-radius: 8px; color: #ddd; cursor: pointer; font-size: 14px;">
            🧩 Add Bindings
          </button>
          <button onclick="addMoeEndpointRegistry()"
                  style="padding: 12px 24px; background: rgba(79,70,229,0.2); border: 2px solid #818cf8; border-radius: 8px; color: #c7d2fe; cursor: pointer; font-size: 14px;">
            🧭 Add Endpoint Registry
          </button>
        </div>
      </div>
    `;
  }
  
  return `
    <div style="display: flex; flex-direction: column; gap: 4px;"
         id="moe-pipeline-list"
         ondragover="handleMoeDragOver(event)"
         ondrop="handleMoeDrop(event)">
      ${moeItems.map((item, index) => renderMoeItem(item, index, modelsForDropdown)).join('')}
    </div>
    
    <!-- Pipeline Legend -->
    <div style="margin-top: 12px; padding: 10px 12px; background: rgba(255,255,255,0.03); border-radius: 8px;">
      <div style="display: flex; gap: 20px; justify-content: center; flex-wrap: wrap;">
        <span style="color: #888; font-size: 12px;"><span style="color: ${theme.accent};">🤖 Agent</span> = LLM Role</span>
        <span style="color: #888; font-size: 12px;"><span style="color: #ffa500;">🔗 Channel</span> = Connection</span>
        <span style="color: #888; font-size: 12px;"><span style="color: ${theme.success};">📡 Gateway</span> = I/O Point</span>
        <span style="color: #888; font-size: 12px;"><span style="color: #ddd;">🧩 Bindings</span> = Runtime Variables</span>
        <span style="color: #888; font-size: 12px;"><span style="color: #a5b4fc;">🧭 Endpoint Registry</span> = Distributed Worker Routing</span>
      </div>
    </div>

    <div id="moe-deploy-status-panel" style="margin-top: 12px; padding: 10px 12px; background: rgba(0,0,0,0.22); border: 1px solid #2f3b50; border-radius: 8px;">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:6px;">
        <strong style="color:${theme.accent}; font-size:13px;">📊 Deployment Status</strong>
        <span id="moe-deploy-status-summary" style="color:${theme.warning}; font-size:14px; font-weight:700; letter-spacing:0.2px;">Idle</span>
      </div>
      <div id="moe-deploy-status-body" style="max-height:150px; overflow:auto; color:#9fb2cc; font-size:12px; line-height:1.45;">
        <div>No deployment activity yet.</div>
      </div>
    </div>
  `;
}

/**
 * Render MoE chat interface section
 * @returns {string} HTML string
 */
function renderMoeChat() {
  const { moeItems } = window.modelOrderingState;
  const theme = getMoeTheme();
  
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
window.toggleShowAllModels = toggleShowAllModels;
