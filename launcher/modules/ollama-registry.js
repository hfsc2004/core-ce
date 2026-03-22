/**
 * OLLAMA REGISTRY FETCHER
 * Fetches model config (template, parameters) from Ollama registry without downloading weights.
 * @module ollama-registry
 * @version 1.1.2 - March 5, 2026
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const REGISTRY_BASE = 'registry.ollama.ai';
const REGISTRY_PATH = '/v2/library';

const MEDIA_TYPES = {
  MODEL: 'application/vnd.ollama.image.model',
  TEMPLATE: 'application/vnd.ollama.image.template',
  PARAMS: 'application/vnd.ollama.image.params',
  LICENSE: 'application/vnd.ollama.image.license',
  SYSTEM: 'application/vnd.ollama.image.system'
};

function httpsGet(hostname, urlPath, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: hostname,
      port: 443,
      path: urlPath,
      method: 'GET',
      headers: { 'User-Agent': 'PSF-Offline-Archive/1.0' }
    };
    
    const req = https.request(options, (res) => {
      // Handle redirects (301, 302, 307, 308)
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        if (maxRedirects <= 0) {
          reject(new Error('Too many redirects'));
          return;
        }
        
        const redirectUrl = new URL(res.headers.location);
        console.log(`[Ollama Registry] Following redirect to: ${redirectUrl.hostname}${redirectUrl.pathname.substring(0, 50)}...`);
        
        // Follow the redirect
        httpsGet(redirectUrl.hostname, redirectUrl.pathname + redirectUrl.search, maxRedirects - 1)
          .then(resolve)
          .catch(reject);
        return;
      }
      
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, data: Buffer.concat(chunks) });
      });
    });
    
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
}

function parseOllamaModel(ollamaModel) {
  const parts = ollamaModel.split(':');
  return { name: parts[0], tag: parts[1] || 'latest' };
}

async function fetchManifest(ollamaModel) {
  const { name, tag } = parseOllamaModel(ollamaModel);
  const manifestPath = `${REGISTRY_PATH}/${name}/manifests/${tag}`;
  console.log(`[Ollama Registry] Fetching manifest from: https://${REGISTRY_BASE}${manifestPath}`);
  console.log(`[Ollama Registry] Model input was: "${ollamaModel}" -> name="${name}" tag="${tag}"`);
  
  const response = await httpsGet(REGISTRY_BASE, manifestPath);
  console.log(`[Ollama Registry] Response status: ${response.status}`);
  console.log(`[Ollama Registry] Response body: ${response.data.toString('utf8').substring(0, 200)}`);
  
  if (response.status === 404) {
    throw new Error(`Model "${name}:${tag}" not found in Ollama registry. Check format: model:tag (e.g., gemma3:4b, llama3.2:8b)`);
  }
  
  if (response.status !== 200) {
    throw new Error(`Failed to fetch manifest: HTTP ${response.status}`);
  }
  
  return JSON.parse(response.data.toString('utf8'));
}

async function fetchBlob(ollamaModel, digest) {
  const { name } = parseOllamaModel(ollamaModel);
  const blobPath = `${REGISTRY_PATH}/${name}/blobs/${digest}`;
  console.log(`[Ollama Registry] Fetching blob: ${digest.substring(0, 20)}...`);
  
  const response = await httpsGet(REGISTRY_BASE, blobPath);
  if (response.status !== 200) {
    throw new Error(`Failed to fetch blob: HTTP ${response.status}`);
  }
  
  return response.data;
}

async function fetchModelConfig(ollamaModel) {
  const manifest = await fetchManifest(ollamaModel);
  const result = { template: '', params: {}, system: '', license: '' };
  
  for (const layer of manifest.layers || []) {
    if (layer.mediaType === MEDIA_TYPES.MODEL) {
      console.log(`[Ollama Registry] Skipping model blob (${(layer.size / 1024 / 1024 / 1024).toFixed(2)} GB)`);
      continue;
    }
    
    try {
      const blob = await fetchBlob(ollamaModel, layer.digest);
      const content = blob.toString('utf8');
      
      switch (layer.mediaType) {
        case MEDIA_TYPES.TEMPLATE: result.template = content; break;
        case MEDIA_TYPES.PARAMS: result.params = parseParamsBlob(content); break;
        case MEDIA_TYPES.SYSTEM: result.system = content; break;
        case MEDIA_TYPES.LICENSE: result.license = content; break;
      }
    } catch (err) {
      console.warn(`[Ollama Registry] Failed to fetch layer:`, err.message);
    }
  }
  
  return result;
}

function parseParamsBlob(content) {
  // First, try to parse as JSON (newer Ollama registry format)
  try {
    const trimmed = content.trim();
    if (trimmed.startsWith('{')) {
      const parsed = JSON.parse(trimmed);
      console.log('[Ollama Registry] Parsed params as JSON:', parsed);
      return parsed;
    }
  } catch (e) {
    // Not valid JSON, fall through to line-based parsing
  }
  
  // Fall back to line-based format (older format)
  const params = {};
  const lines = content.split('\n').filter(l => l.trim());
  
  for (const line of lines) {
    const spaceIdx = line.indexOf(' ');
    if (spaceIdx > 0) {
      const key = line.substring(0, spaceIdx).trim();
      let value = line.substring(spaceIdx + 1).trim().replace(/^["']|["']$/g, '');
      
      if (params[key] !== undefined) {
        if (!Array.isArray(params[key])) params[key] = [params[key]];
        params[key].push(value);
      } else {
        params[key] = value;
      }
    }
  }
  
  return params;
}

function getCachePath(configDir, modelId) {
  return path.join(configDir, `${modelId}.ollama-config.json`);
}

function getModelfilePath(configDir, modelId) {
  return path.join(configDir, `${modelId}.Modelfile`);
}

function saveCachedConfig(configDir, modelId, config) {
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  fs.writeFileSync(getCachePath(configDir, modelId), JSON.stringify(config, null, 2), 'utf8');
}

module.exports = {
  fetchManifest,
  fetchBlob,
  fetchModelConfig,
  parseOllamaModel,
  getCachePath,
  getModelfilePath,
  saveCachedConfig,
  MEDIA_TYPES
};
