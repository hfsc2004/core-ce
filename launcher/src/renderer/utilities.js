/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
// ============================================================================
// PSF CORE COMMUNITY EDITION
// Renderer - Utility Functions
// ============================================================================
// Shared by both Standard and Community Editions
// ============================================================================

function openDocs(file) {
  showDocViewer(file);
}

async function openExternal(url) {
  await window.electronAPI.openURL(url);
}

/**
 * Escape HTML characters to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Format bytes as human readable string
 */
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Format speed as human readable string
 */
function formatSpeed(bytesPerSecond) {
  if (bytesPerSecond === 0) return '0 B/s';
  
  const k = 1024;
  const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  
  const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
  
  return parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function showDocViewer(requestedPath) {
  const pathRaw = String(requestedPath || '').trim();
  if (!pathRaw) return;

  const overlayId = 'doc-viewer-modal';
  const existing = document.getElementById(overlayId);
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = overlayId;
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'background:rgba(0,0,0,0.65)',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'z-index:20000'
  ].join(';');

  const panel = document.createElement('div');
  panel.style.cssText = [
    'width:min(1000px,92vw)',
    'height:min(80vh,760px)',
    'background:#111827',
    'border:1px solid rgba(255,255,255,0.15)',
    'border-radius:10px',
    'display:flex',
    'flex-direction:column',
    'overflow:hidden'
  ].join(';');

  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.12);background:#0f172a;">
      <strong style="color:#e5e7eb;font-size:13px;">${escapeHtml(pathRaw)}</strong>
      <button id="doc-viewer-close" class="btn-secondary">Close</button>
    </div>
    <div id="doc-viewer-body" style="padding:12px;overflow:auto;flex:1;color:#d1d5db;font-family:monospace;font-size:13px;white-space:pre-wrap;">Loading...</div>
  `;

  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  panel.querySelector('#doc-viewer-close').addEventListener('click', () => overlay.remove());

  try {
    const res = await window.electronAPI.getDocContent(pathRaw);
    const body = panel.querySelector('#doc-viewer-body');
    if (!res?.success) {
      body.innerHTML = `<div style="color:#fca5a5;">${escapeHtml(res?.message || 'Failed to load document')}</div>`;
      return;
    }

    if (res.isDirectory) {
      const rows = (res.entries || []).map((e) => {
        const icon = e.isDirectory ? '📁' : '📄';
        return `<div style="padding:4px 0;"><a href="#" data-doc-path="${escapeHtml(e.path)}" style="color:#93c5fd;text-decoration:none;">${icon} ${escapeHtml(e.path)}</a></div>`;
      }).join('') || '<div style="color:#9ca3af;">(empty directory)</div>';
      body.innerHTML = rows;
      body.querySelectorAll('[data-doc-path]').forEach((a) => {
        a.addEventListener('click', async (evt) => {
          evt.preventDefault();
          const nextPath = a.getAttribute('data-doc-path');
          overlay.remove();
          await showDocViewer(nextPath);
        });
      });
      return;
    }

    const content = String(res.content || '');
    const isMarkdown = /\.md$/i.test(pathRaw);
    if (isMarkdown && window.marked && typeof window.marked.parse === 'function') {
      body.style.whiteSpace = 'normal';
      body.style.fontFamily = 'system-ui, sans-serif';
      body.innerHTML = `<article style="line-height:1.5;">${window.marked.parse(content)}</article>`;
    } else {
      body.textContent = content;
    }
  } catch (err) {
    const body = panel.querySelector('#doc-viewer-body');
    body.innerHTML = `<div style="color:#fca5a5;">${escapeHtml(err.message || String(err))}</div>`;
  }
}

// ============================================================================
