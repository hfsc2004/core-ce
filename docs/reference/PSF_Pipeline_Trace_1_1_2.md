# PSF local package set - Complete Pipeline Trace
## Version 1.1.3 | March 5, 2026

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Entry Points](#entry-points)
4. [Electron Main Process](#electron-main-process)
5. [IPC Bridge](#ipc-bridge)
6. [Renderer / UI Layer](#renderer--ui-layer)
7. [Core Backend Modules](#core-backend-modules)
8. [Port Management System](#port-management-system)
9. [Session Management](#session-management)
10. [Data Files & Configuration](#data-files--configuration)
11. [Model Configuration Pipeline](#model-configuration-pipeline)
12. [Complete File Inventory](#complete-file-inventory)

---

## Overview

The PSF local package set is a commercial Electron-based desktop application providing curated AI model sets with pre-configured environments. The application supports:

- **Platforms**: Windows, macOS, Linux
- **Architectures**: x64, ARM64
- **Features**: Ollama integration, GPU acceleration, Open WebUI, AnythingLLM
- **Editions**: Core - Community Edition (factory tools) and Standard Edition (consumer products)
- **NEW!**: Added Mixture of Experts to Core - Community Edition

### Key Architectural Principles

1. **Edition Compartmentalization**: Standard Edition (index.html + renderer/*.js) is completely separate from Core - Community Edition (index-enterprise.html + renderer-enterprise/*.js)
2. **Platform Dispatcher Pattern**: Core modules use dispatcher files that route to platform-specific implementations
3. **Session Manager Authority**: `session-manager.js` is the sole authority for Ollama/WebUI/AnythingLLM session lifecycle
4. **Port Pool Isolation**: Each service type has dedicated port ranges with dynamic allocation
5. **IPC Separation**: Main process and renderer communicate exclusively via the preload bridge
6. **IPC Handler Registry**: `ipc-handlers.js` centralizes 90% of IPC handlers (pass-through pattern)
7. **Compile Manager**: Builds Standard Edition products from Core - Community Edition source (copies renderer/*.js, NOT renderer-enterprise/)

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                              ENTRY POINTS                                            │
│  ┌──────────────┐  ┌──────────────┐   ┌───────────────┐  ┌──────────────────────────┐│
│  │  start.sh    │  │  start.bat   │   │ start.command │  │ RUN_ONCE_*.sh/.bat       ││
│  │  (Linux)     │  │  (Windows)   │   │    (macOS)    │  │   (First-run setup)      ││
│  └──────┬───────┘  └──────┬───────┘   └───────┬───────┘  └──────────────────────────┘│
│         └─────────────────┬───────────────────┘                                      │
│                           ▼                                                          │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐│
│  │                        ELECTRON (package.json → main.js)                         ││
│  └──────────────────────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────────────┘
                                         │
                                                                    ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                           MAIN PROCESS (main.js)                                     │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐│
│  │                         MODULE INITIALIZATION                                    ││
│  │  logger → gpuDetector → pathManager → sessionManager → catalogManager           ││
│  │  downloadManager → installationManager → licenseManager → ollamaManager         ││
│  │  catalogHelper → binaryManager → webuiManager → anythingLLMManager              ││
│  │  versionManager → PortPoolOllama → settingsManager → huggingfaceAPI             ││
│  │  ipcHandlers                                                                     ││
│  └──────────────────────────────────────────────────────────────────────────────────┘│
│  ┌──────────────────────────────────────────────────────────────────────────────────┐│
│  │                          IPC HANDLERS (~70+)                                     ││
│  │  ipc-handlers.js: Catalog │ Binary │ Ollama │ Version │ Settings (90%)           ││
│  │  main.js complex: GPU info │ Model editor │ Dialogs │ Progress streams           ││
│  └──────────────────────────────────────────────────────────────────────────────────┘│
│  ┌──────────────────────────────────────────────────────────────────────────────────┐│
│  │                         LIFECYCLE MANAGEMENT                                     ││
│  │  app.whenReady → GPU detection → ipcHandlers.registerAll → createWindow         ││
│  │  window-all-closed → closeAllSessions → app.quit                                ││
│  │  before-quit → closeAllSessions → app.exit(0)                                   ││
│  └──────────────────────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────────────┘
                                           │
                            ┌──────────────┴────────────┐
                                              ▼                                             ▼
┌────────────────────────────────────────┐   ┌─────────────────────────────────────────┐
│        PRELOAD BRIDGE                  │   │        BACKEND MODULES                  │
│        (preload.js)                    │   │        (modules/*.js)                   │
│  ┌────────────────────────────────┐    │   │  ┌───────────────────────────────────┐  │
│  │ contextBridge.exposeInMainWorld│    │   │  │   DISPATCHER PATTERN (7 modules)  │  │
│  │ ┌────────────────────────────  │    │   │  │   module.js (dispatcher)          │  │
│  │ │ Hardware detection APIs      │    │   │  │   ┌── module-linux-x64.js         │  │
│  │ │ Catalog APIs                 │    │   │  │   ┌── module-linux-arm64.js       │  │
│  │ │ Model download APIs          │    │   │  │   ┌── module-macos-arm.js         │  │
│  │ │ Launch APIs                  │    │   │  │   ┌── module-macos-intel.js       │  │
│  │ │ Binary management APIs       │    │   │  │   ┌── module-windows-x64.js       │  │
│  │ │ Version control APIs         │    │   │  │   ┌── module-windows-arm64.js     │  │
│  │ │ Compile/Build APIs           │    │   │  │   └── module-common.js            │  │
│  │ │ HuggingFace APIs             │    │   │  └───────────────────────────────────┘  │
│  │ │ Settings APIs                │    │   │  ┌───────────────────────────────────┐  │
│  └────────────────────────────────┘    │   │  │   STANDALONE MODULES (14)         │  │
└────────────────────────────────────────┘   │  │   blob-mapper, catalog-manager,   │  │
                            │                │  │   download-manager, ipc-handlers, │  │
                                              ▼                │  │   session-manager, logger, etc.   │  │
┌────────────────────────────────────────────│──┴───────────────────────────────────┘  │
│                           RENDERER PROCESS └─────────────────────────────────────────┘
│  ┌───────────────────────────────────────────────────────────────────────────────────────────┐
│  │                   index-enterprise.html (Core - Community Edition)                                │
│  │  ┌───────────────────────────────────────────────────────────────────────────────────────┐│
│  │  │                         SCREENS (12)                                                  ││
│  │  │  welcome-screen │ main-menu │ hardware-detect │ model-browser                         ││
│  │  │  catalog-editor │ package-manager │ version-manager │ build-tools                     ││
│  │  │  binary-manager │ compile-project │ webui-select │ about │ blob-mapper                ││
│  │  └───────────────────────────────────────────────────────────────────────────────────────┘│
│  └────────────────────────────────────────────────────────────────────────────────────────── │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────┐│
│  │                   JavaScript Modules (18 files)                                          ││
│  │  ui-modal.js │ model-config.js │ ui-navigation.js │ catalog-editor.js                    ││
│  │  package-manager.js │ version-manager-ui.js │ build-tools.js │ model-actions-enterprise.js││
│  │  webui-launchers.js │ utilities-enterprise.js │ interface-launcher.js │ blob-mapper-ui.js ││
│  │  binary-manager-ui.js │ binary-versions.js │ python-webui.js                             ││
│  │  compile-project.js │ license-buttons.js │ settings-modal.js │ blob-mapper-ui.js         |│
│  └──────────────────────────────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────────────────────┘
                                         │
                                                                    ▼
┌────────────────────────────────────────────────────────────────────────────────────┐
│                          EXTERNAL SERVICES                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                     │
│  │     OLLAMA      │  │   OPEN WEBUI    │  │  ANYTHINGLLM    │                     │
│  │ Server: 52434+  │  │  Port: 52460+   │  │  Port: 52470+   │                     │
│  │ Terminal: 52450+│  │  (10 pool)      │  │  (10 pool)      │                     │
│  │  (10+10 pool)   │  └─────────────────┘  └─────────────────┘                     │
│  └─────────────────┘                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                    ENTERPRISE / MoE POOLS                                   │   │
│  │  Agents: 53000-62999 (10K) │ Coordinators: 63000-63499 (500)                │   │
│  │  External I/O: 63500-63999 (500)                                            │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Entry Points

### Platform-Specific Launchers

| File | Platform | Purpose |
|------|----------|---------|
| `start.sh` | Linux | Bash script - checks for AppImage first, falls back to dev mode |
| `start.bat` | Windows | Batch script - launches Electron from launcher |
| `start.command` | macOS | Shell script - handles both dev and app paths |
| `RUN_ONCE_MAC_LINUX.sh` | Linux/macOS | First-run npm install |
| `RUN_ONCE_WINDOWS.bat` | Windows | First-run npm install |
| `autorun.inf` | Windows | Autorun config pointing to START-HERE.bat |

### start.sh Flow (Linux Example)

```bash
1. Display banner "PSF physical systems package set"
2. cd to script directory
3. Look for AppImage in dist/ folder (production)
   ┌── If found: chmod +x && execute with --no-sandbox
   └── If not found: Fall back to development mode
4. Development mode:
   ┌── Check for launcher/main.js
   ┌── Try: ./node_modules/.bin/electron . --no-sandbox
   └── Or:  ./node_modules/electron/dist/electron . --no-sandbox
5. Exit
```

---

## Electron Main Process

### main.js (471 lines)

The main process handles application lifecycle, window creation, and complex IPC handlers.

#### Module Loading (Lines 20-46)

```javascript
// Core Electron
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');

// Core modules (19 imports)
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
const versionManager = require('./modules/version-manager');
const sessionManager = require('./modules/session-manager');
const PortPoolOllama = require('./modules/port-pool/port-pool-ollama');
const settingsManager = require('./modules/settings-manager');
const huggingfaceAPI = require('./modules/huggingface-api');
const ipcHandlers = require('./modules/ipc-handlers');
```

#### Application Lifecycle (Lines 89-178)

```javascript
app.whenReady().then(async () => {
  // 1. GPU Detection
  const hardware = await gpuDetector.detectAll(__dirname);
  const classification = gpuDetector.classifyForInference(hardware);
  gpuInfo = { ...classification };
  
  // 2. Create IPC Context
  const context = {
    appDir: __dirname,
    gpuInfo,
    shell,
    // All modules passed to handlers
    gpuDetector, huggingfaceAPI, catalogManager, catalogHelper,
    downloadManager, ollamaManager, webuiManager, anythingLLMManager,
    binaryManager, compileManager, licenseManager, versionManager,
    settingsManager, installationManager, pathManager, sessionManager
  };
  
  // 3. Register IPC handlers
  ipcHandlers.registerAll(ipcMain, context);  // 90% of handlers
  registerComplexHandlers(context);           // Remaining 10%
  
  // 4. Create window
  createWindow();
});
```

#### Complex Handlers in main.js

These handlers require window references or event.sender for progress streaming:
- `get-gpu-info` - Returns cached gpuInfo
- `open-model-editor` - Creates modal BrowserWindow
- `close-model-editor` / `minimize-model-editor` - Window control
- `select-import-file` - Native file dialog (mode-aware)
  - default: JSON import flow
  - `mode=attachment|file|any`: generic file picker for attachment workflows
- `verify-model-checksum` - SHA256 verification
- `check-binaries` - Conditional routing (Ollama vs AnythingLLM)
- `download-model` / `download-binaries` - Progress callbacks via event.sender
- `launch-ollama` / `open-ollama-terminal` - Ollama process management
- `launch-model-in-ollama` - Blob upload progress
- `build-python-webui` / `install-anythingllm` / `compile-project` - Build progress

---

## IPC Bridge

### preload.js (126 lines)

Exposes ~70+ API methods via contextBridge:

```javascript
contextBridge.exposeInMainWorld('electronAPI', {
  // Hardware (4 methods)
  detectHardware, getGPUInfo, getModelCompatibility, calculateModelRequirements,
  
  // HuggingFace (3 methods)
  fetchHuggingFaceConfig, fetchHuggingFaceModelInfo, fetchFileInfo,
  
  // Model Editor Window (5 methods)
  openModelEditor, closeModelEditor, minimizeModelEditor, 
  onModelEditorData, refreshPackageManager,
  
  // Catalog (3 methods)
  getCatalog, getSKUConfig, getMasterCatalog,
  
  // Model Management (8 methods)
  downloadModel, checkFileExists, deleteModel, deleteModelFromCatalog,
  launchModelInOllama, verifyModelChecksum, onDownloadProgress, onBlobUploadProgress,
  
  // Launch (5 methods)
  launchOllama, launchOpenWebUI, launchAnythingLLM, openURL, openOllamaTerminal,
  
  // Catalog Editor (7 methods)
  loadCatalog, saveCatalog, addModel, updateModel, searchModels, 
  saveMasterCatalog, getSets,
  
  // Package Manager (5 methods)
  addSet, editSet, deleteSet, editModel, moveModel,
  
  // Import/Export (3 methods)
  selectImportFile, previewImportFile, importModelsFromFile,
  
  // Compile (6 methods)
  getDownloadedModelsWithBlobs, listCompileConfigs, saveCompileConfig,
  loadCompileConfig, deleteCompileConfig, compileProject,
  
  // Ollama (4 methods)
  ollamaSendMessage, ollamaSendMessageStream, ollamaListModels, onOllamaStreamData,
  
  // Version Manager (3 methods)
  updateVersion, getCurrentVersion, getVersionStatus,
  
  // Build Tools (2 methods)
  buildSKUCatalogs, onBuildProgress,
  
  // Binary Manager (6 methods)
  checkBinaries, downloadBinaries, deleteBinaries, killOllamaService, 
  checkOllamaStatus, getBinaryVersions,
  
  // Python WebUI (3 methods)
  checkPythonWebUI, buildPythonWebUI, onPythonWebUIBuildOutput,
  
  // Config Management (4 methods)
  loadConfigList, loadConfig, saveConfig, deleteConfig
});
```

### ipc-handlers.js (340 lines)

Centralizes ~90% of IPC handlers using pass-through pattern:

```javascript
const handlers = {
  // Hardware Detection
  'detect-hardware': (ctx) => ctx.gpuDetector.detectAll(ctx.appDir),
  'get-model-compatibility': async (ctx, event, model) => {...},
  'calculate-model-requirements': (ctx, event, model) => {...},
  
  // HuggingFace API
  'fetch-huggingface-config': (ctx, event, modelUrl) => ctx.huggingfaceAPI.fetchConfig(modelUrl),
  'fetch-huggingface-model-info': (ctx, event, modelUrl) => ctx.huggingfaceAPI.fetchModelInfo(modelUrl),
  
  // Catalog Management (~15 handlers)
  'get-sku-config', 'get-catalog', 'get-master-catalog', 'save-master-catalog',
  'get-sets', 'add-set', 'edit-set', 'delete-set',
  'add-model', 'edit-model', 'delete-model-from-catalog', 'move-model',
  'preview-import-file', 'import-models-from-file',
  
  // Binary Management (~8 handlers)
  'get-binary-versions', 'update-binary-version', 'check-for-binary-updates',
  'delete-binaries', 'kill-ollama-service', 'check-ollama-status',
  'check-python-webui', 'delete-installation',
  
  // Ollama (~4 handlers)
  'ollama-send-message', 'ollama-list-models', 'launch-open-webui', 'launch-anythingllm',
  
  // Version Manager (~3 handlers)
  'get-current-version', 'update-version', 'get-version-status',
  
  // File Operations (~4 handlers)
  'check-file-exists', 'delete-model', 'get-downloaded-models-with-blobs', 'open-url',
  
  // Build (~3 handlers)
  'build-sku-catalogs', 'list-compile-configs', 'save-compile-config'
};
```

---

## Renderer / UI Layer

### index-enterprise.html (651 lines)

Core - Community Edition HTML - loads 19 modular JavaScript files:

```html
<!-- Script load order (critical) -->
<script src="renderer/renderer-enterprise/ui-modal.js"></script>
<script src="renderer/renderer-enterprise/model-config.js"></script>
<script src="renderer/renderer-enterprise/ui-navigation.js"></script>
<script src="renderer/renderer-enterprise/catalog-editor.js"></script>
<script src="renderer/renderer-enterprise/package-manager.js"></script>
<script src="renderer/renderer-enterprise/version-manager.js"></script>
<script src="renderer/renderer-enterprise/build-tools.js"></script>
<script src="renderer/renderer-enterprise/webui-launchers.js"></script>
<script src="renderer/renderer-enterprise/utilities-enterprise.js"></script>
<script src="renderer/renderer-enterprise/interface-launcher.js"></script>
<script src="renderer/renderer-enterprise/binary-manager-ui.js"></script>
<script src="renderer/renderer-enterprise/binary-versions.js"></script>
<script src="renderer/renderer-enterprise/python-webui.js"></script>
<script src="renderer/renderer-enterprise/compile-project.js"></script>
<script src="renderer/renderer-enterprise/license-buttons.js"></script>
<script src="renderer/renderer-enterprise/settings-modal.js"></script>
<script src="renderer/renderer-enterprise/blob-mapper-ui.js"></script>
```

### Core - Community Edition Renderer Module Responsibilities (18 files)

| Module | Purpose |
|--------|---------|
| `ui-modal.js` | Global state, scrollable modal dialogs |
| `model-config.js` | Model configuration utilities |
| `ui-navigation.js` | Tab navigation, screen switching, model card rendering |
| `catalog-editor.js` | Catalog editing UI initialization |
| `package-manager.js` | set/model CRUD UI (60KB - largest renderer file) |
| `version-manager-ui.js` | Version update UI |
| `build-tools.js` | SKU catalog build UI |
| `model-actions-enterprise.js` | Model operations (launch, delete, download) |
| `webui-launchers.js` | WebUI/AnythingLLM launch buttons |
| `utilities-enterprise.js` | Helper functions (openDocs, openExternal) |
| `interface-launcher.js` | Interface launch coordination |
| `binary-manager-ui.js` | Binary download/status UI |
| `binary-versions.js` | Binary version display/update |
| `python-webui.js` | Python WebUI build UI |
| `compile-project.js` | Project compilation UI (27KB) |
| `license-buttons.js` | License viewing buttons |
| `settings-modal.js` | Settings modal (HuggingFace token) |
| `blob-mapper-ui.js` | Blob mapping visualization (14KB) |

### Additional UI Files

| File | Purpose |
|------|---------|
| `loading.html` | Loading splash screen for WebUI startup |
| `model-editor.html` | Modal window for add/edit models (Core - Community Edition) |
| `terminal.html` | Ollama Terminal with xterm.js |
| `model-editor-renderer.js` | Model editor form logic |
| `terminal-renderer.js` | Terminal xterm.js integration |
| `styles.css` | Core - Community Edition stylesheet |
| `styles-standard.css` | Standard Edition stylesheet |
| `filter-buttons.css` | Filter button styles (Core - Community Edition) |

### Standard Edition Renderer Modules (9 files)

Loaded by `index.html` for consumer USB products:

```html
<script src="renderer/globals.js"></script>
<script src="renderer/screen-navigation.js"></script>
<script src="renderer/hardware-detect.js"></script>
<script src="renderer/model-browser.js"></script>
<script src="renderer/model-actions.js"></script>
<script src="renderer/webui-launcher.js"></script>
<script src="renderer/license-modal.js"></script>
<script src="renderer/utilities.js"></script>
<script src="renderer/delete-data.js"></script>
```

| Module | Purpose |
|--------|---------|
| `globals.js` | Global state (window.catalogData, window.skuConfig) |
| `screen-navigation.js` | Screen switching, disclaimer acceptance |
| `hardware-detect.js` | Hardware detection, model recommendations |
| `model-browser.js` | Catalog display, set toggles |
| `model-actions.js` | Model launching, deletion |
| `webui-launcher.js` | Open WebUI launcher |
| `license-modal.js` | License modal popups |
| `utilities.js` | Helper functions (openDocs, escapeHtml, formatBytes) |
| `delete-data.js` | User data deletion functionality |

---

## Core Backend Modules

### Dispatcher Pattern Modules (7 ÃƒÆ’Ã¢──â─ 8 = 56 files)

Each dispatcher detects OS/arch and routes to platform-specific implementation:

#### Ollama Manager
```
ollama-manager.js              1.5K   Dispatcher
ollama-manager-common.js       20K    HTTP ops, streaming, model management
ollama-manager-linux-x64.js    13K    CUDA lib paths, process spawning
ollama-manager-linux-arm64.js  10K    Linux ARM64
ollama-manager-macos-arm.js    10K    Metal acceleration
ollama-manager-macos-intel.js  10K    macOS Intel
ollama-manager-windows-x64.js  10K    Windows x64
ollama-manager-windows-arm64.js 10K   Windows ARM64
```

#### WebUI Manager
```
webui-manager.js               1.5K   Dispatcher
webui-manager-common.js        1K     Shared window utilities
webui-manager-linux-x64.js     15K    Linux x64
webui-manager-linux-arm64.js   16K    Linux ARM64
webui-manager-macos-arm.js     18K    macOS ARM
webui-manager-macos-intel.js   16K    macOS Intel
webui-manager-windows-x64.js   15K    Windows x64
webui-manager-windows-arm64.js 16K    Windows ARM64
```

#### AnythingLLM Manager
```
anythingllm-manager.js         1.5K   Dispatcher
anythingllm-manager-common.js  3.5K   Shared utilities
anythingllm-manager-linux-x64.js  6K  Linux x64
anythingllm-manager-linux-arm64.js 6K Linux ARM64
anythingllm-manager-macos-arm.js  21K macOS ARM (largest - DMG handling)
anythingllm-manager-macos-intel.js 6K macOS Intel
anythingllm-manager-windows-x64.js 4.5K Windows x64
anythingllm-manager-windows-arm64.js 4.5K Windows ARM64
```

#### GPU Detector
```
gpu-detector.js                1.5K   Dispatcher
gpu-detector-common.js         15K    Classification logic, model compatibility
gpu-detector-linux-x64.js      7K     nvidia-smi, lspci detection
gpu-detector-linux-arm64.js    13K    Linux ARM64 (extended detection)
gpu-detector-macos-arm.js      5.5K   system_profiler, Metal
gpu-detector-macos-intel.js    5K     system_profiler
gpu-detector-windows-x64.js    6.5K   WMIC, nvidia-smi
gpu-detector-windows-arm64.js  8K     Windows ARM64
```

#### Path Manager
```
path-manager.js                1.5K   Dispatcher
path-manager-common.js         12K    Shared path utilities
path-manager-linux-x64.js      3.5K   Linux x64 paths
path-manager-linux-arm64.js    4K     Linux ARM64 paths
path-manager-macos-arm.js      5K     macOS ARM paths
path-manager-macos-intel.js    4.5K   macOS Intel paths
path-manager-windows-x64.js    3.5K   Windows x64 paths
path-manager-windows-arm64.js  3.5K   Windows ARM64 paths
```

#### Installation Manager
```
installation-manager.js        1.5K   Dispatcher
installation-manager-common.js 6K     Shared installation utilities
installation-manager-linux-x64.js  7K Linux x64
installation-manager-linux-arm64.js 7K Linux ARM64
installation-manager-macos-arm.js  7K macOS ARM
installation-manager-macos-intel.js 7K macOS Intel
installation-manager-windows-x64.js 5K Windows x64
installation-manager-windows-arm64.js 5K Windows ARM64
```

#### Compile Manager
Builds **Standard Edition** products from Core - Community Edition source.
Copies: `index.html` + `styles-standard.css` + `renderer/*.js`
Does NOT copy: Core - Community Edition files (index-enterprise.html, renderer-enterprise/)

```
compile-manager.js             1.5K   Dispatcher
compile-manager-common.js      20K    Shared compile logic, Standard Edition file copying
compile-manager-linux-x64.js   6.5K   AppImage packaging
compile-manager-linux-arm64.js 6.5K   AppImage packaging
compile-manager-macos-arm.js   6.5K   DMG packaging
compile-manager-macos-intel.js 6K     DMG packaging
compile-manager-windows-x64.js 5.5K   Portable/installer
compile-manager-windows-arm64.js 5.5K Portable/installer
```

### Binary Manager (4 files)
```
binary-manager.js              9.5K   Main dispatcher, version management
binary-download-linux.js       10K    Linux binary download/extraction
binary-download-macos.js       10K    macOS binary download (DMG handling)
binary-download-windows.js     9.5K   Windows binary download
```

### Port Pool (4 files)
```
port-pool.js                   7.5K   Core allocation engine
port-pool-ollama.js            25K    Server + Terminal + Enterprise pools
port-pool-webui.js             4.5K   WebUI ports
port-pool-anythingllm.js       4.5K   AnythingLLM ports
```

### Version Manager (5 files)
```
version-manager.js             3.5K   Entry point, unified API
version-manager-core.js        12K    getCurrentVersion, updateVersion
version-manager-config.js      1.5K   Taggable extensions, skip patterns
version-manager-patterns.js    11K    Regex for JS/HTML/CSS/Python/etc.
version-manager-utils.js       4.5K   Validation, file scanning
```

### Standalone Modules (13 files)
```
ipc-handlers.js                13K    IPC handler registry (90% of handlers)
session-manager.js             12K    SOLE AUTHORITY for sessions
catalog-manager.js             30K    Master catalog CRUD, SKU building
catalog-helper.js              16K    High-level catalog functions
download-manager.js            24K    HTTP downloads, SHA256, progress
blob-mapper.js                 18K    Manifest → blob mapping, integrity
huggingface-api.js             13K    HF config/model info fetching
settings-manager.js            3.5K   Settings persistence (HF token)
license-manager.js             4.5K   License file management
logger.js                      10K    Centralized logging (100KB cap)
error-handler.js               10K    Standardized error responses
ollama-registry.js             4.5K   Ollama registry config fetching
gguf-tools-builder.js          7.5K   llama-gguf-split builder
```

---

## Port Management System

### Port Ranges (v1.1.3)

```
STANDARD POOLS:
┌── OLLAMA SERVER:     52434 - 52443  (10 ports)
┌── OLLAMA TERMINAL:   52450 - 52459  (10 ports)
┌── OPEN WEBUI:        52460 - 52469  (10 ports)
└── ANYTHINGLLM:       52470 - 52479  (10 ports)

ENTERPRISE / MoE POOLS (Future):
┌── AGENTS:            53000 - 62999  (10,000 ports)
┌── COORDINATORS:      63000 - 63499  (500 ports)
└── EXTERNAL I/O:      63500 - 63999  (500 ports)

TOTAL: 11,020 ports available
```

### Port Allocation Flow

```
1. Service requests port via pool module
   └── e.g., PortPoolOllama.getServerPort('Primary Ollama')

2. port-pool.js allocatePort() checks range
   ┌── Validates range boundaries
   ┌── Iterates to find unused port
   └── Records allocation in portsInUse Map

3. Port returned to caller
   └── { port: 52434, owner: 'Primary Ollama', type: 'ollama-server' }

4. On service shutdown
   └── releasePort(port) removes from portsInUse
```

---

## Session Management

### session-manager.js (427 lines)

**SOLE AUTHORITY** for all Ollama, WebUI, and AnythingLLM sessions.

#### Session Lifecycle

```javascript
// 1. Initialize on app start
sessionManager.initialize(__dirname);  // Sets SESSIONS_FILE path
loadSessions();                        // Load from sessions.json
validateSessions();                    // Kill orphans from crashes

// 2. Register new session
registerSession({
  id: 'ollama-server-52434',
  type: 'ollama',
  port: 52434,
  pid: 12345,
  startedAt: Date.now()
});

// 3. Close session
closeSession('ollama-server-52434', portPools);
// - Terminates process
// - Releases port
// - Removes from sessions.json

// 4. App shutdown
closeAllSessions(portPools);
// - Iterates all active sessions
// - Graceful termination
// - Full cleanup
```

#### Session File Structure (sessions.json)

```json
{
  "ollama-server-52434": {
    "id": "ollama-server-52434",
    "type": "ollama",
    "port": 52434,
    "pid": 12345,
    "startedAt": 1704567890123
  },
  "webui-52460": {
    "id": "webui-52460",
    "type": "webui",
    "port": 52460,
    "pid": 12346,
    "startedAt": 1704567895000
  }
}
```

---

## Data Files & Configuration

### Models Directory

| File | Size | Purpose |
|------|------|---------|
| `catalog-master.json` | 190K | Single source of truth for all models |
| `catalog.json` | 190K | Runtime catalog (copy of active SKU) |
| `catalog-sku-001.json` | 34K | Entry Bundle ($49.99) |
| `catalog-sku-002.json` | 49K | Enthusiast Bundle ($89.99) |
| `catalog-sku-003.json` | 51K | Professional Bundle ($149.99) |
| `catalog-sku-004.json` | 15K | Enterprise Bundle ($249.99) |
| `catalog-sku-005.json` | 190K | The VAULT ($449.99) |
| `sku-config.json` | 512B | Current SKU configuration |
| `binary-versions.json` | 1.5K | External binary versions |
| `psf-settings.json` | 512B | Application settings |
| `build-catalogs.js` | 9.5K | Node script for SKU generation |

### Build Scripts

| File | Platform | Purpose |
|------|----------|---------|
| `build-python-webui.sh` | Linux | Creates portable Python venv |
| `build-python-webui.bat` | Windows | Creates portable Python venv |
| `build-python-webui-macos.sh` | macOS | Creates portable Python venv |

### Python Utilities

| File | Purpose |
|------|---------|
| `categorize_licenses.py` | Analyzes licenses for redistribution rules |
| `migrate_catalog.py` | Schema migration (22 new fields) |
| `migrate_catalog_enhanced.py` | Migration + HuggingFace SHA256 fetching |

---

## Model Configuration Pipeline

Per-model configuration using Ollama's native Modelfile format, with registry integration for fetching official parameters.

### Configuration Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MODEL CONFIGURATION FLOW                              │
┌─────────────────────────────────────────────────────────────────────────────¤
│                                                                              │
│  ┌──────────────┐    ┌──────────────────┐    ┌─────────────────────────┐     │
│  │ User clicks  │───▶│  model-config.js │──▶│ Opens Config Modal      │     │
│  │ "Configure"  │    │  (renderer)      │    │ with form fields        │     │
│  └──────────────┘    └──────────────────┘    └───────────┬─────────────┘     │
│                                                          │                   │
│                              ┌───────────────────────────┴───────────┐       │
│                              ▼                                                                ▼       │
│                   ┌─────────────────────┐              ┌─────────────────┐   │
│                   │ Load Saved Config   │              │ Fetch from      │   │
│                   │ (IPC: load-modelfile│              │ Ollama Registry │   │
│                   └──────────┬──────────┘              └────────┬────────┘   │
│                              │                                  │            │
│                              ▼                                                        ▼            │
│                   ┌─────────────────────┐              ┌─────────────────┐   │
│                   │ model-config-       │              │ ollama-registry │   │
│                   │ manager.js          │              │ .js             │   │
│                   │ Reads .Modelfile    │              │ HTTPS to CDN    │   │
│                   └──────────┬──────────┘              └────────┬────────┘   │
│                              │                                  │            │
│                              └──────────────┬───────────────────┘            │
│                                             ▼                                │
│                              ┌──────────────────────────┐                    │
│                              │ Populate Modal Form      │                    │
│                              │ - System Prompt          │                    │
│                              │ - Temperature, Top-P/K   │                    │
│                              │ - Context Length         │                    │
│                              │ - Stop Sequences         │                    │
│                              └──────────────────────────┘                    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Browse & Download Models (Core - Community Edition)

### Navigation Flow
```
User clicks "Browse & Download Models"
    ↓
showScreen('model-browser') [ui-navigation.js:13]
    ↓
loadCatalogBrowser() [catalog-browser.js:39]
    ↓
electronAPI.getMasterCatalog() [preload.js → ipc-handlers.js:91]
    ↓
renderCatalogBrowser() [catalog-browser.js:114]
    ↓
addCatalogBrowserStyles() - Injects CSS overrides for #model-grid
```

### Expanded Model Actions Flow
```
Config Button → openModelConfigFromBrowser() → ModelConfig.open()
Force CPU Toggle → toggleForceCpuFromBrowser() → electronAPI.editModel()
Verify Button → verifyChecksumFromBrowser() → electronAPI.verifyModelChecksum()
Delete File → deleteModelFileFromBrowser() → electronAPI.deleteModel() [file only, not catalog]
Launch → launchFromCatalogBrowser() → launchInOllama()
Download → downloadFromCatalogBrowser() → downloadModel()
```

### Catalog Editor - Build SKU Catalogs Flow
```
User clicks "Build All SKU Catalogs" [package-manager.js:463]
    ↓
Confirmation dialog displayed
    ↓
buildAllSKUCatalogs() [package-manager.js:1366]
    ↓
electronAPI.buildSKUCatalogs() [preload.js:94]
    ↓
'build-sku-catalogs' IPC [ipc-handlers.js:137]
    ↓
catalogManager.buildSKUCatalogs()
    ↓
Generates catalog-sku-001.json through catalog-sku-005.json
```

### State Separation (Critical)
| System | State Object | Container ID | Purpose |
|--------|-------------|--------------|---------|
| Browse & Download | `catalogBrowserState` | `model-grid` | Catalog browsing with file operations |
| MoE/Model Ordering | `modelOrderingState` | `model-ordering-content` | Pipeline building |

These systems are **completely independent** - modifying one does not affect the other.

### Saving Configuration

```
User clicks "Save Modelfile"
         │
               ▼
┌─────────────────────────────┐
│ model-config.js             │
│ buildModelfileFromForm()    │
│ Creates Modelfile text      │
└──────────────┬──────────────┘
               │
                         ▼ IPC: save-modelfile
┌────────────────────────────────┐
│ model-config-manager.js        │
│ saveModelfile()                │
│                                │
│ Saves to:                      │
│ models/{set}/configs/   │
│   {modelId}.Modelfile          │
│   {modelId}.ollama-config.json │
└────────────────────────────────┘
```

### Applying Config at Launch

```
User clicks "Launch in Ollama"
         │
               ▼
┌─────────────────────────────┐
│ model-actions-enterprise.js  │
│ launchInOllama()            │
│ Passes set + modelId │
└──────────────┬──────────────┘
               │
                        ▼ IPC: open-ollama-terminal
┌─────────────────────────────┐
│ main.js                     │
│ Loads config via            │
│ modelConfigManager          │
│ .getModelConfig()           │
└──────────────┬──────────────┘
               │
                        ▼
┌─────────────────────────────┐
│ ollama-manager-{platform}   │
│ openOllamaTerminal()        │
│                             │
│ Appends to terminal URL:    │
│ ?systemPrompt=...           │
│ &temperature=...            │
│ &top_p=...                  │
└──────────────┬──────────────┘
               │
                        ▼
┌─────────────────────────────┐
│ terminal-renderer.js        │
│ Parses URL params           │
│ Applies to Ollama session   │
└─────────────────────────────┘
```

### Key Files

| File | Role |
|------|------|
| `model-config.js` | Renderer - config modal UI, form handling |
| `model-config-manager.js` | Backend - Modelfile storage, path management |
| `ollama-registry.js` | Backend - fetches config from Ollama CDN (follows 307 redirects, parses JSON params) |
| `ipc-handlers.js` | IPC bridge - load-modelfile, save-modelfile, fetch-ollama-config |
| `main.js` | Loads config before opening terminal |
| `terminal-renderer.js` | Applies config to chat session |

### Modelfile Storage

```
models/
└── {set}/
    └── configs/
        ┌── {modelId}.Modelfile           # User's saved config
        └── {modelId}.ollama-config.json  # Cached registry data
```

### Ollama Registry Integration

The "Fetch from Ollama" button retrieves official model configuration:

1. **Manifest fetch**: `https://registry.ollama.ai/v2/library/{model}/manifests/{tag}`
2. **Blob fetch**: Follows HTTP 307 redirects to Cloudflare CDN
3. **Parsing**: Extracts template, params (JSON format), system prompt, license
4. **Caching**: Saves to `.ollama-config.json` for local access

---

## Complete File Inventory

### Entry Points (6 files)
```
start.sh                      1.5K   Linux launcher
start.bat                     1K     Windows launcher
start.command                 1.5K   macOS launcher
RUN_ONCE_MAC_LINUX.sh         1K     Linux/macOS npm install
RUN_ONCE_WINDOWS.bat          1K     Windows npm install
autorun.inf                   512B   Windows autorun config
```

### Electron Core (3 files)
```
main.js                       16K    Main process (471 lines)
preload.js                    8.5K   Context bridge (126 lines)
package.json                  2K     NPM configuration
```

### UI HTML/CSS (7 files)
```
index-enterprise.html          33K    Core - Community Edition (651 lines)
index.html                    12K    Standard Edition UI
index-enterprise.html          31K    Core - Community Edition UI
loading.html                  2K     Loading splash
model-editor.html             16K    Model editor modal (Core - Community Edition)
terminal.html                 8K     Ollama terminal
styles.css                    9.5K   Core - Community Edition stylesheet
styles-standard.css           12K    Standard Edition stylesheet
filter-buttons.css            1K     Filter button styles (Core - Community Edition)
```

### Renderer-Standard (9 files)
```
globals.js                    542B   Global state variables
screen-navigation.js          1.7K   Screen switching
hardware-detect.js            7.6K   Hardware detection
model-browser.js              7.4K   Catalog display
model-actions.js              5.2K   Model launching/deletion
webui-launcher.js             1.6K   WebUI launcher
license-modal.js              2.6K   License modals
utilities.js                  1.6K   Helper functions
delete-data.js                2.1K   Data deletion
```

### Additional Renderer Scripts (2 files)
```
model-editor-renderer.js      21K    Model editor logic
terminal-renderer.js          25K    Terminal xterm.js
```

### Renderer-Enterprise (18 files)
```
ui-modal.js                   7K     Modals, global state
model-config.js               15K    Model configuration
ui-navigation.js              21K    Navigation, model cards
catalog-editor.js             1K     Catalog editor init
package-manager.js            60K    set/model CRUD
version-manager-ui.js         3.5K   Version UI
build-tools.js                2K     Build tools UI
model-actions-enterprise.js    5.5K   Model operations
webui-launchers.js            1K     Launch buttons
utilities-enterprise.js        512B   Helpers
interface-launcher.js         11K    Launch coordination
binary-manager-ui.js          3K     Binary status UI
binary-versions.js            4.5K   Version display
python-webui.js               6K     WebUI build UI
compile-project.js            27K    Compilation UI
license-buttons.js            3K     License viewing
settings-modal.js             12K    Settings modal
blob-mapper-ui.js             14K    Blob visualization
```

### Dispatcher Modules (56 files)
```
7 dispatchers 8 files each = 56 files
┌── ollama-manager (8)
┌── webui-manager (8)
┌── anythingllm-manager (8)
┌── gpu-detector (8)
┌── path-manager (8)
┌── installation-manager (8)
└── compile-manager (8)
```

### Binary Manager (4 files)
```
binary-manager.js             9.5K
binary-download-linux.js      10K
binary-download-macos.js      10K
binary-download-windows.js    9.5K
```

### Port Pool (4 files)
```
port-pool.js                  7.5K
port-pool-ollama.js           25K
port-pool-webui.js            4.5K
port-pool-anythingllm.js      4.5K
```

### Version Manager (5 files)
```
version-manager.js            3.5K
version-manager-core.js       12K
version-manager-config.js     1.5K
version-manager-patterns.js   11K
version-manager-utils.js      4.5K
```

### Standalone Modules (13 files)
```
ipc-handlers.js               13K
session-manager.js            12K
catalog-manager.js            30K
catalog-helper.js             16K
download-manager.js           24K
blob-mapper.js                18K
huggingface-api.js            13K
settings-manager.js           3.5K
license-manager.js            4.5K
logger.js                     10K
error-handler.js              10K
ollama-registry.js            4.5K
gguf-tools-builder.js         7.5K
```

### Data Files (11 files)
```
catalog-master.json           190K
catalog.json                  190K
catalog-sku-001.json          34K
catalog-sku-002.json          49K
catalog-sku-003.json          51K
catalog-sku-004.json          15K
catalog-sku-005.json          190K
sku-config.json               512B
binary-versions.json          1.5K
psf-settings.json             512B
build-catalogs.js             9.5K
```

### Build Scripts (3 files)
```
build-python-webui.sh         5.5K
build-python-webui.bat        4.5K
build-python-webui-macos.sh   5.5K
```

### Python Utilities (3 files)
```
categorize_licenses.py        10K
migrate_catalog.py            9K
migrate_catalog_enhanced.py   14K
```

### Assets (2 files)
```
icon.png                      12K
PSF.png                       8.5K
```

---

## Summary Statistics

| Category | File Count | Notes |
|----------|------------|-------|
| Entry Points | 6 | Platform launchers + setup |
| Electron Core | 3 | main.js, preload.js, package.json |
| UI HTML/CSS | 8 | HTML pages + stylesheets |
| Renderer-Standard | 9 | Standard Edition modules |
| Renderer-Enterprise | 18 | Core - Community Edition modules |
| Additional Renderer | 2 | model-editor, terminal |
| Dispatcher Modules | 56 | 7 x 8 platform implementations |
| Binary Manager | 4 | Download coordination |
| Port Pool | 4 | Port allocation |
| Version Manager | 5 | Version control |
| Standalone Modules | 13 | Core backend logic |
| Data Files | 11 | Catalogs + config |
| Build Scripts | 3 | WebUI builders |
| Python Utilities | 3 | Migration tools |
| Assets | 2 | Images |
| **TOTAL** | **~147 files** | |

---

## 1.0.31b Changes

### Files Removed
| File | Reason |
|------|--------|
| `feature-flags.js` | Orphaned kill switch for unused Ollama Direct Download feature (created 1.0.21b, never imported) |
| `ollama-name-helper.js` | Merged into `model-editor-renderer.js` - functionality preserved with expanded model mappings |

### Files Updated
| File | Change |
|------|--------|
| `model-editor-renderer.js` | Merged 62 model family mappings from ollama-name-helper.js (expanded from 38) |

### Documentation Corrections
- Renderer-Enterprise count corrected: 20 → 18 files (removed non-existent `model-actions-enterprise.js` reference)
- Standalone Modules count corrected: 14 → 13 files

---

*Document generated: January 27, 2026*
*Version: 1.1.3*
*PSF local package set*
