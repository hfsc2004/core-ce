/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const path = require('path');
const { spawn } = require('child_process');
const { app } = require('electron');

function createVersionHandlers() {
  return {
    'update-version': async (ctx, event, newVersion, copyrightYear, brandingMetadata) => {
      const result = await ctx.versionManager.updateVersion(ctx.appDir, newVersion, copyrightYear, brandingMetadata);
      try {
        const plan = result?.renamePlan || {};
        if (result?.success && plan?.required && plan?.from && plan?.to) {
          const helperScript = path.join(ctx.appDir, 'modules', 'version-manager', 'version-rename-helper.js');
          const helperRunner = process.env.NODE || process.execPath;
          const payload = {
            parentPid: process.pid,
            from: plan.from,
            to: plan.to,
            relaunch: {
              execPath: process.execPath,
              args: process.argv.slice(1),
              cwd: process.cwd()
            },
            logFile: path.join(path.dirname(plan.from), `version-rename-helper-${Date.now()}.log`)
          };
          const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
          const helperEnv = {
            ...process.env,
            ELECTRON_RUN_AS_NODE: '1'
          };
          const helper = spawn(helperRunner, [helperScript, encoded], {
            detached: true,
            stdio: 'ignore',
            cwd: path.dirname(ctx.appDir),
            env: helperEnv
          });
          helper.unref();
          result.restartScheduled = true;
          result.message = `${result.message} | Restart scheduled for workspace rename.`;
          setTimeout(() => app.quit(), 350);
        }
      } catch (err) {
        result.restartScheduled = false;
        result.renameScheduleError = err.message;
      }
      return result;
    },

    'get-current-version': (ctx) => ctx.versionManager.getCurrentVersion(ctx.appDir),
    'get-version-status': (ctx) => ctx.versionManager.getVersionStatus(ctx.appDir),
    'version-manager:get-compliance-evidence': (ctx) =>
      ctx.versionManager.getComplianceEvidenceStatus(ctx.appDir),
    'version-manager:save-compliance-evidence': (ctx, event, payload) =>
      ctx.versionManager.saveComplianceEvidence(ctx.appDir, payload),
    'version-manager:add-compliance-trusted-key': (ctx, event, keyId, publicKeyPem) =>
      ctx.versionManager.addComplianceTrustedKey(ctx.appDir, keyId, publicKeyPem),
    'version-manager:remove-compliance-trusted-key': (ctx, event, keyId) =>
      ctx.versionManager.removeComplianceTrustedKey(ctx.appDir, keyId),
    'version-manager:sign-compliance-evidence': (ctx, event, options) =>
      ctx.versionManager.signComplianceEvidence(ctx.appDir, options),
    'version-manager:create-lightweight-clone': (ctx) =>
      ctx.versionManager.createLightweightProjectClone(ctx.appDir)
  };
}

module.exports = { createVersionHandlers };
