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
        let streamBuffer = '';
        res.on('data', (chunk) => {
          streamBuffer += chunk.toString('utf8');
          const lines = streamBuffer.split('\n');
          streamBuffer = lines.pop() || '';
          for (const rawLine of lines) {
            const line = String(rawLine || '').trim();
            if (!line) continue;
            try {
              const data = JSON.parse(line);
              data.port = port;  // Include port so terminal can filter
              event.sender.send('ollama-stream-data', data);
            } catch (err) {
              // Skip malformed chunks
            }
          }
        });
        
        res.on('end', () => {
          const tail = String(streamBuffer || '').trim();
          if (tail) {
            try {
              const data = JSON.parse(tail);
              data.port = port;
              event.sender.send('ollama-stream-data', data);
            } catch (_) {}
          }
          console.log('[Ollama Stream] Stream completed');
          activeOllamaStreams.delete(String(port));
          resolve({ success: true, message: 'Stream completed' });
        });
      });
      
      req.on('error', (err) => {
        console.error('[Ollama Stream] Error:', err.message);
        activeOllamaStreams.delete(String(port));
        event.sender.send('ollama-stream-data', { error: err.message, done: true });
        reject({ success: false, message: 'Failed to connect to Ollama', error: err.message });
      });
      
      activeOllamaStreams.set(String(port), req);
      req.write(postData);
      req.end();
    });
  });

  ipcMain.handle('ollama-stop-stream', async (event, options = {}) => {
    const port = String(options?.port || '').trim();
    if (!port) {
      return { success: false, message: 'Port is required to stop stream.' };
    }
    const req = activeOllamaStreams.get(port);
    if (!req) {
      return { success: false, message: 'No active stream for port ' + port + '.' };
    }
    try {
      req.destroy(new Error('stream aborted by user'));
      activeOllamaStreams.delete(port);
      return { success: true, message: 'Stopped stream on port ' + port + '.' };
    } catch (err) {
      return { success: false, message: err.message || String(err) };
    }
  });
  
  // List models from Ollama
  ipcMain.handle('ollama-list-models', async (event, options) => {
    const http = require('http');
    const status = sessionManager.getOllamaStatus();
    const port = options?.port || status.port || 52500;
    
    return new Promise((resolve) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: port,
        path: '/api/tags',
        method: 'GET'
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve({ success: true, models: json.models || [] });
          } catch (err) {
            resolve({ success: false, models: [], error: 'Failed to parse response' });
          }
        });
      });
      
      req.on('error', (err) => {
        resolve({ success: false, models: [], error: err.message });
      });
      
      req.end();
    });
  });
  
  // Start Open WebUI (creates a NEW WebUI session with its OWN Ollama)
  ipcMain.handle('start-webui', async () => {
    try {
      const result = await sessionManager.startWebUISession();
      
      if (!result.success && result.limitReached) {
        dialog.showMessageBox(mainWindow, {
          type: 'warning',
          title: 'Session Limit Reached',
          message: result.message,
          detail: 'Maximum 3 concurrent sessions allowed. Close an existing session to start Open WebUI.',
          buttons: ['OK']
        });
      }
      
      return result;
    } catch (err) {
      return { success: false, message: err.message };
    }
  });
  
  // Stop Open WebUI (closes the first WebUI session found)
  ipcMain.handle('stop-webui', async () => {
    const webuiSessions = sessionManager.getSessionsByType('webui');
    if (webuiSessions.length > 0) {
      return await sessionManager.closeWebUISession(webuiSessions[0].sessionId);
    }
    return { success: true, message: 'No WebUI sessions to stop' };
  });
  
  // Start AnythingLLM (creates a NEW AnythingLLM session with its OWN Ollama)
  ipcMain.handle('start-anythingllm', async () => {
    try {
      const result = await sessionManager.startAnythingLLMSession();
      
      if (!result.success && result.limitReached) {
        dialog.showMessageBox(mainWindow, {
          type: 'warning',
          title: 'Session Limit Reached',
          message: result.message,
          detail: 'Maximum 3 concurrent sessions allowed. Close an existing session to start AnythingLLM.',
          buttons: ['OK']
        });
      }
      
      return result;
    } catch (err) {
      return { success: false, message: err.message };
    }
  });
  
  // Stop AnythingLLM (closes the first AnythingLLM session found)
  ipcMain.handle('stop-anythingllm', async () => {
    const sessions = sessionManager.getSessionsByType('anythingllm');
    if (sessions.length > 0) {
      return await sessionManager.closeAnythingLLMSession(sessions[0].sessionId);
    }
    return { success: true, message: 'No AnythingLLM sessions to stop' };
  });
  
  // Close a specific session by ID
  ipcMain.handle('close-session', async (event, sessionId) => {
    return await sessionManager.closeSession(sessionId);
  });
  
  // Force stop all services (Good House Guest - nuclear option)
  ipcMain.handle('shutdown-all', async () => {
    try {
      await sessionManager.shutdownAll();
      return { success: true, message: 'All services stopped' };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });
  
  // Get session status
  ipcMain.handle('get-session-status', async () => {
    return sessionManager.getAllStatus();
  });
  
  // File existence check
  ipcMain.handle('check-file-exists', async (event, filepath) => {
    try {
      const fullPath = path.join(modelsDir, filepath);
      return fs.existsSync(fullPath);
    } catch (err) {
      return false;
    }
  });
  
  // External URL opening
  ipcMain.handle('open-url', async (event, url) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  
  // License file reading
  ipcMain.handle('get-license-files', async () => {
    try {
      const licensesDir = path.join(appDir, '..', '..', 'licenses');
      if (fs.existsSync(licensesDir)) {
        return fs.readdirSync(licensesDir).filter(f => f.endsWith('.txt'));
      }
    } catch (err) {
      console.error('[Licenses] Error listing licenses:', err.message);
    }
    return [];
  });
  
  ipcMain.handle('get-license-content', async (event, filename) => {
    try {
      const licensePath = path.join(appDir, '..', '..', 'licenses', filename);
      if (fs.existsSync(licensePath)) {
        return fs.readFileSync(licensePath, 'utf-8');
      }
    } catch (err) {
      console.error('[Licenses] Error reading license:', err.message);
    }
    return 'License file not found.';
  });
  
  // Confirm dialog (for delete operations)
  ipcMain.handle('show-confirm-dialog', async (event, options) => {
    const result = await dialog.showMessageBox(mainWindow, {
      type: options.type || 'question',
      title: options.title || 'Confirm',
      message: options.message || 'Are you sure?',
      buttons: options.buttons || ['Cancel', 'OK'],
      defaultId: options.defaultId || 0,
      cancelId: options.cancelId || 0
    });
    return { response: result.response };
  });
  
  console.log('[IPC] Registered Standard Edition handlers');
}
