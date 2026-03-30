/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
(function catalogBrowserUtilsScope() {
  const splitFilePattern = /-(\d{5})-of-(\d{5})\.gguf$/i;

  function getMergedFilename(filename) {
    const raw = String(filename || '');
    if (!raw) return raw;
    return splitFilePattern.test(raw) ? raw.replace(splitFilePattern, '.gguf') : raw;
  }

  function escapeAttr(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function modelMatchesCatalogSearch(model, searchQuery) {
    const q = String(searchQuery || '').trim().toLowerCase();
    if (!q) return true;
    const inferParametersLabel = window.modelParameterUtils?.inferParametersLabel || (() => '');
    const parts = [
      model?.name,
      model?.id,
      model?.filename,
      model?.description,
      model?.collectionName,
      model?.model_family,
      inferParametersLabel(model)
    ]
      .map((v) => String(v || '').toLowerCase())
      .filter(Boolean);
    return parts.some((text) => text.includes(q));
  }

  window.catalogBrowserUtils = {
    getMergedFilename,
    escapeAttr,
    modelMatchesCatalogSearch
  };
})();
