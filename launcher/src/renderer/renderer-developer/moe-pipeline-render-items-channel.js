/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */

function renderChannelRow(channel, index) {
  const { editMode, expandedMoeItem } = window.modelOrderingState;
  const isExpanded = expandedMoeItem === channel.id;
  const expandIcon = isExpanded ? '▼' : '▶';
  const theme = getMoeTheme();
  const flowCondition = channel.flowCondition || 'always';
  const retryCount = Number.isInteger(Number(channel.retryCount)) ? Number(channel.retryCount) : 0;
  const timeoutMs = Number.isFinite(Number(channel.timeoutMs)) ? Number(channel.timeoutMs) : 120000;
  const onFailure = channel.onFailure === 'continue' ? 'continue' : 'stop';

  return `
    <div class="moe-item moe-channel ${isExpanded ? 'expanded' : ''}" data-moe-id="${channel.id}" data-moe-type="channel" data-index="${index}"
         ${editMode ? `draggable="true" ondragstart="handleMoeDragStart(event, '${channel.id}')" ondragend="handleMoeDragEnd(event)"` : ''}
         onclick="handleMoeItemClick(event, '${channel.id}')"
         style="background: rgba(255,165,0,0.08); border: 2px dashed #ffa500; border-radius: 6px; padding: 8px 15px;
                cursor: ${editMode ? 'grab' : 'pointer'}; transition: all 0.15s ease; ${!channel.enabled ? 'opacity: 0.5;' : ''}">
      <div style="display: flex; align-items: center; gap: 12px;">
        <span onclick="event.stopPropagation(); toggleMoeExpand('${channel.id}')"
              style="color: #ffa500; cursor: pointer; user-select: none; font-size: 10px; width: 15px;">${expandIcon}</span>
        ${editMode ? `<span class="drag-handle" style="color: #ffa500; cursor: grab;">⋮⋮</span>` : ''}
        <span style="color: #ffa500; font-weight: bold; min-width: 30px; text-align: center;">${index + 1}</span>
        <span style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:6px;background:rgba(88,166,255,0.15);">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#58a6ff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="8" x2="14" y2="8"/><polyline points="10,4 14,8 10,12"/></svg>
        </span>
        <span style="color:#fff; font-weight:bold; font-size:14px; min-width:80px;">Channel</span>
        <select onchange="updateChannelDirection('${channel.id}', this.value)" onclick="event.stopPropagation()"
                style="padding: 4px 10px; background: rgba(255,165,0,0.2); border: 1px solid #ffa500; border-radius: 4px; color: #ffa500; cursor: pointer;">
          <option value="bidirectional" ${channel.direction === 'bidirectional' ? 'selected' : ''}>↔ Bi-directional</option>
          <option value="unidirectional" ${channel.direction === 'unidirectional' ? 'selected' : ''}>↓ Uni-directional</option>
        </select>
        <input type="text" value="${channel.label || ''}" placeholder="Optional label..." onchange="updateMoeItemLabel('${channel.id}', this.value)" onclick="event.stopPropagation()"
               style="background: transparent; border: none; border-bottom: 1px solid transparent; color: #888; font-size: 12px; padding: 4px; flex: 1;"
               onmouseover="this.style.borderBottomColor='#ffa500'" onmouseout="this.style.borderBottomColor='transparent'">
        <label onclick="event.stopPropagation()" style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
          <input type="checkbox" ${channel.enabled ? 'checked' : ''} onchange="toggleMoeItemEnabled('${channel.id}', this.checked)">
          <span style="color: #888; font-size: 11px;">Enabled</span>
        </label>
        <button onclick="event.stopPropagation(); deleteMoeItem('${channel.id}')"
                style="padding: 4px 8px; background: transparent; border: 1px solid ${theme.error}; border-radius: 4px; color: ${theme.error}; cursor: pointer; font-size: 11px;">✕</button>
      </div>
      ${isExpanded ? `
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-top:8px; padding-top:8px; border-top:1px solid rgba(255,165,0,0.2);">
        <label style="color:#888; font-size:11px;">Flow</label>
        <select onchange="updateChannelFlowCondition('${channel.id}', this.value)" onclick="event.stopPropagation()"
                style="padding:3px 8px; background: rgba(255,165,0,0.2); border: 1px solid #ffa500; border-radius: 4px; color: #ffa500; cursor: pointer;">
          <option value="always" ${flowCondition === 'always' ? 'selected' : ''}>Always</option>
          <option value="on_success" ${flowCondition === 'on_success' ? 'selected' : ''}>On Success</option>
          <option value="on_failure" ${flowCondition === 'on_failure' ? 'selected' : ''}>On Failure</option>
        </select>
        <label style="color:#888; font-size:11px;">Retry</label>
        <input type="number" min="0" max="10" value="${retryCount}" onclick="event.stopPropagation()"
               onchange="updateChannelRetryCount('${channel.id}', this.value)"
               style="width:58px; padding:3px 6px; background: rgba(255,255,255,0.08); border:1px solid #555; border-radius:4px; color:#fff;">
        <label style="color:#888; font-size:11px;">Timeout(ms)</label>
        <input type="number" min="1000" max="600000" value="${timeoutMs}" onclick="event.stopPropagation()"
               onchange="updateChannelTimeoutMs('${channel.id}', this.value)"
               style="width:92px; padding:3px 6px; background: rgba(255,255,255,0.08); border:1px solid #555; border-radius:4px; color:#fff;">
        <label style="color:#888; font-size:11px;">On Failure</label>
        <select onchange="updateChannelFailurePolicy('${channel.id}', this.value)" onclick="event.stopPropagation()"
                style="padding:3px 8px; background: rgba(255,165,0,0.2); border: 1px solid #ffa500; border-radius: 4px; color: #ffa500; cursor: pointer;">
          <option value="stop" ${onFailure === 'stop' ? 'selected' : ''}>Stop</option>
          <option value="continue" ${onFailure === 'continue' ? 'selected' : ''}>Continue</option>
        </select>
      </div>
      ` : ''}
    </div>
  `;
}

window.renderChannelRow = renderChannelRow;
