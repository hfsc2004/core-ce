/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFilePromise = promisify(execFile);
const ggufToolsBuilder = require('./gguf-tools-builder');
const { downloadWithRedirects } = require('./download-manager-network');

const SPLIT_FILE_PATTERNS = [
  {
    extension: '.gguf',
    regex: /-(\d{5})-of-(\d{5})\.gguf$/i,
    mergedExtension: '.gguf',
    mergeStrategy: 'gguf'
  },
  {
    extension: '.safetensors',
    regex: /-(\d{5})-of-(\d{5})\.safetensors$/i,
    mergedExtension: '.safetensors',
    mergeStrategy: 'none'
  }
];

function getSplitPattern(filename) {
  const lower = String(filename || '').toLowerCase();
  return SPLIT_FILE_PATTERNS.find((p) => lower.endsWith(p.extension)) || null;
}

function parseSplitFilename(filename) {
  const pattern = getSplitPattern(filename);
  if (!pattern) return null;

  const match = String(filename || '').match(pattern.regex);
  if (!match) return null;

  return {
    shardNum: parseInt(match[1], 10),
    totalShards: parseInt(match[2], 10),
    extension: pattern.extension,
    mergeStrategy: pattern.mergeStrategy,
    baseName: String(filename || '').replace(pattern.regex, pattern.mergedExtension)
  };
}

function generateShardFilenames(filename) {
  const parsed = parseSplitFilename(filename);
  if (!parsed) return [filename];

  const shards = [];
  const pattern = getSplitPattern(filename);
  if (!pattern) return [filename];
  const basePattern = String(filename || '').replace(pattern.regex, '');

  for (let i = 1; i <= parsed.totalShards; i++) {
    const shardNum = String(i).padStart(5, '0');
    const totalNum = String(parsed.totalShards).padStart(5, '0');
    shards.push(`${basePattern}-${shardNum}-of-${totalNum}${parsed.extension}`);
  }

  return shards;
}

function findAllShards(downloadUrl, filename) {
  const parsed = parseSplitFilename(filename);
  if (!parsed) {
    return { success: false, error: 'Not a split file' };
  }

  const shardFilenames = generateShardFilenames(filename);
  const baseUrl = downloadUrl.replace(/[^\/]+$/, '');

  const shards = shardFilenames.map((fn) => ({
    filename: fn,
    url: baseUrl + fn
  }));

  console.log(`[Download Manager] 📦 Generated ${shards.length} shard URLs from pattern`);
  return { success: true, shards };
}

function deriveSafetensorsIndexInfo(downloadUrl, filename) {
  const parsed = parseSplitFilename(filename);
  if (!parsed || parsed.extension !== '.safetensors') {
    return null;
  }
  const prefix = String(filename || '').replace(/-(\d{5})-of-(\d{5})\.safetensors$/i, '');
  const indexFilename = `${prefix}.safetensors.index.json`;
  const baseUrl = String(downloadUrl || '').replace(/[^\/]+$/, '');
  return {
    filename: indexFilename,
    url: `${baseUrl}${indexFilename}`
  };
}

async function downloadAllShards(shards, destDir, progressCallback = null, hfToken = null) {
  const shardPaths = [];
  let totalDownloaded = 0;
  const totalShards = shards.length;

  console.log(`[Download Manager] 📥Downloading ${totalShards} shard files...`);

  for (let i = 0; i < shards.length; i++) {
    const shard = shards[i];
    const shardPath = path.join(destDir, shard.filename);
    const progressPrefix = `[${i + 1}/${totalShards}] `;

    const shardProgressCallback = progressCallback ? (progress) => {
      progressCallback({
        ...progress,
        progressPrefix,
        currentShard: i + 1,
        totalShards,
        shardFilename: shard.filename,
        isSplitDownload: true
      });
    } : null;

    try {
      const result = await downloadWithRedirects(
        shard.url,
        shardPath,
        5,
        progressPrefix,
        shardProgressCallback,
        hfToken
      );

      if (!result.success) {
        for (const p of shardPaths) {
          if (fs.existsSync(p)) fs.unlinkSync(p);
        }
        return { success: false, message: `Failed to download shard ${i + 1}/${totalShards}: ${result.message}` };
      }

      shardPaths.push(shardPath);
      totalDownloaded += parseFloat(result.sizeMB);
    } catch (err) {
      for (const p of shardPaths) {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
      return { success: false, message: `Error downloading shard ${i + 1}/${totalShards}: ${err.message}` };
    }
  }

  return { success: true, shardPaths, totalDownloaded };
}

async function mergeShards(shardPaths, outputPath, progressCallback = null) {
  try {
    if (progressCallback) {
      progressCallback({ progress: '0', progressPrefix: 'Merging shards...', isMerging: true });
    }

    const ggufSplitPath = await ggufToolsBuilder.ensureGgufSplitAvailable({
      progressCallback: (msg) => {
        if (progressCallback) {
          progressCallback({
            progress: '0',
            progressPrefix: msg,
            isMerging: true,
            isBuildingTool: true
          });
        }
      }
    });

    const firstShard = shardPaths[0];

    if (progressCallback) {
      progressCallback({ progress: '50', progressPrefix: 'Running merge...', isMerging: true });
    }

    await execFilePromise(ggufSplitPath, ['--merge', firstShard, outputPath], {
      timeout: 600000
    });

    if (!fs.existsSync(outputPath)) {
      throw new Error('Merge completed but output file not found');
    }

    const outputStats = fs.statSync(outputPath);

    if (progressCallback) {
      progressCallback({ progress: '100', progressPrefix: 'Merge complete!', isMerging: true });
    }

    return {
      success: true,
      outputPath,
      sizeMB: (outputStats.size / 1024 / 1024).toFixed(2),
      message: 'Shards merged successfully'
    };
  } catch (err) {
    return { success: false, message: `Merge failed: ${err.message}` };
  }
}

function cleanupShards(shardPaths) {
  let deleted = 0;

  for (const shardPath of shardPaths) {
    try {
      if (fs.existsSync(shardPath)) {
        fs.unlinkSync(shardPath);
        deleted++;
      }
    } catch (err) {
      console.warn(`[Download Manager] Could not delete shard: ${shardPath}`, err.message);
    }
  }

  console.log(`[Download Manager] ✅ Cleaned up ${deleted} shard files`);
}

module.exports = {
  parseSplitFilename,
  generateShardFilenames,
  findAllShards,
  deriveSafetensorsIndexInfo,
  downloadAllShards,
  mergeShards,
  cleanupShards
};
