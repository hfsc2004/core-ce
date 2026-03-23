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
  const tightHeaderScreens = new Set(['model-ordering', 'model-browser', 'catalog-editor', 'package-manager', 'binary-manager']);
  document.body.classList.toggle('relay-screen-active', tightHeaderScreens.has(screenId));
  updateHeaderContextBadges(screenId);

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

function updateHeaderContextBadges(screenId) {
  const relayBadge = document.getElementById('relay-header-badge');
  const browseBadge = document.getElementById('browse-header-badge');
  const catalogBadge = document.getElementById('catalog-header-badge');
  const binaryBadge = document.getElementById('binary-header-badge');
  const groupBadge = document.getElementById('group-header-badge');
  setHeaderBadgeVisible(relayBadge, screenId === 'model-ordering');
  setHeaderBadgeVisible(browseBadge, screenId === 'model-browser');
  setHeaderBadgeVisible(catalogBadge, screenId === 'catalog-editor');
  setHeaderBadgeVisible(binaryBadge, screenId === 'binary-manager');
  setHeaderBadgeVisible(groupBadge, screenId === 'package-manager');
}

function setHeaderBadgeVisible(node, visible) {
  if (!node) return;
  if (!visible) {
    node.classList.remove('context-visible');
    node.style.display = 'none';
    return;
  }
  node.style.display = 'inline-flex';
  node.classList.remove('context-visible');
  // restart animation each time context switches to this screen
  void node.offsetWidth;
  node.classList.add('context-visible');
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
  updateHeaderContextBadges('main-menu');
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
