/**
 * Pseudo Science Fiction Core Collection - Linux Ollama Downloader
 *
 * @version 1.1.2 - March 5, 2026
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);
const { downloadFileWithRedirects } = require('./binary-download-linux-common');

async function extractOllamaTarball(tarballPath, destDir, progressCallback = null) {
  return new Promise(async (resolve, reject) => {
    try {
      if (progressCallback) progressCallback('Extracting tarball...');
      await execPromise(`tar --zstd -xf "${tarballPath}" -C "${destDir}"`);

      const dirContents = fs.readdirSync(destDir);
      let binaryPath;
      let extractedDir;

      const directBin = path.join(destDir, 'bin', 'ollama');
      if (fs.existsSync(directBin)) {
        binaryPath = directBin;
        extractedDir = destDir;
      } else {
        const possibleDirs = dirContents.filter((d) => d.startsWith('ollama-linux'));
        if (!possibleDirs.length) throw new Error('Could not find extracted Ollama directory');
        extractedDir = path.join(destDir, possibleDirs[0]);
        binaryPath = path.join(extractedDir, 'bin', 'ollama');
        if (!fs.existsSync(binaryPath)) throw new Error('Ollama binary not found after extraction');
      }

      const targetPath = path.join(destDir, 'bin', 'ollama');
      if (progressCallback) progressCallback('Organizing files...');

      const binDir = path.join(destDir, 'bin');
      if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });

      fs.renameSync(binaryPath, targetPath);
      fs.chmodSync(targetPath, '755');

      const libSrc = path.join(extractedDir, 'lib');
      const libDest = path.join(destDir, 'lib');
      if (fs.existsSync(libSrc) && extractedDir !== destDir) {
        if (fs.existsSync(libDest)) fs.rmSync(libDest, { recursive: true, force: true });
        fs.renameSync(libSrc, libDest);
      }

      if (extractedDir !== destDir && fs.existsSync(extractedDir)) {
        fs.rmSync(extractedDir, { recursive: true, force: true });
      }
      if (fs.existsSync(tarballPath)) fs.unlinkSync(tarballPath);

      resolve({ success: true, message: 'Ollama binary extracted successfully', binaryPath: targetPath });
    } catch (err) {
      reject({ success: false, message: `Tarball extraction failed: ${err.message}` });
    }
  });
}

async function downloadOllama(fromPath, progressCallback = null) {
  return new Promise(async (resolve, reject) => {
    try {
      const projectRoot = path.join(fromPath, '..');
      const binariesDir = path.join(projectRoot, 'binaries');

      const currentArch = process.arch;
      let platformKey;
      let downloadUrl;

      if (currentArch === 'arm64') {
        platformKey = 'linux-arm64';
        downloadUrl = 'https://ollama.com/download/ollama-linux-arm64.tar.zst';
      } else {
        const hasAMD = fs.existsSync('/sys/class/drm') && fs.readdirSync('/sys/class/drm').some((d) => d.includes('amdgpu'));
        platformKey = 'linux-x64';
        downloadUrl = hasAMD
          ? 'https://ollama.com/download/ollama-linux-amd64-rocm.tar.zst'
          : 'https://ollama.com/download/ollama-linux-amd64.tar.zst';
      }

      const destDir = path.join(binariesDir, 'ollama', platformKey);
      fs.mkdirSync(destDir, { recursive: true });
      const tempFile = path.join(destDir, 'temp.tar.zst');

      await downloadFileWithRedirects({
        url: downloadUrl,
        outFile: tempFile,
        progressCallback,
        filename: 'ollama'
      });

      if (progressCallback) {
        progressCallback({ progress: 100, filename: 'ollama (extracting...)', completed: 1, total: 1, speed: 0 });
      }

      const extractResult = await extractOllamaTarball(tempFile, destDir, (msg) => console.log(`[Linux] ${msg}`));
      resolve(extractResult);
    } catch (err) {
      reject({ success: false, message: `Download failed: ${err.message}` });
    }
  });
}

module.exports = {
  downloadOllama,
  extractOllamaTarball
};
