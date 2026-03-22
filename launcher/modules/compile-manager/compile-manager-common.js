/**
 * Compile Manager - Common API surface (Cross-Platform)
 *
 * This module intentionally re-exports the compile manager operations
 * from focused split modules to keep the public API stable while
 * reducing monolithic file size.
 *
 * @module compile-manager-common
 * @version 1.1.2 - March 5, 2026
 */

'use strict';

const { generatePackageJson, generateProductMainJs } = require('./compile-manager-product-templates.js');

const {
  listCompileConfigs,
  saveCompileConfig,
  loadCompileConfig,
  deleteCompileConfig
} = require('./compile-manager-config-store.js');

const {
  normalizeEdition,
  verifyEditionPackaging
} = require('./compile-manager-edition-policy.js');

const {
  getDownloadedModelsWithBlobs,
  getCurrentPlatform,
  generateProductCatalog,
  copyBlobs,
  copyManifests
} = require('./compile-manager-model-ops.js');

const {
  copySettingsForCompilation,
  copyLicenses,
  copyDirectoryRecursive,
  copyOllamaBinaries
} = require('./compile-manager-file-ops.js');

const {
  copyAppFiles,
  copyNodeModules,
  obfuscateAppFiles
} = require('./compile-manager-app-ops.js');

const {
  copyWebUIBinaries,
  copyAnythingLLMBinaries
} = require('./compile-manager-runtime-binaries.js');

module.exports = {
  // Model & blob discovery
  getDownloadedModelsWithBlobs,

  // Configuration management (full names)
  listCompileConfigs,
  saveCompileConfig,
  loadCompileConfig,
  deleteCompileConfig,

  // Configuration management (short aliases for ipc-handlers.js)
  listConfigs: listCompileConfigs,
  saveConfig: saveCompileConfig,
  loadConfig: loadCompileConfig,
  deleteConfig: deleteCompileConfig,

  // Platform detection
  getCurrentPlatform,
  normalizeEdition,

  // Catalog generation
  generateProductCatalog,

  // Blob & manifest copying
  copyBlobs,
  copyManifests,

  // Binary copying
  copyOllamaBinaries,
  copyWebUIBinaries,
  copyAnythingLLMBinaries,
  copyDirectoryRecursive,

  // File copying
  copyAppFiles,
  verifyEditionPackaging,
  copyNodeModules,
  copyLicenses,
  copySettingsForCompilation,

  // Code protection
  obfuscateAppFiles,

  // Code generation
  generatePackageJson,
  generateProductMainJs
};
