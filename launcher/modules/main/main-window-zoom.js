/**
 * Shared Electron zoom controls.
 */

const MIN_ZOOM_LEVEL = -4;
const MAX_ZOOM_LEVEL = 5;
const ZOOM_STEP = 0.5;

function clampZoomLevel(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(MIN_ZOOM_LEVEL, Math.min(MAX_ZOOM_LEVEL, num));
}

function getZoomPercent(level) {
  return Math.round(Math.pow(1.2, clampZoomLevel(level)) * 100);
}

function applyZoomDelta(webContents, delta = 0) {
  if (!webContents || webContents.isDestroyed?.()) {
    return { success: false, error: 'webContents unavailable' };
  }
  const current = typeof webContents.getZoomLevel === 'function' ? webContents.getZoomLevel() : 0;
  const next = clampZoomLevel(current + (Number(delta) || 0));
  webContents.setZoomLevel(next);
  return { success: true, zoomLevel: next, zoomPercent: getZoomPercent(next) };
}

function resetZoom(webContents) {
  if (!webContents || webContents.isDestroyed?.()) {
    return { success: false, error: 'webContents unavailable' };
  }
  webContents.setZoomLevel(0);
  return { success: true, zoomLevel: 0, zoomPercent: 100 };
}

function attachZoomHandlers(target) {
  const webContents = target?.webContents || target;
  if (!webContents || webContents.isDestroyed?.()) return false;
  if (webContents.__psfZoomHandlersAttached) return true;
  webContents.__psfZoomHandlersAttached = true;

  webContents.on('before-input-event', (event, input) => {
    const control = input.control || input.meta;
    if (!control || input.type !== 'keyDown') return;
    const key = String(input.key || '').toLowerCase();
    if (key === '+' || key === '=' || key === 'numadd') {
      event.preventDefault();
      applyZoomDelta(webContents, ZOOM_STEP);
    } else if (key === '-' || key === 'numsub') {
      event.preventDefault();
      applyZoomDelta(webContents, -ZOOM_STEP);
    } else if (key === '0' || key === 'num0') {
      event.preventDefault();
      resetZoom(webContents);
    }
  });

  return true;
}

function registerZoomIpc(ipcMain) {
  if (!ipcMain || ipcMain.__psfZoomIpcRegistered) return;
  ipcMain.__psfZoomIpcRegistered = true;
  ipcMain.handle('app-zoom:delta', (event, delta = 0) => (
    applyZoomDelta(event.sender, Number(delta) > 0 ? ZOOM_STEP : -ZOOM_STEP)
  ));
  ipcMain.handle('app-zoom:reset', (event) => resetZoom(event.sender));
  ipcMain.handle('app-zoom:get', (event) => {
    const level = event.sender?.getZoomLevel?.() || 0;
    return { success: true, zoomLevel: clampZoomLevel(level), zoomPercent: getZoomPercent(level) };
  });
}

module.exports = {
  attachZoomHandlers,
  registerZoomIpc,
  applyZoomDelta,
  resetZoom,
  clampZoomLevel,
  getZoomPercent,
  ZOOM_STEP
};
