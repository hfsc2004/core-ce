/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
(function() {
  'use strict';

  function createUIController(deps) {
    const getChatDisplay = typeof deps?.getChatDisplay === 'function' ? deps.getChatDisplay : () => null;
    const getUserInput = typeof deps?.getUserInput === 'function' ? deps.getUserInput : () => null;
    const getSendBtn = typeof deps?.getSendBtn === 'function' ? deps.getSendBtn : () => null;
    const getStopBtn = typeof deps?.getStopBtn === 'function' ? deps.getStopBtn : () => null;
    const getStatusText = typeof deps?.getStatusText === 'function' ? deps.getStatusText : () => null;
    const getGpuIcon = typeof deps?.getGpuIcon === 'function' ? deps.getGpuIcon : () => null;
    const getGpuText = typeof deps?.getGpuText === 'function' ? deps.getGpuText : () => null;

    let markdownEnabled = true;
    let downloadCounter = 0;
    const exportController = window.TerminalUIExport?.createUIExportController?.({
      getChatDisplay,
      escapeHtml,
      downloadTextFile,
      getLlmAssistedFileNaming: deps?.getLlmAssistedFileNaming
    });
    const imageHelpers = window.TerminalUIImageHelpers?.createUIImageHelpers?.({
      getChatDisplay,
      formatBytes
    });

    function configureMarkdown() {
      if (typeof marked === 'undefined') {
        console.warn('[Terminal] marked.js not loaded - markdown disabled');
        markdownEnabled = false;
        return;
      }

      // Prevent accidental ~~...~~ sequences from rendering as strikethrough
      // in model output that is intended to be plain text.
      if (typeof marked.use === 'function') {
        marked.use({
          renderer: {
            del(text) {
              return String(text || '');
            }
          }
        });
      }

      marked.setOptions({
        highlight: function(code, lang) {
          if (typeof hljs !== 'undefined') {
            if (lang && hljs.getLanguage(lang)) {
              try {
                return hljs.highlight(code, { language: lang }).value;
              } catch (e) {
                console.warn('[Terminal] Highlight error:', e);
              }
            }
            try {
              return hljs.highlightAuto(code).value;
            } catch (e) {
              console.warn('[Terminal] Auto-highlight error:', e);
            }
          }
          return code;
        },
        breaks: true,
        gfm: true,
        headerIds: false,
        mangle: false
      });

      console.log('[Terminal] Markdown rendering enabled');
      exportController?.installThreadExportControls?.();
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function parseMarkdown(content) {
      if (!markdownEnabled || typeof marked === 'undefined') {
        return escapeHtml(content);
      }

      try {
        // Treat model output as untrusted text so placeholder-like tokens
        // (e.g., <term1>) are rendered literally instead of parsed as HTML tags.
        const safe = escapeHtml(String(content || ''));
        return marked.parse(safe);
      } catch (e) {
        console.error('[Terminal] Markdown parse error:', e);
        return escapeHtml(content);
      }
    }

    function highlightCodeBlocks(element) {
      const preBlocks = element.querySelectorAll('pre');

      preBlocks.forEach((pre) => {
        const codeBlock = pre.querySelector('code');
        if (codeBlock && typeof hljs !== 'undefined') {
          try {
            hljs.highlightElement(codeBlock);
          } catch (e) {
            console.warn('[Terminal] Highlight block error:', e);
          }
        }

        if (pre.querySelector('.code-actions')) return;

        const actions = document.createElement('div');
        actions.className = 'code-actions';

        const copyBtn = document.createElement('button');
        copyBtn.className = 'code-copy-btn';
        copyBtn.textContent = 'Copy';
        copyBtn.onclick = function() {
          const code = pre.querySelector('code');
          const text = code ? code.textContent : pre.textContent;
          navigator.clipboard.writeText(text).then(() => {
            copyBtn.textContent = 'Copied!';
            copyBtn.classList.add('copied');
            setTimeout(() => {
              copyBtn.textContent = 'Copy';
              copyBtn.classList.remove('copied');
            }, 2000);
          }).catch(() => {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            copyBtn.textContent = 'Copied!';
            copyBtn.classList.add('copied');
            setTimeout(() => {
              copyBtn.textContent = 'Copy';
              copyBtn.classList.remove('copied');
            }, 2000);
          });
        };

        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'code-download-btn';
        downloadBtn.textContent = 'Download';
        downloadBtn.onclick = function() {
          const code = pre.querySelector('code');
          const text = code ? code.textContent : pre.textContent;
          const language = detectCodeLanguage(code);
          const extension = extensionForLanguage(language);
          const inferred = inferDownloadFilename(pre, code, text, extension);
          let filename = inferred;
          if (!filename) {
            downloadCounter += 1;
            filename = `snippet-${String(downloadCounter).padStart(3, '0')}.${extension}`;
          }
          downloadTextFile(filename, text);
        };

        actions.appendChild(copyBtn);
        actions.appendChild(downloadBtn);
        pre.appendChild(actions);
      });
    }

    function detectCodeLanguage(codeEl) {
      if (!codeEl) return '';
      const cls = String(codeEl.className || '');
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

    function inferDownloadFilename(preEl, codeEl, codeText, extension) {
      const fromCode = inferFilenameFromCodeHeader(codeText);
      if (fromCode) return normalizeFilename(fromCode, extension);
      const fromContext = inferFilenameFromContext(preEl);
      if (fromContext) return normalizeFilename(fromContext, extension);
      return '';
    }

    function inferFilenameFromContext(preEl) {
      if (!preEl || !preEl.parentElement) return '';
      let node = preEl.previousElementSibling;
      let hops = 0;
      while (node && hops < 5) {
        const text = String(node.textContent || '').trim();
        const candidate = extractFilenameToken(text);
        if (candidate) return candidate;
        node = node.previousElementSibling;
        hops += 1;
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
        const candidate = extractFilenameToken(cleaned);
        if (candidate) return candidate;
      }
      return '';
    }

    function extractFilenameToken(text) {
      const raw = String(text || '').trim();
      if (!raw) return '';
      const normalized = raw.replace(/[`"'<>]/g, ' ');
      const match = normalized.match(/(?:^|[\s:])([A-Za-z0-9._\-\/\\]+?\.(?:html|css|js|mjs|cjs|ts|tsx|jsx|py|json|md|txt|xml|yml|yaml|sh|sql|java|c|cpp|h|hpp|cs|go|rs|php|rb))(?:$|[\s:])/i);
      if (!match) return '';
      return String(match[1] || '').trim();
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

    function installThreadExportControls() {
      exportController?.installThreadExportControls?.();
    }

    function addMessage(role, content) {
      const chatDisplay = getChatDisplay();
      if (!chatDisplay) return;

      const messageDiv = document.createElement('div');
      messageDiv.className = `message ${role}`;

      const roleDiv = document.createElement('div');
      roleDiv.className = 'message-role';
      roleDiv.textContent = role;

      const contentDiv = document.createElement('div');
      contentDiv.className = 'message-content';
      const rawContent = String(content || '');
      contentDiv.dataset.rawContent = rawContent;

      if (role === 'assistant' && markdownEnabled) {
        contentDiv.innerHTML = parseMarkdown(rawContent);
        highlightCodeBlocks(contentDiv);
        exportController?.addBlockExportActions?.(messageDiv, contentDiv, rawContent);
      } else if (role === 'system' && markdownEnabled) {
        contentDiv.innerHTML = parseMarkdown(rawContent);
      } else {
        contentDiv.textContent = rawContent;
      }

      messageDiv.appendChild(roleDiv);
      messageDiv.appendChild(contentDiv);
      chatDisplay.appendChild(messageDiv);
      chatDisplay.scrollTop = chatDisplay.scrollHeight;
    }

    function addSystemImagePreview(preview = {}) {
      imageHelpers?.addSystemImagePreview?.(preview);
    }

    function addAssistantShell() {
      const chatDisplay = getChatDisplay();
      if (!chatDisplay) return null;

      const messageDiv = document.createElement('div');
      messageDiv.className = 'message assistant';

      const roleDiv = document.createElement('div');
      roleDiv.className = 'message-role';
      roleDiv.textContent = 'assistant';

      const contentDiv = document.createElement('div');
      contentDiv.className = 'message-content streaming';
      contentDiv.textContent = '';
      contentDiv.dataset.rawContent = '';

      messageDiv.appendChild(roleDiv);
      messageDiv.appendChild(contentDiv);
      chatDisplay.appendChild(messageDiv);
      chatDisplay.scrollTop = chatDisplay.scrollHeight;
      return contentDiv;
    }

    function finalizeStreamingMessage(contentDiv, fullContent) {
      const chatDisplay = getChatDisplay();
      if (!contentDiv) return;

      contentDiv.classList.remove('streaming');
      if (markdownEnabled) {
        contentDiv.innerHTML = parseMarkdown(fullContent);
        highlightCodeBlocks(contentDiv);
      }
      contentDiv.dataset.rawContent = String(fullContent || '');
      const messageDiv = contentDiv.closest('.message.assistant');
      if (messageDiv) exportController?.addBlockExportActions?.(messageDiv, contentDiv, String(fullContent || ''));
      if (chatDisplay) {
        chatDisplay.scrollTop = chatDisplay.scrollHeight;
      }
    }

    function setWaitingState(waiting) {
      const userInput = getUserInput();
      const sendBtn = getSendBtn();
      const stopBtn = getStopBtn();
      const statusText = getStatusText();
      const inlineThinking = document.getElementById('inline-thinking');

      if (userInput) userInput.disabled = waiting;
      if (sendBtn) sendBtn.disabled = waiting;

      if (waiting) {
        if (sendBtn) sendBtn.innerHTML = '<span class="spinner"></span>';
        if (stopBtn) {
          stopBtn.style.display = 'inline-block';
          stopBtn.disabled = false;
        }
        if (statusText) statusText.textContent = 'Processing...';
        if (inlineThinking) {
          inlineThinking.classList.add('active');
          inlineThinking.setAttribute('aria-hidden', 'false');
        }
        setThinkingStatusText('Thinking');
      } else {
        if (sendBtn) sendBtn.textContent = 'Send';
        if (stopBtn) {
          stopBtn.style.display = 'none';
          stopBtn.disabled = true;
        }
        if (statusText) statusText.textContent = 'Connected to Ollama';
        if (inlineThinking) {
          inlineThinking.classList.remove('active');
          inlineThinking.setAttribute('aria-hidden', 'true');
        }
        setThinkingStatusText('Thinking');
      }
    }

    function setThinkingStatusText(text) {
      const inlineLabel = document.getElementById('inline-thinking-label');
      const value = String(text || '').trim() || 'Thinking';
      if (inlineLabel) inlineLabel.textContent = value;
    }

    function updateGPUIndicator(gpuType) {
      const gpuIcon = getGpuIcon();
      const gpuText = getGpuText();
      if (!gpuIcon || !gpuText) return;

      if (gpuType === 'nvidia' || gpuType === 'amd') {
        gpuIcon.textContent = '🎮';
        gpuText.textContent = 'GPU Inference';
      } else if (gpuType === 'apple-silicon' || gpuType === 'apple') {
        gpuIcon.textContent = '🍎';
        gpuText.textContent = 'Apple Silicon';
      } else if (gpuType === 'npu') {
        gpuIcon.textContent = '🧠';
        gpuText.textContent = 'NPU Inference';
      } else if (gpuType === 'mali') {
        gpuIcon.textContent = '⚡';
        gpuText.textContent = 'Mali GPU';
      } else if (gpuType === 'videocore') {
        gpuIcon.textContent = '⚡';
        gpuText.textContent = 'VideoCore GPU';
      } else {
        gpuIcon.textContent = '💻';
        gpuText.textContent = 'CPU Inference';
      }
    }

    function formatBytes(bytes) {
      if (!bytes) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    return {
      configureMarkdown,
      parseMarkdown,
      highlightCodeBlocks,
      escapeHtml,
      installThreadExportControls,
      addMessage,
      addSystemImagePreview,
      addAssistantShell,
      finalizeStreamingMessage,
      setWaitingState,
      setThinkingStatusText,
      updateGPUIndicator,
      formatBytes
    };
  }

  window.TerminalUI = {
    createUIController
  };
})();
