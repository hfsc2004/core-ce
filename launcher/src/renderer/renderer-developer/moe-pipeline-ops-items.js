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
  console.log('[MoE] Added gateway:', gateway.id);
  renderModelOrdering();
}

function addMoeBindings() {
  const bindings = window.createBindings('Runtime Bindings');
  window.modelOrderingState.moeItems.push(bindings);
  console.log('[MoE] Added bindings:', bindings.id);
  renderModelOrdering();
}

function addMoeEndpointRegistry() {
  const items = window.modelOrderingState.moeItems || [];
  const existing = items.find((item) => item.type === 'endpoint_registry');
  if (existing) {
    renderModelOrdering();
    return;
  }
  const registry = window.createEndpointRegistryItem();
  items.push(registry);
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
  if (isMoeGraphModeEnabled() && (event?.ctrlKey === true || event?.metaKey === true)) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    toggleMoeGraphSelectionId(itemId);
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

function getMoeGraphSelectionSet() {
  const raw = window.modelOrderingState?.moeGraphSelectedIds;
  const list = Array.isArray(raw) ? raw : [];
  return new Set(list.map((id) => String(id || '').trim()).filter(Boolean));
}

function setMoeGraphSelection(ids) {
  if (!window.modelOrderingState || typeof window.modelOrderingState !== 'object') return;
  const unique = Array.from(new Set((Array.isArray(ids) ? ids : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean)));
  window.modelOrderingState.moeGraphSelectedIds = unique;
  syncMoeGraphSelectionUi();
}

function toggleMoeGraphSelectionId(itemId) {
  const id = String(itemId || '').trim();
  if (!id) return;
  const selected = getMoeGraphSelectionSet();
  if (selected.has(id)) {
    selected.delete(id);
  } else {
    selected.add(id);
  }
  setMoeGraphSelection(Array.from(selected));
}

function syncMoeGraphSelectionUi() {
  const selected = getMoeGraphSelectionSet();
  const cards = document.querySelectorAll('#moe-graph-canvas .moe-item[data-moe-id]');
  cards.forEach((card) => {
    if (!(card instanceof HTMLElement)) return;
    const id = String(card.getAttribute('data-moe-id') || '').trim();
    if (!id) return;
    card.classList.toggle('moe-graph-selected', selected.has(id));
  });
}

function escapeCssIdent(value) {
  const raw = String(value || '');
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(raw);
  }
  return raw.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function clampMoeGraphZoom(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0.7;
  return Math.max(0.45, Math.min(3.0, parsed));
}

function applyMoeGraphZoomUi() {
  const zoom = clampMoeGraphZoom(window.modelOrderingState?.moeGraphZoom);
  const pct = Math.round(zoom * 100);
  const canvas = document.getElementById('moe-graph-canvas');
  if (canvas instanceof HTMLElement) {
    canvas.style.transform = `scale(${zoom})`;
    canvas.style.transformOrigin = 'top left';
  }
  const inputs = document.querySelectorAll('.moe-graph-zoom-control input[type="range"]');
  inputs.forEach((input) => {
    if (input instanceof HTMLInputElement) {
      input.value = String(Math.max(45, Math.min(300, pct)));
    }
  });
  const labels = document.querySelectorAll('.moe-graph-zoom-control span');
  labels.forEach((el) => {
    if (el instanceof HTMLElement) {
      el.textContent = `${pct}%`;
    }
  });
  if (typeof window.refreshMoeGraphEdges === 'function') {
    try { window.refreshMoeGraphEdges(); } catch (_) { /* no-op */ }
  }
}

function scheduleMoeGraphEdgeRefresh(frames = 2) {
  const hops = Math.max(1, Number(frames) || 1);
  const tick = (remaining) => {
    if (remaining <= 0) {
      if (typeof window.refreshMoeGraphEdges === 'function') {
        try { window.refreshMoeGraphEdges(); } catch (_) { /* no-op */ }
      }
      return;
    }
    requestAnimationFrame(() => tick(remaining - 1));
  };
  tick(hops);
}

function scheduleMoeGraphEdgeRefreshWithDelay(ms = 120) {
  const delay = Math.max(0, Number(ms) || 0);
  setTimeout(() => {
    if (typeof window.refreshMoeGraphEdges === 'function') {
      try { window.refreshMoeGraphEdges(); } catch (_) { /* no-op */ }
    }
  }, delay);
}

function getFirstMoeGraphCardWidthPx() {
  const card = document.querySelector('#moe-graph-canvas .moe-item[data-moe-id]');
  if (!(card instanceof HTMLElement)) return 0;
  const rect = card.getBoundingClientRect();
  return Number(rect.width || 0);
}

function setMoeGraphZoom(value, rerender = true) {
  if (!window.modelOrderingState || typeof window.modelOrderingState !== 'object') return;
  window.modelOrderingState.moeGraphZoom = clampMoeGraphZoom(value);
  if (!rerender) {
    applyMoeGraphZoomUi();
    return;
  }
  const list = document.getElementById('moe-pipeline-list');
  const fullscreenActive = list instanceof HTMLElement && document.fullscreenElement === list;
  if (fullscreenActive) {
    applyMoeGraphZoomUi();
    return;
  }
  renderModelOrdering();
}

function adjustMoeGraphZoom(delta) {
  const current = clampMoeGraphZoom(window.modelOrderingState?.moeGraphZoom);
  const next = Math.round((current + Number(delta || 0)) * 100) / 100;
  setMoeGraphZoom(next, true);
}

function updateMoeGraphFullscreenUi(active) {
  const button = document.querySelector('.moe-graph-fullscreen-btn');
  if (!(button instanceof HTMLElement)) return;
  const isActive = active === true;
  button.setAttribute('title', isActive ? 'Restore graph size' : 'Expand graph fullscreen');
  button.setAttribute('aria-label', isActive ? 'Restore graph size' : 'Expand graph fullscreen');
  button.innerHTML = isActive
    ? '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 1H1v4"/><path d="M1 1l4 4"/><path d="M9 13h4V9"/><path d="M13 13l-4-4"/></svg>'
    : '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 1H1v4"/><path d="M1 1l4 4"/><path d="M9 1h4v4"/><path d="M13 1L9 5"/><path d="M1 9v4h4"/><path d="M1 13l4-4"/><path d="M13 9v4H9"/><path d="M13 13L9 9"/></svg>';
}

function recenterMoeGraphClusterToViewport(options = {}) {
  const list = document.getElementById('moe-pipeline-list');
  const canvas = document.getElementById('moe-graph-canvas');
  if (!(list instanceof HTMLElement) || !(canvas instanceof HTMLElement)) return;
  if (options && options.resetScroll === true) {
    list.scrollLeft = 0;
    list.scrollTop = 0;
  }
  const cards = Array.from(canvas.querySelectorAll('.moe-item[data-moe-id]'));
  if (cards.length === 0) return;

  const listRect = list.getBoundingClientRect();
  if (!Number.isFinite(listRect.width) || !Number.isFinite(listRect.height) || listRect.width <= 0 || listRect.height <= 0) return;
  const requestedPad = Number(options?.paddingPx);
  const pad = Number.isFinite(requestedPad) ? Math.max(0, requestedPad) : 0;
  const maxPadX = Math.max(0, (listRect.width / 2) - 1);
  const maxPadY = Math.max(0, (listRect.height / 2) - 1);
  const padX = Math.min(pad, maxPadX);
  const padY = Math.min(pad, maxPadY);
  const insetLeft = listRect.left + padX;
  const insetRight = listRect.right - padX;
  const insetTop = listRect.top + padY;
  const insetBottom = listRect.bottom - padY;
  const insetWidth = Math.max(1, insetRight - insetLeft);
  const insetHeight = Math.max(1, insetBottom - insetTop);

  let minLeft = Number.POSITIVE_INFINITY;
  let minTop = Number.POSITIVE_INFINITY;
  let maxRight = Number.NEGATIVE_INFINITY;
  let maxBottom = Number.NEGATIVE_INFINITY;

  cards.forEach((card) => {
    if (!(card instanceof HTMLElement)) return;
    const rect = card.getBoundingClientRect();
    minLeft = Math.min(minLeft, rect.left);
    minTop = Math.min(minTop, rect.top);
    maxRight = Math.max(maxRight, rect.right);
    maxBottom = Math.max(maxBottom, rect.bottom);
  });

  if (!Number.isFinite(minLeft) || !Number.isFinite(minTop) || !Number.isFinite(maxRight) || !Number.isFinite(maxBottom)) return;
  const clusterWidth = Math.max(1, maxRight - minLeft);
  const clusterHeight = Math.max(1, maxBottom - minTop);
  const clusterCenterX = (minLeft + maxRight) / 2;
  const clusterCenterY = (minTop + maxBottom) / 2;
  const insetCenterX = insetLeft + (insetWidth / 2);
  const insetCenterY = insetTop + (insetHeight / 2);

  let targetCenterX = insetCenterX;
  let targetCenterY = insetCenterY;

  // If the cluster is larger than the inset viewport on an axis, just center on that axis.
  if (clusterWidth > insetWidth) {
    targetCenterX = listRect.left + (listRect.width / 2);
  }
  if (clusterHeight > insetHeight) {
    targetCenterY = listRect.top + (listRect.height / 2);
  }

  // Camera-only centering (no card mutation). Keeps layout coordinates intact.
  const deltaX = clusterCenterX - targetCenterX;
  const deltaY = clusterCenterY - targetCenterY;
  if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;
  list.scrollLeft = Math.max(0, Math.round(Number(list.scrollLeft || 0) + deltaX));
  list.scrollTop = Math.max(0, Math.round(Number(list.scrollTop || 0) + deltaY));
}

function toggleMoeGraphMode() {
  if (!window.modelOrderingState || typeof window.modelOrderingState !== 'object') return;
  const next = !isMoeGraphModeEnabled();
  window.modelOrderingState.moeGraphMode = next;
  if (!next) {
    window.modelOrderingState.moeGraphFullscreen = false;
    if (document.fullscreenElement) {
      Promise.resolve(document.exitFullscreen?.()).catch(() => {});
    }
  }
  renderModelOrdering();
}

function toggleMoeGraphFullscreen() {
  if (!window.modelOrderingState || typeof window.modelOrderingState !== 'object') return;
  if (window.modelOrderingState?.moeGraphMode !== true) return;
  const list = document.getElementById('moe-pipeline-list');
  if (!(list instanceof HTMLElement)) return;
  if (typeof list.requestFullscreen !== 'function' || typeof document.exitFullscreen !== 'function') return;
  const isFullscreen = document.fullscreenElement === list;
  const targetState = !isFullscreen;
  const done = () => {
    window.modelOrderingState.moeGraphFullscreen = targetState;
    updateMoeGraphFullscreenUi(targetState);
    if (typeof window.refreshMoeGraphEdges === 'function') {
      try { window.refreshMoeGraphEdges(); } catch (_) { /* no-op */ }
    }
  };
  if (targetState) {
    const rect = list.getBoundingClientRect();
    window.__moeGraphPreFullscreen = {
      zoom: clampMoeGraphZoom(window.modelOrderingState?.moeGraphZoom),
      width: Number(rect.width || 0),
      height: Number(rect.height || 0),
      cardWidthPx: getFirstMoeGraphCardWidthPx()
    };
    Promise.resolve(list.requestFullscreen())
      .then(done)
      .catch(() => {
        window.modelOrderingState.moeGraphFullscreen = false;
        updateMoeGraphFullscreenUi(false);
      });
    return;
  }
  Promise.resolve(document.exitFullscreen())
    .then(done)
    .catch(() => {
      window.modelOrderingState.moeGraphFullscreen = document.fullscreenElement === list;
      updateMoeGraphFullscreenUi(window.modelOrderingState.moeGraphFullscreen === true);
    });
}

function beginMoeCanvasDrag(event, itemId) {
  if (!isMoeGraphModeEnabled()) return;
  if (!event || event.button !== 0) return;
  if (event.ctrlKey === true || event.metaKey === true) return;
  const target = event.target;
  if (target?.closest?.('input, textarea, select, button, label, [contenteditable]:not([contenteditable="false"])')) return;

  const cardEl = event.currentTarget;
  if (!(cardEl instanceof HTMLElement)) return;
  const item = (window.modelOrderingState?.moeItems || []).find((entry) => entry?.id === itemId);
  if (!item) return;

  const additive = event.ctrlKey === true || event.metaKey === true;
  const selected = getMoeGraphSelectionSet();
  if (!selected.has(itemId)) {
    if (additive) {
      selected.add(itemId);
      setMoeGraphSelection(Array.from(selected));
    } else {
      setMoeGraphSelection([itemId]);
    }
  } else if (additive) {
    // Keep current set when dragging an already-selected card with additive modifier.
    setMoeGraphSelection(Array.from(selected));
  }
  const dragSelection = getMoeGraphSelectionSet();
  const dragIds = dragSelection.has(itemId) && dragSelection.size > 1
    ? Array.from(dragSelection)
    : [itemId];
  if (!dragSelection.has(itemId)) {
    setMoeGraphSelection([itemId]);
  }

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

  const itemLookup = new Map((window.modelOrderingState?.moeItems || []).map((entry) => [String(entry?.id || ''), entry]));
  const originById = new Map();
  dragIds.forEach((id) => {
    const dragItem = itemLookup.get(String(id || ''));
    if (!dragItem || typeof dragItem !== 'object') return;
    const card = document.querySelector(`#moe-graph-canvas .moe-item[data-moe-id="${escapeCssIdent(String(id))}"]`);
    const basePos = dragItem.canvasPos && typeof dragItem.canvasPos === 'object'
      ? dragItem.canvasPos
      : {
          x: Number((card instanceof HTMLElement ? card.style.left : '').replace('px', '')) || Number((card instanceof HTMLElement ? card.offsetLeft : 0)) || 0,
          y: Number((card instanceof HTMLElement ? card.style.top : '').replace('px', '')) || Number((card instanceof HTMLElement ? card.offsetTop : 0)) || 0
        };
    const ox = Number(basePos.x) || 0;
    const oy = Number(basePos.y) || 0;
    dragItem.canvasPos = { x: ox, y: oy };
    originById.set(String(id), { x: ox, y: oy });
  });

  const startX = Number(event.clientX || 0);
  const startY = Number(event.clientY || 0);
  window.__moeCanvasDidDrag = false;

  const move = (moveEvent) => {
    const dx = (Number(moveEvent.clientX || 0) - startX) / scale;
    const dy = (Number(moveEvent.clientY || 0) - startY) / scale;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      window.__moeCanvasDidDrag = true;
    }
    dragIds.forEach((id) => {
      const dragItem = itemLookup.get(String(id || ''));
      const origin = originById.get(String(id || ''));
      if (!dragItem || !origin) return;
      const nextX = Math.max(0, Math.round(origin.x + dx));
      const nextY = Math.max(0, Math.round(origin.y + dy));
      dragItem.canvasPos = { x: nextX, y: nextY };
      const dragEl = document.querySelector(`#moe-graph-canvas .moe-item[data-moe-id="${escapeCssIdent(String(id))}"]`);
      if (dragEl instanceof HTMLElement) {
        dragEl.style.left = `${nextX}px`;
        dragEl.style.top = `${nextY}px`;
      }
    });
    if (typeof window.refreshMoeGraphEdges === 'function') {
      try { window.refreshMoeGraphEdges(); } catch (_) { /* no-op */ }
    }
  };

  const up = () => {
    window.removeEventListener('mousemove', move, true);
    window.removeEventListener('mouseup', up, true);
    if (window.__moeCanvasDidDrag) {
      const list = document.getElementById('moe-pipeline-list');
      const fullscreenActive = list instanceof HTMLElement && document.fullscreenElement === list;
      if (fullscreenActive) {
        if (typeof window.refreshMoeGraphEdges === 'function') {
          try { window.refreshMoeGraphEdges(); } catch (_) { /* no-op */ }
        }
      } else {
        renderModelOrdering();
      }
      setTimeout(() => { window.__moeCanvasDidDrag = false; }, 0);
    }
  };

  window.addEventListener('mousemove', move, true);
  window.addEventListener('mouseup', up, true);
}

function handleMoeGraphPanAuxClick(event) {
  if (!isMoeGraphModeEnabled()) return;
  if (!event || event.button !== 1) return;
  event.preventDefault();
}

function beginMoeGraphMarqueeSelection(event) {
  if (!isMoeGraphModeEnabled()) return;
  if (!event || event.button !== 0) return;
  const list = document.getElementById('moe-pipeline-list');
  if (!(list instanceof HTMLElement)) return;
  if (event.target?.closest?.('.moe-graph-controls-overlay')) return;
  if (event.target?.closest?.('.moe-item[data-moe-id]')) return;
  if (event.target?.closest?.('input, textarea, select, button, label, [contenteditable]:not([contenteditable="false"])')) return;

  const additive = event.ctrlKey === true || event.metaKey === true;
  const baseSet = additive ? getMoeGraphSelectionSet() : new Set();
  if (!additive) {
    setMoeGraphSelection([]);
  }

  const startClientX = Number(event.clientX || 0);
  const startClientY = Number(event.clientY || 0);
  const listRect = list.getBoundingClientRect();
  const fullscreenActive = document.fullscreenElement === list;

  const box = document.createElement('div');
  box.className = 'moe-graph-selection-box';
  box.style.position = fullscreenActive ? 'absolute' : 'fixed';
  box.style.zIndex = '2147483000';
  box.style.pointerEvents = 'none';
  box.style.border = '1px dashed rgba(127,181,255,0.98)';
  box.style.background = 'rgba(127,181,255,0.18)';
  box.style.boxShadow = '0 0 0 1px rgba(127,181,255,0.30), inset 0 0 0 1px rgba(127,181,255,0.25)';
  box.style.borderRadius = '4px';
  const startBoxX = fullscreenActive ? (startClientX - listRect.left + Number(list.scrollLeft || 0)) : startClientX;
  const startBoxY = fullscreenActive ? (startClientY - listRect.top + Number(list.scrollTop || 0)) : startClientY;
  box.style.left = `${Math.round(startBoxX)}px`;
  box.style.top = `${Math.round(startBoxY)}px`;
  box.style.width = '0px';
  box.style.height = '0px';
  (fullscreenActive ? list : document.body).appendChild(box);

  let moved = false;

  const move = (moveEvent) => {
    const cx = Number(moveEvent.clientX || 0);
    const cy = Number(moveEvent.clientY || 0);
    const boxCurrentX = fullscreenActive ? (cx - listRect.left + Number(list.scrollLeft || 0)) : cx;
    const boxCurrentY = fullscreenActive ? (cy - listRect.top + Number(list.scrollTop || 0)) : cy;
    const minX = Math.min(startBoxX, boxCurrentX);
    const minY = Math.min(startBoxY, boxCurrentY);
    const width = Math.abs(boxCurrentX - startBoxX);
    const height = Math.abs(boxCurrentY - startBoxY);
    box.style.left = `${Math.round(minX)}px`;
    box.style.top = `${Math.round(minY)}px`;
    box.style.width = `${Math.round(width)}px`;
    box.style.height = `${Math.round(height)}px`;

    moved = moved || width > 4 || height > 4;
    if (!moved) return;
    window.__moeCanvasDidDrag = true;

    const selectRect = {
      left: Math.min(startClientX, cx),
      right: Math.max(startClientX, cx),
      top: Math.min(startClientY, cy),
      bottom: Math.max(startClientY, cy)
    };

    const selectedNow = new Set(baseSet);
    const cards = document.querySelectorAll('#moe-graph-canvas .moe-item[data-moe-id]');
    cards.forEach((card) => {
      if (!(card instanceof HTMLElement)) return;
      const id = String(card.getAttribute('data-moe-id') || '').trim();
      if (!id) return;
      const rect = card.getBoundingClientRect();
      const intersects = !(
        rect.right < selectRect.left ||
        rect.left > selectRect.right ||
        rect.bottom < selectRect.top ||
        rect.top > selectRect.bottom
      );
      if (intersects) selectedNow.add(id);
    });
    setMoeGraphSelection(Array.from(selectedNow));
  };

  const up = () => {
    window.removeEventListener('mousemove', move, true);
    window.removeEventListener('mouseup', up, true);
    if (box.parentElement) box.parentElement.removeChild(box);
    if (!moved && !additive) {
      setMoeGraphSelection([]);
    }
    if (moved) {
      setTimeout(() => { window.__moeCanvasDidDrag = false; }, 0);
    }
  };

  window.addEventListener('mousemove', move, true);
  window.addEventListener('mouseup', up, true);
}

function handleMoeGraphMouseDown(event) {
  handleMoeGraphPanMouseDown(event);
  beginMoeGraphMarqueeSelection(event);
}

function handleMoeGraphPanMouseDown(event) {
  if (!isMoeGraphModeEnabled()) return;
  if (!event || event.button !== 1) return;
  const list = document.getElementById('moe-pipeline-list');
  if (!(list instanceof HTMLElement)) return;

  event.preventDefault();
  const startX = Number(event.clientX || 0);
  const startY = Number(event.clientY || 0);
  const originLeft = Number(list.scrollLeft || 0);
  const originTop = Number(list.scrollTop || 0);
  const previousCursor = list.style.cursor;
  list.style.cursor = 'grabbing';

  const move = (moveEvent) => {
    const dx = Number(moveEvent.clientX || 0) - startX;
    const dy = Number(moveEvent.clientY || 0) - startY;
    list.scrollLeft = Math.max(0, Math.round(originLeft - dx));
    list.scrollTop = Math.max(0, Math.round(originTop - dy));
  };

  const up = () => {
    window.removeEventListener('mousemove', move, true);
    window.removeEventListener('mouseup', up, true);
    list.style.cursor = previousCursor;
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
window.toggleMoeGraphFullscreen = toggleMoeGraphFullscreen;
window.beginMoeCanvasDrag = beginMoeCanvasDrag;
window.handleMoeGraphMouseDown = handleMoeGraphMouseDown;
window.handleMoeGraphPanMouseDown = handleMoeGraphPanMouseDown;
window.handleMoeGraphPanAuxClick = handleMoeGraphPanAuxClick;
window.syncMoeGraphSelectionUi = syncMoeGraphSelectionUi;

if (!window.__moeGraphFullscreenChangeBound) {
  document.addEventListener('fullscreenchange', () => {
    if (!window.modelOrderingState || typeof window.modelOrderingState !== 'object') return;
    const list = document.getElementById('moe-pipeline-list');
    const active = list instanceof HTMLElement && document.fullscreenElement === list;
    window.modelOrderingState.moeGraphFullscreen = active;
    updateMoeGraphFullscreenUi(active);
    if (active) {
      const pre = window.__moeGraphPreFullscreen && typeof window.__moeGraphPreFullscreen === 'object'
        ? window.__moeGraphPreFullscreen
        : null;
      const baseZoom = pre && Number.isFinite(pre.zoom)
        ? clampMoeGraphZoom(pre.zoom)
        : clampMoeGraphZoom(window.modelOrderingState?.moeGraphZoom);
      window.modelOrderingState.moeGraphZoom = baseZoom;
      applyMoeGraphZoomUi();
      // Calibrate to preserve apparent card size exactly (pixel-accurate).
      const targetCardWidth = Number(pre?.cardWidthPx || 0);
      if (targetCardWidth > 0) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const currentCardWidth = getFirstMoeGraphCardWidthPx();
            if (currentCardWidth > 0) {
              const factor = targetCardWidth / currentCardWidth;
              if (Number.isFinite(factor) && factor > 0 && Math.abs(factor - 1) > 0.01) {
                window.modelOrderingState.moeGraphZoom = clampMoeGraphZoom(baseZoom * factor);
                applyMoeGraphZoomUi();
              }
            }
          });
        });
      }
    } else if (window.__moeGraphPreFullscreen && typeof window.__moeGraphPreFullscreen === 'object') {
      const priorZoom = clampMoeGraphZoom(window.__moeGraphPreFullscreen.zoom);
      window.modelOrderingState.moeGraphZoom = priorZoom;
      applyMoeGraphZoomUi();
      window.__moeGraphPreFullscreen = null;
    }
    // Preserve card layout positions and viewport placement across fullscreen transitions.
    scheduleMoeGraphEdgeRefresh(active ? 3 : 2);
    if (active) {
      scheduleMoeGraphEdgeRefreshWithDelay(40);
      scheduleMoeGraphEdgeRefreshWithDelay(120);
      scheduleMoeGraphEdgeRefreshWithDelay(260);
    } else {
      scheduleMoeGraphEdgeRefreshWithDelay(40);
      scheduleMoeGraphEdgeRefreshWithDelay(80);
      scheduleMoeGraphEdgeRefreshWithDelay(180);
    }
  });
  window.__moeGraphFullscreenChangeBound = true;
}
