/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * PSF Coding Terminal - Renderer Text/Markdown Module
 */

(function() {
  'use strict';

  function createTextModule(ctx) {
    const { state } = ctx;

    function configureMarkdown() {
      if (typeof marked === 'undefined') {
        console.warn('[CodingTerminal] marked.js not loaded');
        return;
      }

      const renderer = new marked.Renderer();
      renderer.html = (html) => escapeHtml(html);

      marked.setOptions({
        renderer,
        breaks: true,
        gfm: true,
        headerIds: false,
        mangle: false
      });

      console.log('[CodingTerminal] Markdown enabled');
    }

    function parseMarkdown(text) {
      if (typeof marked === 'undefined') {
        return escapeHtml(text);
      }

      try {
        const normalized = normalizeAssistantContent(text);
        return marked.parse(normalized);
      } catch (e) {
        console.warn('[CodingTerminal] Markdown parse error:', e);
        return escapeHtml(text);
      }
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function normalizeAssistantContent(text) {
      const content = String(text || '');
      if (!content.trim()) return content;
      if (content.includes('```')) return content;

      if (looksLikeHtmlDocument(content)) {
        return `\`\`\`html\n${content}\n\`\`\``;
      }
      if (looksLikeCodeBlock(content)) {
        return `\`\`\`\n${content}\n\`\`\``;
      }
      return content;
    }

    function looksLikeHtmlDocument(text) {
      const t = text.toLowerCase();
      const hasTags = /<\s*(html|head|body|div|section|main|script|style|button|canvas|table|ul|li)\b/.test(t);
      const hasClosers = /<\/\s*(html|head|body|div|section|main|script|style|button|canvas|table|ul|li)\s*>/.test(t);
      return hasTags && hasClosers;
    }

    function looksLikeCodeBlock(text) {
      const lines = text.split('\n');
      if (lines.length < 3) return false;
      let codeSignals = 0;
      if (/[{};]/.test(text)) codeSignals++;
      if (/\b(function|const|let|var|class|return|import|export|def|if|for|while)\b/.test(text)) codeSignals++;
      if (/^\s{2,}\S/m.test(text)) codeSignals++;
      return codeSignals >= 2;
    }

    function highlightCodeBlocks(container, rawText = '') {
      if (typeof hljs === 'undefined') return;

      const preBlocks = Array.from(container.querySelectorAll('pre'));
      const markdownFilenames = extractFilenamesFromMarkdown(rawText);
      const rawFilenamePool = extractFilenamesFromRawText(rawText);
      const usedRawFilenameIndexes = new Set();
      preBlocks.forEach((pre, preIndex) => {
        const code = pre.querySelector('code');
        if (code) {
          try {
            if (!code.dataset.hljsDone) {
              hljs.highlightElement(code);
              code.dataset.hljsDone = '1';
            }
          } catch (e) {
            console.warn('[CodingTerminal] Highlight error:', e);
          }
        }

        if (pre.querySelector('.code-actions')) return;

        const actions = document.createElement('div');
        actions.className = 'code-actions';

        const copyBtn = document.createElement('button');
        copyBtn.className = 'code-copy-btn';
        copyBtn.textContent = 'Copy';
        copyBtn.onclick = () => {
          const text = code ? code.textContent : pre.innerText;
          navigator.clipboard.writeText(text).then(() => {
            copyBtn.textContent = 'Copied!';
            copyBtn.classList.add('copied');
            setTimeout(() => {
              copyBtn.textContent = 'Copy';
              copyBtn.classList.remove('copied');
            }, 1800);
          });
        };

        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'code-download-btn';
        downloadBtn.textContent = 'Download';
        downloadBtn.onclick = () => {
          const text = code ? code.textContent : pre.innerText;
          const language = detectCodeLanguage(code);
          const extension = extensionForLanguage(language);
          const mapped = String(pre.dataset.filenameHint || '').trim();
          const inferred = mapped || inferDownloadFilename(pre, code, text, extension, preIndex, preBlocks);
          let filename = inferred;
          if (!filename) {
            state.downloadCounter += 1;
            filename = `snippet-${String(state.downloadCounter).padStart(3, '0')}.${extension}`;
          }
          downloadTextFile(filename, text);
        };

        actions.appendChild(copyBtn);
        actions.appendChild(downloadBtn);
        pre.appendChild(actions);

        const language = detectCodeLanguage(code);
        const extension = extensionForLanguage(language);
        const fromContext = normalizeFilename(inferFilenameFromContext(pre, extension, preIndex, preBlocks), '');
        const fromMarkdown = normalizeFilename(markdownFilenames[preIndex] || '', '');
        const fromRawPool = pickFromRawFilenamePool(rawFilenamePool, usedRawFilenameIndexes, extension);
        const hinted = fromContext || fromMarkdown || fromRawPool;
        if (hinted) {
          pre.dataset.filenameHint = hinted;
        } else {
          delete pre.dataset.filenameHint;
        }
      });
    }

    function detectCodeLanguage(codeEl) {
      if (!codeEl) return '';
      const cls = codeEl.className || '';
      const match = cls.match(/language-([a-z0-9_+-]+)/i);
      return match ? match[1].toLowerCase() : '';
    }

    function extensionForLanguage(language) {
      const map = {
        javascript: 'js',
        js: 'js',
        typescript: 'ts',
        ts: 'ts',
        jsx: 'jsx',
        tsx: 'tsx',
        python: 'py',
        py: 'py',
        html: 'html',
        css: 'css',
        json: 'json',
        markdown: 'md',
        md: 'md',
        bash: 'sh',
        sh: 'sh',
        shell: 'sh',
        yaml: 'yml',
        yml: 'yml',
        xml: 'xml',
        sql: 'sql',
        c: 'c',
        cpp: 'cpp',
        csharp: 'cs',
        cs: 'cs',
        go: 'go',
        rust: 'rs',
        java: 'java',
        php: 'php',
        ruby: 'rb'
      };
      return map[language] || 'txt';
    }

    function downloadTextFile(filename, content) {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }

    function inferDownloadFilename(preEl, codeEl, codeText, extension, preIndex = 0, preBlocks = []) {
      const fromCode = inferFilenameFromCodeHeader(codeText);
      if (fromCode) return normalizeFilename(fromCode, extension);
      const fromContext = inferFilenameFromContext(preEl, extension, preIndex, preBlocks);
      if (fromContext) return normalizeFilename(fromContext, extension);
      return '';
    }

    function inferFilenameFromContext(preEl, preferredExt = '', preIndex = 0, preBlocks = []) {
      if (!preEl || !preEl.parentElement) return '';

      const prevCandidates = [];
      let node = preEl.previousElementSibling;
      while (node) {
        if (String(node.tagName || '').toLowerCase() === 'pre') break;
        const text = String(node.textContent || '').trim();
        const matches = extractFilenameTokens(text);
        if (matches.length) prevCandidates.push(...matches);
        node = node.previousElementSibling;
      }
      const prevPick = pickBestFilename(prevCandidates, preferredExt, true);
      if (prevPick) return prevPick;

      const nextCandidates = [];
      node = preEl.nextElementSibling;
      while (node) {
        if (String(node.tagName || '').toLowerCase() === 'pre') break;
        const text = String(node.textContent || '').trim();
        const matches = extractFilenameTokens(text);
        if (matches.length) nextCandidates.push(...matches);
        node = node.nextElementSibling;
      }
      const nextPick = pickBestFilename(nextCandidates, preferredExt, false);
      if (nextPick) return nextPick;

      // Last fallback: look across nearby non-code text in this message and pick by block index.
      const broadCandidates = collectMessageCandidates(preEl, preBlocks);
      if (broadCandidates.length > 0) {
        const ext = String(preferredExt || '').toLowerCase();
        const extMatches = ext
          ? broadCandidates.filter((f) => String(f).toLowerCase().endsWith(`.${ext}`))
          : broadCandidates;
        if (extMatches.length > 0) {
          const idx = Math.min(Math.max(0, Number(preIndex) || 0), extMatches.length - 1);
          return extMatches[idx];
        }
      }

      return '';
    }

    function inferFilenameFromCodeHeader(codeText) {
      const lines = String(codeText || '').split('\n').slice(0, 6).map((l) => String(l || '').trim());
      for (const line of lines) {
        if (!line) continue;
        const cleaned = line
          .replace(/^\/\*+\s*/, '')
          .replace(/\s*\*+\/$/, '')
          .replace(/^\/\/\s*/, '')
          .replace(/^#\s*/, '')
          .replace(/^<!--\s*/, '')
          .replace(/\s*-->$/, '')
          .trim();
        const fromText = extractFilenameToken(cleaned);
        if (fromText) return fromText;
      }
      return '';
    }

    function extractFilenameToken(text) {
      const all = extractFilenameTokens(text);
      return all.length > 0 ? all[0] : '';
    }

    function extractFilenameTokens(text) {
      const raw = String(text || '').trim();
      if (!raw) return [];
      const normalized = raw.replace(/[`"'<>]/g, ' ');

      const out = [];
      const re = /([A-Za-z0-9._\-\/\\]+?\.(?:html|css|js|mjs|cjs|ts|tsx|jsx|py|json|md|txt|xml|yml|yaml|sh|sql|java|c|cpp|h|hpp|cs|go|rs|php|rb))/ig;
      let m;
      while ((m = re.exec(normalized)) !== null) {
        const found = String(m[1] || '')
          .replace(/^[`"'([{<\s]+/, '')
          .replace(/[`"')\]}>:;,.!\s]+$/, '')
          .trim();
        if (found) out.push(found);
        if (out.length >= 16) break;
      }
      return out;
    }

    function pickBestFilename(candidates, preferredExt = '', preferLast = true) {
      const list = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
      if (list.length === 0) return '';
      const ext = String(preferredExt || '').toLowerCase();
      if (ext) {
        const extMatches = list.filter((f) => String(f).toLowerCase().endsWith(`.${ext}`));
        if (extMatches.length > 0) {
          return preferLast ? extMatches[extMatches.length - 1] : extMatches[0];
        }
      }
      return preferLast ? list[list.length - 1] : list[0];
    }

    function collectMessageCandidates(preEl, preBlocks = []) {
      const root = preEl?.closest('.ct-message-content');
      if (!root) return [];
      const nodes = Array.from(root.children || []).filter((n) => String(n.tagName || '').toLowerCase() !== 'pre');
      const out = [];
      nodes.forEach((node) => {
        const matches = extractFilenameTokens(String(node.textContent || ''));
        if (matches.length) out.push(...matches);
      });
      return out;
    }

    function extractFilenamesFromMarkdown(rawText) {
      const text = String(rawText || '');
      if (!text) return [];
      const results = [];
      const reFence = /(?:^|\n)(```|~~~)([^\n]*)\n([\s\S]*?)\n\1(?=\n|$)/g;
      let m;
      while ((m = reFence.exec(text)) !== null) {
        const fenceMeta = String(m[2] || '').trim();
        const codeBody = String(m[3] || '');
        const blockStart = m.index;
        const blockEnd = reFence.lastIndex;

        let filename = extractFilenameFromFenceMeta(fenceMeta);
        if (!filename) {
          const beforeLines = text.slice(0, blockStart).split('\n').slice(-10);
          filename = extractFilenameFromNearbyLines(beforeLines, true);
        }
        if (!filename) {
          const afterLines = text.slice(blockEnd).split('\n').slice(0, 6);
          filename = extractFilenameFromNearbyLines(afterLines, false);
        }
        if (!filename) {
          filename = inferFilenameFromCodeHeader(codeBody);
        }

        results.push(normalizeFilename(filename, ''));
      }
      return results;
    }

    function extractFilenamesFromRawText(rawText) {
      const text = String(rawText || '');
      if (!text) return [];
      const tokens = extractFilenameTokens(text)
        .map((v) => normalizeFilename(v, ''))
        .filter(Boolean);
      if (tokens.length === 0) return [];

      // Preserve first occurrence order, remove duplicates.
      const seen = new Set();
      const out = [];
      tokens.forEach((name) => {
        const key = String(name).toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push(name);
      });
      return out;
    }

    function pickFromRawFilenamePool(pool, usedIndexes, preferredExt = '') {
      const list = Array.isArray(pool) ? pool : [];
      if (list.length === 0) return '';
      const ext = String(preferredExt || '').toLowerCase();

      if (ext) {
        for (let i = 0; i < list.length; i += 1) {
          if (usedIndexes.has(i)) continue;
          const name = String(list[i] || '');
          if (name.toLowerCase().endsWith(`.${ext}`)) {
            usedIndexes.add(i);
            return name;
          }
        }
      }

      for (let i = 0; i < list.length; i += 1) {
        if (usedIndexes.has(i)) continue;
        usedIndexes.add(i);
        return String(list[i] || '');
      }
      return '';
    }

    function extractFilenameFromFenceMeta(fenceMeta) {
      const tokens = extractFilenameTokens(String(fenceMeta || ''));
      return tokens.length > 0 ? tokens[tokens.length - 1] : '';
    }

    function extractFilenameFromNearbyLines(lines, preferLast) {
      if (!Array.isArray(lines) || lines.length === 0) return '';
      const picks = [];
      lines.forEach((line) => {
        const one = extractFilenameFromLine(line);
        if (one) picks.push(one);
      });
      if (picks.length === 0) return '';
      return preferLast ? picks[picks.length - 1] : picks[0];
    }

    function extractFilenameFromLine(line) {
      const raw = String(line || '').trim();
      if (!raw) return '';
      let cleaned = raw
        .replace(/^\s*[-*+]\s*/, '')
        .replace(/^#+\s*/, '')
        .replace(/^\*\*(.+)\*\*$/, '$1')
        .replace(/^`(.+)`$/, '$1')
        .replace(/[:\s]+$/, '')
        .trim();
      if (!cleaned) return '';
      const lower = cleaned.toLowerCase();
      if (lower === 'copy' || lower === 'download' || lower === 'copy download') return '';

      const exact = cleaned.match(/^(?:file(?:name)?\s*[:=-]\s*)?([A-Za-z0-9._\-\/\\]+\.[A-Za-z0-9]+)$/i);
      if (exact && exact[1]) return String(exact[1]).trim();

      const loose = cleaned.match(/([A-Za-z0-9._\-\/\\]+\.[A-Za-z0-9]+)(?:\s*[:\-].*)?$/i);
      if (loose && loose[1]) return String(loose[1]).trim();

      const tokens = extractFilenameTokens(cleaned);
      return tokens.length > 0 ? tokens[tokens.length - 1] : '';
    }

    function normalizeFilename(name, fallbackExt) {
      let value = String(name || '').trim();
      if (!value) return '';

      value = value.replace(/\\/g, '/').split('/').filter(Boolean).pop() || '';
      if (!value) return '';

      value = value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (!value) return '';

      if (!/\.[A-Za-z0-9]+$/.test(value) && fallbackExt) {
        value = `${value}.${fallbackExt}`;
      }
      return value;
    }

    return {
      configureMarkdown,
      parseMarkdown,
      escapeHtml,
      highlightCodeBlocks
    };
  }

  window.CodingTerminalRendererText = {
    createTextModule
  };
})();
