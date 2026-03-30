/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */

const {
  getMergedFilename: cbGetMergedFilename = (filename) => String(filename || ''),
  escapeAttr: cbEscapeAttr = (value) => String(value || ''),
  modelMatchesCatalogSearch: cbModelMatchesCatalogSearch = () => true
} = window.catalogBrowserUtils || {};

const {
  inferParametersLabel: cbInferParametersLabel = () => '',
  parseParametersToCount: cbParseParametersToCount = () => null
} = window.modelParameterUtils || {};

function uniqSorted(values = []) {
  return Array.from(new Set(values.filter(Boolean).map((v) => String(v).trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function modelSupportsRuntime(model, runtime) {
  const target = String(runtime || '').trim().toLowerCase();
  if (!target || target === 'all') return true;
  const runtimes = Array.isArray(model?.runtimes) ? model.runtimes : [];
  return runtimes.some((value) => String(value || '').trim().toLowerCase() === target);
}

function modelSupportsAccelerator(model, accelerator) {
  const target = String(accelerator || '').trim().toLowerCase();
  if (!target || target === 'all') return true;
  const accelerators = Array.isArray(model?.accelerators) ? model.accelerators : [];
  return accelerators.some((value) => String(value || '').trim().toLowerCase() === target);
}

function modelProfileAvailability(model, profile) {
  const p = String(profile || '').trim().toLowerCase();
  if (!p || p === 'all') return 'all';
  const profiles = model?.profiles && typeof model.profiles === 'object' ? model.profiles : {};
  const entry = profiles[p];
  return String(entry?.availability || '').trim().toLowerCase() || 'unknown';
}

function modelPassesProfile(model, profile) {
  const p = String(profile || '').trim().toLowerCase();
  if (!p || p === 'all') return true;
  const availability = modelProfileAvailability(model, p);
  return availability !== 'unsupported';
}

function recommendationBadge(model = {}) {
  const rec = String(model.recommendation || '').toLowerCase();
  if (!rec) return null;
  if (rec === 'recommended') return { label: 'Recommended', fg: '#b7ffcc', border: '#1f6b3a' };
  if (rec === 'good') return { label: 'Good', fg: '#9fd9ff', border: '#2a5d85' };
  if (rec === 'caution') return { label: 'Caution', fg: '#ffe08a', border: '#6d5a19' };
  if (rec === 'experimental' || rec === 'experimental-good') return { label: 'Experimental', fg: '#f2c8ff', border: '#6f42c1' };
  if (rec === 'legacy') return { label: 'Legacy', fg: '#bbbbbb', border: '#555' };
  if (rec === 'deprecated') return { label: 'Deprecated', fg: '#ffb0b0', border: '#8f2f2f' };
  return { label: rec, fg: '#ddd', border: '#666' };
}

function scoreReasonBullets(model = {}) {
  const notes = [];
  const breakdown = model?.psf_score?.breakdown || {};
  const q = Number(breakdown.quality);
  const d = Number(breakdown.deployability);
  const p = Number(breakdown.performance);
  const r = Number(breakdown.reliability);
  if (Number.isFinite(q)) {
    if (q < 60) notes.push('Quality is limited relative to newer or larger instruction models.');
    else if (q >= 80) notes.push('Quality signals are strong for this model family/tuning tier.');
  }
  if (Number.isFinite(d)) {
    if (d >= 85) notes.push('Deployability is high: complete artifacts/runtime compatibility metadata.');
    else if (d < 65) notes.push('Deployability is reduced by missing metadata or weaker runtime coverage.');
  }
  if (Number.isFinite(p)) {
    if (p >= 80) notes.push('Performance score favors low-latency, low-footprint execution.');
    else if (p < 50) notes.push('Performance score is constrained by model size/expected runtime cost.');
  }
  if (Number.isFinite(r)) {
    if (r >= 80) notes.push('Reliability score indicates stable lifecycle/checksum posture.');
    else if (r < 65) notes.push('Reliability score reduced by lifecycle risk or weak integrity signals.');
  }
  if (notes.length === 0) notes.push('Score is based on available metadata and local benchmark inputs.');
  return notes;
}

function renderCatalogBrowser() {
  const container = document.getElementById('model-grid');
  if (!container) return;
  
  const {
    catalog,
    editMode,
    viewScope,
    currentCollection,
    searchQuery,
    runtimeFilter,
    acceleratorFilter,
    profileFilter
  } = window.catalogBrowserState;
  const draftQuery = window.catalogBrowserState.searchDraft != null
    ? String(window.catalogBrowserState.searchDraft)
    : String(searchQuery || '');
  if (!catalog) return;
  
  // Build flat model list with collection info
  const allModels = [];
  for (const [collectionKey, collection] of Object.entries(catalog.collections || {})) {
    for (const model of (collection.models || [])) {
      allModels.push({
        ...model,
        collectionKey,
        collectionName: collection.name
      });
    }
  }
  
  // Count stats
  const totalModels = allModels.length;
  const downloadedCount = Object.values(window.catalogBrowserState.downloadStatus)
    .filter(s => s.downloaded).length;
  const runtimeOptions = uniqSorted(allModels.flatMap((m) => Array.isArray(m.runtimes) ? m.runtimes : []));
  const acceleratorOptions = uniqSorted(allModels.flatMap((m) => Array.isArray(m.accelerators) ? m.accelerators : []));
  
  container.innerHTML = `
    <div style="width: 95%; max-width: 1600px; margin: 0 auto;">
      
      <!-- Controls Bar -->
      <div style="background: var(--psf-accent-light, rgba(0,212,255,0.1)); border: 2px solid var(--psf-accent, #00d4ff); border-radius: 10px; padding: 15px; margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px;">
          
          <!-- Left: Stats -->
          <div style="color: #aaa; font-size: 13px;">
            📊 <span style="color: var(--psf-accent, #00d4ff); font-weight: bold;">${totalModels}</span> models in catalog · 
            <span style="color: #00ff88;">${downloadedCount}</span> downloaded
          </div>
          
          <!-- Center: View Toggle -->
          <div style="display: flex; border: 1px solid var(--psf-border, #0f3460); border-radius: 5px; overflow: hidden;">
            <button onclick="setCatalogBrowserScope('collection')" 
                    class="${viewScope === 'collection' ? 'cb-scope-btn-active' : 'cb-scope-btn'}"
                    style="padding: 8px 15px; border: none; cursor: pointer; transition: all 0.2s;">
              📁 By Collection
            </button>
            <button onclick="setCatalogBrowserScope('parameters')" 
                    class="${viewScope === 'parameters' ? 'cb-scope-btn-active' : 'cb-scope-btn'}"
                    title="Sort by parameter count (${window.catalogBrowserState.parameterSortDirection === 'desc' ? 'high to low' : 'low to high'}). Click again to toggle direction."
                    style="padding: 8px 15px; border: none; cursor: pointer; transition: all 0.2s;">
              🔢 By Parameters ${viewScope === 'parameters' ? (window.catalogBrowserState.parameterSortDirection === 'desc' ? '↓' : '↑') : ''}
            </button>
            <button onclick="setCatalogBrowserScope('all')" 
                    class="${viewScope === 'all' ? 'cb-scope-btn-active' : 'cb-scope-btn'}"
                    style="padding: 8px 15px; border: none; cursor: pointer; transition: all 0.2s;">
              🌐 All Models
            </button>
          </div>
          
          <!-- Right: Edit Mode Toggle -->
          <div style="display: flex; gap: 10px; align-items: center;">
            ${editMode ? `
              <span style="color: #ffd400; font-size: 12px;">✏️ Reorder Mode</span>
            ` : ''}
            <button onclick="toggleCatalogBrowserEditMode()" 
                    style="padding: 8px 15px; background: ${editMode ? 'rgba(255,212,0,0.2)' : 'rgba(255,255,255,0.1)'}; border: 1px solid ${editMode ? '#ffd400' : '#0f3460'}; border-radius: 5px; color: ${editMode ? '#ffd400' : '#888'}; cursor: pointer;">
              ${editMode ? '✓ Done' : '↕️ Reorder'}
            </button>
            <button onclick="refreshCatalogBrowser()" 
                    style="padding: 8px 15px; background: rgba(255,255,255,0.1); border: 1px solid var(--psf-border, #0f3460); border-radius: 5px; color: #888; cursor: pointer;">
              🔄 Refresh
            </button>
            <button onclick="toggleAllCatalogBrowserExpand()" 
                    title="${window.catalogBrowserState.allExpanded ? 'Collapse All' : 'Expand All'}"
                    style="padding: 8px 12px; background: rgba(255,255,255,0.1); border: 1px solid var(--psf-border, #0f3460); border-radius: 5px; color: #888; cursor: pointer; font-size: 16px;">
              ${window.catalogBrowserState.allExpanded ? '▲' : '▼'}
            </button>
          </div>
        </div>

        <!-- Model Search -->
        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--psf-accent-medium, rgba(0,212,255,0.2)); display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
          <label for="cb-model-search" style="color: #888; font-size: 12px;">🔎 Search:</label>
          <input id="cb-model-search" type="text" value="${cbEscapeAttr(draftQuery)}"
                 oninput="setCatalogBrowserSearchDraft(this.value)"
                 onkeydown="handleCatalogBrowserSearchKeydown(event)"
                 placeholder="Search by name, id, filename, collection..."
                 style="min-width: 320px; flex: 1; max-width: 640px; padding: 8px 10px; background: rgba(255,255,255,0.08); border: 1px solid var(--psf-border, #0f3460); border-radius: 5px; color: #fff;">
          <button onclick="applyCatalogBrowserSearch()"
                  style="padding: 8px 12px; background: var(--psf-accent-medium, rgba(0,212,255,0.2)); border: 1px solid var(--psf-accent, #00d4ff); border-radius: 5px; color: #9fe8ff; cursor: pointer;">
            Search
          </button>
          <button onclick="clearCatalogBrowserSearch()"
                  style="padding: 8px 12px; background: rgba(255,255,255,0.1); border: 1px solid var(--psf-border, #0f3460); border-radius: 5px; color: #aaa; cursor: pointer;">
            Clear
          </button>
        </div>

        <!-- Runtime/Accelerator/Profile Filters -->
        <div style="margin-top: 12px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
          <label style="color: #888; font-size: 12px;">Runtime:</label>
          <select onchange="setCatalogBrowserRuntimeFilter(this.value)"
                  style="padding: 7px 10px; background: rgba(255,255,255,0.08); border: 1px solid var(--psf-border, #0f3460); border-radius: 5px; color: #fff;">
            <option value="all" ${runtimeFilter === 'all' ? 'selected' : ''}>All</option>
            ${runtimeOptions.map((runtime) => `<option value="${cbEscapeAttr(runtime)}" ${String(runtimeFilter) === String(runtime) ? 'selected' : ''}>${runtime}</option>`).join('')}
          </select>

          <label style="color: #888; font-size: 12px;">Accelerator:</label>
          <select onchange="setCatalogBrowserAcceleratorFilter(this.value)"
                  style="padding: 7px 10px; background: rgba(255,255,255,0.08); border: 1px solid var(--psf-border, #0f3460); border-radius: 5px; color: #fff;">
            <option value="all" ${acceleratorFilter === 'all' ? 'selected' : ''}>All</option>
            ${acceleratorOptions.map((acc) => `<option value="${cbEscapeAttr(acc)}" ${String(acceleratorFilter) === String(acc) ? 'selected' : ''}>${acc}</option>`).join('')}
          </select>

          <label style="color: #888; font-size: 12px;">Profile:</label>
          <select onchange="setCatalogBrowserProfileFilter(this.value)"
                  style="padding: 7px 10px; background: rgba(255,255,255,0.08); border: 1px solid var(--psf-border, #0f3460); border-radius: 5px; color: #fff;">
            <option value="all" ${profileFilter === 'all' ? 'selected' : ''}>All</option>
            <option value="edge" ${profileFilter === 'edge' ? 'selected' : ''}>Edge</option>
            <option value="pro" ${profileFilter === 'pro' ? 'selected' : ''}>Pro</option>
            <option value="enterprise" ${profileFilter === 'enterprise' ? 'selected' : ''}>Enterprise</option>
            <option value="datacenter" ${profileFilter === 'datacenter' ? 'selected' : ''}>Datacenter</option>
          </select>
        </div>
        
        ${viewScope === 'collection' ? `
          <!-- Collection Selector -->
          <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--psf-accent-medium, rgba(0,212,255,0.2));">
            <select id="cb-collection-selector" onchange="selectCatalogBrowserCollection(this.value)"
                    style="padding: 10px 15px; background: rgba(255,255,255,0.1); border: 1px solid var(--psf-border, #0f3460); border-radius: 5px; color: #fff; min-width: 250px; font-size: 14px;">
              ${Object.entries(catalog.collections || {}).map(([key, col]) => `
                <option value="${key}" ${currentCollection === key ? 'selected' : ''}>
                  ${col.name} (${col.models?.length || 0} models)
                </option>
              `).join('')}
            </select>
          </div>
        ` : ''}
      </div>
      
      <!-- Model List -->
      <div id="cb-model-list" style="display: flex; flex-direction: column; gap: 4px;">
        ${renderCatalogBrowserModels()}
      </div>
    </div>
  `;
  
  addCatalogBrowserStyles();
}

function renderCatalogBrowserModels() {
  const { catalog, viewScope, currentCollection, searchQuery, runtimeFilter, acceleratorFilter, profileFilter } = window.catalogBrowserState;
  
  let models = [];
  
  if (viewScope === 'collection') {
    // Filter to selected collection
    const collectionKeys = Object.keys(catalog.collections || {});
    let collKey = currentCollection;
    if (!collKey || !collectionKeys.includes(collKey)) {
      collKey = collectionKeys[0] || null;
    }
    window.catalogBrowserState.currentCollection = collKey;

    const collection = collKey ? catalog.collections?.[collKey] : null;
    if (collection) {
      models = (collection.models || []).map(m => ({
        ...m,
        collectionKey: collKey,
        collectionName: collection.name
      }));
    }
  } else {
    // All models across all collections
    for (const [collectionKey, collection] of Object.entries(catalog.collections || {})) {
      for (const model of (collection.models || [])) {
        models.push({
          ...model,
          collectionKey,
          collectionName: collection.name
        });
      }
    }

    if (viewScope === 'parameters') {
      const direction = window.catalogBrowserState.parameterSortDirection === 'asc' ? 1 : -1;
      models.sort((a, b) => {
        const av = cbParseParametersToCount(a);
        const bv = cbParseParametersToCount(b);
        if (av == null && bv == null) return String(a.name || a.id || '').localeCompare(String(b.name || b.id || ''));
        if (av == null) return 1;
        if (bv == null) return -1;
        if (av === bv) return String(a.name || a.id || '').localeCompare(String(b.name || b.id || ''));
        return (av - bv) * direction;
      });
    }
  }

  if (searchQuery) {
    models = models.filter((model) => cbModelMatchesCatalogSearch(model, searchQuery));
  }
  models = models.filter((model) => modelSupportsRuntime(model, runtimeFilter));
  models = models.filter((model) => modelSupportsAccelerator(model, acceleratorFilter));
  models = models.filter((model) => modelPassesProfile(model, profileFilter));
  
  if (models.length === 0) {
    return '<p style="color: #888; text-align: center; padding: 40px;">No models found.</p>';
  }
  
  return models.map((model, index) => renderCatalogBrowserRow(model, index)).join('');
}

window.renderCatalogBrowser = renderCatalogBrowser;
window.renderCatalogBrowserModels = renderCatalogBrowserModels;
