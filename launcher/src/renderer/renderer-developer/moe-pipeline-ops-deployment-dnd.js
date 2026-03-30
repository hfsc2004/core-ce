/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * ============================================================================
 * MOE PIPELINE OPS - Deployment and Drag/Drop
 * ============================================================================
 *
 * Extracted from moe-pipeline-ops.js to keep files focused.
 * No behavior changes.
 * ============================================================================
 */

let moeDeploySummaryAnimTimer = null;
let moeDeployHeartbeatTimer = null;
let moeDeployBusySinceMs = 0;
const MOE_DEPLOY_LOG_MAX = 1200;
let moePostDeployChangeWatcherBound = false;

function ensureMoeDeployLogState() {
  if (!window.modelOrderingState || typeof window.modelOrderingState !== 'object') return null;
  if (!Array.isArray(window.modelOrderingState.moeDeployLogLines)) {
    window.modelOrderingState.moeDeployLogLines = [];
  }
  if (typeof window.modelOrderingState.moeDeployStatusSummary !== 'string') {
    window.modelOrderingState.moeDeployStatusSummary = 'IDLE';
  }
  if (typeof window.modelOrderingState.moeDeployFrameState !== 'string') {
    window.modelOrderingState.moeDeployFrameState = 'idle';
  }
  if (window.modelOrderingState.moePostDeployDirty !== true) {
    window.modelOrderingState.moePostDeployDirty = false;
  }
  return window.modelOrderingState;
}

function isMoePipelineRunning() {
  const state = ensureMoeDeployLogState();
  if (!state) return false;
  return String(state.moeDeployFrameState || 'idle').toLowerCase() === 'active';
}

function clearMoePostDeployDirty() {
  const state = ensureMoeDeployLogState();
  if (!state) return;
  state.moePostDeployDirty = false;
}

function markMoePipelineConfigChanged(sourceLabel = 'Node settings') {
  const state = ensureMoeDeployLogState();
  if (!state || !isMoePipelineRunning()) return;
  if (state.moePostDeployDirty === true) return;
  state.moePostDeployDirty = true;
  appendMoeDeployStatusLine(`${sourceLabel} changed after deploy. Stop and Deploy again to apply changes.`, 'warn');
  setMoeDeployStatusSummary('Ready • Redeploy Required');
  renderModelOrdering();
}

function bindMoePostDeployChangeWatcher() {
  if (moePostDeployChangeWatcherBound) return;
  moePostDeployChangeWatcherBound = true;
  document.addEventListener('change', (event) => {
    const target = event?.target;
    if (!target || !target.closest) return;
    const card = target.closest('#moe-pipeline-frame .moe-item');
    if (!card) return;
    if (!target.matches('input, select, textarea')) return;
    const itemType = String(card.getAttribute('data-moe-type') || 'Node').trim();
    const itemLabel = itemType ? `${itemType[0].toUpperCase()}${itemType.slice(1)} card` : 'Node settings';
    markMoePipelineConfigChanged(itemLabel);
  }, true);
}

function applyMoePipelineStatusIndicatorToDom(stateName = 'idle') {
  const el = document.getElementById('moe-pipeline-status-indicator');
  if (!el) return;
  const state = String(stateName || 'idle').toLowerCase();
  if (state === 'active') {
    el.innerHTML = '<span class="moe-status-line" style="color:#22c55e;">[RUNNING]</span><span class="moe-status-tail moe-status-tail-running" aria-hidden="true"><span>.</span><span>.</span><span>.</span><span>.</span><span>.</span><span>.</span><span>.</span><span>.</span></span>';
    el.style.textShadow = '0 0 6px rgba(34,197,94,0.32)';
    return;
  }
  if (state === 'stopping' || state === 'stopped' || state === 'error') {
    el.innerHTML = '<span class="moe-status-line" style="color:#ef4444;">[STOPPED]</span><span class="moe-status-tail moe-status-tail-stopped" aria-hidden="true"><span>.</span><span>.</span><span>.</span><span>.</span><span>.</span><span>.</span><span>.</span><span class="final-dot">.</span></span>';
    el.style.textShadow = 'none';
    return;
  }
  el.innerHTML = '<span class="moe-status-line"><span style="color:#38bdf8;">[</span><span style="color:#6b7280;">IDLE</span><span style="color:#38bdf8;">]</span></span><span class="moe-status-tail moe-status-tail-idle" aria-hidden="true"><span>.</span><span>.</span><span>.</span><span>.</span><span>.</span><span>.</span><span>.</span><span>.</span></span>';
  el.style.textShadow = 'none';
}

function applyMoePipelineFrameStateToDom(stateName = 'idle') {
  const frame = document.getElementById('moe-pipeline-frame');
  const state = String(stateName || 'idle').toLowerCase();
  applyMoePipelineStatusIndicatorToDom(state);
  if (!frame) return;
  if (state === 'active') {
    frame.style.borderColor = '#22c55e';
    frame.style.boxShadow = '0 0 0 1px rgba(34,197,94,0.55), 0 0 18px rgba(34,197,94,0.28)';
    return;
  }
  if (state === 'stopping' || state === 'stopped' || state === 'error') {
    frame.style.borderColor = '#ef4444';
    frame.style.boxShadow = '0 0 0 1px rgba(239,68,68,0.55), 0 0 18px rgba(239,68,68,0.26)';
    return;
  }
  frame.style.borderColor = '#6b7280';
  frame.style.boxShadow = 'none';
}

function setMoePipelineFrameState(stateName = 'idle') {
  const state = ensureMoeDeployLogState();
  const normalized = String(stateName || 'idle').toLowerCase();
  if (state) state.moeDeployFrameState = normalized;
  applyMoePipelineFrameStateToDom(normalized);
}

async function deployMoePipeline() {
  const items = Array.isArray(window.modelOrderingState?.moeItems)
    ? window.modelOrderingState.moeItems
    : [];

  setMoeDeployBusyUi(true, 'deploy');
  startMoeDeployStatusAnimation('Deploying');
  appendMoeDeployStatusLine('Starting deployment...', 'info');
  startMoeDeployHeartbeat('deploy');

  if (!window.electronAPI || typeof window.electronAPI.deployMoEPipeline !== 'function') {
    stopMoeDeployHeartbeat();
    stopMoeDeployStatusAnimation();
    setMoeDeployBusyUi(false);
    appendMoeDeployStatusLine('Deploy API is unavailable. Reload the app and try again.', 'error');
    setMoeDeployStatusSummary('Error');
    return;
  }
  
  if (items.length === 0) {
    stopMoeDeployHeartbeat();
    stopMoeDeployStatusAnimation();
    setMoeDeployBusyUi(false);
    appendMoeDeployStatusLine('No pipeline to deploy. Add agents and gateways first.', 'warn');
    setMoeDeployStatusSummary('Blocked');
    return;
  }
  
  const agentsWithModels = items.filter(
    item => item.type === 'agent' && item.modelId && item.enabled
  );
  
  if (agentsWithModels.length === 0) {
    stopMoeDeployHeartbeat();
    stopMoeDeployStatusAnimation();
    setMoeDeployBusyUi(false);
    appendMoeDeployStatusLine('No agents have models assigned. Assign models to at least one agent before deploying.', 'warn');
    setMoeDeployStatusSummary('Blocked');
    return;
  }
  
  // Check that all agents have local file info
  const missingLocal = agentsWithModels.filter(a => !a.collectionKey || !a.filename);
  if (missingLocal.length > 0) {
    stopMoeDeployHeartbeat();
    stopMoeDeployStatusAnimation();
    setMoeDeployBusyUi(false);
    appendMoeDeployStatusLine(`Some agents are missing local file info: ${missingLocal.map(a => a.name).join(', ')}`, 'warn');
    setMoeDeployStatusSummary('Blocked');
    return;
  }

  try {
    console.log('[MoE] Deploying pipeline via BMOC...');
    appendMoeDeployStatusLine(`Deploy request sent for ${agentsWithModels.length} agent(s).`, 'info');
    appendMoeDeployStatusLine('Waiting for BMOC/session-manager response...', 'info');
    
    const pipelineData = buildMoePipelineData();
    
    const result = await window.electronAPI.deployMoEPipeline(pipelineData);
    
    if (result.success) {
      stopMoeDeployHeartbeat();
      stopMoeDeployStatusAnimation();
      setMoeDeployBusyUi(false);
      setMoePipelineFrameState('active');
      console.log('[MoE] Pipeline deployed:', result);
      const startedAgents = Object.values(result.agents || {});
      appendMoeDeployStatusLine(`Deployment ready: ${result.deploymentId}`, 'success');
      if (result.ingress?.enabled) {
        appendMoeDeployStatusLine(
          `Pipeline ingress online: port ${result.ingress.port} (bind ${result.ingress.bindHost || result.ingress.host || '127.0.0.1'}, access ${result.ingress.accessHost || result.ingress.bindHost || result.ingress.host || '127.0.0.1'})`,
          'success'
        );
        appendMoeDeployStatusLine(`Pipeline path: ${result.ingress.endpoint || '/v1/chat'}`, 'info');
      }
      startedAgents.forEach((agent) => {
        appendMoeDeployStatusLine(`Agent online: ${agent.name} (port ${agent.port})`, 'success');
      });
      clearMoePostDeployDirty();
      setMoeDeployStatusSummary(`Ready • ${startedAgents.length} agent(s)`);
      
      // Update chat status
      const statusSpan = document.getElementById('moe-chat-status');
      if (statusSpan) {
        statusSpan.textContent = '(Ready)';
        statusSpan.style.color = '#00ff88';
      }
      appendMoeDeployStatusLine('Deployment complete. Click "Open Chat" when ready.', 'info');
    } else {
      throw new Error(result.message || 'Deployment failed');
    }
  } catch (err) {
    stopMoeDeployHeartbeat();
    stopMoeDeployStatusAnimation();
    setMoeDeployBusyUi(false);
    setMoePipelineFrameState('error');
    console.error('[MoE] Deployment failed:', err);
    appendMoeDeployStatusLine(`Deployment failed: ${err.message}`, 'error');
    setMoeDeployStatusSummary('Error');
  }
}

async function openMoeChatWindowFromPipeline() {
  const items = (window.modelOrderingState && Array.isArray(window.modelOrderingState.moeItems))
    ? window.modelOrderingState.moeItems
    : [];
  const agents = items
    .filter((item) => item && item.type === 'agent')
    .map((agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role || agent.name,
      modelId: agent.modelId,
      modelName: agent.modelName,
      rlmAssist: agent.rlmAssist === true
    }));

  const pipelineConfig = {
    name: 'PSF Relay Pipeline',
    agents
  };

  const result = await window.electronAPI.openMoeChatWindow(pipelineConfig);
  if (!result || result.success !== true) {
    throw new Error(result?.message || 'Failed to open chat window');
  }
  return result;
}

async function teardownMoePipeline() {
  setMoeDeployBusyUi(true, 'stop');
  startMoeDeployStatusAnimation('Stopping');
  appendMoeDeployStatusLine('Stopping all deployed agents...', 'info');
  startMoeDeployHeartbeat('stop');
  try {
    const result = await window.electronAPI.teardownMoEPipeline();
    
    if (result.success) {
      stopMoeDeployHeartbeat();
      stopMoeDeployStatusAnimation();
      setMoeDeployBusyUi(false);
      setMoePipelineFrameState('stopped');
      console.log('[MoE] Pipeline torn down:', result);
      appendMoeDeployStatusLine(`Pipeline stopped. Closed ${result.closedAgents} agent(s).`, 'success');
      clearMoePostDeployDirty();
      setMoeDeployStatusSummary('Stopped');
      
      const statusSpan = document.getElementById('moe-chat-status');
      if (statusSpan) {
        statusSpan.textContent = '(Deploy pipeline first)';
        statusSpan.style.color = '#888';
      }
    } else {
      stopMoeDeployHeartbeat();
      stopMoeDeployStatusAnimation();
      setMoeDeployBusyUi(false);
      setMoePipelineFrameState('stopped');
      appendMoeDeployStatusLine(`Teardown completed with errors: ${(result.errors || []).join('; ')}`, 'warn');
      clearMoePostDeployDirty();
      setMoeDeployStatusSummary('Stopped with warnings');
    }
  } catch (err) {
    stopMoeDeployHeartbeat();
    stopMoeDeployStatusAnimation();
    setMoeDeployBusyUi(false);
    setMoePipelineFrameState('error');
    console.error('[MoE] Teardown failed:', err);
    appendMoeDeployStatusLine(`Teardown failed: ${err.message}`, 'error');
    setMoeDeployStatusSummary('Error');
  }
}

async function getMoePipelineStatus() {
  try {
    const status = await window.electronAPI.getMoEStatus();
    
    if (!status) {
      appendMoeDeployStatusLine('No active MoE deployment.', 'info');
      setMoeDeployStatusSummary('Idle');
      setMoePipelineFrameState('stopped');
      return;
    }
    setMoePipelineFrameState('active');
    setMoeDeployStatusSummary(`Ready • ${status.agentCount || 0} agent(s)`);
    appendMoeDeployStatusLine(`Deployment ID: ${status.id || 'n/a'}`, 'info');
    appendMoeDeployStatusLine(`Started: ${status.startedAt || 'n/a'}`, 'info');
    appendMoeDeployStatusLine(`Agents: ${status.agentCount || 0}`, 'info');
    if (status.ingress?.enabled) {
      appendMoeDeployStatusLine(
        `Pipeline ingress: port ${status.ingress.port} (bind ${status.ingress.bindHost || status.ingress.host || '127.0.0.1'}, access ${status.ingress.accessHost || status.ingress.bindHost || status.ingress.host || '127.0.0.1'})`,
        'info'
      );
      appendMoeDeployStatusLine(`Pipeline path: ${status.ingress.endpoint || '/v1/chat'}`, 'info');
    }
    for (const agent of Object.values(status.agents || {})) {
      appendMoeDeployStatusLine(`Agent: ${agent.name} (port ${agent.port}, PID ${agent.pid})`, 'info');
    }
  } catch (err) {
    console.error('[MoE] Status check failed:', err);
    appendMoeDeployStatusLine(`Failed to get status: ${err.message}`, 'error');
    setMoeDeployStatusSummary('Error');
  }
}

// ============================================================================
// DRAG & DROP
// ============================================================================

function handleMoeDragStart(event, itemId) {
  window.modelOrderingState.draggedItem = itemId;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', itemId);
  event.target.style.opacity = '0.5';
}

function handleMoeDragEnd(event) {
  window.modelOrderingState.draggedItem = null;
  event.target.style.opacity = '1';
}

function handleMoeDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
}

function handleMoeDrop(event) {
  event.preventDefault();
  const draggedId = window.modelOrderingState.draggedItem;
  if (!draggedId) return;
  
  const targetElement = event.target.closest('.moe-item');
  if (!targetElement) return;
  
  const targetId = targetElement.dataset.moeId;
  if (draggedId === targetId) return;
  
  const items = window.modelOrderingState.moeItems;
  const draggedIndex = items.findIndex(i => i.id === draggedId);
  const targetIndex = items.findIndex(i => i.id === targetId);
  
  if (draggedIndex !== -1 && targetIndex !== -1) {
    const [removed] = items.splice(draggedIndex, 1);
    items.splice(targetIndex, 0, removed);
    console.log('[MoE] Reordered items:', draggedId, 'to position', targetIndex);
    renderModelOrdering();
  }
}

function setMoeDeployStatusSummary(text) {
  const state = ensureMoeDeployLogState();
  if (state) state.moeDeployStatusSummary = String(text || '');
  const summary = document.getElementById('moe-deploy-status-summary');
  if (summary) summary.textContent = String(text || '');
}

function startMoeDeployStatusAnimation(baseText) {
  stopMoeDeployStatusAnimation();
  const root = String(baseText || 'Working').trim() || 'Working';
  let ticks = 0;
  const render = () => {
    const dots = '.'.repeat((ticks % 3) + 1);
    setMoeDeployStatusSummary(`${root}${dots}`);
    ticks += 1;
  };
  render();
  moeDeploySummaryAnimTimer = setInterval(render, 400);
}

function stopMoeDeployStatusAnimation() {
  if (moeDeploySummaryAnimTimer) {
    clearInterval(moeDeploySummaryAnimTimer);
    moeDeploySummaryAnimTimer = null;
  }
}

function startMoeDeployHeartbeat(mode = 'deploy') {
  stopMoeDeployHeartbeat();
  moeDeployBusySinceMs = Date.now();
  moeDeployHeartbeatTimer = setInterval(() => {
    const elapsedSec = Math.max(0, Math.floor((Date.now() - moeDeployBusySinceMs) / 1000));
    const verb = mode === 'stop' ? 'Stopping' : 'Deploying';
    appendMoeDeployStatusLine(`${verb} in progress... (${elapsedSec}s elapsed)`, 'info');
  }, 3000);
}

function stopMoeDeployHeartbeat() {
  if (moeDeployHeartbeatTimer) {
    clearInterval(moeDeployHeartbeatTimer);
    moeDeployHeartbeatTimer = null;
  }
  moeDeployBusySinceMs = 0;
}

function setMoeDeployBusyUi(isBusy, mode = 'deploy') {
  const deployBtn = document.getElementById('moe-deploy-btn');
  const stopBtn = document.getElementById('moe-stop-btn');
  if (isBusy && mode === 'deploy') {
    setMoePipelineFrameState('active');
  } else if (isBusy && mode === 'stop') {
    setMoePipelineFrameState('stopping');
  } else {
    const current = String(window.modelOrderingState?.moeDeployFrameState || 'idle').toLowerCase();
    applyMoePipelineFrameStateToDom(current);
  }
  if (deployBtn) {
    deployBtn.disabled = !!isBusy;
    deployBtn.style.opacity = isBusy ? '0.7' : '1';
    deployBtn.style.cursor = isBusy ? 'not-allowed' : 'pointer';
    deployBtn.title = isBusy && mode === 'deploy' ? 'Deploying...' : 'Deploy';
  }
  if (stopBtn) {
    stopBtn.disabled = !!isBusy;
    stopBtn.style.opacity = isBusy ? '0.7' : '1';
    stopBtn.style.cursor = isBusy ? 'not-allowed' : 'pointer';
    stopBtn.title = isBusy && mode === 'stop' ? 'Stopping...' : 'Stop';
  }
}

function appendMoeDeployStatusLine(message, level = 'info') {
  const stamp = new Date().toLocaleTimeString();
  const safeMessage = String(message || '');
  const safeLevel = String(level || 'info');
  const state = ensureMoeDeployLogState();
  if (state) {
    state.moeDeployLogLines.push({
      stamp,
      message: safeMessage,
      level: safeLevel
    });
    if (state.moeDeployLogLines.length > MOE_DEPLOY_LOG_MAX) {
      state.moeDeployLogLines.splice(0, state.moeDeployLogLines.length - MOE_DEPLOY_LOG_MAX);
    }
  }

  const body = document.getElementById('moe-deploy-status-body');
  if (typeof window.appendMoeActivityLine === 'function') {
    window.appendMoeActivityLine(`[Deploy] ${safeMessage}`, safeLevel);
  }
  if (!body) return;
  const line = document.createElement('div');
  const color = safeLevel === 'error'
    ? '#ff9b9b'
    : safeLevel === 'warn'
      ? '#ffd38a'
      : safeLevel === 'success'
        ? '#8dffbd'
        : '#9fb2cc';
  line.style.color = color;
  line.textContent = `[${stamp}] ${safeMessage}`;
  if (body.textContent.includes('No deployment activity yet.')) {
    body.innerHTML = '';
  }
  body.appendChild(line);
  body.scrollTop = body.scrollHeight;
}

window.deployMoePipeline = deployMoePipeline;
window.teardownMoePipeline = teardownMoePipeline;
window.getMoePipelineStatus = getMoePipelineStatus;
window.openMoeChatWindowFromPipeline = openMoeChatWindowFromPipeline;
window.setMoeDeployStatusSummary = setMoeDeployStatusSummary;
window.appendMoeDeployStatusLine = appendMoeDeployStatusLine;
window.bindMoeDeployButtons = bindMoeDeployButtons;
window.markMoePipelineConfigChanged = markMoePipelineConfigChanged;
window.bindMoePostDeployChangeWatcher = bindMoePostDeployChangeWatcher;
if (typeof window.openMoeChatWindow !== 'function') {
  window.openMoeChatWindow = openMoeChatWindowFromPipeline;
}
window.handleMoeDragStart = handleMoeDragStart;
window.handleMoeDragEnd = handleMoeDragEnd;
window.handleMoeDragOver = handleMoeDragOver;
window.handleMoeDrop = handleMoeDrop;

function bindMoeDeployButtons() {
  const initialState = String(window.modelOrderingState?.moeDeployFrameState || 'idle').toLowerCase();
  applyMoePipelineFrameStateToDom(initialState);
  setMoeDeployBusyUi(false);
  const deployBtn = document.getElementById('moe-deploy-btn');
  if (deployBtn && deployBtn.dataset.boundClick !== '1') {
    deployBtn.addEventListener('click', () => {
      deployMoePipeline().catch((err) => {
        console.error('[MoE] Deploy click handler failed:', err);
        appendMoeDeployStatusLine(`Deploy handler error: ${err?.message || err}`, 'error');
        setMoeDeployStatusSummary('Error');
        stopMoeDeployHeartbeat();
        stopMoeDeployStatusAnimation();
        setMoeDeployBusyUi(false);
      });
    });
    deployBtn.dataset.boundClick = '1';
  }

  const stopBtn = document.getElementById('moe-stop-btn');
  if (stopBtn && stopBtn.dataset.boundClick !== '1') {
    stopBtn.addEventListener('click', () => {
      teardownMoePipeline().catch((err) => {
        console.error('[MoE] Stop click handler failed:', err);
        appendMoeDeployStatusLine(`Stop handler error: ${err?.message || err}`, 'error');
        setMoeDeployStatusSummary('Error');
        stopMoeDeployHeartbeat();
        stopMoeDeployStatusAnimation();
        setMoeDeployBusyUi(false);
      });
    });
    stopBtn.dataset.boundClick = '1';
  }
}
