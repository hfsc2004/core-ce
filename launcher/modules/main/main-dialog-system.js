/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
'use strict';

const { BrowserWindow } = require('electron');

function registerDialogSystemHandlers(ipcMain, deps = {}) {
  const dialog = deps.dialog;
  const securityLayer = deps.securityLayer;
  const getMainWindow = typeof deps.getMainWindow === 'function' ? deps.getMainWindow : () => null;
  const getGpuInfo = typeof deps.getGpuInfo === 'function' ? deps.getGpuInfo : () => ({});

  ipcMain.handle('show-confirm-dialog', async (event, options) => {
    const result = await dialog.showMessageBox(getMainWindow(), {
      type: options.type || 'question',
      buttons: options.buttons || ['Cancel', 'OK'],
      defaultId: options.defaultId || 1,
      cancelId: options.cancelId || 0,
      title: options.title || 'Confirm',
      message: options.message || 'Are you sure?',
      detail: options.detail || ''
    });
    return result.response === 1;
  });

  ipcMain.handle('get-gpu-info', async () => getGpuInfo());

  ipcMain.handle('get-security-status', async () => {
    try {
      await securityLayer.initialize();
      const edition = securityLayer.getEdition();
      const securityModel = (typeof securityLayer.getSecurityModel === 'function')
        ? securityLayer.getSecurityModel()
        : securityLayer.getSecurityMode();
      const securityMode = securityLayer.getSecurityMode();
      const clusterJoinAllowed = String(edition || '').toLowerCase() !== 'standard';
      return { success: true, edition, securityModel, securityMode, clusterJoinAllowed };
    } catch (err) {
      return {
        success: false,
        error: err.message || String(err),
        edition: 'unknown',
        securityModel: 'unknown',
        securityMode: 'unknown',
        clusterJoinAllowed: false
      };
    }
  });

  ipcMain.handle('select-import-file', async (event, options = {}) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender) || getMainWindow();
    if (parentWindow && !parentWindow.isDestroyed()) {
      if (parentWindow.isMinimized()) parentWindow.restore();
      parentWindow.focus();
    }
    const mode = String(options?.mode || '').trim().toLowerCase();
    const isGenericFilePick = mode === 'file' || mode === 'any' || mode === 'attachment';
    const title = isGenericFilePick
      ? (options?.title || 'Select File')
      : 'Select Catalog/Models File to Import';
    const filters = isGenericFilePick
      ? [{ name: 'All Files', extensions: ['*'] }]
      : [{ name: 'JSON Files', extensions: ['json'] }, { name: 'All Files', extensions: ['*'] }];
    const result = await dialog.showOpenDialog(parentWindow, {
      title,
      modal: true,
      filters,
      properties: ['openFile']
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }
    return { success: true, filePath: result.filePaths[0] };
  });
}

module.exports = {
  registerDialogSystemHandlers
};
