/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * Deterministic Tools policy presets.
 * Keep presets simple and surface-focused so they are easy to audit.
 */

const PRESETS = Object.freeze({
  permissive: {
    defaultAllow: true,
    denyBySurface: {},
    allowBySurface: {},
    denyByRole: {},
    allowByRole: {}
  },
  rlm: {
    defaultAllow: false,
    denyBySurface: {},
    allowBySurface: {
      moe: ['chunk_text', 'find_lines', 'extract_between', 'parse_key_values', 'accumulate_summaries', 'extract_query_terms', 'rank_chunks_by_terms', 'coverage_guard'],
      'coding-terminal': ['chunk_text', 'find_lines', 'extract_between', 'parse_key_values', 'accumulate_summaries', 'extract_query_terms', 'rank_chunks_by_terms', 'coverage_guard'],
      'psf-terminal': ['chunk_text', 'find_lines', 'extract_between', 'parse_key_values', 'accumulate_summaries', 'extract_query_terms', 'rank_chunks_by_terms', 'coverage_guard']
    },
    denyByRole: {},
    allowByRole: {
      planner: ['chunk_text', 'find_lines', 'extract_between', 'parse_key_values', 'accumulate_summaries', 'extract_query_terms', 'rank_chunks_by_terms', 'coverage_guard'],
      navigator: ['chunk_text', 'find_lines', 'extract_between', 'accumulate_summaries', 'extract_query_terms', 'rank_chunks_by_terms', 'coverage_guard']
    }
  },
  irg_strict: {
    defaultAllow: false,
    denyBySurface: {},
    allowBySurface: {
      moe: ['parse_key_values', 'find_lines']
    },
    denyByRole: {},
    allowByRole: {
      gateway: ['parse_key_values', 'find_lines'],
      safety: ['find_lines']
    }
  }
});

function listPolicyPresets() {
  return Object.keys(PRESETS);
}

function getPolicyPreset(name) {
  const key = String(name || '').trim().toLowerCase();
  if (!key || !Object.prototype.hasOwnProperty.call(PRESETS, key)) return null;
  return deepClone(PRESETS[key]);
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  listPolicyPresets,
  getPolicyPreset
};
