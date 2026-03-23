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
  window.modelOrderingState.expandedMoeItem = agent.id;
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
  window.modelOrderingState.expandedMoeItem = gateway.id;
  console.log('[MoE] Added gateway:', gateway.id);
  renderModelOrdering();
}

function addMoeBindings() {
  const bindings = window.createBindings('Runtime Bindings');
  window.modelOrderingState.moeItems.push(bindings);
  window.modelOrderingState.expandedMoeItem = bindings.id;
  console.log('[MoE] Added bindings:', bindings.id);
  renderModelOrdering();
}

function addMoeEndpointRegistry() {
  const items = window.modelOrderingState.moeItems || [];
  const existing = items.find((item) => item.type === 'endpoint_registry');
  if (existing) {
    window.modelOrderingState.expandedMoeItem = existing.id;
    renderModelOrdering();
    return;
  }
  const registry = window.createEndpointRegistryItem();
  items.push(registry);
  window.modelOrderingState.expandedMoeItem = registry.id;
  console.log('[MoE] Added endpoint registry item:', registry.id);
  renderModelOrdering();
}

// ============================================================================
// ITEM DELETION & TOGGLE
// ============================================================================

function deleteMoeItem(itemId) {
  const items = window.modelOrderingState.moeItems;
  const index = items.findIndex(i => i.id === itemId);
  if (index !== -1) {
    items.splice(index, 1);
    if (window.modelOrderingState.expandedMoeItem === itemId) {
      window.modelOrderingState.expandedMoeItem = null;
    }
    console.log('[MoE] Deleted item:', itemId);
    renderModelOrdering();
  }
}

function toggleMoeExpand(itemId) {
  if (window.modelOrderingState.expandedMoeItem === itemId) {
    window.modelOrderingState.expandedMoeItem = null;
  } else {
    window.modelOrderingState.expandedMoeItem = itemId;
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
