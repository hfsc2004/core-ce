/**
 * Pseudo Science Fiction Core Collection - macOS Binary Downloader
 * 
 * Handles Ollama binary downloads for macOS (Intel, ARM/Apple Silicon)
 * Downloads from ollama.com and extracts the binary
 * 
 * @module binary-download-macos
 * @version 1.1.2 - March 5, 2026
 * @changes FIXED: Properly extracts binary from Ollama-darwin.zip
 * @license SEE LICENSE.txt
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);

/**
 * Download Ollama ZIP using curl
 */
async function downloadWithCurl(url, destPath, progressCallback = null) {
  return new Promise((resolve, reject) => {
    console.log(`[macOS] Downloading with curl: ${url}`);
    console.log(`[macOS] Destination: ${destPath}`);
    
    // Use curl with -L to follow redirects automatically
    const curlCmd = `curl -L --progress-bar -o "${destPath}" "${url}"`;
    
    const child = exec(curlCmd, { maxBuffer: 1024 * 1024 * 10 });
    
    let lastProgress = 0;
    
    child.stderr.on('data', (data) => {
      // Curl outputs progress to stderr
      const output = data.toString();
      
      // Try to parse progress (curl shows #'s for progress)
      const match = output.match(/(\d+)\.\d+%/);
      if (match) {
        const progress = parseInt(match[1]);
        if (progress !== lastProgress && progressCallback) {
          lastProgress = progress;
          progressCallback({
            progress: progress,
            filename: 'Ollama-darwin.zip',
            completed: 0,
            total: 100
          });
        }
      }
    });
    
    child.on('exit', (code) => {
      if (code === 0) {
        // Verify file exists and has reasonable size
        if (!fs.existsSync(destPath)) {
          reject(new Error('Download completed but file not found'));
          return;
        }
        
        const stats = fs.statSync(destPath);
        const sizeInMB = stats.size / (1024 * 1024);
        console.log(`[macOS] Downloaded file size: ${sizeInMB.toFixed(2)} MB`);
        
        if (sizeInMB < 50) {
          fs.unlinkSync(destPath);
          reject(new Error(`Downloaded file too small (${sizeInMB.toFixed(2)} MB). Expected ~50-60 MB.`));
          return;
        }
        
        console.log('[macOS] ✅ Download completed successfully');
        resolve();
      } else {
        if (fs.existsSync(destPath)) {
          fs.unlinkSync(destPath);
        }
        reject(new Error(`curl exited with code ${code}`));
      }
    });
    
    child.on('error', (err) => {
      if (fs.existsSync(destPath)) {
        fs.unlinkSync(destPath);
      }
      reject(err);
    });
  });
}

/**
 * Extract and find Ollama binary from ZIP
 */
async function extractOllamaFromZip(zipPath, destDir, progressCallback = null) {
  return new Promise(async (resolve, reject) => {
    try {
      console.log('[macOS] Extracting Ollama from ZIP...');
      
      if (progressCallback) {
        progressCallback('Extracting ZIP...');
      }
      
      // Create a temporary extraction directory
      const extractDir = path.join(destDir, 'extract-temp');
      if (fs.existsSync(extractDir)) {
        fs.rmSync(extractDir, { recursive: true, force: true });
      }
      fs.mkdirSync(extractDir, { recursive: true });
      
      // Unzip the file
      console.log('[macOS] Unzipping...');
      await execPromise(`unzip -q -o "${zipPath}" -d "${extractDir}"`);
      
      // List what we got
      console.log('[macOS] Extracted contents:');
      const contents = fs.readdirSync(extractDir);
      console.log('[macOS]', contents);
      
      // Look for the binary - it might be in different locations
      let ollamaBinaryPath = null;
      
      // Option 1: Ollama.app/Contents/Resources/ollama
      const appPath = path.join(extractDir, 'Ollama.app', 'Contents', 'Resources', 'ollama');
      if (fs.existsSync(appPath)) {
        ollamaBinaryPath = appPath;
        console.log('[macOS] Found binary in Ollama.app bundle');
      }
      
      // Option 2: Direct binary file named "ollama"
      if (!ollamaBinaryPath) {
        const directPath = path.join(extractDir, 'ollama');
        if (fs.existsSync(directPath)) {
          ollamaBinaryPath = directPath;
          console.log('[macOS] Found direct binary file');
        }
      }
      
      // Option 3: Search recursively for a file named "ollama"
      if (!ollamaBinaryPath) {
        console.log('[macOS] Searching recursively for binary...');
        const findResult = await execPromise(`find "${extractDir}" -name "ollama" -type f`);
        const foundPaths = findResult.stdout.trim().split('\n').filter(p => p);
        
        if (foundPaths.length > 0) {
          // Use the first one found
          ollamaBinaryPath = foundPaths[0];
          console.log('[macOS] Found binary at:', ollamaBinaryPath);
        }
      }
      
      if (!ollamaBinaryPath) {
        // List the full directory tree for debugging
        console.log('[macOS] Full directory tree:');
        try {
          const treeResult = await execPromise(`find "${extractDir}" -type f`);
          console.log(treeResult.stdout);
        } catch (e) {
          console.log('[macOS] Could not list tree:', e.message);
        }
        
        // Cleanup
        fs.rmSync(extractDir, { recursive: true, force: true });
        throw new Error('Could not find Ollama binary in extracted ZIP');
      }
      
      // Check binary size
      const binaryStats = fs.statSync(ollamaBinaryPath);
      const binarySizeInMB = binaryStats.size / (1024 * 1024);
      console.log(`[macOS] Binary size: ${binarySizeInMB.toFixed(2)} MB`);
      
      // Ollama binary for macOS is around 70-80 MB (compressed/optimized)
      if (binarySizeInMB < 50) {
        fs.rmSync(extractDir, { recursive: true, force: true });
        throw new Error(`Binary seems too small (${binarySizeInMB.toFixed(2)} MB). Expected ~70-80 MB.`);
      }
      
      if (progressCallback) {
        progressCallback('Copying binary...');
      }
      
      // Create bin/ directory in final destination
      const binDir = path.join(destDir, 'bin');
      if (!fs.existsSync(binDir)) {
        fs.mkdirSync(binDir, { recursive: true });
      }
      
      // Copy binary to destination
      const targetBinaryPath = path.join(binDir, 'ollama');
      console.log('[macOS] Copying binary to:', targetBinaryPath);
      
      fs.copyFileSync(ollamaBinaryPath, targetBinaryPath);
      fs.chmodSync(targetBinaryPath, '755');
      
      // Verify the copied binary
      const copiedStats = fs.statSync(targetBinaryPath);
      const copiedSizeInMB = copiedStats.size / (1024 * 1024);
      console.log(`[macOS] Copied binary size: ${copiedSizeInMB.toFixed(2)} MB`);
      
      if (progressCallback) {
        progressCallback('Cleaning up...');
      }
      
      // Clean up extraction directory
      fs.rmSync(extractDir, { recursive: true, force: true });
      console.log('[macOS] Cleaned up temporary files');
      
      // Delete the ZIP file
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
        console.log('[macOS] Deleted ZIP file');
      }
      
      console.log('[macOS] ✅ Ollama binary ready at:', targetBinaryPath);
      
      resolve({
        success: true,
        message: `Ollama binary extracted successfully (${copiedSizeInMB.toFixed(2)} MB)`,
        binaryPath: targetBinaryPath
      });
      
    } catch (err) {
      console.error('[macOS] Extraction error:', err);
      
      // Cleanup on error
      const extractDir = path.join(destDir, 'extract-temp');
      if (fs.existsSync(extractDir)) {
        fs.rmSync(extractDir, { recursive: true, force: true });
      }
      
      reject({
        success: false,
        message: `Extraction failed: ${err.message}`
      });
    }
  });
}

/**
 * Download Ollama binary for macOS
 * Uses direct download from ollama.com with curl
 */
async function downloadOllama(fromPath, progressCallback = null) {
  return new Promise(async (resolve, reject) => {
    try {
      const projectRoot = path.join(fromPath, '..');
      const binariesDir = path.join(projectRoot, 'binaries');
      
      const currentArch = process.arch;
      const platformKey = currentArch === 'arm64' ? 'macos-arm' : 'macos-intel';
      
      // Use direct ollama.com download URL
      const downloadUrl = 'https://ollama.com/download/Ollama-darwin.zip';
      
      const destDir = path.join(binariesDir, 'ollama', platformKey);
      fs.mkdirSync(destDir, { recursive: true });
      
      console.log(`[macOS] Downloading Ollama for ${platformKey}`);
      console.log(`[macOS] URL: ${downloadUrl}`);
      console.log(`[macOS] Destination: ${destDir}`);
      
      const zipPath = path.join(destDir, 'Ollama-darwin.zip');
      
      // Remove existing download if present
      if (fs.existsSync(zipPath)) {
        console.log('[macOS] Removing existing download...');
        fs.unlinkSync(zipPath);
      }
      
      console.log('[macOS] Starting download with curl...');
      await downloadWithCurl(downloadUrl, zipPath, progressCallback);
      
      // Extract and find the binary
      if (progressCallback) {
        progressCallback({ progress: 95, filename: 'Extracting...', completed: 0, total: 1 });
      }
      
      const extractResult = await extractOllamaFromZip(
        zipPath,
        destDir,
        (msg) => console.log(`[macOS] ${msg}`)
      );
      
      resolve(extractResult);
      
    } catch (err) {
      console.error('[macOS] Download error:', err);
      reject({
        success: false,
        message: `Download failed: ${err.message}`
      });
    }
  });
}

/**
 * Download Node.js binary for macOS
 * Downloads tar.gz archive from nodejs.org, extracts bin/node
 */
async function downloadNodeJS(fromPath, progressCallback = null) {
  return new Promise(async (resolve, reject) => {
    try {
      const projectRoot = path.join(fromPath, '..');
      const binariesDir = path.join(projectRoot, 'binaries');
      
      // Load binary-versions.json
      const configPath = path.join(projectRoot, 'models', 'binary-versions.json');
      const configData = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configData);
      
      const nodejsConfig = config.nodejs;
      const version = nodejsConfig.version;
      const versionNum = version.replace('v', '');
      const baseUrl = nodejsConfig.downloadUrl;
      
      const currentArch = process.arch;
      const platformKey = currentArch === 'arm64' ? 'macos-arm' : 'macos-intel';
      
      // Replace {VERSION} placeholder
      const platformPath = nodejsConfig.platforms[platformKey].replace(/\{VERSION\}/g, versionNum);
      
      // URL: https://nodejs.org/dist/v22.22.0/node-v22.22.0-darwin-arm64.tar.gz
      const downloadUrl = `${baseUrl}/${version}/${platformPath}`;
      
      // Destination: binaries/nodejs/macos-arm/
      const destDir = path.join(binariesDir, 'nodejs', platformKey);
      fs.mkdirSync(destDir, { recursive: true });
      
      const tempFile = path.join(destDir, 'temp-node.tar.gz');
      
      console.log(`[macOS] Downloading Node.js ${version} for ${platformKey}`);
      console.log(`[macOS] URL: ${downloadUrl}`);
      console.log(`[macOS] Destination: ${destDir}`);
      
      // Download using curl (consistent with macOS Ollama downloader)
      if (progressCallback) {
        progressCallback({ progress: 0, filename: 'node', completed: 0, total: 100 });
      }
      
      const curlCmd = `curl -L --progress-bar -o "${tempFile}" "${downloadUrl}"`;
      const child = exec(curlCmd, { maxBuffer: 1024 * 1024 * 10 });
      
      let lastProgress = 0;
      child.stderr.on('data', (data) => {
        const output = data.toString();
        const match = output.match(/(\d+)\.\d+%/);
        if (match) {
          const progress = parseInt(match[1]);
          if (progress !== lastProgress && progressCallback) {
            lastProgress = progress;
            progressCallback({
              progress,
              filename: 'node',
              completed: 0,
              total: 100
            });
          }
        }
      });
      
      await new Promise((resolveCurl, rejectCurl) => {
        child.on('exit', (code) => {
          if (code === 0) {
            if (!fs.existsSync(tempFile)) {
              rejectCurl(new Error('Download completed but file not found'));
              return;
            }
            const sizeInMB = fs.statSync(tempFile).size / (1024 * 1024);
            console.log(`[macOS] Downloaded: ${sizeInMB.toFixed(2)} MB`);
            
            if (sizeInMB < 10) {
              fs.unlinkSync(tempFile);
              rejectCurl(new Error(`Downloaded file too small (${sizeInMB.toFixed(2)} MB)`));
              return;
            }
            resolveCurl();
          } else {
            rejectCurl(new Error(`curl exited with code ${code}`));
          }
        });
        child.on('error', rejectCurl);
      });
      
      // Extract - just grab bin/node from the archive
      if (progressCallback) {
        progressCallback({ progress: 100, filename: 'node (extracting...)', completed: 1, total: 1, speed: 0 });
      }
      
      console.log('[macOS] Extracting Node.js binary from archive...');
      
      const binDir = path.join(destDir, 'bin');
      fs.mkdirSync(binDir, { recursive: true });
      
      // Archive structure: node-v22.22.0-darwin-arm64/bin/node
      const darwinArch = currentArch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
      const archiveDirName = `node-${version}-${darwinArch}`;
      
      // Extract just the node binary
      try {
        await execPromise(`tar -xzf "${tempFile}" -C "${destDir}" --strip-components=2 "${archiveDirName}/bin/node"`);
      } catch (stripErr) {
        console.log('[macOS] Strip extraction failed, trying full extraction...');
      }
      
      const extractedNode = path.join(destDir, 'node');
      const targetPath = path.join(binDir, 'node');
      
      if (fs.existsSync(extractedNode)) {
        fs.renameSync(extractedNode, targetPath);
      } else if (!fs.existsSync(targetPath)) {
        // Fallback: extract full then move
        await execPromise(`tar -xzf "${tempFile}" -C "${destDir}"`);
        const fullExtracted = path.join(destDir, archiveDirName, 'bin', 'node');
        if (fs.existsSync(fullExtracted)) {
          fs.renameSync(fullExtracted, targetPath);
          fs.rmSync(path.join(destDir, archiveDirName), { recursive: true, force: true });
        } else {
          throw new Error('Node binary not found after extraction');
        }
      }
      
      // Make executable
      fs.chmodSync(targetPath, '755');
      
      // Cleanup
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
      
      console.log(`[macOS] Node.js binary ready at: ${targetPath}`);
      
      resolve({
        success: true,
        message: `Node.js ${version} downloaded for ${platformKey}`,
        binaryPath: targetPath
      });
      
    } catch (err) {
      console.error('[macOS] Node.js download error:', err);
      reject({
        success: false,
        message: `Node.js download failed: ${err.message}`
      });
    }
  });
}

async function downloadArduinoCli() {
  return {
    success: false,
    message: 'Arduino CLI download is not yet implemented for macOS in Binary Manager. Install arduino-cli manually for now.'
  };
}

async function downloadEsptool() {
  return {
    success: false,
    message: 'esptool managed venv install is not yet implemented for macOS in Binary Manager. Install esptool manually for now.'
  };
}

module.exports = {
  downloadOllama,
  extractOllamaFromZip,
  downloadNodeJS,
  downloadArduinoCli,
  downloadEsptool
};
