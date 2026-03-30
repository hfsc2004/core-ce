/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
function createFileOpsHandlers() {
  return {
    'check-file-exists': (ctx, event, filepath) =>
      ctx.downloadManager.checkFileExists(ctx.appDir, filepath),
    'delete-model': (ctx, event, filepath) =>
      ctx.downloadManager.deleteModel(ctx.appDir, filepath),
    'get-downloaded-models-with-blobs': (ctx) =>
      ctx.compileManager.getDownloadedModelsWithBlobs(ctx.appDir)
  };
}

module.exports = { createFileOpsHandlers };
