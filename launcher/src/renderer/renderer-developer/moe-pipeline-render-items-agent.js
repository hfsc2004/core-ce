/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */

function renderAgentRow(agent, index, modelsForDropdown) {
  const { editMode, expandedMoeItem, expandedMoeItems, showAllModels } = window.modelOrderingState;
  const expanded = Array.isArray(expandedMoeItems) ? expandedMoeItems : [];
  const isExpanded = expanded.includes(agent.id) || expandedMoeItem === agent.id;
  const expandIcon = isExpanded ? '▼' : '▶';
  const theme = getMoeTheme();
  const provider = String(agent.provider || '').trim().toLowerCase() === 'llama.cpp' ? 'llama.cpp' : 'ollama';
  const canvasStyle = typeof window.getMoeItemCanvasStyle === 'function'
    ? window.getMoeItemCanvasStyle(agent, index)
    : '';
  const filteredModels = (Array.isArray(modelsForDropdown) ? modelsForDropdown : []).filter((m) => {
    const runtimes = Array.isArray(m?.runtimes) ? m.runtimes.map((value) => String(value || '').trim().toLowerCase()) : [];
    const hasOllamaRuntime = runtimes.includes('ollama') || String(m?.ollamaModel || '').trim().length > 0;
    const hasLlamaRuntime = runtimes.includes('llama.cpp') || /\.gguf$/i.test(String(m?.filename || '').trim());
    return provider === 'llama.cpp' ? hasLlamaRuntime : hasOllamaRuntime;
  });
  const selectedMissing = !!agent.modelId && !filteredModels.some((m) => m.id === agent.modelId);
  const counts = (window.modelOrderingState?.moeAttachmentCounts?.byAgentId || {})[agent.id] || {};
  const agentCount = Number(counts.agentCount || 0);
  const sharedCount = Number(counts.sharedCount || 0);

  return `
    <div class="moe-item moe-agent ${isExpanded ? 'expanded' : ''}"
         data-moe-id="${agent.id}" data-moe-type="agent" data-index="${index}"
         ${editMode ? `draggable="true" ondragstart="handleMoeDragStart(event, '${agent.id}')" ondragend="handleMoeDragEnd(event)"` : ''}
         onmousedown="beginMoeCanvasDrag(event, '${agent.id}')"
         onclick="handleMoeItemClick(event, '${agent.id}')"
         style="background: ${theme.accentLight}; border: 2px solid ${theme.accent}; border-radius: 8px; padding: 12px 15px;
                cursor: ${editMode ? 'grab' : 'pointer'}; transition: all 0.15s ease; ${!agent.enabled ? 'opacity: 0.5;' : ''} ${canvasStyle}">
      <div style="display: flex; align-items: center; gap: 12px;">
        <span onclick="event.stopPropagation(); toggleMoeExpand('${agent.id}')"
              style="color: ${theme.accent}; cursor: pointer; user-select: none; font-size: 10px; width: 15px;">${expandIcon}</span>
        ${editMode ? `<span class="drag-handle" style="color: ${theme.accent}; cursor: grab;">⋮⋮</span>` : ''}
        <span style="color: ${theme.accent}; font-weight: bold; min-width: 30px; text-align: center;">${index + 1}</span>
        <span style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:6px;background:rgba(56,189,248,0.15);">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#38bdf8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="6" r="3"/><path d="M2,15 Q2,11 8,11 Q14,11 14,15"/></svg>
        </span>
        <span onclick="event.stopPropagation(); promptRenameMoeItem('${agent.id}')" onmousedown="event.stopPropagation();"
              style="color:#fff; font-weight:bold; font-size:12px; min-width:120px; padding:4px; border-bottom:1px solid transparent; cursor:text;"
              onmouseover="this.style.borderBottomColor='${theme.accent}'" onmouseout="this.style.borderBottomColor='transparent'">${escapeBinding(agent.name)}</span>
        <div style="flex: 1; display: flex; align-items: center; justify-content: flex-start; gap: 8px;">
          <span style="color: #888;">→</span>
          <select onchange="updateAgentProvider('${agent.id}', this.value)" onclick="event.stopPropagation()"
                  title="Inference provider for this agent"
                  style="padding: 6px 8px; background: rgba(255,255,255,0.1); border: 1px solid #333; border-radius: 4px; color: #fff; min-width: 110px; max-width: 110px; font-size: 11px;">
            <option value="ollama" ${provider === 'ollama' ? 'selected' : ''}>Ollama</option>
            <option value="llama.cpp" ${provider === 'llama.cpp' ? 'selected' : ''}>llama.cpp</option>
          </select>
          <select onchange="assignModelToAgent('${agent.id}', this.value)" onclick="event.stopPropagation()"
                  style="padding: 6px 10px; background: rgba(255,255,255,0.1); border: 1px solid #333; border-radius: 4px; color: #fff; width: 240px; min-width: 240px; max-width: 240px;">
            <option value="" ${!agent.modelId ? 'selected' : ''}>-- Select Model --</option>
            ${selectedMissing ? `<option value="${escapeBinding(agent.modelId)}" selected>(current selection unavailable for ${provider})</option>` : ''}
            ${filteredModels.map((m) => {
              const unavailable = showAllModels
                ? (provider === 'llama.cpp' ? !m.isDownloaded : !m.isReady)
                : (provider === 'llama.cpp' ? !m.isDownloaded : !m.isReady);
              const suffix = unavailable
                ? (provider === 'llama.cpp' ? ' (not downloaded)' : (!m.isDownloaded ? ' (not downloaded)' : ' (not wrapped)'))
                : '';
              const disabled = unavailable ? 'disabled' : '';
              const style = unavailable ? 'color: #666;' : '';
              const runtimeHint = provider === 'llama.cpp'
                ? `GGUF: ${String(m.filename || '').trim() || 'unknown'}`
                : `Ollama: ${String(m.ollamaModel || '').trim() || 'unknown-tag'}`;
              const label = `${m.name} [${runtimeHint}]`;
              return `<option value="${m.id}" ${agent.modelId === m.id ? 'selected' : ''} ${disabled} style="${style}">${label}${suffix}</option>`;
            }).join('')}
          </select>
          <div style="margin-left: auto; display: inline-flex; align-items: center; gap: 8px;">
            <label onclick="event.stopPropagation()" style="display: inline-flex; align-items: center; gap: 5px; cursor: pointer;">
              <input type="checkbox" ${agent.enabled ? 'checked' : ''} onchange="toggleMoeItemEnabled('${agent.id}', this.checked)">
              <span style="color: #888; font-size: 11px;">Enabled</span>
            </label>
            <button onclick="event.stopPropagation(); deleteMoeItem('${agent.id}')"
                    title="Delete agent"
                    style="padding: 4px 8px; background: transparent; border: 1px solid ${theme.error}; border-radius: 4px; color: ${theme.error}; cursor: pointer; font-size: 11px; line-height: 1;">✕</button>
          </div>
        </div>
      </div>
      ${isExpanded ? renderAgentDetails(agent, { agentCount, sharedCount }) : ''}
      ${isExpanded ? `
      <div onclick="event.stopPropagation()" style="margin-top: 10px; padding-top: 9px; border-top: 1px solid ${theme.accent}26; display: flex; align-items: center; justify-content: flex-end; gap: 8px; white-space: nowrap; overflow-x: auto;">
        <button onclick="event.stopPropagation(); openMoeRoutingHelp();"
                style="padding: 4px 8px; border-radius: 10px; border: 1px solid #666; background: rgba(255,255,255,0.06); color:#bbb; font-size: 11px; cursor: pointer;"
                title="What are Dynamic and Static routing modes?">Routing Help</button>
        <span style="color:#777; font-size:11px;">Routing:</span>
        <span onclick="event.stopPropagation(); toggleAgentRoutingMode('${agent.id}')"
              style="background: ${agent.routingMode === 'dynamic' ? 'var(--psf-accent-medium, rgba(0,212,255,0.2))' : 'rgba(255,212,0,0.2)'};
                     color: ${agent.routingMode === 'dynamic' ? 'var(--psf-accent, #00d4ff)' : theme.warning}; padding: 3px 8px; border-radius: 10px; font-size: 11px; cursor: pointer;"
              title="${agent.routingMode === 'dynamic'
                ? 'Dynamic routing: this agent can decide the next hop using context. Use for planning/dispatch.'
                : 'Static routing: deterministic rule-based next hop. Use for control/safety-critical flows.'}">
          ${agent.routingMode === 'dynamic' ? 'Dynamic (LLM-led)' : 'Static (Rule-led)'}
        </span>
        <span style="background: ${agent.rlmAssist === true ? 'rgba(0,255,136,0.16)' : 'rgba(255,255,255,0.08)'};
                     color: ${agent.rlmAssist === true ? '#00ff88' : '#999'};
                     padding: 3px 8px; border-radius: 10px; font-size: 11px;"
              title="${agent.rlmAssist === true
                ? 'RLM Assist enabled for this agent hop.'
                : 'RLM Assist disabled for this agent hop.'}">
          RLM ${agent.rlmAssist === true ? 'ON' : 'OFF'}
        </span>
        <span style="background: rgba(255,255,255,0.08); color:#bbb; padding: 3px 8px; border-radius: 10px; font-size: 11px;"
              title="RLM files available to this agent (agent/shared)">
          ${agentCount}/${sharedCount}
        </span>
      </div>` : ''}
    </div>
  `;
}

function renderAgentDetails(agent, counts = {}) {
  const theme = getMoeTheme();
  const agentCount = Number(counts?.agentCount || 0);
  const sharedCount = Number(counts?.sharedCount || 0);
  const provider = String(agent.provider || '').trim().toLowerCase() === 'llama.cpp' ? 'llama.cpp' : 'ollama';
  const multiGpuSplit = agent.multiGpuSplit !== false;

  return `
    <div onclick="event.stopPropagation()" style="margin-top: 15px; padding-top: 15px; border-top: 1px solid ${theme.accent}33;">
      <div style="margin-bottom: 15px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:5px;">
          <label style="color: #888; font-size: 12px; display: block;">System Prompt (Role Instructions)</label>
          <button onclick="event.stopPropagation(); applyCliAgentPromptPreset('${agent.id}')"
                  style="padding:5px 9px; background:rgba(188,140,255,0.16); border:1px solid #bc8cff; border-radius:6px; color:#dec8ff; cursor:pointer; font-size:11px;">
            + CLI Tool Prompt
          </button>
        </div>
        <textarea onchange="updateAgentSystemPrompt('${agent.id}', this.value)" placeholder="Define this agent's role, personality, and instructions..."
                  style="width: 100%; height: 80px; background: rgba(255,255,255,0.05); border: 1px solid #333; border-radius: 6px; color: #fff; padding: 10px; resize: vertical;">${agent.systemPrompt || ''}</textarea>
      </div>
      <div style="margin-bottom: 15px; background: rgba(255,255,255,0.03); padding: 10px; border-radius: 6px; color: #aaa; font-size: 12px; line-height: 1.45;">
        <strong style="color:#ddd;">Routing Mode:</strong>
        ${agent.routingMode === 'dynamic'
          ? ' Dynamic lets the model choose the next hop from context (best for dispatch/planning agents).'
          : ' Static uses deterministic rule-based routing (recommended for control and safety-critical agents).'}
      </div>
      <div style="margin-bottom: 15px; background: rgba(0,0,0,0.18); padding: 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08);">
        <label style="display:flex; align-items:center; gap:8px; color:#ddd; font-size:12px; cursor:pointer;">
          <input type="checkbox" ${agent.rlmAssist === true ? 'checked' : ''} onchange="toggleAgentRlmAssist('${agent.id}', this.checked)">
          <span><strong>RLM Assist</strong> (deterministic pre-processing on this hop)</span>
        </label>
        <div style="color:#888; font-size:11px; margin-top:6px;">
          When enabled, Relay condenses and structures long upstream context before sending it to this model.
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
          <button onclick="openMoeAttachmentManager('agent', '${agent.id}')"
                  style="padding:6px 10px; background:rgba(0,212,255,0.16); border:1px solid #00d4ff; border-radius:6px; color:#9fe8ff; cursor:pointer; font-size:11px;">
            Manage Agent Files (${agentCount})
          </button>
          <button onclick="openMoeAttachmentManager('shared', '${agent.id}')"
                  style="padding:6px 10px; background:rgba(255,255,255,0.10); border:1px solid #666; border-radius:6px; color:#ddd; cursor:pointer; font-size:11px;">
            Manage Shared Files (${sharedCount})
          </button>
          <button onclick="refreshMoeAttachmentCounts({ force: true, rerender: true })"
                  style="padding:6px 10px; background:rgba(255,255,255,0.08); border:1px solid #555; border-radius:6px; color:#bbb; cursor:pointer; font-size:11px;">
            Refresh Counts
          </button>
        </div>
      </div>
      ${provider === 'llama.cpp' ? `
      <div style="margin-bottom: 15px; background: rgba(0,0,0,0.18); padding: 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08);">
        <label style="display:flex; align-items:center; gap:8px; color:#ddd; font-size:12px; cursor:pointer;">
          <input type="checkbox" ${multiGpuSplit ? 'checked' : ''} onchange="updateAgentMultiGpuSplit('${agent.id}', this.checked)">
          <span><strong>Allow Multi-GPU Split</strong> (llama.cpp)</span>
        </label>
        <div style="color:#888; font-size:11px; margin-top:6px;">
          ON: model can split layers across multiple GPUs. OFF: force single-GPU load (split-mode none).
        </div>
      </div>
      ` : ''}
      ${agent.routingMode === 'static' ? `
        <div style="margin-bottom: 15px;">
          <label style="color: #888; font-size: 12px; display: block; margin-bottom: 5px;">Static Routing Rules (one per line)</label>
          <textarea oninput="updateAgentRoutingRules('${agent.id}', this.value)" onchange="updateAgentRoutingRules('${agent.id}', this.value)"
                    placeholder="contains:security => Security Agent&#10;* => next&#10;contains:done => end"
                    style="width: 100%; height: 88px; background: rgba(255,255,255,0.05); border: 1px solid #333; border-radius: 6px; color: #fff; padding: 10px; resize: vertical;">${serializeRoutingRules(agent.routingRules)}</textarea>
          <div style="color:#777; font-size:11px; margin-top:6px;">
            Format: <code>match => target</code>. Target can be agent name, agent id, <code>next</code>, or <code>end</code>.
            Match can be <code>*</code>, <code>contains:text</code>, or <code>regex:/pattern/i</code>.
          </div>
        </div>
      ` : ''}
      <div>
        <label style="color: #888; font-size: 12px; display: block; margin-bottom: 5px;">Tools & Integrations</label>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          <button onclick="notifyMoeComingSoon('FAISS (RAG) integration')" style="padding: 8px 12px; background: rgba(255,255,255,0.05); border: 1px dashed #555; border-radius: 6px; color: #666; cursor: pointer;">FAISS (RAG)</button>
          <button onclick="notifyMoeComingSoon('Vision integration')" style="padding: 8px 12px; background: rgba(255,255,255,0.05); border: 1px dashed #555; border-radius: 6px; color: #666; cursor: pointer;">Vision</button>
          <button onclick="notifyMoeComingSoon('Web Search integration')" style="padding: 8px 12px; background: rgba(255,255,255,0.05); border: 1px dashed #555; border-radius: 6px; color: #666; cursor: pointer;">Web Search</button>
        </div>
      </div>
    </div>
  `;
}

window.renderAgentRow = renderAgentRow;
window.renderAgentDetails = renderAgentDetails;
