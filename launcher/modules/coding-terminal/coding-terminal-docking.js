/**
 * PSF Coding Terminal - Docking Manager
 * BrowserView-based dock/undock with state preservation
 * 
 * @module coding-terminal-docking
 * @version 1.1.3 - March 5, 2026
 */

const { BrowserWindow, BrowserView, screen } = require('electron');
const path = require('path');
const codingTerminalCommon = require('./coding-terminal-common');

// State
let mainWindow = null;
let terminalView = null;      // BrowserView for docked mode
let terminalWindow = null;    // BrowserWindow for undocked mode
let isDocked = true;
let isVisible = false;
let isShuttingDown = false;
const FORCE_WINDOW_MODE = true;
let lifecycleCallbacks = {
  onVisibilityChanged: null,
  onDockStateChanged: null,
  onCloseRequested: null
};
let forceClosingWindow = false;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getTargetDisplayWorkArea() {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const bounds = mainWindow.getBounds();
      const center = {
        x: Math.floor(bounds.x + (bounds.width / 2)),
        y: Math.floor(bounds.y + (bounds.height / 2))
      };
      const display = screen.getDisplayNearestPoint(center);
      if (display?.workArea) return display.workArea;
    }
  } catch (_err) {
    // Fallback below.
  }

  const primary = screen.getPrimaryDisplay();
  return primary?.workArea || { x: 0, y: 0, width: 1280, height: 900 };
}

function notifyVisibilityChanged() {
  if (typeof lifecycleCallbacks.onVisibilityChanged === 'function') {
    lifecycleCallbacks.onVisibilityChanged(isVisible);
  }
}

function notifyDockStateChanged() {
  if (typeof lifecycleCallbacks.onDockStateChanged === 'function') {
    lifecycleCallbacks.onDockStateChanged(isDocked);
  }
}

/**
 * Initialize docking manager
 * @param {BrowserWindow} window - Main application window
 */
function initialize(window) {
  mainWindow = window;

  if (!FORCE_WINDOW_MODE) {
    // Create persistent BrowserView
    terminalView = new BrowserView({
      webPreferences: {
        preload: path.join(__dirname, '../../preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    
    // Load terminal HTML
    const terminalUrl = `file://${path.join(__dirname, '../../src/coding-terminal.html')}`;
    terminalView.webContents.loadURL(terminalUrl);
    
    // Handle main window resize when docked
    mainWindow.on('resize', () => {
      if (isDocked && isVisible) {
        updateDockedBounds();
      }
    });
  }
  
  console.log('[CodingTerminal:Docking] Initialized');
}

function setLifecycleCallbacks(callbacks = {}) {
  lifecycleCallbacks = {
    ...lifecycleCallbacks,
    ...callbacks
  };
}

/**
 * Open terminal (docked or undocked based on state)
 * @param {Object} options - Open options
 * @returns {BrowserView|BrowserWindow}
 */
function open(options = {}) {
  if (FORCE_WINDOW_MODE) {
    isDocked = false;
  } else if (options.docked !== undefined) {
    isDocked = options.docked;
  }
  
  if (isDocked) {
    showDocked();
  } else {
    showUndocked();
  }
  
  isVisible = true;
  notifyVisibilityChanged();
  notifyDockStateChanged();
  
  // Send project path if provided
  if (options.projectPath) {
    codingTerminalCommon.setProject(options.projectPath);
    const target = isDocked ? terminalView : terminalWindow;
    target.webContents.send('coding-terminal:set-project', options.projectPath);
  }
  
  return isDocked ? terminalView : terminalWindow;
}

/**
 * Close terminal (hide, preserve state)
 */
function close() {
  if (!FORCE_WINDOW_MODE && isDocked && terminalView && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.removeBrowserView(terminalView);
  } else if (terminalWindow) {
    if (!terminalWindow.isDestroyed()) {
      forceClosingWindow = true;
      terminalWindow.close();
      forceClosingWindow = false;
    }
    terminalWindow = null;
  }
  isVisible = false;
  notifyVisibilityChanged();
}

/**
 * Toggle between docked and undocked modes
 * @returns {boolean} New docked state
 */
function toggle() {
  if (FORCE_WINDOW_MODE) {
    if (terminalWindow && !terminalWindow.isDestroyed()) {
      terminalWindow.focus();
    }
    isDocked = false;
    notifyDockStateChanged();
    return false;
  }

  if (isDocked) {
    // Undock: Move from BrowserView to BrowserWindow
    undock();
  } else {
    // Dock: Move from BrowserWindow to BrowserView
    dock();
  }
  return isDocked;
}

/**
 * Show terminal in docked mode
 */
function showDocked() {
  if (FORCE_WINDOW_MODE) {
    showUndocked();
    return;
  }

  // Destroy separate window if exists
  if (terminalWindow && !terminalWindow.isDestroyed()) {
    terminalWindow.close();
    terminalWindow = null;
  }
  
  // Add BrowserView to main window
  mainWindow.addBrowserView(terminalView);
  updateDockedBounds();
  isDocked = true;
}

/**
 * Show terminal in undocked (separate window) mode
 */
function showUndocked() {
  // Remove from main window
  if (terminalView && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.removeBrowserView(terminalView);
  }
  
  // Create or show separate window
  if (!terminalWindow || terminalWindow.isDestroyed()) {
    const config = codingTerminalCommon.getConfig();
    const workArea = getTargetDisplayWorkArea();
    const safeWidth = Math.max(900, Number(workArea.width || 1280) - 16);
    const safeHeight = Math.max(700, Number(workArea.height || 900) - 16);

    const widthPctTarget = Math.floor(Number(workArea.width || 1280) * 0.94);
    const heightPctTarget = Math.floor(Number(workArea.height || 900) * 0.92);
    const requestedWidth = Math.min(Number(config.defaultWidth) || 1500, widthPctTarget);
    const requestedHeight = Math.min(Number(config.defaultHeight) || 900, heightPctTarget);

    const width = clamp(requestedWidth, 900, safeWidth);
    const height = clamp(requestedHeight, 700, safeHeight);
    const minWidth = Math.min(width, Math.max(900, Number(config.minWidth) || 1000));
    const minHeight = Math.min(height, Math.max(620, Number(config.minHeight) || 620));
    const x = Number(workArea.x || 0) + Math.max(0, Math.floor((safeWidth - width) / 2));
    const y = Number(workArea.y || 0) + Math.max(0, Math.floor((safeHeight - height) / 2));
    
    terminalWindow = new BrowserWindow({
      width,
      height,
      minWidth,
      minHeight,
      x,
      y,
      title: 'PSF Coding Terminal',
      webPreferences: {
        preload: path.join(__dirname, '../../preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    
    // Share the same webContents URL
    const terminalUrl = `file://${path.join(__dirname, '../../src/coding-terminal.html')}`;
    terminalWindow.loadURL(terminalUrl);
    
    // Handle close through backend/BMOC bookkeeping, then allow window to close.
    terminalWindow.on('close', (e) => {
      if (!isShuttingDown && !forceClosingWindow) {
        if (typeof lifecycleCallbacks.onCloseRequested === 'function') {
          lifecycleCallbacks.onCloseRequested();
        }
        isVisible = false;
        notifyVisibilityChanged();
        terminalWindow = null;
      }
    });
  } else {
    terminalWindow.show();
  }
  
  isDocked = false;
}

/**
 * Move from undocked to docked
 */
function dock() {
  if (!isDocked) {
    showDocked();
    isVisible = true;
  }
}

/**
 * Move from docked to undocked
 */
function undock() {
  if (isDocked) {
    showUndocked();
    isVisible = true;
  }
}

/**
 * Update docked view bounds based on main window size
 */
function updateDockedBounds() {
  if (!mainWindow || !terminalView) return;
  
  const config = codingTerminalCommon.getConfig();
  const [width, height] = mainWindow.getContentSize();
  const terminalWidth = Math.floor(width * config.dockedWidthPercent);
  
  terminalView.setBounds({
    x: width - terminalWidth,
    y: 0,
    width: terminalWidth,
    height: height
  });
}

/**
 * Check if currently docked
 * @returns {boolean}
 */
function getIsDocked() {
  return isDocked;
}

/**
 * Check if currently visible
 * @returns {boolean}
 */
function getIsVisible() {
  return isVisible;
}

/**
 * Cleanup on shutdown
 */
function cleanup() {
  isShuttingDown = true;

  if (terminalView) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.removeBrowserView(terminalView);
    }
    terminalView.webContents.destroy();
    terminalView = null;
  }
  
  if (terminalWindow && !terminalWindow.isDestroyed()) {
    terminalWindow.destroy();
    terminalWindow = null;
  }
  
  isVisible = false;
  notifyVisibilityChanged();
  
  console.log('[CodingTerminal:Docking] Cleanup complete');
}

module.exports = {
  initialize,
  setLifecycleCallbacks,
  open,
  close,
  toggle,
  dock,
  undock,
  isDocked: getIsDocked,
  isVisible: getIsVisible,
  cleanup
};
