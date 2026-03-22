/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
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
