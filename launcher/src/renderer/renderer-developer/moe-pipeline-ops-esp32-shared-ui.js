/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */

function esp32Render() {
  if (typeof window.renderModelOrdering === 'function') {
    window.renderModelOrdering();
  }
}

function esp32LogStatus(message, level = 'info') {
  if (typeof window.appendMoeDeployStatusLine === 'function') {
    window.appendMoeDeployStatusLine(String(message || ''), String(level || 'info'));
  }
}

window.esp32Render = esp32Render;
window.esp32LogStatus = esp32LogStatus;

if (!window.__psfMoeIrgProgressBound && window.electronAPI?.onMoEIrgProgress) {
  window.__psfMoeIrgProgressBound = true;
  window.electronAPI.onMoEIrgProgress((payload = {}) => {
    const level = String(payload?.level || '').trim().toLowerCase();
    const stage = String(payload?.stage || '').trim().toLowerCase();
    const stream = String(payload?.stream || '').trim().toLowerCase();
    const text = String(
      payload?.line
      || payload?.chunk
      || payload?.message
      || ''
    );
    if (!text) return;
    const prefix = stage ? `[IRG:${stage}] ` : '[IRG] ';
    const mappedLevel = level === 'error' || stream === 'stderr'
      ? 'error'
      : (level === 'warn' ? 'warn' : 'info');
    const lines = text.replace(/\r/g, '').split('\n');
    for (const raw of lines) {
      const line = String(raw || '').trimEnd();
      if (!line) continue;
      esp32LogStatus(`${prefix}${line}`, mappedLevel);
    }
  });
}
