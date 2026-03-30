/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
'use strict';

const path = require('path');
const { BrowserWindow, screen } = require('electron');
const { getSafeWindowBounds } = require('../window-bounds');

function registerEditorWindowHandlers(ipcMain, deps = {}) {
  const getMainWindow = typeof deps.getMainWindow === 'function' ? deps.getMainWindow : () => null;
  const getModelEditorWindow = typeof deps.getModelEditorWindow === 'function' ? deps.getModelEditorWindow : () => null;
  const setModelEditorWindow = typeof deps.setModelEditorWindow === 'function' ? deps.setModelEditorWindow : (() => {});
  const getSettingsWindow = typeof deps.getSettingsWindow === 'function' ? deps.getSettingsWindow : () => null;
  const setSettingsWindow = typeof deps.setSettingsWindow === 'function' ? deps.setSettingsWindow : (() => {});
  const appDir = String(deps.appDir || '');

  ipcMain.handle('open-settings-window', async () => {
    try {
      const current = getSettingsWindow();
      if (current && !current.isDestroyed()) {
        current.focus();
        return { success: true, reused: true };
      }

      const settingsBounds = getSafeWindowBounds({
        screenRef: screen,
        referenceWindow: getMainWindow() || null,
        width: 980,
        height: 820,
        minWidth: 820,
        minHeight: 640,
        includePosition: false
      });
      const settingsWindow = new BrowserWindow({
        ...settingsBounds,
        resizable: true,
        maximizable: true,
        minimizable: true,
        parent: getMainWindow() || undefined,
        webPreferences: {
          preload: path.join(appDir, 'preload.js'),
          contextIsolation: true,
          nodeIntegration: false
        }
      });
      settingsWindow.loadFile(path.join(appDir, 'src', 'settings-window.html'));
      settingsWindow.on('closed', () => setSettingsWindow(null));
      setSettingsWindow(settingsWindow);
      return { success: true, reused: false };
    } catch (err) {
      console.error('[Settings Window] Error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('open-model-editor', async (event, mode, modelData, collections) => {
    try {
      const current = getModelEditorWindow();
      if (current && !current.isDestroyed()) {
        current.focus();
        return { success: false, error: 'Editor window already open' };
      }

      const editorBounds = getSafeWindowBounds({
        screenRef: screen,
        referenceWindow: getMainWindow() || null,
        width: 950,
        height: 800,
        minWidth: 820,
        minHeight: 620,
        includePosition: false
      });
      const modelEditorWindow = new BrowserWindow({
        ...editorBounds,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: true,
        minimizable: true,
        maximizable: false,
        parent: getMainWindow(),
        webPreferences: {
          preload: path.join(appDir, 'preload.js'),
          contextIsolation: true,
          nodeIntegration: false
        }
      });
      modelEditorWindow.loadFile(path.join(appDir, 'src', 'model-editor.html'));
      modelEditorWindow.webContents.on('did-finish-load', () => {
        modelEditorWindow.webContents.send('model-editor-data', { mode, modelData, collections });
      });
      modelEditorWindow.on('closed', () => setModelEditorWindow(null));
      setModelEditorWindow(modelEditorWindow);
      return { success: true };
    } catch (err) {
      console.error('[Model Editor] Error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('close-model-editor', async () => {
    const current = getModelEditorWindow();
    if (current && !current.isDestroyed()) current.close();
    return { success: true };
  });

  ipcMain.handle('minimize-model-editor', async () => {
    const current = getModelEditorWindow();
    if (current && !current.isDestroyed()) current.minimize();
    return { success: true };
  });

  ipcMain.handle('refresh-package-manager', async () => {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('refresh-package-manager');
    }
    return { success: true };
  });
}

module.exports = {
  registerEditorWindowHandlers
};
