/**
 * compile-product-binaries.js
 * 
 * Master orchestrator for compiling all components into native binaries.
 * This is the key to a TRUE compiled product - no Python, no Node.js, no yarn.
 * 
 * Components:
 *   - Ollama: Already native binary (downloaded)
 *   - Open WebUI: Python → PyInstaller → Native binary
 *   - AnythingLLM: Node.js → pkg → Native binary
 *   - PSF Launcher: Electron → electron-builder → Native app
 * 
 * BMOC-Lite remains sole authority for all sessions. Compiled binaries
 * accept command-line arguments and environment variables for control.
 * 
 * Build Pipeline:
 *   1. Verify source installations exist
 *   2. Compile Open WebUI (PyInstaller) - TODO: Future → Nuitka for C++
 *   3. Compile AnythingLLM (pkg)
 *   4. Package PSF Launcher (electron-builder)
 *   5. Bundle everything into final product
 * 
 * @module compile-product-binaries
 * @version 1.1.3 - March 5, 2026
 */

const path = require('path');
const fs = require('fs');

// Import compilation modules
const webuiCompiler = require('./compile-webui-pyinstaller.js');
const anythingllmCompiler = require('./compile-anythingllm-pkg.js');
const obfuscator = require('./compile-obfuscator.js');

/**
 * Get platform info
 */
function getPlatformInfo() {
  const platform = process.platform;
  const arch = process.arch;
  
  let platformDir;
  if (platform === 'linux' && arch === 'x64') platformDir = 'linux-x64';
  else if (platform === 'linux' && arch === 'arm64') platformDir = 'linux-arm64';
  else if (platform === 'darwin' && arch === 'arm64') platformDir = 'macos-arm';
  else if (platform === 'darwin' && arch === 'x64') platformDir = 'macos-intel';
  else if (platform === 'win32' && arch === 'x64') platformDir = 'windows-x64';
  else if (platform === 'win32' && arch === 'arm64') platformDir = 'windows-arm64';
  else return null;
  
  return {
    platform,
    arch,
    platformDir,
    isWindows: platform === 'win32',
    exeExt: platform === 'win32' ? '.exe' : ''
  };
}

/**
 * Check what source installations exist and what's already compiled
 * 
 * @param {string} projectRoot - Project root directory
 * @returns {Object} Status of all components
 */
function checkBuildStatus(projectRoot) {
  const platformInfo = getPlatformInfo();
  if (!platformInfo) {
    return { error: 'Unsupported platform' };
  }
  
  const status = {
    platform: platformInfo.platformDir,
    ollama: {
      installed: false,
      path: null
    },
    openWebUI: {
      sourceInstalled: false,
      compiled: false,
      sourcePath: null,
      compiledPath: null
    },
    anythingLLM: {
      sourceInstalled: false,
      compiled: false,
      sourcePath: null,
      compiledPath: null
    }
  };
  
  // Check Ollama (already native binary)
  const ollamaPath = path.join(
    projectRoot, 'binaries', 'ollama', platformInfo.platformDir, 'bin',
    `ollama${platformInfo.exeExt}`
  );
  if (fs.existsSync(ollamaPath)) {
    status.ollama.installed = true;
    status.ollama.path = ollamaPath;
  }
  
  // Check Open WebUI
  const webuiVenv = path.join(
    projectRoot, 'binaries', 'python-webui', platformInfo.platformDir, 'venv'
  );
  if (fs.existsSync(webuiVenv)) {
    status.openWebUI.sourceInstalled = true;
    status.openWebUI.sourcePath = webuiVenv;
  }
  
  const webuiCompiled = webuiCompiler.checkCompiledWebUI(projectRoot);
  if (webuiCompiled.exists) {
    status.openWebUI.compiled = true;
    status.openWebUI.compiledPath = webuiCompiled.path;
    status.openWebUI.compiledSize = webuiCompiled.sizeMB;
  }
  
  // Check AnythingLLM
  const anythingPath = path.join(projectRoot, 'binaries', 'anythingllm');
  const anythingPackageJson = path.join(anythingPath, 'package.json');
  if (fs.existsSync(anythingPackageJson)) {
    status.anythingLLM.sourceInstalled = true;
    status.anythingLLM.sourcePath = anythingPath;
  }
  
  const anythingCompiled = anythingllmCompiler.checkCompiledAnythingLLM(projectRoot);
  if (anythingCompiled.exists) {
    status.anythingLLM.compiled = true;
    status.anythingLLM.compiledPath = anythingCompiled.path;
    status.anythingLLM.compiledSize = anythingCompiled.sizeMB;
  }
  
  return status;
}

/**
 * Compile all components into native binaries
 * 
 * @param {string} projectRoot - Project root directory
 * @param {Object} options - Compilation options
 * @param {boolean} options.compileWebUI - Compile Open WebUI (default: true)
 * @param {boolean} options.compileAnythingLLM - Compile AnythingLLM (default: true)
 * @param {boolean} options.force - Force recompilation even if binary exists
 * @param {string} options.obfuscationPreset - Obfuscation preset ('none', 'light', 'medium', 'heavy')
 * @param {Function} progressCallback - Progress callback
 * @returns {Promise<Object>} Compilation results
 */
async function compileAllBinaries(projectRoot, options = {}, progressCallback = null) {
  const {
    compileWebUI = true,
    compileAnythingLLM = true,
    force = false,
    obfuscationPreset = 'medium'  // Default to medium protection
  } = options;
  
  const sendProgress = (status, progress, log = null) => {
    if (progressCallback) {
      progressCallback({ status, progress, log });
    }
    console.log(`[Compile All] ${status}${log ? ': ' + log : ''}`);
  };
  
  const results = {
    success: true,
    openWebUI: null,
    anythingLLM: null,
    obfuscation: null,
    errors: []
  };
  
  // Check current status
  sendProgress('Checking build status...', 0, 'Scanning installed components');
  const status = checkBuildStatus(projectRoot);
  
  if (status.error) {
    return { success: false, message: status.error };
  }
  
  console.log('\n========================================');
  console.log('BUILD STATUS:');
  console.log(`Platform: ${status.platform}`);
  console.log(`Ollama: ${status.ollama.installed ? '✓ Installed' : 'âœ— Not installed'}`);
  console.log(`Open WebUI Source: ${status.openWebUI.sourceInstalled ? '✓ Installed' : 'âœ— Not installed'}`);
  console.log(`Open WebUI Binary: ${status.openWebUI.compiled ? '✓ Compiled (' + status.openWebUI.compiledSize + ' MB)' : 'âœ— Not compiled'}`);
  console.log(`AnythingLLM Source: ${status.anythingLLM.sourceInstalled ? '✓ Installed' : 'âœ— Not installed'}`);
  console.log(`AnythingLLM Binary: ${status.anythingLLM.compiled ? '✓ Compiled (' + status.anythingLLM.compiledSize + ' MB)' : 'âœ— Not compiled'}`);
  console.log('========================================\n');
  
  let currentProgress = 0;
  const progressPerComponent = compileWebUI && compileAnythingLLM ? 50 : 100;
  
  // Compile Open WebUI
  if (compileWebUI) {
    if (!status.openWebUI.sourceInstalled) {
      results.errors.push('Open WebUI source not installed. Build it first.');
      results.openWebUI = { success: false, message: 'Source not installed' };
    } else if (status.openWebUI.compiled && !force) {
      sendProgress('Open WebUI already compiled', currentProgress + progressPerComponent / 2, 'Skipping (use force=true to rebuild)');
      results.openWebUI = { success: true, skipped: true, path: status.openWebUI.compiledPath };
      currentProgress += progressPerComponent;
    } else {
      sendProgress('Compiling Open WebUI...', currentProgress, 'Starting PyInstaller');
      
      // TODO: Future - Replace PyInstaller with Nuitka for true C++ compilation
      const webuiResult = await webuiCompiler.compileOpenWebUI(projectRoot, (p) => {
        const scaledProgress = currentProgress + (p.progress / 100) * progressPerComponent;
        sendProgress(`Open WebUI: ${p.status}`, scaledProgress, p.log);
      });
      
      results.openWebUI = webuiResult;
      currentProgress += progressPerComponent;
      
      if (!webuiResult.success) {
        results.errors.push(`Open WebUI: ${webuiResult.message}`);
        results.success = false;
      }
    }
  }
  
  // Compile AnythingLLM
  if (compileAnythingLLM) {
    if (!status.anythingLLM.sourceInstalled) {
      results.errors.push('AnythingLLM source not installed. Install it first.');
      results.anythingLLM = { success: false, message: 'Source not installed' };
    } else if (status.anythingLLM.compiled && !force) {
      sendProgress('AnythingLLM already compiled', currentProgress + progressPerComponent / 2, 'Skipping (use force=true to rebuild)');
      results.anythingLLM = { success: true, skipped: true, path: status.anythingLLM.compiledPath };
      currentProgress += progressPerComponent;
    } else {
      sendProgress('Archiving AnythingLLM...', currentProgress, 'Creating server.tar.gz');
      
      const anythingResult = await anythingllmCompiler.compileAnythingLLM(projectRoot, (p) => {
        const scaledProgress = currentProgress + (p.progress / 100) * progressPerComponent;
        sendProgress(`AnythingLLM: ${p.status}`, scaledProgress, p.log);
      });
      
      results.anythingLLM = anythingResult;
      currentProgress += progressPerComponent;
      
      if (!anythingResult.success) {
        results.errors.push(`AnythingLLM: ${anythingResult.message}`);
        results.success = false;
      }
    }
  }
  
  // Note: Obfuscation is applied during "Compile Product" (compile-manager)
  // when Standard Edition JS files are copied. This compiles the binaries.
  results.obfuscation = {
    preset: obfuscationPreset,
    note: 'Applied during Compile Product step via compile-manager',
    availablePresets: ['none', 'light', 'medium', 'heavy']
  };
  
  // Summary
  console.log('\n========================================');
  console.log('COMPILATION RESULTS:');
  if (results.openWebUI) {
    console.log(`Open WebUI: ${results.openWebUI.success ? '✓ Success' : 'âœ— Failed'}`);
    if (results.openWebUI.outputPath) console.log(`  Path: ${results.openWebUI.outputPath}`);
  }
  if (results.anythingLLM) {
    console.log(`AnythingLLM: ${results.anythingLLM.success ? '✓ Success' : 'âœ— Failed'}`);
    if (results.anythingLLM.outputPath) console.log(`  Path: ${results.anythingLLM.outputPath}`);
  }
  console.log(`Obfuscation: ${obfuscationPreset} (applied during Compile Product)`);
  if (results.errors.length > 0) {
    console.log('Errors:');
    results.errors.forEach(e => console.log(`  - ${e}`));
  }
  console.log('========================================\n');
  
  sendProgress(results.success ? 'Compilation complete!' : 'Compilation finished with errors', 100);
  
  return results;
}

/**
 * Get paths to compiled binaries for the Standard Edition launcher
 * 
 * @param {string} projectRoot - Project root directory
 * @returns {Object} Paths to compiled binaries (or null if not compiled)
 */
function getCompiledBinaryPaths(projectRoot) {
  const platformInfo = getPlatformInfo();
  if (!platformInfo) {
    return null;
  }
  
  const paths = {
    platform: platformInfo.platformDir,
    ollama: null,
    openWebUI: null,
    anythingLLM: null
  };
  
  // Ollama (native binary)
  const ollamaPath = path.join(
    projectRoot, 'binaries', 'ollama', platformInfo.platformDir, 'bin',
    `ollama${platformInfo.exeExt}`
  );
  if (fs.existsSync(ollamaPath)) {
    paths.ollama = ollamaPath;
  }
  
  // Open WebUI (compiled)
  const webuiPath = path.join(
    projectRoot, 'binaries', 'python-webui', platformInfo.platformDir, 'dist',
    `open-webui${platformInfo.exeExt}`
  );
  if (fs.existsSync(webuiPath)) {
    paths.openWebUI = webuiPath;
  }
  
  // AnythingLLM (compiled)
  const anythingPath = path.join(
    projectRoot, 'binaries', 'anythingllm', 'dist', platformInfo.platformDir,
    `anythingllm-server${platformInfo.exeExt}`
  );
  if (fs.existsSync(anythingPath)) {
    paths.anythingLLM = anythingPath;
  }
  
  return paths;
}

module.exports = {
  // Binary compilation
  checkBuildStatus,
  compileAllBinaries,
  getCompiledBinaryPaths,
  getPlatformInfo,
  
  // Obfuscation (for Standard Edition JS code)
  obfuscateStandardEdition: obfuscator.obfuscateStandardEdition,
  obfuscateFile: obfuscator.obfuscateFile,
  obfuscateDirectory: obfuscator.obfuscateDirectory,
  OBFUSCATION_PRESETS: obfuscator.OBFUSCATION_PRESETS
};
