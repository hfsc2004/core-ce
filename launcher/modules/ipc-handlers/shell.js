/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
function createShellHandlers() {
  return {
    'open-url': (ctx, event, url) => {
      ctx.shell.openExternal(url);
      return { success: true };
    }
  };
}

module.exports = { createShellHandlers };
