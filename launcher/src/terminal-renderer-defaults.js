/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
(function() {
  'use strict';

  function defaultRlmBudgets() {
    return {
      maxToolCalls: 40,
      maxRecursionDepth: 3,
      maxChunksProcessed: 48,
      maxRuntimeMs: 45000,
      maxEvidenceHits: 28
    };
  }

  function createFallbackPreferenceApi() {
    return {
      loadAssisted: () => false,
      setAssisted: () => {},
      loadVerboseTrace: () => false,
      setVerboseTrace: () => {},
      loadQuality: () => 'balanced',
      setQuality: () => {},
      loadProfile: () => 'balanced',
      setProfile: () => {},
      loadAdvancedBudgets: () => false,
      setAdvancedBudgets: () => {},
      loadIncludeSharedAttachments: () => false,
      setIncludeSharedAttachments: () => {},
      normalizeBudgets: () => defaultRlmBudgets(),
      loadBudgets: () => defaultRlmBudgets(),
      setBudgets: () => {},
      loadLlmAssistedFileNaming: () => true,
      setLlmAssistedFileNaming: () => {}
    };
  }

  window.TerminalRendererDefaults = {
    defaultRlmBudgets,
    createFallbackPreferenceApi
  };
})();

