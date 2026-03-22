/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const http = require('http');

function createCommonChatApi(deps = {}) {
  const getPlatformModule = deps.getPlatformModule;
  const activeStreamRequests = new Map();

  async function checkOllamaRunning(port) {
    if (!port) return false;

    try {
      return await new Promise((resolve) => {
        const req = http.get(`http://localhost:${port}/api/tags`, (res) => {
          resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(2000, () => {
          req.destroy();
          resolve(false);
        });
      });
    } catch (_) {
      return false;
    }
  }

  async function sendMessage(modelName, messages, options = {}) {
    return new Promise((resolve, reject) => {
      const requestBody = {
        model: modelName,
        messages,
        stream: false
      };
      if (options.keep_alive !== undefined) requestBody.keep_alive = options.keep_alive;

      const ollamaOptions = {};
      if (options.temperature !== undefined) ollamaOptions.temperature = options.temperature;
      if (options.top_p !== undefined) ollamaOptions.top_p = options.top_p;
      if (options.top_k !== undefined) ollamaOptions.top_k = options.top_k;
      if (options.num_ctx !== undefined) ollamaOptions.num_ctx = options.num_ctx;
      if (options.num_predict !== undefined) ollamaOptions.num_predict = options.num_predict;
      if (options.repeat_penalty !== undefined) ollamaOptions.repeat_penalty = options.repeat_penalty;
      if (options.seed !== undefined) ollamaOptions.seed = options.seed;
      if (options.stop !== undefined) ollamaOptions.stop = options.stop;
      if (Object.keys(ollamaOptions).length > 0) requestBody.options = ollamaOptions;

      const port = options.port || getPlatformModule().getPSFOllamaPort() || 52434;
      const postData = JSON.stringify(requestBody);

      const req = http.request({
        hostname: 'localhost',
        port,
        path: '/api/chat',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({ success: true, response: JSON.parse(data) });
          } catch (err) {
            reject({ success: false, message: 'Failed to parse response', error: err.message });
          }
        });
      });

      req.on('error', (err) => {
        reject({ success: false, message: 'Failed to connect to Ollama', error: err.message });
      });

      req.write(postData);
      req.end();
    });
  }

  async function sendMessageStream(modelName, messages, options = {}) {
    return new Promise((resolve, reject) => {
      const ollamaOptions = {};
      if (options.temperature !== undefined) ollamaOptions.temperature = options.temperature;
      if (options.top_p !== undefined) ollamaOptions.top_p = options.top_p;
      if (options.top_k !== undefined) ollamaOptions.top_k = options.top_k;
      if (options.num_ctx !== undefined) ollamaOptions.num_ctx = options.num_ctx;
      if (options.num_predict !== undefined) ollamaOptions.num_predict = options.num_predict;
      if (options.repeat_penalty !== undefined) ollamaOptions.repeat_penalty = options.repeat_penalty;
      if (options.seed !== undefined) ollamaOptions.seed = options.seed;
      if (options.stop !== undefined) ollamaOptions.stop = options.stop;

      const requestBody = {
        model: modelName,
        messages,
        stream: true
      };
      if (options.keep_alive !== undefined) requestBody.keep_alive = options.keep_alive;
      if (Object.keys(ollamaOptions).length > 0) requestBody.options = ollamaOptions;

      const postData = JSON.stringify(requestBody);
      const port = options.port || getPlatformModule().getPSFOllamaPort() || 52434;

      const req = http.request({
        hostname: 'localhost',
        port,
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
              data.port = port;

              const allWindows = getPlatformModule().getAllTerminalWindows
                ? getPlatformModule().getAllTerminalWindows()
                : [];

              if (allWindows.length > 0) {
                for (const win of allWindows) {
                  if (win && !win.isDestroyed()) {
                    win.webContents.send('ollama-stream-data', data);
                  }
                }
              } else {
                const terminalWindow = getPlatformModule().getTerminalWindow();
                if (terminalWindow && !terminalWindow.isDestroyed()) {
                  terminalWindow.webContents.send('ollama-stream-data', data);
                }
              }
            } catch (err) {
              console.error('[Ollama Common] Failed to parse streaming chunk:', err);
            }
          }
        });

        res.on('end', () => {
          const tail = String(streamBuffer || '').trim();
          if (tail) {
            try {
              const data = JSON.parse(tail);
              data.port = port;
              const allWindows = getPlatformModule().getAllTerminalWindows
                ? getPlatformModule().getAllTerminalWindows()
                : [];
              if (allWindows.length > 0) {
                for (const win of allWindows) {
                  if (win && !win.isDestroyed()) {
                    win.webContents.send('ollama-stream-data', data);
                  }
                }
              } else {
                const terminalWindow = getPlatformModule().getTerminalWindow();
                if (terminalWindow && !terminalWindow.isDestroyed()) {
                  terminalWindow.webContents.send('ollama-stream-data', data);
                }
              }
            } catch (err) {
              console.error('[Ollama Common] Failed to parse stream tail chunk:', err);
            }
          }
          activeStreamRequests.delete(String(port));
          resolve({ success: true, message: 'Stream completed' });
        });
      });

      req.on('error', (err) => {
        activeStreamRequests.delete(String(port));
        reject({ success: false, message: 'Failed to connect to Ollama', error: err.message });
      });

      activeStreamRequests.set(String(port), req);
      req.write(postData);
      req.end();
    });
  }

  async function listModels(options = {}) {
    return new Promise((resolve, reject) => {
      const port = options.port || getPlatformModule().getPSFOllamaPort() || 52434;

      const req = http.request({
        hostname: 'localhost',
        port,
        path: '/api/tags',
        method: 'GET'
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            resolve({ success: true, models: response.models || [] });
          } catch (err) {
            reject({ success: false, message: 'Failed to parse models list', error: err.message });
          }
        });
      });

      req.on('error', (err) => {
        reject({ success: false, message: 'Failed to connect to Ollama', error: err.message });
      });

      req.end();
    });
  }

  function stopMessageStream(options = {}) {
    const port = String(options.port || '').trim();
    if (!port) return { success: false, message: 'Port is required to stop stream.' };
    const req = activeStreamRequests.get(port);
    if (!req) return { success: false, message: `No active stream for port ${port}.` };

    try {
      req.destroy(new Error('stream aborted by user'));
      activeStreamRequests.delete(port);
      return { success: true, message: `Stopped stream on port ${port}.` };
    } catch (err) {
      return { success: false, message: err.message || String(err) };
    }
  }

  return {
    checkOllamaRunning,
    sendMessage,
    sendMessageStream,
    stopMessageStream,
    listModels
  };
}

module.exports = createCommonChatApi;
