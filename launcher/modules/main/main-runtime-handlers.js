/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
'use strict';

const { BrowserWindow } = require('electron');

function registerRuntimeHandlers(ipcMain, deps = {}) {
  const sessionManager = deps.sessionManager;
  const codingTerminalBackend = deps.codingTerminalBackend;
  const dialog = deps.dialog;
  const getMainWindow = typeof deps.getMainWindow === 'function' ? deps.getMainWindow : () => null;

  ipcMain.handle('gpu-monitor-start', (event) => {
    return sessionManager.startGpuMonitor((gpuData) => {
      BrowserWindow.getAllWindows().forEach((win) => {
        try {
          if (!win.isDestroyed()) win.webContents.send('gpu-monitor-data', gpuData);
        } catch (err) {
          console.warn('[GPU Monitor] Could not send data to window:', err.message);
        }
      });
    });
  });

  ipcMain.handle('gpu-monitor-stop', () => sessionManager.stopGpuMonitor());

  ipcMain.handle('coding-terminal:open', async (event, options = {}) => {
    try {
      const mergedOptions = { docked: false, ...options };
      const instance = codingTerminalBackend.openTerminal(mergedOptions);
      return { success: !!instance, state: codingTerminalBackend.getState() };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('coding-terminal:close', async () => {
    try {
      codingTerminalBackend.closeTerminal();
      return { success: true, state: codingTerminalBackend.getState() };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('coding-terminal:toggle-dock', async () => {
    try {
      const docked = codingTerminalBackend.toggleDock();
      return { success: true, docked, state: codingTerminalBackend.getState() };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('coding-terminal:get-state', async () => codingTerminalBackend.getState());

  ipcMain.handle('coding-terminal:select-project-folder', async (event) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender) || getMainWindow();
    if (parentWindow && !parentWindow.isDestroyed()) {
      if (parentWindow.isMinimized()) parentWindow.restore();
      parentWindow.focus();
    }
    const result = await dialog.showOpenDialog(parentWindow, {
      title: 'Select Project Folder for Coding Terminal',
      modal: true,
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }
    return { success: true, path: result.filePaths[0] };
  });
}

module.exports = {
  registerRuntimeHandlers
};
