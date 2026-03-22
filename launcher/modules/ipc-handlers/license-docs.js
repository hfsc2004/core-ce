/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
const fs = require('fs');

const { resolveWorkspaceDocPath } = require('./common');

function createLicenseDocHandlers() {
  return {
    'get-license-files': (ctx) => ctx.licenseManager.getLicenseFiles(ctx.appDir),

    'get-license-content': (ctx, event, filename) =>
      ctx.licenseManager.getLicenseContent(ctx.appDir, filename),

    'get-doc-content': (ctx, event, requestedPath) => {
      const resolvedResult = resolveWorkspaceDocPath(ctx.appDir, requestedPath);
      if (resolvedResult.error) {
        return { success: false, message: resolvedResult.error };
      }
      const { raw, resolved } = resolvedResult;

      if (!fs.existsSync(resolved)) {
        return { success: false, message: `Not found: ${raw}` };
      }

      try {
        const stat = fs.statSync(resolved);
        if (stat.isDirectory()) {
          const entries = fs.readdirSync(resolved, { withFileTypes: true })
            .map((entry) => ({
              name: entry.name,
              isDirectory: entry.isDirectory(),
              path: `${raw.replace(/\\/g, '/').replace(/\/+$/, '')}/${entry.name}${entry.isDirectory() ? '/' : ''}`
            }))
            .sort((a, b) => {
              if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
              return a.name.localeCompare(b.name);
            });
          return {
            success: true,
            isDirectory: true,
            path: raw,
            entries
          };
        }

        const maxBytes = 2 * 1024 * 1024;
        if (stat.size > maxBytes) {
          return {
            success: false,
            message: `File too large for viewer (${Math.round(stat.size / 1024)} KB).`
          };
        }

        return {
          success: true,
          isDirectory: false,
          path: raw,
          content: fs.readFileSync(resolved, 'utf8')
        };
      } catch (err) {
        return { success: false, message: err.message || String(err) };
      }
    }
  };
}

module.exports = { createLicenseDocHandlers };
