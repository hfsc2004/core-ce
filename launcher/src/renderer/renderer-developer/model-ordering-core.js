/**
 * ============================================================================
 * MODEL ORDERING CORE - Main Render Dispatcher
 * ============================================================================
 *
 * Core render module for model ordering screen. Handles theme helper and main
 * render dispatcher only. Initialization, scope/view controls, keyboard
 * navigation, and style helpers are in model-ordering-core-helpers.js.
 *
 * @module model-ordering-core
 * @version 1.1.2 - March 5, 2026
 * ============================================================================
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

window.getMoeTheme = getMoeTheme;

function renderModelOrdering() {
  const container = document.getElementById('model-ordering-content');
  if (!container) return;

  const { scopeMode, selectedModels, editMode } = window.modelOrderingState;
  const theme = getMoeTheme();
  const isPipelineMode = scopeMode === 'pipeline';

  container.innerHTML = `
    <div style="max-width: 1200px; margin: 0 auto;">

      <!-- Controls Bar -->
      <div style="background: ${editMode ? 'rgba(255,212,0,0.1)' : (isPipelineMode ? theme.accentLight : 'var(--psf-accent-light, rgba(0,212,255,0.1))')}; border: 2px solid ${editMode ? '#ffd400' : (isPipelineMode ? theme.accent : '#00d4ff')}; border-radius: 10px; padding: 15px; margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px;">

          <!-- Left: Mode Toggle & View Options -->
          <div style="display: flex; gap: 10px; align-items: center;">
            ${editMode ? `
              <span style="color: #ffd400; font-weight: bold; font-size: 14px;">✏️ Reorder Mode</span>
            ` : ''}
          </div>

          <!-- Center: Collection Selector (shown in per-collection mode) -->
          <span></span>

          <!-- Right: Actions (different based on mode) -->
          <div style="display: flex; gap: 10px; align-items: center;">
            ${editMode ? `
              <span style="color: #888; font-size: 13px;">
                ${selectedModels.size > 0 ? `${selectedModels.size} selected` : ''}
              </span>
              <button onclick="groupSelectedModels()"
                      ${selectedModels.size < 2 ? 'disabled' : ''}
                      style="padding: 8px 15px; background: rgba(255,212,0,0.2); border: 1px solid #ffd400; border-radius: 5px; color: #ffd400; cursor: pointer; ${selectedModels.size < 2 ? 'opacity: 0.5;' : ''}">
                📦 Group Selected
              </button>
              <button onclick="clearSelection()"
                      ${selectedModels.size === 0 ? 'disabled' : ''}
                      style="padding: 8px 15px; background: rgba(255,255,255,0.1); border: 1px solid #555; border-radius: 5px; color: #aaa; cursor: pointer; ${selectedModels.size === 0 ? 'opacity: 0.5;' : ''}">
                ✕ Clear
              </button>
              <button onclick="saveModelOrdering()"
                      style="padding: 8px 15px; background: rgba(0,255,136,0.2); border: 1px solid ${theme.success}; border-radius: 5px; color: ${theme.success}; cursor: pointer;">
                💾 Save Order
              </button>
              <button onclick="toggleEditMode()"
                      style="padding: 8px 15px; background: rgba(255,107,107,0.2); border: 1px solid ${theme.error}; border-radius: 5px; color: ${theme.error}; cursor: pointer;">
                ✓ Done
              </button>
            ` : `
              ${isPipelineMode ? `
                <button onclick="addMoeAgent()"
                        style="padding: 8px 15px; background: ${theme.accentMedium}; border: 1px solid ${theme.accent}; border-radius: 5px; color: ${theme.accent}; cursor: pointer;">
                  🤖 + Agent
                </button>
                <button onclick="addMoeChannel()"
                        style="padding: 8px 15px; background: rgba(255,165,0,0.2); border: 1px solid #ffa500; border-radius: 5px; color: #ffa500; cursor: pointer;">
                  🔗 + Channel
                </button>
                <button onclick="addMoeGateway()"
                        style="padding: 8px 15px; background: rgba(0,255,136,0.2); border: 1px solid ${theme.success}; border-radius: 5px; color: ${theme.success}; cursor: pointer;">
                  📡 + Gateway
                </button>
                <button onclick="addMoeBindings()"
                        style="padding: 8px 15px; background: rgba(255,255,255,0.1); border: 1px solid #bbb; border-radius: 5px; color: #ddd; cursor: pointer;">
                  🧩 + Bindings
                </button>
                <button onclick="addMoeEndpointRegistry()"
                        style="padding: 8px 15px; background: rgba(79,70,229,0.2); border: 1px solid #818cf8; border-radius: 5px; color: #c7d2fe; cursor: pointer;">
                  🧭 + Endpoint Registry
                </button>
                <span style="border-left: 1px solid #333; height: 24px;"></span>
                <button id="moe-deploy-btn"
                        style="padding: 8px 15px; background: rgba(0,255,136,0.3); border: 2px solid ${theme.success}; border-radius: 5px; color: ${theme.success}; cursor: pointer; font-weight: bold;">
                  🚀 Deploy
                </button>
                <button id="moe-stop-btn"
                        style="padding: 8px 15px; background: rgba(255,107,107,0.2); border: 1px solid ${theme.error}; border-radius: 5px; color: ${theme.error}; cursor: pointer;">
                  ⏹️ Stop
                </button>
                <button onclick="openMoeChatWindowFromPipeline()"
                        style="padding: 8px 15px; background: ${theme.accentMedium}; border: 1px solid ${theme.accent}; border-radius: 5px; color: #9fe8ff; cursor: pointer;">
                  🗗 Open Chat
                </button>
                <span style="border-left: 1px solid #333; height: 24px;"></span>
                <button onclick="saveMoePipelineAs()"
                        style="padding: 8px 15px; background: var(--psf-accent-medium, rgba(0,212,255,0.2)); border: 1px solid var(--psf-accent, #00d4ff); border-radius: 5px; color: #9fe8ff; cursor: pointer;">
                  💾 Save Profile
                </button>
                <button onclick="loadMoePipelineProfile()"
                        style="padding: 8px 15px; background: rgba(255,255,255,0.1); border: 1px solid #666; border-radius: 5px; color: #aaa; cursor: pointer;">
                  🗂️ Load Profile
                </button>
                <button onclick="deleteMoePipelineProfile()"
                        style="padding: 8px 15px; background: rgba(255,107,107,0.12); border: 1px solid ${theme.error}; border-radius: 5px; color: ${theme.error}; cursor: pointer;">
                  🗑️ Delete Profile
                </button>
                <button onclick="toggleEditMode()"
                        style="padding: 8px 15px; background: rgba(255,212,0,0.2); border: 1px solid ${theme.warning}; border-radius: 5px; color: ${theme.warning}; cursor: pointer;">
                  ✏️ Reorder
                </button>
              ` : `
                <button onclick="toggleEditMode()"
                        style="padding: 8px 15px; background: rgba(255,212,0,0.2); border: 1px solid ${theme.warning}; border-radius: 5px; color: ${theme.warning}; cursor: pointer;">
                  ✏️ Reorder
                </button>
                <button onclick="refreshDownloadStatus()"
                        style="padding: 8px 15px; background: rgba(255,255,255,0.1); border: 1px solid #666; border-radius: 5px; color: #aaa; cursor: pointer;"
                        title="Refresh download status">
                  🔄 Refresh
                </button>
              `}
            `}
          </div>
        </div>
      </div>

      <!-- MoE/IRG Pipeline View -->
      ${renderMoePipeline()}
    </div>
  `;

  addOrderingStyles();
  if (typeof window.refreshMoeAttachmentCounts === 'function') {
    // Async refresh with caching; rerender only when counts changed.
    window.refreshMoeAttachmentCounts({ force: false, rerender: true }).catch(() => {});
  }
  if (typeof window.bindMoeDeployButtons === 'function') {
    try { window.bindMoeDeployButtons(); } catch (_) { /* no-op */ }
  }
  if (typeof window.initializeMoeChatInput === 'function') {
    try { window.initializeMoeChatInput(); } catch (_) { /* no-op */ }
  }
}

window.renderModelOrdering = renderModelOrdering;
