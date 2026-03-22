function registerIpcHandlers() {
  // Theme APIs
  ipcMain.handle('get-theme', async () => {
    const settings = loadSettings();
    return settings.theme || null;
  });
  
  ipcMain.handle('save-theme', async (event, theme) => {
    const settings = loadSettings();
    settings.theme = theme;
    settings.updated_at = new Date().toISOString();
    return saveSettings(settings);
  });
  
  // Settings APIs
  ipcMain.handle('get-settings', async () => {
    return loadSettings();
  });
  
  ipcMain.handle('save-settings', async (event, newSettings) => {
    return saveSettings(newSettings);
  });
  
  // Catalog APIs
  ipcMain.handle('get-catalog', async () => {
    try {
      if (fs.existsSync(catalogPath)) {
        return JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
      }
    } catch (err) {
      console.error('[Catalog] Error loading catalog:', err.message);
    }
    return { collections: {} };
  });
  
  // SKU Config - Standard Edition doesn't use SKUs, return null
  ipcMain.handle('get-sku-config', async () => {
    return null;
  });
  
  // GPU Detection helper - runs nvidia-smi
  async function detectNVIDIAGPUs() {
    const { spawn } = require('child_process');
    const gpus = [];
    
    try {
      const result = await new Promise((resolve, reject) => {
        const nvidia = spawn('nvidia-smi', [
          '--query-gpu=index,name,memory.total,uuid',
          '--format=csv,noheader,nounits'
        ]);
        
        let output = '';
        nvidia.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        nvidia.on('close', (code) => {
          if (code === 0) {
            resolve(output.trim());
          } else {
            reject(new Error('nvidia-smi failed'));
          }
        });
        
        nvidia.stderr.on('data', () => {}); // Ignore stderr
        nvidia.on('error', (err) => reject(err));
      });
      
      const lines = result.split('\n');
      for (const line of lines) {
        const parts = line.split(',').map(s => s.trim());
        if (parts.length >= 4) {
          const gpuIndex = parseInt(parts[0]);
          const gpuName = parts[1];
          const vramMB = parseInt(parts[2]);
          const gpuUUID = parts[3];
          if (vramMB > 0) {
            gpus.push({
              name: gpuName,
              vram: Math.round(vramMB / 1024), // Convert MB to GB
              index: gpuIndex,
              uuid: gpuUUID
            });
          }
        }
      }
    } catch (err) {
      console.log('[GPU Detection] nvidia-smi not available:', err.message);
    }
    
    return gpus;
  }
  
  // Hardware Detection - returns properties expected by hardware-detect.js
  ipcMain.handle('detect-hardware', async () => {
    const os = require('os');
    
    // Try to detect NVIDIA GPUs
    const gpus = await detectNVIDIAGPUs();
    
    // Find GPU with highest VRAM
    let primaryGPU = null;
    if (gpus.length > 0) {
      primaryGPU = gpus.reduce((best, gpu) => (gpu.vram > best.vram) ? gpu : best, gpus[0]);
    }
    
    return {
      platform: os.platform(),
      arch: os.arch(),
      ram_gb: Math.round(os.totalmem() / 1024 / 1024 / 1024),
      cpu_count: os.cpus().length,
      gpu_detected: primaryGPU !== null,
      gpu_vram: primaryGPU ? primaryGPU.vram : 0,
      gpu_name: primaryGPU ? primaryGPU.name : 'Not detected',
      gpu_list: gpus
    };
  });
  
  ipcMain.handle('get-gpu-info', async () => {
    const gpus = await detectNVIDIAGPUs();
    
    if (gpus.length === 0) {
      return {
        detected: false,
        accelerationType: 'cpu',
        displayText: 'CPU Inference',
        gpu_vram: 0,
        message: 'No NVIDIA GPU detected'
      };
    }
    
    // Find GPU with highest VRAM
    const primaryGPU = gpus.reduce((best, gpu) => (gpu.vram > best.vram) ? gpu : best, gpus[0]);
    
    return {
      detected: true,
      accelerationType: 'nvidia',
      displayText: 'GPU Inference',
      name: primaryGPU.name,
      vram: primaryGPU.vram,
      gpu_vram: primaryGPU.vram,
      uuid: primaryGPU.uuid,
      index: primaryGPU.index,
      cudaDeviceIndex: primaryGPU.uuid || primaryGPU.index || 0
    };
  });
  
  // Model compatibility calculation for recommendations
  ipcMain.handle('get-model-compatibility', async (event, model) => {
    const os = require('os');
    const ramGB = Math.round(os.totalmem() / 1024 / 1024 / 1024);
    const modelSizeGB = model.size_mb ? model.size_mb / 1024 : 0;
    
    // Detect GPU for compatibility
    const gpus = await detectNVIDIAGPUs();
    const hasGPU = gpus.length > 0;
    const primaryGPU = hasGPU ? gpus.reduce((best, gpu) => (gpu.vram > best.vram) ? gpu : best, gpus[0]) : null;
    const gpuVRAM = primaryGPU ? primaryGPU.vram : 0;
    
    // Check if model fits in GPU VRAM
    const fitsInVRAM = hasGPU && (modelSizeGB * 1.2) < gpuVRAM; // Model + 20% overhead
    const canRun = fitsInVRAM || (modelSizeGB < (ramGB * 0.8));
    
    return {
      canRun: canRun,
      verdict: fitsInVRAM ? 'gpu_recommended' : (canRun ? 'cpu_recommended' : 'insufficient'),
      message: fitsInVRAM 
        ? `Runs on ${primaryGPU.name} with ${gpuVRAM}GB VRAM`
        : (canRun ? `Runs on CPU with ${ramGB}GB system RAM` : `Model requires more RAM than available`),
      gpu: {
        verdict: fitsInVRAM ? 'good' : 'insufficient',
        max_context: fitsInVRAM ? 8192 : 0,
        message: hasGPU 
          ? (fitsInVRAM ? `${primaryGPU.name} (${gpuVRAM}GB)` : 'Model too large for VRAM')
          : 'No GPU detected'
      },
      cpu: {
        verdict: canRun ? 'good' : 'insufficient',
        max_context: canRun ? 4096 : 0
      }
    };
  });
  
  // ============================================================================
  // BMOC-Lite Session Management (Standard Edition)
  // ============================================================================
  
  // Initialize session manager with app directory
  sessionManager.init(appDir);
  
  // Track terminal windows: windowId -> { sessionId, port, modelName }
  const terminalWindows = new Map();
  const activeOllamaStreams = new Map(); // key: port -> http.ClientRequest
  
  // Launch model in Ollama (creates a NEW Terminal session)
  ipcMain.handle('launch-model-in-ollama', async (event, modelPath, projectorPath, modelId, forceCpu) => {
    try {
      // Start a NEW Terminal session via BMOC-Lite (isolated Ollama instance)
      const result = await sessionManager.startTerminalSession();
      
      if (!result.success) {
        // Check if session limit reached - show user-friendly message
        if (result.limitReached) {
          dialog.showMessageBox(mainWindow, {
            type: 'warning',
            title: 'Session Limit Reached',
            message: result.message,
            detail: 'Each model runs in its own isolated session. Close an existing session to free up resources.',
            buttons: ['OK']
          });
        }
        return result;
      }
      
      const modelName = modelId || path.basename(modelPath, '.gguf');
      console.log('[BMOC-Lite] Terminal session started for model:', modelName);
      console.log('[BMOC-Lite] Session ID:', result.sessionId);
      console.log('[BMOC-Lite] Ollama Port:', result.ollamaPort);
      
      return {
        success: true,
        sessionId: result.sessionId,
        modelName: modelName,
        port: result.ollamaPort,
        message: 'Model session started'
      };
    } catch (err) {
      console.error('[BMOC-Lite] Launch error:', err);
      return { success: false, message: err.message };
    }
  });
  
  // Open PSF Terminal window for Ollama interaction
  ipcMain.handle('open-ollama-terminal', async (event, modelName, vramMB, port, collection, modelId, sessionId) => {
    try {
      // If no sessionId provided, we need to start a new terminal session
      let activeSessionId = sessionId;
      let ollamaPort = port;
      
      if (!activeSessionId) {
        // Start a NEW Terminal session
        const result = await sessionManager.startTerminalSession();
        
        if (!result.success) {
          if (result.limitReached) {
            dialog.showMessageBox(mainWindow, {
              type: 'warning',
              title: 'Session Limit Reached',
              message: result.message,
              detail: 'Maximum 3 concurrent sessions allowed. Close an existing session to start a new one.',
              buttons: ['OK']
            });
          }
          return result;
        }
        
        activeSessionId = result.sessionId;
        ollamaPort = result.ollamaPort;
      }
      
      console.log('[Terminal] Opening PSF Terminal window...');
      console.log('[Terminal] Session:', activeSessionId);
      console.log('[Terminal] Model:', modelName, 'Port:', ollamaPort);
      
      // Get GPU info for terminal display
      const gpus = await detectNVIDIAGPUs();
      let gpuType = 'cpu';
      let gpuName = 'CPU';
      let gpuVram = 0;
      
      if (gpus.length > 0) {
        const primaryGPU = gpus.reduce((best, gpu) => (gpu.vram > best.vram) ? gpu : best, gpus[0]);
        gpuType = 'nvidia';
        gpuName = primaryGPU.name;
        gpuVram = primaryGPU.vram;
        console.log('[Terminal] GPU detected:', gpuName, gpuVram + 'GB');
      }
      
      // Create terminal window
      const terminalBounds = resolveSafeBounds({
        width: 1000,
        height: 700,
        minWidth: 760,
        minHeight: 560
      });
      const terminalWindow = new BrowserWindow({
        ...terminalBounds,
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          contextIsolation: true,
          nodeIntegration: false
        },
        backgroundColor: '#1a1a2e',
        autoHideMenuBar: true,
        title: modelName ? `PSF Terminal - ${modelName}` : 'PSF Terminal'
      });
      
      const windowId = terminalWindow.id;
      
      // Track the window WITH its session ID
      terminalWindows.set(windowId, {
        sessionId: activeSessionId,
        port: ollamaPort,
        modelName: modelName
      });
      
      // Clean up when window closes - KILL THIS SESSION'S OLLAMA
      terminalWindow.on('closed', async () => {
        const windowInfo = terminalWindows.get(windowId);
        console.log('[Terminal] Window', windowId, 'closed');
        
        if (windowInfo && windowInfo.sessionId) {
          console.log('[Terminal] Closing session:', windowInfo.sessionId);
          // BMOC-Lite closes THIS session's Ollama - frees VRAM
          await sessionManager.closeSession(windowInfo.sessionId);
        }
        
        terminalWindows.delete(windowId);
        console.log('[Terminal] Remaining terminal windows:', terminalWindows.size);
      });
      
      // Build URL with parameters including GPU info and session
      let url = `file://${path.join(__dirname, 'src', 'terminal.html')}?port=${ollamaPort}`;
      if (modelName) {
        url += `&model=${encodeURIComponent(modelName)}`;
      }
      url += `&sessionId=${encodeURIComponent(activeSessionId)}`;
      url += `&gpuType=${gpuType}`;
      url += `&gpuName=${encodeURIComponent(gpuName)}`;
      url += `&gpuVram=${gpuVram}`;
      
      terminalWindow.loadURL(url);
      
      console.log('[Terminal] Opened window', windowId, 'session', activeSessionId, 'on port', ollamaPort);
      
      return { success: true, windowId, sessionId: activeSessionId, port: ollamaPort };
    } catch (err) {
      console.error('[Terminal] Error:', err);
      return { success: false, message: err.message };
    }
  });
  
  // ============================================================================
  // Ollama Terminal Communication APIs
  // ============================================================================
  
  // Non-streaming message send (uses /api/chat for OpenAI-style messages)
  ipcMain.handle('ollama-send-message', async (event, modelName, messages, options = {}) => {
    const http = require('http');
    const status = sessionManager.getOllamaStatus();
    const port = options.port || status.port || 52500;
    
    return new Promise((resolve) => {
      const requestBody = {
        model: modelName,
        messages: messages,
        stream: false
      };
      
      // Add options if provided
      const ollamaOptions = {};
      if (options.temperature !== undefined) ollamaOptions.temperature = options.temperature;
      if (options.top_p !== undefined) ollamaOptions.top_p = options.top_p;
      if (options.top_k !== undefined) ollamaOptions.top_k = options.top_k;
      if (options.num_ctx !== undefined) ollamaOptions.num_ctx = options.num_ctx;
      if (options.num_predict !== undefined) ollamaOptions.num_predict = options.num_predict;
      if (Object.keys(ollamaOptions).length > 0) {
        requestBody.options = ollamaOptions;
      }
      
      const postData = JSON.stringify(requestBody);
      
      const req = http.request({
        hostname: '127.0.0.1',
        port: port,
        path: '/api/chat',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve({ success: true, response: json });
          } catch (err) {
            resolve({ success: false, error: 'Failed to parse response' });
          }
        });
      });
      
      req.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
      
      req.write(postData);
      req.end();
    });
  });
  
  // Streaming message send (uses /api/chat with stream:true)
  ipcMain.handle('ollama-send-message-stream', async (event, modelName, messages, options = {}) => {
    const http = require('http');
    const status = sessionManager.getOllamaStatus();
    const port = options.port || status.port || 52500;
    
    console.log('[Ollama Stream] Starting stream to model:', modelName, 'on port:', port);
    
    return new Promise((resolve, reject) => {
      const requestBody = {
        model: modelName,
        messages: messages,
        stream: true
      };
      
      // Add options if provided
