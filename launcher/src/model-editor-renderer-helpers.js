/**
 * Model Editor renderer helpers.
 */
(function() {
  'use strict';

  function normalizeHash(value) {
    return String(value || '').trim().toLowerCase();
  }

  function parseChecksumFilesText(rawText) {
    const text = String(rawText || '');
    const lines = text.split(/\r?\n/);
    const files = {};
    const errors = [];
    for (let i = 0; i < lines.length; i += 1) {
      const rawLine = lines[i];
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      let filePart = '';
      let hashPart = '';
      const eqMatch = line.match(/^(.+?)\s*(?:=|:|\t)\s*([a-fA-F0-9]{64})$/);
      if (eqMatch) {
        filePart = String(eqMatch[1] || '').trim();
        hashPart = String(eqMatch[2] || '').trim();
      } else {
        const tokens = line.split(/\s+/).filter(Boolean);
        if (tokens.length >= 2) {
          hashPart = String(tokens[tokens.length - 1] || '').trim();
          filePart = String(tokens.slice(0, -1).join(' ') || '').trim();
        }
      }

      const hash = normalizeHash(hashPart);
      if (!filePart || !/^[a-f0-9]{64}$/.test(hash)) {
        errors.push(`Line ${i + 1}: expected "filename = 64hexsha256"`);
        continue;
      }
      files[filePart] = hash;
    }
    return { files, errors };
  }

  function formatChecksumFilesText(checksums) {
    if (!checksums || typeof checksums !== 'object') return '';
    const files = checksums.files && typeof checksums.files === 'object' ? checksums.files : null;
    if (!files) return '';
    return Object.entries(files)
      .filter(([filename, hash]) => String(filename || '').trim() && /^[a-fA-F0-9]{64}$/.test(String(hash || '').trim()))
      .map(([filename, hash]) => `${filename} = ${String(hash).trim().toLowerCase()}`)
      .join('\n');
  }

  function applyFetchedChecksums(info = {}) {
    const mainField = document.getElementById('model-sha256');
    const filesField = document.getElementById('model-checksum-files');
    if (!mainField || !filesField) return;

    const incomingMain = normalizeHash(info.sha256 || info.checksums?.main);
    if (incomingMain && /^[a-f0-9]{64}$/.test(incomingMain)) {
      mainField.value = incomingMain;
    }

    const incomingText = formatChecksumFilesText(info.checksums);
    if (incomingText) {
      filesField.value = incomingText;
    }
  }

  function parseSplitFileToken(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const match = raw.match(/-(\d{5})-of-(\d{5})\.(gguf|safetensors)$/i);
    if (!match) return null;
    return {
      shardNum: Number(match[1]),
      totalShards: Number(match[2]),
      extension: String(match[3] || '').toLowerCase()
    };
  }

  function extractFilenameFromUrl(rawUrl) {
    try {
      const parsed = new URL(String(rawUrl || '').trim());
      return decodeURIComponent(String(parsed.pathname || '').split('/').pop() || '');
    } catch (_err) {
      return '';
    }
  }

  function validateSplitDownloadConfig(options = {}) {
    const downloadUrl = String(options.downloadUrl || '').trim();
    let filename = String(options.filename || '').trim();
    const urlFilename = extractFilenameFromUrl(downloadUrl);
    const urlSplit = parseSplitFileToken(urlFilename);
    if (!filename && urlSplit) {
      filename = urlFilename;
      const filenameInput = document.getElementById('model-filename');
      if (filenameInput) filenameInput.value = filename;
    }
    const fileSplit = parseSplitFileToken(filename);

    if (!urlSplit) {
      return { ok: true, hasSplit: false, hint: '' };
    }

    if (urlSplit.extension === 'safetensors') {
      if (!fileSplit || fileSplit.extension !== 'safetensors') {
        return {
          ok: false,
          error: 'Split safetensors detected: Filename must include shard suffix (for example, model-00001-of-00002.safetensors).'
        };
      }
      if (fileSplit.totalShards !== urlSplit.totalShards) {
        return {
          ok: false,
          error: `Split safetensors mismatch: URL indicates ${urlSplit.totalShards} shards but filename indicates ${fileSplit.totalShards}.`
        };
      }
      return {
        ok: true,
        hasSplit: true,
        hint: `ℹ️ Split safetensors detected (${urlSplit.totalShards} shards). All shards will download; no merge step will be performed.`
      };
    }

    if (!filename) {
      return {
        ok: true,
        hasSplit: true,
        hint: 'ℹ️ Split GGUF detected. Filename is recommended to include the shard suffix from URL.'
      };
    }
    if (fileSplit && fileSplit.extension === 'gguf' && fileSplit.totalShards !== urlSplit.totalShards) {
      return {
        ok: false,
        error: `Split GGUF mismatch: URL indicates ${urlSplit.totalShards} shards but filename indicates ${fileSplit.totalShards}.`
      };
    }
    return {
      ok: true,
      hasSplit: true,
      hint: `ℹ️ Split GGUF detected (${urlSplit.totalShards} shards). Shards will be downloaded and merged.`
    };
  }

  function readInt(id) {
    return parseInt(document.getElementById(id).value, 10) || null;
  }

  function readText(id) {
    return document.getElementById(id).value.trim();
  }

  function readChecked(id) {
    return !!document.getElementById(id).checked;
  }

  function parseAndValidateChecksums() {
    const checksumFilesRaw = document.getElementById('model-checksum-files').value;
    const parsedChecksumFiles = parseChecksumFilesText(checksumFilesRaw);
    if (parsedChecksumFiles.errors.length > 0) {
      return {
        ok: false,
        error: `Checksum format errors:\n\n${parsedChecksumFiles.errors.join('\n')}`
      };
    }

    const mainSha = normalizeHash(document.getElementById('model-sha256').value);
    const projectorSha = normalizeHash(document.getElementById('model-projector-sha256').value);
    if (mainSha && !/^[a-f0-9]{64}$/.test(mainSha)) {
      return { ok: false, error: 'Main SHA256 must be 64 hexadecimal characters.' };
    }
    if (projectorSha && !/^[a-f0-9]{64}$/.test(projectorSha)) {
      return { ok: false, error: 'Projector SHA256 must be 64 hexadecimal characters.' };
    }

    const checksums = {};
    if (mainSha) checksums.main = mainSha;
    if (projectorSha) checksums.projector = projectorSha;
    if (Object.keys(parsedChecksumFiles.files).length > 0) checksums.files = parsedChecksumFiles.files;
    return { ok: true, checksums, mainSha, projectorSha };
  }

  function buildModelData(inferParametersLabel) {
    const checksumParse = parseAndValidateChecksums();
    if (!checksumParse.ok) return checksumParse;

    const modelData = {
      id: readText('model-id'),
      name: readText('model-name'),
      model_family: readText('model-family') || null,
      organization: readText('model-organization') || null,
      version: readText('model-version') || null,
      description: readText('model-description'),
      url: readText('model-url'),
      download_url: readText('model-download-url') || null,
      filename: readText('model-filename') || null,
      huggingface_repo: readText('model-hf-repo') || null,
      size_mb: readInt('model-size-mb'),
      file_size_bytes: readInt('model-file-size-bytes'),
      quantization: readText('model-quantization') || null,
      context_length: readInt('model-context'),
      parameters: inferParametersLabel({
        name: readText('model-name'),
        id: readText('model-id'),
        filename: readText('model-filename'),
        model_family: readText('model-family')
      }) || null,
      architecture: readText('model-architecture') || null,
      supports_vision: readChecked('model-supports-vision'),
      supports_code: readChecked('model-supports-code'),
      supports_function_calling: readChecked('model-supports-function-calling'),
      supports_stt: readChecked('model-supports-stt'),
      supports_tts: readChecked('model-supports-tts'),
      min_ram_gb: readInt('model-min-ram'),
      recommended_ram_gb: readInt('model-rec-ram'),
      gpu_layers: readInt('model-gpu-layers'),
      license: readText('model-license'),
      license_url: readText('model-license-url') || null,
      ollama_model: readText('model-ollama-name') || null,
      base_model_url: readText('model-base-url') || null,
      hidden_size: readInt('model-hidden-size'),
      num_layers: readInt('model-num-layers'),
      num_kv_heads: readInt('model-num-kv-heads'),
      num_attention_heads: readInt('model-num-attn-heads'),
      sha256: checksumParse.mainSha || null,
      checksums: Object.keys(checksumParse.checksums).length > 0 ? checksumParse.checksums : null,
      projector_url: readText('model-projector-url') || null,
      projector_filename: readText('model-projector-filename') || null,
      projector_sha256: checksumParse.projectorSha || null
    };

    return { ok: true, modelData };
  }

  window.ModelEditorRendererHelpers = {
    normalizeHash,
    formatChecksumFilesText,
    applyFetchedChecksums,
    validateSplitDownloadConfig,
    buildModelData
  };
})();
