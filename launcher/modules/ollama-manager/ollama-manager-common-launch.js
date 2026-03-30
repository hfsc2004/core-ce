/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');

function createCommonLaunchApi(deps = {}) {
  const getPlatformModule = deps.getPlatformModule;
  const checkOllamaRunning = deps.checkOllamaRunning;
  const listModels = deps.listModels;
  const {
    deriveModelNameFromFilename,
    canonicalizeModelKey,
    isQwenChatModel,
    buildQwenChatModelfile,
    shouldRepairQwenTemplate,
    removeLocalManifestTag
  } = deps.helpers;

  async function launchModelInOllama(modelPath, appPath, gpuConfig = null, projectorPath = null, progressCallback = null, forceCpu = false, runtimeOptions = {}) {
    try {
      const fullPath = path.join(appPath, '..', modelPath);
      if (!fs.existsSync(fullPath)) {
        return { success: false, message: 'Model file not found' };
      }

      const filename = path.basename(modelPath);
      const modelName = deriveModelNameFromFilename(filename);

      let fullProjectorPath = null;
      if (projectorPath) {
        fullProjectorPath = path.join(appPath, '..', projectorPath);
        if (!fs.existsSync(fullProjectorPath)) {
          console.warn(`[Ollama Common] ⚠️ Projector file not found: ${fullProjectorPath}`);
          fullProjectorPath = null;
        } else {
          console.log(`[Ollama Common] 📷 Vision model detected! Using projector: ${projectorPath}`);
        }
      }

      const calculateFileDigest = (filePath) => new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => resolve('sha256:' + hash.digest('hex')));
        stream.on('error', reject);
      });

      let port;
      const preferredPort = Number(runtimeOptions?.preferredPort || 0);
      const preventAutoStart = !!runtimeOptions?.preventAutoStart;
      const bindOnly = !!runtimeOptions?.bindOnly;

      const checkBlobExists = (digest) => new Promise((resolve) => {
        const req = http.request({
          hostname: 'localhost',
          port,
          path: `/api/blobs/${digest}`,
          method: 'HEAD'
        }, (res) => resolve(res.statusCode === 200));
        req.on('error', () => resolve(false));
        req.end();
      });

      const pushBlob = (filePath, digest, progressCb = null) => new Promise((resolve, reject) => {
        const fileSize = fs.statSync(filePath).size;
        const fileName = path.basename(filePath);
        let uploadedBytes = 0;
        const startTime = Date.now();

        const req = http.request({
          hostname: 'localhost',
          port,
          path: `/api/blobs/${digest}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': fileSize
          }
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            if (res.statusCode === 201 || res.statusCode === 200) {
              if (progressCb) {
                progressCb({ fileName, uploadedBytes: fileSize, totalBytes: fileSize, progress: 100, speed: 0, complete: true });
              }
              resolve(true);
            } else {
              reject(new Error(`Blob upload failed: HTTP ${res.statusCode} - ${data}`));
            }
          });
        });

        req.on('error', reject);
        req.setTimeout(5 * 60 * 1000, () => {
          req.destroy(new Error('Blob upload request timed out (300s).'));
        });

        const fileStream = fs.createReadStream(filePath);
        fileStream.on('error', reject);
        fileStream.on('data', (chunk) => {
          uploadedBytes += chunk.length;
          if (progressCb) {
            const progress = Math.round((uploadedBytes / fileSize) * 100);
            const elapsedSeconds = (Date.now() - startTime) / 1000;
            const speed = uploadedBytes / elapsedSeconds;
            progressCb({ fileName, uploadedBytes, totalBytes: fileSize, progress, speed, complete: false });
          }
        });

        fileStream.pipe(req);
      });

      const pushBlobWithRetry = async (filePath, digest, progressCb = null, maxAttempts = 3) => {
        let lastErr = null;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          try {
            if (progressCb && attempt > 1) {
              progressCb({
                stage: 'uploading',
                fileName: path.basename(filePath),
                message: `Retrying upload (attempt ${attempt}/${maxAttempts})...`
              });
            }
            await pushBlob(filePath, digest, progressCb);
            return true;
          } catch (err) {
            lastErr = err;
            const msg = String(err?.message || err || '');
            const mayBeTransientServerIssue = /HTTP\s+500/i.test(msg) || /rename\s+/i.test(msg) || /timeout/i.test(msg);
            if (mayBeTransientServerIssue) {
              const blobExistsNow = await checkBlobExists(digest);
              if (blobExistsNow) return true;
            }
            if (attempt < maxAttempts) {
              await new Promise((resolve) => setTimeout(resolve, 750 * attempt));
              continue;
            }
          }
        }
        throw lastErr || new Error('Blob upload failed after retries.');
      };

      const deleteModelOnPort = (name) => new Promise((resolve) => {
        const body = JSON.stringify({ name });
        const req = http.request({
          hostname: 'localhost',
          port,
          path: '/api/delete',
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
          }
        }, (res) => {
          res.on('data', () => {});
          res.on('end', () => resolve(res.statusCode >= 200 && res.statusCode < 300));
        });
        req.on('error', () => resolve(false));
        req.write(body);
        req.end();
      });

      const createModelWithBlobs = (name, mainDigest, mainFilename, projectorDigest = null, projectorFilename = null, qwenMode = 'modelfile-only') => {
        return new Promise((resolve, reject) => {
          const requestBody = { model: name };
          const qwenChat = isQwenChatModel(name);

          if (!qwenChat || qwenMode === 'files+modelfile') {
            requestBody.files = { [mainFilename]: mainDigest };
          }

          if (projectorDigest && projectorFilename) {
            requestBody.adapters = { [projectorFilename]: projectorDigest };
          }

          if (qwenChat) {
            requestBody.modelfile = buildQwenChatModelfile(mainDigest, forceCpu);
          } else if (forceCpu) {
            requestBody.modelfile = `FROM @${mainDigest}\nPARAMETER num_gpu 0`;
          }

          const postData = JSON.stringify(requestBody);
          const req = http.request({
            hostname: 'localhost',
            port,
            path: '/api/create',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postData)
            }
          }, (res) => {
            let output = '';
            let createError = null;
            res.on('data', (chunk) => {
              output += chunk.toString();
              const lines = output.split('\n').filter((line) => line.trim());
              for (const line of lines) {
                try {
                  const jsonLine = JSON.parse(line);
                  if (jsonLine && typeof jsonLine.error === 'string' && jsonLine.error.trim()) {
                    createError = jsonLine.error.trim();
                  }
                } catch (_) {
                  // Ignore partial/json-incompatible lines.
                }
              }
            });
            res.on('end', () => {
              if (createError) {
                reject(new Error(`Model creation stream error: ${createError}`));
              } else if (res.statusCode >= 200 && res.statusCode < 300) {
                resolve({ success: true, output, hasVision: projectorDigest && projectorFilename });
              } else {
                reject(new Error(`Model creation failed: HTTP ${res.statusCode} - ${output}`));
              }
            });
          });

          req.on('error', reject);
          req.write(postData);
          req.end();
        });
      };

      const probeModelLoad = (name) => new Promise((resolve) => {
        const body = JSON.stringify({
          model: name,
          prompt: 'ping',
          stream: false,
          options: {
            num_predict: 1,
            temperature: 0
          }
        });
        const req = http.request({
          hostname: 'localhost',
          port,
          path: '/api/generate',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
          }
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk.toString(); });
          res.on('end', () => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
              resolve({ ok: false, message: `HTTP ${res.statusCode} - ${String(data || '').trim()}` });
              return;
            }
            try {
              const parsed = JSON.parse(data || '{}');
              const err = String(parsed?.error || '').trim();
              if (err) {
                resolve({ ok: false, message: err });
                return;
              }
              resolve({ ok: true });
            } catch (_err) {
              resolve({ ok: true });
            }
          });
        });
        req.setTimeout(180000, () => {
          req.destroy(new Error('Model load probe timeout (180s).'));
        });
        req.on('error', (err) => resolve({ ok: false, message: err?.message || String(err) }));
        req.write(body);
        req.end();
      });

      const platformModule = getPlatformModule();
      let reusedExistingPort = false;
      if (preferredPort > 0) {
        if (bindOnly) {
          port = preferredPort;
          reusedExistingPort = true;
          console.log(`[Ollama Common] Bind-only mode on preferred Ollama port ${port}`);
        } else {
          const preferredRunning = await checkOllamaRunning(preferredPort);
          if (preferredRunning) {
            port = preferredPort;
            reusedExistingPort = true;
            console.log(`[Ollama Common] Using preferred Ollama port ${port}`);
          } else if (preventAutoStart) {
            return {
              success: false,
              message: `Preferred Ollama port ${preferredPort} is not running (auto-start disabled).`
            };
          }
        }
      }
      if (!bindOnly) {
        const existingPort = Number(
          typeof platformModule.getPSFOllamaPort === 'function'
            ? (platformModule.getPSFOllamaPort() || 0)
            : 0
        );
        if (!port && existingPort > 0) {
          const running = await checkOllamaRunning(existingPort);
          if (running) {
            port = existingPort;
            reusedExistingPort = true;
            console.log(`[Ollama Common] Reusing existing Ollama instance on port ${port}`);
          }
        }
      }
      if (!port) {
        if (preventAutoStart) {
          return {
            success: false,
            message: 'No running Ollama instance available and auto-start is disabled.'
          };
        }
        try {
          port = await platformModule.startOllamaServer(appPath, gpuConfig, 'terminal', forceCpu);
        } catch (startErr) {
          return { success: false, message: `Failed to start Ollama: ${startErr.message}` };
        }
      }

      let ollamaRunning = false;
      for (let i = 0; i < 12; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        ollamaRunning = await checkOllamaRunning(port);
        if (ollamaRunning) break;
      }
      if (!ollamaRunning) return { success: false, message: 'Failed to start Ollama' };

      try {
        const result = await listModels({ port });
        if (result.success && Array.isArray(result.models)) {
          const targetKey = canonicalizeModelKey(modelName);
          const modelExists = result.models.some((m) => {
            const nameKey = canonicalizeModelKey(m.name);
            const modelKey = canonicalizeModelKey(m.model);
            return nameKey === targetKey || modelKey === targetKey;
          });

          if (modelExists) {
            let shouldRecreateModel = false;
            if (isQwenChatModel(modelName)) {
              const show = await new Promise((resolve) => {
                const body = JSON.stringify({ name: modelName });
                const req = http.request({
                  hostname: 'localhost',
                  port,
                  path: '/api/show',
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body)
                  }
                }, (res) => {
                  let data = '';
                  res.on('data', (chunk) => { data += chunk.toString(); });
                  res.on('end', () => {
                    if (res.statusCode < 200 || res.statusCode >= 300) {
                      resolve(null);
                      return;
                    }
                    try {
                      resolve(JSON.parse(data || '{}'));
                    } catch {
                      resolve(null);
                    }
                  });
                });
                req.on('error', () => resolve(null));
                req.write(body);
                req.end();
              });

              const needsRepair = shouldRepairQwenTemplate(show, appPath, modelName);
              if (needsRepair) {
                shouldRecreateModel = true;
                removeLocalManifestTag(appPath, modelName, 'latest');
                await deleteModelOnPort(modelName);
              }
            }
            if (!shouldRecreateModel) {
              const probe = await probeModelLoad(modelName);
              if (probe.ok) {
                if (progressCallback) {
                  progressCallback({ stage: 'complete', message: 'Model already loaded', progress: 100 });
                }
                return {
                  success: true,
                  message: `Model ${modelName} already loaded`,
                  modelName,
                  hasVision: fullProjectorPath ? true : false,
                  port
                };
              }
              console.warn(`[Ollama Common] Existing model "${modelName}" failed probe, recreating: ${probe.message}`);
              shouldRecreateModel = true;
              removeLocalManifestTag(appPath, modelName, 'latest');
              await deleteModelOnPort(modelName);
            }
          }
        }
      } catch (_) {
        // Continue with wrap flow if check fails.
      }

      if (progressCallback) progressCallback({ stage: 'calculating', fileName: filename, message: 'Calculating digest...' });
      const mainDigest = await calculateFileDigest(fullPath);

      const mainBlobExists = await checkBlobExists(mainDigest);
      if (!mainBlobExists) {
        if (progressCallback) progressCallback({ stage: 'uploading', fileName: filename, message: 'Uploading main model...' });
        await pushBlobWithRetry(fullPath, mainDigest, progressCallback, 3);
      }

      let projectorDigest = null;
      let projectorFilenameOnly = null;
      if (fullProjectorPath) {
        if (progressCallback) {
          progressCallback({
            stage: 'calculating',
            fileName: path.basename(fullProjectorPath),
            message: 'Calculating projector digest...'
          });
        }

        projectorDigest = await calculateFileDigest(fullProjectorPath);
        const projectorBlobExists = await checkBlobExists(projectorDigest);
        if (!projectorBlobExists) {
          if (progressCallback) {
            progressCallback({
              stage: 'uploading',
              fileName: path.basename(fullProjectorPath),
              message: 'Uploading projector...'
            });
          }
          await pushBlobWithRetry(fullProjectorPath, projectorDigest, progressCallback, 3);
        }
        projectorFilenameOnly = path.basename(fullProjectorPath);
      }

      if (progressCallback) progressCallback({ stage: 'creating', message: 'Creating model...' });
      const result = await createModelWithBlobs(
        modelName,
        mainDigest,
        filename,
        projectorDigest,
        projectorFilenameOnly,
        'files+modelfile'
      );

      const probeAfterCreate = await probeModelLoad(modelName);
      if (!probeAfterCreate.ok) {
        console.warn(`[Ollama Common] Newly created model "${modelName}" failed load probe: ${probeAfterCreate.message}`);
        removeLocalManifestTag(appPath, modelName, 'latest');
        await deleteModelOnPort(modelName);
        return {
          success: false,
          message: `Model wrapped, but load validation failed: ${probeAfterCreate.message}`
        };
      }

      return {
        success: true,
        message: result.hasVision
          ? `Model ${modelName} loaded with vision support`
          : `Model ${modelName} loaded successfully`,
        modelName,
        hasVision: result.hasVision || false,
        port,
        reusedExistingPort
      };
    } catch (err) {
      console.error('[Ollama Common] Error launching model:', err);
      return { success: false, message: err.message };
    }
  }

  return {
    launchModelInOllama
  };
}

module.exports = createCommonLaunchApi;
