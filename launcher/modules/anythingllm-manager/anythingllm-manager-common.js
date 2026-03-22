/**
 * AnythingLLM Manager Common - Platform-independent functions
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { BrowserWindow, screen } = require('electron');
const { getSafeWindowBounds } = require('../window-bounds');

/**
 * Check if AnythingLLM is installed
 * @param {string} __dirname - Application directory
 * @returns {Promise<Object>} Status object
 */
async function checkAnythingLLM(__dirname) {
  try {
    const installPath = path.join(__dirname, '..', 'binaries', 'anythingllm');
    const packageJsonPath = path.join(installPath, 'package.json');
    const serverPath = path.join(installPath, 'server');
    const frontendPath = path.join(installPath, 'frontend');
    
    if (fs.existsSync(packageJsonPath) && 
        fs.existsSync(serverPath) && 
        fs.existsSync(frontendPath)) {
      
      const serverNodeModules = path.join(installPath, 'server', 'node_modules');
      const frontendNodeModules = path.join(installPath, 'frontend', 'node_modules');
      const collectorNodeModules = path.join(installPath, 'collector', 'node_modules');
      
      if (fs.existsSync(serverNodeModules) && 
          fs.existsSync(frontendNodeModules) && 
          fs.existsSync(collectorNodeModules)) {
        return {
          success: true,
          installed: true,
          message: `✅ AnythingLLM is installed\nPath: ${installPath}`,
          path: installPath,
          needsBuild: false
        };
      } else {
        return {
          success: false,
          installed: false,
          message: `⚠️ AnythingLLM cloned but dependencies not installed\nPath: ${installPath}\nClick "Install" to complete setup.`,
          path: installPath,
          needsBuild: true
        };
      }
    } else {
      return {
        success: false,
        installed: false,
        message: `❌ AnythingLLM not found.\nClick "Install" to clone and build from GitHub.`,
        needsBuild: true
      };
    }
  } catch (err) {
    return { 
      success: false, 
      installed: false,
      message: err.message, 
      needsBuild: true 
    };
  }
}

/**
 * Check if AnythingLLM server is responding
 * @param {number} port - Port to check
 * @returns {Promise<boolean>} True if ready
 */
function checkIfServerReady(port) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: port,
      path: '/',
      method: 'GET',
      timeout: 1000
    };
    
    const req = http.request(options, (res) => {
      resolve(res.statusCode < 500);
    });
    
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    
    req.end();
  });
}

/**
 * Create AnythingLLM BrowserWindow
 * @param {string} url - URL to load
 * @returns {BrowserWindow} Created window
 */
function createAnythingLLMWindow(url, options = {}) {
  const bounds = getSafeWindowBounds({
    screenRef: screen,
    referenceWindow: options.referenceWindow || null,
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 620
  });
  const window = new BrowserWindow({
    ...bounds,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  
  window.loadURL(url);
  return window;
}

module.exports = {
  checkAnythingLLM,
  checkIfServerReady,
  createAnythingLLMWindow
};
