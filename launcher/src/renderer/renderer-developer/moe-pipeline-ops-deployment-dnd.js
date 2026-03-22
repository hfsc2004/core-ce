/**
 *
 * @version 1.1.2 - March 5, 2026
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
      setMoeDeployStatusSummary(`Ready • ${startedAgents.length} agent(s)`);
      
      // Update chat status
      const statusSpan = document.getElementById('moe-chat-status');
      if (statusSpan) {
        statusSpan.textContent = '(Ready)';
        statusSpan.style.color = '#00ff88';
      }
      try {
        await openMoeChatWindowFromPipeline();
        appendMoeDeployStatusLine('Chat window opened.', 'info');
      } catch (openErr) {
        appendMoeDeployStatusLine(`Chat window failed to open: ${openErr?.message || openErr}`, 'error');
      }
    } else {
      throw new Error(result.message || 'Deployment failed');
    }
  } catch (err) {
    stopMoeDeployHeartbeat();
    stopMoeDeployStatusAnimation();
    setMoeDeployBusyUi(false);
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
      console.log('[MoE] Pipeline torn down:', result);
      appendMoeDeployStatusLine(`Pipeline stopped. Closed ${result.closedAgents} agent(s).`, 'success');
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
      appendMoeDeployStatusLine(`Teardown completed with errors: ${(result.errors || []).join('; ')}`, 'warn');
      setMoeDeployStatusSummary('Stopped with warnings');
    }
  } catch (err) {
    stopMoeDeployHeartbeat();
    stopMoeDeployStatusAnimation();
    setMoeDeployBusyUi(false);
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
      return;
    }
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
  if (deployBtn) {
    deployBtn.disabled = !!isBusy;
    deployBtn.style.opacity = isBusy ? '0.7' : '1';
    deployBtn.style.cursor = isBusy ? 'not-allowed' : 'pointer';
    deployBtn.textContent = isBusy && mode === 'deploy' ? '⏳ Deploying...' : '🚀 Deploy';
  }
  if (stopBtn) {
    stopBtn.disabled = !!isBusy;
    stopBtn.style.opacity = isBusy ? '0.7' : '1';
    stopBtn.style.cursor = isBusy ? 'not-allowed' : 'pointer';
    stopBtn.textContent = isBusy && mode === 'stop' ? '⏳ Stopping...' : '⏹️ Stop';
  }
}

function appendMoeDeployStatusLine(message, level = 'info') {
  const body = document.getElementById('moe-deploy-status-body');
  if (!body) return;
  const stamp = new Date().toLocaleTimeString();
  const line = document.createElement('div');
  const color = level === 'error'
    ? '#ff9b9b'
    : level === 'warn'
      ? '#ffd38a'
      : level === 'success'
        ? '#8dffbd'
        : '#9fb2cc';
  line.style.color = color;
  line.textContent = `[${stamp}] ${String(message || '')}`;
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
if (typeof window.openMoeChatWindow !== 'function') {
  window.openMoeChatWindow = openMoeChatWindowFromPipeline;
}
window.handleMoeDragStart = handleMoeDragStart;
window.handleMoeDragEnd = handleMoeDragEnd;
window.handleMoeDragOver = handleMoeDragOver;
window.handleMoeDrop = handleMoeDrop;

function bindMoeDeployButtons() {
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
