/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
(function() {
  'use strict';

  const UI_NAV_SPLIT_FILE_PATTERN = /-(\d{5})-of-(\d{5})\.gguf$/i;

  function getMergedFilename(filename) {
    const raw = String(filename || '');
    if (!raw) return raw;
    return UI_NAV_SPLIT_FILE_PATTERN.test(raw)
      ? raw.replace(UI_NAV_SPLIT_FILE_PATTERN, '.gguf')
      : raw;
  }

  window.UINavigationShared = {
    getMergedFilename
  };
})();
