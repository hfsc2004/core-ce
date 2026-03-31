/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */

function renderBindingsRow(bindings, index) {
  const { editMode, expandedMoeItem, expandedMoeItems } = window.modelOrderingState;
  const expanded = Array.isArray(expandedMoeItems) ? expandedMoeItems : [];
  const isExpanded = expanded.includes(bindings.id) || expandedMoeItem === bindings.id;
  const expandIcon = isExpanded ? '▼' : '▶';
  const theme = getMoeTheme();
  const entries = Array.isArray(bindings.entries) ? bindings.entries : [];
  const assignedGatewayCount = Array.isArray(bindings?.assignedGatewayIds)
    ? bindings.assignedGatewayIds.map((id) => String(id || '').trim()).filter(Boolean).length
    : 0;
  const canvasStyle = typeof window.getMoeItemCanvasStyle === 'function'
    ? window.getMoeItemCanvasStyle(bindings, index)
    : '';
  const renameAttrs = isExpanded
    ? `onclick="event.stopPropagation(); promptRenameMoeItem('${bindings.id}')" onmousedown="event.stopPropagation();"`
    : '';
  const renameCursor = isExpanded ? 'text' : 'default';
  const renameHoverIn = isExpanded ? `this.style.borderBottomColor='#ddd'` : '';
  const renameHoverOut = isExpanded ? `this.style.borderBottomColor='transparent'` : '';

  return `
    <div class="moe-item moe-bindings ${isExpanded ? 'expanded' : ''}"
         data-moe-id="${bindings.id}" data-moe-type="bindings" data-index="${index}"
         ${editMode && !isExpanded ? `draggable="true" ondragstart="handleMoeDragStart(event, '${bindings.id}')" ondragend="handleMoeDragEnd(event)"` : ''}
         onmousedown="beginMoeCanvasDrag(event, '${bindings.id}')"
         onclick="handleMoeItemClick(event, '${bindings.id}')"
         style="background: rgba(255,255,255,0.06); border: 2px solid #bbb; border-radius: 8px; padding: 12px 15px;
                cursor: ${editMode ? 'grab' : 'pointer'}; transition: all 0.15s ease; ${!bindings.enabled ? 'opacity: 0.5;' : ''} ${canvasStyle}">
      <div style="display: flex; align-items: center; gap: 12px;">
        <span onclick="event.stopPropagation(); toggleMoeExpand('${bindings.id}')"
              style="color: #ddd; cursor: pointer; user-select: none; font-size: 10px; width: 15px;">${expandIcon}</span>
        ${editMode ? `<span class="drag-handle" style="color: #ddd; cursor: grab;">⋮⋮</span>` : ''}
        <span style="color: #ddd; font-weight: bold; min-width: 30px; text-align: center;">${index + 1}</span>
        <span style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:6px;background:rgba(210,153,34,0.15);">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#d2991e" stroke-width="1.8" stroke-linecap="round"><path d="M4,8 C4,5.5 12,5.5 12,8 C12,10.5 4,10.5 4,8Z"/><line x1="1" y1="8" x2="4" y2="8"/><line x1="12" y1="8" x2="15" y2="8"/></svg>
        </span>
        <span ${renameAttrs}
              style="color:#fff; font-weight:bold; font-size:12px; min-width:200px; padding:4px; border-bottom:1px solid transparent; cursor:${renameCursor};"
              ${renameHoverIn ? `onmouseover="${renameHoverIn}"` : ''}
              ${renameHoverOut ? `onmouseout="${renameHoverOut}"` : ''}>${escapeBinding(bindings.name || '')}</span>
        <div style="flex:1; color:#999; font-size:12px;">${entries.length} binding${entries.length !== 1 ? 's' : ''}</div>
        <span style="background: rgba(255,255,255,0.10); color: #cbd5e1; padding: 3px 10px; border-radius: 10px; font-size: 11px;">
          Gateways ${assignedGatewayCount}
        </span>
        <label onclick="event.stopPropagation()" style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
          <input type="checkbox" ${bindings.enabled ? 'checked' : ''} onchange="toggleMoeItemEnabled('${bindings.id}', this.checked)">
          <span style="color: #888; font-size: 11px;">Enabled</span>
        </label>
        <button onclick="event.stopPropagation(); deleteMoeItem('${bindings.id}')"
                style="padding: 4px 8px; background: transparent; border: 1px solid ${theme.error}; border-radius: 4px; color: ${theme.error}; cursor: pointer; font-size: 11px;">✕</button>
      </div>
      ${isExpanded ? renderBindingsDetails(bindings) : ''}
    </div>
  `;
}

function renderBindingsDetails(bindings) {
  const entries = Array.isArray(bindings.entries) ? bindings.entries : [];
  const gatewayItems = (Array.isArray(window.modelOrderingState?.moeItems) ? window.modelOrderingState.moeItems : [])
    .filter((item) => item?.type === 'gateway' && item?.enabled !== false)
    .map((item) => ({
      id: String(item.id || '').trim(),
      label: String(item.name || item.id || '').trim() || String(item.id || '').trim()
    }))
    .filter((item) => item.id);
  const assignedGatewayIds = Array.isArray(bindings?.assignedGatewayIds)
    ? bindings.assignedGatewayIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  const assignedGatewaySet = new Set(assignedGatewayIds);
  const assignmentHtml = gatewayItems.length > 0
    ? gatewayItems.map((gateway) => `
      <label onclick="event.stopPropagation()" style="display:inline-flex; align-items:center; gap:6px; color:#d5e8ff; font-size:11px; border:1px solid rgba(88,166,255,0.35); border-radius:999px; padding:3px 8px; background:rgba(88,166,255,0.08);">
        <input type="checkbox" ${assignedGatewaySet.has(gateway.id) ? 'checked' : ''} onchange="toggleBindingsAssignedGateway('${bindings.id}', '${gateway.id}', this.checked)">
        <span>${escapeBinding(gateway.label)}</span>
      </label>
    `).join('')
    : '<span style="color:#777; font-size:11px;">No enabled gateways available.</span>';
  return `
    <div onclick="event.stopPropagation()" style="margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.2);">
      <div style="margin-bottom: 10px;">
        <label style="color: #888; font-size: 12px; display: block; margin-bottom: 8px;">Gateway Assignment (optional)</label>
        <div style="display:flex; gap:6px; flex-wrap:wrap; background: rgba(88,166,255,0.06); border:1px solid rgba(88,166,255,0.25); border-radius:6px; padding:10px;">
          ${assignmentHtml}
        </div>
        <div style="color:#666; font-size:11px; margin-top:6px;">
          If empty, bindings flow to all enabled gateways in graph view.
        </div>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <label style="color: #888; font-size: 12px;">Variable Bindings (key/value)</label>
        <button onclick="addBindingEntry('${bindings.id}')" style="padding:4px 10px; background:rgba(255,255,255,0.12); border:1px solid #bbb; border-radius:4px; color:#ddd; cursor:pointer; font-size:11px;">+ Add</button>
      </div>
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${entries.map((entry, idx) => `
          <div style="display:flex; gap:8px; align-items:center;">
            <input type="text" value="${escapeBinding(entry?.key || '')}" placeholder="e.g. gpio.red"
                   draggable="false"
                   oninput="updateBindingEntry('${bindings.id}', ${idx}, 'key', this.value)"
                   onchange="updateBindingEntry('${bindings.id}', ${idx}, 'key', this.value)"
                   onkeydown="return handleBindingInputKeydown(event, '${bindings.id}', ${idx}, 'key')"
                   onmousedown="event.stopPropagation()"
                   style="flex:1; padding:6px 8px; background: rgba(255,255,255,0.1); border:1px solid #555; border-radius:4px; color:#fff;">
            <input type="text" value="${escapeBinding(entry?.value || '')}" placeholder="e.g. 2"
                   draggable="false"
                   oninput="updateBindingEntry('${bindings.id}', ${idx}, 'value', this.value)"
                   onchange="updateBindingEntry('${bindings.id}', ${idx}, 'value', this.value)"
                   onkeydown="return handleBindingInputKeydown(event, '${bindings.id}', ${idx}, 'value')"
                   onmousedown="event.stopPropagation()"
                   style="flex:1; padding:6px 8px; background: rgba(255,255,255,0.1); border:1px solid #555; border-radius:4px; color:#fff;">
            <button onclick="removeBindingEntry('${bindings.id}', ${idx})" style="padding:4px 8px; background:transparent; border:1px solid #ff6b6b; color:#ff6b6b; border-radius:4px; cursor:pointer; font-size:11px;">✕</button>
          </div>
        `).join('') || '<div style="color:#777; font-size:12px;">No bindings configured.</div>'}
      </div>
    </div>
  `;
}

window.renderBindingsRow = renderBindingsRow;
window.renderBindingsDetails = renderBindingsDetails;
