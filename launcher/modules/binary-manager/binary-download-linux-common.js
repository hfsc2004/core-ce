/**
 * Pseudo Science Fiction Core Collection - Linux Binary Downloader (Common)
 *
 * @version 1.1.2 - March 5, 2026
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');

function emitBinaryStage(progressCallback, payload = {}) {
  if (typeof progressCallback !== 'function') return;
  progressCallback({
    filename: 'arduino-cli',
    stage: payload.stage || 'working',
    progress: Number.isFinite(payload.progress) ? payload.progress : 0,
    message: payload.message || '',
    completed: Number.isFinite(payload.completed) ? payload.completed : 0,
    total: Number.isFinite(payload.total) ? payload.total : 0,
    speed: Number.isFinite(payload.speed) ? payload.speed : 0
  });
}

function runCommandWithStreaming(command, args, onLine = null, timeoutMs = 0, env = null) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: env && typeof env === 'object' ? { ...process.env, ...env } : process.env
    });
    let stdout = '';
    let stderr = '';
    let buffer = '';
    let timedOut = false;
    const timeoutHandle = timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          child.kill('SIGKILL');
        }, timeoutMs)
      : null;

    const flushLines = (chunk) => {
      buffer += chunk;
      const parts = buffer.split(/\r?\n/);
      buffer = parts.pop() || '';
      for (const line of parts) {
        const trimmed = String(line || '').trim();
        if (!trimmed) continue;
        if (typeof onLine === 'function') onLine(trimmed);
      }
    };

    child.stdout.on('data', (chunk) => {
      const text = String(chunk || '');
      stdout += text;
      flushLines(text);
    });

    child.stderr.on('data', (chunk) => {
      const text = String(chunk || '');
      stderr += text;
      flushLines(text);
    });

    child.on('error', (err) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      reject(err);
    });

    child.on('close', (code) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (timedOut) {
        reject(new Error(`Timed out after ${Math.round(timeoutMs / 1000)}s`));
        return;
      }
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const merged = `${stdout}\n${stderr}`.trim();
      reject(new Error(merged || `Command failed with exit code ${code}`));
    });
  });
}

function resolveArduinoCliDirectories(projectRoot) {
  const baseDir = path.join(projectRoot, '.psf', 'toolchains', 'arduino-cli');
  const dirs = {
    baseDir,
    config: path.join(baseDir, 'config'),
    data: path.join(baseDir, 'data'),
    downloads: path.join(baseDir, 'downloads'),
    user: path.join(baseDir, 'user')
  };
  for (const p of Object.values(dirs)) fs.mkdirSync(p, { recursive: true });
  return dirs;
}

function buildArduinoCliEnv(projectRoot) {
  const dirs = resolveArduinoCliDirectories(projectRoot);
  return {
    ARDUINO_CONFIG_DIR: dirs.config,
    ARDUINO_DIRECTORIES_DATA: dirs.data,
    ARDUINO_DIRECTORIES_DOWNLOADS: dirs.downloads,
    ARDUINO_DIRECTORIES_USER: dirs.user
  };
}

function downloadFileWithRedirects({ url, outFile, progressCallback = null, filename = 'download' }) {
  const doDownload = (currentUrl, maxRedirects = 5) => new Promise((resolveDownload, rejectDownload) => {
    if (maxRedirects === 0) return rejectDownload(new Error('Too many redirects'));

    const file = fs.createWriteStream(outFile);
    https.get(currentUrl, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        file.close();
        if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
        const nextUrl = response.headers.location;
        return doDownload(nextUrl, maxRedirects - 1).then(resolveDownload).catch(rejectDownload);
      }

      if (response.statusCode !== 200) {
        file.close();
        if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
        return rejectDownload(new Error(`Download failed with status code: ${response.statusCode}`));
      }

      const totalSize = parseInt(response.headers['content-length'], 10) || 0;
      let downloadedSize = 0;

      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (typeof progressCallback === 'function' && totalSize > 0) {
          progressCallback({
            progress: Math.round((downloadedSize / totalSize) * 100),
            filename,
            completed: downloadedSize,
            total: totalSize
          });
        }
      });

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolveDownload({ downloadedSize, totalSize });
      });
      file.on('error', (err) => {
        if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
        rejectDownload(err);
      });
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
      rejectDownload(err);
    });
  });

  return doDownload(url);
}

module.exports = {
  emitBinaryStage,
  runCommandWithStreaming,
  resolveArduinoCliDirectories,
  buildArduinoCliEnv,
  downloadFileWithRedirects
};
