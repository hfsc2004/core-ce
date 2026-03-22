/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */

window.createMoeChatPipelineOps = function createMoeChatPipelineOps(ctx = {}) {
  const getElements = () => (typeof ctx.getElements === 'function' ? ctx.getElements() : {});
  const getAgents = () => (typeof ctx.getAgents === 'function' ? (ctx.getAgents() || []) : []);
  const setAgents = (value) => {
    if (typeof ctx.setAgents === 'function') ctx.setAgents(Array.isArray(value) ? value : []);
  };

  function setStatus(state, text) {
    const elements = getElements();
    if (!elements?.statusBadge) return;
    elements.statusBadge.textContent = text;
    elements.statusBadge.className = 'status-badge ' + state;
  }

  function populateKvmDropdown() {
    const elements = getElements();
    if (!elements?.kvmSelect) return;
    elements.kvmSelect.innerHTML = '<option value="pipeline">Full Pipeline (Chain All)</option>';
    getAgents().forEach((agent) => {
      const option = document.createElement('option');
      option.value = agent.id;
      option.textContent = `${agent.name}${agent.modelName ? ` (${agent.modelName})` : ''}`;
      elements.kvmSelect.appendChild(option);
    });
  }

  function updatePipelineFlow() {
    const elements = getElements();
    if (!elements?.pipelineFlow) return;
    const agents = getAgents();
    if (agents.length === 0) {
      elements.pipelineFlow.innerHTML = '<span style="color:#666;">No agents</span>';
      return;
    }
    const flowHtml = agents
      .map((a) => `<span class="agent-node">${a.name}</span>`)
      .join('<span class="arrow">→</span>');
    elements.pipelineFlow.innerHTML = flowHtml;
  }

  function updateKvmSelection() {
    const elements = getElements();
    if (!elements?.kvmSelect || !elements?.kvmIndicator || !elements?.input) return;
    const nextTarget = elements.kvmSelect.value;
    if (typeof ctx.setKvmTarget === 'function') ctx.setKvmTarget(nextTarget);

    if (nextTarget === 'pipeline') {
      elements.kvmIndicator.textContent = '● Pipeline';
      elements.kvmIndicator.className = 'kvm-indicator';
      elements.input.placeholder = 'Type a message to send through the full pipeline...';
    } else {
      const agent = getAgents().find((a) => a.id === nextTarget);
      elements.kvmIndicator.textContent = `● Direct: ${agent?.name || 'Agent'}`;
      elements.kvmIndicator.className = 'kvm-indicator direct';
      elements.input.placeholder = `Type a message directly to ${agent?.name || 'agent'}...`;
    }
  }

  async function checkPipelineStatus() {
    const elements = getElements();
    console.log('[MoE Chat] Checking pipeline status...');

    if (!window.electronAPI?.getMoEStatus) {
      setStatus('error', 'API not available');
      ctx.addSystemMessage?.('Error: electronAPI not available');
      return;
    }

    try {
      const status = await window.electronAPI.getMoEStatus();
      console.log('[MoE Chat] Status:', status);

      if (status && status.agentCount > 0) {
        const list = Object.entries(status.agents || {}).map(([id, agent]) => ({
          id,
          name: agent.name,
          modelName: agent.modelName || agent.modelId
        }));
        setAgents(list);

        populateKvmDropdown();
        updatePipelineFlow();

        setStatus('connected', `Ready • ${list.length} agents`);
        if (elements?.input) elements.input.disabled = false;
        if (elements?.sendBtn) elements.sendBtn.disabled = false;
        if (elements?.attachBtn) elements.attachBtn.disabled = false;
        if (elements?.voiceBtn) elements.voiceBtn.disabled = false;
        if (elements?.voiceModeBtn) elements.voiceModeBtn.disabled = false;
        if (elements?.input) elements.input.placeholder = 'Type a message to send through the full pipeline...';

        if (elements?.messages) elements.messages.innerHTML = '';
        ctx.addSystemMessage?.('Pipeline connected. Your message will flow through each agent in sequence.');

        elements?.input?.focus?.();
        ctx.startEsp32TelemetryPolling?.();
      } else {
        setStatus('disconnected', 'Not deployed');
        if (elements?.attachBtn) elements.attachBtn.disabled = true;
        if (elements?.voiceBtn) elements.voiceBtn.disabled = true;
        if (elements?.voiceModeBtn) elements.voiceModeBtn.disabled = true;
        ctx.addSystemMessage?.('Pipeline is not deployed. Please deploy from the MoE screen first.');
        ctx.stopEsp32TelemetryPolling?.();
      }
    } catch (err) {
      console.error('[MoE Chat] Status check failed:', err);
      setStatus('error', 'Connection error');
      ctx.addSystemMessage?.('Error: ' + err.message);
      ctx.stopEsp32TelemetryPolling?.();
    }
  }

  return {
    checkPipelineStatus,
    populateKvmDropdown,
    updatePipelineFlow,
    updateKvmSelection,
    setStatus
  };
};
