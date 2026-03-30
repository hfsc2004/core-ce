/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
function createLoadingWindow(BrowserWindow, { sessionId, initialStatus }) {
  let loadingWindow = new BrowserWindow({
    width: 450,
    height: 300,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });

  const loadingHTML = `<!DOCTYPE html><html><head><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
      color: #00ffff;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      height: 100vh; border-radius: 15px; border: 2px solid #00ffff;
      -webkit-app-region: drag;
    }
    .logo { font-size: 28px; font-weight: bold; margin-bottom: 10px; text-shadow: 0 0 10px #00ffff; }
    .spinner { width: 60px; height: 60px; border: 4px solid rgba(0,255,255,0.2); border-top: 4px solid #00ffff; border-radius: 50%; animation: spin 1s linear infinite; margin: 20px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .status { font-size: 16px; color: #fff; }
    .substatus { font-size: 12px; color: #888; margin-top: 5px; }
  </style></head><body>
    <div class="logo">Pseudo Science Fiction</div>
    <div class="spinner"></div>
    <div class="status" id="status">${initialStatus}</div>
    <div class="substatus" id="substatus">Session: ${sessionId}</div>
  </body></html>`;

  loadingWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(loadingHTML));

  return {
    updateStatus(status) {
      if (loadingWindow && !loadingWindow.isDestroyed()) {
        loadingWindow.webContents
          .executeJavaScript(`document.getElementById('status').innerText=${JSON.stringify(status)};`)
          .catch(() => {});
      }
    },
    close() {
      if (loadingWindow && !loadingWindow.isDestroyed()) {
        loadingWindow.close();
      }
      loadingWindow = null;
    }
  };
}

module.exports = {
  createLoadingWindow
};
