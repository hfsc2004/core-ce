/**
 * ============================================================================
 * MOE PIPELINE OPS - Shared Utilities
 * ============================================================================
 * 
 * Shared helpers used across split MoE ops modules.
 * 
 * IMPORTANT: MoE does NOT download models from Ollama registry!
 * Models must be downloaded via Browse & Download, then wrapped via Launch.
 * This module stores collectionKey/filename so deployment can find local GGUFs.
 * 
 * @module moe-pipeline-ops
 * @version 1.1.2 - March 5, 2026
 * ============================================================================
 */

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

window.escapeHtml = escapeHtml;
