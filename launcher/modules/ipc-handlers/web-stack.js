/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
function createWebStackHandlers() {
  return {
    'check-python-webui': (ctx) => ctx.installationManager.checkPythonWebUI(ctx.appDir),
    'launch-open-webui': (ctx) => ctx.webuiManager.launchOpenWebUI(ctx.appDir),
    'kill-ollama-service': async (ctx) => {
      try {
        await ctx.webuiManager.killAllOllama();
        return { success: true, message: 'All Ollama services stopped' };
      } catch (err) {
        return { success: false, message: err.message };
      }
    },
    'check-anythingllm': (ctx) => ctx.anythingLLMManager.checkAnythingLLM(ctx.appDir),
    'launch-anythingllm': (ctx) => ctx.anythingLLMManager.launchAnythingLLM(ctx.appDir)
  };
}

module.exports = { createWebStackHandlers };
