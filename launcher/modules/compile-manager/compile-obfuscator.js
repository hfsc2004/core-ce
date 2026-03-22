/**
 * compile-obfuscator.js
 * 
 * JavaScript obfuscation for Standard Edition compiled products.
 * Protects proprietary code (BMOC-Lite, licensing, catalog logic) from reverse engineering.
 * 
 * Uses javascript-obfuscator with production-grade settings:
 *   - String encryption (hides API keys, URLs, logic)
 *   - Control flow flattening (makes code hard to follow)
 *   - Dead code injection (adds noise)
 *   - Identifier renaming (removes meaningful names)
 * 
 * Applied during "Compile Product" to Standard Edition files only.
 * Core-CE remains unobfuscated for debugging.
 * 
 * Future considerations:
 *   - bytenode: Compile JS to V8 bytecode (even harder to reverse)
 *   - ASAR encryption: Encrypt the entire app.asar archive
 * 
 * @module compile-obfuscator
 * @version 1.1.2 - March 5, 2026
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const {
  collectJsFiles,
  copyNonJsFiles
} = require('./compile-obfuscator-files');

/**
 * Obfuscation presets
 */
const OBFUSCATION_PRESETS = {
  // Light obfuscation - faster, smaller output
  light: {
    compact: true,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    debugProtection: false,
    disableConsoleOutput: false,
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    numbersToExpressions: false,
    renameGlobals: false,
    selfDefending: false,
    simplify: true,
    splitStrings: false,
    stringArray: true,
    stringArrayCallsTransform: false,
    stringArrayEncoding: [],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayWrappersCount: 1,
    stringArrayWrappersChainedCalls: true,
    stringArrayWrappersParametersMaxCount: 2,
    stringArrayWrappersType: 'variable',
    stringArrayThreshold: 0.75,
    unicodeEscapeSequence: false
  },
  
  // Medium obfuscation - balanced protection and performance
  medium: {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.5,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.2,
    debugProtection: false,
    disableConsoleOutput: false,
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    numbersToExpressions: true,
    renameGlobals: false,
    selfDefending: false,
    simplify: true,
    splitStrings: true,
    splitStringsChunkLength: 10,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayCallsTransformThreshold: 0.5,
    stringArrayEncoding: ['base64'],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayWrappersCount: 2,
    stringArrayWrappersChainedCalls: true,
    stringArrayWrappersParametersMaxCount: 4,
    stringArrayWrappersType: 'function',
    stringArrayThreshold: 0.75,
    unicodeEscapeSequence: false
  },
  
  // Heavy obfuscation - maximum protection (slower, larger output)
  heavy: {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.4,
    debugProtection: true,
    debugProtectionInterval: 2000,
    disableConsoleOutput: true,
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    numbersToExpressions: true,
    renameGlobals: false,  // Keep false for Electron compatibility
    selfDefending: true,
    simplify: true,
    splitStrings: true,
    splitStringsChunkLength: 5,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayCallsTransformThreshold: 0.75,
    stringArrayEncoding: ['rc4'],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayWrappersCount: 3,
    stringArrayWrappersChainedCalls: true,
    stringArrayWrappersParametersMaxCount: 5,
    stringArrayWrappersType: 'function',
    stringArrayThreshold: 1,
    transformObjectKeys: true,
    unicodeEscapeSequence: false
  }
};

/**
 * Files to obfuscate in Standard Edition
 * These contain proprietary logic that should be protected
 */
const FILES_TO_OBFUSCATE = [
  // Core application
  'main.js',
  'preload.js',
  
  // Session management (BMOC-Lite)
  'session-manager-standard.js',
  
  // Launchers
  'webui-launcher-standard.js',
  'anythingllm-launcher-standard.js',
  
  // Renderer scripts (Standard Edition)
  'globals.js',
  'hardware-detect.js',
  'license-modal.js',
  'model-actions.js',
  'model-browser.js',
  'screen-navigation.js',
  'utilities.js',
  'webui-launcher.js'
];

/**
 * Files to NEVER obfuscate (would break functionality)
 */
const FILES_TO_SKIP = [
  'node_modules',
  '.json',
  '.html',
  '.css',
  '.md',
  '.map'
];

/**
 * Check if javascript-obfuscator is installed
 * @returns {boolean}
 */
function isObfuscatorInstalled() {
  try {
    execSync('npx javascript-obfuscator --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Install javascript-obfuscator
 * @returns {Promise<boolean>}
 */
async function installObfuscator() {
  try {
    console.log('[Obfuscator] Installing javascript-obfuscator...');
    execSync('npm install -g javascript-obfuscator', { 
      stdio: 'pipe',
      timeout: 120000 
    });
    console.log('[Obfuscator] Installation complete');
    return true;
  } catch (err) {
    console.error('[Obfuscator] Failed to install:', err.message);
    return false;
  }
}

/**
 * Obfuscate a single JavaScript file
 * 
 * @param {string} inputPath - Path to input JS file
 * @param {string} outputPath - Path to output obfuscated file
 * @param {string} preset - Obfuscation preset ('light', 'medium', 'heavy')
 * @returns {Promise<Object>} { success, inputSize, outputSize, message }
 */
async function obfuscateFile(inputPath, outputPath, preset = 'medium') {
  if (!fs.existsSync(inputPath)) {
    return { success: false, message: `File not found: ${inputPath}` };
  }
  
  const options = OBFUSCATION_PRESETS[preset] || OBFUSCATION_PRESETS.medium;
  const inputSize = fs.statSync(inputPath).size;
  
  try {
    // Read source
    const source = fs.readFileSync(inputPath, 'utf8');
    
    // Use javascript-obfuscator programmatically if available,
    // otherwise fall back to CLI
    let obfuscated;
    
    try {
      // Try programmatic approach first (faster)
      const JavaScriptObfuscator = require('javascript-obfuscator');
      const result = JavaScriptObfuscator.obfuscate(source, options);
      obfuscated = result.getObfuscatedCode();
    } catch {
      // Fall back to CLI
      const configPath = path.join(path.dirname(inputPath), '.obfuscator-config.json');
      fs.writeFileSync(configPath, JSON.stringify(options));
      
      execSync(`npx javascript-obfuscator "${inputPath}" --output "${outputPath}" --config "${configPath}"`, {
        stdio: 'pipe',
        timeout: 60000
      });
      
      fs.unlinkSync(configPath);
      
      if (fs.existsSync(outputPath)) {
        const outputSize = fs.statSync(outputPath).size;
        return {
          success: true,
          inputSize,
          outputSize,
          ratio: (outputSize / inputSize).toFixed(2),
          message: `Obfuscated ${path.basename(inputPath)}`
        };
      }
      
      return { success: false, message: 'CLI obfuscation produced no output' };
    }
    
    // Write obfuscated output
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, obfuscated);
    const outputSize = fs.statSync(outputPath).size;
    
    return {
      success: true,
      inputSize,
      outputSize,
      ratio: (outputSize / inputSize).toFixed(2),
      message: `Obfuscated ${path.basename(inputPath)}`
    };
    
  } catch (err) {
    return { success: false, message: `Obfuscation failed: ${err.message}` };
  }
}

/**
 * Obfuscate all JavaScript files in a directory
 * 
 * @param {string} sourceDir - Source directory (unobfuscated)
 * @param {string} outputDir - Output directory (obfuscated)
 * @param {Object} options - Options
 * @param {string} options.preset - Obfuscation preset ('light', 'medium', 'heavy')
 * @param {boolean} options.specificFilesOnly - Only obfuscate FILES_TO_OBFUSCATE list
 * @param {Function} progressCallback - Progress callback
 * @returns {Promise<Object>} { success, filesProcessed, totalInputSize, totalOutputSize, errors }
 */
async function obfuscateDirectory(sourceDir, outputDir, options = {}, progressCallback = null) {
  const {
    preset = 'medium',
    specificFilesOnly = true
  } = options;
  
  const sendProgress = (status, progress, log = null) => {
    if (progressCallback) {
      progressCallback({ status, progress, log });
    }
    if (log) console.log(`[Obfuscator] ${log}`);
  };
  
  sendProgress('Preparing obfuscation...', 0, `Preset: ${preset}`);
  
  // Check/install obfuscator
  if (!isObfuscatorInstalled()) {
    sendProgress('Installing obfuscator...', 5, 'First-time setup');
    const installed = await installObfuscator();
    if (!installed) {
      return { success: false, message: 'Failed to install javascript-obfuscator' };
    }
  }
  
  const filesToProcess = collectJsFiles(sourceDir, {
    specificFilesOnly,
    filesToObfuscate: FILES_TO_OBFUSCATE,
    skipPatterns: FILES_TO_SKIP
  });
  
  if (filesToProcess.length === 0) {
    return { success: true, filesProcessed: 0, message: 'No files to obfuscate' };
  }
  
  sendProgress('Obfuscating files...', 10, `Found ${filesToProcess.length} files`);
  
  const results = {
    success: true,
    filesProcessed: 0,
    filesFailed: 0,
    totalInputSize: 0,
    totalOutputSize: 0,
    errors: [],
    files: []
  };
  
  // Process each file
  for (let i = 0; i < filesToProcess.length; i++) {
    const file = filesToProcess[i];
    const progress = 10 + (i / filesToProcess.length) * 85;
    
    sendProgress('Obfuscating...', progress, file.name);
    
    const outputPath = path.join(outputDir, file.relPath);
    const result = await obfuscateFile(file.fullPath, outputPath, preset);
    
    if (result.success) {
      results.filesProcessed++;
      results.totalInputSize += result.inputSize;
      results.totalOutputSize += result.outputSize;
      results.files.push({
        name: file.name,
        inputSize: result.inputSize,
        outputSize: result.outputSize
      });
    } else {
      results.filesFailed++;
      results.errors.push(`${file.name}: ${result.message}`);
    }
  }
  
  // Copy non-JS files as-is
  sendProgress('Copying non-JS files...', 95, 'Preserving HTML, CSS, JSON...');
  copyNonJsFiles(sourceDir, outputDir, FILES_TO_OBFUSCATE);
  
  // Summary
  const inputMB = (results.totalInputSize / (1024 * 1024)).toFixed(2);
  const outputMB = (results.totalOutputSize / (1024 * 1024)).toFixed(2);
  const ratio = results.totalInputSize > 0 
    ? (results.totalOutputSize / results.totalInputSize).toFixed(2) 
    : '0';
  
  sendProgress('Obfuscation complete!', 100, 
    `${results.filesProcessed} files: ${inputMB}MB → ${outputMB}MB (${ratio}x)`);
  
  results.success = results.filesFailed === 0;
  results.message = `Processed ${results.filesProcessed} files, ${results.filesFailed} failed`;
  
  return results;
}

/**
 * Obfuscate Standard Edition app directory during compilation
 * 
 * @param {string} appDir - Standard Edition app directory
 * @param {string} preset - Obfuscation preset
 * @param {Function} progressCallback - Progress callback
 * @returns {Promise<Object>} Results
 */
async function obfuscateStandardEdition(appDir, preset = 'medium', progressCallback = null) {
  console.log('\n========================================');
  console.log('OBFUSCATING STANDARD EDITION');
  console.log(`Directory: ${appDir}`);
  console.log(`Preset: ${preset}`);
  console.log('========================================\n');
  
  // Create temp directory for obfuscated output
  const tempDir = path.join(path.dirname(appDir), 'app-obfuscated-temp');
  
  // Clean temp dir if exists
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  
  // Obfuscate to temp directory
  const result = await obfuscateDirectory(appDir, tempDir, { preset }, progressCallback);
  
  if (result.success) {
    // Replace original with obfuscated
    fs.rmSync(appDir, { recursive: true, force: true });
    fs.renameSync(tempDir, appDir);
    
    console.log('\n========================================');
    console.log('OBFUSCATION COMPLETE');
    console.log(`Files processed: ${result.filesProcessed}`);
    console.log(`Size change: ${(result.totalInputSize/1024).toFixed(1)}KB → ${(result.totalOutputSize/1024).toFixed(1)}KB`);
    console.log('========================================\n');
  } else {
    // Clean up temp dir on failure
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
  
  return result;
}

module.exports = {
  obfuscateFile,
  obfuscateDirectory,
  obfuscateStandardEdition,
  isObfuscatorInstalled,
  installObfuscator,
  OBFUSCATION_PRESETS,
  FILES_TO_OBFUSCATE
};
