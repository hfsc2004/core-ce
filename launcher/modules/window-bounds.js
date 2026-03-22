/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
/**
 * Window bounds helper
 * Ensures requested BrowserWindow dimensions fit the current display work area.
 */
const { BrowserWindow } = require('electron');

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getWindowDisplayWorkArea(screenRef, refWindow) {
  if (!screenRef || !refWindow || typeof refWindow.getBounds !== 'function') {
    return null;
  }
  try {
    const bounds = refWindow.getBounds();
    const center = {
      x: Math.floor(Number(bounds.x || 0) + (Number(bounds.width || 0) / 2)),
      y: Math.floor(Number(bounds.y || 0) + (Number(bounds.height || 0) / 2))
    };
    const display = screenRef.getDisplayNearestPoint(center);
    if (display && display.workArea) return display.workArea;
  } catch (_) {}
  return null;
}

function getDisplayWorkArea(screenRef, referenceWindow) {
  try {
    const refArea = getWindowDisplayWorkArea(screenRef, referenceWindow);
    if (refArea) return refArea;
  } catch (_) {}
  try {
    const focused = BrowserWindow.getFocusedWindow();
    const focusedArea = getWindowDisplayWorkArea(screenRef, focused);
    if (focusedArea) return focusedArea;
  } catch (_) {}
  try {
    const primary = screenRef.getPrimaryDisplay();
    if (primary && primary.workArea) return primary.workArea;
  } catch (_) {}
  return { x: 0, y: 0, width: 1280, height: 800 };
}

function getSafeWindowBounds({
  screenRef,
  width = 1000,
  height = 700,
  widthPct = null,
  heightPct = null,
  minWidth = 640,
  minHeight = 520,
  marginX = 24,
  marginY = 32,
  includePosition = true,
  referenceWindow = null
} = {}) {
  const workArea = getDisplayWorkArea(screenRef, referenceWindow);
  const safeWidth = Math.max(420, Number(workArea.width || 1280) - Number(marginX || 0));
  const safeHeight = Math.max(360, Number(workArea.height || 800) - Number(marginY || 0));

  const requestedWidth = (typeof widthPct === 'number' && widthPct > 0 && widthPct <= 1)
    ? Math.floor(Number(workArea.width || 1280) * widthPct)
    : (Number(width) || 1000);
  const requestedHeight = (typeof heightPct === 'number' && heightPct > 0 && heightPct <= 1)
    ? Math.floor(Number(workArea.height || 800) * heightPct)
    : (Number(height) || 700);

  const finalWidth = clamp(requestedWidth, 420, safeWidth);
  const finalHeight = clamp(requestedHeight, 360, safeHeight);

  const finalMinWidth = clamp(Number(minWidth) || 640, 420, finalWidth);
  const finalMinHeight = clamp(Number(minHeight) || 520, 360, finalHeight);

  const bounds = {
    width: finalWidth,
    height: finalHeight,
    minWidth: finalMinWidth,
    minHeight: finalMinHeight
  };

  if (includePosition) {
    const x = Number(workArea.x || 0) + Math.max(0, Math.floor((safeWidth - finalWidth) / 2));
    const y = Number(workArea.y || 0) + Math.max(0, Math.floor((safeHeight - finalHeight) / 2));
    bounds.x = x;
    bounds.y = y;
  }

  return bounds;
}

module.exports = {
  getSafeWindowBounds
};
