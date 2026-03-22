/**
 * Pseudo Science Fiction Core Collection - Linux Node.js Downloader
 *
 * @version 1.1.2 - March 5, 2026
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);
const { downloadFileWithRedirects } = require('./binary-download-linux-common');

async function downloadNodeJS(fromPath, progressCallback = null) {
  return new Promise(async (resolve, reject) => {
    try {
      const projectRoot = path.join(fromPath, '..');
      const binariesDir = path.join(projectRoot, 'binaries');

      const configPath = path.join(projectRoot, 'models', 'binary-versions.json');
      const configData = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configData);

      const nodejsConfig = config.nodejs;
      const version = nodejsConfig.version;
      const versionNum = version.replace('v', '');
      const baseUrl = nodejsConfig.downloadUrl;

      const currentArch = process.arch;
      const platformKey = currentArch === 'arm64' ? 'linux-arm64' : 'linux-x64';
      const platformPath = nodejsConfig.platforms[platformKey].replace(/\{VERSION\}/g, versionNum);
      const downloadUrl = `${baseUrl}/${version}/${platformPath}`;

      const destDir = path.join(binariesDir, 'nodejs', platformKey);
      fs.mkdirSync(destDir, { recursive: true });
      const tempFile = path.join(destDir, 'temp-node.tar.xz');

      await downloadFileWithRedirects({
        url: downloadUrl,
        outFile: tempFile,
        progressCallback,
        filename: 'node'
      });

      if (progressCallback) {
        progressCallback({ progress: 100, filename: 'node (extracting...)', completed: 1, total: 1, speed: 0 });
      }

      const binDir = path.join(destDir, 'bin');
      fs.mkdirSync(binDir, { recursive: true });

      const archiveDirName = `node-${version}-${currentArch === 'arm64' ? 'linux-arm64' : 'linux-x64'}`;
      try {
        await execPromise(`tar -xJf "${tempFile}" -C "${destDir}" --strip-components=2 "${archiveDirName}/bin/node"`);
      } catch {
        // fallback below
      }

      const extractedNode = path.join(destDir, 'node');
      const targetPath = path.join(binDir, 'node');

      if (fs.existsSync(extractedNode)) {
        fs.renameSync(extractedNode, targetPath);
      } else if (!fs.existsSync(targetPath)) {
        await execPromise(`tar -xJf "${tempFile}" -C "${destDir}"`);
        const fullExtracted = path.join(destDir, archiveDirName, 'bin', 'node');
        if (fs.existsSync(fullExtracted)) {
          fs.renameSync(fullExtracted, targetPath);
          fs.rmSync(path.join(destDir, archiveDirName), { recursive: true, force: true });
        } else {
          throw new Error('Node binary not found after extraction');
        }
      }

      fs.chmodSync(targetPath, '755');
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);

      resolve({
        success: true,
        message: `Node.js ${version} downloaded for ${platformKey}`,
        binaryPath: targetPath
      });
    } catch (err) {
      reject({ success: false, message: `Node.js download failed: ${err.message}` });
    }
  });
}

module.exports = {
  downloadNodeJS
};
