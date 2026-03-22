/**
 * MoE Pipeline Ops Updates - Serial Refresh
 * Extracted from moe-pipeline-ops-updates.js
 */
async function refreshMoeSerialPorts(gatewayId = null, options = {}) {
  const silent = options?.silent === true;
  try {
    if (!window.electronAPI?.listMoESerialPorts) {
      if (!silent && typeof window.appendMoeDeployStatusLine === 'function') {
        window.appendMoeDeployStatusLine('Serial port listing API is unavailable in this build.', 'warn');
      }
      return [];
    }
    const list = await window.electronAPI.listMoESerialPorts();
    const ports = Array.isArray(list) ? list : [];
    window.modelOrderingState.serialDevices = ports;
    window.modelOrderingState.serialDevicesUpdatedAt = new Date().toISOString();

    if (gatewayId) {
      const gateway = window.modelOrderingState.moeItems.find(i => i.id === gatewayId && i.type === 'gateway');
      if (gateway?.sources?.serial?.enabled) {
        const selectedPort = String(gateway.sources.serial.port || 'auto').trim() || 'auto';
        const selectedExists = selectedPort.toLowerCase() === 'auto' || ports.some((p) => p.path === selectedPort);
        if (!selectedExists) {
          gateway.sources.serial.port = 'auto';
        }
      }
    }
    renderModelOrdering();
    if (!silent) {
      if (typeof window.appendMoeDeployStatusLine === 'function') {
        window.appendMoeDeployStatusLine(`Serial scan complete. Found ${ports.length} port(s).`, 'info');
      }
    }
    return ports;
  } catch (err) {
    console.error('[MoE] Serial scan failed:', err);
    if (!silent && typeof window.appendMoeDeployStatusLine === 'function') {
      window.appendMoeDeployStatusLine(`Serial scan failed: ${err.message}`, 'error');
    }
    return [];
  }
}

window.refreshMoeSerialPorts = refreshMoeSerialPorts;
