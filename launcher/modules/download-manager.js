/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
/**
 * Pseudo Science Fiction Core Collection - Download Manager Module
 * Orchestrates model + projector + split-shard downloads.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const { verifySHA256, extractFilenameFromURL, isValidURL, formatSpeed, formatETA } = require('./download-manager-utils');
const {
  normalizeChecksumSpec,
  resolveExpectedHashForFilename,
  verifyFileChecksum
} = require('./download-manager-checksum');
const { downloadWithRedirects } = require('./download-manager-network');
const {
  parseSplitFilename,
  generateShardFilenames,
  findAllShards,
  deriveSafetensorsIndexInfo,
  downloadAllShards,
  mergeShards,
  cleanupShards
} = require('./download-manager-split');
const {
  checkFileExists,
  deleteModel,
  cleanupOllamaArtifacts,
  getFileSize
} = require('./download-manager-fileops');

const DOWNLOAD_TELEMETRY_INTERVAL_MS = 1000;
const DOWNLOAD_TELEMETRY_LOG_MAX_BYTES = 512 * 1024;

function readLinuxMeminfo() {
  if (process.platform !== 'linux') return null;
  try {
    const raw = fs.readFileSync('/proc/meminfo', 'utf8');
    const selected = {};
    for (const line of raw.split('\n')) {
      if (!line) continue;
      const [keyRaw, rest] = line.split(':');
      const key = String(keyRaw || '').trim();
      if (!key) continue;
      if (key !== 'MemAvailable' && key !== 'SwapFree' && key !== 'Dirty' && key !== 'Writeback') continue;
      const valueKb = Number.parseInt(String(rest || '').replace(/[^\d]/g, ''), 10);
      if (Number.isFinite(valueKb)) selected[key] = valueKb;
    }
    return selected;
  } catch (_) {
    return null;
  }
}

function createDownloadTelemetry(appDir, seed = {}) {
  const runtimeDir = path.join(appDir, '..', '.psf', 'runtime', 'canary');
  const snapshotPath = path.join(runtimeDir, 'download-health.json');
  const logPath = path.join(runtimeDir, 'download-health.log');
  let state = {
    phase: 'start',
    progress: null,
    speedMBps: null,
    downloadedMB: null,
    totalMB: null,
    ...seed
  };
  let timer = null;

  const writeSample = () => {
    try {
      fs.mkdirSync(runtimeDir, { recursive: true });
      const mem = process.memoryUsage();
      const sample = {
        ts: Date.now(),
        type: 'download_health',
        pid: process.pid,
        phase: state.phase,
        modelId: state.modelId || null,
        collectionId: state.collectionId || null,
        url: state.url || null,
        filename: state.filename || null,
        progress: state.progress || null,
        downloadedMB: state.downloadedMB || null,
        totalMB: state.totalMB || null,
        speedMBps: state.speedMBps || null,
        prefix: state.prefix || null,
        shardFilename: state.shardFilename || null,
        currentShard: state.currentShard || null,
        totalShards: state.totalShards || null,
        node: {
          rssMB: Number((mem.rss / 1024 / 1024).toFixed(2)),
          heapUsedMB: Number((mem.heapUsed / 1024 / 1024).toFixed(2)),
          heapTotalMB: Number((mem.heapTotal / 1024 / 1024).toFixed(2)),
          externalMB: Number((mem.external / 1024 / 1024).toFixed(2))
        },
        system: {
          load1: Number(os.loadavg()[0].toFixed(2)),
          freeMemMB: Number((os.freemem() / 1024 / 1024).toFixed(2)),
          totalMemMB: Number((os.totalmem() / 1024 / 1024).toFixed(2))
        },
        linuxMeminfoKb: readLinuxMeminfo()
      };
      const tmpPath = `${snapshotPath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(sample), 'utf8');
      fs.renameSync(tmpPath, snapshotPath);
      const line = `${JSON.stringify(sample)}\n`;
      fs.appendFileSync(logPath, line, 'utf8');
      try {
        const stats = fs.statSync(logPath);
        if (stats.size > DOWNLOAD_TELEMETRY_LOG_MAX_BYTES) {
          fs.truncateSync(logPath, 0);
        }
      } catch (_) {}
    } catch (_) {}
  };

  const start = () => {
    if (timer) return;
    writeSample();
    timer = setInterval(writeSample, DOWNLOAD_TELEMETRY_INTERVAL_MS);
    if (typeof timer.unref === 'function') timer.unref();
  };

  const update = (patch = {}) => {
    state = { ...state, ...patch };
  };

  const stop = (patch = {}) => {
    update(patch);
    writeSample();
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  return { start, update, stop };
}

function writeDownloadCheckpoint(appDir, payload = {}) {
  try {
    const runtimeDir = path.join(appDir, '..', '.psf', 'runtime', 'canary');
    fs.mkdirSync(runtimeDir, { recursive: true });
    const filePath = path.join(runtimeDir, 'last-op.json');
    const tmpPath = `${filePath}.tmp`;
    const body = {
      ts: Date.now(),
      type: 'model_download',
      ...payload
    };
    fs.writeFileSync(tmpPath, JSON.stringify(body), 'utf8');
    fs.renameSync(tmpPath, filePath);
  } catch (_) {}
}

async function downloadModel(fromPath, modelId, url, collectionId, filename = null, projectorUrl = null, projectorFilename = null, expectedSHA256 = null, progressCallback = null, hfToken = null) {
  const telemetry = createDownloadTelemetry(fromPath, {
    modelId,
    collectionId,
    url,
    filename: filename || null
  });
  telemetry.start();
  try {
    console.log(`[Download Manager] Starting download: ${modelId} from ${url}`);
    writeDownloadCheckpoint(fromPath, {
      phase: 'start',
      modelId,
      collectionId,
      url,
      filename: filename || null
    });
    telemetry.update({ phase: 'start' });
    const checksumSpec = normalizeChecksumSpec(expectedSHA256);
    if (checksumSpec.mainHash || checksumSpec.projectorHash || checksumSpec.byFilename.size > 0) {
      console.log(`[Download Manager] Checksum verification enabled (main=${Boolean(checksumSpec.mainHash)}, projector=${Boolean(checksumSpec.projectorHash)}, files=${checksumSpec.byFilename.size})`);
    }
    if (projectorUrl) {
      console.log(`[Download Manager] 📷 Projector will also be downloaded: ${projectorFilename}`);
    }

    const projectRoot = path.join(fromPath, '..');
    const modelsDir = path.join(projectRoot, 'models');
    const collectionDir = path.join(modelsDir, collectionId);

    if (!fs.existsSync(collectionDir)) {
      fs.mkdirSync(collectionDir, { recursive: true });
      console.log(`[Download Manager] Created directory: ${collectionDir}`);
    }

    let finalFilename = filename;
    if (!finalFilename) {
      finalFilename = extractFilenameFromURL(url);
      if (!/\.(gguf|safetensors)$/i.test(finalFilename || '')) {
        finalFilename = `${modelId}.gguf`;
      }
    }

    // If catalog filename is generic/base but URL points to a split shard, prefer shard filename from URL.
    const urlFilename = extractFilenameFromURL(url);
    if (!parseSplitFilename(finalFilename) && parseSplitFilename(urlFilename)) {
      finalFilename = urlFilename;
    }

    const splitInfo = parseSplitFilename(finalFilename);

    if (splitInfo) {
      let lastCheckpointTs = 0;
      const wrappedCallback = (progress) => {
        if (progressCallback) progressCallback({ modelId, ...progress });
        const now = Date.now();
        telemetry.update({
          phase: 'split_progress',
          progress: progress?.progress || null,
          prefix: progress?.progressPrefix || null,
          shardFilename: progress?.shardFilename || null,
          currentShard: progress?.currentShard || null,
          totalShards: progress?.totalShards || null,
          downloadedMB: progress?.downloadedMB || null,
          totalMB: progress?.totalMB || null,
          speedMBps: progress?.speedMBps || null
        });
        if ((now - lastCheckpointTs) >= 1000) {
          lastCheckpointTs = now;
          writeDownloadCheckpoint(fromPath, {
            phase: 'split_progress',
            modelId,
            collectionId,
            progress: progress?.progress || null,
            prefix: progress?.progressPrefix || null,
            shardFilename: progress?.shardFilename || null,
            currentShard: progress?.currentShard || null,
            totalShards: progress?.totalShards || null
          });
        }
      };

      if (splitInfo.mergeStrategy === 'none') {
        const shardsResult = findAllShards(url, finalFilename);
        if (!shardsResult.success) {
          return {
            success: false,
            message: `Failed to find shard files: ${shardsResult.error}`
          };
        }

        const expectedFirstShardPath = path.join(collectionDir, finalFilename);
        if (fs.existsSync(expectedFirstShardPath)) {
          const stats = fs.statSync(expectedFirstShardPath);
          return {
            success: false,
            message: `Shard file already exists: ${finalFilename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`,
            alreadyExists: true,
            filepath: expectedFirstShardPath
          };
        }

        writeDownloadCheckpoint(fromPath, {
          phase: 'split_download_begin',
          modelId,
          collectionId,
          totalShards: shardsResult.shards.length
        });
        telemetry.update({ phase: 'split_download_begin', totalShards: shardsResult.shards.length });
        const downloadResult = await downloadAllShards(
          shardsResult.shards,
          collectionDir,
          wrappedCallback,
          hfToken
        );
        if (!downloadResult.success) {
          return downloadResult;
        }

        if (checksumSpec.byFilename.size > 0) {
          for (const shard of shardsResult.shards) {
            const expected = resolveExpectedHashForFilename(checksumSpec, shard.filename);
            if (!expected) continue;
            const shardPath = path.join(collectionDir, shard.filename);
            const verified = await verifyFileChecksum(shardPath, expected, `Checksum verification failed for ${shard.filename}!`);
            if (!verified.success) {
              cleanupShards(downloadResult.shardPaths);
              return verified;
            }
          }
        } else if (checksumSpec.mainHash && shardsResult.shards.length === 1) {
          const onlyShard = shardsResult.shards[0];
          const onlyPath = path.join(collectionDir, onlyShard.filename);
          const verified = await verifyFileChecksum(onlyPath, checksumSpec.mainHash, `Checksum verification failed for ${onlyShard.filename}!`);
          if (!verified.success) {
            cleanupShards(downloadResult.shardPaths);
            return verified;
          }
        }

        // Optional sidecar index for HF sharded safetensors.
        const indexInfo = deriveSafetensorsIndexInfo(url, finalFilename);
        let indexDownloaded = false;
        if (indexInfo) {
          const indexPath = path.join(collectionDir, indexInfo.filename);
          if (!fs.existsSync(indexPath)) {
            try {
              const indexResult = await downloadWithRedirects(
                indexInfo.url,
                indexPath,
                2,
                'Index: ',
                wrappedCallback,
                hfToken
              );
              indexDownloaded = Boolean(indexResult?.success);
              if (indexDownloaded) {
                const indexExpected = resolveExpectedHashForFilename(checksumSpec, indexInfo.filename);
                if (indexExpected) {
                  const verified = await verifyFileChecksum(indexPath, indexExpected, `Checksum verification failed for ${indexInfo.filename}!`);
                  if (!verified.success) {
                    cleanupShards(downloadResult.shardPaths);
                    return verified;
                  }
                }
              }
            } catch (_err) {
              indexDownloaded = false;
            }
          } else {
            indexDownloaded = true;
          }
        }

        return {
          success: true,
          message: `Downloaded ${shardsResult.shards.length} safetensors shards${indexDownloaded ? ' + index' : ''}`,
          filepath: path.join(collectionDir, finalFilename),
          finalFilename,
          wasSplit: true,
          splitExtension: splitInfo.extension,
          splitMergeStrategy: splitInfo.mergeStrategy,
          shardsDownloaded: shardsResult.shards.length,
          indexDownloaded
        };
      }

      const mergedFilepath = path.join(collectionDir, splitInfo.baseName);

      if (fs.existsSync(mergedFilepath)) {
        const stats = fs.statSync(mergedFilepath);
        return {
          success: false,
          message: `Merged file already exists: ${splitInfo.baseName} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`,
          alreadyExists: true,
          filepath: mergedFilepath
        };
      }

      const shardsResult = findAllShards(url, finalFilename);
      if (!shardsResult.success) {
        return {
          success: false,
          message: `Failed to find shard files: ${shardsResult.error}`
        };
      }

      writeDownloadCheckpoint(fromPath, {
        phase: 'split_download_begin',
        modelId,
        collectionId,
        totalShards: shardsResult.shards.length
      });
      const downloadResult = await downloadAllShards(
        shardsResult.shards,
        collectionDir,
        wrappedCallback,
        hfToken
      );

      if (!downloadResult.success) {
        return downloadResult;
      }

      if (checksumSpec.byFilename.size > 0) {
        for (const shard of shardsResult.shards) {
          const expected = resolveExpectedHashForFilename(checksumSpec, shard.filename);
          if (!expected) continue;
          const shardPath = path.join(collectionDir, shard.filename);
          const verified = await verifyFileChecksum(shardPath, expected, `Checksum verification failed for ${shard.filename}!`);
          if (!verified.success) {
            cleanupShards(downloadResult.shardPaths);
            return verified;
          }
        }
      }

      writeDownloadCheckpoint(fromPath, {
        phase: 'merge_begin',
        modelId,
        collectionId,
        output: mergedFilepath
      });
      telemetry.update({ phase: 'merge_begin' });
      const mergeResult = await mergeShards(
        downloadResult.shardPaths,
        mergedFilepath,
        wrappedCallback
      );

      if (!mergeResult.success) {
        cleanupShards(downloadResult.shardPaths);
        return mergeResult;
      }

      cleanupShards(downloadResult.shardPaths);

      if (checksumSpec.mainHash && wrappedCallback) {
        wrappedCallback({
          progress: '100',
          progressPrefix: 'Merge complete, verifying checksum...',
          isMerging: false
        });
      }

      if (checksumSpec.mainHash) {
        const verified = await verifyFileChecksum(mergedFilepath, checksumSpec.mainHash, `Checksum verification failed for ${splitInfo.baseName}!`);
        if (!verified.success) {
          return verified;
        }
      }

      if (projectorUrl && projectorFilename) {
        const projectorPath = path.join(collectionDir, projectorFilename);
        if (!fs.existsSync(projectorPath)) {
          try {
            const projectorResult = await downloadWithRedirects(
              projectorUrl,
              projectorPath,
              5,
              'Projector: ',
              wrappedCallback,
              hfToken
            );

            if (projectorResult.success) {
              const projectorExpected = resolveExpectedHashForFilename(checksumSpec, projectorFilename) || checksumSpec.projectorHash;
              if (projectorExpected) {
                const verified = await verifyFileChecksum(projectorPath, projectorExpected, `Checksum verification failed for ${projectorFilename}!`);
                if (!verified.success) {
                  return verified;
                }
              }
              return {
                success: true,
                message: `Downloaded and merged ${shardsResult.shards.length} shards + projector`,
                filepath: mergedFilepath,
                finalFilename: splitInfo.baseName,
                sizeMB: mergeResult.sizeMB,
                wasSplit: true,
                shardsDownloaded: shardsResult.shards.length,
                projectorDownloaded: true
              };
            }
          } catch (projErr) {
            console.warn(`[Download Manager] ⚠️ Projector download failed: ${projErr.message}`);
          }
        }
      }

      return {
        success: true,
        message: `Downloaded and merged ${shardsResult.shards.length} shards`,
        filepath: mergedFilepath,
        finalFilename: splitInfo.baseName,
        sizeMB: mergeResult.sizeMB,
        wasSplit: true,
        shardsDownloaded: shardsResult.shards.length
      };
    }

    const filepath = path.join(collectionDir, finalFilename);

    if (fs.existsSync(filepath)) {
      const stats = fs.statSync(filepath);
      return {
        success: false,
        message: `File already exists: ${finalFilename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`,
        alreadyExists: true,
        filepath
      };
    }

    let lastCheckpointTs = 0;
    const wrappedCallback = (progress) => {
      if (progressCallback) progressCallback({ modelId, ...progress });
      const now = Date.now();
      telemetry.update({
        phase: 'main_progress',
        progress: progress?.progress || null,
        prefix: progress?.progressPrefix || null,
        downloadedMB: progress?.downloadedMB || null,
        totalMB: progress?.totalMB || null,
        speedMBps: progress?.speedMBps || null
      });
      if ((now - lastCheckpointTs) >= 1000) {
        lastCheckpointTs = now;
        writeDownloadCheckpoint(fromPath, {
          phase: 'main_progress',
          modelId,
          collectionId,
          progress: progress?.progress || null,
          prefix: progress?.progressPrefix || null,
          downloadedMB: progress?.downloadedMB || null,
          speedMBps: progress?.speedMBps || null
        });
      }
    };

    const hasProjector = projectorUrl && projectorFilename;
    writeDownloadCheckpoint(fromPath, {
      phase: 'main_download_begin',
      modelId,
      collectionId,
      url,
      output: filepath
    });
    telemetry.update({ phase: 'main_download_begin', output: filepath });
    const mainResult = await downloadWithRedirects(
      url,
      filepath,
      5,
      hasProjector ? '[1/2] ' : '',
      wrappedCallback,
      hfToken
    );

    if (!mainResult.success) {
      return mainResult;
    }

    const mainExpectedHash = resolveExpectedHashForFilename(checksumSpec, finalFilename) || checksumSpec.mainHash;
    if (mainExpectedHash) {
      if (wrappedCallback) {
        wrappedCallback({
          progress: '100',
          downloadedMB: mainResult.sizeMB,
          totalMB: mainResult.sizeMB,
          speedMBps: '0',
          etaSeconds: 0,
          progressPrefix: hasProjector ? '[1/2] Verifying...' : 'Verifying checksum...'
        });
      }

      try {
        const verified = await verifyFileChecksum(filepath, mainExpectedHash);
        if (!verified.success) {
          return verified;
        }
      } catch (verifyErr) {
        return {
          success: false,
          message: `Checksum verification error: ${verifyErr.message}`
        };
      }
    }

    if (hasProjector) {
      if (wrappedCallback) {
        wrappedCallback({
          progress: '0',
          downloadedMB: '0',
          totalMB: '?',
          speedMBps: '0',
          etaSeconds: 0,
          progressPrefix: '[2/2] Projector: '
        });
      }

      const projectorPath = path.join(collectionDir, projectorFilename);
      if (fs.existsSync(projectorPath)) {
        return {
          success: true,
          message: 'Model downloaded, projector already exists',
          filepath,
          finalFilename,
          sizeMB: mainResult.sizeMB,
          projectorDownloaded: true,
          projectorSizeMB: (fs.statSync(projectorPath).size / 1024 / 1024).toFixed(2)
        };
      }

      try {
        const projectorResult = await downloadWithRedirects(
          projectorUrl,
          projectorPath,
          5,
          '[2/2] Projector: ',
          wrappedCallback,
          hfToken
        );

        if (projectorResult.success) {
          const projectorExpected = resolveExpectedHashForFilename(checksumSpec, projectorFilename) || checksumSpec.projectorHash;
          if (projectorExpected) {
            const verified = await verifyFileChecksum(projectorPath, projectorExpected, `Checksum verification failed for ${projectorFilename}!`);
            if (!verified.success) {
              return verified;
            }
          }
          return {
            success: true,
            message: 'Model and projector downloaded',
            filepath,
            finalFilename,
            sizeMB: mainResult.sizeMB,
            projectorDownloaded: true,
            projectorSizeMB: projectorResult.sizeMB
          };
        }

        return {
          success: true,
          message: `Model downloaded. Warning: Projector download failed - ${projectorResult.message}`,
          filepath,
          finalFilename,
          sizeMB: mainResult.sizeMB,
          projectorDownloaded: false
        };
      } catch (projectorErr) {
        return {
          success: true,
          message: `Model downloaded. Warning: Projector download failed - ${projectorErr.message}`,
          filepath,
          finalFilename,
          sizeMB: mainResult.sizeMB,
          projectorDownloaded: false
        };
      }
    }

    writeDownloadCheckpoint(fromPath, {
      phase: 'complete',
      modelId,
      collectionId,
      output: filepath,
      finalFilename
    });
    telemetry.stop({
      phase: 'complete',
      output: filepath,
      finalFilename
    });
    return mainResult;
  } catch (err) {
    console.error('[Download Manager] Failed to download model:', err);
    writeDownloadCheckpoint(fromPath, {
      phase: 'error',
      modelId,
      collectionId,
      message: String(err?.message || err)
    });
    telemetry.stop({
      phase: 'error',
      message: String(err?.message || err)
    });
    return { success: false, message: err.message };
  } finally {
    telemetry.stop();
  }
}

module.exports = {
  downloadModel,
  downloadWithRedirects,
  parseSplitFilename,
  generateShardFilenames,
  findAllShards,
  downloadAllShards,
  mergeShards,
  cleanupShards,
  checkFileExists,
  deleteModel,
  cleanupOllamaArtifacts,
  getFileSize,
  extractFilenameFromURL,
  verifySHA256,
  isValidURL,
  formatSpeed,
  formatETA
};
