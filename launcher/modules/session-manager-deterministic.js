/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const deterministicTools = require('./deterministic-tools');

function createSessionManagerDeterministic() {
  let deterministicToolsRuntime = null;

  function initializeDeterministicTools() {
    if (deterministicToolsRuntime) return deterministicToolsRuntime;
    deterministicToolsRuntime = deterministicTools.createDefaultRuntime({
      maxTraces: 1000,
      policy: {
        defaultAllow: true
      }
    });
    console.log('[Session Manager] Deterministic tools runtime initialized');
    return deterministicToolsRuntime;
  }

  function listDeterministicTools() {
    const runtime = initializeDeterministicTools();
    return runtime.listTools();
  }

  async function executeDeterministicTool(toolName, args = {}, context = {}, options = {}) {
    const runtime = initializeDeterministicTools();
    return runtime.executeTool({
      toolName,
      args,
      context,
      timeoutMs: options.timeoutMs
    });
  }

  function getDeterministicToolTraces(limit = 100) {
    const runtime = initializeDeterministicTools();
    return runtime.getTraces(limit);
  }

  function clearDeterministicToolTraces() {
    const runtime = initializeDeterministicTools();
    return runtime.clearTraces();
  }

  function getDeterministicToolPolicy() {
    const runtime = initializeDeterministicTools();
    return runtime.getPolicy();
  }

  function setDeterministicToolPolicy(policy = {}) {
    const runtime = initializeDeterministicTools();
    return runtime.setPolicy(policy);
  }

  function listDeterministicToolPolicyPresets() {
    return deterministicTools.listPolicyPresets();
  }

  function applyDeterministicToolPolicyPreset(presetName) {
    const preset = deterministicTools.getPolicyPreset(presetName);
    if (!preset) {
      return { success: false, message: `Unknown deterministic tools policy preset: ${presetName}` };
    }
    return setDeterministicToolPolicy(preset);
  }

  return {
    initializeDeterministicTools,
    listDeterministicTools,
    executeDeterministicTool,
    getDeterministicToolTraces,
    clearDeterministicToolTraces,
    getDeterministicToolPolicy,
    setDeterministicToolPolicy,
    listDeterministicToolPolicyPresets,
    applyDeterministicToolPolicyPreset
  };
}

module.exports = createSessionManagerDeterministic;
