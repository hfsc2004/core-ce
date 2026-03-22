/**
 * ============================================================================
 * MODEL ORDERING DND - Selection, Drag/Drop, Movement, Grouping
 * ============================================================================
 * 
 * Handles model selection, drag & drop reordering, and grouping.
 * Uses shared state from window.modelOrderingState (moe-state.js).
 * 
 * @module model-ordering-dnd
 * @version 1.1.2 - March 5, 2026
 * ============================================================================
 */

// ============================================================================
// SELECTION MANAGEMENT
// ============================================================================

let lastSelectedIndex = null;

/**
 * Handle row click with modifier key support
 */
function handleRowClick(event, modelId) {
  const { selectedModels, editMode } = window.modelOrderingState;
  
  // In normal mode, clicking the row toggles expansion
  if (!editMode) {
    toggleModelExpand(modelId);
    return;
  }
  
  // In edit mode, handle selection
  const models = getModelsForCurrentScope();
  const clickedIndex = models.findIndex(m => m.id === modelId);
  
  if (event.ctrlKey || event.metaKey) {
    // Ctrl+Click: Toggle individual selection
    toggleModelSelection(modelId);
  } else if (event.shiftKey && lastSelectedIndex !== null) {
    // Shift+Click: Range selection
    const start = Math.min(lastSelectedIndex, clickedIndex);
    const end = Math.max(lastSelectedIndex, clickedIndex);
    
    for (let i = start; i <= end; i++) {
      selectedModels.add(models[i].id);
    }
    renderModelOrdering();
  } else {
    // Regular click: Single selection (clear others)
    selectedModels.clear();
    selectedModels.add(modelId);
    lastSelectedIndex = clickedIndex;
    renderModelOrdering();
  }
}

/**
 * Toggle model selection
 */
function toggleModelSelection(modelId) {
  const { selectedModels } = window.modelOrderingState;
  
  if (selectedModels.has(modelId)) {
    selectedModels.delete(modelId);
  } else {
    selectedModels.add(modelId);
    const models = getModelsForCurrentScope();
    lastSelectedIndex = models.findIndex(m => m.id === modelId);
  }
  
  renderModelOrdering();
}

/**
 * Clear all selections
 */
function clearSelection() {
  window.modelOrderingState.selectedModels.clear();
  lastSelectedIndex = null;
  renderModelOrdering();
}

/**
 * Select all models
 */
function selectAllModels() {
  const models = getModelsForCurrentScope();
  models.forEach(m => window.modelOrderingState.selectedModels.add(m.id));
  renderModelOrdering();
}

// ============================================================================
// DRAG & DROP
// ============================================================================

/**
 * Handle drag start
 */
function handleDragStart(event, modelId) {
  window.modelOrderingState.draggedItem = modelId;
  window.modelOrderingState.isDragging = true;
  
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', modelId);
  
  // If dragged item is selected, we're moving the whole selection
  // Otherwise, just move the single item
  if (!window.modelOrderingState.selectedModels.has(modelId)) {
    window.modelOrderingState.selectedModels.clear();
    window.modelOrderingState.selectedModels.add(modelId);
  }
  
  event.target.style.opacity = '0.5';
}

/**
 * Handle drag over
 */
function handleDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  
  // Find drop target
  const target = event.target.closest('.model-ordering-row');
  if (target) {
    // Clear previous highlights
    document.querySelectorAll('.model-ordering-row').forEach(row => {
      row.style.borderTopColor = '';
    });
    // Highlight drop position
    target.style.borderTopColor = 'var(--psf-accent, #00d4ff)';
  }
}

/**
 * Handle drag end
 */
function handleDragEnd(event) {
  window.modelOrderingState.isDragging = false;
  event.target.style.opacity = '1';
  
  // Clear highlights
  document.querySelectorAll('.model-ordering-row').forEach(row => {
    row.style.borderTopColor = '';
  });
}

/**
 * Handle drop
 */
function handleDrop(event) {
  event.preventDefault();
  
  const target = event.target.closest('.model-ordering-row');
  if (!target) return;
  
  const targetId = target.dataset.modelId;
  const targetIndex = parseInt(target.dataset.index);
  
  moveSelectedToPosition(targetIndex);
  
  window.modelOrderingState.draggedItem = null;
  renderModelOrdering();
}

// ============================================================================
// REORDERING
// ============================================================================

/**
 * Move selected models to a specific position
 */
function moveSelectedToPosition(targetIndex) {
  const { selectedModels, orderingData, scopeMode, currentCollection } = window.modelOrderingState;
  
  if (selectedModels.size === 0) return;
  
  const orderArray = scopeMode === 'global' 
    ? orderingData.globalOrder 
    : orderingData.collectionOrders[currentCollection];
  
  if (!orderArray) return;
  
  // Get selected model IDs in their current order
  const selectedIds = Array.from(selectedModels);
  const selectedInOrder = selectedIds
    .map(id => ({ id, index: orderArray.indexOf(id) }))
    .filter(item => item.index !== -1)
    .sort((a, b) => a.index - b.index)
    .map(item => item.id);
  
  // Remove selected items from array
  selectedInOrder.forEach(id => {
    const idx = orderArray.indexOf(id);
    if (idx !== -1) orderArray.splice(idx, 1);
  });
  
  // Insert at target position
  const insertIndex = Math.min(targetIndex, orderArray.length);
  orderArray.splice(insertIndex, 0, ...selectedInOrder);
  
  // Mark as modified
  orderingData.lastModified = new Date().toISOString();
}

/**
 * Jump model to specific position
 */
function jumpToPosition(modelId, position) {
  const newIndex = parseInt(position) - 1;
  if (isNaN(newIndex) || newIndex < 0) return;
  
  // Select only this model and move it
  window.modelOrderingState.selectedModels.clear();
  window.modelOrderingState.selectedModels.add(modelId);
  
  moveSelectedToPosition(newIndex);
  renderModelOrdering();
}

/**
 * Move selected models up
 */
function moveSelectedUp() {
  const { selectedModels, orderingData, scopeMode, currentCollection } = window.modelOrderingState;
  if (selectedModels.size === 0) return;
  
  const orderArray = scopeMode === 'global' 
    ? orderingData.globalOrder 
    : orderingData.collectionOrders[currentCollection];
  
  // Find minimum index of selected items
  let minIndex = Infinity;
  selectedModels.forEach(id => {
    const idx = orderArray.indexOf(id);
    if (idx !== -1 && idx < minIndex) minIndex = idx;
  });
  
  if (minIndex > 0) {
    moveSelectedToPosition(minIndex - 1);
    renderModelOrdering();
  }
}

/**
 * Move selected models down
 */
function moveSelectedDown() {
  const { selectedModels, orderingData, scopeMode, currentCollection } = window.modelOrderingState;
  if (selectedModels.size === 0) return;
  
  const orderArray = scopeMode === 'global' 
    ? orderingData.globalOrder 
    : orderingData.collectionOrders[currentCollection];
  
  // Find maximum index of selected items
  let maxIndex = -1;
  selectedModels.forEach(id => {
    const idx = orderArray.indexOf(id);
    if (idx !== -1 && idx > maxIndex) maxIndex = idx;
  });
  
  if (maxIndex < orderArray.length - 1) {
    moveSelectedToPosition(maxIndex + 2); // +2 because we remove items first
    renderModelOrdering();
  }
}

// ============================================================================
// GROUPING
// ============================================================================

/**
 * Group selected models
 */
function groupSelectedModels() {
  const { selectedModels, groups } = window.modelOrderingState;
  
  if (selectedModels.size < 2) {
    alert('Select at least 2 models to create a group.');
    return;
  }
  
  const groupName = prompt('Enter group name:', `Group ${groups.length + 1}`);
  if (!groupName) return;
  
  // Generate random color
  const colors = ['#ff6b6b', '#ffd400', '#00ff88', '#00d4ff', '#8a2be2', '#ff8c00', '#00ced1'];
  const color = colors[groups.length % colors.length];
  
  const newGroup = {
    id: `group-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    name: groupName,
    modelIds: Array.from(selectedModels),
    color: color,
    moeConfig: {
      role: null,
      priority: null,
      routingWeight: null,
      connectionType: null
    }
  };
  
  // Remove models from any existing groups
  groups.forEach(g => {
    g.modelIds = g.modelIds.filter(id => !selectedModels.has(id));
  });
  
  // Remove empty groups
  window.modelOrderingState.groups = groups.filter(g => g.modelIds.length > 0);
  
  // Add new group
  window.modelOrderingState.groups.push(newGroup);
  
  clearSelection();
  renderModelOrdering();
}

/**
 * Dissolve a group (ungroup models)
 */
function dissolveGroup(groupId) {
  if (!confirm('Dissolve this group? Models will remain in their current positions.')) return;
  
  window.modelOrderingState.groups = window.modelOrderingState.groups.filter(g => g.id !== groupId);
  renderModelOrdering();
}

/**
 * Edit group (name, color, MoE config)
 */
function editGroup(groupId) {
  const group = window.modelOrderingState.groups.find(g => g.id === groupId);
  if (!group) return;
  
  const newName = prompt('Edit group name:', group.name);
  if (newName) {
    group.name = newName;
    renderModelOrdering();
  }
}

/**
 * Remove selected models from their groups
 */
function removeSelectedFromGroups() {
  const { selectedModels, groups } = window.modelOrderingState;
  if (selectedModels.size === 0) return;
  
  groups.forEach(g => {
    g.modelIds = g.modelIds.filter(id => !selectedModels.has(id));
  });
  
  // Remove empty groups
  window.modelOrderingState.groups = groups.filter(g => g.modelIds.length > 0);
  
  renderModelOrdering();
}

// ============================================================================
// EXPORTS
// ============================================================================

window.handleRowClick = handleRowClick;
window.toggleModelSelection = toggleModelSelection;
window.clearSelection = clearSelection;
window.selectAllModels = selectAllModels;
window.handleDragStart = handleDragStart;
window.handleDragOver = handleDragOver;
window.handleDragEnd = handleDragEnd;
window.handleDrop = handleDrop;
window.moveSelectedToPosition = moveSelectedToPosition;
window.jumpToPosition = jumpToPosition;
window.moveSelectedUp = moveSelectedUp;
window.moveSelectedDown = moveSelectedDown;
window.groupSelectedModels = groupSelectedModels;
window.dissolveGroup = dissolveGroup;
window.editGroup = editGroup;
window.removeSelectedFromGroups = removeSelectedFromGroups;
