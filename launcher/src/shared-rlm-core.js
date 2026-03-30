/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
(function() {
  'use strict';

  function createRlmCore(deps) {
    const getElectronAPI = typeof deps?.getElectronAPI === 'function' ? deps.getElectronAPI : () => (window.electronAPI || null);
    const getSessionId = typeof deps?.getSessionId === 'function' ? deps.getSessionId : () => 'terminal-default';
    const getModelName = typeof deps?.getModelName === 'function' ? deps.getModelName : () => null;
    const buildOllamaOptions = typeof deps?.buildOllamaOptions === 'function' ? deps.buildOllamaOptions : () => ({});
    const sendMessage = typeof deps?.sendMessage === 'function'
      ? deps.sendMessage
      : async (modelName, messages, options = {}) => {
        const api = getElectronAPI();
        if (!api || typeof api.ollamaSendMessage !== 'function') {
          return { success: false, message: 'No sendMessage transport available' };
        }
        return api.ollamaSendMessage(modelName, messages, options);
      };
    const getRlmVerboseTrace = typeof deps?.getRlmVerboseTrace === 'function' ? deps.getRlmVerboseTrace : () => false;
    const getRlmQuality = typeof deps?.getRlmQuality === 'function' ? deps.getRlmQuality : () => 'balanced';
    const getRlmBudgets = typeof deps?.getRlmBudgets === 'function' ? deps.getRlmBudgets : () => ({});
    const getIncludeSharedAttachments = typeof deps?.getIncludeSharedAttachments === 'function'
      ? deps.getIncludeSharedAttachments
      : () => false;
    const getSharedAttachmentSessionId = typeof deps?.getSharedAttachmentSessionId === 'function'
      ? deps.getSharedAttachmentSessionId
      : () => 'terminal-shared';
    const onThinkingStatus = typeof deps?.onThinkingStatus === 'function' ? deps.onThinkingStatus : (() => {});

    const TOOL_NAMES = [
      'list_attachments',
      'read_attachment',
      'search_attachment',
      'summarize_text',
      'extract_query_terms',
      'rank_chunks_by_terms',
      'coverage_guard'
    ];

    const QUALITY_PRESETS = {
      fast: {
        plannerMaxSteps: 1,
        summaryChunkSize: 1600,
        summaryOverlap: 80,
        summaryMaxSteps: 10,
        summaryMaxChars: 1200,
        recursiveThresholdItems: 18,
        recursiveBatchSize: 6,
        recursiveMaxDepth: 2,
        evidenceQueries: 2,
        evidenceHitsPerQuery: 2,
        maxIterations: 2
      },
      balanced: {
        plannerMaxSteps: 2,
        summaryChunkSize: 1200,
        summaryOverlap: 120,
        summaryMaxSteps: 20,
        summaryMaxChars: 1800,
        recursiveThresholdItems: 16,
        recursiveBatchSize: 5,
        recursiveMaxDepth: 3,
        evidenceQueries: 4,
        evidenceHitsPerQuery: 3,
        maxIterations: 4
      },
      deep: {
        plannerMaxSteps: 4,
        summaryChunkSize: 900,
        summaryOverlap: 150,
        summaryMaxSteps: 50,
        summaryMaxChars: 8000,
        recursiveThresholdItems: 12,
        recursiveBatchSize: 4,
        recursiveMaxDepth: 5,
        evidenceQueries: 6,
        evidenceHitsPerQuery: 4,
        maxIterations: 6
      }
    };

    const BUDGET_PRESETS = {
      fast: {
        maxToolCalls: 20,
        maxRecursionDepth: 2,
        maxChunksProcessed: 24,
        maxRuntimeMs: 20000,
        maxEvidenceHits: 16
      },
      balanced: {
        maxToolCalls: 40,
        maxRecursionDepth: 3,
        maxChunksProcessed: 48,
        maxRuntimeMs: 45000,
        maxEvidenceHits: 28
      },
      deep: {
        maxToolCalls: 80,
        maxRecursionDepth: 5,
        maxChunksProcessed: 120,
        maxRuntimeMs: 90000,
        maxEvidenceHits: 64
      }
    };

    function normalizeQuality(value) {
      const q = String(value || '').trim().toLowerCase();
      if (q === 'fast' || q === 'balanced' || q === 'deep') return q;
      return 'balanced';
    }

    function getPreset() {
      return QUALITY_PRESETS[normalizeQuality(getRlmQuality())] || QUALITY_PRESETS.balanced;
    }

    function normalizeBudgetValue(value, fallback, min, max) {
      const num = Number(value);
      if (!Number.isFinite(num)) return fallback;
      return Math.max(min, Math.min(max, Math.floor(num)));
    }

    function getBudgetPreset() {
      return BUDGET_PRESETS[normalizeQuality(getRlmQuality())] || BUDGET_PRESETS.balanced;
    }

    function getEffectiveBudgets() {
      const base = getBudgetPreset();
      const override = (getRlmBudgets && typeof getRlmBudgets === 'function') ? (getRlmBudgets() || {}) : {};
      return {
        maxToolCalls: normalizeBudgetValue(override.maxToolCalls, base.maxToolCalls, 4, 400),
        maxRecursionDepth: normalizeBudgetValue(override.maxRecursionDepth, base.maxRecursionDepth, 1, 12),
        maxChunksProcessed: normalizeBudgetValue(override.maxChunksProcessed, base.maxChunksProcessed, 4, 500),
        maxRuntimeMs: normalizeBudgetValue(override.maxRuntimeMs, base.maxRuntimeMs, 2000, 300000),
        maxEvidenceHits: normalizeBudgetValue(override.maxEvidenceHits, base.maxEvidenceHits, 4, 400)
      };
    }

    function plannerSystemPrompt() {
      return [
        'You are a strict planner. Output JSON only, no prose, no markdown.',
        'Valid tools: list_attachments, read_attachment, search_attachment, summarize_text.',
        'Return schema:',
        '{"steps":[{"tool":"...","args":{...}}],"reason":"short"}',
        'Compatibility schema also accepted:',
        '{"tool":"...","args":{...},"reason":"short"}',
        'Rules:',
        '- Use 1 to 4 steps only.',
        '- If attachment selection is unclear, include list_attachments first.',
        '- Keep args minimal and deterministic.',
        '- Never include code fences.'
      ].join('\n');
    }

    function parsePlannerJson(raw) {
      const text = String(raw || '').trim();
      if (!text) return null;
      const fenced = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
      try {
        return JSON.parse(fenced);
      } catch (_) {
        const start = fenced.indexOf('{');
        const end = fenced.lastIndexOf('}');
        if (start >= 0 && end > start) {
          try {
            return JSON.parse(fenced.slice(start, end + 1));
          } catch (_) {
            return null;
          }
        }
        return null;
      }
    }

    function normalizePlanSteps(plan) {
      if (!plan || typeof plan !== 'object') return [];
      if (Array.isArray(plan.steps)) {
        return plan.steps
          .filter((s) => s && typeof s === 'object')
          .map((s) => ({
            tool: String(s.tool || '').trim(),
            args: (s.args && typeof s.args === 'object') ? s.args : {}
          }))
          .filter((s) => TOOL_NAMES.includes(s.tool));
      }
      if (typeof plan.tool === 'string') {
        const single = {
          tool: String(plan.tool || '').trim(),
          args: (plan.args && typeof plan.args === 'object') ? plan.args : {}
        };
        return TOOL_NAMES.includes(single.tool) ? [single] : [];
      }
      return [];
    }

    const rlmHelpers = (window.PsfRlmCoreHelpers && typeof window.PsfRlmCoreHelpers === 'object')
      ? window.PsfRlmCoreHelpers
      : {};
    if (typeof rlmHelpers.uniqueStrings !== 'function') {
      throw new Error('RLM helpers missing: ensure shared-rlm-core-helpers.js is loaded before shared-rlm-core.js');
    }

    const runtimeFactory = (window.PsfRlmCoreRuntime && typeof window.PsfRlmCoreRuntime.createRlmCoreRuntime === 'function')
      ? window.PsfRlmCoreRuntime.createRlmCoreRuntime
      : null;
    if (!runtimeFactory) {
      throw new Error('RLM runtime missing: ensure shared-rlm-core-runtime.js is loaded before shared-rlm-core.js');
    }

    return runtimeFactory({
      getElectronAPI,
      getSessionId,
      getModelName,
      buildOllamaOptions,
      sendMessage,
      getRlmVerboseTrace,
      getRlmQuality,
      getIncludeSharedAttachments,
      getSharedAttachmentSessionId,
      onThinkingStatus,
      TOOL_NAMES,
      normalizeQuality,
      getPreset,
      getEffectiveBudgets,
      plannerSystemPrompt,
      parsePlannerJson,
      normalizePlanSteps,
      helpers: rlmHelpers
    });
  }

  window.PsfRlmShared = {
    createRlmCore
  };
})();
