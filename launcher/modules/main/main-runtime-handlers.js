/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
'use strict';

const { BrowserWindow } = require('electron');

function registerRuntimeHandlers(ipcMain, deps = {}) {
  const sessionManager = deps.sessionManager;
  const codingTerminalBackend = deps.codingTerminalBackend;
  const dialog = deps.dialog;
  const getMainWindow = typeof deps.getMainWindow === 'function' ? deps.getMainWindow : () => null;
  const terminalMeshLinks = new Map(); // windowId -> peerWindowId

  function parseTerminalWindowMeta(win) {
    const fallback = {
      windowId: win?.id || null,
      modelName: 'unknown',
      port: null
    };
    if (!win || win.isDestroyed()) return fallback;
    try {
      const raw = String(win.webContents?.getURL?.() || '');
      if (!raw) return fallback;
      const parsed = new URL(raw);
      const modelName = String(parsed.searchParams.get('model') || '').trim() || 'unknown';
      const portRaw = Number(parsed.searchParams.get('port') || 0);
      return {
        windowId: win.id,
        modelName,
        port: Number.isFinite(portRaw) && portRaw > 0 ? portRaw : null
      };
    } catch (_) {
      return fallback;
    }
  }

  function isTerminalWindow(win) {
    if (!win || win.isDestroyed()) return false;
    const raw = String(win.webContents?.getURL?.() || '');
    if (!raw) return false;
    return /[\\/]terminal\.html(?:\?|$)/i.test(raw);
  }

  function listTerminalWindows() {
    return BrowserWindow.getAllWindows().filter((win) => isTerminalWindow(win));
  }

  function pruneTerminalMeshLinks() {
    const alive = new Set(listTerminalWindows().map((win) => Number(win.id)));
    for (const [windowId, peerId] of terminalMeshLinks.entries()) {
      if (!alive.has(Number(windowId)) || !alive.has(Number(peerId))) {
        terminalMeshLinks.delete(windowId);
      }
    }
  }

  function clearLinkFor(windowId) {
    const selfId = Number(windowId || 0);
    if (!Number.isFinite(selfId) || selfId <= 0) return;
    const previousPeer = Number(terminalMeshLinks.get(selfId) || 0);
    terminalMeshLinks.delete(selfId);
    if (previousPeer > 0 && Number(terminalMeshLinks.get(previousPeer) || 0) === selfId) {
      terminalMeshLinks.delete(previousPeer);
    }
  }

  function setBidirectionalLink(selfWindowId, peerWindowId) {
    const selfId = Number(selfWindowId || 0);
    const peerId = Number(peerWindowId || 0);
    if (!Number.isFinite(selfId) || selfId <= 0) return;

    clearLinkFor(selfId);
    if (!Number.isFinite(peerId) || peerId <= 0 || peerId === selfId) {
      return;
    }

    clearLinkFor(peerId);
    terminalMeshLinks.set(selfId, peerId);
    terminalMeshLinks.set(peerId, selfId);
  }

  function createPeerLabel(meta) {
    const suffix = [];
    if (meta.port) suffix.push(`port ${meta.port}`);
    if (meta.modelName && meta.modelName !== 'unknown') suffix.push(meta.modelName);
    if (suffix.length > 0) return `Terminal #${meta.windowId} (${suffix.join(' • ')})`;
    return `Terminal #${meta.windowId}`;
  }

  function buildMeshState(selfWindowId) {
    pruneTerminalMeshLinks();
    const selfId = Number(selfWindowId || 0);
    const windows = listTerminalWindows();
    const peers = [];
    for (const win of windows) {
      if (!win || win.isDestroyed()) continue;
      if (Number(win.id) === selfId) continue;
      const meta = parseTerminalWindowMeta(win);
      peers.push({
        windowId: Number(meta.windowId),
        label: createPeerLabel(meta),
        modelName: meta.modelName || 'unknown',
        port: meta.port || null
      });
    }
    peers.sort((a, b) => a.windowId - b.windowId);

    const linkedPeerWindowId = Number(terminalMeshLinks.get(selfId) || 0);
    const validLinkedPeer = peers.some((peer) => peer.windowId === linkedPeerWindowId)
      ? linkedPeerWindowId
      : null;
    if (linkedPeerWindowId > 0 && !validLinkedPeer) {
      clearLinkFor(selfId);
    }

    return {
      success: true,
      selfWindowId: selfId,
      linkedPeerWindowId: validLinkedPeer,
      peers
    };
  }

  function broadcastMeshState() {
    const windows = listTerminalWindows();
    for (const win of windows) {
      if (!win || win.isDestroyed()) continue;
      try {
        win.webContents.send('terminal-link:state-changed', buildMeshState(win.id));
      } catch (_) {
        // best effort
      }
    }
  }

  ipcMain.handle('terminal-link:list-peers', async (event) => {
    const selfWindow = BrowserWindow.fromWebContents(event.sender);
    if (!selfWindow || selfWindow.isDestroyed()) {
      return { success: false, message: 'Terminal window context unavailable.' };
    }
    return buildMeshState(selfWindow.id);
  });

  ipcMain.handle('terminal-link:set-peer', async (event, peerWindowId = null) => {
    const selfWindow = BrowserWindow.fromWebContents(event.sender);
    if (!selfWindow || selfWindow.isDestroyed()) {
      return { success: false, message: 'Terminal window context unavailable.' };
    }

    const selfId = Number(selfWindow.id);
    const peerId = Number(peerWindowId || 0);
    if (peerId > 0) {
      const peerWindow = BrowserWindow.fromId(peerId);
      if (!peerWindow || peerWindow.isDestroyed() || !isTerminalWindow(peerWindow)) {
        return { success: false, message: 'Selected terminal is no longer available.' };
      }
    }

    setBidirectionalLink(selfId, peerId > 0 ? peerId : null);
    broadcastMeshState();
    return buildMeshState(selfId);
  });

  ipcMain.handle('terminal-link:relay-message', async (event, payload = {}) => {
    const selfWindow = BrowserWindow.fromWebContents(event.sender);
    if (!selfWindow || selfWindow.isDestroyed()) {
      return { success: false, message: 'Terminal window context unavailable.' };
    }
    const selfId = Number(selfWindow.id);
    const peerId = Number(terminalMeshLinks.get(selfId) || 0);
    if (!peerId) {
      return { success: false, message: 'No linked terminal selected.' };
    }
    const peerWindow = BrowserWindow.fromId(peerId);
    if (!peerWindow || peerWindow.isDestroyed() || !isTerminalWindow(peerWindow)) {
      clearLinkFor(selfId);
      broadcastMeshState();
      return { success: false, message: 'Linked terminal is no longer available.' };
    }

    const text = String(payload?.text || '').trim();
    if (!text) {
      return { success: false, message: 'Empty relay message.' };
    }

    try {
      peerWindow.webContents.send('terminal-link:inbound', {
        text,
        fromWindowId: selfId,
        from: parseTerminalWindowMeta(selfWindow),
        at: new Date().toISOString()
      });
      return { success: true, fromWindowId: selfId, toWindowId: peerId };
    } catch (err) {
      return { success: false, message: err?.message || 'Failed to relay message.' };
    }
  });

  ipcMain.handle('gpu-monitor-start', (event) => {
    return sessionManager.startGpuMonitor((gpuData) => {
      BrowserWindow.getAllWindows().forEach((win) => {
        try {
          if (!win.isDestroyed()) win.webContents.send('gpu-monitor-data', gpuData);
        } catch (err) {
          console.warn('[GPU Monitor] Could not send data to window:', err.message);
        }
      });
    });
  });

  ipcMain.handle('gpu-monitor-stop', () => sessionManager.stopGpuMonitor());

  ipcMain.handle('coding-terminal:open', async (event, options = {}) => {
    try {
      const mergedOptions = { docked: false, ...options };
      const instance = codingTerminalBackend.openTerminal(mergedOptions);
      return { success: !!instance, state: codingTerminalBackend.getState() };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('coding-terminal:close', async () => {
    try {
      codingTerminalBackend.closeTerminal();
      return { success: true, state: codingTerminalBackend.getState() };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('coding-terminal:toggle-dock', async () => {
    try {
      const docked = codingTerminalBackend.toggleDock();
      return { success: true, docked, state: codingTerminalBackend.getState() };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('coding-terminal:get-state', async () => codingTerminalBackend.getState());

  ipcMain.handle('coding-terminal:select-project-folder', async (event) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender) || getMainWindow();
    if (parentWindow && !parentWindow.isDestroyed()) {
      if (parentWindow.isMinimized()) parentWindow.restore();
      parentWindow.focus();
    }
    const result = await dialog.showOpenDialog(parentWindow, {
      title: 'Select Project Folder for Coding Terminal',
      modal: true,
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }
    return { success: true, path: result.filePaths[0] };
  });

  // Keep mesh state clean if terminal windows are closed.
  for (const win of BrowserWindow.getAllWindows()) {
    if (!isTerminalWindow(win)) continue;
    win.once('closed', () => {
      clearLinkFor(win.id);
      broadcastMeshState();
    });
  }

  // Attach close listeners for future windows as they become terminal windows.
  appOnBrowserWindowCreated();

  function appOnBrowserWindowCreated() {
    const { app } = require('electron');
    app.on('browser-window-created', (_event, win) => {
      if (!win || win.isDestroyed()) return;
      const attach = () => {
        if (!isTerminalWindow(win)) return;
        win.once('closed', () => {
          clearLinkFor(win.id);
          broadcastMeshState();
        });
      };
      if (win.webContents.isLoading()) {
        win.webContents.once('did-finish-load', attach);
      } else {
        attach();
      }
    });
  }
}

module.exports = {
  registerRuntimeHandlers
};
