/**
 * HuggingFace API utility helpers.
 */

const GENERIC_HF_DESCRIPTION_MARKERS = [
  'we’re on a journey to advance and democratize artificial intelligence through open source and open science',
  "we're on a journey to advance and democratize artificial intelligence through open source and open science",
  'hugging face'
];

function parseHuggingFaceUrl(url) {
  if (!url) return null;
  const match = url.match(/huggingface\.co\/([^\/]+)\/([^\/\?#]+)/);
  if (!match) return null;
  return {
    org: match[1],
    model: match[2],
    repoPath: `${match[1]}/${match[2]}`
  };
}

function parseHuggingFaceDownloadUrl(downloadUrl) {
  if (!downloadUrl) return null;
  let parsed;
  try {
    parsed = new URL(downloadUrl);
  } catch (_err) {
    return null;
  }
  if (!String(parsed.hostname || '').includes('huggingface.co')) return null;
  const parts = String(parsed.pathname || '').split('/').filter(Boolean);
  if (parts.length < 5) return null;
  const org = parts[0];
  const model = parts[1];
  const mode = parts[2];
  if (!org || !model) return null;
  if (!['resolve', 'blob', 'raw'].includes(mode)) return null;
  const filePath = parts.slice(4).join('/');
  return {
    org,
    model,
    repoPath: `${org}/${model}`,
    filePath
  };
}

function canonicalModelPageUrl(modelUrl) {
  const parsedDownload = parseHuggingFaceDownloadUrl(modelUrl);
  if (parsedDownload) return `https://huggingface.co/${parsedDownload.repoPath}`;
  return modelUrl;
}

function decodeHtmlEntities(input = '') {
  return String(input || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripHtmlTags(input = '') {
  return decodeHtmlEntities(String(input || '').replace(/<[^>]+>/g, ' '));
}

function extractMetaDescription(html = '') {
  const text = String(html || '');
  if (!text) return '';
  const patterns = [
    /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["'][^>]*>/i,
    /<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["'][^>]*>/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return decodeHtmlEntities(String(match[1]).trim());
    }
  }
  return '';
}

function oneSentenceDescription(raw = '') {
  const cleaned = stripHtmlTags(raw)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/\[[^\]]+\]\([^)]+\)/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#>*_\-]+/g, ' ')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  const sentenceMatch = cleaned.match(/^(.{20,220}?[.!?])(?:\s|$)/);
  if (sentenceMatch && sentenceMatch[1]) return sentenceMatch[1].trim();
  return cleaned.slice(0, 180).trim();
}

function looksLikePromoOrInstructionSentence(value = '') {
  const s = String(value || '').trim().toLowerCase();
  if (!s) return true;
  if (/^(read|join|check out|visit|disable|set|use|install|run)\b/.test(s)) return true;
  if (s.includes('discord') || s.includes('technical blog')) return true;
  if (s.includes('repeat penalty') || s.includes('for general use-case')) return true;
  if (s.includes('pip install') || s.includes('vllm') || s.includes('sglang')) return true;
  if (s.includes('guide') && s.includes('how to')) return true;
  return false;
}

function stripYamlFrontMatter(readmeText = '') {
  const text = String(readmeText || '');
  if (!text.startsWith('---')) return text;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return text;
  return text.slice(end + 4).trimStart();
}

function extractReadmeLeadSentence(readmeText = '') {
  const lines = stripYamlFrontMatter(String(readmeText || '')).split(/\r?\n/);
  const normalizedLines = lines.map((line) => stripHtmlTags(String(line || '')).trim());
  let inIntroBlock = false;
  const introParagraph = [];
  for (const line of normalizedLines) {
    if (!line) {
      if (inIntroBlock && introParagraph.length > 0) break;
      continue;
    }
    if (line.startsWith('#')) {
      const heading = line.replace(/^#+\s*/, '').trim().toLowerCase();
      inIntroBlock = /(introduction|overview|about)/.test(heading);
      continue;
    }
    if (!inIntroBlock) continue;
    if (line.startsWith('-') || line.startsWith('+')) continue;
    if (/^[a-z0-9 _-]{2,30}:\s+\S+/i.test(line)) continue;
    introParagraph.push(line);
    if (introParagraph.join(' ').length >= 220) break;
  }
  if (introParagraph.length > 0) {
    const introSentence = oneSentenceDescription(introParagraph.join(' '));
    if (introSentence && !looksLikePromoOrInstructionSentence(introSentence)) {
      return introSentence;
    }
  }

  const paragraph = [];
  let quantTag = '';
  for (const line of normalizedLines) {
    if (!line) {
      if (paragraph.length > 0) break;
      continue;
    }
    const quantHeader = line.match(/^#+\s*(.+?)\s*GGUF$/i);
    if (quantHeader && quantHeader[1]) {
      quantTag = quantHeader[1].trim();
    }
    if (
      line.startsWith('#') ||
      line.startsWith('![') ||
      line.startsWith('-') ||
      line.startsWith('+') ||
      /^[-=_]{3,}$/.test(line) ||
      /^[a-z0-9 _-]{2,30}:\s+\S+/i.test(line)
    ) {
      continue;
    }
    paragraph.push(line);
    if (paragraph.join(' ').length >= 140) break;
  }
  if (paragraph.length === 0) {
    if (quantTag) {
      return oneSentenceDescription(`${quantTag} GGUF quantized model package.`);
    }
    return '';
  }
  const sentence = oneSentenceDescription(paragraph.join(' '));
  if (looksLikePromoOrInstructionSentence(sentence)) return '';
  return sentence;
}

function extractBaseModelRepoFromTags(tags = []) {
  for (const tag of tags) {
    const value = String(tag || '');
    if (!value.startsWith('base_model:')) continue;
    if (value.includes(':quantized:')) continue;
    const repo = value.slice('base_model:'.length).trim();
    if (/^[^/\s]+\/[^/\s]+$/.test(repo)) return repo;
  }
  return '';
}

function isGenericHfDescription(value = '') {
  const s = String(value || '').trim().toLowerCase();
  if (!s) return true;
  return GENERIC_HF_DESCRIPTION_MARKERS.some((marker) => s.includes(marker));
}

function looksLikeMetadataSentence(value = '') {
  const s = String(value || '').trim();
  const lowered = s.toLowerCase();
  if (!s) return true;
  if (/^[a-z0-9 _-]{2,40}:\s*\S+$/i.test(s)) return true;
  if (/^([a-z0-9 _-]{2,30}:\s*\S+\s+){1,}[a-z0-9 _-]{2,30}:\s*\S+$/i.test(s)) return true;
  if (/^using\s+llama\.cpp\s+release\b/i.test(s)) return true;
  if (/^repeat penalty\s*:/i.test(s)) return true;
  if (lowered.includes('for quantization') && lowered.includes('llama.cpp')) return true;
  if (lowered.includes('visit original model') || lowered.includes('original model page')) return true;
  if (looksLikePromoOrInstructionSentence(s)) return true;
  if (s.length < 24) return true;
  return false;
}

function synthesizeFallbackDescription(info = {}) {
  const tags = Array.isArray(info.tags) ? info.tags.map((t) => String(t || '').toLowerCase()) : [];
  const hasGguf = tags.includes('gguf') || tags.some((t) => t.includes('gguf'));
  const repoName = String(info.name || '').replace(/[-_]+/g, ' ').trim();
  if (!repoName) return '';
  const repoNameLower = repoName.toLowerCase();
  const hasGgufInName = /\bgguf\b/.test(repoNameLower);
  if (hasGguf) {
    const subject = hasGgufInName ? repoName : `${repoName} GGUF`;
    return oneSentenceDescription(`${subject} quantized model build for local inference.`);
  }
  return oneSentenceDescription(`${repoName} open model repository from Hugging Face.`);
}

function parseSplitShardInfo(filename) {
  const name = String(filename || '').trim();
  const match = name.match(/^(.*)-(\d{5})-of-(\d{5})\.(gguf|safetensors)$/i);
  if (!match) return null;
  return {
    basePrefix: String(match[1] || ''),
    shardTotal: Number(match[3]),
    extension: String(match[4] || '').toLowerCase()
  };
}

function normalizeRepoHash(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  const stripped = raw.startsWith('sha256:') ? raw.slice(7) : raw;
  return /^[a-f0-9]{64}$/.test(stripped) ? stripped : '';
}

function siblingSha256(sibling = {}) {
  return normalizeRepoHash(
    sibling?.lfs?.sha256 ||
    sibling?.lfs?.oid ||
    sibling?.sha256 ||
    sibling?.sha ||
    sibling?.oid
  );
}

function buildChecksumBundleForTarget(targetFilePath, siblings = []) {
  const out = {
    main: '',
    files: {}
  };
  const target = decodeURIComponent(String(targetFilePath || '').trim());
  if (!target) return out;
  const targetBase = target.split('/').pop();
  const split = parseSplitShardInfo(targetBase);
  const prefix = split ? `${split.basePrefix}-` : '';
  const shardSuffix = split ? `.${split.extension}` : '';

  for (const sibling of siblings) {
    const file = decodeURIComponent(String(sibling?.rfilename || '').trim());
    const hash = siblingSha256(sibling);
    if (!file || !/^[a-f0-9]{64}$/.test(hash)) continue;

    const fileBase = file.split('/').pop();
    if (file === target || fileBase === targetBase) {
      out.main = hash;
      out.files[fileBase] = hash;
      continue;
    }

    if (split) {
      if (fileBase.startsWith(prefix) && fileBase.endsWith(shardSuffix)) {
        out.files[fileBase] = hash;
      } else if (split.extension === 'safetensors') {
        const indexName = `${split.basePrefix}.safetensors.index.json`;
        if (fileBase === indexName) {
          out.files[fileBase] = hash;
        }
      }
    }
  }

  if (!out.main && targetBase && out.files[targetBase]) {
    out.main = out.files[targetBase];
  }

  if (!out.main) delete out.main;
  if (Object.keys(out.files).length === 0) delete out.files;
  return out;
}

function estimateSplitTotalBytes(targetFilePath, siblings = []) {
  const target = decodeURIComponent(String(targetFilePath || '').trim());
  const targetBase = target.split('/').pop();
  const split = parseSplitShardInfo(targetBase);
  if (!split) return null;
  const prefix = `${split.basePrefix}-`;
  const suffix = `.${split.extension}`;
  let total = 0;
  let count = 0;
  for (const sibling of siblings) {
    const file = decodeURIComponent(String(sibling?.rfilename || '').trim());
    const base = file.split('/').pop();
    if (!base.startsWith(prefix) || !base.endsWith(suffix)) continue;
    const size = Number(sibling?.size || sibling?.lfs?.size || 0);
    if (!Number.isFinite(size) || size <= 0) continue;
    total += size;
    count += 1;
  }
  if (count <= 1 || total <= 0) return null;
  return { totalBytes: total, shardCount: count };
}

function findSiblingForTarget(targetFilePath, siblings = []) {
  const target = decodeURIComponent(String(targetFilePath || '').trim());
  if (!target) return null;
  const targetBase = target.split('/').pop();
  for (const sibling of siblings) {
    const file = decodeURIComponent(String(sibling?.rfilename || '').trim());
    if (!file) continue;
    const fileBase = file.split('/').pop();
    if (file === target || fileBase === targetBase) return sibling;
  }
  return null;
}

module.exports = {
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
};
