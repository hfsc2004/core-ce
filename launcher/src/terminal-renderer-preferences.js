/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
/* terminal renderer preferences */
(function() {
  'use strict';

  const KEYS = {
    assisted: 'psf_terminal_rlm_assisted',
    verboseTrace: 'psf_terminal_rlm_verbose_trace',
    quality: 'psf_terminal_rlm_quality',
    profile: 'psf_terminal_rlm_profile',
    provider: 'psf_terminal_rlm_provider',
    advancedBudgets: 'psf_terminal_rlm_advanced_budgets',
    includeSharedAttachments: 'psf_terminal_rlm_include_shared_attachments',
    budgets: 'psf_terminal_rlm_budgets',
    llmAssistedFileNaming: 'psf_terminal_export_llm_assisted_file_naming',
    modelConfigOverrides: 'psf_terminal_model_config_overrides'
  };

  function createPreferenceController(storage) {
    const safeStorage = storage || window.localStorage;
    const readBool = (key, fallback = false) => {
      try {
        const raw = safeStorage.getItem(key);
        if (raw === 'true') return true;
        if (raw === 'false') return false;
      } catch (_) {}
      return fallback;
    };
    const writeBool = (key, value) => {
      try {
        safeStorage.setItem(key, value === true ? 'true' : 'false');
      } catch (_) {}
    };
    const readText = (key, fallback = '') => {
      try {
        return String(safeStorage.getItem(key) || fallback);
      } catch (_) {
        return fallback;
      }
    };
    const writeText = (key, value) => {
      try {
        safeStorage.setItem(key, String(value || ''));
      } catch (_) {}
    };
    const intInRange = (v, fallback, min, max) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return fallback;
      return Math.max(min, Math.min(max, Math.floor(n)));
    };

    function normalizeRlmQuality(value) {
      const q = String(value || '').trim().toLowerCase();
      if (q === 'fast' || q === 'balanced' || q === 'deep') return q;
      return 'balanced';
    }

    function normalizeRlmProfile(value) {
      const v = String(value || '').trim().toLowerCase();
      if (v === 'fast' || v === 'balanced' || v === 'deep' || v === 'industrial-safe' || v === 'custom') return v;
      return 'balanced';
    }

    function normalizeRlmProvider(value) {
      const v = String(value || '').trim().toLowerCase();
      if (v === 'legacy' || v === 'engine') return v;
      return 'legacy';
    }

    function normalizeRlmBudgets(value) {
      const src = (value && typeof value === 'object') ? value : {};
      return {
        maxToolCalls: intInRange(src.maxToolCalls, 40, 4, 400),
        maxRecursionDepth: intInRange(src.maxRecursionDepth, 3, 1, 12),
        maxChunksProcessed: intInRange(src.maxChunksProcessed, 48, 4, 500),
        maxRuntimeMs: intInRange(src.maxRuntimeMs, 45000, 2000, 300000),
        maxEvidenceHits: intInRange(src.maxEvidenceHits, 28, 4, 400)
      };
    }

    return {
      normalizeRlmQuality,
      normalizeRlmProfile,
      normalizeRlmBudgets,
      loadRlmAssistedPreference: () => readBool(KEYS.assisted, false),
      setRlmAssistedPreference: (value) => writeBool(KEYS.assisted, value),
      loadRlmVerboseTracePreference: () => readBool(KEYS.verboseTrace, false),
      setRlmVerboseTracePreference: (value) => writeBool(KEYS.verboseTrace, value),
      loadRlmQualityPreference: () => normalizeRlmQuality(readText(KEYS.quality, 'balanced')),
      setRlmQualityPreference: (value) => writeText(KEYS.quality, normalizeRlmQuality(value)),
      loadRlmProfilePreference: () => normalizeRlmProfile(readText(KEYS.profile, 'balanced')),
      setRlmProfilePreference: (value) => writeText(KEYS.profile, normalizeRlmProfile(value)),
      loadRlmProviderPreference: () => normalizeRlmProvider(readText(KEYS.provider, 'legacy')),
      setRlmProviderPreference: (value) => writeText(KEYS.provider, normalizeRlmProvider(value)),
      loadRlmAdvancedBudgetsPreference: () => readBool(KEYS.advancedBudgets, false),
      setRlmAdvancedBudgetsPreference: (value) => writeBool(KEYS.advancedBudgets, value),
      loadRlmIncludeSharedAttachmentsPreference: () => readBool(KEYS.includeSharedAttachments, false),
      setRlmIncludeSharedAttachmentsPreference: (value) => writeBool(KEYS.includeSharedAttachments, value),
      loadRlmBudgetsPreference: () => {
        try {
          const raw = safeStorage.getItem(KEYS.budgets);
          if (!raw) return normalizeRlmBudgets(null);
          return normalizeRlmBudgets(JSON.parse(raw));
        } catch (_) {
          return normalizeRlmBudgets(null);
        }
      },
      setRlmBudgetsPreference: (value) => {
        const normalized = normalizeRlmBudgets(value);
        try {
          safeStorage.setItem(KEYS.budgets, JSON.stringify(normalized));
        } catch (_) {}
        return normalized;
      },
      normalizeTerminalModelConfig: (value) => {
        const src = (value && typeof value === 'object') ? value : {};
        const out = {};
        const numOrNull = (v) => {
          const n = Number(v);
          return Number.isFinite(n) ? n : null;
        };
        const textOrNull = (v) => {
          const s = String(v == null ? '' : v).trim();
          return s ? s : null;
        };
        if (Object.prototype.hasOwnProperty.call(src, 'systemPrompt')) out.systemPrompt = textOrNull(src.systemPrompt);
        if (Object.prototype.hasOwnProperty.call(src, 'temperature')) out.temperature = numOrNull(src.temperature);
        if (Object.prototype.hasOwnProperty.call(src, 'top_p')) out.top_p = numOrNull(src.top_p);
        if (Object.prototype.hasOwnProperty.call(src, 'top_k')) out.top_k = numOrNull(src.top_k);
        if (Object.prototype.hasOwnProperty.call(src, 'num_ctx')) out.num_ctx = numOrNull(src.num_ctx);
        if (Object.prototype.hasOwnProperty.call(src, 'num_predict')) out.num_predict = numOrNull(src.num_predict);
        if (Object.prototype.hasOwnProperty.call(src, 'repeat_penalty')) out.repeat_penalty = numOrNull(src.repeat_penalty);
        if (Object.prototype.hasOwnProperty.call(src, 'seed')) out.seed = numOrNull(src.seed);
        if (Object.prototype.hasOwnProperty.call(src, 'stop')) out.stop = Array.isArray(src.stop) ? src.stop.map((v) => String(v || '')).filter(Boolean) : null;
        return out;
      },
      loadTerminalModelConfigOverrides: () => {
        try {
          const raw = safeStorage.getItem(KEYS.modelConfigOverrides);
          const parsed = raw ? JSON.parse(raw) : {};
          return (parsed && typeof parsed === 'object') ? parsed : {};
        } catch (_) {
          return {};
        }
      },
      saveTerminalModelConfigOverrides: (value) => {
        try {
          const next = (value && typeof value === 'object') ? value : {};
          safeStorage.setItem(KEYS.modelConfigOverrides, JSON.stringify(next));
        } catch (_) {}
      },
      loadLlmAssistedFileNamingPreference: () => readBool(KEYS.llmAssistedFileNaming, true),
      setLlmAssistedFileNamingPreference: (value) => writeBool(KEYS.llmAssistedFileNaming, value)
    };
  }

  function createPreferenceApi(preferenceController) {
    const fallbackBudgets = {
      maxToolCalls: 40,
      maxRecursionDepth: 3,
      maxChunksProcessed: 48,
      maxRuntimeMs: 45000,
      maxEvidenceHits: 28
    };
    const pc = preferenceController;
    if (!pc) {
      return {
        loadAssisted: () => false,
        setAssisted: () => {},
        loadVerboseTrace: () => false,
        setVerboseTrace: () => {},
        loadQuality: () => 'balanced',
        setQuality: () => {},
        loadProfile: () => 'balanced',
        setProfile: () => {},
        loadProvider: () => 'legacy',
        setProvider: () => {},
        loadAdvancedBudgets: () => false,
        setAdvancedBudgets: () => {},
        loadIncludeSharedAttachments: () => false,
        setIncludeSharedAttachments: () => {},
        normalizeBudgets: () => ({ ...fallbackBudgets }),
        loadBudgets: () => ({ ...fallbackBudgets }),
        setBudgets: () => {},
        loadLlmAssistedFileNaming: () => true,
        setLlmAssistedFileNaming: () => {},
        loadModelConfig: () => null,
        saveModelConfig: () => null
      };
    }
    return {
      loadAssisted: () => pc.loadRlmAssistedPreference(),
      setAssisted: (v) => pc.setRlmAssistedPreference(v === true),
      loadVerboseTrace: () => pc.loadRlmVerboseTracePreference(),
      setVerboseTrace: (v) => pc.setRlmVerboseTracePreference(v === true),
      loadQuality: () => pc.loadRlmQualityPreference(),
      setQuality: (v) => pc.setRlmQualityPreference(pc.normalizeRlmQuality(v)),
      loadProfile: () => pc.loadRlmProfilePreference(),
      setProfile: (v) => pc.setRlmProfilePreference(pc.normalizeRlmProfile(v)),
      loadProvider: () => pc.loadRlmProviderPreference(),
      setProvider: (v) => pc.setRlmProviderPreference(v),
      loadAdvancedBudgets: () => pc.loadRlmAdvancedBudgetsPreference(),
      setAdvancedBudgets: (v) => pc.setRlmAdvancedBudgetsPreference(v === true),
      loadIncludeSharedAttachments: () => pc.loadRlmIncludeSharedAttachmentsPreference(),
      setIncludeSharedAttachments: (v) => pc.setRlmIncludeSharedAttachmentsPreference(v === true),
      normalizeBudgets: (v) => pc.normalizeRlmBudgets(v),
      loadBudgets: () => pc.loadRlmBudgetsPreference(),
      setBudgets: (v) => pc.setRlmBudgetsPreference(pc.normalizeRlmBudgets(v)),
      loadLlmAssistedFileNaming: () => pc.loadLlmAssistedFileNamingPreference(),
      setLlmAssistedFileNaming: (v) => pc.setLlmAssistedFileNamingPreference(v === true),
      loadModelConfig: (modelName) => {
        const key = String(modelName || '').trim().toLowerCase();
        if (!key) return null;
        const all = pc.loadTerminalModelConfigOverrides();
        const cfg = all && typeof all === 'object' ? all[key] : null;
        if (!cfg || typeof cfg !== 'object') return null;
        return pc.normalizeTerminalModelConfig(cfg);
      },
      saveModelConfig: (modelName, config) => {
        const key = String(modelName || '').trim().toLowerCase();
        if (!key) return null;
        const all = pc.loadTerminalModelConfigOverrides();
        const next = (all && typeof all === 'object') ? { ...all } : {};
        next[key] = pc.normalizeTerminalModelConfig(config);
        pc.saveTerminalModelConfigOverrides(next);
        return next[key];
      }
    };
  }

  window.TerminalPreferences = {
    createPreferenceController,
    createPreferenceApi
  };
})();
