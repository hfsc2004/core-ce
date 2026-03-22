/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
(function() {
  'use strict';

  function createRlmController(deps) {
    if (!window.PsfRlmShared || typeof window.PsfRlmShared.createRlmCore !== 'function') {
      return {
        async runSingleStep() {
          return { handled: false, error: 'Shared RLM core not loaded' };
        }
      };
    }
    return window.PsfRlmShared.createRlmCore(deps || {});
  }

  window.TerminalRlm = {
    createRlmController
  };
})();
