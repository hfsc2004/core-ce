/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
function createCompileHandlers() {
  return {
    'list-compile-configs': (ctx) => ctx.compileManager.listConfigs(ctx.appDir),
    'save-compile-config': (ctx, event, config) => ctx.compileManager.saveConfig(ctx.appDir, config),
    'load-compile-config': (ctx, event, configName) => ctx.compileManager.loadConfig(ctx.appDir, configName),
    'delete-compile-config': (ctx, event, configName) => ctx.compileManager.deleteConfig(ctx.appDir, configName)
  };
}

module.exports = { createCompileHandlers };
