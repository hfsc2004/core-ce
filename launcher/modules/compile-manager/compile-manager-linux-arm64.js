/**
 * Compile Manager - Linux ARM64 Implementation
 * 
 * Platform-specific compilation for Linux ARM64 systems (Raspberry Pi, SBCs, etc.).
 * 
 * Features:
 * - .sh launcher generation with proper shebang
 * - .png icon handling
 * - chmod 755 permissions for launcher
 * - .desktop file generation
 * - ARM64-specific optimizations noted
 * 
 * @module compile-manager-linux-arm64
 * @version 1.1.3 - March 5, 2026
 * @date December 22, 2025
 */

const fs = require('fs');
const path = require('path');
const common = require('./compile-manager-common');

/**
 * Compile project for Linux ARM64
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
      console.log(`[Compile Manager Linux ARM64] [${progress}%] ${status}${log ? ': ' + log : ''}`);
    };
    
    const projectRoot = path.join(fromPath, '..');
    const targetPlatform = 'linux-arm64';
    const buildEdition = common.normalizeEdition(config.edition || 'standard');
    
    sendProgress('Starting Linux ARM64 compilation...', 2, `Target: ${targetPlatform}`);
    
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
    const binariesDir = path.join(programFilesDir, 'binaries');
    const licensesDir = path.join(outputDir, 'licenses');
    
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.mkdirSync(blobsDir, { recursive: true });
    fs.mkdirSync(binariesDir, { recursive: true });
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
    
    // Copy Ollama binaries for this platform
    await common.copyOllamaBinaries(fromPath, targetPlatform, binariesDir, progressCallback);
    
    // Copy Open WebUI binaries (if available)
    await common.copyWebUIBinaries(fromPath, targetPlatform, binariesDir, progressCallback);
    
    // Copy AnythingLLM binaries (if available)
    await common.copyAnythingLLMBinaries(fromPath, targetPlatform, binariesDir, progressCallback);
    
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
    
    // Create Unix launcher (.sh)
    sendProgress('Creating Linux launcher...', 97, 'Generating .sh file...');
    const shellContent = generateUnixLauncher(config);
    const launcherPath = path.join(outputDir, 'start.sh');
    fs.writeFileSync(launcherPath, shellContent);
    fs.chmodSync(launcherPath, '755'); // Make executable
    
    // Create .desktop file for Linux
    sendProgress('Creating .desktop file...', 98, 'Generating launcher entry...');
    const desktopContent = generateDesktopFile(config);
    fs.writeFileSync(path.join(outputDir, `${config.productName}.desktop`), desktopContent);
    
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
    console.error('[Compile Manager Linux ARM64] Compile error:', err);
    return { success: false, message: err.message };
  }
}

/**
 * Generate Unix shell launcher script
 * 
 * @param {Object} config - Compilation configuration
 * @returns {string} Shell script content
 */
function generateUnixLauncher(config) {
  return `#!/bin/bash
# ${config.productName} Launcher
# ARM64 Edition

echo ""
echo "============================================"
echo " ${config.productName}"
echo " ARM64 Edition"
echo "============================================"
echo ""

cd "$(dirname "$0")/Program_Files/app"

if [ ! -d "node_modules" ]; then
    echo "Installing dependencies (this may take a while on ARM)..."
    npm install
    if [ $? -ne 0 ]; then
        echo ""
        echo "ERROR: Failed to install dependencies."
        echo ""
        read -p "Press enter to exit..."
        exit 1
    fi
fi

# Disable Electron sandbox for portable operation (Good House Guest)
# This avoids requiring root-owned SUID chrome-sandbox binary
export ELECTRON_DISABLE_SANDBOX=1

echo "Starting ${config.productName}..."
npm start &

sleep 2
echo ""
echo "Application started!"
`;
}

/**
 * Generate .desktop file for Linux
 * 
 * @param {Object} config - Compilation configuration
 * @returns {string} .desktop file content
 */
function generateDesktopFile(config) {
  return `[Desktop Entry]
Version=1.0
Type=Application
Name=${config.productName}
Comment=${config.description || 'AI Model Collection'}
Exec=bash -c "cd $(dirname %k) && ./start.sh"
Icon=${config.productName.toLowerCase().replace(/\s+/g, '-')}
Terminal=false
Categories=Education;Science;Development;
`;
}

module.exports = {
  compileProject
};
