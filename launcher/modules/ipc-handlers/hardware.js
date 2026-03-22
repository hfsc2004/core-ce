/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
function createHardwareHandlers() {
  return {
    'detect-hardware': (ctx) => ctx.gpuDetector.detectAll(ctx.appDir),

    'get-model-compatibility': async (ctx, event, model) => {
      const hardware = await ctx.gpuDetector.detectAll(ctx.appDir);
      const classification = ctx.gpuDetector.classifyForInference(hardware);
      return ctx.gpuDetector.getModelCompatibility(model, hardware, classification);
    },

    'calculate-model-requirements': (ctx, event, model) =>
      ctx.gpuDetector.calculateModelRequirements(model)
  };
}

module.exports = { createHardwareHandlers };
