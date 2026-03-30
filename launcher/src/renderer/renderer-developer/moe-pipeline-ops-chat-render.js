/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
(function() {
  'use strict';

  function openMoeDryRunPreviewModal(previewText, deps = {}) {
    const escapeHtml = typeof deps.escapeHtml === 'function' ? deps.escapeHtml : (v => String(v || ''));
    return new Promise((resolve) => {
      const existing = document.getElementById('moe-dryrun-modal-overlay');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'moe-dryrun-modal-overlay';
      overlay.style.cssText = [
        'position:fixed',
        'inset:0',
        'background:rgba(0,0,0,0.72)',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'z-index:20050'
      ].join(';');

      const panel = document.createElement('div');
      panel.style.cssText = [
        'width:min(980px,92vw)',
        'height:min(78vh,760px)',
        'background:#111827',
        'border:1px solid rgba(255,255,255,0.2)',
        'border-radius:10px',
        'display:flex',
        'flex-direction:column',
        'overflow:hidden'
      ].join(';');

      panel.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.15);background:#0f172a;">
          <strong style="color:#e5e7eb;font-size:13px;">IRG Dry Run Preview (Live execution requires confirmation)</strong>
        </div>
        <div style="padding:12px;overflow:auto;flex:1;background:#0b1220;">
          <pre style="margin:0;white-space:pre-wrap;word-break:break-word;color:#d1d5db;font-family:Consolas,Monaco,'Courier New',monospace;font-size:12px;line-height:1.45;">${escapeHtml(String(previewText || '').trim() || '(no preview output)')}</pre>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:10px;padding:12px;border-top:1px solid rgba(255,255,255,0.12);background:#0f172a;">
          <button id="moe-dryrun-cancel" style="padding:8px 12px;background:rgba(255,255,255,0.08);border:1px solid #666;border-radius:6px;color:#ddd;cursor:pointer;">Cancel</button>
          <button id="moe-dryrun-confirm" style="padding:8px 12px;background:rgba(0,255,136,0.18);border:1px solid #00ff88;border-radius:6px;color:#00ff88;cursor:pointer;font-weight:bold;">Execute Live</button>
        </div>
      `;

      overlay.appendChild(panel);
      document.body.appendChild(overlay);

      const close = (approved) => {
        overlay.remove();
        resolve(approved === true);
      };

      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) close(false);
      });
      panel.querySelector('#moe-dryrun-cancel')?.addEventListener('click', () => close(false));
      panel.querySelector('#moe-dryrun-confirm')?.addEventListener('click', () => close(true));
    });
  }

  function formatPipelineChatContent(text, options = {}, deps = {}) {
    const escapeHtml = typeof deps.escapeHtml === 'function' ? deps.escapeHtml : (v => String(v || ''));
    const maxLength = Number.isInteger(options.maxLength) ? options.maxLength : 2400;
    let raw = String(text || '');
    if (raw.length > maxLength) {
      raw = `${raw.slice(0, maxLength)}...`;
    }
    if (!raw.includes('\n') && /\\n/.test(raw)) {
      raw = raw.replace(/\\n/g, '\n');
    }
    const normalized = raw.replace(/\r\n/g, '\n');
    const blocks = [];
    const withPlaceholders = normalized.replace(/(```|~~~)([^\n]*)\n([\s\S]*?)\1/g, (_match, _fence, lang, code) => {
      const id = blocks.length;
      blocks.push({
        lang: String(lang || '').trim(),
        code: String(code || '')
      });
      return `\u0000CODEBLOCK_${id}\u0000`;
    });

    let html = escapeHtml(withPlaceholders).replace(/\n/g, '<br>');
    html = html.replace(/\u0000CODEBLOCK_(\d+)\u0000/g, (_token, idxText) => {
      const idx = Number(idxText);
      const block = blocks[idx];
      if (!block) return '';
      const langLabel = block.lang ? `<div style="color:#9aa; font-size:11px; margin-bottom:6px;">${escapeHtml(block.lang)}</div>` : '';
      return [
        '<div style="margin:8px 0; background:rgba(0,0,0,0.35); border:1px solid #3a3a3a; border-radius:6px; padding:8px;">',
        langLabel,
        `<pre style="margin:0; white-space:pre-wrap; word-break:break-word; color:#d1d5db; font-family:Consolas,Monaco,'Courier New',monospace; font-size:12px; line-height:1.45;">${escapeHtml(block.code)}</pre>`,
        '</div>'
      ].join('');
    });
    return html;
  }

  function buildInlineRouteTrace(meta, deps = {}) {
    const escapeHtml = typeof deps.escapeHtml === 'function' ? deps.escapeHtml : (v => String(v || ''));
    if (!meta || typeof meta !== 'object') return '';
    const route = meta.route && typeof meta.route === 'object' ? meta.route : null;
    if (!route) return '';
    const mode = String(route.mode || 'sequential');
    const target = String(route.target || 'next');
    const reason = String(route.reason || '').trim();
    const rlm = meta.rlmAssistApplied === true ? ' on' : ' off';
    const ctxChars = Number(meta.rlmAssistContextChars || 0);
    const ctxNote = ctxChars > 0 ? ` ctx=${ctxChars}` : '';
    return `
      <div style="margin:4px 0 8px 0; color:#9aa; font-size:11px; line-height:1.35;">
        Route Trace: mode=${escapeHtml(mode)} target=${escapeHtml(target)} rlm=${escapeHtml(rlm)}${escapeHtml(ctxNote)}${reason ? ` reason=${escapeHtml(reason)}` : ''}
      </div>
    `;
  }

  function buildInlineHandoffDetails(meta, deps = {}) {
    const escapeHtml = typeof deps.escapeHtml === 'function' ? deps.escapeHtml : (v => String(v || ''));
    if (!meta || typeof meta !== 'object') return '';
    const input = String(meta.input || '').trim();
    if (!input) return '';
    return `
      <details style="margin-top:8px;">
        <summary style="cursor:pointer; color:#8fa; font-size:11px;">Handoff payload (input to this agent)</summary>
        <pre style="margin:6px 0 0 0; white-space:pre-wrap; word-break:break-word; color:#d1d5db; font-family:Consolas,Monaco,'Courier New',monospace; font-size:11px; line-height:1.4; background:rgba(0,0,0,0.28); border:1px solid #333; border-radius:6px; padding:8px;">${escapeHtml(input)}</pre>
      </details>
    `;
  }

  window.MoePipelineChatRenderOps = {
    openMoeDryRunPreviewModal,
    formatPipelineChatContent,
    buildInlineRouteTrace,
    buildInlineHandoffDetails
  };
})();
