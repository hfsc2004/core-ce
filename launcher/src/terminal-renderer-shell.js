/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
/* terminal renderer shell */
(function() {
  'use strict';

  function createSessionActions(getSessionController) {
    function showPrompt(title, content, defaultValue = '', options = {}) {
      const sessionController = getSessionController();
      if (!sessionController || typeof sessionController.showPrompt !== 'function') {
        return Promise.resolve(null);
      }
      return sessionController.showPrompt(title, content, defaultValue, options);
    }

    function closeModal(confirmed) {
      const sessionController = getSessionController();
      if (!sessionController || typeof sessionController.closeModal !== 'function') return;
      sessionController.closeModal(confirmed);
    }

    async function promptSave() {
      const sessionController = getSessionController();
      if (!sessionController || typeof sessionController.promptSave !== 'function') return;
      await sessionController.promptSave();
    }

    async function promptLoad() {
      const sessionController = getSessionController();
      if (!sessionController || typeof sessionController.promptLoad !== 'function') return;
      await sessionController.promptLoad();
    }

    async function promptDelete() {
      const sessionController = getSessionController();
      if (!sessionController || typeof sessionController.promptDelete !== 'function') return;
      await sessionController.promptDelete();
    }

    return {
      showPrompt,
      closeModal,
      promptSave,
      promptLoad,
      promptDelete
    };
  }

  function mountTerminalApp(app) {
    window.TerminalApp = app;
  }

  window.TerminalShell = {
    createSessionActions,
    mountTerminalApp
  };
})();
