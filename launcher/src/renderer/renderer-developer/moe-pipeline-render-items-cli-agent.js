/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */

function renderCliAgentRow(cliAgent, index) {
  const { editMode, expandedMoeItem, expandedMoeItems } = window.modelOrderingState;
  const expanded = Array.isArray(expandedMoeItems) ? expandedMoeItems : [];
  const isExpanded = expanded.includes(cliAgent.id) || expandedMoeItem === cliAgent.id;
  const expandIcon = isExpanded ? '▼' : '▶';
  const ownerLabel = resolveCliAgentOwnerLabel(cliAgent.ownerAgentId);
  const mode = String(cliAgent.executionMode || 'on-tool');
  const hooks = (cliAgent && typeof cliAgent.hooks === 'object') ? cliAgent.hooks : {};
  const enabledHooks = ['runCommand', 'writeFile', 'runTests', 'gitDiff', 'flashFirmware']
    .filter((key) => hooks[key] === true).length;
  const theme = getMoeTheme();

  return `
    <div class="moe-item moe-cli-agent ${isExpanded ? 'expanded' : ''}"
         data-moe-id="${cliAgent.id}" data-moe-type="cli_agent" data-index="${index}"
         ${editMode ? `draggable="true" ondragstart="handleMoeDragStart(event, '${cliAgent.id}')" ondragend="handleMoeDragEnd(event)"` : ''}
         onclick="handleMoeItemClick(event, '${cliAgent.id}')"
         style="background: rgba(188,140,255,0.12); border: 2px solid #bc8cff; border-radius: 8px; padding: 12px 15px;
                cursor: ${editMode ? 'grab' : 'pointer'}; transition: all 0.15s ease; ${!cliAgent.enabled ? 'opacity: 0.5;' : ''}">
      <div style="display: flex; align-items: center; gap: 12px;">
        <span onclick="event.stopPropagation(); toggleMoeExpand('${cliAgent.id}')"
              style="color:#bc8cff; cursor: pointer; user-select: none; font-size: 10px; width: 15px;">${expandIcon}</span>
        ${editMode ? `<span class="drag-handle" style="color:#bc8cff; cursor: grab;">⋮⋮</span>` : ''}
        <span style="color:#bc8cff; font-weight: bold; min-width: 30px; text-align: center;">${index + 1}</span>
        <span style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:6px;background:rgba(188,140,255,0.2);">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#bc8cff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 3.5h13v9h-13z"/><path d="M3.5 6.2l2.2 1.8-2.2 1.8"/><line x1="7.8" y1="10" x2="12" y2="10"/></svg>
        </span>
        <span onclick="event.stopPropagation(); promptRenameMoeItem('${cliAgent.id}')" onmousedown="event.stopPropagation();"
              style="color:#fff; font-weight:bold; font-size:12px; min-width:150px; padding:4px; border-bottom:1px solid transparent; cursor:text;"
              onmouseover="this.style.borderBottomColor='#bc8cff'" onmouseout="this.style.borderBottomColor='transparent'">${escapeBinding(cliAgent.name || 'CLI Agent')}</span>
        <div style="flex:1; display:flex; align-items:center; gap:8px; color:#bbb; font-size:11px;">
          <span style="background:rgba(188,140,255,0.2); color:#dec8ff; padding:2px 8px; border-radius:10px;">${escapeBinding(ownerLabel)}</span>
          <span style="background:rgba(255,255,255,0.1); color:#ccc; padding:2px 8px; border-radius:10px;">${escapeBinding(mode)}</span>
          <span style="background:rgba(255,255,255,0.08); color:#aaa; padding:2px 8px; border-radius:10px;">hooks ${enabledHooks}/5</span>
        </div>
        <label onclick="event.stopPropagation()" style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
          <input type="checkbox" ${cliAgent.enabled ? 'checked' : ''} onchange="toggleMoeItemEnabled('${cliAgent.id}', this.checked)">
          <span style="color: #888; font-size: 11px;">Enabled</span>
        </label>
        <button onclick="event.stopPropagation(); deleteMoeItem('${cliAgent.id}')"
                style="padding: 4px 8px; background: transparent; border: 1px solid ${theme.error}; border-radius: 4px; color: ${theme.error}; cursor: pointer; font-size: 11px;">✕</button>
      </div>
      ${isExpanded ? renderCliAgentDetails(cliAgent) : ''}
    </div>
  `;
}

function resolveCliAgentOwnerLabel(ownerAgentId) {
  const ownerId = String(ownerAgentId || '').trim();
  if (!ownerId) return 'owner: unassigned';
  const items = Array.isArray(window.modelOrderingState?.moeItems) ? window.modelOrderingState.moeItems : [];
  const owner = items.find((item) => item?.type === 'agent' && item.id === ownerId);
  return owner ? `owner: ${String(owner.name || owner.id)}` : `owner: ${ownerId}`;
}

function renderCliAgentDetails(cliAgent) {
  const items = Array.isArray(window.modelOrderingState?.moeItems) ? window.modelOrderingState.moeItems : [];
  const agents = items.filter((item) => item?.type === 'agent' && item?.enabled !== false);
  const hooks = (cliAgent && typeof cliAgent.hooks === 'object') ? cliAgent.hooks : {};
  const mode = String(cliAgent.executionMode || 'on-tool');
  const policyProfile = String(cliAgent.policyProfile || 'workspace-write');
  const stepBudget = Number.isInteger(Number(cliAgent.stepBudget)) ? Math.max(1, Math.min(500, Number(cliAgent.stepBudget))) : 50;
  const tokenBudget = Number.isInteger(Number(cliAgent.tokenBudget)) ? Math.max(256, Math.min(200000, Number(cliAgent.tokenBudget))) : 8000;
  const timeoutMs = Number.isInteger(Number(cliAgent.timeoutMs)) ? Math.max(1000, Math.min(3600000, Number(cliAgent.timeoutMs))) : 300000;

  return `
    <div onclick="event.stopPropagation()" style="margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(188,140,255,0.35); display:flex; flex-direction:column; gap:12px;">
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <label style="color:#999; font-size:12px; min-width:90px;">Owner Agent</label>
        <select onchange="updateCliAgentConfig('${cliAgent.id}', 'ownerAgentId', this.value)"
                style="min-width: 240px; padding:6px 8px; background: rgba(255,255,255,0.1); border: 1px solid #555; border-radius: 4px; color: #fff;">
          <option value="">-- Unassigned --</option>
          ${agents.map((agent) => `<option value="${escapeBinding(agent.id)}" ${String(cliAgent.ownerAgentId || '') === agent.id ? 'selected' : ''}>${escapeBinding(agent.name || agent.id)}</option>`).join('')}
        </select>
      </div>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <label style="color:#999; font-size:12px; min-width:90px;">Execution</label>
        <select onchange="updateCliAgentConfig('${cliAgent.id}', 'executionMode', this.value)"
                style="min-width: 180px; padding:6px 8px; background: rgba(255,255,255,0.1); border: 1px solid #555; border-radius: 4px; color: #fff;">
          <option value="on-tool" ${mode === 'on-tool' ? 'selected' : ''}>on-tool</option>
          <option value="on-control" ${mode === 'on-control' ? 'selected' : ''}>on-control</option>
          <option value="auto" ${mode === 'auto' ? 'selected' : ''}>auto</option>
          <option value="manual" ${mode === 'manual' ? 'selected' : ''}>manual</option>
        </select>
        <label style="color:#999; font-size:12px;">Policy</label>
        <select onchange="updateCliAgentConfig('${cliAgent.id}', 'policyProfile', this.value)"
                style="min-width: 220px; padding:6px 8px; background: rgba(255,255,255,0.1); border: 1px solid #555; border-radius: 4px; color: #fff;">
          <option value="read-only" ${policyProfile === 'read-only' ? 'selected' : ''}>read-only</option>
          <option value="workspace-write" ${policyProfile === 'workspace-write' ? 'selected' : ''}>workspace-write</option>
          <option value="privileged-approval" ${policyProfile === 'privileged-approval' ? 'selected' : ''}>privileged-approval</option>
        </select>
      </div>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <label style="color:#999; font-size:12px;">Step Budget</label>
        <input type="number" min="1" max="500" value="${stepBudget}"
               onchange="updateCliAgentConfig('${cliAgent.id}', 'stepBudget', this.value)"
               style="width:95px; padding:6px 8px; background: rgba(255,255,255,0.1); border: 1px solid #555; border-radius: 4px; color: #fff;">
        <label style="color:#999; font-size:12px;">Token Budget</label>
        <input type="number" min="256" max="200000" value="${tokenBudget}"
               onchange="updateCliAgentConfig('${cliAgent.id}', 'tokenBudget', this.value)"
               style="width:120px; padding:6px 8px; background: rgba(255,255,255,0.1); border: 1px solid #555; border-radius: 4px; color: #fff;">
        <label style="color:#999; font-size:12px;">Timeout (ms)</label>
        <input type="number" min="1000" max="3600000" value="${timeoutMs}"
               onchange="updateCliAgentConfig('${cliAgent.id}', 'timeoutMs', this.value)"
               style="width:130px; padding:6px 8px; background: rgba(255,255,255,0.1); border: 1px solid #555; border-radius: 4px; color: #fff;">
      </div>
      <div>
        <label style="color:#999; font-size:12px; display:block; margin-bottom:6px;">Tool Hooks</label>
        <div style="display:flex; gap:12px; flex-wrap:wrap;">
          <label style="display:flex; align-items:center; gap:6px; color:#ddd; font-size:11px;"><input type="checkbox" ${hooks.runCommand === true ? 'checked' : ''} onchange="updateCliAgentConfig('${cliAgent.id}', 'hooks.runCommand', this.checked)">runCommand</label>
          <label style="display:flex; align-items:center; gap:6px; color:#ddd; font-size:11px;"><input type="checkbox" ${hooks.writeFile === true ? 'checked' : ''} onchange="updateCliAgentConfig('${cliAgent.id}', 'hooks.writeFile', this.checked)">writeFile</label>
          <label style="display:flex; align-items:center; gap:6px; color:#ddd; font-size:11px;"><input type="checkbox" ${hooks.runTests === true ? 'checked' : ''} onchange="updateCliAgentConfig('${cliAgent.id}', 'hooks.runTests', this.checked)">runTests</label>
          <label style="display:flex; align-items:center; gap:6px; color:#ddd; font-size:11px;"><input type="checkbox" ${hooks.gitDiff === true ? 'checked' : ''} onchange="updateCliAgentConfig('${cliAgent.id}', 'hooks.gitDiff', this.checked)">gitDiff</label>
          <label style="display:flex; align-items:center; gap:6px; color:#ddd; font-size:11px;"><input type="checkbox" ${hooks.flashFirmware === true ? 'checked' : ''} onchange="updateCliAgentConfig('${cliAgent.id}', 'hooks.flashFirmware', this.checked)">flashFirmware</label>
        </div>
      </div>
      <div style="background:rgba(255,255,255,0.04); border:1px solid rgba(188,140,255,0.25); border-radius:6px; padding:9px 10px; color:#b9b9d1; font-size:11px; line-height:1.45;">
        CLI Agent is stateless execution capability. Assign an owner agent and execution mode; runtime integration comes next.
      </div>
    </div>
  `;
}

window.renderCliAgentRow = renderCliAgentRow;
window.renderCliAgentDetails = renderCliAgentDetails;
