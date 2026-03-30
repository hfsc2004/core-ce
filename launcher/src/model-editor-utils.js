/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * Model Editor renderer utilities.
 */
(function() {
  'use strict';

  function inferParametersLabel(model) {
    const existing = String((model && model.parameters) || '').trim();
    if (existing) return existing;
    const count = Number(model && model.parameter_count);
    if (Number.isFinite(count) && count > 0) {
      if (count >= 1e9) return (count % 1e9 === 0 ? String(count / 1e9) : (count / 1e9).toFixed(1)) + 'B';
      if (count >= 1e6) return Math.round(count / 1e6) + 'M';
    }
    const candidates = [model && model.name, model && model.id, model && model.filename, model && model.model_family];
    for (const c of candidates) {
      const text = String(c || '');
      if (!text) continue;
      const mb = text.match(/(\d+(?:\.\d+)?)\s*[bB](?:\b|[-_])/);
      if (mb) return mb[1] + 'B';
      const mm = text.match(/(\d+(?:\.\d+)?)\s*[mM](?:\b|[-_])/);
      if (mm) return mm[1] + 'M';
    }
    return '';
  }

  function setFieldValue(id, value) {
    const field = document.getElementById(id);
    if (field && value !== undefined && value !== null) {
      field.value = value;
    }
  }

  function setFieldChecked(id, checked) {
    const field = document.getElementById(id);
    if (field) {
      field.checked = !!checked;
    }
  }

  function showStatus(elementId, type, message) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.className = 'status-msg status-' + type;
    el.textContent = message;
  }

  window.ModelEditorUtils = {
    inferParametersLabel,
    setFieldValue,
    setFieldChecked,
    showStatus
  };
})();
