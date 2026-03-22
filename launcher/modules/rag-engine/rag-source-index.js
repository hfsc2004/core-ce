/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * RAG source index storage helpers.
 */

function createSourceIndexStore({ sourceIndexPath, fs, path }) {
  function normalizeBucketId(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function normalizePathForCompare(value) {
    return String(value || '')
      .trim()
      .replace(/\\/g, '/')
      .replace(/\/+$/, '')
      .toLowerCase();
  }

  function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  function sourceKey(entry) {
    const md = entry?.metadata || {};
    if (!md.filePath) return '';
    const bucketId = normalizeBucketId(md.bucketId || 'default') || 'default';
    return `${bucketId}:${md.filePath}:${md.startLine ?? -1}:${md.endLine ?? -1}`;
  }

  function readSourceIndex() {
    try {
      if (!fs.existsSync(sourceIndexPath)) return [];
      const raw = fs.readFileSync(sourceIndexPath, 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeSourceIndex(entries) {
    try {
      const dir = path.dirname(sourceIndexPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(sourceIndexPath, JSON.stringify(entries, null, 2), 'utf8');
    } catch (err) {
      console.warn('[RAG] Failed to write source index:', err.message);
    }
  }

  function mergeSourceIndex(entries) {
    if (!Array.isArray(entries) || entries.length === 0) return;
    const current = readSourceIndex();
    const byKey = new Map();

    for (const e of current) {
      const key = sourceKey(e);
      if (key) byKey.set(key, e);
    }
    for (const e of entries) {
      const bucketId = normalizeBucketId(e?.metadata?.bucketId || e?.bucketId || 'default') || 'default';
      const bucketLabel = String(e?.metadata?.bucketLabel || e?.bucketLabel || bucketId);
      const normalized = {
        id: e.id || `source_${simpleHash(`${e.filePath || e.metadata?.filePath}:${e.startLine || e.metadata?.startLine || 0}`)}`,
        score: 1,
        metadata: {
          ...(e.metadata || e),
          retrieval: 'indexed-source',
          bucketId,
          bucketLabel
        }
      };
      const key = sourceKey(normalized);
      if (key) byKey.set(key, normalized);
    }

    const merged = [...byKey.values()]
      .sort((a, b) => (b?.metadata?.indexedAt || 0) - (a?.metadata?.indexedAt || 0))
      .slice(0, 5000);

    writeSourceIndex(merged);
  }

  function removeSourceEntriesByPaths(paths, options = {}) {
    const normalizedTargets = (Array.isArray(paths) ? paths : [paths])
      .map(normalizePathForCompare)
      .filter(Boolean);
    const bucketId = normalizeBucketId(options.bucketId || 'default') || 'default';
    if (normalizedTargets.length === 0) return 0;

    const current = readSourceIndex();
    if (current.length === 0) return 0;

    const kept = current.filter((entry) => {
      const entryBucket = normalizeBucketId(entry?.metadata?.bucketId || 'default') || 'default';
      if (entryBucket !== bucketId) return true;
      const filePath = normalizePathForCompare(entry?.metadata?.filePath || '');
      if (!filePath) return true;
      return !normalizedTargets.some((target) =>
        filePath === target || filePath.startsWith(`${target}/`)
      );
    });

    const removedCount = current.length - kept.length;
    if (removedCount > 0) {
      writeSourceIndex(kept);
    }
    return removedCount;
  }

  function removeSourceEntriesByBucket(bucketId) {
    const target = normalizeBucketId(bucketId || '');
    if (!target) return 0;
    const current = readSourceIndex();
    if (current.length === 0) return 0;

    const kept = current.filter((entry) => {
      const entryBucket = normalizeBucketId(entry?.metadata?.bucketId || 'default') || 'default';
      return entryBucket !== target;
    });

    const removedCount = current.length - kept.length;
    if (removedCount > 0) {
      writeSourceIndex(kept);
    }
    return removedCount;
  }

  return {
    normalizeBucketId,
    readSourceIndex,
    writeSourceIndex,
    mergeSourceIndex,
    removeSourceEntriesByPaths,
    removeSourceEntriesByBucket
  };
}

module.exports = {
  createSourceIndexStore
};
