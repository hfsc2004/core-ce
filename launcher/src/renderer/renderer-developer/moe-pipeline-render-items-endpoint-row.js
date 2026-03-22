/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
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
        <span style="color: #a5b4fc; font-weight: bold; min-width: 30px; text-align: center;">${index + 1}</span>
        <span style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:6px;background:rgba(240,136,62,0.15);">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#f0883e" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2.2"/><circle cx="8" cy="8" r="6.2"/><line x1="8" y1="1.5" x2="8" y2="5"/><line x1="8" y1="11" x2="8" y2="14.5"/><line x1="1.5" y1="8" x2="5" y2="8"/><line x1="11" y1="8" x2="14.5" y2="8"/></svg>
        </span>
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
                style="padding: 4px 8px; background: transparent; border: 1px solid ${theme.error}; border-radius: 4px; color: ${theme.error}; cursor: pointer; font-size: 11px;">✕</button>
      </div>
      ${isExpanded ? renderEndpointRegistryDetails() : ''}
    </div>
  `;
}

window.renderEndpointRegistryRow = renderEndpointRegistryRow;
