/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
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
