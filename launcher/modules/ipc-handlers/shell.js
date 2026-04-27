/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
function createShellHandlers() {
  return {
    'open-url': (ctx, event, url) => {
      const raw = String(url || '').trim();
      if (!raw) {
        return { success: false, error: 'URL is required' };
      }
      let parsed = null;
      try {
        parsed = new URL(raw);
      } catch (_err) {
        return { success: false, error: 'Invalid URL' };
      }
      const protocol = String(parsed.protocol || '').toLowerCase();
      const allowed = protocol === 'https:' || protocol === 'http:' || protocol === 'mailto:';
      if (!allowed) {
        return { success: false, error: `Protocol not allowed: ${protocol || 'unknown'}` };
      }
      ctx.shell.openExternal(parsed.toString());
      return { success: true };
    }
  };
}

module.exports = { createShellHandlers };
