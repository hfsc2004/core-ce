/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */

function notifyMoeComingSoon(featureLabel) {
  const label = String(featureLabel || 'Feature');
  if (typeof window.appendMoeDeployStatusLine === 'function') {
    window.appendMoeDeployStatusLine(`${label} is coming soon.`, 'info');
    return;
  }
  console.info(`[MoE] ${label} is coming soon.`);
}

function escapeBinding(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function serializeRoutingRules(rules) {
  const list = Array.isArray(rules) ? rules : [];
  return list
    .map((rule) => {
      const match = String(rule?.match || '').trim();
      const target = String(rule?.target || '').trim();
      if (!match || !target) return '';
      return `${match} => ${target}`;
    })
    .filter(Boolean)
    .join('\n');
}

function buildSerialPortOptions(serialPorts, selectedPort) {
  const escapeText = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const safeSelected = String(selectedPort || 'auto').trim() || 'auto';
  const options = [
    `<option value=\"auto\" ${safeSelected.toLowerCase() === 'auto' ? 'selected' : ''}>Auto Detect (recommended)</option>`
  ];
  const seen = new Set(['auto']);
  for (const port of serialPorts) {
    const devicePath = String(port?.path || '').trim();
    if (!devicePath || seen.has(devicePath)) continue;
    seen.add(devicePath);
    const label = String(port?.label || devicePath).trim() || devicePath;
    const kind = String(port?.kind || 'serial').toUpperCase();
    const boardHint = String(port?.boardHint || '').trim();
    const suffix = boardHint ? `${kind}, ${boardHint}` : kind;
    options.push(`<option value=\"${escapeText(devicePath)}\" ${safeSelected === devicePath ? 'selected' : ''}>${escapeText(`${label} (${suffix})`)}</option>`);
  }
  if (!seen.has(safeSelected) && safeSelected.toLowerCase() !== 'auto') {
    options.push(`<option value=\"${escapeText(safeSelected)}\" selected>${escapeText(`${safeSelected} (manual)`)}</option>`);
  }
  return options.join('');
}

window.notifyMoeComingSoon = notifyMoeComingSoon;
window.escapeBinding = escapeBinding;
window.serializeRoutingRules = serializeRoutingRules;
window.buildSerialPortOptions = buildSerialPortOptions;
