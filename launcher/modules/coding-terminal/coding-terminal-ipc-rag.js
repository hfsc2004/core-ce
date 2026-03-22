/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
/**
 * PSF Coding Terminal - RAG IPC Handlers
 */

function registerRagHandlers({
  register,
  codingTerminalCommon,
  ragEngine,
  ensureRagReady,
  checkPermission,
  resolveActiveRagBucket
}) {
  register('coding-terminal:rag-query', async (event, query, options = {}) => {
    try {
      const init = await ensureRagReady();
      if (!init.success) {
        return { results: [], error: init.error };
      }
      const allowed = await checkPermission('rag:query');
      if (!allowed) {
        return { results: [], error: 'Permission denied: rag:query' };
      }
      const bucket = resolveActiveRagBucket(options);
      return await ragEngine.query(query, {
        ...options,
        bucketId: bucket.id
      });
    } catch (err) {
      console.error('[CodingTerminal:IPC:RAG] RAG query error:', err);
      return { results: [], error: err.message };
    }
  });

  register('coding-terminal:rag-sources', async (event, options = {}) => {
    try {
      const init = await ensureRagReady();
      if (!init.success) {
        return { results: [], error: init.error };
      }
      const allowed = await checkPermission('rag:query');
      if (!allowed) {
        return { results: [], error: 'Permission denied: rag:query' };
      }
      const bucket = resolveActiveRagBucket(options);
      return await ragEngine.listSources({
        ...options,
        bucketId: bucket.id
      });
    } catch (err) {
      console.error('[CodingTerminal:IPC:RAG] RAG sources error:', err);
      return { results: [], error: err.message };
    }
  });

  register('coding-terminal:rag-index', async (event, paths, options = {}) => {
    try {
      const init = await ensureRagReady();
      if (!init.success) {
        return { success: false, error: init.error };
      }
      const allowed = await checkPermission('rag:index');
      if (!allowed) {
        return { success: false, error: 'Permission denied: rag:index' };
      }
      const runId = codingTerminalCommon.generateId();
      const bucket = resolveActiveRagBucket(options);
      const result = await ragEngine.indexPaths(paths, {
        ...options,
        bucketId: bucket.id,
        bucketLabel: bucket.label,
        onProgress: (progress) => {
          event.sender.send('coding-terminal:rag-index-progress', {
            runId,
            ...progress
          });
        }
      });
      return { ...result, runId };
    } catch (err) {
      console.error('[CodingTerminal:IPC:RAG] RAG index error:', err);
      return { success: false, error: err.message };
    }
  });

  register('coding-terminal:rag-remove-paths', async (event, paths, options = {}) => {
    try {
      const init = await ensureRagReady();
      if (!init.success) {
        return { success: false, error: init.error };
      }
      const allowed = await checkPermission('rag:index');
      if (!allowed) {
        return { success: false, error: 'Permission denied: rag:index' };
      }

      const pathList = Array.isArray(paths) ? paths.filter(Boolean) : [];
      if (pathList.length === 0) {
        return { success: false, error: 'No RAG paths provided for removal.' };
      }

      const bucket = resolveActiveRagBucket(options || {});
      return await ragEngine.removePaths(pathList, { bucketId: bucket.id });
    } catch (err) {
      console.error('[CodingTerminal:IPC:RAG] RAG remove error:', err);
      return { success: false, error: err.message };
    }
  });

  register('coding-terminal:rag-clear-index', async (event, options = {}) => {
    try {
      const init = await ensureRagReady();
      if (!init.success) {
        return { success: false, error: init.error };
      }
      const allowed = await checkPermission('rag:index');
      if (!allowed) {
        return { success: false, error: 'Permission denied: rag:index' };
      }

      const bucket = resolveActiveRagBucket(options || {});
      const ok = await ragEngine.clearIndex({ bucketId: bucket.id });
      return ok
        ? { success: true, bucketId: bucket.id }
        : { success: false, error: 'Unable to clear RAG index.' };
    } catch (err) {
      console.error('[CodingTerminal:IPC:RAG] RAG clear error:', err);
      return { success: false, error: err.message };
    }
  });

  register('coding-terminal:rag-buckets', async (event, options = {}) => {
    try {
      const init = await ensureRagReady();
      if (!init.success) {
        return { success: false, buckets: [], error: init.error };
      }
      const allowed = await checkPermission('rag:query');
      if (!allowed) {
        return { success: false, buckets: [], error: 'Permission denied: rag:query' };
      }

      const activeBucket = resolveActiveRagBucket(options);
      const listed = await ragEngine.listBuckets();
      if (!listed?.success) {
        return {
          success: false,
          buckets: [],
          activeBucket,
          error: listed?.error || 'Unable to list buckets.'
        };
      }

      const configuredBuckets = getConfiguredBuckets(codingTerminalCommon.getConfig());
      const merged = mergeBucketLists(listed.buckets || [], configuredBuckets, activeBucket);

      return {
        success: true,
        buckets: merged,
        totalFound: merged.length,
        activeBucket
      };
    } catch (err) {
      console.error('[CodingTerminal:IPC:RAG] RAG buckets error:', err);
      return { success: false, buckets: [], error: err.message };
    }
  });

  register('coding-terminal:rag-delete-bucket', async (event, bucketId) => {
    try {
      const id = normalizeBucketId(bucketId);
      if (!id) {
        return { success: false, error: 'Bucket id is required.' };
      }
      if (id === 'default') {
        return { success: false, error: 'Default bucket cannot be deleted.' };
      }

      const init = await ensureRagReady();
      if (!init.success) {
        return { success: false, error: init.error };
      }
      const allowed = await checkPermission('rag:index');
      if (!allowed) {
        return { success: false, error: 'Permission denied: rag:index' };
      }

      const listed = await ragEngine.listBuckets();
      if (!listed?.success) {
        return { success: false, error: listed?.error || 'Unable to list buckets.' };
      }
      const engineBucket = (listed.buckets || []).find((b) => normalizeBucketId(b?.id) === id);
      const count = Number(engineBucket?.count) || 0;
      if (count > 0) {
        return {
          success: false,
          error: `Bucket "${id}" is not empty (${count} sources). Empty it before deletion.`
        };
      }

      const cfg = codingTerminalCommon.getConfig();
      const current = getConfiguredBuckets(cfg);
      const next = current.filter((b) => normalizeBucketId(b.id) !== id);
      const updates = { ragBuckets: next };
      if (normalizeBucketId(cfg.ragBucketId) === id) {
        updates.ragBucketId = '';
        updates.ragBucketName = '';
      }
      codingTerminalCommon.updateConfig(updates);

      return { success: true, deleted: id };
    } catch (err) {
      console.error('[CodingTerminal:IPC:RAG] RAG delete bucket error:', err);
      return { success: false, error: err.message };
    }
  });
}

function normalizeBucketId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function getConfiguredBuckets(config) {
  const list = Array.isArray(config?.ragBuckets) ? config.ragBuckets : [];
  return list
    .map((b) => ({
      id: normalizeBucketId(b?.id),
      label: String(b?.label || b?.id || '').trim()
    }))
    .filter((b) => b.id);
}

function mergeBucketLists(engineBuckets, configuredBuckets, activeBucket) {
  const byId = new Map();
  for (const b of engineBuckets || []) {
    const id = normalizeBucketId(b?.id);
    if (!id) continue;
    byId.set(id, {
      id,
      label: String(b?.label || id),
      count: Number(b?.count) || 0,
      lastIndexedAt: Number(b?.lastIndexedAt) || 0
    });
  }
  for (const b of configuredBuckets || []) {
    const id = normalizeBucketId(b?.id);
    if (!id) continue;
    const existing = byId.get(id);
    if (existing) {
      if (b.label) existing.label = b.label;
      continue;
    }
    byId.set(id, { id, label: b.label || id, count: 0, lastIndexedAt: 0 });
  }
  const activeId = normalizeBucketId(activeBucket?.id);
  if (activeId && !byId.has(activeId) && activeId !== 'default') {
    byId.set(activeId, {
      id: activeId,
      label: String(activeBucket?.label || activeId),
      count: 0,
      lastIndexedAt: 0
    });
  }
  return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
}

module.exports = {
  registerRagHandlers
};
