/**
 * ============================================================================
 * HUGGINGFACE API MODULE
 * ============================================================================
 *
 * Handles all HuggingFace API interactions:
 * - Fetching model config.json for architecture details
 * - Fetching model info/metadata from HuggingFace API
 * - Fetching file info (size, filename) via HEAD requests
 *
 * @module huggingface-api
 * @version 1.1.3 - March 5, 2026
 * @license SEE LICENSE.txt
 * ============================================================================
 */

const { URL } = require('url');
const logger = require('./logger');
const {
  parseHuggingFaceUrl,
  parseHuggingFaceDownloadUrl,
  canonicalModelPageUrl,
  extractMetaDescription,
  oneSentenceDescription,
  extractReadmeLeadSentence,
  stripYamlFrontMatter,
  extractBaseModelRepoFromTags,
  isGenericHfDescription,
  looksLikeMetadataSentence,
  synthesizeFallbackDescription,
  siblingSha256,
  buildChecksumBundleForTarget,
  estimateSplitTotalBytes,
  findSiblingForTarget
} = require('./huggingface-api-utils');
const {
  makeRequest,
  requestWithCoalescing,
  DEFAULT_TIMEOUT,
  MAX_REDIRECTS,
  USER_AGENT
} = require('./huggingface-api-network');

const REPO_METADATA_TTL_MS = 60000;
const HF_METADATA_TIMEOUT_MS = 10000;
const HF_METADATA_RETRIES = 0;

const repoMetadataCache = new Map();

async function fetchRepoShortDescription(repoPath, options = {}) {
  if (!repoPath) return '';
  const apiUrl = `https://huggingface.co/api/models/${repoPath}`;
  const authScope = String(options.__authScope || 'public');
  const response = await requestWithCoalescing(`repo-short|${repoPath}|api|${authScope}`, apiUrl, options);
  if (!response.success) return '';
  const data = JSON.parse(response.data || '{}');
  const raw = String(data.cardData?.description || data.description || '').trim();
  let short = oneSentenceDescription(raw);
  if (short && !isGenericHfDescription(short) && !looksLikeMetadataSentence(short)) return short;
  const readmeUrl = `https://huggingface.co/${repoPath}/resolve/main/README.md`;
  const readmeResponse = await requestWithCoalescing(`repo-short|${repoPath}|readme|${authScope}`, readmeUrl, options);
  if (!readmeResponse.success) return '';
  const readmeBody = stripYamlFrontMatter(readmeResponse.data || '');
  short = extractReadmeLeadSentence(readmeBody);
  if (short && !isGenericHfDescription(short) && !looksLikeMetadataSentence(short)) return short;
  return '';
}

async function fetchRepoMetadata(repoPath, options = {}) {
  const cleanRepoPath = String(repoPath || '').trim();
  if (!cleanRepoPath) {
    return { success: false, error: 'Missing repository path' };
  }
  const authScope = String(options.__authScope || 'public');
  const cacheKey = `${cleanRepoPath}|${authScope}`;
  const now = Date.now();
  const cached = repoMetadataCache.get(cacheKey);
  if (cached && (now - cached.ts) < REPO_METADATA_TTL_MS) {
    return { success: true, data: cached.data };
  }

  const requestOptions = {
    ...options,
    timeout: Number(options.timeout) > 0 ? Number(options.timeout) : HF_METADATA_TIMEOUT_MS,
    retries: Number.isInteger(options.retries) ? options.retries : HF_METADATA_RETRIES
  };

  const apiUrl = `https://huggingface.co/api/models/${cleanRepoPath}?blobs=true`;
  const fallbackApiUrl = `https://huggingface.co/api/models/${cleanRepoPath}`;
  let response = await requestWithCoalescing(`repo-meta|${cleanRepoPath}|blobs|${authScope}`, apiUrl, requestOptions);
  if (!response.success) {
    logger.warn(`[HF API] blobs=true repo metadata failed for ${cleanRepoPath} (${response.statusCode || 'no-status'}), retrying basic.`);
    response = await requestWithCoalescing(`repo-meta|${cleanRepoPath}|basic|${authScope}`, fallbackApiUrl, requestOptions);
  }
  if (!response.success) {
    return {
      success: false,
      statusCode: response.statusCode,
      error: response.error || `HTTP ${response.statusCode || 'request_failed'}`
    };
  }
  try {
    const data = JSON.parse(response.data || '{}');
    repoMetadataCache.set(cacheKey, { ts: Date.now(), data });
    return { success: true, data };
  } catch (err) {
    return { success: false, error: `Parse error: ${err.message}` };
  }
}

async function fetchConfig(modelUrl, hfToken = null) {
  try {
    const parsed = parseHuggingFaceUrl(modelUrl);
    if (!parsed) {
      return {
        success: false,
        error: 'Invalid HuggingFace URL format. Expected: https://huggingface.co/org/model-name'
      };
    }

    const configUrl = `https://huggingface.co/${parsed.repoPath}/resolve/main/config.json`;
    logger.info(`[HF API] Fetching config: ${configUrl}`);

    const options = { timeout: HF_METADATA_TIMEOUT_MS, retries: HF_METADATA_RETRIES };
    options.__authScope = hfToken ? 'token' : 'public';
    if (hfToken) {
      options.headers = { Authorization: `Bearer ${hfToken}` };
      logger.info('[HF API] Using HuggingFace token for authenticated request');
    }
    const response = await requestWithCoalescing(`config|${parsed.repoPath}|${Boolean(hfToken)}`, configUrl, options);

    if (!response.success) {
      if (response.statusCode === 404) {
        return {
          success: false,
          error: 'config.json not found. For GGUF repos, try providing the Base Model URL instead.'
        };
      }
      return {
        success: false,
        error: response.error || `HTTP ${response.statusCode}: ${response.statusMessage}`
      };
    }

    try {
      const config = JSON.parse(response.data);
      const hidden = config.hidden_size || config.text_config?.hidden_size;
      const layers = config.num_hidden_layers || config.text_config?.num_hidden_layers;
      const kvHeads = config.num_key_value_heads ||
        config.text_config?.num_key_value_heads ||
        config.text_config?.perceiver_config?.num_key_value_heads;

      logger.info(`[HF API] Config success: hidden_size=${hidden}, layers=${layers}, kv_heads=${kvHeads}, model_type=${config.model_type}`);
      return { success: true, config };
    } catch (parseErr) {
      logger.error(`[HF API] Config parse error: ${parseErr.message}`);
      return { success: false, error: `Failed to parse config.json: ${parseErr.message}` };
    }
  } catch (err) {
    logger.error(`[HF API] fetchConfig error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function fetchModelInfo(modelUrl, hfToken = null) {
  try {
    const parsed = parseHuggingFaceUrl(modelUrl);
    if (!parsed) {
      return { success: false, error: 'Invalid HuggingFace URL format' };
    }

    const pageUrl = canonicalModelPageUrl(modelUrl);
    logger.info(`[HF API] Fetching model info: ${parsed.repoPath}`);

    const options = { timeout: HF_METADATA_TIMEOUT_MS, retries: HF_METADATA_RETRIES };
    options.__authScope = hfToken ? 'token' : 'public';
    if (hfToken) {
      options.headers = { Authorization: `Bearer ${hfToken}` };
      logger.info('[HF API] Using HuggingFace token for authenticated request');
    }
    const metadata = await fetchRepoMetadata(parsed.repoPath, options);
    if (!metadata.success) {
      if (metadata.statusCode === 404) {
        return { success: false, error: 'Model not found on HuggingFace' };
      }
      return {
        success: false,
        error: metadata.error || `HTTP ${metadata.statusCode}`
      };
    }

    try {
      const data = metadata.data;
      const siblings = Array.isArray(data.siblings) ? data.siblings : [];
      const files = siblings.map((f) => ({
        filename: f?.rfilename || '',
        size_bytes: Number.isFinite(f?.size) ? f.size : null,
        sha256: siblingSha256(f) || null
      })).filter((f) => f.filename);
      const rawDescription = String(data.cardData?.description || data.description || '').trim();
      let shortDescription = oneSentenceDescription(rawDescription);
      if (!shortDescription || isGenericHfDescription(shortDescription)) {
        const readmeUrl = `https://huggingface.co/${parsed.repoPath}/resolve/main/README.md`;
        const readmeResponse = await requestWithCoalescing(`modelinfo|${parsed.repoPath}|readme|${options.__authScope}`, readmeUrl, options);
        if (readmeResponse.success) {
          const readmeBody = stripYamlFrontMatter(readmeResponse.data || '');
          const readmeCandidate = extractReadmeLeadSentence(readmeBody);
          if (readmeCandidate && !isGenericHfDescription(readmeCandidate) && !looksLikeMetadataSentence(readmeCandidate)) {
            shortDescription = readmeCandidate;
          }
        }
      }
      if (!shortDescription || isGenericHfDescription(shortDescription)) {
        const pageResponse = await requestWithCoalescing(`modelinfo|${parsed.repoPath}|page|${options.__authScope}`, pageUrl, options);
        if (pageResponse.success) {
          const metaCandidate = oneSentenceDescription(extractMetaDescription(pageResponse.data || ''));
          if (metaCandidate && !isGenericHfDescription(metaCandidate) && !looksLikeMetadataSentence(metaCandidate)) {
            shortDescription = metaCandidate;
          }
        }
      }
      if (isGenericHfDescription(shortDescription) || looksLikeMetadataSentence(shortDescription)) {
        shortDescription = '';
      }
      if (!shortDescription) {
        const baseRepo = extractBaseModelRepoFromTags(data.tags || []);
        if (baseRepo) {
          const baseShort = await fetchRepoShortDescription(baseRepo, options);
          if (baseShort) shortDescription = baseShort;
        }
      }

      const info = {
        name: data.id?.split('/').pop() || parsed.model,
        organization: parsed.org,
        repo: data.id || parsed.repoPath,
        description: rawDescription,
        short_description: shortDescription,
        license: data.cardData?.license || data.license || '',
        tags: data.tags || [],
        downloads: data.downloads,
        likes: data.likes,
        files,
        pipeline_tag: data.pipeline_tag,
        library_name: data.library_name,
        model_type: data.config?.model_type
      };
      if (!info.short_description) {
        info.short_description = synthesizeFallbackDescription(info);
      }

      logger.info(`[HF API] Model info success: ${info.repo}`);
      return { success: true, info };
    } catch (parseErr) {
      logger.error(`[HF API] Model info parse error: ${parseErr.message}`);
      return { success: false, error: `Parse error: ${parseErr.message}` };
    }
  } catch (err) {
    logger.error(`[HF API] fetchModelInfo error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function fetchFileInfo(downloadUrl, hfToken = null) {
  try {
    let parsedUrl;
    try {
      parsedUrl = new URL(downloadUrl);
    } catch (e) {
      return { success: false, error: 'Invalid URL format' };
    }

    const fallbackFilename = parsedUrl.pathname.split('/').pop();
    let filename = fallbackFilename;
    logger.info(`[HF API] Fetching file info: ${filename}`);
    let sizeBytes = null;
    let sizeMb = null;
    let contentType = null;
    let lastModified = null;
    let etag = null;
    let sha256 = null;
    let checksums = null;
    let splitTotal = null;
    const hfParsed = parseHuggingFaceDownloadUrl(downloadUrl);
    let needsHeadFallback = true;

    if (hfParsed?.repoPath) {
      try {
        const apiOptions = {
          __authScope: hfToken ? 'token' : 'public'
        };
        if (hfToken) {
          apiOptions.headers = { Authorization: `Bearer ${hfToken}` };
        }
        const modelMeta = await fetchRepoMetadata(hfParsed.repoPath, apiOptions);
        if (modelMeta.success) {
          const modelData = modelMeta.data;
          const siblings = Array.isArray(modelData.siblings) ? modelData.siblings : [];
          const targetPath = hfParsed.filePath || filename;
          const sibling = findSiblingForTarget(targetPath, siblings);
          if (sibling) {
            const resolvedName = decodeURIComponent(String(sibling.rfilename || '').split('/').pop() || '');
            if (resolvedName) filename = resolvedName;
            const siblingSize = Number(sibling?.size || sibling?.lfs?.size || 0);
            if (Number.isFinite(siblingSize) && siblingSize > 0) {
              sizeBytes = siblingSize;
              sizeMb = Math.ceil(siblingSize / (1024 * 1024));
            }
          }
          const bundle = buildChecksumBundleForTarget(targetPath, siblings);
          splitTotal = estimateSplitTotalBytes(targetPath, siblings);
          sha256 = String(bundle?.main || '').trim().toLowerCase() || null;
          if (bundle && (bundle.main || bundle.files)) {
            checksums = bundle;
          }
          needsHeadFallback = !sizeBytes;
        }
      } catch (checksumErr) {
        logger.warn(`[HF API] File checksum lookup skipped: ${checksumErr.message}`);
      }
    }

    if (needsHeadFallback) {
      const headOptions = {
        method: 'HEAD',
        retries: HF_METADATA_RETRIES,
        timeout: HF_METADATA_TIMEOUT_MS,
        __authScope: hfToken ? 'token' : 'public'
      };
      if (hfToken && String(downloadUrl || '').includes('huggingface.co')) {
        headOptions.headers = { Authorization: `Bearer ${hfToken}` };
        logger.info('[HF API] Using HuggingFace token for authenticated file info request');
      }
      const response = await requestWithCoalescing(`filehead|${downloadUrl}|${Boolean(hfToken)}`, downloadUrl, headOptions);
      if (!response.success) {
        if (response.statusCode === 401 || response.statusCode === 403) {
          return {
            success: false,
            error: `HTTP ${response.statusCode}: Access denied. Confirm Hugging Face token is set and your account has access to this model.`
          };
        }
        if (!sizeBytes) {
          return {
            success: false,
            error: response.error || `HTTP ${response.statusCode}`
          };
        }
      } else {
        const contentLength = response.headers['content-length'];
        if (!sizeBytes && contentLength) {
          sizeBytes = parseInt(contentLength);
          sizeMb = sizeBytes ? Math.ceil(sizeBytes / (1024 * 1024)) : null;
        }
        contentType = response.headers['content-type'] || null;
        lastModified = response.headers['last-modified'] || null;
        etag = response.headers['etag'] || null;
      }
    }

    const effectiveSizeBytes = splitTotal?.totalBytes > (sizeBytes || 0) ? splitTotal.totalBytes : sizeBytes;
    const effectiveSizeMb = effectiveSizeBytes ? Math.ceil(effectiveSizeBytes / (1024 * 1024)) : sizeMb;
    logger.info(`[HF API] File info success: ${filename}, ${effectiveSizeMb} MB${splitTotal ? ` (split total from ${splitTotal.shardCount} shards)` : ''}${sha256 ? ', sha256 found' : ''}`);

    return {
      success: true,
      info: {
        filename,
        size_bytes: effectiveSizeBytes,
        size_mb: effectiveSizeMb,
        shard_size_bytes: sizeBytes,
        shard_size_mb: sizeMb,
        split_shard_count: splitTotal?.shardCount || null,
        content_type: contentType,
        last_modified: lastModified,
        etag,
        sha256,
        checksums
      }
    };
  } catch (err) {
    logger.error(`[HF API] fetchFileInfo error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function listGgufFiles(modelUrl) {
  try {
    const parsed = parseHuggingFaceUrl(modelUrl);
    if (!parsed) {
      return { success: false, error: 'Invalid HuggingFace URL format' };
    }

    logger.info(`[HF API] Listing GGUF files: ${parsed.repoPath}`);
    const metadata = await fetchRepoMetadata(parsed.repoPath, { __authScope: 'public' });
    if (!metadata.success) {
      return {
        success: false,
        error: metadata.error || `HTTP ${metadata.statusCode}`
      };
    }

    try {
      const data = metadata.data;
      const siblings = data.siblings || [];
      const ggufFiles = siblings
        .filter((f) => f.rfilename?.endsWith('.gguf'))
        .map((f) => ({
          filename: f.rfilename,
          size_bytes: f.size,
          size_mb: f.size ? Math.ceil(f.size / (1024 * 1024)) : null,
          download_url: `https://huggingface.co/${parsed.repoPath}/resolve/main/${f.rfilename}`
        }));

      logger.info(`[HF API] Found ${ggufFiles.length} GGUF files`);
      return { success: true, files: ggufFiles, repo: parsed.repoPath };
    } catch (parseErr) {
      return { success: false, error: `Parse error: ${parseErr.message}` };
    }
  } catch (err) {
    logger.error(`[HF API] listGgufFiles error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

module.exports = {
  parseHuggingFaceUrl,
  fetchConfig,
  fetchModelInfo,
  fetchFileInfo,
  listGgufFiles,
  makeRequest,
  DEFAULT_TIMEOUT,
  MAX_REDIRECTS,
  USER_AGENT
};
