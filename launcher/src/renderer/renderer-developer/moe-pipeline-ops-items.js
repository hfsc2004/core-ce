/**
 *
 * @version 1.1.2 - March 5, 2026
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
  const target = event?.target;
  if (target?.closest?.('.drag-handle')) {
    return;
  }
  if (target?.closest?.('input, textarea, select, button, label, [contenteditable]:not([contenteditable="false"])')) {
    return;
  }
  toggleMoeExpand(itemId);
}

function toggleMoeItemEnabled(itemId, enabled) {
  const item = window.modelOrderingState.moeItems.find(i => i.id === itemId);
  if (item) {
    item.enabled = enabled;
    console.log('[MoE] Toggled enabled:', itemId, enabled);
    renderModelOrdering();
  }
}

window.addMoeAgent = addMoeAgent;
window.addMoeChannel = addMoeChannel;
window.addMoeGateway = addMoeGateway;
window.addMoeBindings = addMoeBindings;
window.addMoeEndpointRegistry = addMoeEndpointRegistry;
window.deleteMoeItem = deleteMoeItem;
window.toggleMoeExpand = toggleMoeExpand;
window.handleMoeItemClick = handleMoeItemClick;
window.toggleMoeItemEnabled = toggleMoeItemEnabled;
