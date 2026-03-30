/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const fs = require('fs');
const path = require('path');

function createBlobModelHandlers() {
  return {
    'get-blob-status-summary': (ctx) =>
      ctx.blobMapper.getModelStatusSummary(ctx.appDir),

    'check-model-blob-integrity': (ctx, event, modelName) =>
      ctx.blobMapper.checkModelIntegrity(modelName, ctx.appDir),

    'get-orphan-blobs': (ctx) =>
      ctx.blobMapper.findOrphanBlobs(ctx.appDir),

    'check-blob-delete-safety': (ctx, event, digest, excludeModel = null) =>
      ctx.blobMapper.canDeleteBlob(String(digest || ''), String(excludeModel || ''), ctx.appDir),

    'delete-blob-by-digest': (ctx, event, digest, options = {}) =>
      ctx.blobMapper.deleteBlobByDigest(String(digest || ''), ctx.appDir, options || {}),

    'verify-model-checksum': async (ctx, event, filepath, expectedSHA256) => {
      const fsPath = path.join(ctx.appDir, '..', String(filepath || '').trim());
      const result = await ctx.downloadManager.verifySHA256(fsPath, expectedSHA256);
      if (!result || result.success === false) {
        return {
          valid: false,
          actual: null,
          actualHash: null,
          expectedHash: expectedSHA256 || null,
          message: result?.message || 'Checksum verification failed'
        };
      }
      return {
        valid: !!result.valid,
        actual: result.actualHash || null,
        actualHash: result.actualHash || null,
        expectedHash: result.expectedHash || expectedSHA256 || null,
        message: result.message || (result.valid ? 'Checksum verified' : 'Checksum mismatch')
      };
    },

    'get-wrapped-model-names': (ctx) =>
      ctx.blobMapper.getWrappedModelNames(ctx.appDir),

    'check-model-files': (ctx, event, collectionKey, filename) => {
      const splitPattern = /-(\d{5})-of-(\d{5})\.gguf$/i;
      const actualFilename = splitPattern.test(filename)
        ? filename.replace(splitPattern, '.gguf')
        : filename;

      const ggufPath = path.join(ctx.appDir, '..', 'models', collectionKey, actualFilename);
      const downloaded = fs.existsSync(ggufPath);

      const modelName = actualFilename.replace(/\.gguf$/i, '');
      const wrapped = ctx.blobMapper.checkModelManifestExists(modelName, ctx.appDir);

      return { downloaded, wrapped, modelName };
    },

    'check-all-model-files': (ctx, event, models) => {
      const splitPattern = /-(\d{5})-of-(\d{5})\.gguf$/i;
      const wrappedNames = ctx.blobMapper.getWrappedModelNames(ctx.appDir);
      const wrappedSet = new Set(wrappedNames);
      const results = {};

      for (const model of models) {
        const { id, collectionKey, filename } = model;
        const actualFilename = splitPattern.test(filename)
          ? filename.replace(splitPattern, '.gguf')
          : filename;

        const ggufPath = path.join(ctx.appDir, '..', 'models', collectionKey, actualFilename);
        const downloaded = fs.existsSync(ggufPath);
        const modelName = actualFilename.replace(/\.gguf$/i, '');
        const wrapped = wrappedSet.has(modelName.toLowerCase());

        results[id] = { downloaded, wrapped, modelName };
      }

      return results;
    }
  };
}

module.exports = { createBlobModelHandlers };
