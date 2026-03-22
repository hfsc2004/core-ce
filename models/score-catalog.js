/**
 * ============================================================================
 * Score Catalog (Offline PSF Score)
 * ============================================================================
 *
 * Computes model-level `catalog_score` and recommendation badges using:
 * - local benchmark overrides (optional)
 * - catalog metadata heuristics
 *
 * Usage:
 *   node models/score-catalog.js
 */

const fs = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, 'catalog-master.json');
const BENCH_PATH = path.join(__dirname, 'benchmarks', 'local-benchmarks.json');
const MOD_BENCH_PATH = path.join(
  __dirname,
  '..',
  '.psf',
  'mods',
  'state',
  'com.psf.eval-benchmark',
  'storage',
  'eval-kit',
  'benchmarks',
  'local-benchmarks.json'
);

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function n(value, fallback = 0) {
  const v = Number(value);
  return Number.isFinite(v) ? v : fallback;
}

function familyBaseScore(model = {}) {
  const family = String(model.model_family || '').toLowerCase();
  if (!family) return 58;
  const high = ['qwen', 'llama', 'gemma', 'mistral', 'phi'];
  const mid = ['mixtral', 'smollm', 'zephyr', 'yi', 'solar', 'nemotron', 'glm'];
  const low = ['vicuna', 'falcon', 'gpt2', 'wizardlm', 'wizardcoder', 'codellama'];
  if (high.some((k) => family.includes(k))) return 78;
  if (mid.some((k) => family.includes(k))) return 67;
  if (low.some((k) => family.includes(k))) return 48;
  return 60;
}

function scoreQuality(model, bench = null) {
  if (bench && Number.isFinite(Number(bench.quality))) {
    return clamp(Number(bench.quality), 0, 100);
  }
  let score = familyBaseScore(model);
  const params = String(model.parameters || '').toLowerCase();
  if (params.includes('70b') || params.includes('72b')) score += 6;
  if (params.includes('1b') || params.includes('135m') || params.includes('360m')) score -= 4;
  if (model.supports_code === true) score += 2;
  if (model.supports_function_calling === true) score += 2;
  return clamp(score, 0, 100);
}

function scoreDeployability(model) {
  const artifacts = Array.isArray(model.artifacts) ? model.artifacts : [];
  const primary = artifacts[0] || {};
  const hasDownload = Boolean(String(model.download_url || primary.download_url || '').trim());
  const hasFilename = Boolean(String(model.filename || primary.filename || '').trim());
  const hasRepo = Boolean(String(model.huggingface_repo || primary.huggingface_repo || '').trim());
  const hasSha = Boolean(String(model.sha256 || primary.sha256 || '').trim());
  const runtimeCount = Array.isArray(model.runtimes) ? model.runtimes.length : 0;
  let score = 35;
  if (hasDownload) score += 25;
  if (hasFilename) score += 10;
  if (hasRepo) score += 10;
  if (hasSha) score += 10;
  score += Math.min(10, runtimeCount * 4);
  return clamp(score, 0, 100);
}

function scorePerformance(model, bench = null) {
  if (bench && (Number.isFinite(Number(bench.throughput_tps)) || Number.isFinite(Number(bench.ttft_ms)))) {
    const tps = n(bench.throughput_tps, 0);
    const ttft = n(bench.ttft_ms, 0);
    const tpsScore = tps > 0 ? clamp((tps / 50) * 100, 0, 100) : 50;
    const ttftScore = ttft > 0 ? clamp(100 - (ttft / 2500) * 100, 0, 100) : 50;
    return clamp((tpsScore * 0.65) + (ttftScore * 0.35), 0, 100);
  }
  const sizeMb = n(model.size_mb, 0);
  if (sizeMb <= 0) return 55;
  if (sizeMb <= 700) return 92;
  if (sizeMb <= 2000) return 84;
  if (sizeMb <= 5000) return 75;
  if (sizeMb <= 12000) return 63;
  if (sizeMb <= 30000) return 50;
  if (sizeMb <= 120000) return 35;
  return 20;
}

function scoreReliability(model, bench = null) {
  if (bench && Number.isFinite(Number(bench.stability))) {
    return clamp(Number(bench.stability), 0, 100);
  }
  let score = 70;
  const lifecycle = String(model.lifecycle || 'active').toLowerCase();
  if (lifecycle === 'experimental') score -= 10;
  if (lifecycle === 'legacy') score -= 18;
  if (lifecycle === 'deprecated') score -= 30;
  const hasSha = Boolean(String(model.sha256 || '').trim());
  if (!hasSha) score -= 8;
  const checksums = model.checksums && typeof model.checksums === 'object' ? model.checksums : null;
  if (checksums && checksums.files && Object.keys(checksums.files).length > 1) score += 5;
  return clamp(score, 0, 100);
}

function recommendationFromScore(score, lifecycle = 'active') {
  const lc = String(lifecycle || 'active').toLowerCase();
  if (lc === 'deprecated') return 'deprecated';
  if (lc === 'legacy') return 'legacy';
  if (lc === 'experimental') return score >= 75 ? 'experimental-good' : 'experimental';
  if (score >= 86) return 'recommended';
  if (score >= 74) return 'good';
  if (score >= 62) return 'caution';
  return 'legacy';
}

function loadJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_err) {
    return fallback;
  }
}

function scoreCatalog() {
  const catalog = loadJson(CATALOG_PATH);
  if (!catalog || typeof catalog !== 'object') {
    throw new Error('Failed to load catalog-master.json');
  }
  const benchBase = loadJson(BENCH_PATH, { models: {} }) || { models: {} };
  const benchMod = loadJson(MOD_BENCH_PATH, { models: {} }) || { models: {} };
  const baseModels = benchBase.models && typeof benchBase.models === 'object' ? benchBase.models : {};
  const modModels = benchMod.models && typeof benchMod.models === 'object' ? benchMod.models : {};
  // Mod-scoped eval data takes precedence over legacy shared benchmark file.
  const benchModels = { ...baseModels, ...modModels };
  const today = new Date().toISOString().slice(0, 10);
  let total = 0;
  for (const collection of Object.values(catalog.collections || {})) {
    for (const model of (collection.models || [])) {
      const local = benchModels[String(model.id || '')] || null;
      const utilityLocal = Number(local?.sub_scores?.utility);
      const disciplineLocal = Number(local?.sub_scores?.discipline);
      const utility = Number.isFinite(utilityLocal) ? clamp(utilityLocal, 0, 100) : null;
      const discipline = Number.isFinite(disciplineLocal) ? clamp(disciplineLocal, 0, 100) : null;
      const quality = scoreQuality(model, local);
      const deployability = scoreDeployability(model);
      const performance = scorePerformance(model, local);
      const reliability = scoreReliability(model, local);
      const finalScore = clamp(
        (quality * 0.40) +
        (deployability * 0.25) +
        (performance * 0.20) +
        (reliability * 0.15),
        0,
        100
      );
      const rounded = Math.round(finalScore);
      model.catalog_score = rounded;
      model.recommendation = recommendationFromScore(rounded, model.lifecycle);
      model.last_reviewed = today;
      model.psf_score = {
        version: '1.0.0',
        source: local ? 'local-benchmark+heuristic' : 'heuristic',
        breakdown: {
          quality: Math.round(quality),
          deployability: Math.round(deployability),
          performance: Math.round(performance),
          reliability: Math.round(reliability),
          utility: utility == null ? null : Math.round(utility),
          discipline: discipline == null ? null : Math.round(discipline)
        },
        weights: {
          quality: 0.40,
          deployability: 0.25,
          performance: 0.20,
          reliability: 0.15
        }
      };
      total += 1;
    }
  }
  catalog.last_updated = today;
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2) + '\n');
  return total;
}

function main() {
  const total = scoreCatalog();
  console.log(`Scored ${total} models in catalog-master.json`);
}

main();
