/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
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

function getMoeItemCanvasStyle(item, index) {
  const graphMode = window.modelOrderingState?.moeGraphMode === true;
  if (!graphMode) return '';
  if (!item || typeof item !== 'object') return '';
  const existing = item.canvasPos && typeof item.canvasPos === 'object' ? item.canvasPos : null;
  let x = Number(existing?.x);
  let y = Number(existing?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    const col = Number(index) % 4;
    const row = Math.floor(Number(index) / 4);
    x = 8 + (col * 420);
    y = 8 + (row * 220);
    item.canvasPos = { x, y };
  }
  x = Math.max(0, Math.round(x));
  y = Math.max(0, Math.round(y));
  item.canvasPos = { x, y };
  return `position:absolute; left:${x}px; top:${y}px; width:260px; max-width:260px;`;
}

window.notifyMoeComingSoon = notifyMoeComingSoon;
window.escapeBinding = escapeBinding;
window.serializeRoutingRules = serializeRoutingRules;
window.buildSerialPortOptions = buildSerialPortOptions;
window.getMoeItemCanvasStyle = getMoeItemCanvasStyle;
