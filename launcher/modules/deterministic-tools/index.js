/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const core = require('./deterministic-tools-core');
const commonPack = require('./deterministic-tools-pack-common');
const presets = require('./deterministic-tools-policy-presets');

function createDefaultRuntime(options = {}) {
  const runtime = core.createRuntime({
    maxTraces: options.maxTraces,
    policy: options.policy
  });
  runtime.registerTools(commonPack.buildCommonToolPack());
  return runtime;
}

module.exports = {
  createRuntime: core.createRuntime,
  createDefaultRuntime,
  buildCommonToolPack: commonPack.buildCommonToolPack,
  listPolicyPresets: presets.listPolicyPresets,
  getPolicyPreset: presets.getPolicyPreset
};
