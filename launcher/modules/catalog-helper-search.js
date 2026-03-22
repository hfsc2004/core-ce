/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
'use strict';

function matchesVisionCriteria(model, criteria) {
  if (criteria.vision !== undefined && model.supports_vision !== criteria.vision) {
    return false;
  }
  return true;
}

function matchesCodeCriteria(model, criteria) {
  if (criteria.code !== undefined && model.supports_code !== criteria.code) {
    return false;
  }
  return true;
}

function matchesFunctionCallingCriteria(model, criteria) {
  if (criteria.functionCalling !== undefined && model.supports_function_calling !== criteria.functionCalling) {
    return false;
  }
  return true;
}

function matchesRAMCriteria(model, criteria) {
  if (criteria.maxRAM !== undefined) {
    const modelRAM = model.recommended_ram_gb || model.min_ram_gb || 0;
    if (modelRAM > criteria.maxRAM) {
      return false;
    }
  }
  return true;
}

function matchesContextCriteria(model, criteria) {
  if (criteria.minContext !== undefined) {
    const contextLength = model.context_length || 0;
    if (contextLength < criteria.minContext) {
      return false;
    }
  }
  return true;
}

function matchesLanguageCriteria(model, criteria) {
  if (criteria.language) {
    const languages = model.languages || [];
    if (!languages.includes(criteria.language)) {
      return false;
    }
  }
  return true;
}

function matchesQuantizationCriteria(model, criteria) {
  if (criteria.quantization) {
    if (model.quantization !== criteria.quantization) {
      return false;
    }
  }
  return true;
}

function matchesCriteria(model, criteria) {
  return matchesVisionCriteria(model, criteria) &&
         matchesCodeCriteria(model, criteria) &&
         matchesFunctionCallingCriteria(model, criteria) &&
         matchesRAMCriteria(model, criteria) &&
         matchesContextCriteria(model, criteria) &&
         matchesLanguageCriteria(model, criteria) &&
         matchesQuantizationCriteria(model, criteria);
}

function searchCatalogModels(catalog, criteria = {}) {
  const results = [];
  const collections = catalog?.collections || {};

  for (const [collectionId, collection] of Object.entries(collections)) {
    for (const model of collection.models || []) {
      if (!matchesCriteria(model, criteria)) continue;
      results.push({
        ...model,
        collectionId,
        collectionName: collection.name
      });
    }
  }

  return results;
}

module.exports = {
  searchCatalogModels,
  matchesCriteria
};
