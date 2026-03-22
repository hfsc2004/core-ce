/**
 * Compile Manager - Windows x64 Implementation
 * 
 * Platform-specific compilation for Windows x64 systems.
 * 
 * Features:
 * - .bat launcher generation
 * - .ico icon handling
 * - Windows-specific package structure
 * - No chmod operations (Windows doesn't use Unix permissions)
 * 
 * @module compile-manager-windows-x64
 * @version 1.1.2 - March 5, 2026
 * @date December 22, 2025
 */

const fs = require('fs');
const path = require('path');
const common = require('./compile-manager-common');

/**
 * Compile project for Windows x64
 * 
 * @param {string} fromPath - Source path
 * @param {Object} config - Compilation configuration
 * @param {Function} progressCallback - Progress callback
 * @returns {Promise<Object>} Compilation result
 */
async function compileProject(fromPath, config, progressCallback = null) {
  try {
    const sendProgress = (status, progress, log = null) => {
      if (progressCallback) {
        progressCallback({ status, progress, log });
      }
      console.log(`[Compile Manager Windows x64] [${progress}%] ${status}${log ? ': ' + log : ''}`);
    };
    
    const projectRoot = path.join(fromPath, '..');
    const targetPlatform = 'windows-x64';
    const buildEdition = common.normalizeEdition(config.edition || 'standard');
    
    sendProgress('Starting Windows x64 compilation...', 2, `Target: ${targetPlatform}`);
    
    // Create output directory structure
    const baseOutputDir = path.join(projectRoot, '..', config.outputFolder);
    const outputDir = path.join(baseOutputDir, targetPlatform);
    
    sendProgress('Creating output directory...', 5, `Creating: ${outputDir}`);
    
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true });
    }
    fs.mkdirSync(outputDir, { recursive: true });
    
    // Create subdirectories
    const programFilesDir = path.join(outputDir, 'Program_Files');
    const appDir = path.join(programFilesDir, 'app');
    const srcDir = path.join(appDir, 'src');
    const assetsDir = path.join(appDir, 'assets');
    const modelsDir = path.join(programFilesDir, 'models');
    const blobsDir = path.join(modelsDir, 'blobs');
    const licensesDir = path.join(outputDir, 'licenses');
    
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.mkdirSync(blobsDir, { recursive: true });
    fs.mkdirSync(licensesDir, { recursive: true });
    
    // Generate product catalog
    sendProgress('Generating product catalog...', 10, 'Building custom collections...');
    const productCatalog = common.generateProductCatalog(config);
    const catalogPath = path.join(appDir, 'product-catalog.json');
    fs.writeFileSync(catalogPath, JSON.stringify(productCatalog, null, 2));
    
    // Copy blobs
    const blobsCopied = await common.copyBlobs(fromPath, config, blobsDir, progressCallback);
    
    // Copy manifests
    await common.copyManifests(fromPath, config, modelsDir, progressCallback);
    
    // Copy licenses
    await common.copyLicenses(fromPath, licensesDir, progressCallback);
    
    // Copy app files
    await common.copyAppFiles(
      fromPath,
      appDir,
      srcDir,
      assetsDir,
      progressCallback,
      { edition: buildEdition, strictExclusion: true }
    );
    
    // Obfuscate Standard Edition JS files (code protection)
    const obfuscationPreset = config.obfuscationPreset || 'medium';
    await common.obfuscateAppFiles(appDir, obfuscationPreset, progressCallback);
    
    // Create product-specific main.js
    sendProgress('Creating product main.js...', 93, 'Generating main process file...');
    const productMainJs = common.generateProductMainJs(config);
    fs.writeFileSync(path.join(appDir, 'main.js'), productMainJs);
    
    // Create package.json
    const packageJson = common.generatePackageJson(config);
    fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify(packageJson, null, 2));

    // Final packaging verification to ensure edition exclusions are enforced
    common.verifyEditionPackaging(appDir, { edition: buildEdition, stage: 'final' }, progressCallback);
    
    // Create Windows launcher (.bat)
    sendProgress('Creating Windows launcher...', 97, 'Generating .bat file...');
    const batchContent = generateWindowsLauncher(config);
    fs.writeFileSync(path.join(outputDir, 'start.bat'), batchContent);
    
    sendProgress('Build complete!', 100, `Platform: ${targetPlatform}`);
    
    // Count totals
    let totalModels = 0;
    for (const coll of config.collections) {
      totalModels += coll.models.length;
    }
    
    return {
      success: true,
      outputPath: outputDir,
      platform: targetPlatform,
      edition: buildEdition,
      modelCount: totalModels,
      collectionCount: config.collections.length,
      blobsCopied,
      message: `Successfully compiled for ${targetPlatform}`
    };
    
  } catch (err) {
    console.error('[Compile Manager Windows x64] Compile error:', err);
    return { success: false, message: err.message };
  }
}

/**
 * Generate Windows batch launcher script
 * 
 * @param {Object} config - Compilation configuration
 * @returns {string} Batch file content
 */
function generateWindowsLauncher(config) {
  return `@echo off
title ${config.productName}
cd /d "%~dp0"

echo.
echo ============================================
echo  ${config.productName}
echo ============================================
echo.

cd Program_Files\\app

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo.
        echo ERROR: Failed to install dependencies.
        echo.
        pause
        exit /b 1
    )
)

echo Starting ${config.productName}...
start "" npm start

timeout /t 2 >nul

if errorlevel 1 (
    echo.
    echo ERROR: Application failed to start.
    echo.
    pause
)
`;
}

module.exports = {
  compileProject
};
