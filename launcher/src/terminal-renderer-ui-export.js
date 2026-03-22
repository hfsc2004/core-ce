/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
(function() {
  'use strict';

  function createUIExportController(deps) {
    const getChatDisplay = typeof deps?.getChatDisplay === 'function' ? deps.getChatDisplay : () => null;
    const getLlmAssistedFileNaming = typeof deps?.getLlmAssistedFileNaming === 'function'
      ? deps.getLlmAssistedFileNaming
      : () => true;
    const escapeHtml = typeof deps?.escapeHtml === 'function' ? deps.escapeHtml : (v) => String(v || '');
    const downloadTextFile = typeof deps?.downloadTextFile === 'function' ? deps.downloadTextFile : () => {};

    const openExportMenus = new Set();
    let exportMenuCloserInstalled = false;
    let threadExportControlsInstalled = false;

    function normalizeExportFormat(format) {
      const value = String(format || '').trim().toLowerCase();
      if (value === 'md' || value === 'txt' || value === 'html' || value === 'pdf') return value;
      return 'md';
    }

    function buildTopicFilename(rawMarkdown, plainText) {
      const source = String(rawMarkdown || plainText || '').replace(/\r\n/g, '\n');
      const headingMatch = source.match(/^\s{0,3}#{1,3}\s+(.{3,120})$/m);
      const baseText = headingMatch ? headingMatch[1] : source;
      const words = String(baseText || '')
        .toLowerCase()
        .replace(/[`*_~()[\]{}<>"'|/\\:;,.!?@#$%^&+=]+/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .filter((w) => w.length >= 3)
        .filter((w) => !['the', 'and', 'for', 'with', 'that', 'this', 'from', 'were', 'have', 'your', 'you', 'but'].includes(w));

      const scored = new Map();
      words.forEach((w) => scored.set(w, (scored.get(w) || 0) + 1));
      const selected = Array.from(scored.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([w]) => w);
      const topic = selected.join('-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      return topic || 'terminal-export';
    }

    function buildHtmlDocument(contentHtml, title, computed) {
      const textColor = computed?.color || '#e0e0e0';
      const bgColor = computed?.backgroundColor || '#16162a';
      const fontFamily = computed?.fontFamily || 'Courier New, monospace';
      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(String(title || 'Terminal Export'))}</title>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0;
      padding: 24px;
      background: ${bgColor};
      color: ${textColor};
      font-family: ${fontFamily};
      line-height: 1.6;
    }
    .message-content { max-width: 980px; }
    pre {
      background: rgba(0, 0, 0, 0.25);
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 8px;
      padding: 12px;
      overflow: auto;
    }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    blockquote {
      margin: 0.75em 0;
      padding: 0.4em 0.8em;
      border-left: 3px solid rgba(0, 212, 255, 0.5);
      background: rgba(255,255,255,0.04);
    }
  </style>
</head>
<body>
  <main class="message-content">${String(contentHtml || '')}</main>
</body>
</html>`;
    }

    function normalizeRoleLabel(label) {
      const v = String(label || '').trim().toLowerCase();
      return v || 'message';
    }

    function collectTranscriptEntries() {
      const chatDisplay = getChatDisplay();
      if (!chatDisplay) return [];
      const messageNodes = chatDisplay.querySelectorAll('.message');
      const entries = [];
      messageNodes.forEach((node) => {
        const role = normalizeRoleLabel(node.querySelector('.message-role')?.textContent || '');
        const contentDiv = node.querySelector('.message-content');
        const raw = String(contentDiv?.dataset?.rawContent || '').trim();
        const text = String(contentDiv?.innerText || contentDiv?.textContent || '').trim();
        const html = String(contentDiv?.innerHTML || '').trim();
        if (!raw && !text && !html) return;
        entries.push({ role, raw, text, html });
      });
      return entries;
    }

    function buildThreadMarkdown(entries) {
      const lines = ['# PSF Terminal Thread Export', '', `Generated: ${new Date().toISOString()}`, ''];
      entries.forEach((entry) => {
        lines.push(`## ${entry.role}`);
        lines.push('');
        lines.push(String(entry.raw || entry.text || '').trim());
        lines.push('');
      });
      return lines.join('\n').trim();
    }

    function buildThreadText(entries) {
      const lines = ['PSF Terminal Thread Export', `Generated: ${new Date().toISOString()}`, ''];
      entries.forEach((entry) => {
        lines.push(`[${String(entry.role || '').toUpperCase()}]`);
        lines.push(String(entry.text || entry.raw || '').trim());
        lines.push('');
      });
      return lines.join('\n').trim();
    }

    function buildThreadHtmlBody(entries) {
      return entries.map((entry) => {
        const role = escapeHtml(String(entry.role || '').toUpperCase());
        const body = String(entry.html || escapeHtml(entry.text || entry.raw || '')).trim();
        return `<article style="margin:0 0 14px 0;padding:12px;border-left:3px solid rgba(0,212,255,0.4);background:rgba(255,255,255,0.03);border-radius:8px;">
  <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#8ecbff;margin-bottom:8px;">${role}</div>
  <div>${body}</div>
</article>`;
      }).join('\n');
    }

    function buildFallbackFilename() {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      return `terminal-export-${stamp}`;
    }

    async function exportThreadTranscript(format) {
      const entries = collectTranscriptEntries();
      if (!entries.length) return;
      const markdown = buildThreadMarkdown(entries);
      const plainText = buildThreadText(entries);
      const htmlBody = buildThreadHtmlBody(entries);
      const computed = getChatDisplay() ? window.getComputedStyle(getChatDisplay()) : null;
      const baseName = getLlmAssistedFileNaming() ? buildTopicFilename(markdown, plainText) : buildFallbackFilename();
      const suggestedName = `thread-${baseName}`;
      const htmlDocument = buildHtmlDocument(htmlBody, suggestedName, computed);

      if (window.electronAPI && typeof window.electronAPI.terminalExportBlock === 'function') {
        await window.electronAPI.terminalExportBlock({
          format: normalizeExportFormat(format || 'md'),
          suggestedName,
          markdown,
          text: plainText,
          html: htmlDocument,
          htmlDocument
        });
        return;
      }

      const resolvedFormat = normalizeExportFormat(format || 'md');
      const fallbackExt = resolvedFormat === 'pdf' ? 'html' : resolvedFormat;
      const fallbackName = `${suggestedName}.${fallbackExt}`;
      if (resolvedFormat === 'txt') downloadTextFile(fallbackName, plainText);
      else if (resolvedFormat === 'html' || resolvedFormat === 'pdf') downloadTextFile(fallbackName, htmlDocument);
      else downloadTextFile(fallbackName, markdown);
    }

    function installExportMenuCloser() {
      if (exportMenuCloserInstalled) return;
      exportMenuCloserInstalled = true;
      document.addEventListener('click', (event) => {
        const target = event && event.target;
        openExportMenus.forEach((candidate) => {
          if (!candidate.parentElement || !candidate.parentElement.contains(target)) {
            candidate.classList.remove('active');
            candidate.setAttribute('aria-hidden', 'true');
          }
        });
      });
    }

    function installThreadExportControls() {
      if (threadExportControlsInstalled) return;
      const exportBtn = document.getElementById('session-export-btn');
      const menuBtn = document.getElementById('session-export-menu-btn');
      const menu = document.getElementById('session-export-menu');
      if (!exportBtn || !menuBtn || !menu) return;
      threadExportControlsInstalled = true;

      menu.innerHTML = '';
      ['md', 'txt', 'html', 'pdf'].forEach((format) => {
        const opt = document.createElement('button');
        opt.className = 'session-export-option';
        opt.textContent = `.${format}`;
        opt.onclick = async () => {
          try {
            await exportThreadTranscript(format);
          } catch (err) {
            console.error('[Terminal] Thread export failed:', err);
          } finally {
            menu.classList.remove('active');
            menu.setAttribute('aria-hidden', 'true');
          }
        };
        menu.appendChild(opt);
      });

      exportBtn.onclick = async () => {
        try {
          await exportThreadTranscript('md');
        } catch (err) {
          console.error('[Terminal] Thread export failed:', err);
        }
      };

      menuBtn.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        openExportMenus.forEach((candidate) => {
          if (candidate !== menu) candidate.classList.remove('active');
        });
        const active = !menu.classList.contains('active');
        menu.classList.toggle('active', active);
        menu.setAttribute('aria-hidden', active ? 'false' : 'true');
      };

      openExportMenus.add(menu);
      installExportMenuCloser();
    }

    async function exportAssistantBlock(contentDiv, rawMarkdown, selectedFormat) {
      const format = normalizeExportFormat(selectedFormat);
      const plainText = String(contentDiv?.innerText || contentDiv?.textContent || '').trim();
      const markdown = String(rawMarkdown || plainText || '').trim();
      const htmlBody = String(contentDiv?.innerHTML || '').trim();
      const computed = contentDiv ? window.getComputedStyle(contentDiv) : null;
      const suggestedName = getLlmAssistedFileNaming() ? buildTopicFilename(markdown, plainText) : buildFallbackFilename();
      const htmlDocument = buildHtmlDocument(htmlBody, suggestedName, computed);

      if (window.electronAPI && typeof window.electronAPI.terminalExportBlock === 'function') {
        const result = await window.electronAPI.terminalExportBlock({
          format,
          suggestedName,
          markdown,
          text: plainText,
          html: htmlDocument,
          htmlDocument
        });
        if (result && result.success) return;
      }

      const extension = format === 'pdf' ? 'html' : format;
      const fallbackName = `${suggestedName}.${extension}`;
      if (format === 'md') downloadTextFile(fallbackName, markdown);
      else if (format === 'txt') downloadTextFile(fallbackName, plainText);
      else downloadTextFile(fallbackName, htmlDocument);
    }

    function addBlockExportActions(messageDiv, contentDiv, rawMarkdown) {
      if (!messageDiv || !contentDiv) return;
      if (messageDiv.querySelector('.message-actions')) return;

      const actionsWrap = document.createElement('div');
      actionsWrap.className = 'message-actions';

      const exportBtn = document.createElement('button');
      exportBtn.className = 'message-export-btn';
      exportBtn.title = 'Download this response';

      const menuBtn = document.createElement('button');
      menuBtn.className = 'message-export-menu-btn';
      menuBtn.title = 'Choose export format';
      menuBtn.textContent = '⋯';

      const menu = document.createElement('div');
      menu.className = 'message-export-menu';
      openExportMenus.add(menu);

      const getDefault = () => 'md';
      const updateMainLabel = () => {
        exportBtn.textContent = `⬇️ .${getDefault()}`;
      };

      const applyExport = async (format) => {
        try {
          await exportAssistantBlock(contentDiv, rawMarkdown, format);
        } catch (err) {
          console.error('[Terminal] Block export failed:', err);
        } finally {
          menu.classList.remove('active');
        }
      };

      exportBtn.onclick = () => { applyExport(getDefault()); };

      ['md', 'txt', 'html', 'pdf'].forEach((format) => {
        const opt = document.createElement('button');
        opt.className = 'message-export-option';
        opt.textContent = `.${format}`;
        opt.onclick = () => { applyExport(format); };
        menu.appendChild(opt);
      });

      menuBtn.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        openExportMenus.forEach((candidate) => {
          if (candidate !== menu) candidate.classList.remove('active');
        });
        menu.classList.toggle('active');
      };
      installExportMenuCloser();

      updateMainLabel();
      actionsWrap.appendChild(exportBtn);
      actionsWrap.appendChild(menuBtn);
      actionsWrap.appendChild(menu);
      messageDiv.appendChild(actionsWrap);
    }

    return {
      installThreadExportControls,
      addBlockExportActions
    };
  }

  window.TerminalUIExport = {
    createUIExportController
  };
})();

