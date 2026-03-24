/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */

function renderChannelRow(channel, index) {
  const { editMode, expandedMoeItem, expandedMoeItems } = window.modelOrderingState;
  const expanded = Array.isArray(expandedMoeItems) ? expandedMoeItems : [];
  const isExpanded = expanded.includes(channel.id) || expandedMoeItem === channel.id;
  const expandIcon = isExpanded ? '▼' : '▶';
  const theme = getMoeTheme();
  const flowCondition = String(channel.when || channel.flowCondition || 'always').toLowerCase();
  const mode = String(channel.mode || 'direct').toLowerCase();
  const matchRule = String(channel.matchRule || '');
  const retryCount = Number.isInteger(Number(channel.retryCount)) ? Number(channel.retryCount) : 0;
  const timeoutMs = Number.isFinite(Number(channel.timeoutMs)) ? Number(channel.timeoutMs) : 120000;
  const onFailure = channel.onFailure === 'continue' ? 'continue' : 'stop';
  const fromAgentId = String(channel.fromAgentId || '');
  const toAgentId = String(channel.toAgentId || '');
  const groupId = String(channel.groupId || '');
  const agentItems = Array.isArray(window.modelOrderingState?.moeItems)
    ? window.modelOrderingState.moeItems.filter((item) => item?.type === 'agent')
    : [];
  const safeHtml = (text) => {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(String(text ?? ''));
    return String(text ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  };
  const fromOptions = [
    `<option value="" ${!fromAgentId ? 'selected' : ''}>Auto (previous agent)</option>`,
    ...agentItems.map((agent) => {
      const selected = fromAgentId === String(agent.id) ? 'selected' : '';
      return `<option value="${safeHtml(agent.id)}" ${selected}>${safeHtml(agent.name || agent.id)}</option>`;
    })
  ].join('');
  const toOptions = [
    `<option value="" ${!toAgentId ? 'selected' : ''}>Auto (routing target)</option>`,
    ...agentItems.map((agent) => {
      const selected = toAgentId === String(agent.id) ? 'selected' : '';
      return `<option value="${safeHtml(agent.id)}" ${selected}>${safeHtml(agent.name || agent.id)}</option>`;
    })
  ].join('');
  const groupMembers = (groupId && agentItems.length > 0)
    ? agentItems
      .map((agent) => {
        const agentGroups = Array.isArray(agent.groups) ? agent.groups.map((g) => String(g || '').trim()) : [];
        const checked = agentGroups.includes(groupId);
        return `
          <label onclick="event.stopPropagation()" style="display:inline-flex; align-items:center; gap:6px; color:#b8c7d9; font-size:11px; border:1px solid rgba(255,165,0,0.35); border-radius:999px; padding:3px 8px; background:rgba(255,165,0,0.08);">
            <input type="checkbox" ${checked ? 'checked' : ''} onchange="toggleChannelGroupMember('${channel.id}', '${agent.id}', this.checked)">
            <span>${safeHtml(agent.name || agent.id)}</span>
          </label>
        `;
      })
      .join('')
    : '';

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
        <span style="color:#fff; font-weight:bold; font-size:12px; min-width:80px; padding:4px; border-bottom:1px solid transparent;">Channel</span>
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
        <label style="color:#888; font-size:11px;">From</label>
        <select onchange="updateChannelFromAgent('${channel.id}', this.value)" onclick="event.stopPropagation()"
                style="min-width:170px; padding:3px 8px; background: rgba(255,165,0,0.2); border: 1px solid #ffa500; border-radius: 4px; color: #ffa500; cursor: pointer;">
          ${fromOptions}
        </select>
        <label style="color:#888; font-size:11px;">Mode</label>
        <select onchange="updateChannelMode('${channel.id}', this.value)" onclick="event.stopPropagation()"
                style="min-width:120px; padding:3px 8px; background: rgba(255,165,0,0.2); border: 1px solid #ffa500; border-radius: 4px; color: #ffa500; cursor: pointer;">
          <option value="direct" ${mode === 'direct' ? 'selected' : ''}>Direct</option>
          <option value="broadcast" ${mode === 'broadcast' ? 'selected' : ''}>Broadcast</option>
          <option value="group" ${mode === 'group' ? 'selected' : ''}>Group</option>
        </select>
        ${mode === 'direct' ? `
          <label style="color:#888; font-size:11px;">To</label>
          <select onchange="updateChannelToAgent('${channel.id}', this.value)" onclick="event.stopPropagation()"
                  style="min-width:170px; padding:3px 8px; background: rgba(255,165,0,0.2); border: 1px solid #ffa500; border-radius: 4px; color: #ffa500; cursor: pointer;">
            ${toOptions}
          </select>
        ` : ''}
        ${mode === 'group' ? `
          <label style="color:#888; font-size:11px;">Group</label>
          <input type="text" value="${safeHtml(groupId)}" placeholder="e.g. policy-council" onclick="event.stopPropagation()"
                 onchange="updateChannelGroupId('${channel.id}', this.value)"
                 style="width:170px; padding:3px 6px; background: rgba(255,255,255,0.08); border:1px solid #555; border-radius:4px; color:#fff;">
        ` : ''}
        <label style="color:#888; font-size:11px;">Flow</label>
        <select onchange="updateChannelWhen('${channel.id}', this.value)" onclick="event.stopPropagation()"
                style="padding:3px 8px; background: rgba(255,165,0,0.2); border: 1px solid #ffa500; border-radius: 4px; color: #ffa500; cursor: pointer;">
          <option value="always" ${flowCondition === 'always' ? 'selected' : ''}>Always</option>
          <option value="on_success" ${flowCondition === 'on_success' ? 'selected' : ''}>On Success</option>
          <option value="on_failure" ${flowCondition === 'on_failure' ? 'selected' : ''}>On Failure</option>
          <option value="on_match" ${flowCondition === 'on_match' ? 'selected' : ''}>On Match</option>
        </select>
        <label style="color:#888; font-size:11px;">Match</label>
        <input type="text" value="${safeHtml(matchRule)}" placeholder="contains:token or regex:/.../" onclick="event.stopPropagation()"
               onchange="updateChannelMatchRule('${channel.id}', this.value)"
               style="width:220px; padding:3px 6px; background: rgba(255,255,255,0.08); border:1px solid #555; border-radius:4px; color:#fff;">
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
        ${mode === 'broadcast' ? `<span style="color:#6fa8dc; font-size:11px;">Broadcast target: all enabled agents except sender</span>` : ''}
      </div>
      ${mode === 'group' ? `
        <div style="display:flex; gap:8px; align-items:flex-start; flex-wrap:wrap; margin-top:8px; padding-top:8px; border-top:1px dashed rgba(255,165,0,0.25);">
          <span style="color:#888; font-size:11px; min-width:95px;">Group Members</span>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            ${groupMembers || `<span style="color:#777; font-size:11px;">Set Group name to manage members.</span>`}
          </div>
        </div>
      ` : ''}
      ` : ''}
    </div>
  `;
}

window.renderChannelRow = renderChannelRow;
