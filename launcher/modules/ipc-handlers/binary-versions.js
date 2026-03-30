/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
function createBinaryVersionHandlers() {
  return {
    'get-binary-versions': (ctx) => ctx.binaryManager.getBinaryVersions(ctx.appDir),
    'update-binary-version': (ctx, event, binaryType, newVersion) =>
      ctx.binaryManager.updateBinaryVersion(ctx.appDir, binaryType, newVersion),
    'check-for-binary-updates': (ctx, event, binaryType) =>
      ctx.binaryManager.checkForBinaryUpdates(ctx.appDir, binaryType),
    'delete-binaries': (ctx, event, binaryType) =>
      ctx.binaryManager.deleteBinaries(ctx.appDir, binaryType)
  };
}

module.exports = { createBinaryVersionHandlers };
