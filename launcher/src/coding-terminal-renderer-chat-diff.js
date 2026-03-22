/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * PSF Coding Terminal - Renderer Chat Diff Helper
 */

(function() {
  'use strict';

  function applyDiffDisplayMode(content, state) {
    const mode = String(state?.diffDisplayMode || 'raw').toLowerCase();
    let out = String(content || '');
    if (!out) return out;
    if (mode === 'simplified') {
      out = simplifyUnifiedDiffBlocks(out);
    } else if (mode === 'hidden') {
      out = hideUnifiedDiffBlocks(out);
    }
    if (state?.diffLegendEnabled) {
      out = appendUnifiedDiffLegend(out);
    }
    return out;
  }

  function appendUnifiedDiffLegend(content) {
    const text = String(content || '');
    if (!text || /Diff Legend:/i.test(text)) return text;
    const hasDiffBlock = /(```|~~~)\s*diff[\s\S]*?\1/i.test(text);
    const hasHunkHeader = /@@\s*-\d+(?:,\d+)?\s+\+\d+(?:,\d+)?\s*@@/m.test(text);
    if (!hasDiffBlock && !hasHunkHeader) return text;
    return `${text}\n\nDiff Legend:\n- \`@@ -oldStart,oldCount +newStart,newCount @@\`: hunk header with old/new line ranges\n- lines starting with \`-\`: removed\n- lines starting with \`+\`: added\n- lines starting with space: unchanged context`;
  }

  function simplifyUnifiedDiffBlocks(content) {
    const text = String(content || '');
    return text.replace(/(```|~~~)\s*diff[^\n]*\n([\s\S]*?)\n\1/gi, (_all, _fence, body) => {
      const summary = summarizeUnifiedDiffBody(body);
      return `\`\`\`text\n${summary}\n\`\`\``;
    });
  }

  function hideUnifiedDiffBlocks(content) {
    const text = String(content || '');
    return text.replace(/(```|~~~)\s*diff[^\n]*\n([\s\S]*?)\n\1/gi, (_all, _fence, body) => {
      const files = extractDiffFiles(body);
      if (files.length === 0) return '`[Diff hidden]`';
      if (files.length === 1) return `\`[Diff hidden for ${files[0]}]\``;
      return `\`[Diff hidden for ${files.length} files]\``;
    });
  }

  function extractDiffFiles(body) {
    const lines = String(body || '').split('\n');
    const files = [];
    const seen = new Set();
    for (const line of lines) {
      const m = line.match(/^\+\+\+\s+b\/(.+)$/);
      if (!m) continue;
      const file = String(m[1] || '').trim();
      if (!file || seen.has(file)) continue;
      seen.add(file);
      files.push(file);
    }
    return files;
  }

  function summarizeUnifiedDiffBody(body) {
    const lines = String(body || '').split('\n');
    const rows = [];
    let currentFile = '';
    let adds = 0;
    let dels = 0;

    const pushCurrent = () => {
      if (!currentFile) return;
      rows.push(`${currentFile}: +${adds} -${dels}`);
    };

    for (const line of lines) {
      const plusFile = line.match(/^\+\+\+\s+b\/(.+)$/);
      if (plusFile) {
        pushCurrent();
        currentFile = String(plusFile[1] || '').trim() || '(unknown file)';
        adds = 0;
        dels = 0;
        continue;
      }
      if (!currentFile) continue;
      if (line.startsWith('+') && !line.startsWith('+++')) adds += 1;
      else if (line.startsWith('-') && !line.startsWith('---')) dels += 1;
    }
    pushCurrent();

    if (rows.length === 0) return 'Diff summary: no file changes detected.';
    return `Diff summary:\n${rows.join('\n')}`;
  }

  window.CodingTerminalRendererChatDiff = {
    applyDiffDisplayMode
  };
})();
