/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */

window.createMoeChatRenderUtilsOps = function createMoeChatRenderUtilsOps(ctx = {}) {
  function openDryRunPreviewModal(previewText) {
    return window.MoeChatRenderOps?.openDryRunPreviewModal
      ? window.MoeChatRenderOps.openDryRunPreviewModal(previewText, { escapeHtml })
      : Promise.resolve(false);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatChatContent(text, options = {}) {
    return window.MoeChatRenderOps?.formatChatContent
      ? window.MoeChatRenderOps.formatChatContent(text, options, { escapeHtml })
      : escapeHtml(String(text || ''));
  }

  function buildRouteTraceLine(meta) {
    return window.MoeChatRenderOps?.buildRouteTraceLine
      ? window.MoeChatRenderOps.buildRouteTraceLine(meta, { escapeHtml })
      : '';
  }

  function buildHandoffDetails(meta) {
    return window.MoeChatRenderOps?.buildHandoffDetails
      ? window.MoeChatRenderOps.buildHandoffDetails(meta, { escapeHtml })
      : '';
  }

  function extractIrgContractFromText(content) {
    const text = String(content || '');
    const marker = text.lastIndexOf('Contract:');
    if (marker < 0) return null;
    const tail = text.slice(marker);
    const jsonStart = tail.indexOf('{');
    if (jsonStart < 0) return null;
    const jsonCandidate = sliceBalancedJson(tail.slice(jsonStart));
    if (!jsonCandidate) return null;
    try {
      const parsed = JSON.parse(jsonCandidate);
      if (!parsed || typeof parsed !== 'object') return null;
      if (!parsed.action || !parsed.params) return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function sliceBalancedJson(source) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = 0; i < source.length; i += 1) {
      const ch = source[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === '{') depth += 1;
      if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          return source.slice(0, i + 1);
        }
      }
    }
    return null;
  }

  function withRequestTimeout(label, promise, timeoutMs) {
    const fallback = Number(ctx.requestTimeoutMs) || 180000;
    const ms = Number.isFinite(Number(timeoutMs)) ? Math.max(1000, Number(timeoutMs)) : fallback;
    return Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s. The backend may still be running.`));
        }, ms);
      })
    ]);
  }

  return {
    openDryRunPreviewModal,
    escapeHtml,
    formatChatContent,
    buildRouteTraceLine,
    buildHandoffDetails,
    extractIrgContractFromText,
    withRequestTimeout
  };
};
