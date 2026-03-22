/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
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

