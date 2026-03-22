/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
'use strict';

const path = require('path');
const { BrowserWindow, screen } = require('electron');
const { getSafeWindowBounds } = require('../window-bounds');

function registerMoeChatWindowHandlers(ipcMain, deps = {}) {
  const appDir = String(deps.appDir || '');
  let moeChatWindow = null;

  ipcMain.handle('open-moe-chat-window', async (event, pipelineConfig) => {
    try {
      if (moeChatWindow && !moeChatWindow.isDestroyed()) {
        moeChatWindow.focus();
        return { success: true, message: 'Focused existing window' };
      }

      const openerWindow = BrowserWindow.fromWebContents(event.sender) || null;
      const chatBounds = getSafeWindowBounds({
        screenRef: screen,
        referenceWindow: openerWindow,
        width: 800,
        height: 600,
        minWidth: 500,
        minHeight: 400,
        includePosition: false
      });
      moeChatWindow = new BrowserWindow({
        ...chatBounds,
        webPreferences: {
          preload: path.join(appDir, 'preload.js'),
          contextIsolation: true,
          nodeIntegration: false
        },
        backgroundColor: '#1a1a2e',
        autoHideMenuBar: true,
        title: 'PSF Relay Pipeline Chat'
      });

      const agents = pipelineConfig?.agents || [];
      const pipelineName = pipelineConfig?.name || 'PSF Relay Pipeline';
      const url = `file://${path.join(appDir, 'src', 'moe-chat.html')}?pipeline=${encodeURIComponent(pipelineName)}&agents=${encodeURIComponent(JSON.stringify(agents))}`;
      moeChatWindow.loadURL(url);
      moeChatWindow.on('closed', () => {
        moeChatWindow = null;
      });
      return { success: true, windowId: moeChatWindow.id };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });
}

module.exports = {
  registerMoeChatWindowHandlers
};
