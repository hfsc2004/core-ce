/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const fs = require('fs');
const crypto = require('crypto');

async function verifySHA256(filepath, expectedHash) {
  return new Promise((resolve, reject) => {
    if (!expectedHash) {
      resolve({ valid: true, message: 'No checksum provided, skipping verification' });
      return;
    }

    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filepath);

    stream.on('data', (data) => {
      hash.update(data);
    });

    stream.on('end', () => {
      const actualHash = hash.digest('hex');
      const valid = actualHash.toLowerCase() === expectedHash.toLowerCase();

      resolve({
        valid,
        actualHash,
        expectedHash,
        message: valid ? 'Checksum verified' : 'Checksum mismatch'
      });
    });

    stream.on('error', (err) => {
      reject(err);
    });
  });
}

function extractFilenameFromURL(url) {
  const urlParts = url.split('/');
  return urlParts[urlParts.length - 1];
}

function isValidURL(url) {
  try {
    new URL(url);
    return url.startsWith('http://') || url.startsWith('https://');
  } catch {
    return false;
  }
}

function formatSpeed(bytesPerSecond) {
  const mbps = bytesPerSecond / 1024 / 1024;
  if (mbps < 1) {
    return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  }
  return `${mbps.toFixed(2)} MB/s`;
}

function formatETA(seconds) {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${minutes}m ${secs}s`;
}

module.exports = {
  verifySHA256,
  extractFilenameFromURL,
  isValidURL,
  formatSpeed,
  formatETA
};
