/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * ==========================================================================
 * MODEL ORDERING CORE HELPERS
 * ==========================================================================
 * Shared helper logic extracted from model-ordering-core.js:
 * - initialization / catalog + ordering load
 * - scope and model list resolution
 * - keyboard navigation and pipeline input fallback
 * - dynamic style injection
 * ==========================================================================
 */

async function loadModelOrdering() {
  const container = document.getElementById('model-ordering-content');
  if (!container) return;

  container.innerHTML = '<div class="info-loading"><div class="spinner"></div><p>Loading PSF Relay...</p></div>';

  try {
    const [catalog, orderingData] = await Promise.all([
      window.electronAPI.getMasterCatalog(),
      window.electronAPI.getModelOrdering()
    ]);

    window.modelOrderingState.catalog = catalog;

    const defaultOrdering = createDefaultOrderingData(catalog);

    if (orderingData && orderingData.globalOrder && orderingData.globalOrder.length > 0) {
      window.modelOrderingState.orderingData = orderingData;

      for (const modelId of defaultOrdering.globalOrder) {
        if (!orderingData.globalOrder.includes(modelId)) {
          orderingData.globalOrder.push(modelId);
        }
      }

      for (const [collKey, collOrder] of Object.entries(defaultOrdering.collectionOrders)) {
        if (!orderingData.collectionOrders[collKey]) {
          orderingData.collectionOrders[collKey] = collOrder;
        } else {
          for (const modelId of collOrder) {
            if (!orderingData.collectionOrders[collKey].includes(modelId)) {
              orderingData.collectionOrders[collKey].push(modelId);
            }
          }
        }
      }
    } else {
      window.modelOrderingState.orderingData = defaultOrdering;
    }

    window.modelOrderingState.groups = window.modelOrderingState.orderingData.groups || [];
    window.modelOrderingState.scopeMode = 'pipeline';

    renderModelOrdering();
    initializeKeyboardNavigation();

    checkAllDownloadStatus().then(() => {
      console.log('[Model Ordering] Status check complete, re-rendering...');
      renderModelOrdering();
    }).catch((err) => {
      console.error('[Model Ordering] Status check failed:', err);
    });
  } catch (err) {
    console.error('[Model Ordering] Failed to load:', err);
    container.innerHTML = '<p style="color: #ff6b6b;">Failed to load model ordering. Check console for details.</p>';
  }
}

function createDefaultOrderingData(catalog) {
  const globalOrder = [];
  const collectionOrders = {};

  for (const [collectionKey, collection] of Object.entries(catalog.collections || {})) {
    const modelIds = (collection.models || []).map((m) => m.id);
    collectionOrders[collectionKey] = [...modelIds];
    globalOrder.push(...modelIds);
  }

  return {
    version: '1.0',
    lastModified: new Date().toISOString(),
    globalOrder,
    collectionOrders,
    groups: []
  };
}

function setOrderingScope(_scope) {
  window.modelOrderingState.scopeMode = 'pipeline';
  renderModelOrdering();
}

function setOrderingView(view) {
  window.modelOrderingState.viewMode = view;
  renderModelOrdering();
}

function selectCollection(collectionKey) {
  window.modelOrderingState.currentCollection = collectionKey;
  renderModelOrdering();
}

function getModelsForCurrentScope() {
  const { catalog, orderingData, scopeMode, currentCollection } = window.modelOrderingState;
  const allModels = [];

  for (const [collectionKey, collection] of Object.entries(catalog.collections || {})) {
    for (const model of (collection.models || [])) {
      allModels.push({
        ...model,
        collectionKey,
        collectionName: collection.name
      });
    }
  }

  if (scopeMode === 'global') {
    const globalOrder = orderingData.globalOrder || [];
    return allModels.sort((a, b) => {
      const indexA = globalOrder.indexOf(a.id);
      const indexB = globalOrder.indexOf(b.id);
      if (indexA === -1 && indexB === -1) return 0;
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
  }

  const collectionModels = allModels.filter((m) => m.collectionKey === currentCollection);
  const collectionOrder = orderingData.collectionOrders?.[currentCollection] || [];
  return collectionModels.sort((a, b) => {
    const indexA = collectionOrder.indexOf(a.id);
    const indexB = collectionOrder.indexOf(b.id);
    if (indexA === -1 && indexB === -1) return 0;
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });
}

let focusedIndex = 0;

function initializeKeyboardNavigation() {
  const container = document.getElementById('model-ordering-content');
  if (!container) return;
  container.onkeydown = handleKeyboardNavigation;
}

function handleKeyboardNavigation(event) {
  const rawTarget = event.target;
  const target =
    rawTarget && rawTarget.nodeType === Node.TEXT_NODE
      ? rawTarget.parentElement
      : rawTarget;
  const tag = String(target?.tagName || '').toLowerCase();
  const isEditableTarget =
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    target?.isContentEditable === true ||
    !!target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])');

  // Let embedded pipeline chat input use native key handling only.
  if (target instanceof HTMLInputElement && target.id === 'moe-chat-input') {
    return;
  }

  if (window.modelOrderingState?.scopeMode === 'pipeline') {
    if (isEditableTarget) return;
    return;
  }

  if (isEditableTarget) {
    return;
  }

  const models = getModelsForCurrentScope();
  if (models.length === 0) return;

  switch (event.key) {
    case 'ArrowUp':
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        moveSelectedUp();
      } else {
        focusedIndex = Math.max(0, focusedIndex - 1);
        focusRow(focusedIndex);
      }
      break;

    case 'ArrowDown':
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        moveSelectedDown();
      } else {
        focusedIndex = Math.min(models.length - 1, focusedIndex + 1);
        focusRow(focusedIndex);
      }
      break;

    case ' ':
      event.preventDefault();
      toggleModelSelection(models[focusedIndex].id);
      break;

    case 'a':
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        selectAllModels();
      }
      break;

    case 'g':
      if (!event.ctrlKey && !event.metaKey) {
        groupSelectedModels();
      }
      break;

    case 'Escape':
      clearSelection();
      break;

    case 'Delete':
    case 'Backspace':
      removeSelectedFromGroups();
      break;
  }
}

function applyPipelineEditableKeyFallback(event, target) {
  const input = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
    ? target
    : null;
  if (!input || input.readOnly || input.disabled) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;

  const type = String(input.type || '').toLowerCase();
  const isTextLike = input instanceof HTMLTextAreaElement
    || ['text', 'search', 'url', 'tel', 'email', 'password', 'number'].includes(type);
  if (!isTextLike) return;

  const key = String(event.key || '');
  if (key.length !== 1) return;

  if (type === 'number' && !/[0-9eE+\-.]/.test(key)) return;

  const start = Number.isInteger(input.selectionStart) ? input.selectionStart : input.value.length;
  const end = Number.isInteger(input.selectionEnd) ? input.selectionEnd : input.value.length;
  const next = `${input.value.slice(0, start)}${key}${input.value.slice(end)}`;

  event.preventDefault();
  input.value = next;
  const cursor = start + key.length;
  if (typeof input.setSelectionRange === 'function') {
    input.setSelectionRange(cursor, cursor);
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));

}

function focusRow(index) {
  const rows = document.querySelectorAll('.model-ordering-row');
  if (rows[index]) {
    rows[index].focus();
    rows[index].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function addOrderingStyles() {
  if (document.getElementById('model-ordering-styles')) return;

  const style = document.createElement('style');
  style.id = 'model-ordering-styles';
  style.textContent = `
    .scope-btn {
      background: rgba(255,255,255,0.05);
      color: #888;
    }
    .scope-btn:hover {
      background: rgba(255,255,255,0.1);
      color: #fff;
    }
    .scope-btn-active {
      background: var(--psf-accent-medium, rgba(0,212,255,0.2));
      color: var(--psf-accent, #00d4ff);
    }
    .model-ordering-row:hover {
      background: rgba(255,255,255,0.08) !important;
    }
    .model-ordering-row:focus {
      outline: 2px solid var(--psf-accent, #00d4ff);
      outline-offset: -2px;
    }
    .model-ordering-row.selected {
      background: var(--psf-accent-light, rgba(0,212,255,0.15)) !important;
    }
    .drag-handle:hover {
      color: var(--psf-accent, #00d4ff) !important;
    }
    kbd {
      background: rgba(255,255,255,0.1);
      border: 1px solid #444;
      border-radius: 3px;
      padding: 2px 5px;
      font-family: monospace;
    }
  `;
  document.head.appendChild(style);
}

window.loadModelOrdering = loadModelOrdering;
window.createDefaultOrderingData = createDefaultOrderingData;
window.setOrderingScope = setOrderingScope;
window.setOrderingView = setOrderingView;
window.selectCollection = selectCollection;
window.getModelsForCurrentScope = getModelsForCurrentScope;
window.initializeKeyboardNavigation = initializeKeyboardNavigation;
window.handleKeyboardNavigation = handleKeyboardNavigation;
window.focusRow = focusRow;
window.addOrderingStyles = addOrderingStyles;
