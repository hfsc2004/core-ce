/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */

function renderEndpointRegistryRow(registryItem, index) {
  const { editMode, expandedMoeItem } = window.modelOrderingState;
  const isExpanded = expandedMoeItem === registryItem.id;
  const expandIcon = isExpanded ? '▼' : '▶';
  const theme = getMoeTheme();
  const state = ensureEndpointRegistryRenderState();
  return `
    <div class="moe-item moe-endpoint-registry ${isExpanded ? 'expanded' : ''}"
         data-moe-id="${registryItem.id}" data-moe-type="endpoint_registry" data-index="${index}"
         ${editMode ? `draggable="true" ondragstart="handleMoeDragStart(event, '${registryItem.id}')" ondragend="handleMoeDragEnd(event)"` : ''}
         onclick="handleMoeItemClick(event, '${registryItem.id}')"
         style="background: rgba(79,70,229,0.12); border: 2px solid rgba(129,140,248,0.8); border-radius: 8px; padding: 12px 15px;
                cursor: ${editMode ? 'grab' : 'pointer'}; transition: all 0.15s ease; ${!registryItem.enabled ? 'opacity: 0.5;' : ''}">
      <div style="display: flex; align-items: center; gap: 12px;">
        <span onclick="event.stopPropagation(); toggleMoeExpand('${registryItem.id}')"
              style="color: #a5b4fc; cursor: pointer; user-select: none; font-size: 10px; width: 15px;">${expandIcon}</span>
        ${editMode ? `<span class="drag-handle" style="color: #a5b4fc; cursor: grab;">⋮⋮</span>` : ''}
        <span style="font-size: 18px;">🧭</span>
        <span onclick="event.stopPropagation(); promptRenameMoeItem('${registryItem.id}')" onmousedown="event.stopPropagation();"
              style="color:#fff; font-weight:bold; font-size:14px; min-width:220px; padding:4px; border-bottom:1px solid transparent; cursor:text;"
              onmouseover="this.style.borderBottomColor='#a5b4fc'" onmouseout="this.style.borderBottomColor='transparent'">${escapeBinding(registryItem.name || 'Distributed Endpoint Registry')}</span>
        <div style="flex:1; color:#9ca3af; font-size:12px;">
          ${state.enabled ? 'Enabled' : 'Disabled'} • ${flattenEndpointWorkers(state.roles).length} worker(s)
        </div>
        <label onclick="event.stopPropagation()" style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
          <input type="checkbox" ${registryItem.enabled ? 'checked' : ''} onchange="toggleMoeItemEnabled('${registryItem.id}', this.checked)">
          <span style="color: #888; font-size: 11px;">Enabled</span>
        </label>
        <button onclick="event.stopPropagation(); deleteMoeItem('${registryItem.id}')"
                style="padding: 4px 8px; background: transparent; border: 1px solid ${theme.error}; border-radius: 4px; color: ${theme.error}; cursor: pointer; font-size: 11px;">🗑️</button>
      </div>
      ${isExpanded ? renderEndpointRegistryDetails() : ''}
    </div>
  `;
}

window.renderEndpointRegistryRow = renderEndpointRegistryRow;
