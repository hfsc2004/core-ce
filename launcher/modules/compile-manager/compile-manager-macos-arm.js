/**
 * Compile Manager - macOS Apple Silicon Implementation
 * 
 * Platform-specific compilation for macOS ARM64 (Apple Silicon) systems.
 * 
 * Features:
 * - .sh launcher generation with bash shebang
 * - .icns icon handling (macOS-specific)
 * - chmod 755 permissions for launcher
 * - App bundle preparation notes
 * - Code signing considerations
 * - Apple Silicon optimizations
 * 
 * @module compile-manager-macos-arm
 * @version 1.1.2 - March 5, 2026
 * @date December 22, 2025
 */

const fs = require('fs');
const path = require('path');
const common = require('./compile-manager-common');

/**
 * Compile project for macOS Apple Silicon
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
      console.log(`[Compile Manager macOS ARM] [${progress}%] ${status}${log ? ': ' + log : ''}`);
    };
    
    const projectRoot = path.join(fromPath, '..');
    const targetPlatform = 'macos-arm';
    const buildEdition = common.normalizeEdition(config.edition || 'standard');
    
    sendProgress('Starting macOS ARM compilation...', 2, `Target: ${targetPlatform}`);
    
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
    
    // Copy .icns icon if it exists (macOS-specific)
    sendProgress('Copying macOS icon...', 92, 'Looking for .icns icon...');
    const icnsSource = path.join(fromPath, 'assets', 'icon.icns');
    if (fs.existsSync(icnsSource)) {
      fs.copyFileSync(icnsSource, path.join(assetsDir, 'icon.icns'));
      sendProgress('macOS icon copied', 92, 'icon.icns added');
    }
    
    // Create product-specific main.js
    sendProgress('Creating product main.js...', 93, 'Generating main process file...');
    const productMainJs = common.generateProductMainJs(config);
    fs.writeFileSync(path.join(appDir, 'main.js'), productMainJs);
    
    // Create package.json
    const packageJson = common.generatePackageJson(config);
    fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify(packageJson, null, 2));

    // Final packaging verification to ensure edition exclusions are enforced
    common.verifyEditionPackaging(appDir, { edition: buildEdition, stage: 'final' }, progressCallback);
    
    // Create Unix launcher (.sh)
    sendProgress('Creating macOS launcher...', 97, 'Generating .sh file...');
    const shellContent = generateMacOSLauncher(config);
    const launcherPath = path.join(outputDir, 'start.sh');
    fs.writeFileSync(launcherPath, shellContent);
    fs.chmodSync(launcherPath, '755'); // Make executable
    
    // Create macOS .command file (double-clickable in Finder)
    const commandPath = path.join(outputDir, 'start.command');
    fs.writeFileSync(commandPath, shellContent);
    fs.chmodSync(commandPath, '755');
    
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
    console.error('[Compile Manager macOS ARM] Compile error:', err);
    return { success: false, message: err.message };
  }
}

/**
 * Generate macOS shell launcher script
 * 
 * @param {Object} config - Compilation configuration
 * @returns {string} Shell script content
 */
function generateMacOSLauncher(config) {
  return `#!/bin/bash
# ${config.productName} Launcher for macOS

echo ""
echo "============================================"
echo " ${config.productName}"
echo " macOS Apple Silicon Edition"
echo "============================================"
echo ""

cd "$(dirname "$0")/Program_Files/app"

if [ ! -d "node_modules" ]; then
    echo "Installing dependencies (native ARM64 builds)..."
    npm install
    if [ $? -ne 0 ]; then
        echo ""
        echo "ERROR: Failed to install dependencies."
        echo ""
        read -p "Press enter to exit..."
        exit 1
    fi
fi

echo "Starting ${config.productName}..."
npm start &

sleep 2
echo ""
echo "Application started!"
echo "This terminal can be closed."
`;
}

module.exports = {
  compileProject
};
