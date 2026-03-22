/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
// ============================================================================
// PSF OFFLINE ARCHIVE COLLECTION
// Renderer - Screen Navigation
// ============================================================================
// Shared by both Standard and Community Editions
// Core-CE extends this with additional screen handlers
// ============================================================================

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });
  document.getElementById(screenId).classList.add('active');
  
  // Standard Edition screen handlers
  if (screenId === 'hardware-detect') {
    detectHardware();
  } else if (screenId === 'model-browser') {
    // Core-CE uses MoE-style catalog browser, Standard uses card grid
    if (typeof loadCatalogBrowser === 'function') {
      loadCatalogBrowser();
    } else {
      loadModelCatalog();
    }
  } else if (screenId === 'about') {
    loadLicenseButtons();
  } else if (screenId === 'webui-select') {
    if (typeof populateTerminalModels === 'function') {
      populateTerminalModels();
    }
  }
  // Core-CE screen handlers (if functions exist)
  if (screenId === 'catalog-editor' && typeof loadCatalogEditor === 'function') {
    loadCatalogEditor();
  } else if (screenId === 'package-manager' && typeof loadPackageManager === 'function') {
    loadPackageManager();
  } else if (screenId === 'version-manager' && typeof loadVersionManager === 'function') {
    loadVersionManager();
  } else if (screenId === 'compile-project' && typeof loadCompileProject === 'function') {
    loadCompileProject();
  } else if (screenId === 'binary-manager' && typeof loadBinaryManager === 'function') {
    loadBinaryManager();
  } else if (screenId === 'blob-mapper' && typeof loadBlobMapper === 'function') {
    loadBlobMapper();
  }
}

function acceptDisclaimer() {
  window.__disclaimerAccepted = true;
  const settingsBtn = document.getElementById('header-settings-btn');
  if (settingsBtn) settingsBtn.style.display = 'inline-block';
  const gpuIndicator = document.getElementById('gpu-indicator');
  if (gpuIndicator) gpuIndicator.style.display = 'inline-block';
  if (typeof initGpuMonitorWidget === 'function') {
    initGpuMonitorWidget();
  }
  showScreen('main-menu');
}


// ============================================================================
