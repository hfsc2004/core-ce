/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * ============================================================================
 * MOE PIPELINE OPS - Item Lifecycle
 * ============================================================================
 *
 * Extracted from moe-pipeline-ops.js to keep files focused.
 * No behavior changes.
 * ============================================================================
 */

function addMoeAgent() {
  const agent = window.createAgent('New Agent');
  if (typeof window.ensureAgentRlmAttachmentSession === 'function') {
    window.ensureAgentRlmAttachmentSession(agent);
  }
  window.modelOrderingState.moeItems.push(agent);
  ensureExpandedMoeItemsState();
  ensureMoeItemExpanded(agent.id);
  console.log('[MoE] Added agent:', agent.id);
  renderModelOrdering();
}

function addMoeChannel() {
  const channel = window.createChannel('bidirectional');
  window.modelOrderingState.moeItems.push(channel);
  console.log('[MoE] Added channel:', channel.id);
  renderModelOrdering();
}

function addMoeGateway() {
  const gateway = window.createGateway('User Gateway');
  window.modelOrderingState.moeItems.push(gateway);
  ensureExpandedMoeItemsState();
  ensureMoeItemExpanded(gateway.id);
  console.log('[MoE] Added gateway:', gateway.id);
  renderModelOrdering();
}

function addMoeBindings() {
  const bindings = window.createBindings('Runtime Bindings');
  window.modelOrderingState.moeItems.push(bindings);
  ensureExpandedMoeItemsState();
  ensureMoeItemExpanded(bindings.id);
  console.log('[MoE] Added bindings:', bindings.id);
  renderModelOrdering();
}

function addMoeEndpointRegistry() {
  const items = window.modelOrderingState.moeItems || [];
  const existing = items.find((item) => item.type === 'endpoint_registry');
  if (existing) {
    ensureExpandedMoeItemsState();
    ensureMoeItemExpanded(existing.id);
    renderModelOrdering();
    return;
  }
  const registry = window.createEndpointRegistryItem();
  items.push(registry);
  ensureExpandedMoeItemsState();
  ensureMoeItemExpanded(registry.id);
  console.log('[MoE] Added endpoint registry item:', registry.id);
  renderModelOrdering();
}

function addMoeCliAgent() {
  const creator = typeof window.createCliAgent === 'function'
    ? window.createCliAgent
    : null;
  if (!creator) return;
  const cliAgent = creator('CLI Agent');
  window.modelOrderingState.moeItems.push(cliAgent);
  ensureExpandedMoeItemsState();
  ensureMoeItemExpanded(cliAgent.id);
  console.log('[MoE] Added CLI Agent:', cliAgent.id);
  renderModelOrdering();
}

function ensureExpandedMoeItemsState() {
  if (!Array.isArray(window.modelOrderingState.expandedMoeItems)) {
    window.modelOrderingState.expandedMoeItems = [];
  }
  const legacyExpanded = window.modelOrderingState.expandedMoeItem;
  if (legacyExpanded && !window.modelOrderingState.expandedMoeItems.includes(legacyExpanded)) {
    window.modelOrderingState.expandedMoeItems.push(legacyExpanded);
  }
}

function ensureMoeItemExpanded(itemId) {
  const expanded = window.modelOrderingState.expandedMoeItems;
  if (!expanded.includes(itemId)) {
    expanded.push(itemId);
  }
  window.modelOrderingState.expandedMoeItem = itemId;
}

// ============================================================================
// ITEM DELETION & TOGGLE
// ============================================================================

function deleteMoeItem(itemId) {
  const items = window.modelOrderingState.moeItems;
  const index = items.findIndex(i => i.id === itemId);
  if (index !== -1) {
    items.splice(index, 1);
    ensureExpandedMoeItemsState();
    window.modelOrderingState.expandedMoeItems = window.modelOrderingState.expandedMoeItems.filter((id) => id !== itemId);
    if (window.modelOrderingState.expandedMoeItem === itemId) {
      const remaining = window.modelOrderingState.expandedMoeItems;
      window.modelOrderingState.expandedMoeItem = remaining.length ? remaining[remaining.length - 1] : null;
    }
    console.log('[MoE] Deleted item:', itemId);
    renderModelOrdering();
  }
}

function toggleMoeExpand(itemId) {
  ensureExpandedMoeItemsState();
  const expanded = window.modelOrderingState.expandedMoeItems;
  if (expanded.includes(itemId)) {
    window.modelOrderingState.expandedMoeItems = expanded.filter((id) => id !== itemId);
    if (window.modelOrderingState.expandedMoeItem === itemId) {
      const remaining = window.modelOrderingState.expandedMoeItems;
      window.modelOrderingState.expandedMoeItem = remaining.length ? remaining[remaining.length - 1] : null;
    }
  } else {
    ensureMoeItemExpanded(itemId);
    const item = window.modelOrderingState.moeItems.find((i) => i.id === itemId);
    if (item?.type === 'gateway' && typeof refreshMoeSerialPorts === 'function') {
      Promise.resolve(refreshMoeSerialPorts(itemId, { silent: true })).catch((err) => {
        console.warn('[MoE] Background serial refresh failed:', err?.message || err);
      });
    }
  }
  renderModelOrdering();
}

function handleMoeItemClick(event, itemId) {
  if (window.__moeCanvasDidDrag === true) {
    window.__moeCanvasDidDrag = false;
    return;
  }
  const target = event?.target;
  if (target?.closest?.('.drag-handle')) {
    return;
  }
  if (target?.closest?.('input, textarea, select, button, label, [contenteditable]:not([contenteditable="false"])')) {
    return;
  }
  toggleMoeExpand(itemId);
}

function isMoeGraphModeEnabled() {
  return window.modelOrderingState?.moeGraphMode === true;
}

function clampMoeGraphZoom(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0.7;
  return Math.max(0.45, Math.min(1.5, parsed));
}

function setMoeGraphZoom(value, rerender = true) {
  if (!window.modelOrderingState || typeof window.modelOrderingState !== 'object') return;
  window.modelOrderingState.moeGraphZoom = clampMoeGraphZoom(value);
  if (rerender) renderModelOrdering();
}

function adjustMoeGraphZoom(delta) {
  const current = clampMoeGraphZoom(window.modelOrderingState?.moeGraphZoom);
  const next = Math.round((current + Number(delta || 0)) * 100) / 100;
  setMoeGraphZoom(next, true);
}

function toggleMoeGraphMode() {
  if (!window.modelOrderingState || typeof window.modelOrderingState !== 'object') return;
  window.modelOrderingState.moeGraphMode = !isMoeGraphModeEnabled();
  renderModelOrdering();
}

function beginMoeCanvasDrag(event, itemId) {
  if (!isMoeGraphModeEnabled()) return;
  if (!event || event.button !== 0) return;
  const target = event.target;
  if (target?.closest?.('input, textarea, select, button, label, [contenteditable]:not([contenteditable="false"])')) return;

  const cardEl = event.currentTarget;
  if (!(cardEl instanceof HTMLElement)) return;
  const item = (window.modelOrderingState?.moeItems || []).find((entry) => entry?.id === itemId);
  if (!item) return;

  const canvas = cardEl.closest('#moe-graph-canvas');
  const canvasScale = (() => {
    if (!(canvas instanceof HTMLElement)) return 1;
    const rect = canvas.getBoundingClientRect();
    const width = Number(canvas.offsetWidth || 0);
    if (!width || !rect.width) return 1;
    const s = rect.width / width;
    return Number.isFinite(s) && s > 0 ? s : 1;
  })();
  const scale = canvasScale;

  const pos = item.canvasPos && typeof item.canvasPos === 'object'
    ? item.canvasPos
    : { x: Number(cardEl.style.left?.replace('px', '')) || 8, y: Number(cardEl.style.top?.replace('px', '')) || 8 };
  item.canvasPos = { x: Number(pos.x) || 8, y: Number(pos.y) || 8 };

  const startX = Number(event.clientX || 0);
  const startY = Number(event.clientY || 0);
  const originX = item.canvasPos.x;
  const originY = item.canvasPos.y;
  window.__moeCanvasDidDrag = false;

  const move = (moveEvent) => {
    const dx = (Number(moveEvent.clientX || 0) - startX) / scale;
    const dy = (Number(moveEvent.clientY || 0) - startY) / scale;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      window.__moeCanvasDidDrag = true;
    }
    const nextX = Math.max(8, Math.round(originX + dx));
    const nextY = Math.max(8, Math.round(originY + dy));
    item.canvasPos = { x: nextX, y: nextY };
    cardEl.style.left = `${nextX}px`;
    cardEl.style.top = `${nextY}px`;
    if (typeof window.refreshMoeGraphEdges === 'function') {
      try { window.refreshMoeGraphEdges(); } catch (_) { /* no-op */ }
    }
  };

  const up = () => {
    window.removeEventListener('mousemove', move, true);
    window.removeEventListener('mouseup', up, true);
    if (window.__moeCanvasDidDrag) {
      renderModelOrdering();
      setTimeout(() => { window.__moeCanvasDidDrag = false; }, 0);
    }
  };

  window.addEventListener('mousemove', move, true);
  window.addEventListener('mouseup', up, true);
}

function toggleMoeItemEnabled(itemId, enabled) {
  const item = window.modelOrderingState.moeItems.find(i => i.id === itemId);
  if (item) {
    item.enabled = enabled;
    console.log('[MoE] Toggled enabled:', itemId, enabled);
    renderModelOrdering();
  }
}

function updateCliAgentConfig(itemId, key, value) {
  const item = window.modelOrderingState.moeItems.find((i) => {
    if (i?.id !== itemId) return false;
    return i.type === 'cli_agent' || i.type === 'deep_agent' || i.type === 'executor';
  });
  if (!item) return;
  if (typeof item.hooks !== 'object' || !item.hooks) {
    item.hooks = {
      runCommand: true,
      writeFile: true,
      runTests: true,
      gitDiff: true,
      flashFirmware: false
    };
  }

  switch (key) {
    case 'ownerAgentId':
      item.ownerAgentId = String(value || '').trim();
      break;
    case 'projectPath':
      item.projectPath = String(value || '').trim();
      break;
    case 'executionMode': {
      const normalized = String(value || '').trim().toLowerCase();
      item.executionMode = ['on-tool', 'on-control', 'auto', 'manual'].includes(normalized)
        ? normalized
        : 'on-tool';
      break;
    }
    case 'policyProfile': {
      const normalized = String(value || '').trim().toLowerCase();
      item.policyProfile = ['read-only', 'workspace-write', 'privileged-approval'].includes(normalized)
        ? normalized
        : 'workspace-write';
      break;
    }
    case 'stepBudget': {
      const parsed = Number.parseInt(String(value), 10);
      item.stepBudget = Number.isInteger(parsed) ? Math.max(1, Math.min(500, parsed)) : 50;
      break;
    }
    case 'tokenBudget': {
      const parsed = Number.parseInt(String(value), 10);
      item.tokenBudget = Number.isInteger(parsed) ? Math.max(256, Math.min(200000, parsed)) : 8000;
      break;
    }
    case 'timeoutMs': {
      const parsed = Number.parseInt(String(value), 10);
      item.timeoutMs = Number.isInteger(parsed) ? Math.max(1000, Math.min(3600000, parsed)) : 300000;
      break;
    }
    case 'hooks.runCommand':
      item.hooks.runCommand = value === true;
      break;
    case 'hooks.writeFile':
      item.hooks.writeFile = value === true;
      break;
    case 'hooks.runTests':
      item.hooks.runTests = value === true;
      break;
    case 'hooks.gitDiff':
      item.hooks.gitDiff = value === true;
      break;
    case 'hooks.flashFirmware':
      item.hooks.flashFirmware = value === true;
      break;
    default:
      return;
  }

  renderModelOrdering();
}

async function pickCliAgentProjectPath(itemId) {
  try {
    const picker = window.electronAPI?.moePickDirectory;
    if (typeof picker !== 'function') return;
    const result = await picker();
    if (!result?.ok || result?.canceled) return;
    const selected = String(result.path || '').trim();
    if (!selected) return;
    updateCliAgentConfig(itemId, 'projectPath', selected);
  } catch (err) {
    console.warn('[MoE] CLI Agent project picker failed:', err?.message || err);
  }
}

window.addMoeAgent = addMoeAgent;
window.addMoeChannel = addMoeChannel;
window.addMoeGateway = addMoeGateway;
window.addMoeBindings = addMoeBindings;
window.addMoeCliAgent = addMoeCliAgent;
window.addMoeEndpointRegistry = addMoeEndpointRegistry;
window.deleteMoeItem = deleteMoeItem;
window.toggleMoeExpand = toggleMoeExpand;
window.handleMoeItemClick = handleMoeItemClick;
window.toggleMoeItemEnabled = toggleMoeItemEnabled;
window.updateCliAgentConfig = updateCliAgentConfig;
window.pickCliAgentProjectPath = pickCliAgentProjectPath;
window.toggleMoeGraphMode = toggleMoeGraphMode;
window.setMoeGraphZoom = setMoeGraphZoom;
window.adjustMoeGraphZoom = adjustMoeGraphZoom;
window.beginMoeCanvasDrag = beginMoeCanvasDrag;
