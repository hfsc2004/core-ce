/**
 * Pseudo Science Fiction Core Collection - Windows Binary Downloader
 * 
 * Handles Ollama binary downloads for Windows (x64, ARM64)
 * Uses GitHub releases ZIP files for portable binaries (Cody's method)
 * 
 * @module binary-download-windows
 * @version 1.1.2 - March 5, 2026
 * @changes Uses GitHub ZIP extraction (Cody's method)
 *          Reads version from binary-versions.json
 * @license SEE LICENSE.txt
 * @author Cody (ZIP extraction logic)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);

/**
 * Extract Ollama binary from ZIP archive
 * Uses PowerShell Expand-Archive for native Windows extraction
 */
async function extractOllamaZip(zipPath, destDir, progressCallback = null) {
  return new Promise(async (resolve, reject) => {
    try {
      console.log('[Windows] Extracting Ollama ZIP...');
      if (progressCallback) {
        progressCallback('Extracting ZIP archive...');
      }
      
      // Use PowerShell to extract ZIP
      const psCommand = `Expand-Archive -Path "${zipPath}" -DestinationPath "${destDir}" -Force`;
      await execPromise(`powershell.exe -Command "${psCommand}"`);
      
      console.log('[Windows] ZIP extracted');
      
      // Find the ollama.exe in the extracted contents
      const dirContents = fs.readdirSync(destDir);
      console.log('[Windows] Directory contents:', dirContents);
      
      let binaryPath = null;
      
      // Check for ollama.exe directly in destDir
      const directExe = path.join(destDir, 'ollama.exe');
      if (fs.existsSync(directExe)) {
        binaryPath = directExe;
        console.log('[Windows] Found ollama.exe at:', binaryPath);
      } else {
        // Check for ollama.exe in subdirectories
        for (const item of dirContents) {
          const itemPath = path.join(destDir, item);
          if (fs.statSync(itemPath).isDirectory()) {
            const exeInSubdir = path.join(itemPath, 'ollama.exe');
            if (fs.existsSync(exeInSubdir)) {
              binaryPath = exeInSubdir;
              console.log('[Windows] Found ollama.exe in subdirectory:', binaryPath);
              break;
            }
          }
        }
      }
      
      if (!binaryPath) {
        throw new Error('ollama.exe not found in extracted ZIP');
      }
      
      // Create bin/ directory and move binary there
      const binDir = path.join(destDir, 'bin');
      if (!fs.existsSync(binDir)) {
        fs.mkdirSync(binDir, { recursive: true });
      }
      
      const targetPath = path.join(binDir, 'ollama.exe');
      
      console.log('[Windows] Moving binary from:', binaryPath);
      console.log('[Windows] Moving binary to:', targetPath);
      
      if (progressCallback) {
        progressCallback('Organizing files...');
      }
      
      // Move binary to bin directory
      if (binaryPath !== targetPath) {
        fs.renameSync(binaryPath, targetPath);
        console.log('[Windows] ✅ Binary moved successfully');
      }
      
      // Cleanup: Remove any subdirectories from extraction
      for (const item of dirContents) {
        const itemPath = path.join(destDir, item);
        // Skip if file was already moved or doesn't exist
        if (!fs.existsSync(itemPath)) {
          continue;
        }
        if (fs.statSync(itemPath).isDirectory() && itemPath !== binDir) {
          fs.rmSync(itemPath, { recursive: true, force: true });
          console.log('[Windows] Cleaned up directory:', item);
        }
      }
      
      // Delete the ZIP file
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
        console.log('[Windows] Deleted ZIP file');
      }
      
      console.log('[Windows] ✅ Ollama binary ready at:', targetPath);
      
      resolve({
        success: true,
        message: 'Ollama binary extracted successfully',
        binaryPath: targetPath
      });
      
    } catch (err) {
      console.error('[Windows] ZIP extraction error:', err);
      reject({
        success: false,
        message: `ZIP extraction failed: ${err.message}`
      });
    }
  });
}

/**
 * Download Ollama binary for Windows
 * Uses GitHub releases with ZIP archives for portable binaries
 */
async function downloadOllama(fromPath, progressCallback = null) {
  return new Promise(async (resolve, reject) => {
    try {
      const projectRoot = path.join(fromPath, '..');
      const binariesDir = path.join(projectRoot, 'binaries');
      
      // Load binary-versions.json to get GitHub download info
      const configPath = path.join(projectRoot, 'models', 'binary-versions.json');
      const configData = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configData);
      
      const ollamaConfig = config.ollama;
      const version = ollamaConfig.version;
      const baseUrl = ollamaConfig.downloadUrl;
      
      const currentArch = process.arch;
      const platformKey = currentArch === 'arm64' ? 'windows-arm64' : 'windows-x64';
      const zipFilename = ollamaConfig.platforms[platformKey];
      const downloadUrl = `${baseUrl}/${version}/${zipFilename}`;
      
      const destDir = path.join(binariesDir, 'ollama', platformKey);
      fs.mkdirSync(destDir, { recursive: true });
      
      console.log(`[Windows] Downloading Ollama ${version} for ${platformKey}`);
      console.log(`[Windows] URL: ${downloadUrl}`);
      console.log(`[Windows] Destination: ${destDir}`);
      
      // Download ZIP file
      const zipPath = path.join(destDir, zipFilename);
      
      // Recursive download function to handle redirects
      const doDownload = (url, maxRedirects = 5) => {
        return new Promise((resolveDownload, rejectDownload) => {
          if (maxRedirects === 0) {
            return rejectDownload(new Error('Too many redirects'));
          }
          
          const file = fs.createWriteStream(zipPath);
          
          https.get(url, (response) => {
            // Handle redirects
            if (response.statusCode === 301 || response.statusCode === 302 || 
                response.statusCode === 303 || response.statusCode === 307 || 
                response.statusCode === 308) {
              console.log(`[Windows] Following redirect to: ${response.headers.location}`);
              file.close();
              if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
              
              // Recursively follow redirect
              doDownload(response.headers.location, maxRedirects - 1)
                .then(resolveDownload)
                .catch(rejectDownload);
              return;
            }
            
            if (response.statusCode !== 200) {
              file.close();
              if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
              rejectDownload(new Error(`Download failed with status code: ${response.statusCode}`));
              return;
            }
            
            const totalSize = parseInt(response.headers['content-length'], 10);
            let downloadedSize = 0;
            
            console.log(`[Windows] Downloading ZIP - Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
            
            response.on('data', (chunk) => {
              downloadedSize += chunk.length;
              const progress = Math.round((downloadedSize / totalSize) * 100);
              if (progressCallback) {
                progressCallback({
                  progress,
                  filename: zipFilename,
                  completed: downloadedSize,
                  total: totalSize
                });
              }
            });
            
            response.pipe(file);
            
            file.on('finish', () => {
              file.close();
              console.log(`[Windows] ✅ Downloaded ${zipFilename} (${(downloadedSize / 1024 / 1024).toFixed(2)} MB)`);
              resolveDownload();
            });
            
            file.on('error', (err) => {
              console.error('[Windows] File write error:', err);
              if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
              rejectDownload(err);
            });
          }).on('error', (err) => {
            console.error('[Windows] HTTPS request error:', err);
            file.close();
            if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
            rejectDownload(err);
          });
        });
      };
      
      await doDownload(downloadUrl);
      
      // Extract ZIP
      if (progressCallback) {
        progressCallback({ progress: 100, filename: 'ollama (extracting...)', completed: 1, total: 1, speed: 0 });
      }
      
      const extractResult = await extractOllamaZip(
        zipPath,
        destDir,
        (msg) => console.log(`[Windows] ${msg}`)
      );
      
      resolve(extractResult);
      
    } catch (err) {
      console.error('[Windows] Download error:', err);
      reject({
        success: false,
        message: `Download failed: ${err.message}`
      });
    }
  });
}

/**
 * Download Node.js binary for Windows
 * Direct .exe download from nodejs.org (no extraction needed)
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
      const baseUrl = nodejsConfig.downloadUrl;
      
      const currentArch = process.arch;
      const platformKey = currentArch === 'arm64' ? 'windows-arm64' : 'windows-x64';
      const platformPath = nodejsConfig.platforms[platformKey];
      
      // URL: https://nodejs.org/dist/v22.22.0/win-x64/node.exe
      const downloadUrl = `${baseUrl}/${version}/${platformPath}`;
      
      // Destination: binaries/nodejs/windows-x64/bin/node.exe
      const binDir = path.join(binariesDir, 'nodejs', platformKey, 'bin');
      fs.mkdirSync(binDir, { recursive: true });
      
      const localName = nodejsConfig.localName[platformKey];
      const destPath = path.join(binDir, localName);
      
      console.log(`[Windows] Downloading Node.js ${version} for ${platformKey}`);
      console.log(`[Windows] URL: ${downloadUrl}`);
      console.log(`[Windows] Destination: ${destPath}`);
      
      // Recursive download function to handle redirects
      const doDownload = (url, maxRedirects = 5) => {
        return new Promise((resolveDownload, rejectDownload) => {
          if (maxRedirects === 0) {
            return rejectDownload(new Error('Too many redirects'));
          }
          
          const file = fs.createWriteStream(destPath);
          
          https.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302 || 
                response.statusCode === 303 || response.statusCode === 307 || 
                response.statusCode === 308) {
              console.log(`[Windows] Following redirect to: ${response.headers.location}`);
              file.close();
              if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
              doDownload(response.headers.location, maxRedirects - 1)
                .then(resolveDownload)
                .catch(rejectDownload);
              return;
            }
            
            if (response.statusCode !== 200) {
              file.close();
              if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
              rejectDownload(new Error(`Download failed with status code: ${response.statusCode}`));
              return;
            }
            
            const totalSize = parseInt(response.headers['content-length'], 10);
            let downloadedSize = 0;
            
            console.log(`[Windows] Downloading node.exe - Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
            
            response.on('data', (chunk) => {
              downloadedSize += chunk.length;
              const progress = Math.round((downloadedSize / totalSize) * 100);
              if (progressCallback) {
                progressCallback({
                  progress,
                  filename: localName,
                  completed: downloadedSize,
                  total: totalSize
                });
              }
            });
            
            response.pipe(file);
            
            file.on('finish', () => {
              file.close();
              console.log(`[Windows] Downloaded ${localName} (${(downloadedSize / 1024 / 1024).toFixed(2)} MB)`);
              resolveDownload();
            });
            
            file.on('error', (err) => {
              console.error('[Windows] File write error:', err);
              if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
              rejectDownload(err);
            });
          }).on('error', (err) => {
            console.error('[Windows] HTTPS request error:', err);
            file.close();
            if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
            rejectDownload(err);
          });
        });
      };
      
      await doDownload(downloadUrl);
      
      resolve({
        success: true,
        message: `Node.js ${version} downloaded for ${platformKey}`,
        binaryPath: destPath
      });
      
    } catch (err) {
      console.error('[Windows] Node.js download error:', err);
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
    message: 'Arduino CLI download is not yet implemented for Windows in Binary Manager. Install arduino-cli manually for now.'
  };
}

module.exports = {
  downloadOllama,
  extractOllamaZip,
  downloadNodeJS,
  downloadArduinoCli
};
