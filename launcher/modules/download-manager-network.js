/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');
const { pipeline, Transform } = require('stream');

const DOWNLOAD_STALL_TIMEOUT_MS = 120000;
const DOWNLOAD_PROGRESS_SAMPLE_MS = 200;
const DOWNLOAD_MAX_MBPS_DEFAULT = 8;
const DOWNLOAD_MAX_MBPS = Number.parseFloat(
  process.env.PSF_DOWNLOAD_MAX_MBPS
  || process.env.PSF_DOWNLOAD_MAX_MBPS
  || String(DOWNLOAD_MAX_MBPS_DEFAULT)
);
const DOWNLOAD_MAX_BPS = Number.isFinite(DOWNLOAD_MAX_MBPS) && DOWNLOAD_MAX_MBPS > 0
  ? Math.floor(DOWNLOAD_MAX_MBPS * 1024 * 1024)
  : 0;
const DOWNLOAD_USE_SYSTEM_WGET = process.platform === 'linux'
  && String(process.env.PSF_DOWNLOAD_USE_SYSTEM_WGET || process.env.PSF_DOWNLOAD_USE_SYSTEM_WGET || 'true').toLowerCase() !== 'false';

function getAllocatedFileBytes(stats) {
  if (!stats) return 0;
  if (Number.isFinite(stats.blocks) && stats.blocks > 0) {
    return stats.blocks * 512;
  }
  return Number.isFinite(stats.size) ? stats.size : 0;
}

function shouldUseSystemWget(downloadUrl, destPath) {
  if (!DOWNLOAD_USE_SYSTEM_WGET) return false;
  const url = String(downloadUrl || '').toLowerCase();
  const out = String(destPath || '').toLowerCase();
  const isHf = url.includes('huggingface.co/') || url.includes('.hf.co/');
  const isModelArtifact = out.endsWith('.safetensors')
    || out.endsWith('.gguf')
    || url.includes('.safetensors')
    || url.includes('.gguf');
  return isHf && isModelArtifact;
}

function downloadWithSystemWget(downloadUrl, destPath, progressPrefix = '', progressCallback = null, hfToken = null) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });

    const args = [
      '--tries=6',
      '--timeout=60',
      '--read-timeout=60',
      '--retry-connrefused',
      '--waitretry=2',
      '--show-progress',
      '--progress=bar:force:noscroll'
    ];
    if (DOWNLOAD_MAX_MBPS > 0) {
      args.push(`--limit-rate=${Math.max(1, Math.floor(DOWNLOAD_MAX_MBPS))}m`);
    }
    if (hfToken && String(downloadUrl || '').includes('huggingface.co')) {
      args.push(`--header=Authorization: Bearer ${hfToken}`);
    }
    args.push('-O', destPath, downloadUrl);

    // Force fresh transfer for deterministic UI progress and to avoid stale partial-resume jumps.
    try {
      if (fs.existsSync(destPath)) {
        fs.unlinkSync(destPath);
      }
    } catch (_) {}

    let lastProgress = 0;
    let lastReportedProgress = 0;
    let totalBytes = 0;
    let lastSizeBytes = 0;
    let lastSizeSampleTs = Date.now();
    let lastActivityTs = Date.now();
    let monitorTimer = null;
    let settled = false;

    const clearMonitor = () => {
      if (monitorTimer) {
        clearInterval(monitorTimer);
        monitorTimer = null;
      }
    };

    const finishReject = (payload) => {
      if (settled) return;
      settled = true;
      clearMonitor();
      reject(payload);
    };

    const finishResolve = (payload) => {
      if (settled) return;
      settled = true;
      clearMonitor();
      resolve(payload);
    };

    const emitProgress = () => {
      if (!progressCallback) return;
      let currentBytes = 0;
      try {
        if (fs.existsSync(destPath)) {
          const stats = fs.statSync(destPath);
          currentBytes = getAllocatedFileBytes(stats);
        }
      } catch (_) {}
      const now = Date.now();
      const dt = Math.max((now - lastSizeSampleTs) / 1000, 0.001);
      const bytesDelta = Math.max(currentBytes - lastSizeBytes, 0);
      const speedMBps = bytesDelta / dt / 1024 / 1024;
      if (currentBytes > lastSizeBytes) {
        lastActivityTs = now;
      }
      lastSizeBytes = currentBytes;
      lastSizeSampleTs = now;
      const derivedProgress = totalBytes > 0
        ? Math.max(0, Math.min(100, (currentBytes / totalBytes) * 100))
        : 0;
      const monotonicProgress = Math.max(lastReportedProgress, derivedProgress);
      lastReportedProgress = monotonicProgress;
      const speedBps = bytesDelta / dt;
      const etaSeconds = (totalBytes > 0 && speedBps > 0)
        ? Math.max(0, Math.round((totalBytes - currentBytes) / speedBps))
        : null;
      progressCallback({
        progress: monotonicProgress.toFixed(1),
        downloadedMB: (currentBytes / 1024 / 1024).toFixed(2),
        totalMB: totalBytes > 0 ? (totalBytes / 1024 / 1024).toFixed(2) : '0.00',
        speedMBps: speedMBps.toFixed(2),
        etaSeconds: etaSeconds !== null ? etaSeconds : undefined,
        progressPrefix
      });
    };

    console.log(`[Download Manager] ${progressPrefix}Using system downloader (wget) for HuggingFace model artifact`);
    if (DOWNLOAD_MAX_MBPS > 0) {
      console.log(`[Download Manager] ${progressPrefix}System downloader rate limit: ${DOWNLOAD_MAX_MBPS.toFixed(2)} MB/s`);
    }
    if (progressCallback) {
      progressCallback({
        progress: '0',
        downloadedMB: '0.00',
        totalMB: '0.00',
        speedMBps: '0.00',
        etaSeconds: 0,
        progressPrefix
      });
    }
    const child = spawn('wget', args, {
      stdio: ['ignore', 'ignore', 'pipe']
    });

    monitorTimer = setInterval(() => {
      emitProgress();
      if (Date.now() - lastActivityTs > DOWNLOAD_STALL_TIMEOUT_MS) {
        try { child.kill('SIGTERM'); } catch (_) {}
        finishReject({ success: false, message: `System downloader stalled for ${Math.round(DOWNLOAD_STALL_TIMEOUT_MS / 1000)}s` });
      }
    }, DOWNLOAD_PROGRESS_SAMPLE_MS);

    child.on('error', (err) => {
      finishReject({ success: false, message: `System downloader error: ${err.message}` });
    });

    child.stderr.on('data', (chunk) => {
      const text = String(chunk || '');
      const lengthMatch = text.match(/Length:\s*([0-9][0-9,]*)/i);
      if (lengthMatch) {
        const parsed = Number.parseInt(String(lengthMatch[1]).replace(/,/g, ''), 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          totalBytes = parsed;
        }
      }
      const matches = text.match(/(\d{1,3})%/g);
      if (!matches) return;
      const last = matches[matches.length - 1];
      const pct = Number.parseInt(String(last).replace('%', ''), 10);
      if (!Number.isFinite(pct)) return;
      if (pct > lastProgress) {
        lastProgress = pct;
        lastActivityTs = Date.now();
      }
    });

    child.on('close', (code) => {
      if (code !== 0) {
        finishReject({ success: false, message: `System downloader exited with code ${code}` });
        return;
      }
      if (!fs.existsSync(destPath)) {
        finishReject({ success: false, message: 'System downloader completed but output file was missing.' });
        return;
      }
      const stats = fs.statSync(destPath);
      if (progressCallback && lastProgress < 100) {
        lastProgress = 100;
        emitProgress();
      }
      finishResolve({
        success: true,
        message: 'Download complete',
        filepath: destPath,
        filename: path.basename(destPath),
        sizeMB: (stats.size / 1024 / 1024).toFixed(2)
      });
    });
  });
}

function createRateLimitTransform(maxBytesPerSecond = 0) {
  if (!Number.isFinite(maxBytesPerSecond) || maxBytesPerSecond <= 0) {
    return new Transform({
      transform(chunk, _encoding, callback) {
        callback(null, chunk);
      }
    });
  }

  let tokens = maxBytesPerSecond;
  let lastRefill = Date.now();

  return new Transform({
    transform(chunk, _encoding, callback) {
      const now = Date.now();
      const elapsedSec = Math.max((now - lastRefill) / 1000, 0);
      if (elapsedSec > 0) {
        tokens = Math.min(maxBytesPerSecond, tokens + (elapsedSec * maxBytesPerSecond));
        lastRefill = now;
      }

      const chunkSize = chunk.length;
      if (chunkSize <= tokens) {
        tokens -= chunkSize;
        callback(null, chunk);
        return;
      }

      const deficit = chunkSize - tokens;
      const waitMs = Math.ceil((deficit / maxBytesPerSecond) * 1000);
      tokens = 0;
      setTimeout(() => {
        lastRefill = Date.now();
        callback(null, chunk);
      }, Math.max(waitMs, 1));
    }
  });
}

function downloadWithRedirects(downloadUrl, destPath, maxRedirects = 5, progressPrefix = '', progressCallback = null, hfToken = null) {
  return new Promise((resolve, reject) => {
    if (shouldUseSystemWget(downloadUrl, destPath)) {
      downloadWithSystemWget(downloadUrl, destPath, progressPrefix, progressCallback, hfToken)
        .then(resolve)
        .catch(reject);
      return;
    }

    let settled = false;
    const settleResolve = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const settleReject = (errValue, cleanupPath = null) => {
      if (settled) return;
      settled = true;
      if (cleanupPath && fs.existsSync(cleanupPath)) {
        try {
          fs.unlinkSync(cleanupPath);
        } catch (_) {
          // Best-effort cleanup only.
        }
      }
      reject(errValue);
    };

    if (maxRedirects === 0) {
      settleReject({ success: false, message: 'Too many redirects' });
      return;
    }

    const protocol = downloadUrl.startsWith('https') ? https : http;

    const urlObj = new URL(downloadUrl);
    const requestOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: {}
    };

    if (hfToken && downloadUrl.includes('huggingface.co')) {
      requestOptions.headers.Authorization = `Bearer ${hfToken}`;
      console.log('[Download Manager] Using HuggingFace token for authenticated download');
    }

    const request = protocol.get(requestOptions, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        const redirectUrl = response.headers.location;
        console.log(`[Download Manager] Following redirect to: ${redirectUrl}`);

        response.destroy();
        downloadWithRedirects(redirectUrl, destPath, maxRedirects - 1, progressPrefix, progressCallback, hfToken)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        settleReject({ success: false, message: `HTTP ${response.statusCode}: ${response.statusMessage}` });
        return;
      }

      const totalSizeRaw = Number.parseInt(response.headers['content-length'], 10);
      const totalSize = Number.isFinite(totalSizeRaw) && totalSizeRaw > 0 ? totalSizeRaw : 0;
      let downloadedSize = 0;
      let lastProgress = 0;
      const startTime = Date.now();
      let lastChunkTs = Date.now();
      let stallTimer = null;

      const totalSizeLabel = totalSize ? `${(totalSize / 1024 / 1024).toFixed(2)} MB` : 'Unknown size';
      console.log(`[Download Manager] ${progressPrefix}Starting download: ${totalSizeLabel}`);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      const fileStream = fs.createWriteStream(destPath);

      const progressTap = new Transform({
        transform(chunk, _encoding, callback) {
          downloadedSize += chunk.length;
          lastChunkTs = Date.now();

          const progress = totalSize ? (downloadedSize / totalSize) * 100 : 0;
          const elapsed = (Date.now() - startTime) / 1000;
          const speed = downloadedSize / Math.max(elapsed, 0.001);
          const remaining = Math.max(totalSize - downloadedSize, 0);
          const eta = remaining / Math.max(speed, 1);

          if (progress - lastProgress >= 1 || (totalSize && progress === 100)) {
            if (progressCallback) {
              progressCallback({
                progress: progress.toFixed(1),
                downloadedMB: (downloadedSize / 1024 / 1024).toFixed(2),
                totalMB: totalSize ? (totalSize / 1024 / 1024).toFixed(2) : '0.00',
                speedMBps: (speed / 1024 / 1024).toFixed(2),
                etaSeconds: Math.round(eta),
                progressPrefix
              });
            }
            lastProgress = progress;
          }

          callback(null, chunk);
        }
      });
      const rateLimitTap = createRateLimitTransform(DOWNLOAD_MAX_BPS);
      if (DOWNLOAD_MAX_BPS > 0) {
        console.log(`[Download Manager] ${progressPrefix}Rate limit enabled: ${(DOWNLOAD_MAX_BPS / 1024 / 1024).toFixed(2)} MB/s`);
      }

      stallTimer = setInterval(() => {
        if (Date.now() - lastChunkTs > DOWNLOAD_STALL_TIMEOUT_MS) {
          try { response.destroy(new Error('download stalled')); } catch (_) {}
          try { request.destroy(new Error('download stalled')); } catch (_) {}
        }
      }, 1000);

      const clearStallTimer = () => {
        if (stallTimer) {
          clearInterval(stallTimer);
          stallTimer = null;
        }
      };

      response.on('aborted', () => {
        clearStallTimer();
        settleReject({ success: false, message: 'Download aborted by remote host' }, destPath);
      });

      response.on('error', (err) => {
        clearStallTimer();
        console.error('[Download Manager] Response error:', err);
        settleReject({ success: false, message: `Download stream error: ${err.message}` }, destPath);
      });

      fileStream.on('error', (err) => {
        clearStallTimer();
        console.error('[Download Manager] File write error:', err);
        settleReject({ success: false, message: `File write error: ${err.message}` }, destPath);
      });

      pipeline(response, progressTap, rateLimitTap, fileStream, (err) => {
        clearStallTimer();
        if (err) {
          console.error('[Download Manager] Pipeline error:', err);
          settleReject({ success: false, message: `Download pipeline error: ${err.message}` }, destPath);
          return;
        }

        const finalFilename = path.basename(destPath);
        console.log(`[Download Manager] ${progressPrefix}Complete: ${finalFilename} (${(downloadedSize / 1024 / 1024).toFixed(2)} MB)`);
        settleResolve({
          success: true,
          message: 'Download complete',
          filepath: destPath,
          filename: finalFilename,
          sizeMB: (downloadedSize / 1024 / 1024).toFixed(2)
        });
      });
    });

    request.on('error', (err) => {
      console.error('[Download Manager] Download error:', err);
      settleReject({ success: false, message: `Download error: ${err.message}` }, destPath);
    });

    request.setTimeout(60000, () => {
      request.abort();
      settleReject({ success: false, message: 'Download timeout (60s)' }, destPath);
    });
  });
}

module.exports = {
  downloadWithRedirects
};
