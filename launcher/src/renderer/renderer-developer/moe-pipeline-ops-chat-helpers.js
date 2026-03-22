/**
 * MoE pipeline chat helpers.
 */
(function() {
  'use strict';

  async function getIrgInputGatewayState() {
    const fallback = { exists: false, enabled: false, mode: 'live', liveEnabled: false, autoExecuteLive: true };
    try {
      const status = await window.electronAPI.getMoEStatus();
      const gateways = Object.values(status?.gateways || {});
      for (const gateway of gateways) {
        if (String(gateway?.position || '').toLowerCase() !== 'input') continue;
        const irgEnabled = gateway?.irg?.enabled !== false;
        const executeMode = String(gateway?.irg?.executeMode || 'live').toLowerCase();
        return {
          exists: true,
          enabled: irgEnabled,
          mode: executeMode,
          liveEnabled: irgEnabled && executeMode === 'live',
          autoExecuteLive: gateway?.irg?.autoExecuteLive === true
        };
      }
    } catch (err) {
      console.warn('[MoE] Live IRG check failed:', err?.message || err);
    }
    return fallback;
  }

  async function openMoeChatWindow() {
    const { moeItems } = window.modelOrderingState;

    const agents = moeItems
      .filter(item => item.type === 'agent')
      .map(agent => ({
        id: agent.id,
        name: agent.name,
        role: agent.role || agent.name,
        modelId: agent.modelId,
        modelName: agent.modelName
      }));

    const pipelineConfig = {
      name: 'PSF Relay Pipeline',
      agents
    };

    try {
      const result = await window.electronAPI.openMoeChatWindow(pipelineConfig);

      if (result.success) {
        console.log('[MoE] Chat window opened:', result);
      } else {
        console.error('[MoE] Failed to open chat window:', result.message);
        if (typeof window.appendMoeDeployStatusLine === 'function') {
          window.appendMoeDeployStatusLine(`Failed to open chat window: ${result.message}`, 'error');
        }
      }
    } catch (err) {
      console.error('[MoE] Error opening chat window:', err);
      if (typeof window.appendMoeDeployStatusLine === 'function') {
        window.appendMoeDeployStatusLine(`Error opening chat window: ${err.message}`, 'error');
      }
    }
  }

  window.MoePipelineOpsChatHelpers = {
    getIrgInputGatewayState,
    openMoeChatWindow
  };
})();
