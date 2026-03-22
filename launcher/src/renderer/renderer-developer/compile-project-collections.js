/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
(function() {
  'use strict';

  function createCollectionsController(deps = {}) {
    const getCustomCollections = typeof deps.getCustomCollections === 'function' ? deps.getCustomCollections : () => [];
    const setCustomCollections = typeof deps.setCustomCollections === 'function' ? deps.setCustomCollections : (() => {});
    const getAvailableModels = typeof deps.getAvailableModels === 'function' ? deps.getAvailableModels : () => [];
    const closeModal = typeof deps.closeModal === 'function' ? deps.closeModal : (() => {});
    const loadAvailableModelsForCompile = typeof deps.loadAvailableModelsForCompile === 'function'
      ? deps.loadAvailableModelsForCompile
      : (async () => {});

    function isModelAssignedToCollection(modelId) {
      for (const collection of getCustomCollections()) {
        if (collection.models.includes(modelId)) return true;
      }
      return false;
    }

    function showAddCustomCollectionForm() {
      if (!window.currentConfigName) {
        alert('Please select or create a configuration first.');
        return;
      }

      const modalHtml = `
        <div id="add-collection-modal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: 1000;">
          <div style="background: #1a1a2e; padding: 30px; border-radius: 15px; border: 2px solid var(--psf-border, #0f3460); max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto;">
            <h3 style="color: var(--psf-accent, #00d4ff); margin-top: 0;">Create Custom Collection</h3>
            <div style="margin-bottom: 15px;">
              <label style="color: #aaa; display: block; margin-bottom: 5px;">Collection Name *</label>
              <input type="text" id="new-collection-name" placeholder="e.g., Vision Models, Coding Models" style="width: 100%; padding: 10px; background: rgba(255,255,255,0.1); border: 1px solid var(--psf-border, #0f3460); border-radius: 5px; color: #fff;">
            </div>
            <div style="margin-bottom: 15px;">
              <label style="color: #aaa; display: block; margin-bottom: 5px;">Description</label>
              <input type="text" id="new-collection-description" placeholder="Brief description of this collection" style="width: 100%; padding: 10px; background: rgba(255,255,255,0.1); border: 1px solid var(--psf-border, #0f3460); border-radius: 5px; color: #fff;">
            </div>
            <div style="margin-bottom: 15px;">
              <label style="color: #aaa; display: block; margin-bottom: 10px;">Select Models (${getAvailableModels().length} available)</label>
              <div style="max-height: 300px; overflow-y: auto; background: rgba(0,0,0,0.3); padding: 10px; border-radius: 5px;">
                ${getAvailableModels().map((m) => {
                  const isAssigned = isModelAssignedToCollection(m.id);
                  const sizeGB = (m.size_mb / 1024).toFixed(2);
                  return `
                    <label style="display: flex; align-items: center; padding: 8px; margin-bottom: 5px; background: rgba(255,255,255,0.05); border-radius: 5px; cursor: ${isAssigned ? 'not-allowed' : 'pointer'}; opacity: ${isAssigned ? '0.5' : '1'};">
                      <input type="checkbox" name="collection-model" value="${m.id}" ${isAssigned ? 'disabled' : ''} style="margin-right: 10px;">
                      <span style="flex: 1; color: #fff;">${m.name}</span>
                      <span style="color: #888; font-size: 12px;">${sizeGB} GB</span>
                      ${isAssigned ? '<span style="color: #00ff88; margin-left: 10px; font-size: 11px;">Already assigned</span>' : ''}
                    </label>
                  `;
                }).join('')}
              </div>
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
              <button class="btn-secondary" onclick="closeModal('add-collection-modal')">Cancel</button>
              <button class="btn-primary" onclick="createCustomCollection()">Create Collection</button>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    async function createCustomCollection() {
      const name = document.getElementById('new-collection-name').value.trim();
      const description = document.getElementById('new-collection-description').value.trim();
      const checkboxes = document.querySelectorAll('input[name="collection-model"]:checked');
      if (!name) return alert('Please enter a collection name.');
      if (checkboxes.length === 0) return alert('Please select at least one model.');

      const modelIds = Array.from(checkboxes).map((cb) => cb.value);
      const collectionId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const current = getCustomCollections();
      if (current.some((c) => c.id === collectionId)) return alert('A collection with this name already exists.');

      setCustomCollections([...current, { id: collectionId, name, description, models: modelIds }]);
      closeModal('add-collection-modal');
      renderCustomCollections();
      await loadAvailableModelsForCompile();
      updateCompileSummary();
    }

    function renderCustomCollections() {
      const container = document.getElementById('custom-collections-list');
      const collections = getCustomCollections();
      if (collections.length === 0) {
        container.innerHTML = '<p style="color: #666; text-align: center;">No custom collections yet. Create one to get started.</p>';
        return;
      }

      let html = '';
      for (const collection of collections) {
        const models = collection.models
          .map((id) => getAvailableModels().find((m) => m.id === id))
          .filter(Boolean)
          .sort((a, b) => a.size_mb - b.size_mb);
        const totalSizeGB = (models.reduce((sum, m) => sum + m.size_mb, 0) / 1024).toFixed(2);
        html += `
          <div class="custom-collection" style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 10px; margin-bottom: 15px; border: 1px solid var(--psf-border, #0f3460);">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
              <div>
                <h4 style="color: var(--psf-accent, #00d4ff); margin: 0;">${collection.name}</h4>
                <p style="color: #888; font-size: 12px; margin: 5px 0 0 0;">${collection.description || 'No description'}</p>
              </div>
              <div style="display: flex; gap: 5px;">
                <button class="btn-secondary" onclick="editCustomCollection('${collection.id}')" style="padding: 5px 10px; font-size: 12px;">Edit</button>
                <button class="btn-secondary" onclick="deleteCustomCollection('${collection.id}')" style="padding: 5px 10px; font-size: 12px; background: rgba(255,107,107,0.2); border-color: #ff6b6b;">Delete</button>
              </div>
            </div>
            <div style="color: #aaa; font-size: 13px; margin-bottom: 10px;">${models.length} models • ${totalSizeGB} GB total</div>
            <div style="display: flex; flex-wrap: wrap; gap: 5px;">
              ${models.map((m) => `
                <span style="background: var(--psf-accent-medium, rgba(0,212,255,0.2)); color: var(--psf-accent, #00d4ff); padding: 3px 8px; border-radius: 12px; font-size: 11px;">
                  ${m.name} (${(m.size_mb / 1024).toFixed(1)}GB)
                </span>
              `).join('')}
            </div>
          </div>
        `;
      }
      container.innerHTML = html;
    }

    function editCustomCollection(collectionId) {
      const collection = getCustomCollections().find((c) => c.id === collectionId);
      if (!collection) return;
      const modalHtml = `
        <div id="edit-collection-modal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: 1000;">
          <div style="background: #1a1a2e; padding: 30px; border-radius: 15px; border: 2px solid var(--psf-border, #0f3460); max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto;">
            <h3 style="color: var(--psf-accent, #00d4ff); margin-top: 0;">Edit Collection: ${collection.name}</h3>
            <div style="margin-bottom: 15px;">
              <label style="color: #aaa; display: block; margin-bottom: 5px;">Collection Name *</label>
              <input type="text" id="edit-collection-name" value="${collection.name}" style="width: 100%; padding: 10px; background: rgba(255,255,255,0.1); border: 1px solid var(--psf-border, #0f3460); border-radius: 5px; color: #fff;">
            </div>
            <div style="margin-bottom: 15px;">
              <label style="color: #aaa; display: block; margin-bottom: 5px;">Description</label>
              <input type="text" id="edit-collection-description" value="${collection.description || ''}" style="width: 100%; padding: 10px; background: rgba(255,255,255,0.1); border: 1px solid var(--psf-border, #0f3460); border-radius: 5px; color: #fff;">
            </div>
            <div style="margin-bottom: 15px;">
              <label style="color: #aaa; display: block; margin-bottom: 10px;">Select Models</label>
              <div style="max-height: 300px; overflow-y: auto; background: rgba(0,0,0,0.3); padding: 10px; border-radius: 5px;">
                ${getAvailableModels().map((m) => {
                  const isInThisCollection = collection.models.includes(m.id);
                  const isInOtherCollection = !isInThisCollection && isModelAssignedToCollection(m.id);
                  const sizeGB = (m.size_mb / 1024).toFixed(2);
                  return `
                    <label style="display: flex; align-items: center; padding: 8px; margin-bottom: 5px; background: rgba(255,255,255,0.05); border-radius: 5px; cursor: ${isInOtherCollection ? 'not-allowed' : 'pointer'}; opacity: ${isInOtherCollection ? '0.5' : '1'};">
                      <input type="checkbox" name="edit-collection-model" value="${m.id}" ${isInThisCollection ? 'checked' : ''} ${isInOtherCollection ? 'disabled' : ''} style="margin-right: 10px;">
                      <span style="flex: 1; color: #fff;">${m.name}</span>
                      <span style="color: #888; font-size: 12px;">${sizeGB} GB</span>
                      ${isInOtherCollection ? '<span style="color: #ff6b6b; margin-left: 10px; font-size: 11px;">In other collection</span>' : ''}
                    </label>
                  `;
                }).join('')}
              </div>
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
              <button class="btn-secondary" onclick="closeModal('edit-collection-modal')">Cancel</button>
              <button class="btn-primary" onclick="saveCustomCollectionEdit('${collectionId}')">Save Changes</button>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    async function saveCustomCollectionEdit(collectionId) {
      const collections = getCustomCollections();
      const collection = collections.find((c) => c.id === collectionId);
      if (!collection) return;
      const name = document.getElementById('edit-collection-name').value.trim();
      const description = document.getElementById('edit-collection-description').value.trim();
      const checkboxes = document.querySelectorAll('input[name="edit-collection-model"]:checked');
      if (!name) return alert('Please enter a collection name.');
      if (checkboxes.length === 0) return alert('Please select at least one model.');
      collection.name = name;
      collection.description = description;
      collection.models = Array.from(checkboxes).map((cb) => cb.value);
      setCustomCollections([...collections]);
      closeModal('edit-collection-modal');
      renderCustomCollections();
      await loadAvailableModelsForCompile();
      updateCompileSummary();
    }

    async function deleteCustomCollection(collectionId) {
      if (!confirm('Are you sure you want to delete this collection?')) return;
      setCustomCollections(getCustomCollections().filter((c) => c.id !== collectionId));
      renderCustomCollections();
      await loadAvailableModelsForCompile();
      updateCompileSummary();
    }

    function updateCompileSummary() {
      const container = document.getElementById('compile-summary');
      const collections = getCustomCollections();
      if (collections.length === 0) {
        container.innerHTML = '<p>No models selected. Add models to custom collections above.</p>';
        return;
      }

      let totalModels = 0;
      let totalSize = 0;
      let totalBlobs = 0;
      for (const collection of collections) {
        for (const modelId of collection.models) {
          const model = getAvailableModels().find((m) => m.id === modelId);
          if (!model) continue;
          totalModels += 1;
          totalSize += model.size_mb;
          totalBlobs += model.blob_count || 1;
        }
      }
      const totalSizeGB = (totalSize / 1024).toFixed(2);
      container.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; text-align: center;">
          <div><div style="font-size: 28px; color: var(--psf-accent, #00d4ff); font-weight: bold;">${collections.length}</div><div style="color: #888; font-size: 13px;">Collections</div></div>
          <div><div style="font-size: 28px; color: #00ff88; font-weight: bold;">${totalModels}</div><div style="color: #888; font-size: 13px;">Models</div></div>
          <div><div style="font-size: 28px; color: #ffd400; font-weight: bold;">${totalBlobs}</div><div style="color: #888; font-size: 13px;">Blob Files</div></div>
          <div><div style="font-size: 28px; color: #ff6b6b; font-weight: bold;">${totalSizeGB} GB</div><div style="color: #888; font-size: 13px;">Total Size</div></div>
        </div>
      `;
    }

    return {
      isModelAssignedToCollection,
      showAddCustomCollectionForm,
      createCustomCollection,
      renderCustomCollections,
      editCustomCollection,
      saveCustomCollectionEdit,
      deleteCustomCollection,
      updateCompileSummary
    };
  }

  window.CompileProjectCollections = { createCollectionsController };
})();
