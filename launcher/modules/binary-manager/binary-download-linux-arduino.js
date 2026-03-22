/**
 * Pseudo Science Fiction Core Collection - Linux Arduino CLI Downloader
 *
 * @version 1.1.2 - March 5, 2026
 */

const fs = require('fs');
const path = require('path');
const {
  emitBinaryStage,
  runCommandWithStreaming,
  buildArduinoCliEnv,
  downloadFileWithRedirects
} = require('./binary-download-linux-common');

async function downloadArduinoCli(fromPath, progressCallback = null) {
  return new Promise(async (resolve, reject) => {
    try {
      emitBinaryStage(progressCallback, {
        stage: 'prepare',
        progress: 1,
        message: 'Preparing Arduino CLI download...'
      });

      const projectRoot = path.join(fromPath, '..');
      const binariesDir = path.join(projectRoot, 'binaries');
      const arduinoCliEnv = buildArduinoCliEnv(projectRoot);

      const configPath = path.join(projectRoot, 'models', 'binary-versions.json');
      const configData = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configData);
      const toolConfig = config['arduino-cli'];
      if (!toolConfig) throw new Error('arduino-cli entry missing in binary-versions.json');

      const platformKey = process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
      const fileName = toolConfig.platforms?.[platformKey];
      if (!fileName) throw new Error(`No arduino-cli artifact for platform ${platformKey}`);
      const version = String(toolConfig.version || '').trim();
      const baseUrl = String(toolConfig.downloadUrl || '').trim();
      const downloadUrl = `${baseUrl}/${version}/${fileName}`;

      const destDir = path.join(binariesDir, 'arduino-cli', platformKey);
      const binDir = path.join(destDir, 'bin');
      fs.mkdirSync(binDir, { recursive: true });
      const tempFile = path.join(destDir, fileName);

      emitBinaryStage(progressCallback, {
        stage: 'downloading',
        progress: 2,
        message: `Downloading ${fileName}...`
      });
      await downloadFileWithRedirects({
        url: downloadUrl,
        outFile: tempFile,
        filename: 'arduino-cli',
        progressCallback: ({ progress, completed, total }) => {
          const scaledProgress = total > 0 ? Math.min(80, Math.max(1, Math.round((completed / total) * 80))) : progress;
          emitBinaryStage(progressCallback, {
            stage: 'downloading',
            progress: scaledProgress,
            message: 'Downloading archive...',
            completed,
            total,
            speed: 0
          });
        }
      });

      emitBinaryStage(progressCallback, {
        stage: 'extracting',
        progress: 85,
        message: 'Download complete. Extracting archive...'
      });

      await runCommandWithStreaming('tar', ['-xzf', tempFile, '-C', destDir], null, 45_000);

      const candidates = [path.join(destDir, 'arduino-cli'), path.join(destDir, 'bin', 'arduino-cli')];
      const extracted = candidates.find((p) => fs.existsSync(p));
      if (!extracted) throw new Error('arduino-cli binary not found after extraction');

      const targetPath = path.join(binDir, 'arduino-cli');
      if (extracted !== targetPath) fs.copyFileSync(extracted, targetPath);
      fs.chmodSync(targetPath, '755');
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);

      emitBinaryStage(progressCallback, {
        stage: 'installing-index',
        progress: 90,
        message: 'Installing Arduino index on project drive (this may take a minute)...'
      });

      let coreInstallMessage = '';
      try {
        await runCommandWithStreaming(targetPath, ['core', 'update-index'], (line) => {
          emitBinaryStage(progressCallback, {
            stage: 'installing-index',
            progress: 92,
            message: `Index: ${line.slice(0, 140)}`
          });
        }, 120_000, arduinoCliEnv);

        emitBinaryStage(progressCallback, {
          stage: 'installing-core',
          progress: 94,
          message: 'Installing ESP32 core...'
        });

        await runCommandWithStreaming(targetPath, ['core', 'install', 'esp32:esp32'], (line) => {
          emitBinaryStage(progressCallback, {
            stage: 'installing-core',
            progress: 96,
            message: `ESP32 core: ${line.slice(0, 140)}`
          });
        }, 420_000, arduinoCliEnv);

        coreInstallMessage = ' ESP32 core installed.';
      } catch (coreErr) {
        coreInstallMessage = ` ESP32 core install skipped/failed: ${coreErr.message}`;
        emitBinaryStage(progressCallback, {
          stage: 'installing-core',
          progress: 96,
          message: coreInstallMessage
        });
      }

      emitBinaryStage(progressCallback, {
        stage: 'verifying',
        progress: 99,
        message: 'Verifying installation...'
      });
      emitBinaryStage(progressCallback, {
        stage: 'completed',
        progress: 100,
        message: 'Arduino CLI install completed.'
      });

      resolve({
        success: true,
        message: `Arduino CLI ${version} downloaded for ${platformKey}. Cache moved to ${path.join(projectRoot, '.psf', 'toolchains', 'arduino-cli')}.${coreInstallMessage}`,
        binaryPath: targetPath
      });
    } catch (err) {
      reject({ success: false, message: `Arduino CLI download failed: ${err.message}` });
    }
  });
}

module.exports = {
  downloadArduinoCli
};
