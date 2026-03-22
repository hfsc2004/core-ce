/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
// SCREEN NAVIGATION
// ============================================================================

function showScreen(screenId) {
  if (screenId === 'version-manager') {
    screenId = 'main-menu';
  }
  if (screenId === 'compile-project') {
    // Compile Product is intentionally disabled in Core-CE.
    screenId = 'main-menu';
  }
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });
  document.getElementById(screenId).classList.add('active');

  if (screenId === 'hardware-detect') {
    detectHardware();
  } else if (screenId === 'model-browser') {
    loadCatalogBrowser();
  } else if (screenId === 'catalog-editor') {
    loadCatalogEditor();
  } else if (screenId === 'package-manager') {
    loadPackageManager();
  } else if (screenId === 'compile-project') {
    loadCompileProject();
  } else if (screenId === 'model-ordering') {
    loadModelOrdering();
  } else if (screenId === 'about') {
    loadLicenseButtons();
  }
}

function acceptDisclaimer() {
  window.__disclaimerAccepted = true;
  document.body.classList.add('disclaimer-accepted');
  const settingsBtn = document.getElementById('header-settings-btn');
  if (settingsBtn) settingsBtn.style.display = 'inline-block';
  const gpuIndicator = document.getElementById('gpu-indicator');
  if (gpuIndicator) gpuIndicator.style.display = 'inline-block';
  if (typeof initGpuMonitorWidget === 'function') {
    initGpuMonitorWidget();
  }
  showScreen('main-menu');
}

function getMergedFilename(filename) {
  return window.UINavigationShared?.getMergedFilename
    ? window.UINavigationShared.getMergedFilename(filename)
    : String(filename || '');
}

async function detectHardware() {
  return window.UINavigationHardware?.detectHardware
    ? window.UINavigationHardware.detectHardware()
    : Promise.resolve();
}

async function getRecommendations(hardware) {
  return window.UINavigationHardware?.getRecommendations
    ? window.UINavigationHardware.getRecommendations(hardware)
    : { gpu_accelerated: [], cpu_capable: [], insufficient: [] };
}

async function checkRecommendationStatus() {
  return window.UINavigationHardware?.checkRecommendationStatus
    ? window.UINavigationHardware.checkRecommendationStatus()
    : Promise.resolve();
}

async function loadModelCatalog() {
  return window.UINavigationModelBrowser?.loadModelCatalog
    ? window.UINavigationModelBrowser.loadModelCatalog()
    : Promise.resolve();
}

function updatePackageTitle(skuConfig, catalog) {
  if (window.UINavigationModelBrowser?.updatePackageTitle) {
    window.UINavigationModelBrowser.updatePackageTitle(skuConfig, catalog);
  }
}

function displayPackageView(skuConfig, catalog) {
  if (window.UINavigationModelBrowser?.displayPackageView) {
    window.UINavigationModelBrowser.displayPackageView(skuConfig, catalog);
  }
}

async function checkDownloadedModels() {
  return window.UINavigationModelBrowser?.checkDownloadedModels
    ? window.UINavigationModelBrowser.checkDownloadedModels()
    : Promise.resolve();
}

function openModelConfig(modelId, collectionId, filename, ollamaModel) {
  if (window.UINavigationModelBrowser?.openModelConfig) {
    window.UINavigationModelBrowser.openModelConfig(modelId, collectionId, filename, ollamaModel);
  }
}

function buildModelCards(models, collectionKey) {
  return window.UINavigationModelBrowser?.buildModelCards
    ? window.UINavigationModelBrowser.buildModelCards(models, collectionKey)
    : '';
}

function toggleCollection(collectionKey) {
  if (window.UINavigationModelBrowser?.toggleCollection) {
    window.UINavigationModelBrowser.toggleCollection(collectionKey);
  }
}

function toggleAllCollections() {
  if (window.UINavigationModelBrowser?.toggleAllCollections) {
    window.UINavigationModelBrowser.toggleAllCollections();
  }
}

async function toggleForceCpu(collectionId, modelId, forceCpu) {
  return window.UINavigationModelBrowser?.toggleForceCpu
    ? window.UINavigationModelBrowser.toggleForceCpu(collectionId, modelId, forceCpu)
    : Promise.resolve();
}
