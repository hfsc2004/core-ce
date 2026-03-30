/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
function createModelsOllamaTools(deps = {}) {
  const {
    getRuntimeContext,
    getInferenceBackend,
    getTerminalOllamaPort,
    ollamaManager,
    fs,
    path,
    http,
    crypto,
    withTimeout,
    templateHealthCache
  } = deps;

  async function ensureModelChatTemplateHealthy(modelName) {
    try {
      if (String(getInferenceBackend() || 'ollama').toLowerCase() !== 'ollama') {
        return { success: true, repaired: false, checked: false };
      }
      const targetModel = String(modelName || '').trim();
      if (!targetModel || !isBrokenChatTemplateModel(targetModel)) {
        return { success: true, repaired: false, checked: false };
      }
      const port = getTerminalOllamaPort();
      const cacheKey = `${String(port || '')}:${targetModel.toLowerCase()}`;
      const now = Date.now();
      const cached = templateHealthCache.get(cacheKey);
      if (cached && (now - cached.checkedAt) < 5 * 60 * 1000) {
        return { success: true, repaired: !!cached.repaired, checked: true, cached: true };
      }

      const show = await showModelOnPort(targetModel, port);
      if (!show.success) {
        return { success: false, message: `Unable to inspect model template for ${targetModel}` };
      }
      if (!shouldRepairChatTemplate(show)) {
        templateHealthCache.set(cacheKey, { checkedAt: now, repaired: false });
        return { success: true, repaired: false, checked: true };
      }
      return {
        success: false,
        message:
          `Model template needs repair for ${targetModel}. ` +
          'Coding Terminal repair is disabled; use regular PSF Terminal to re-wrap.'
      };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  async function modelExistsOnPort(modelName, port) {
    const result = await ollamaManager.listModels({ port });
    if (!result?.success || !Array.isArray(result.models)) return false;
    const target = String(modelName).toLowerCase();
    return result.models.some((m) => {
      const name = String(m.name || '').toLowerCase();
      return name === target || name.startsWith(`${target}:`) || target.startsWith(`${name}:`);
    });
  }

  async function wrapModelOnPort({ modelPathRel, projectorPathRel, modelName, port }) {
    try {
      const runtime = getRuntimeContext();
      const fullPath = path.join(runtime.appDir, '..', modelPathRel);
      if (!fs.existsSync(fullPath)) {
        return { success: false, message: `Model file not found: ${modelPathRel}` };
      }
      let modelDigest = findModelLayerDigestFromManifest(runtime, modelName);
      if (modelDigest) {
        const exists = await blobExistsOnPort(modelDigest, port);
        if (!exists) {
          await uploadBlobToPort(fullPath, modelDigest, port);
        }
      } else {
        modelDigest = await calculateFileDigest(fullPath);
        await ensureBlobOnPort(fullPath, modelDigest, port);
      }

      let projectorDigest = null;
      let projectorFilename = null;
      if (projectorPathRel) {
        const fullProjector = path.join(runtime.appDir, '..', projectorPathRel);
        if (fs.existsSync(fullProjector)) {
          projectorDigest = await calculateFileDigest(fullProjector);
          await ensureBlobOnPort(fullProjector, projectorDigest, port);
          projectorFilename = path.basename(projectorPathRel);
        }
      }

      return await createModelOnPort({
        modelName,
        modelFilename: path.basename(modelPathRel),
        modelDigest,
        projectorFilename,
        projectorDigest,
        port
      });
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  function calculateFileDigest(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(`sha256:${hash.digest('hex')}`));
      stream.on('error', reject);
    });
  }

  function findModelLayerDigestFromManifest(runtime, modelName) {
    try {
      const baseDir = path.join(
        runtime.appDir,
        '..',
        'models',
        'manifests',
        'registry.ollama.ai',
        'library'
      );
      const modelCandidates = Array.from(
        new Set([
          String(modelName || '').trim(),
          String(modelName || '').trim().toLowerCase()
        ])
      ).filter(Boolean);

      for (const candidate of modelCandidates) {
        const manifestPath = path.join(baseDir, candidate, 'latest');
        if (!fs.existsSync(manifestPath)) continue;
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const layers = Array.isArray(manifest?.layers) ? manifest.layers : [];
        const modelLayer = layers.find((layer) => (
          String(layer?.mediaType || '').toLowerCase() === 'application/vnd.ollama.image.model'
        ));
        if (modelLayer?.digest) {
          return String(modelLayer.digest);
        }
      }
    } catch {}
    return null;
  }

  function blobExistsOnPort(digest, port) {
    return new Promise((resolve) => {
      const req = http.request({
        hostname: 'localhost',
        port,
        path: `/api/blobs/${digest}`,
        method: 'HEAD'
      }, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.end();
    });
  }

  function uploadBlobToPort(filePath, digest, port) {
    return new Promise((resolve, reject) => {
      const stat = fs.statSync(filePath);
      const req = http.request({
        hostname: 'localhost',
        port,
        path: `/api/blobs/${digest}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': stat.size
        }
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk.toString(); });
        res.on('end', () => {
          if (res.statusCode === 200 || res.statusCode === 201) {
            resolve(true);
          } else {
            reject(new Error(`Blob upload failed: HTTP ${res.statusCode} ${data}`));
          }
        });
      });
      req.on('error', reject);
      fs.createReadStream(filePath).pipe(req);
    });
  }

  async function ensureBlobOnPort(filePath, digest, port) {
    const exists = await blobExistsOnPort(digest, port);
    if (!exists) await uploadBlobToPort(filePath, digest, port);
  }

  function createModelOnPort({ modelName, modelFilename, modelDigest, projectorFilename, projectorDigest, port }) {
    return new Promise((resolve, reject) => {
      const body = {
        model: modelName,
        files: { [modelFilename]: modelDigest }
      };
      const modelfile = buildModelModelfile(modelName, modelDigest);
      if (modelfile) {
        body.modelfile = modelfile;
      }
      if (projectorDigest && projectorFilename) {
        body.adapters = { [projectorFilename]: projectorDigest };
      }
      const reqBody = JSON.stringify(body);
      const req = http.request({
        hostname: 'localhost',
        port,
        path: '/api/create',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(reqBody)
        }
      }, (res) => {
        let output = '';
        res.on('data', (chunk) => { output += chunk.toString(); });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, message: 'Model wrapped successfully' });
          } else {
            reject(new Error(`Model create failed: HTTP ${res.statusCode} ${output}`));
          }
        });
      });
      req.on('error', reject);
      req.write(reqBody);
      req.end();
    });
  }

  function showModelOnPort(modelName, port) {
    return new Promise((resolve) => {
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
            resolve({ success: false, statusCode: res.statusCode, data });
            return;
          }
          try {
            resolve({ success: true, data: JSON.parse(data || '{}') });
          } catch {
            resolve({ success: false, data });
          }
        });
      });
      req.on('error', () => resolve({ success: false }));
      req.write(body);
      req.end();
    });
  }

  function shouldRepairChatTemplate(showResult) {
    const data = showResult?.data || {};
    const template = String(data.template || '').trim();
    const modelfile = String(data.modelfile || '');
    const hasInstructTemplate = /<\|im_start\|>|\.Messages|\.System/.test(template) || /TEMPLATE[\s\S]*<\|im_start\|>/.test(modelfile);
    return !hasInstructTemplate;
  }

  function isBrokenChatTemplateModel(modelName) {
    const n = String(modelName || '').toLowerCase();
    if (!n.includes('qwen')) return false;
    if (/embed|embedding|rerank|colbert|bge-m3|e5-|nomic-embed|text-embedding|asr|audio/.test(n)) {
      return false;
    }
    return true;
  }

  function buildModelModelfile(modelName, modelDigest) {
    if (!isBrokenChatTemplateModel(modelName)) {
      return '';
    }
    return [
      `FROM @${modelDigest}`,
      'SYSTEM """You are a helpful assistant. Answer only the user\'s latest message. Do not invent follow-up user questions. Do not continue as a multi-turn transcript."""',
      'TEMPLATE """{{- if .System }}<|im_start|>system',
      '{{ .System }}<|im_end|>',
      '{{ end }}{{- range .Messages }}<|im_start|>{{ .Role }}',
      '{{ .Content }}<|im_end|>',
      '{{ end }}<|im_start|>assistant',
      '"""',
      'PARAMETER stop "<|im_start|>"',
      'PARAMETER stop "<|im_end|>"',
      'PARAMETER stop "<|endoftext|>"',
      'PARAMETER stop "\\nUSER"',
      'PARAMETER stop "\\nASSISTANT"',
      'PARAMETER stop "USER:"',
      'PARAMETER stop "ASSISTANT:"'
    ].join('\n');
  }

  return {
    ensureModelChatTemplateHealthy,
    modelExistsOnPort,
    wrapModelOnPort
  };
}

module.exports = createModelsOllamaTools;
