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
  const deployFrameState = String(window.modelOrderingState?.moeDeployFrameState || 'idle').toLowerCase();
  const pipelineStatusDisplay = deployFrameState === 'active'
    ? '<span class="moe-status-line" style="color:#22c55e;">[RUNNING]</span><span class="moe-status-tail moe-status-tail-running" aria-hidden="true"><span>.</span><span>.</span><span>.</span><span>.</span><span>.</span><span>.</span><span>.</span><span>.</span></span>'
    : ((deployFrameState === 'stopping' || deployFrameState === 'stopped' || deployFrameState === 'error')
      ? '<span class="moe-status-line" style="color:#ef4444;">[STOPPED]</span><span class="moe-status-tail moe-status-tail-stopped" aria-hidden="true"><span>.</span><span>.</span><span>.</span><span>.</span><span>.</span><span>.</span><span>.</span><span class="final-dot">.</span></span>'
      : '<span class="moe-status-line"><span style="color:#38bdf8;">[</span><span style="color:#6b7280;">IDLE</span><span style="color:#38bdf8;">]</span></span><span class="moe-status-tail moe-status-tail-idle" aria-hidden="true"><span>.</span><span>.</span><span>.</span><span>.</span><span>.</span><span>.</span><span>.</span><span>.</span></span>');

  container.innerHTML = `
    <div style="max-width: 1200px; position: relative; left: 50%; transform: translateX(-50%) scale(1.5); transform-origin: top center; width: calc(100% / 1.5);">

      <!-- Controls Bar -->
      <div id="model-ordering-controls-bar" style="display:none; background: #161f2e; border: 1px solid rgba(88,166,255,0.22); border-radius: 6px; padding: 15px; margin-bottom: 12px; position: sticky; top: 76px; z-index: 35;">
        <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 10px; width: 100%; justify-content: space-between;">

          <!-- Left: Mode Toggle & View Options -->
          <div style="display: flex; gap: 6px; align-items: center; flex: 0 0 auto;">
            ${editMode ? `
              <span style="color: #ffd400; font-weight: bold; font-size: 14px;">✏️ Reorder Mode</span>
            ` : ''}
          </div>

          <!-- Center: Collection Selector (shown in per-collection mode) -->
          <span style="flex: 1 1 auto; min-width: 0;"></span>

          <!-- Right: Actions (different based on mode) -->
          <div id="model-ordering-actions-bar" style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap; flex: 1 1 100%; min-width: 0; max-width: 100%; justify-content: flex-start; align-content: flex-start;">
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
                        style="padding: 7px 12px; min-height: 32px; background: transparent; border: 1px solid ${theme.accent}; border-radius: 5px; color: ${theme.accent}; cursor: pointer; font-size: 11px; font-weight: 500; white-space: nowrap;">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#38bdf8" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><circle cx="6.5" cy="5" r="2.8"/><path d="M1,12 Q1,9 6.5,9 Q12,9 12,12"/></svg> + Agent
                </button>
                <button onclick="addMoeChannel()"
                        style="padding: 7px 12px; min-height: 32px; background: transparent; border: 1px solid #ffa500; border-radius: 5px; color: #ffa500; cursor: pointer; font-size: 11px; font-weight: 500; white-space: nowrap;">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#58a6ff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><line x1="1" y1="6.5" x2="12" y2="6.5"/><polyline points="8,3 12,6.5 8,10"/></svg> + Channel
                </button>
                <button onclick="addMoeGateway()"
                        style="padding: 7px 12px; min-height: 32px; background: transparent; border: 1px solid ${theme.success}; border-radius: 5px; color: ${theme.success}; cursor: pointer; font-size: 11px; font-weight: 500; white-space: nowrap;">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#3fb950" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><rect x="1" y="3" width="11" height="7" rx="1.5"/><line x1="3.5" y1="6" x2="7" y2="6"/><line x1="3.5" y1="8.5" x2="9.5" y2="8.5"/></svg> + Gateway
                </button>
                <button onclick="addMoeBindings()"
                        style="padding: 7px 12px; min-height: 32px; background: transparent; border: 1px solid #bbb; border-radius: 5px; color: #ddd; cursor: pointer; font-size: 11px; font-weight: 500; white-space: nowrap;">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#d2991e" stroke-width="1.7" stroke-linecap="round" style="vertical-align:middle;"><path d="M3,6.5 C3,4.5 10,4.5 10,6.5 C10,8.5 3,8.5 3,6.5Z"/><line x1="1" y1="6.5" x2="3" y2="6.5"/><line x1="10" y1="6.5" x2="12" y2="6.5"/></svg> + Bindings
                </button>
                <button onclick="addMoeEndpointRegistry()"
                        style="padding: 7px 12px; min-height: 32px; background: transparent; border: 1px solid #818cf8; border-radius: 5px; color: #c7d2fe; cursor: pointer; font-size: 11px; font-weight: 500; white-space: nowrap;">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="#f0883e" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><circle cx="6.5" cy="6.5" r="2"/><circle cx="6.5" cy="6.5" r="5.5"/><line x1="6.5" y1="1" x2="6.5" y2="4.5"/><line x1="6.5" y1="8.5" x2="6.5" y2="12"/><line x1="1" y1="6.5" x2="4.5" y2="6.5"/><line x1="8.5" y1="6.5" x2="12" y2="6.5"/></svg> + Endpoint Registry
                </button>
                <span style="border-left: 1px solid #333; height: 24px; margin: 0 2px;"></span>
                <button id="moe-deploy-btn"
                        style="padding: 7px 12px; min-height: 32px; background: transparent; border: 2px solid ${theme.success}; border-radius: 5px; color: ${theme.success}; cursor: pointer; font-weight: 600; font-size: 11px; white-space: nowrap;">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="#3fb950" style="vertical-align:middle;"><polygon points="2,1 9,5 2,9"/></svg> Deploy
                </button>
                <button id="moe-stop-btn"
                        style="padding: 7px 12px; min-height: 32px; background: transparent; border: 1px solid ${theme.error}; border-radius: 5px; color: ${theme.error}; cursor: pointer; font-size: 11px; font-weight: 500; white-space: nowrap;">
                  <svg width="9" height="9" viewBox="0 0 9 9" fill="#f85149" style="vertical-align:middle;"><rect x="1" y="1" width="7" height="7" rx="1"/></svg> Stop
                </button>
                <button onclick="loadMoePipelineProfile()"
                        style="padding: 7px 12px; min-height: 32px; background: transparent; border: 1px solid #666; border-radius: 5px; color: #aaa; cursor: pointer; font-size: 11px; font-weight: 500; white-space: nowrap;">
                  Load Profile
                </button>
                <span style="border-left: 1px solid #333; height: 24px; margin: 0 2px;"></span>
                <button onclick="saveMoePipelineAs()"
                        style="padding: 7px 12px; min-height: 32px; background: transparent; border: 1px solid var(--psf-accent, #00d4ff); border-radius: 5px; color: #9fe8ff; cursor: pointer; font-size: 11px; font-weight: 500; white-space: nowrap;">
                  Save Profile
                </button>
                <button onclick="openMoeChatWindowFromPipeline()"
                        style="padding: 7px 12px; min-height: 32px; background: transparent; border: 1px solid ${theme.accent}; border-radius: 5px; color: #9fe8ff; cursor: pointer; font-size: 11px; font-weight: 500; white-space: nowrap;">
                  Open Chat
                </button>
                <button onclick="deleteMoePipelineProfile()"
                        style="padding: 7px 12px; min-height: 32px; background: transparent; border: 1px solid ${theme.error}; border-radius: 5px; color: ${theme.error}; cursor: pointer; font-size: 11px; font-weight: 500; white-space: nowrap;">
                  Delete Profile
                </button>
                <button onclick="toggleEditMode()"
                        style="padding: 7px 12px; min-height: 32px; background: transparent; border: 1px solid ${theme.warning}; border-radius: 5px; color: ${theme.warning}; cursor: pointer; font-size: 11px; font-weight: 500; white-space: nowrap;">
                  Reorder
                </button>
                <span id="moe-pipeline-status-indicator"
                      style="padding: 7px 4px; min-height: 32px; display: inline-flex; align-items: center; font-size: 21px; font-weight: 700; white-space: nowrap; letter-spacing: 0.04em; line-height: 1; align-self: center;">
                  ${pipelineStatusDisplay}
                </span>
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
  const headerControls = document.getElementById('model-ordering-header-controls');
  const actionsBar = document.getElementById('model-ordering-actions-bar');
  if (headerControls && actionsBar) {
    headerControls.innerHTML = '';
    actionsBar.style.flex = '1 1 auto';
    actionsBar.style.width = 'auto';
    actionsBar.style.maxWidth = '100%';
    actionsBar.style.overflow = 'hidden';
    actionsBar.style.alignItems = 'flex-start';
    actionsBar.style.alignContent = 'flex-start';
    actionsBar.style.justifyContent = 'flex-start';
    actionsBar.style.flexWrap = 'wrap';
    headerControls.appendChild(actionsBar);
  }
  if (typeof window.bindMoePostDeployChangeWatcher === 'function') {
    try { window.bindMoePostDeployChangeWatcher(); } catch (_) { /* no-op */ }
  }
  if (typeof window.initializeMoeChatInput === 'function') {
    try { window.initializeMoeChatInput(); } catch (_) { /* no-op */ }
  }
}

window.renderModelOrdering = renderModelOrdering;
