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
  const terminalSessionRegistry = deps.terminalSessionRegistry instanceof Map ? deps.terminalSessionRegistry : new Map();
  const terminalMeshLinks = new Map(); // windowId -> peerWindowId
  const terminalMeshGroupLinks = new Map(); // windowId -> Set(peerWindowId)
  const terminalIdentityLabels = new Map(); // windowId -> editable terminal label

  async function closeTrackedTerminalSession(windowId) {
    const ownerWindowId = Number(windowId || 0);
    if (!ownerWindowId) return false;
    const tracked = terminalSessionRegistry.get(ownerWindowId);
    if (!tracked || !tracked.sessionId) return false;
    const sessionId = String(tracked.sessionId || '').trim();
    if (!sessionId) {
      terminalSessionRegistry.delete(ownerWindowId);
      return false;
    }
    const PortPool = require('../port-pool/port-pool-ollama');
    console.log(`[BMOC] Terminal close requested window=${ownerWindowId} session=${sessionId} backend=${String(tracked.backend || 'unknown')}`);
    try {
      await sessionManager.closeSession(sessionId, { ollama: PortPool });
      console.log(`[BMOC] Terminal close completed window=${ownerWindowId} session=${sessionId}`);
      terminalSessionRegistry.delete(ownerWindowId);
      return true;
    } catch (err) {
      console.warn(`[BMOC] Terminal close failed window=${ownerWindowId} session=${sessionId}: ${err?.message || err}`);
      terminalSessionRegistry.delete(ownerWindowId);
      return false;
    }
  }

  async function closeWindowOwnedTerminalSessions(windowId, backendFilter = 'all') {
    const ownerWindowId = Number(windowId || 0);
    if (!ownerWindowId || !sessionManager?.getActiveSessionsForService) return;
    const sessions = sessionManager.getActiveSessionsForService('terminal') || [];
    if (!Array.isArray(sessions) || sessions.length === 0) return;
    const PortPool = require('../port-pool/port-pool-ollama');
    const normalizedFilter = String(backendFilter || 'all').trim().toLowerCase();
    for (const session of sessions) {
      const sessionId = String(session?.sessionId || '').trim();
      if (!sessionId) continue;
      const backend = String(session?.metadata?.backend || 'ollama').toLowerCase() || 'ollama';
      if (normalizedFilter !== 'all' && backend !== normalizedFilter) continue;
      const owner = Number(session?.metadata?.ownerWindowId || 0);
      if (!owner || owner !== ownerWindowId) continue;
      try {
        await sessionManager.closeSession(sessionId, { ollama: PortPool });
        if (ownerWindowId && terminalSessionRegistry.get(ownerWindowId)?.sessionId === sessionId) {
          terminalSessionRegistry.delete(ownerWindowId);
        }
      } catch (_) {
        // best effort
      }
    }
  }

  async function closeAllTerminalLlamaCppSessions() {
    if (!sessionManager?.getActiveSessionsForService) return;
    const sessions = sessionManager.getActiveSessionsForService('terminal') || [];
    if (!Array.isArray(sessions) || sessions.length === 0) return;
    const PortPool = require('../port-pool/port-pool-ollama');
    for (const session of sessions) {
      const sessionId = String(session?.sessionId || '').trim();
      if (!sessionId) continue;
      if (String(session?.metadata?.backend || '').toLowerCase() !== 'llama-cpp') continue;
      try {
        await sessionManager.closeSession(sessionId, { ollama: PortPool });
      } catch (_) {
        // best effort
      }
    }
  }

  function parseTerminalWindowMeta(win) {
    const fallback = {
      windowId: win?.id || null,
      label: '',
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
      const customLabel = String(terminalIdentityLabels.get(Number(win.id)) || '').trim();
      return {
        windowId: win.id,
        label: customLabel,
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
    for (const [windowId, peers] of terminalMeshGroupLinks.entries()) {
      if (!alive.has(Number(windowId))) {
        terminalMeshGroupLinks.delete(windowId);
        continue;
      }
      const next = new Set();
      for (const peerId of (peers instanceof Set ? peers : new Set())) {
        const value = Number(peerId || 0);
        if (!alive.has(value)) continue;
        if (value === Number(windowId)) continue;
        next.add(value);
      }
      if (next.size > 0) terminalMeshGroupLinks.set(Number(windowId), next);
      else terminalMeshGroupLinks.delete(Number(windowId));
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

  function setGroupLinks(selfWindowId, peerWindowIds = []) {
    const selfId = Number(selfWindowId || 0);
    if (!Number.isFinite(selfId) || selfId <= 0) return;
    const requested = Array.isArray(peerWindowIds)
      ? peerWindowIds.map((v) => Number(v || 0)).filter((v) => Number.isFinite(v) && v > 0 && v !== selfId)
      : [];
    const previous = terminalMeshGroupLinks.get(selfId);
    if (previous instanceof Set) {
      for (const prevPeerId of previous.values()) {
        const peerSet = terminalMeshGroupLinks.get(Number(prevPeerId));
        if (peerSet instanceof Set) {
          peerSet.delete(selfId);
          if (peerSet.size === 0) terminalMeshGroupLinks.delete(Number(prevPeerId));
        }
      }
    }
    if (requested.length === 0) {
      terminalMeshGroupLinks.delete(selfId);
      return;
    }
    const selfSet = new Set();
    for (const peerId of requested) {
      const peerWindow = BrowserWindow.fromId(peerId);
      if (!peerWindow || peerWindow.isDestroyed() || !isTerminalWindow(peerWindow)) continue;
      selfSet.add(peerId);
      const peerSet = terminalMeshGroupLinks.get(peerId) instanceof Set
        ? terminalMeshGroupLinks.get(peerId)
        : new Set();
      peerSet.add(selfId);
      terminalMeshGroupLinks.set(peerId, peerSet);
    }
    if (selfSet.size > 0) terminalMeshGroupLinks.set(selfId, selfSet);
    else terminalMeshGroupLinks.delete(selfId);
  }

  function createPeerLabel(meta) {
    const custom = String(meta?.label || '').trim();
    if (custom) {
      if (meta.port) return `${custom} (Terminal #${meta.windowId} • port ${meta.port})`;
      return `${custom} (Terminal #${meta.windowId})`;
    }
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
    const groupSet = terminalMeshGroupLinks.get(selfId);
    const groupPeerWindowIds = groupSet instanceof Set
      ? Array.from(groupSet.values()).map((v) => Number(v || 0)).filter((v) => peers.some((peer) => peer.windowId === v)).sort((a, b) => a - b)
      : [];
    const selfLabel = String(terminalIdentityLabels.get(selfId) || '').trim();

    return {
      success: true,
      selfWindowId: selfId,
      selfLabel,
      linkedPeerWindowId: validLinkedPeer,
      groupPeerWindowIds,
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

  ipcMain.handle('terminal-link:set-group-peers', async (event, peerWindowIds = []) => {
    const selfWindow = BrowserWindow.fromWebContents(event.sender);
    if (!selfWindow || selfWindow.isDestroyed()) {
      return { success: false, message: 'Terminal window context unavailable.' };
    }
    const selfId = Number(selfWindow.id);
    setGroupLinks(selfId, Array.isArray(peerWindowIds) ? peerWindowIds : []);
    broadcastMeshState();
    return buildMeshState(selfId);
  });

  ipcMain.handle('terminal-link:set-label', async (event, label = '') => {
    const selfWindow = BrowserWindow.fromWebContents(event.sender);
    if (!selfWindow || selfWindow.isDestroyed()) {
      return { success: false, message: 'Terminal window context unavailable.' };
    }
    const selfId = Number(selfWindow.id);
    const normalized = String(label || '').trim().slice(0, 80);
    if (normalized) terminalIdentityLabels.set(selfId, normalized);
    else terminalIdentityLabels.delete(selfId);
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
        speakerRole: String(payload?.speakerRole || 'assistant').trim().toLowerCase() || 'assistant',
        senderLabel: String(payload?.senderLabel || '').trim().slice(0, 80),
        modelName: String(payload?.modelName || '').trim() || null,
        fromWindowId: selfId,
        from: parseTerminalWindowMeta(selfWindow),
        at: new Date().toISOString()
      });
      return { success: true, fromWindowId: selfId, toWindowId: peerId };
    } catch (err) {
      return { success: false, message: err?.message || 'Failed to relay message.' };
    }
  });

  ipcMain.handle('terminal-link:relay-group-message', async (event, payload = {}) => {
    const selfWindow = BrowserWindow.fromWebContents(event.sender);
    if (!selfWindow || selfWindow.isDestroyed()) {
      return { success: false, message: 'Terminal window context unavailable.' };
    }
    const selfId = Number(selfWindow.id);
    const groupSet = terminalMeshGroupLinks.get(selfId);
    if (!(groupSet instanceof Set) || groupSet.size === 0) {
      return { success: false, message: 'No group peers selected.' };
    }
    const text = String(payload?.text || '').trim();
    if (!text) {
      return { success: false, message: 'Empty relay message.' };
    }
    const targets = [];
    for (const peerId of groupSet.values()) {
      const value = Number(peerId || 0);
      if (!value || value === selfId) continue;
      const peerWindow = BrowserWindow.fromId(value);
      if (!peerWindow || peerWindow.isDestroyed() || !isTerminalWindow(peerWindow)) continue;
      targets.push(peerWindow);
    }
    if (targets.length === 0) {
      return { success: false, message: 'Group peers are no longer available.' };
    }
    let delivered = 0;
    for (const peerWindow of targets) {
      try {
        peerWindow.webContents.send('terminal-link:inbound', {
          text,
          kind: 'group',
          speakerRole: String(payload?.speakerRole || 'assistant').trim().toLowerCase() || 'assistant',
          senderLabel: String(payload?.senderLabel || '').trim().slice(0, 80),
          modelName: String(payload?.modelName || '').trim() || null,
          fromWindowId: selfId,
          from: parseTerminalWindowMeta(selfWindow),
          at: new Date().toISOString()
        });
        delivered += 1;
      } catch (_) {
        // best effort
      }
    }
    return { success: delivered > 0, fromWindowId: selfId, delivered };
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
    win.once('closed', async () => {
      await closeTrackedTerminalSession(win.id);
      await closeWindowOwnedTerminalSessions(win.id, 'all');
      if (listTerminalWindows().length === 0) {
        await closeAllTerminalLlamaCppSessions();
      }
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
        win.once('closed', async () => {
          await closeTrackedTerminalSession(win.id);
          await closeWindowOwnedTerminalSessions(win.id, 'all');
          if (listTerminalWindows().length === 0) {
            await closeAllTerminalLlamaCppSessions();
          }
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
