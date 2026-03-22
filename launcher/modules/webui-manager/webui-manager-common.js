/**
 * Pseudo Science Fiction Core Collection - WebUI Manager Common
 * SHARED FUNCTIONS - Platform-independent WebUI operations
 * 
 * Contains functions that work identically across all platforms.
 * Currently only contains Electron BrowserWindow creation.
 * 
 * @module webui-manager-common
 * @version 1.1.2 - March 5, 2026 (Platform Isolation Refactor)
 * @license SEE LICENSE.txt
 */

const { BrowserWindow, screen } = require('electron');
const { getSafeWindowBounds } = require('../window-bounds');

/**
 * Create WebUI browser window
 * @param {string} title - Window title
 * @param {string} url - URL to load
 * @returns {Promise<BrowserWindow>} Browser window instance
 */
async function createWebuiWindow(title, url, options = {}) {
  const bounds = getSafeWindowBounds({
    screenRef: screen,
    referenceWindow: options.referenceWindow || null,
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 620
  });
  const win = new BrowserWindow({
    ...bounds,
    title: title,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  
  await win.loadURL(url);
  return win;
}

module.exports = {
  createWebuiWindow
};
