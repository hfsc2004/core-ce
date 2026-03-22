/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
(function() {
  'use strict';

  function createRlmRuntimeStateOps(ctx) {
    const {
      getIncludeSharedAttachments,
      getSharedAttachmentSessionId,
      getEffectiveBudgets
    } = ctx || {};

    function getAttachmentScopes(sessionId) {
      const localSessionId = String(sessionId || '').trim() || 'terminal-default';
      const scopes = [localSessionId];
      if (getIncludeSharedAttachments() === true) {
        const sharedSessionId = String(getSharedAttachmentSessionId() || '').trim() || 'terminal-shared';
        if (sharedSessionId && sharedSessionId !== localSessionId) {
          scopes.push(sharedSessionId);
        }
      }
      return scopes;
    }

    async function listTextAttachments(api, sessionId) {
      const scopes = getAttachmentScopes(sessionId);
      const merged = [];
      const seen = new Set();
      for (const scopeSessionId of scopes) {
        const listed = await api.terminalAttachmentsList({ sessionId: scopeSessionId });
        const items = Array.isArray(listed?.attachments) ? listed.attachments : [];
        for (const item of items) {
          if (!item || !item.textExtractable) continue;
          const scopeId = String(item?.id || '').trim();
          if (!scopeId) continue;
          const uniqueKey = `${scopeSessionId}:${scopeId}`;
          if (seen.has(uniqueKey)) continue;
          seen.add(uniqueKey);
          merged.push({
            ...item,
            sourceSessionId: scopeSessionId,
            scopedId: uniqueKey
          });
        }
      }
      return merged;
    }

    function findAttachmentByName(items, candidateName) {
      const needle = String(candidateName || '').trim().toLowerCase();
      if (!needle) return null;
      return items.find((item) => {
        const id = String(item?.id || '').toLowerCase();
        const scopedId = String(item?.scopedId || '').toLowerCase();
        const displayName = String(item?.displayName || '').toLowerCase();
        return (
          id === needle ||
          scopedId === needle ||
          displayName === needle ||
          displayName.includes(needle)
        );
      }) || null;
    }

    function extractPossibleFilename(message) {
      const text = String(message || '').trim();
      if (!text) return '';
      const quoted = text.match(/["']([^"']+\.(?:md|txt|pdf|json|csv|log|xml|yaml|yml))["']/i);
      if (quoted && quoted[1]) return quoted[1];
      const bare = text.match(/\b([\w.-]+\.(?:md|txt|pdf|json|csv|log|xml|yaml|yml))\b/i);
      return bare && bare[1] ? bare[1] : '';
    }

    async function resolveAttachmentSelection(api, sessionId, args = {}, userMessage = '') {
      const items = await listTextAttachments(api, sessionId);
      if (items.length === 0) {
        return { ok: false, error: 'No text-extractable attachments are available in this session.' };
      }

      const requestedId = String(args.attachmentId || '').trim();
      if (requestedId) {
        const matchedById = findAttachmentByName(items, requestedId);
        if (matchedById) return { ok: true, attachment: matchedById, items };
      }

      const requestedName = String(args.attachmentName || '').trim();
      if (requestedName) {
        const matchedByName = findAttachmentByName(items, requestedName);
        if (matchedByName) return { ok: true, attachment: matchedByName, items };
      }

      const hintedName = extractPossibleFilename(userMessage);
      if (hintedName) {
        const matchedByHint = findAttachmentByName(items, hintedName);
        if (matchedByHint) return { ok: true, attachment: matchedByHint, items };
      }

      if (items.length === 1) {
        return { ok: true, attachment: items[0], items };
      }

      return {
        ok: false,
        ambiguous: true,
        error: 'Multiple attachments are available; specify attachmentId.',
        items
      };
    }

    function ensureBudgetState(state) {
      if (!state || typeof state !== 'object') return;
      if (!state.budgets || typeof state.budgets !== 'object') {
        state.budgets = getEffectiveBudgets();
      }
      if (!state.metrics || typeof state.metrics !== 'object') {
        state.metrics = {
          startedAt: Date.now(),
          runtimeMs: 0,
          toolCalls: 0,
          chunksProcessed: 0,
          evidenceHits: 0
        };
      }
      state.metrics.runtimeMs = Math.max(0, Date.now() - Number(state.metrics.startedAt || Date.now()));
      if (!Array.isArray(state.stopReasons)) state.stopReasons = [];
    }

    function markBudgetStop(state, reason, detail = '') {
      ensureBudgetState(state);
      const key = String(reason || '').trim() || 'budget_limit';
      if (!state.stopReasons.includes(key)) {
        state.stopReasons.push(key);
      }
      if (!state.stopReason) {
        state.stopReason = key;
      }
      if (Array.isArray(state.trace)) {
        state.trace.push(`stop=${key}${detail ? ` (${detail})` : ''}`);
      }
    }

    function runtimeExceeded(state) {
      ensureBudgetState(state);
      const elapsed = Number(state.metrics.runtimeMs || 0);
      const limit = Number(state.budgets?.maxRuntimeMs || 0);
      if (limit > 0 && elapsed >= limit) {
        markBudgetStop(state, 'max_runtime_ms', `${elapsed}ms >= ${limit}ms`);
        return true;
      }
      return false;
    }

    return {
      getAttachmentScopes,
      listTextAttachments,
      resolveAttachmentSelection,
      ensureBudgetState,
      markBudgetStop,
      runtimeExceeded
    };
  }

  window.PsfRlmCoreRuntimeState = {
    createRlmRuntimeStateOps
  };
})();
