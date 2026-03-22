/**
 * PSF Coding Terminal - Backend Entry Point Dispatcher
 * Routes requests to appropriate handlers based on operation type
 * 
 * @module coding-terminal-backend
 * @version 1.1.2 - March 5, 2026
 */

const { ipcMain } = require('electron');
const codingTerminalCommon = require('./coding-terminal-common');
const codingTerminalDocking = require('./coding-terminal-docking');
const codingTerminalIpc = require('./coding-terminal-ipc');
const sessionManager = require('../session-manager');

// Module state
let initialized = false;
let mainWindow = null;
let codingTerminalSessionId = null;

function endSessionTracking() {
  if (!codingTerminalSessionId) return;
  const sessionId = codingTerminalSessionId;
  codingTerminalSessionId = null;
  sessionManager.closeSession(sessionId)
    .catch((err) => console.error('[CodingTerminal] Session close error:', err.message));
}

function handleWindowCloseRequested() {
  codingTerminalIpc.closeTerminalOllamaSession()
    .catch((err) => console.error('[CodingTerminal] Terminal Ollama close error:', err.message));
  codingTerminalIpc.closeTerminalLlamaSession()
    .catch((err) => console.error('[CodingTerminal] Terminal llama.cpp close error:', err.message));
  codingTerminalIpc.closeRouterOllamaSession()
    .catch((err) => console.error('[CodingTerminal] Router Ollama close error:', err.message));
  codingTerminalIpc.closeRouterLlamaSession()
    .catch((err) => console.error('[CodingTerminal] Router llama.cpp close error:', err.message));
  endSessionTracking();
}

function syncSessionMetadata(extra = {}) {
  if (!codingTerminalSessionId) return;
  sessionManager.updateSession(codingTerminalSessionId, {
    metadata: {
      docked: codingTerminalDocking.isDocked(),
      visible: codingTerminalDocking.isVisible(),
      ...extra
    }
  });
}

/**
 * Initialize the coding terminal backend
 * @param {BrowserWindow} window - Main application window
 * @param {Object} [runtimeContext] - Runtime dependencies/context
 * @returns {boolean} Success status
 */
function initialize(window, runtimeContext = {}) {
  if (initialized) {
    console.log('[CodingTerminal] Already initialized');
    return true;
  }
  
  mainWindow = window;
  
  try {
    // Initialize sub-modules
    codingTerminalCommon.initialize();
    codingTerminalDocking.initialize(mainWindow);
    codingTerminalIpc.setRuntimeContext(runtimeContext);
    codingTerminalDocking.setLifecycleCallbacks({
      onVisibilityChanged: (visible) => syncSessionMetadata({ visible }),
      onDockStateChanged: (docked) => syncSessionMetadata({ docked }),
      onCloseRequested: () => handleWindowCloseRequested()
    });
    codingTerminalIpc.registerHandlers();
    
    initialized = true;
    console.log('[CodingTerminal] Backend initialized successfully');
    return true;
  } catch (err) {
    console.error('[CodingTerminal] Initialization failed:', err);
    return false;
  }
}

/**
 * Shutdown the coding terminal backend
 */
function shutdown() {
  if (!initialized) return;
  
  try {
    codingTerminalDocking.cleanup();
    endSessionTracking();
    codingTerminalIpc.unregisterHandlers();
    initialized = false;
    console.log('[CodingTerminal] Backend shutdown complete');
  } catch (err) {
    console.error('[CodingTerminal] Shutdown error:', err);
  }
}

/**
 * Open the coding terminal window
 * @param {Object} options - Window options
 * @param {boolean} options.docked - Start in docked mode
 * @param {string} options.projectPath - Initial project path
 * @returns {BrowserWindow|BrowserView} Terminal window/view
 */
function openTerminal(options = {}) {
  if (!initialized) {
    console.error('[CodingTerminal] Not initialized');
    return null;
  }
  
  const terminalRef = codingTerminalDocking.open(options);
  
  if (!codingTerminalSessionId) {
    codingTerminalCommon.clearHistory();
    codingTerminalSessionId = sessionManager.registerSession({
      type: 'coding-terminal',
      ollamaPort: null,
      ollamaPID: null,
      metadata: {
        docked: codingTerminalDocking.isDocked(),
        visible: codingTerminalDocking.isVisible(),
        startedVia: 'coding-terminal-backend'
      }
    });
  } else {
    syncSessionMetadata();
  }
  
  return terminalRef;
}

/**
 * Close the coding terminal
 */
function closeTerminal() {
  if (!initialized) return;
  codingTerminalDocking.close();
  handleWindowCloseRequested();
}

/**
 * Toggle dock/undock state
 * @returns {boolean} New docked state
 */
function toggleDock() {
  if (!initialized) return false;
  const docked = codingTerminalDocking.toggle();
  syncSessionMetadata();
  return docked;
}

/**
 * Get current terminal state
 * @returns {Object} State object
 */
function getState() {
  return {
    initialized,
    sessionId: codingTerminalSessionId,
    docked: codingTerminalDocking.isDocked(),
    visible: codingTerminalDocking.isVisible()
  };
}

module.exports = {
  initialize,
  shutdown,
  openTerminal,
  closeTerminal,
  toggleDock,
  getState
};
