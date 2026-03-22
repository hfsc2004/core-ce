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
