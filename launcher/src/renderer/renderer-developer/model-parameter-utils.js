/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * Shared helpers for extracting model parameter labels/counts.
 */
(function modelParameterUtilsScope() {
  function inferParametersLabel(model = {}) {
    const existing = String(model.parameters || '').trim();
    if (existing) return existing;
    const count = Number(model.parameter_count);
    if (Number.isFinite(count) && count > 0) {
      if (count >= 1e9) return (count % 1e9 === 0 ? String(count / 1e9) : (count / 1e9).toFixed(1)) + 'B';
      if (count >= 1e6) return Math.round(count / 1e6) + 'M';
    }
    const candidates = [model.name, model.id, model.filename, model.model_family];
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

  function parseParametersToCount(model = {}) {
    const label = inferParametersLabel(model);
    if (!label) return null;
    const match = String(label).match(/(\d+(?:\.\d+)?)\s*([MBT])/i);
    if (!match) return null;
    const value = Number.parseFloat(match[1]);
    if (!Number.isFinite(value)) return null;
    const unit = match[2].toUpperCase();
    const multiplier = unit === 'M' ? 1e6 : unit === 'B' ? 1e9 : unit === 'T' ? 1e12 : 1;
    return value * multiplier;
  }

  window.modelParameterUtils = {
    inferParametersLabel,
    parseParametersToCount
  };
})();
