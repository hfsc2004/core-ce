/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */

function renderChannelRow(channel, index) {
  const { editMode } = window.modelOrderingState;
  const theme = getMoeTheme();
  const flowCondition = channel.flowCondition || 'always';
  const retryCount = Number.isInteger(Number(channel.retryCount)) ? Number(channel.retryCount) : 0;
  const timeoutMs = Number.isFinite(Number(channel.timeoutMs)) ? Number(channel.timeoutMs) : 120000;
  const onFailure = channel.onFailure === 'continue' ? 'continue' : 'stop';

  return `
    <div class="moe-item moe-channel" data-moe-id="${channel.id}" data-moe-type="channel" data-index="${index}"
         ${editMode ? `draggable="true" ondragstart="handleMoeDragStart(event, '${channel.id}')" ondragend="handleMoeDragEnd(event)"` : ''}
         style="background: rgba(255,165,0,0.08); border: 2px dashed #ffa500; border-radius: 6px; padding: 8px 15px;
                cursor: ${editMode ? 'grab' : 'default'}; transition: all 0.15s ease; ${!channel.enabled ? 'opacity: 0.5;' : ''}">
      <div style="display: flex; align-items: center; gap: 12px;">
        ${editMode ? `<span class="drag-handle" style="color: #ffa500; cursor: grab;">⋮⋮</span>` : ''}
        <span style="font-size: 16px;">🔗</span>
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
                style="padding: 4px 8px; background: transparent; border: 1px solid ${theme.error}; border-radius: 4px; color: ${theme.error}; cursor: pointer; font-size: 11px;">🗑️</button>
      </div>
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
    </div>
  `;
}

window.renderChannelRow = renderChannelRow;
