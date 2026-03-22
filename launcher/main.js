/**
 * ============================================================================
 * PSF ROBOTICS ARCHIVE - MAIN PROCESS
 * ============================================================================
 * 
 * Electron main process entry point.
 * 
 * This file handles:
 * - Application lifecycle (ready, quit, window management)
 * - Window creation (main window, model editor, terminal)
 * - Complex IPC handlers that need window/event references
 * 
 * Simple pass-through IPC handlers are registered via ipc-handlers.js
 * 
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 * @license SEE LICENSE.txt
 * ============================================================================
 */

const { app, BrowserWindow, ipcMain, shell, dialog, screen } = require('electron');
const path = require('path');
const fs = require('fs');

// ============================================================================
// MODULE IMPORTS
// ============================================================================

const logger = require('./modules/logger');
const gpuDetector = require('./modules/gpu-detector/gpu-detector');
const pathManager = require('./modules/path-manager/path-manager');
const compileManager = require('./modules/compile-manager/compile-manager');
const catalogManager = require('./modules/catalog-manager');
const downloadManager = require('./modules/download-manager');
const installationManager = require('./modules/installation-manager/installation-manager');
const licenseManager = require('./modules/license-manager');
const ollamaManager = require('./modules/ollama-manager/ollama-manager');
const catalogHelper = require('./modules/catalog-helper');
const binaryManager = require('./modules/binary-manager/binary-manager');
const webuiManager = require('./modules/webui-manager/webui-manager');
const anythingLLMManager = require('./modules/anythingllm-manager/anythingllm-manager');
const versionManager = require('./modules/version-manager/version-manager');
const sessionManager = require('./modules/session-manager');
const sessionMemory = require('./modules/session-memory');
const PortPoolOllama = require('./modules/port-pool/port-pool-ollama');
const settingsManager = require('./modules/settings-manager');
const attachments = require('./modules/attachments');
const bucketRegistryModule = require('./modules/buckets/bucket-registry');
const huggingfaceAPI = require('./modules/huggingface-api');
const modelConfigManager = require('./modules/model-config-manager');
const ipcHandlers = require('./modules/ipc-handlers');
const { getVoiceToTextConfig } = require('./modules/voice-to-text/voice-to-text-common');
const { prewarmLocalTransformers } = require('./modules/voice-to-text/providers/local-transformers');
const blobMapper = require('./modules/blob-mapper');
const codingTerminalBackend = require('./modules/coding-terminal/coding-terminal-backend');
const ragEngine = require('./modules/rag-engine/rag-engine');
const gitIntegration = require('./modules/git-integration/git-integration');
const securityLayer = require('./modules/security-layer/security-layer');
const { createModLoader } = require('./modules/mod-manager/mod-loader');
const workspaceGitManager = require('./modules/workspace-git-manager');
const mainCompiledBinaries = require('./modules/main/main-compiled-binaries');
const mainEditorWindows = require('./modules/main/main-editor-windows');
const mainContextMenu = require('./modules/main/main-context-menu');
const mainDialogSystem = require('./modules/main/main-dialog-system');
const mainRuntimeHandlers = require('./modules/main/main-runtime-handlers');
const mainOpsHandlers = require('./modules/main/main-ops-handlers');
const mainMoeChatWindow = require('./modules/main/main-moe-chat-window');
const { getSafeWindowBounds } = require('./modules/window-bounds');
const createCanaryMonitor = require('./modules/canary-monitor');

// Initialize session manager with app path (must be done before any sessions are created)
sessionManager.initialize(__dirname);

// ============================================================================
// GLOBAL STATE
// ============================================================================

let mainWindow = null;
let modelEditorWindow = null;
let settingsWindow = null;
let gpuInfo = {
  accelerationType: 'cpu',
  cudaDeviceIndex: null,
  displayText: 'Ã°Å¸â€™Â» CPU Inference',
  detected: false
};
let startupTtsWarmupPromise = null;
let isQuitting = false;
let canaryMonitor = null;

async function runAppShutdownCleanup() {
  try {
    codingTerminalBackend.shutdown();
  } catch (err) {
    logger.warn('Coding terminal shutdown during app quit failed:', err?.message || err);
  }

  try {
    await ragEngine.shutdown();
  } catch (err) {
    logger.warn('RAG engine shutdown during app quit failed:', err?.message || err);
  }

  try {
    const portPools = { ollama: PortPoolOllama };
    await sessionManager.closeAllSessions(portPools);
  } catch (err) {
    logger.warn('Session cleanup during app quit failed:', err?.message || err);
  }
}

// ============================================================================
// WINDOW CREATION
// ============================================================================

function createWindow() {
  const bounds = getSafeWindowBounds({
    screenRef: screen,
    width: 1400,
    height: 945,
    minWidth: 1024,
    minHeight: 768
  });
  mainWindow = new BrowserWindow({
    ...bounds,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index-developer.html'));

  // On Linux/Windows we want "close main window" to mean "quit app",
  // even if auxiliary windows were left open (e.g. undocked coding terminal).
  mainWindow.on('closed', () => {
    mainWindow = null;

    try {
      codingTerminalBackend.shutdown();
    } catch (err) {
      logger.warn('Coding terminal shutdown on main window close failed:', err?.message || err);
    }

    for (const win of BrowserWindow.getAllWindows()) {
      try {
        if (!win.isDestroyed()) {
          win.destroy();
        }
      } catch (_) {}
    }

    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

async function warmupTtsAtStartup(context) {
  try {
    if (context?.modLoader && typeof context.modLoader.hasEnabledCapability === 'function') {
      const gate = await context.modLoader.hasEnabledCapability('voice.tts');
      if (!gate?.available) {
        logger.info('[Voice] Startup TTS warmup skipped (voice.tts capability not enabled).');
        return { success: false, skipped: true, reason: 'voice_pack_missing' };
      }
    } else {
      logger.info('[Voice] Startup TTS warmup skipped (mod loader unavailable).');
      return { success: false, skipped: true, reason: 'mod_loader_unavailable' };
    }

    const settings = context.settingsManager.getSettings(context.appDir);
    const voiceCfg = getVoiceToTextConfig(settings);
    if (voiceCfg?.ttsEnabled !== true) {
      logger.info('[Voice] Startup TTS warmup skipped (TTS disabled).');
      return { success: false, skipped: true, reason: 'tts_disabled' };
    }
    const provider = String(voiceCfg?.ttsProvider || 'local-transformers').toLowerCase();
    if (provider !== 'local-transformers') {
      logger.info(`[Voice] Startup TTS warmup skipped (provider=${provider}).`);
      return { success: false, skipped: true, reason: 'provider_not_supported' };
    }
    const startupModel = String(voiceCfg?.localTransformers?.model || '').trim().toLowerCase();
    if (startupModel.includes('chatterbox')) {
      logger.info('[Voice] Startup TTS warmup skipped for Chatterbox model (avoid long first-run fetch in background).');
      return { success: false, skipped: true, reason: 'chatterbox_startup_skip' };
    }
    const startedAt = Date.now();
    logger.info('[Voice] Startup TTS warmup starting (local transformers)...');
    const result = await prewarmLocalTransformers(context, { timeoutMs: 180000 });
    const elapsedMs = Date.now() - startedAt;
    if (result?.success) {
      logger.info(`[Voice] Startup TTS warmup complete in ${elapsedMs}ms.`);
      return { success: true, elapsedMs };
    }
    const errorText = String(result?.error || 'unknown error');
    const optionalChatterboxMissing = /missing python packages:\s*chatterbox/i.test(errorText);
    if (optionalChatterboxMissing) {
      logger.info(`[Voice] Startup TTS warmup skipped optional dependency after ${elapsedMs}ms: ${errorText}`);
    } else {
      logger.warn(`[Voice] Startup TTS warmup failed after ${elapsedMs}ms: ${errorText}`);
    }
    return { success: false, elapsedMs, error: result?.error || 'unknown error' };
  } catch (err) {
    logger.warn(`[Voice] Startup TTS warmup error: ${err?.message || err}`);
    return { success: false, error: err?.message || String(err) };
  }
}

// ============================================================================
// APPLICATION LIFECYCLE
// ============================================================================

app.whenReady().then(async () => {
  logger.info('Application starting...');

  try {
    canaryMonitor = createCanaryMonitor({
      appDir: __dirname,
      getSessionSummary: () => sessionManager.getSessionSummary()
    });
    canaryMonitor.start();
  } catch (err) {
    logger.warn('[Canary] Failed to start monitor:', err?.message || err);
  }
  
  // Pre-cache GPU info with classification
  try {
    const hardware = await gpuDetector.detectAll(__dirname);
    const classification = gpuDetector.classifyForInference(hardware);
    
    // Build complete gpuInfo object with ALL details needed by ollama-manager
    gpuInfo = {
      ...classification,  // accelerationType, displayText, name, vram, uuid, index, cudaDeviceIndex, detected
    };
    
    logger.info('GPU detection complete:', gpuInfo?.name || gpuInfo?.displayText || 'CPU');
  } catch (err) {
    logger.error('GPU detection failed:', err);
    gpuInfo = {
      accelerationType: 'cpu',
      cudaDeviceIndex: null,
      displayText: '💻 CPU Inference',
      detected: true
    };
  }
  
  // Create context for IPC handlers
  const context = {
    appDir: __dirname,
    gpuInfo,
    shell,
    dialog,
    attachmentStore: attachments.createAttachmentStore({
      baseDir: path.join(__dirname, '..', '.psf', 'attachments')
    }),
    bucketRegistry: bucketRegistryModule.createBucketRegistry({
      filePath: path.join(__dirname, '..', '.psf', 'attachments', 'bucket-registry.json')
    }),
    // Modules
    gpuDetector,
    huggingfaceAPI,
    catalogManager,
    catalogHelper,
    downloadManager,
    ollamaManager,
    webuiManager,
    anythingLLMManager,
    binaryManager,
    compileManager,
    licenseManager,
    versionManager,
    settingsManager,
    installationManager,
    pathManager,
    sessionManager,
    sessionMemory,
    modelConfigManager,
    blobMapper,
    workspaceGitManager
  };

  context.modLoader = createModLoader({
    rootDir: path.join(__dirname, '..', '.psf', 'mods')
  });
  context.modRootDir = path.join(__dirname, '..', '.psf', 'mods');
  await context.modLoader.initialize();
  
  // Register all simple IPC handlers
  ipcHandlers.registerAll(ipcMain, context);
  
  // Register complex handlers (defined below)
  registerComplexHandlers(context);

  // Warm local TTS at startup so first assistant speech starts faster.
  startupTtsWarmupPromise = warmupTtsAtStartup(context);
  
  // Create main window
  createWindow();
  
  // Initialize coding terminal backend after main window exists
  try {
    codingTerminalBackend.initialize(mainWindow, {
      appDir: __dirname,
      gpuInfo
    });
  } catch (err) {
    logger.warn('Coding terminal backend initialization failed:', err.message);
  }
  
  logger.info('Application ready');
});

app.on('browser-window-created', (event, win) => {
  mainContextMenu.attachStandardContextMenu(win);
});

app.on('window-all-closed', () => {
  logger.info('All windows closed.');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', async (event) => {
  if (isQuitting) {
    return;
  }
  isQuitting = true;
  logger.info('Application shutting down...');
  event.preventDefault();

  try {
    if (canaryMonitor) {
      canaryMonitor.stop();
    }
    await Promise.race([
      runAppShutdownCleanup(),
      new Promise((resolve) => setTimeout(resolve, 5000))
    ]);
  } catch (err) {
    logger.error('Session cleanup error:', err);
  }

  app.exit(0);
});

// ============================================================================
// COMPLEX IPC HANDLERS
// ============================================================================
// These handlers need access to windows, event.sender, or have special logic
// that doesn't fit the simple pass-through pattern.

function registerComplexHandlers(ctx) {
  
  // --------------------------------------------------------------------------
  // DIALOG APIs (Proper GTK integration to avoid signal handler errors)
  // --------------------------------------------------------------------------
  mainDialogSystem.registerDialogSystemHandlers(ipcMain, {
    dialog,
    securityLayer,
    getMainWindow: () => mainWindow,
    getGpuInfo: () => gpuInfo
  });
  
  // --------------------------------------------------------------------------
  // MODEL EDITOR WINDOW
  // --------------------------------------------------------------------------
  mainEditorWindows.registerEditorWindowHandlers(ipcMain, {
    appDir: __dirname,
    getMainWindow: () => mainWindow,
    getSettingsWindow: () => settingsWindow,
    setSettingsWindow: (win) => { settingsWindow = win; },
    getModelEditorWindow: () => modelEditorWindow,
    setModelEditorWindow: (win) => { modelEditorWindow = win; }
  });
  
  mainOpsHandlers.registerOpsHandlers(ipcMain, {
    appDir: __dirname,
    binaryManager,
    anythingLLMManager,
    settingsManager,
    downloadManager,
    installationManager,
    ollamaManager,
    sessionManager,
    modelConfigManager,
    compileManager,
    getGpuInfo: () => gpuInfo
  });
  
  // --------------------------------------------------------------------------
  // COMPILED BINARY MANAGEMENT
  // --------------------------------------------------------------------------
  
  ipcMain.handle('get-compiled-binary-status', async () => {
    return mainCompiledBinaries.getCompiledBinaryStatus(__dirname);
  });
  
  ipcMain.handle('delete-compiled-binary', async (event, binaryType) => {
    return mainCompiledBinaries.deleteCompiledBinary(__dirname, binaryType);
  });
  
  mainMoeChatWindow.registerMoeChatWindowHandlers(ipcMain, { appDir: __dirname });
  
  mainRuntimeHandlers.registerRuntimeHandlers(ipcMain, {
    sessionManager,
    codingTerminalBackend,
    dialog,
    getMainWindow: () => mainWindow
  });
  
  console.log('[Main] ✅ Complex handlers registered');
}

// ============================================================================
// END OF FILE
// ============================================================================
