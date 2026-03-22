/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const fs = require('fs');
const path = require('path');
const { app, dialog, BrowserWindow } = require('electron');
const LAST_DIR_SETTINGS_PATH = ['uiState', 'fileDialogs', 'terminalExportLastDir'];

function sanitizeBaseName(input) {
  let name = String(input || '').trim();
  if (!name) return 'terminal-export';
  name = name
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return name || 'terminal-export';
}

function normalizeFormat(input) {
  const v = String(input || '').trim().toLowerCase();
  if (v === 'md' || v === 'txt' || v === 'html' || v === 'pdf') return v;
  return 'md';
}

function ensureExt(filePath, ext) {
  const expected = `.${ext}`;
  if (String(filePath || '').toLowerCase().endsWith(expected)) return filePath;
  return `${filePath}${expected}`;
}

function readNestedString(root, pathParts) {
  let current = root;
  for (const part of pathParts) {
    if (!current || typeof current !== 'object') return '';
    current = current[part];
  }
  return String(current || '').trim();
}

async function loadLastExportDir(ctx) {
  try {
    if (!ctx || !ctx.settingsManager || typeof ctx.settingsManager.getSettings !== 'function') return '';
    const settings = await ctx.settingsManager.getSettings(ctx.appDir);
    const candidate = readNestedString(settings, LAST_DIR_SETTINGS_PATH);
    if (!candidate) return '';
    return fs.existsSync(candidate) ? candidate : '';
  } catch (_) {
    return '';
  }
}

async function saveLastExportDir(ctx, dirPath) {
  try {
    const value = String(dirPath || '').trim();
    if (!value) return;
    if (!ctx || !ctx.settingsManager) return;
    if (typeof ctx.settingsManager.getSettings !== 'function') return;
    if (typeof ctx.settingsManager.saveSettings !== 'function') return;
    const settings = await ctx.settingsManager.getSettings(ctx.appDir);
    const next = (settings && typeof settings === 'object') ? { ...settings } : {};
    next.uiState = (next.uiState && typeof next.uiState === 'object') ? { ...next.uiState } : {};
    next.uiState.fileDialogs = (next.uiState.fileDialogs && typeof next.uiState.fileDialogs === 'object')
      ? { ...next.uiState.fileDialogs }
      : {};
    next.uiState.fileDialogs.terminalExportLastDir = value;
    await ctx.settingsManager.saveSettings(ctx.appDir, next);
  } catch (_) {
    // best-effort persistence only
  }
}

async function exportPdf(html, outputPath, parentWindow) {
  const win = new BrowserWindow({
    show: false,
    parent: parentWindow || null,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });

  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(String(html || ''))}`);
    const pdfData = await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true
    });
    fs.writeFileSync(outputPath, pdfData);
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

function createTerminalExportHandlers() {
  return {
    'terminal:export-block': async (_ctx, event, payload = {}) => {
      const format = normalizeFormat(payload.format);
      const baseName = sanitizeBaseName(payload.suggestedName);
      const parentWindow = BrowserWindow.fromWebContents(event.sender) || null;
      const downloadsDir = app.getPath('downloads');
      const lastDir = await loadLastExportDir(_ctx);
      const baseDir = lastDir || downloadsDir;
      const defaultPath = path.join(baseDir, `${baseName}.${format}`);

      const filters = [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'Text', extensions: ['txt'] },
        { name: 'HTML', extensions: ['html'] },
        { name: 'PDF', extensions: ['pdf'] }
      ];

      const save = await dialog.showSaveDialog(parentWindow, {
        title: 'Export Terminal Block',
        defaultPath,
        filters,
        properties: ['createDirectory', 'showOverwriteConfirmation']
      });

      if (save.canceled || !save.filePath) {
        return { success: false, canceled: true };
      }

      const filePath = ensureExt(save.filePath, format);
      await saveLastExportDir(_ctx, path.dirname(filePath));

      if (format === 'pdf') {
        await exportPdf(payload.html || payload.htmlDocument || '', filePath, parentWindow);
      } else if (format === 'html') {
        fs.writeFileSync(filePath, String(payload.html || payload.htmlDocument || ''), 'utf8');
      } else if (format === 'txt') {
        fs.writeFileSync(filePath, String(payload.text || ''), 'utf8');
      } else {
        fs.writeFileSync(filePath, String(payload.markdown || ''), 'utf8');
      }

      return { success: true, path: filePath, format };
    }
  };
}

module.exports = { createTerminalExportHandlers };
