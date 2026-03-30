/**
 * Pseudo Science Fiction Core Collection - Linux esptool Downloader
 *
 * @version 1.1.3 - March 5, 2026
 */

const fs = require('fs');
const path = require('path');
const {
  emitBinaryStage,
  runCommandWithStreaming
} = require('./binary-download-linux-common');

async function downloadEsptool(fromPath, progressCallback = null) {
  return new Promise(async (resolve, reject) => {
    try {
      emitBinaryStage(progressCallback, {
        filename: 'esptool',
        stage: 'prepare',
        progress: 2,
        message: 'Preparing esptool Python venv...'
      });

      const projectRoot = path.join(fromPath, '..');
      const platformKey = process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
      const venvDir = path.join(projectRoot, 'binaries', 'esptool', platformKey, 'venv');
      const binDir = path.join(venvDir, 'bin');
      const esptoolPath = path.join(binDir, 'esptool');
      const pythonBin = process.env.PYTHON_BIN || 'python3';

      fs.mkdirSync(path.dirname(venvDir), { recursive: true });

      emitBinaryStage(progressCallback, {
        filename: 'esptool',
        stage: 'creating-venv',
        progress: 15,
        message: `Creating venv with ${pythonBin}...`
      });

      await runCommandWithStreaming(
        pythonBin,
        ['-m', 'venv', venvDir],
        (line) => emitBinaryStage(progressCallback, {
          filename: 'esptool',
          stage: 'creating-venv',
          progress: 25,
          message: line.slice(0, 160)
        }),
        120_000
      );

      emitBinaryStage(progressCallback, {
        filename: 'esptool',
        stage: 'installing',
        progress: 40,
        message: 'Installing esptool into venv...'
      });

      await runCommandWithStreaming(
        path.join(binDir, 'python'),
        ['-m', 'pip', 'install', '--upgrade', 'pip', 'setuptools', 'wheel', 'esptool'],
        (line) => emitBinaryStage(progressCallback, {
          filename: 'esptool',
          stage: 'installing',
          progress: 75,
          message: line.slice(0, 160)
        }),
        420_000
      );

      emitBinaryStage(progressCallback, {
        filename: 'esptool',
        stage: 'verifying',
        progress: 90,
        message: 'Verifying esptool install...'
      });

      await runCommandWithStreaming(
        esptoolPath,
        ['version'],
        (line) => emitBinaryStage(progressCallback, {
          filename: 'esptool',
          stage: 'verifying',
          progress: 95,
          message: line.slice(0, 160)
        }),
        20_000
      );

      try { fs.chmodSync(esptoolPath, 0o755); } catch {}

      emitBinaryStage(progressCallback, {
        filename: 'esptool',
        stage: 'completed',
        progress: 100,
        message: 'esptool venv install completed.'
      });

      resolve({
        success: true,
        message: `esptool installed in managed venv: ${venvDir}`,
        binaryPath: esptoolPath
      });
    } catch (err) {
      reject({ success: false, message: `esptool install failed: ${err.message}` });
    }
  });
}

module.exports = {
  downloadEsptool
};

