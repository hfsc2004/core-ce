/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
(function() {
  'use strict';

  const ICONS = {
    box: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path><path d="m3.3 7 8.7 5 8.7-5"></path><path d="M12 22V12"></path></svg>',
    eye: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
    download: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><rect x="4" y="17" width="16" height="4" rx="1"></rect></svg>',
    configure: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15.1 20a1.7 1.7 0 0 0-1 .35 1.7 1.7 0 0 0-.7 1.36V22a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-.7-1.36 1.7 1.7 0 0 0-1-.35 1.7 1.7 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4 15.1a1.7 1.7 0 0 0-.35-1 1.7 1.7 0 0 0-1.36-.7H2a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.36-.7 1.7 1.7 0 0 0 .35-1 1.7 1.7 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 8.9 4a1.7 1.7 0 0 0 1-.35 1.7 1.7 0 0 0 .7-1.36V2a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 .7 1.36 1.7 1.7 0 0 0 1 .35 1.7 1.7 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 20 8.9c0 .36.13.71.35 1 .32.4.82.66 1.36.7H22a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.36.7 1.7 1.7 0 0 0-.35 1Z"></path></svg>',
    cpu: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"></rect><rect x="10" y="10" width="4" height="4" rx="1"></rect><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 15h3M1 9h3M1 15h3"></path></svg>',
    launch: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 19c2.5-.8 4.6-2.4 6-4.6"></path><path d="M15 9l-1-1a7.5 7.5 0 0 1 7-5 7.5 7.5 0 0 1-5 7l-1-1"></path><path d="M9 15l-1 1a4 4 0 0 0-1 3l3-1 1-1"></path><path d="M14 10l4 4"></path></svg>',
    verify: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="9" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path></svg>',
    trash: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v6M14 11v6"></path></svg>'
  };

  async function loadModelCatalog() {
    const grid = document.getElementById('model-grid');
    grid.innerHTML = '<div class="info-loading"><div class="spinner"></div><p>Loading catalog...</p></div>';

    try {
      const skuConfig = await window.electronAPI.getSKUConfig();
      const catalog = await window.electronAPI.getMasterCatalog();

      window.skuConfig = skuConfig;
      window.catalogData = catalog;

      updatePackageTitle(skuConfig, catalog);
      displayPackageView(skuConfig, catalog);
    } catch (err) {
      console.error('Failed to load catalog:', err);
      grid.innerHTML = '<p style="color: #ff6b6b;">Failed to load model catalog. Check console for details.</p>';
    }
  }

  function updatePackageTitle(skuConfig, catalog) {
    const titleElement = document.getElementById('package-title');
    const packageName = catalog.package?.name || skuConfig.package_name || skuConfig.sku_name || 'The VAULT';

    if (titleElement) {
      titleElement.querySelector('h2').textContent = `${packageName} Collection`;
      titleElement.style.display = 'block';
    }
  }

  function displayPackageView(skuConfig, catalog) {
    const container = document.getElementById('model-grid');

    let totalModels = 0;
    for (const collection of Object.values(catalog.collections || {})) {
      totalModels += collection.models?.length || 0;
    }

    let html = `
      <div class="package-banner" onclick="toggleAllCollections()" style="cursor: pointer; user-select: none;" title="Click to expand/collapse all collections">
        <h3 style="display:flex; align-items:center; gap:8px;">${ICONS.box} ${catalog.package?.name || skuConfig.package_name}</h3>
        <p>${totalModels} models • ${catalog.package?.storage || skuConfig.storage_size} ${catalog.package?.storage_type || skuConfig.storage_type || ''}</p>
      </div>
    `;

    const collections = catalog.collections || {};
    const collectionKeys = Object.keys(collections);

    if (collectionKeys.length === 0) {
      html += '<p style="color: #aaa; text-align: center;">No collections available in this package.</p>';
    } else {
      for (const collectionKey of collectionKeys) {
        const collection = collections[collectionKey];
        const modelCount = collection.models?.length || 0;

        html += `
          <div class="collection-section">
            <div class="collection-header" onclick="toggleCollection('${collectionKey}')">
              <div class="collection-title">
                <h3>${collection.name}</h3>
                <span class="collection-count">${modelCount} model${modelCount !== 1 ? 's' : ''}</span>
              </div>
              <span class="collection-toggle" id="toggle-${collectionKey}">▼</span>
            </div>
            ${collection.description ? `<div class="collection-description">${collection.description}</div>` : ''}
            <div class="collection-models" id="models-${collectionKey}">
              ${buildModelCards(collection.models || [], collectionKey)}
            </div>
          </div>
        `;
      }
    }

    container.innerHTML = html;

    checkDownloadedModels();
    loadBlobStatus();
  }

  async function checkDownloadedModels() {
    const modelCards = document.querySelectorAll('.model-card');
    const getMergedFilename = window.UINavigationShared?.getMergedFilename || ((v) => v);

    for (const card of modelCards) {
      const modelId = card.getAttribute('data-model-id');
      const collection = card.getAttribute('data-collection');
      const filename = card.getAttribute('data-filename');
      const actualFilenameAttr = card.getAttribute('data-actual-filename');

      if (!modelId || !collection || !filename) continue;

      const actualFilename = actualFilenameAttr || getMergedFilename(filename);
      const modelPath = `models/${collection}/${actualFilename}`;
      const exists = await window.electronAPI.checkFileExists(modelPath);

      if (exists) {
        const downloadBtn = document.getElementById(`download-btn-${modelId}`);
        const launchButtons = document.getElementById(`launch-buttons-${modelId}`);

        if (downloadBtn) {
          downloadBtn.style.display = 'none';
        }

        if (launchButtons) {
          launchButtons.style.display = 'block';
        }

        try {
          const result = await window.electronAPI.hasModelfile(collection, modelId);
          if (result && result.hasModelfile) {
            const configBtn = document.getElementById(`config-btn-${modelId}`);
            if (configBtn) {
              configBtn.innerHTML = `${ICONS.configure} <span>Configure</span> <span style="color:#00ff88; line-height:1;">&#9679;</span>`;
              configBtn.title = 'Modelfile saved';
            }
          }
        } catch (_) {
          // Ignore
        }
      }
    }
  }

  function openModelConfig(modelId, collectionId, filename, ollamaModel) {
    if (window.ModelConfig && window.ModelConfig.open) {
      window.ModelConfig.open(modelId, collectionId, filename, ollamaModel);
    } else {
      console.error('[UI Navigation] ModelConfig module not loaded');
      alert('Configuration module not loaded. Please refresh the page.');
    }
  }

  function buildModelCards(models, collectionKey) {
    if (models.length === 0) {
      return '<p style="color: #aaa; grid-column: 1/-1; text-align: center;">No models in this collection.</p>';
    }

    const getMergedFilename = window.UINavigationShared?.getMergedFilename || ((v) => v);

    return models.map(m => {
      const sizeGB = m.size_mb ? (m.size_mb / 1024).toFixed(1) : (m.size_gb || 0).toFixed(1);
      const ctx = m.context_length ? (m.context_length / 1000).toFixed(0) + 'K' : 'N/A';
      const downloadUrl = m.download_url || m.url;
      const modelFilename = m.filename || m.id + '.gguf';
      const actualFilename = getMergedFilename(modelFilename);
      const projectorUrl = m.projector_url || '';
      const projectorFilename = m.projector_filename || '';
      const sha256 = m.sha256 || '';
      const ollamaModel = m.ollama_model || '';
      const forceCpuChecked = m.force_cpu ? 'checked' : '';

      const visionBadge = m.projector_url
        ? `<span style="background:#8a2be2; color:white; padding:2px 6px; border-radius:4px; font-size:10px; margin-left:5px; display:inline-flex; align-items:center; gap:4px;">${ICONS.eye}<span>Vision</span></span>`
        : '';

      return `
        <div class="model-card" id="model-card-${m.id}" data-model-id="${m.id}" data-collection="${collectionKey}" data-filename="${modelFilename}" data-actual-filename="${actualFilename}" data-projector-url="${projectorUrl}" data-projector-filename="${projectorFilename}" data-sha256="${sha256}" data-ollama-model="${ollamaModel}">
          <h4>${m.name}${visionBadge}</h4>
          <p class="model-size">${sizeGB} GB - ${m.quantization || 'N/A'}</p>
          <p class="model-desc">${m.description || 'No description available'}</p>
          <div class="model-meta" style="font-size: 12px; color: #666; margin: 10px 0;">
            <div>RAM: ${m.min_ram_gb}GB+ (${m.recommended_ram_gb}GB rec.)</div>
            <div>Context: ${ctx}</div>
            <div>File: ${actualFilename}</div>
          </div>

          <div id="download-progress-${m.id}" style="display: none; margin: 10px 0;">
            <div style="background: rgba(255,255,255,0.1); border-radius: 5px; height: 20px; overflow: hidden;">
              <div id="progress-bar-${m.id}" style="background: linear-gradient(90deg, var(--psf-accent, #00d4ff), #00ff88); height: 100%; width: 0%; transition: width 0.3s;"></div>
            </div>
            <div id="progress-text-${m.id}" style="color: #aaa; font-size: 12px; margin-top: 5px;">Starting download...</div>
          </div>

          <button class="btn-primary" id="download-btn-${m.id}" style="width: 100%; margin-bottom: 5px; display:inline-flex; align-items:center; justify-content:center; gap:7px;" onclick="downloadModel('${m.id}','${downloadUrl}','${collectionKey}','${modelFilename}','${projectorUrl}','${projectorFilename}','${sha256}')">
            ${ICONS.download} <span>Download Model${m.projector_url ? ' + Projector' : ''}</span>
          </button>

          <div id="launch-buttons-${m.id}" style="display: none; margin-bottom: 10px;">
            <button id="config-btn-${m.id}" class="btn-secondary" style="width: 100%; margin-bottom: 5px; background: rgba(233,69,96,0.2); border-color: #e94560; display:inline-flex; align-items:center; justify-content:center; gap:7px;" onclick="openModelConfig('${m.id}','${collectionKey}','${modelFilename}','${ollamaModel}')" title="Configure model settings">
              ${ICONS.configure} <span>Configure</span>
            </button>
            <div style="margin: 8px 0; padding: 6px; background: rgba(255,193,7,0.1); border-radius: 5px; border: 1px solid #ffc107;">
              <label style="display: flex; align-items: center; cursor: pointer; font-size: 11px; color: #ffc107;">
                <input type="checkbox" id="force-cpu-${m.id}" ${forceCpuChecked} onchange="toggleForceCpu('${collectionKey}', '${m.id}', this.checked)" style="margin-right: 6px;">
                ${ICONS.cpu}&nbsp;Force CPU (disable GPU)
              </label>
            </div>
            <button class="btn-primary" style="width: 100%; margin-bottom: 5px; background: rgba(0,255,136,0.2); border-color: #00ff88; display:inline-flex; align-items:center; justify-content:center; gap:7px;" onclick="launchInOllama('${collectionKey}','${modelFilename}','${projectorFilename}','${m.id}')">
              ${ICONS.launch} <span>Launch in Ollama</span>
            </button>
            ${sha256 ? `<button class="btn-secondary" id="verify-btn-${m.id}" style="width: 100%; margin-bottom: 5px; background: var(--psf-accent-medium, rgba(0,212,255,0.2)); border-color: var(--psf-accent, #00d4ff); font-size: 12px; padding: 8px; display:inline-flex; align-items:center; justify-content:center; gap:7px;" onclick="verifyModelChecksum('${m.id}','${collectionKey}','${modelFilename}','${sha256}')">
              ${ICONS.verify} <span>Verify Checksum</span>
            </button>` : ''}
            <button class="btn-secondary" style="width: 100%; background: rgba(255,107,107,0.2); border-color: #ff6b6b; font-size: 12px; padding: 8px; display:inline-flex; align-items:center; justify-content:center; gap:7px;" onclick="deleteModel('${m.id}','${collectionKey}','${modelFilename}')">
              ${ICONS.trash} <span>Delete Model File</span>
            </button>
          </div>

          <div id="verify-result-${m.id}" style="display: none; margin: 10px 0; padding: 10px; border-radius: 5px; font-size: 12px;"></div>

          <button class="btn-secondary" style="width: 100%;" onclick="openExternal('${m.url}')">
            View on HuggingFace
          </button>
        </div>
      `;
    }).join('');
  }

  function toggleCollection(collectionKey) {
    const modelsDiv = document.getElementById(`models-${collectionKey}`);
    const toggleIcon = document.getElementById(`toggle-${collectionKey}`);

    if (modelsDiv.classList.contains('visible')) {
      modelsDiv.classList.remove('visible');
      toggleIcon.classList.remove('expanded');
    } else {
      modelsDiv.classList.add('visible');
      toggleIcon.classList.add('expanded');
    }
  }

  function toggleAllCollections() {
    const allModelsContainers = document.querySelectorAll('.collection-models');
    const allToggleIcons = document.querySelectorAll('.collection-toggle');

    const anyVisible = Array.from(allModelsContainers).some(div => div.classList.contains('visible'));

    if (anyVisible) {
      allModelsContainers.forEach(div => div.classList.remove('visible'));
      allToggleIcons.forEach(icon => icon.classList.remove('expanded'));
    } else {
      allModelsContainers.forEach(div => div.classList.add('visible'));
      allToggleIcons.forEach(icon => icon.classList.add('expanded'));
    }
  }

  async function toggleForceCpu(collectionId, modelId, forceCpu) {
    console.log(`[UI Navigation] Setting force_cpu=${forceCpu} for ${modelId} in ${collectionId}`);

    try {
      const result = await window.electronAPI.editModel(collectionId, modelId, { force_cpu: forceCpu });

      if (result && result.success !== false) {
        if (window.catalogData && window.catalogData.collections && window.catalogData.collections[collectionId]) {
          const model = window.catalogData.collections[collectionId].models?.find(m => m.id === modelId);
          if (model) {
            model.force_cpu = forceCpu;
          }
        }
        console.log(`[UI Navigation] ✅ Force CPU ${forceCpu ? 'enabled' : 'disabled'} for ${modelId}`);
      } else {
        console.error('[UI Navigation] Failed to update force_cpu:', result);
        const checkbox = document.getElementById(`force-cpu-${modelId}`);
        if (checkbox) checkbox.checked = !forceCpu;
        alert('Failed to save setting');
      }
    } catch (err) {
      console.error('[UI Navigation] Error toggling force_cpu:', err);
      const checkbox = document.getElementById(`force-cpu-${modelId}`);
      if (checkbox) checkbox.checked = !forceCpu;
    }
  }

  window.UINavigationModelBrowser = {
    loadModelCatalog,
    updatePackageTitle,
    displayPackageView,
    checkDownloadedModels,
    openModelConfig,
    buildModelCards,
    toggleCollection,
    toggleAllCollections,
    toggleForceCpu
  };
})();
