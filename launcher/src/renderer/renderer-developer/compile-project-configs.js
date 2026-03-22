/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
(function() {
  'use strict';

  function createConfigsController(deps = {}) {
    const closeModal = typeof deps.closeModal === 'function' ? deps.closeModal : (() => {});
    const renderCustomCollections = typeof deps.renderCustomCollections === 'function' ? deps.renderCustomCollections : (() => {});
    const loadAvailableModelsForCompile = typeof deps.loadAvailableModelsForCompile === 'function'
      ? deps.loadAvailableModelsForCompile
      : (async () => {});
    const updateCompileSummary = typeof deps.updateCompileSummary === 'function' ? deps.updateCompileSummary : (() => {});

    async function loadConfigList() {
      const selector = document.getElementById('config-selector');
      const statusDiv = document.getElementById('config-status');
      try {
        const result = await window.electronAPI.listCompileConfigs();
        if (result.success) {
          window.availableConfigs = result.configs || [];
          let html = '<option value="">-- Select a configuration --</option>';
          for (const config of window.availableConfigs) {
            const selected = config.name === window.currentConfigName ? 'selected' : '';
            html += `<option value="${config.name}" ${selected}>${config.name}</option>`;
          }
          selector.innerHTML = html;
          statusDiv.textContent = window.availableConfigs.length === 0
            ? 'No configurations saved yet. Create one to get started.'
            : `${window.availableConfigs.length} configuration(s) available`;
        }
      } catch (err) {
        statusDiv.textContent = 'Error loading configurations: ' + err.message;
      }
    }

    function showNewConfigForm() {
      const modalHtml = `
        <div id="new-config-modal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: 1000;">
          <div style="background: #1a1a2e; padding: 30px; border-radius: 15px; border: 2px solid var(--psf-accent, #00d4ff); max-width: 500px; width: 90%;">
            <h3 style="color: var(--psf-accent, #00d4ff); margin-top: 0;">💾 New Build Configuration</h3>
            <div style="margin-bottom: 15px;">
              <label style="color: #aaa; display: block; margin-bottom: 5px;">Configuration Name *</label>
              <input type="text" id="new-config-name" placeholder="e.g., Vision Bundle, Coding Pack, Full Archive" style="width: 100%; padding: 10px; background: rgba(255,255,255,0.1); border: 1px solid var(--psf-border, #0f3460); border-radius: 5px; color: #fff;">
            </div>
            <p style="color: #888; font-size: 13px; margin-bottom: 20px;">This will create a new configuration. You can then add collections and models to it.</p>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
              <button class="btn-secondary" onclick="closeModal('new-config-modal')">Cancel</button>
              <button class="btn-primary" onclick="createNewConfig()" style="background: var(--psf-accent-medium, rgba(0,212,255,0.3)); border-color: var(--psf-accent, #00d4ff);">Create Configuration</button>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', modalHtml);
      document.getElementById('new-config-name').focus();
    }

    async function createNewConfig() {
      const name = document.getElementById('new-config-name').value.trim();
      if (!name) return alert('Please enter a configuration name.');
      if (window.availableConfigs.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
        return alert('A configuration with this name already exists.');
      }
      const config = {
        name,
        productName: 'PSF Archive Collection',
        version: '1.0.0',
        outputFolder: name.replace(/[^a-zA-Z0-9]+/g, '_') + '_PRODUCT',
        storageLabel: 'Custom',
        edition: 'standard',
        collections: []
      };
      try {
        const result = await window.electronAPI.saveCompileConfig(config);
        if (!result.success) return alert('Error creating configuration: ' + result.message);
        window.currentConfigName = name;
        window.customCollections = [];
        await loadConfigList();
        document.getElementById('config-selector').value = name;
        document.getElementById('compile-product-name').value = config.productName;
        document.getElementById('compile-version').value = config.version;
        document.getElementById('compile-output-folder').value = config.outputFolder;
        document.getElementById('compile-storage-label').value = config.storageLabel;
        renderCustomCollections();
        await loadAvailableModelsForCompile();
        updateCompileSummary();
        closeModal('new-config-modal');
        document.getElementById('config-status').textContent = `Created and loaded: ${name}`;
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }

    async function loadSelectedConfig() {
      const selector = document.getElementById('config-selector');
      const configName = selector.value;
      const statusDiv = document.getElementById('config-status');
      if (!configName) {
        window.currentConfigName = null;
        window.currentCompileEdition = 'standard';
        window.customCollections = [];
        renderCustomCollections();
        updateCompileSummary();
        statusDiv.textContent = 'No configuration selected';
        return;
      }
      try {
        const result = await window.electronAPI.loadCompileConfig(configName);
        if (result.success && result.config) {
          window.currentConfigName = configName;
          window.customCollections = result.config.collections || [];
          window.currentCompileEdition = result.config.edition || 'standard';
          document.getElementById('compile-product-name').value = result.config.productName || 'PSF Archive Collection';
          document.getElementById('compile-version').value = result.config.version || '1.0.0';
          document.getElementById('compile-output-folder').value = result.config.outputFolder || 'PSF_Archive_Collection_PRODUCT';
          document.getElementById('compile-storage-label').value = result.config.storageLabel || 'Custom';
          renderCustomCollections();
          await loadAvailableModelsForCompile();
          updateCompileSummary();
          statusDiv.innerHTML = `<span style="color: #00ff88;">✓ Loaded: ${configName}</span>`;
        } else {
          statusDiv.innerHTML = `<span style="color: #ff6b6b;">Error loading configuration</span>`;
        }
      } catch (err) {
        statusDiv.innerHTML = `<span style="color: #ff6b6b;">Error: ${err.message}</span>`;
      }
    }

    async function saveCurrentConfig() {
      if (!window.currentConfigName) {
        alert('Please select or create a configuration first.');
        return;
      }
      const config = {
        name: window.currentConfigName,
        productName: document.getElementById('compile-product-name').value,
        version: document.getElementById('compile-version').value,
        outputFolder: document.getElementById('compile-output-folder').value,
        storageLabel: document.getElementById('compile-storage-label').value,
        edition: window.currentCompileEdition || 'standard',
        collections: window.customCollections
      };
      try {
        const result = await window.electronAPI.saveCompileConfig(config);
        if (result.success) {
          document.getElementById('config-status').innerHTML = `<span style="color: #00ff88;">✓ Saved: ${window.currentConfigName}</span>`;
        } else {
          alert('Error saving configuration: ' + result.message);
        }
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }

    async function deleteCurrentConfig() {
      const configName = document.getElementById('config-selector').value;
      if (!configName) return alert('Please select a configuration to delete.');
      if (!confirm(`Are you sure you want to delete "${configName}"?\n\nThis cannot be undone.`)) return;
      try {
        const result = await window.electronAPI.deleteCompileConfig(configName);
        if (!result.success) return alert('Error deleting configuration: ' + result.message);
        window.currentConfigName = null;
        window.customCollections = [];
        await loadConfigList();
        renderCustomCollections();
        updateCompileSummary();
        document.getElementById('config-status').innerHTML = `<span style="color: #ffd400;">Deleted: ${configName}</span>`;
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }

    return {
      loadConfigList,
      showNewConfigForm,
      createNewConfig,
      loadSelectedConfig,
      saveCurrentConfig,
      deleteCurrentConfig
    };
  }

  window.CompileProjectConfigs = { createConfigsController };
})();
