/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const fs = require('fs');
const path = require('path');
const { BrowserWindow } = require('electron');

function createSettingsHandlers() {
  return {
    'get-settings': (ctx) => ctx.settingsManager.getSettings(ctx.appDir),
    'save-settings': (ctx, event, settings) => ctx.settingsManager.saveSettings(ctx.appDir, settings),
    'get-hf-token': (ctx) => ctx.settingsManager.getHFToken(ctx.appDir),
    'get-theme': (ctx) => ctx.settingsManager.getTheme(ctx.appDir),
    'save-theme': (ctx, event, theme) => {
      const result = ctx.settingsManager.setTheme(ctx.appDir, theme);
      if (result?.success) {
        const appliedTheme = result.theme || ctx.settingsManager.getTheme(ctx.appDir);
        for (const win of BrowserWindow.getAllWindows()) {
          try {
            if (!win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
              win.webContents.send('theme-updated', appliedTheme);
            }
          } catch (_err) {
            // Ignore individual window dispatch errors
          }
        }
      }
      return result;
    },
    'get-available-logo-files': (ctx) => {
      try {
        const assetsDir = path.join(ctx.appDir, 'assets');
        if (!fs.existsSync(assetsDir)) {
          return { success: false, logos: [], error: `Assets directory not found: ${assetsDir}` };
        }
        const logos = fs
          .readdirSync(assetsDir, { withFileTypes: true })
          .filter((entry) => entry.isFile())
          .map((entry) => entry.name)
          .filter((name) => /\.(png|jpe?g|webp|gif|svg)$/i.test(name))
          .sort((a, b) => a.localeCompare(b));
        return { success: true, logos };
      } catch (err) {
        return { success: false, logos: [], error: err.message };
      }
    },
    'get-gpu-monitor-enabled': (ctx) => ctx.settingsManager.getGpuMonitorEnabled(ctx.appDir),
    'set-gpu-monitor-enabled': (ctx, event, enabled) =>
      ctx.settingsManager.setGpuMonitorEnabled(ctx.appDir, enabled),
    'is-gpu-monitor-running': (ctx) => ctx.sessionManager.isGpuMonitorRunning(),

    'workspace-git-status': (ctx) => ctx.workspaceGitManager.getStatus(ctx.appDir),
    'workspace-git-init': (ctx) => ctx.workspaceGitManager.initRepo(ctx.appDir),
    'workspace-git-add-all': (ctx) => ctx.workspaceGitManager.addAll(ctx.appDir),
    'workspace-git-commit': (ctx, event, message) => ctx.workspaceGitManager.commit(ctx.appDir, message),
    'workspace-git-branches': (ctx) => ctx.workspaceGitManager.listBranches(ctx.appDir),
    'workspace-git-create-branch': (ctx, event, branchName, checkout = true) =>
      ctx.workspaceGitManager.createBranch(ctx.appDir, branchName, checkout),
    'workspace-git-checkout-branch': (ctx, event, branchName) =>
      ctx.workspaceGitManager.checkoutBranch(ctx.appDir, branchName),
    'workspace-git-merge': (ctx, event, sourceBranch) =>
      ctx.workspaceGitManager.mergeBranch(ctx.appDir, sourceBranch),
    'workspace-git-history': (ctx, event, limit = 30) =>
      ctx.workspaceGitManager.getHistory(ctx.appDir, limit),
    'workspace-git-rollback': (ctx, event, targetRef, mode = 'hard', options = {}) =>
      ctx.workspaceGitManager.rollbackWithOptions(ctx.appDir, targetRef, { ...options, mode }),
    'workspace-git-policy': (ctx) => ctx.workspaceGitManager.getWorkspaceGitPolicy(),
    'workspace-git-toggle-file-tracked': (ctx, event, filePath, track = true) =>
      ctx.workspaceGitManager.toggleFileTracked(ctx.appDir, filePath, track),

    'workspace-git-open-guide': async (ctx) => {
      const guidePath = path.join(path.resolve(ctx.appDir, '..'), 'WorkspaceGitControls.md');
      if (!guidePath || !fs.existsSync(guidePath)) {
        return { success: false, error: `Guide not found: ${guidePath}` };
      }
      const openError = await ctx.shell.openPath(guidePath);
      if (openError) {
        return { success: false, error: openError };
      }
      return { success: true, path: guidePath };
    }
  };
}

module.exports = { createSettingsHandlers };
