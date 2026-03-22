/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
/**
 * PSF Coding Terminal - Renderer RAG Module
 */

(function() {
  'use strict';

  function createRagModule(ctx) {
    const { state, elements, api } = ctx;

    async function refreshRagBuckets() {
      if (!elements.ragBucketSelect) return;
      try {
        const config = window.electronAPI?.getCodingConfig
          ? await window.electronAPI.getCodingConfig()
          : {};
        const activeConfigBucketId = String(config?.ragBucketId || '').trim();

        let active = null;
        let buckets = [];
        if (window.electronAPI?.ragBuckets) {
          const result = await window.electronAPI.ragBuckets({});
          if (result?.success) {
            buckets = Array.isArray(result.buckets) ? result.buckets : [];
            active = result.activeBucket || null;
          }
        }

        state.ragBuckets = buckets;
        state.ragActiveBucket = {
          id: activeConfigBucketId || active?.id || '',
          label: activeConfigBucketId ? (config?.ragBucketName || activeConfigBucketId) : (active?.label || 'Auto (Project)')
        };
        renderRagBucketSelect();
      } catch (err) {
        console.warn('[CodingTerminal] RAG bucket refresh error:', err.message);
      }
    }

    function renderRagBucketSelect() {
      if (!elements.ragBucketSelect) return;
      const activeId = String(state.ragActiveBucket?.id || '').trim();
      const optionRows = ['<option value="">Auto (Project Bucket)</option>'];
      for (const bucket of state.ragBuckets || []) {
        if (!bucket?.id) continue;
        const label = bucket.label || bucket.id;
        const count = Number(bucket.count) || 0;
        optionRows.push(
          `<option value="${api.escapeHtml(bucket.id)}">${api.escapeHtml(label)} (${count})</option>`
        );
      }
      elements.ragBucketSelect.innerHTML = optionRows.join('');
      elements.ragBucketSelect.value = activeId;
    }

    async function handleSelectRagBucket() {
      const selectedId = String(elements.ragBucketSelect?.value || '').trim();
      try {
        if (!window.electronAPI?.updateCodingConfig) return;
        if (!selectedId) {
          await window.electronAPI.updateCodingConfig({ ragBucketId: '', ragBucketName: '' });
        } else {
          const bucket = (state.ragBuckets || []).find((b) => b.id === selectedId);
          await window.electronAPI.updateCodingConfig({
            ragBucketId: selectedId,
            ragBucketName: bucket?.label || selectedId
          });
        }
        await refreshRagBuckets();
        await refreshRagSources();
      } catch (err) {
        console.error('[CodingTerminal] Select RAG bucket error:', err);
        api.addSystemMessage(`RAG bucket select error: ${err.message}`);
      }
    }

    async function handleCreateRagBucket() {
      const name = await api.promptText('Enter new bucket name:', '');
      if (!name || !name.trim()) return;
      const normalized = api.normalizeBucketIdForUi(name);
      if (!normalized) {
        api.addSystemMessage('Invalid bucket name.');
        return;
      }
      const id = `bucket-${normalized}`;
      try {
        if (!window.electronAPI?.updateCodingConfig) return;
        const cfg = window.electronAPI?.getCodingConfig
          ? await window.electronAPI.getCodingConfig()
          : {};
        const existing = Array.isArray(cfg?.ragBuckets) ? cfg.ragBuckets : [];
        const next = dedupeBuckets([
          ...existing,
          { id, label: name.trim() }
        ]);
        await window.electronAPI.updateCodingConfig({
          ragBucketId: id,
          ragBucketName: name.trim(),
          ragBuckets: next
        });
        api.addSystemMessage(`Active RAG bucket: ${name.trim()}`);
        await refreshRagBuckets();
        await refreshRagSources();
      } catch (err) {
        console.error('[CodingTerminal] Create RAG bucket error:', err);
        api.addSystemMessage(`Create bucket error: ${err.message}`);
      }
    }

    async function handleDeleteRagBucket() {
      const selectedId = String(elements.ragBucketSelect?.value || '').trim();
      if (!selectedId) {
        api.addSystemMessage('Select a named bucket to delete. Auto (Project Bucket) cannot be deleted.');
        return;
      }
      const selected = (state.ragBuckets || []).find((b) => b.id === selectedId);
      const count = Number(selected?.count) || 0;
      if (count > 0) {
        api.addSystemMessage(`Bucket "${selected?.label || selectedId}" is not empty (${count} sources). Clear/manage files first.`);
        return;
      }
      const confirmed = await api.confirmAction(`Delete empty bucket "${selected?.label || selectedId}"?`);
      if (!confirmed) return;

      if (!window.electronAPI?.ragDeleteBucket) {
        api.addSystemMessage('RAG delete bucket API unavailable.');
        return;
      }
      try {
        const result = await window.electronAPI.ragDeleteBucket(selectedId);
        if (!result?.success) {
          api.addSystemMessage(`Delete bucket failed: ${result?.error || 'Unknown error'}`);
          return;
        }
        api.addSystemMessage(`Deleted bucket: ${selected?.label || selectedId}`);
        await refreshRagBuckets();
        await refreshRagSources();
      } catch (err) {
        console.error('[CodingTerminal] Delete RAG bucket error:', err);
        api.addSystemMessage(`Delete bucket error: ${err.message}`);
      }
    }

    async function refreshRagSources() {
      api.updateStatus('rag', 'Refreshing...');
      const selectedBucketId = getSelectedBucketId();
      try {
        if (window.electronAPI?.ragSources) {
          const options = { limit: 50 };
          if (selectedBucketId) options.bucketId = selectedBucketId;
          const result = await window.electronAPI.ragSources(options);
          if (result?.error) {
            api.addSystemMessage(`RAG sources warning: ${result.error}`);
          }
          updateRagSources(result.results || [], { replace: true });
        } else if (window.electronAPI?.ragQuery) {
          const options = { topK: 8, threshold: 0.2, mode: 'hybrid' };
          if (selectedBucketId) options.bucketId = selectedBucketId;
          const result = await window.electronAPI.ragQuery('project source files', options);
          if (result?.error) {
            api.addSystemMessage(`RAG query warning: ${result.error}`);
          }
          updateRagSources(result.results || [], { replace: true });
        }
      } catch (err) {
        console.error('[CodingTerminal] RAG refresh error:', err);
      } finally {
        api.updateStatus('rag', buildRagStatusText(state.ragSources));
      }
    }

    async function handleAttachRagFolder() {
      try {
        if (!window.electronAPI?.selectCodingProjectFolder) {
          api.addSystemMessage('Project folder picker unavailable.');
          return;
        }

        const selected = await window.electronAPI.selectCodingProjectFolder();
        if (!selected?.success || !selected.path) {
          if (!selected?.canceled) {
            api.addSystemMessage(`Attach folder failed: ${selected?.message || 'Unknown error'}`);
          }
          return;
        }

        if (window.electronAPI?.setCodingProject) {
          const setRes = await window.electronAPI.setCodingProject(selected.path);
          if (setRes?.success === false) {
            api.addSystemMessage(`Set project failed: ${setRes?.error || setRes?.message || 'Unknown error'}`);
            return;
          }
        }

        state.projectPath = selected.path;
        api.addSystemMessage(`Project attached: ${selected.path}`);
        await api.refreshEditorFiles();
        await api.refreshGitStatus();
      } catch (err) {
        console.error('[CodingTerminal] Attach folder error:', err);
        api.addSystemMessage(`Attach folder error: ${err.message}`);
      }
    }

    async function handleIndexProject() {
      if (state.ragIndexing) return;
      if (!window.electronAPI?.ragIndex) {
        api.addSystemMessage('RAG indexing API unavailable.');
        return;
      }

      let projectPath = state.projectPath;
      if (!projectPath && window.electronAPI?.getCodingProject) {
        projectPath = await window.electronAPI.getCodingProject();
        state.projectPath = projectPath || null;
      }

      if (!projectPath) {
        api.addSystemMessage('No project attached. Click 📁 to select a folder first.');
        return;
      }

      state.ragIndexing = true;
      state.ragProgress = null;
      state.ragIndexRunId = null;
      state.ragLastProgressUiAt = 0;
      api.updateRagButtons();
      api.updateRagIndexInfo('Starting index...');
      api.updateStatus('rag', 'Indexing...');
      api.addSystemMessage(`RAG indexing started: ${projectPath}`);

      try {
        const options = {};
        const selectedBucketId = getSelectedBucketId();
        if (selectedBucketId) options.bucketId = selectedBucketId;
        const result = await window.electronAPI.ragIndex([projectPath], options);
        if (result?.runId) {
          state.ragIndexRunId = result.runId;
        }
        if (result?.success === false) {
          api.addSystemMessage(`RAG index failed: ${result?.error || 'Unknown error'}`);
        } else {
          const indexed = result?.indexed ?? 0;
          const skipped = result?.skipped ?? 0;
          const errors = Array.isArray(result?.errors) ? result.errors : [];
          api.addSystemMessage(`RAG indexed: ${indexed} files (skipped: ${skipped}, errors: ${errors.length})`);
          if (errors.length > 0) {
            const sample = errors.slice(0, 3)
              .map((e) => `${e.path || 'unknown'} -> ${e.error || 'error'}`)
              .join('\n');
            api.addSystemMessage(`RAG error samples:\n${sample}${errors.length > 3 ? `\n...and ${errors.length - 3} more` : ''}`);
          }
          await refreshRagSources();
        }
      } catch (err) {
        console.error('[CodingTerminal] RAG index error:', err);
        api.addSystemMessage(`RAG index error: ${err.message}`);
      } finally {
        state.ragIndexing = false;
        state.ragProgress = null;
        state.ragIndexRunId = null;
        api.updateRagButtons();
        api.updateRagIndexInfo('');
      }
    }

    async function handleClearRagSources() {
      if (!window.electronAPI?.ragClearIndex) {
        api.addSystemMessage('RAG clear API unavailable.');
        return;
      }
      const confirmed = await api.confirmAction('Clear all indexed RAG sources for this terminal?');
      if (!confirmed) return;

      api.updateStatus('rag', 'Clearing...');
      try {
        const options = {};
        const selectedBucketId = getSelectedBucketId();
        if (selectedBucketId) options.bucketId = selectedBucketId;
        const result = await window.electronAPI.ragClearIndex(options);
        if (!result?.success) {
          api.addSystemMessage(`RAG clear failed: ${result?.error || 'Unknown error'}`);
          return;
        }
        state.ragSources = [];
        renderRagSources();
        api.updateStatus('rag', '0 sources');
        api.addSystemMessage('RAG index cleared.');
        await refreshRagSources();
      } catch (err) {
        console.error('[CodingTerminal] RAG clear error:', err);
        api.addSystemMessage(`RAG clear error: ${err.message}`);
      }
    }

    async function handleRagSourceClick(event) {
      const removeBtn = event.target?.closest?.('[data-rag-remove-path]');
      if (!removeBtn) return;
      const encodedPath = removeBtn.dataset.ragRemovePath || '';
      let filePath = '';
      try {
        filePath = decodeURIComponent(encodedPath);
      } catch {
        filePath = encodedPath;
      }
      if (!filePath) return;
      await removeRagSourcePath(filePath);
    }

    async function removeRagSourcePath(filePath) {
      if (!window.electronAPI?.ragRemovePaths) {
        api.addSystemMessage('RAG remove API unavailable.');
        return;
      }
      const confirmed = await api.confirmAction(`Remove from RAG index?\n${filePath}`);
      if (!confirmed) return;

      try {
        const options = {};
        const selectedBucketId = getSelectedBucketId();
        if (selectedBucketId) options.bucketId = selectedBucketId;
        const result = await window.electronAPI.ragRemovePaths([filePath], options);
        if (!result?.success) {
          api.addSystemMessage(`RAG remove failed: ${result?.error || 'Unknown error'}`);
          return;
        }
        state.ragSources = state.ragSources.filter((src) => src?.metadata?.filePath !== filePath);
        renderRagSources();
        api.updateStatus('rag', buildRagStatusText(state.ragSources));
        api.addSystemMessage(`RAG source removed: ${filePath}`);
        await refreshRagSources();
      } catch (err) {
        console.error('[CodingTerminal] RAG remove error:', err);
        api.addSystemMessage(`RAG remove error: ${err.message}`);
      }
    }

    function updateRagSources(sources, options = {}) {
      const replace = !!options.replace;
      const incoming = normalizeRagSources(sources);
      if (replace || state.ragSources.length === 0) {
        state.ragSources = incoming;
      } else {
        state.ragSources = mergeRagSources(state.ragSources, incoming);
      }
      renderRagSources();
      api.updateStatus('rag', buildRagStatusText(state.ragSources));
    }

    function renderRagSources() {
      if (!elements.ragSources) return;
      if (state.ragSources.length === 0) {
        elements.ragSources.innerHTML = '<p class="ct-placeholder">No sources indexed yet.</p>';
        return;
      }

      elements.ragSources.innerHTML = state.ragSources.map(src => {
        const filePath = src.metadata?.filePath || 'Unknown';
        const score = typeof src.score === 'number' ? `${(src.score * 100).toFixed(0)}%` : '--';
        const retrieval = src.metadata?.retrieval || 'unknown';
        const bucketLabel = src.metadata?.bucketLabel || src.metadata?.bucketId || '';
        const lineSpan = formatLineSpan(src.metadata?.startLine, src.metadata?.endLine);
        const matched = Array.isArray(src.metadata?.matchedKeywords) && src.metadata.matchedKeywords.length > 0
          ? `kw: ${src.metadata.matchedKeywords.slice(0, 4).join(', ')}`
          : '';

        return `
          <div class="ct-rag-item">
            <div class="ct-rag-top">
              <span class="ct-rag-file">${api.escapeHtml(filePath)}</span>
              <span class="ct-rag-right">
                <span class="ct-rag-score">${score}</span>
                <button class="ct-btn ct-btn-tiny ct-rag-remove" data-rag-remove-path="${encodeURIComponent(filePath)}" title="Remove from RAG index">✕</button>
              </span>
            </div>
            <div class="ct-rag-debug">
              <span class="ct-rag-tag">${api.escapeHtml(retrieval)}</span>
              ${bucketLabel ? `<span class="ct-rag-tag">${api.escapeHtml(bucketLabel)}</span>` : ''}
              ${lineSpan ? `<span class="ct-rag-lines">${lineSpan}</span>` : ''}
            </div>
            ${matched ? `<div class="ct-rag-match">${api.escapeHtml(matched)}</div>` : ''}
          </div>
        `;
      }).join('');
    }

    function formatLineSpan(start, end) {
      if (typeof start !== 'number' || typeof end !== 'number') return '';
      return `L${start + 1}-L${end + 1}`;
    }

    function buildRagStatusText(sources = []) {
      const total = Array.isArray(sources) ? sources.length : 0;
      if (total === 0) return '0 sources';
      let semantic = 0;
      let source = 0;
      for (const s of sources) {
        const retrieval = String(s?.metadata?.retrieval || '').toLowerCase();
        if (retrieval.includes('semantic')) semantic += 1;
        else if (retrieval.includes('source')) source += 1;
      }
      return `${total} sources (${semantic} sem / ${source} src)`;
    }

    function normalizeRagSources(sources) {
      if (!Array.isArray(sources)) return [];
      return sources.filter((s) => s && s.metadata && s.metadata.filePath);
    }

    function mergeRagSources(existing, incoming) {
      const merged = [];
      const seen = new Set();
      const all = [...incoming, ...existing];
      for (const src of all) {
        const md = src.metadata || {};
        const key = `${md.filePath || ''}:${md.startLine ?? -1}:${md.endLine ?? -1}:${md.retrieval || ''}`;
        if (!md.filePath || seen.has(key)) continue;
        seen.add(key);
        merged.push(src);
        if (merged.length >= 80) break;
      }
      return merged;
    }

    function getSelectedBucketId() {
      return String(elements.ragBucketSelect?.value || '').trim();
    }

    return {
      refreshRagBuckets,
      renderRagBucketSelect,
      handleSelectRagBucket,
      handleCreateRagBucket,
      handleDeleteRagBucket,
      refreshRagSources,
      handleAttachRagFolder,
      handleIndexProject,
      handleClearRagSources,
      handleRagSourceClick,
      removeRagSourcePath,
      updateRagSources,
      renderRagSources,
      formatLineSpan,
      buildRagStatusText,
      normalizeRagSources,
      mergeRagSources
    };
  }

  function dedupeBuckets(items) {
    const map = new Map();
    for (const item of items || []) {
      const id = normalizeBucketId(item?.id || '');
      if (!id) continue;
      map.set(id, {
        id,
        label: String(item?.label || id)
      });
    }
    return [...map.values()];
  }

  function normalizeBucketId(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  window.CodingTerminalRendererRag = {
    createRagModule
  };
})();
