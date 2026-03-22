/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
(function initPsfVoiceToText(global) {
  'use strict';

  const controllerApi = global.PsfVoiceToTextController || {};

  function createVoiceController(options = {}) {
    if (typeof controllerApi.createVoiceController !== 'function') {
      throw new Error('PsfVoiceToTextController is not loaded.');
    }
    return controllerApi.createVoiceController(options);
  }

  global.PsfVoiceToText = {
    createVoiceController
  };
})(window);
