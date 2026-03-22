'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const evalTasks = require('./run-eval-tasks');

const MOD_ID = 'com.psf.eval-benchmark';
const ROOT = path.resolve(__dirname, '..', '..');
const CATALOG_PATH = path.join(ROOT, 'models', 'catalog-master.json');
const MOD_BENCH_PATH = path.join(ROOT, '.psf', 'mods', 'state', MOD_ID, 'storage', 'eval-kit', 'benchmarks', 'local-benchmarks.json');
const FALLBACK_BENCH_PATH = path.join(ROOT, 'models', 'benchmarks', 'local-benchmarks.json');
const TASKS_PATH = path.join(ROOT, '.psf', 'mods', 'state', MOD_ID, 'storage', 'eval-kit', 'tasks', 'core-v1.json');
const OLLAMA_BASE = (() => {
  const explicitBase = String(process.env.OLLAMA_BASE || '').trim();
  if (explicitBase) return explicitBase;
  const portRaw = String(process.env.OLLAMA_PORT || '').trim();
  const port = Number(portRaw);
  if (Number.isFinite(port) && port > 0) return `http://127.0.0.1:${port}`;
  // PSF default terminal Ollama port
  return 'http://127.0.0.1:52434';
})();

function parseArgs(argv = []) {
  const out = { models: '', limit: 5, verbose: false, catalogId: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--models') out.models = String(argv[i + 1] || '');
    if (arg === '--limit') out.limit = Number(argv[i + 1] || 5);
    if (arg === '--verbose') out.verbose = true;
    if (arg === '--catalog-id') out.catalogId = String(argv[i + 1] || '');
  }
  return out;
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_err) {
    return fallback;
  }
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function httpJson(urlPath, payload = null, timeoutMs = 45000) {
  const url = new URL(urlPath, OLLAMA_BASE);
  const body = payload ? JSON.stringify(payload) : null;
  const method = body ? 'POST' : 'GET';
  return new Promise((resolve) => {
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: body
        ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        : {}
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: JSON.parse(data || '{}') });
        } catch (err) {
          resolve({ ok: false, status: res.statusCode, error: err.message, raw: data });
        }
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`timeout ${timeoutMs}ms`)));
    req.on('error', (err) => resolve({ ok: false, status: 0, error: err.message }));
    if (body) req.write(body);
    req.end();
  });
}

function countTokensApprox(text = '') {
  const s = String(text || '').trim();
  if (!s) return 0;
  return s.split(/\s+/).length;
}

function normalizeModelName(value = '') {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return '';
  return v.endsWith(':latest') ? v.slice(0, -7) : v;
}

function parseParameterBillions(rawValue = '') {
  const raw = String(rawValue || '').trim().toUpperCase();
  if (!raw) return null;
  const b = raw.match(/(\d+(\.\d+)?)\s*B\b/);
  if (b) return Number(b[1]);
  const m = raw.match(/(\d+(\.\d+)?)\s*M\b/);
  if (m) return Number(m[1]) / 1000;
  return null;
}

async function generate(modelName, prompt) {
  const started = Date.now();
  const resp = await httpJson('/api/generate', {
    model: modelName,
    prompt,
    stream: false,
    options: {
      temperature: 0,
      top_p: 1,
      num_predict: 220
    }
  }, 60000);
  const elapsed = Date.now() - started;
  if (!resp.ok) {
    return { ok: false, elapsedMs: elapsed, error: resp.error || `HTTP ${resp.status}` };
  }
  const output = String(resp.data?.response || '');
  return {
    ok: true,
    elapsedMs: elapsed,
    output,
    tokensApprox: countTokensApprox(output)
  };
}

async function unloadModel(modelName) {
  const resp = await httpJson('/api/generate', {
    model: modelName,
    prompt: '',
    stream: false,
    keep_alive: 0
  }, 15000);
  return !!resp.ok;
}

function selectTargets(catalog, availableModels, args) {
  const entries = [];
  const available = new Set((availableModels || []).map((m) => String(m.name || '').trim()).filter(Boolean));
  const availableNorm = new Set(Array.from(available).map((name) => normalizeModelName(name)).filter(Boolean));
  const isAvailable = (name) => {
    const raw = String(name || '').trim();
    if (!raw) return false;
    if (available.has(raw)) return true;
    const norm = normalizeModelName(raw);
    return !!norm && availableNorm.has(norm);
  };
  for (const collection of Object.values(catalog.collections || {})) {
    for (const model of (collection.models || [])) {
      const ollamaModel = String(model.ollama_model || '').trim();
      if (!ollamaModel || !isAvailable(ollamaModel)) continue;
      entries.push({
        id: model.id,
        name: model.name,
        ollamaModel,
        supportsCode: !!model.supports_code,
        parameters: String(model.parameters || ''),
        sizeMb: Number(model.size_mb || 0)
      });
    }
  }
  const wanted = String(args.models || '').trim();
  if (wanted) {
    const rawItems = wanted.split(',').map((v) => v.trim()).filter(Boolean);
    const set = new Set(rawItems);
    const setNorm = new Set(rawItems.map((v) => normalizeModelName(v)).filter(Boolean));
    const selected = entries.filter((entry) => {
      const entryNorm = normalizeModelName(entry.ollamaModel);
      return set.has(entry.id) || set.has(entry.ollamaModel) || (entryNorm && setNorm.has(entryNorm));
    });
    if (selected.length > 0) return selected;
    // Fallback: allow direct evaluation by available ollama tag name.
    const fallback = rawItems
      .map((item) => String(item || '').trim())
      .filter((item) => item && isAvailable(item))
      .map((item) => ({
        id: String(args.catalogId || '').trim() || item,
        name: item,
        ollamaModel: item
      }));
    if (fallback.length > 0) return fallback;
    return [];
  }
  return entries.slice(0, Math.max(1, Number(args.limit) || 5));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const catalog = readJson(CATALOG_PATH);
  if (!catalog) {
    throw new Error('catalog-master.json not found');
  }
  const tasksDoc = readJson(TASKS_PATH, {});
  const rawTasks = Array.isArray(tasksDoc?.tasks) ? tasksDoc.tasks : [];
  const validLegacyTasks = rawTasks.filter((task) => evalTasks.isValidTask(task));
  let taskSets = tasksDoc;
  if (evalTasks.shouldMigrateTasks(tasksDoc, validLegacyTasks)) {
    taskSets = evalTasks.defaultTasks();
    writeJson(TASKS_PATH, taskSets);
    process.stdout.write(`[Eval] Installed updated small-model task suite at ${TASKS_PATH}.\n`);
  }
  const suites = taskSets?.suites && typeof taskSets.suites === 'object' ? taskSets.suites : {};
  const coreLiteUtility = Array.isArray(suites['core-lite-utility']) ? suites['core-lite-utility'].filter(evalTasks.isValidTask) : [];
  const coreLiteDiscipline = Array.isArray(suites['core-lite-discipline']) ? suites['core-lite-discipline'].filter(evalTasks.isValidTask) : [];
  const corePro = Array.isArray(suites['core-pro']) ? suites['core-pro'].filter(evalTasks.isValidTask) : [];
  const codePro = Array.isArray(suites['code-pro']) ? suites['code-pro'].filter(evalTasks.isValidTask) : [];
  if (coreLiteUtility.length === 0 || coreLiteDiscipline.length === 0 || corePro.length === 0) {
    throw new Error('Task suites missing required core-lite-utility/core-lite-discipline/core-pro entries.');
  }

  const tags = await httpJson('/api/tags', null, 8000);
  if (!tags.ok) {
    throw new Error(`Could not reach Ollama at ${OLLAMA_BASE}: ${tags.error || tags.status}`);
  }
  const targets = selectTargets(catalog, tags.data?.models || [], args);
  if (targets.length === 0) {
    throw new Error('No matching available Ollama models found for evaluation.');
  }

  const benchPath = fs.existsSync(MOD_BENCH_PATH) ? MOD_BENCH_PATH : FALLBACK_BENCH_PATH;
  const bench = readJson(benchPath, { schema_version: '1.0.0', updated_at: '', models: {} }) || { models: {} };
  if (!bench.models || typeof bench.models !== 'object') bench.models = {};

  for (const target of targets) {
    const paramB = parseParameterBillions(target.parameters);
    const sizeMb = Number(target.sizeMb || 0);
    let usePro = false;
    if (Number.isFinite(paramB)) {
      usePro = paramB >= 4;
    } else if (Number.isFinite(sizeMb) && sizeMb > 0) {
      usePro = sizeMb >= 3000;
    }
    const selectedTasks = [];
    const suiteNames = [];
    if (usePro) {
      selectedTasks.push(...corePro.map((task) => ({ ...task, _bucket: 'pro' })));
      suiteNames.push('core-pro');
    } else {
      selectedTasks.push(...coreLiteUtility.map((task) => ({ ...task, _bucket: 'utility' })));
      selectedTasks.push(...coreLiteDiscipline.map((task) => ({ ...task, _bucket: 'discipline' })));
      suiteNames.push('core-lite-utility', 'core-lite-discipline');
    }
    if (target.supportsCode && usePro && codePro.length > 0) {
      selectedTasks.push(...codePro.map((task) => ({ ...task, _bucket: 'code' })));
      suiteNames.push('code-pro');
    }
    let passed = 0;
    let total = 0;
    let successRuns = 0;
    let totalElapsed = 0;
    let totalTokens = 0;
    let utilityPassed = 0;
    let utilityTotal = 0;
    let disciplinePassed = 0;
    let disciplineTotal = 0;

    process.stdout.write(`\n[Eval] ${target.id} (${target.ollamaModel}) suites=${suiteNames.join('+')}\n`);
    for (const task of selectedTasks) {
      total += 1;
      if (task._bucket === 'utility') utilityTotal += 1;
      if (task._bucket === 'discipline') disciplineTotal += 1;
      const prompt = String(task.prompt || '').trim();
      if (args.verbose) {
        process.stdout.write(`  > prompt[${task.id}]: ${prompt}\n`);
      }
      const run = await generate(target.ollamaModel, prompt);
      if (!run.ok) {
        process.stdout.write(`  - ${task.id}: fail (${run.error})\n`);
        continue;
      }
      successRuns += 1;
      totalElapsed += run.elapsedMs;
      totalTokens += run.tokensApprox;
      const ok = evalTasks.runChecker(task.checker || {}, run.output || '');
      if (ok) passed += 1;
      if (ok && task._bucket === 'utility') utilityPassed += 1;
      if (ok && task._bucket === 'discipline') disciplinePassed += 1;
      process.stdout.write(`  - ${task.id}: ${ok ? 'pass' : 'fail'} (${run.elapsedMs}ms)\n`);
      if (args.verbose) {
        const output = String(run.output || '').replace(/\s+/g, ' ').trim();
        process.stdout.write(`  < response[${task.id}]: ${output}\n`);
      }
    }

    const utilityScore = utilityTotal > 0 ? Math.round((utilityPassed / utilityTotal) * 100) : null;
    const disciplineScore = disciplineTotal > 0 ? Math.round((disciplinePassed / disciplineTotal) * 100) : null;
    const quality = usePro
      ? (total > 0 ? Math.round((passed / total) * 100) : 0)
      : Math.round(((utilityScore ?? 0) * 0.75) + ((disciplineScore ?? 0) * 0.25));
    const stability = total > 0 ? Math.round((successRuns / total) * 100) : 0;
    const throughputTps = totalElapsed > 0 ? Number((totalTokens / (totalElapsed / 1000)).toFixed(2)) : 0;
    const avgLatencyMs = successRuns > 0 ? Math.round(totalElapsed / successRuns) : 0;

    bench.models[target.id] = {
      quality,
      stability,
      throughput_tps: throughputTps,
      ttft_ms: avgLatencyMs,
      notes: `Generated by ${MOD_ID} run-eval (${selectedTasks.length} tasks; suites=${suiteNames.join('+')})`,
      sub_scores: {
        utility: utilityScore,
        discipline: disciplineScore
      }
    };
    if (!usePro) {
      process.stdout.write(`  => utility=${utilityScore ?? 'n/a'}, discipline=${disciplineScore ?? 'n/a'}\n`);
    }
    process.stdout.write(`  => quality=${quality}, stability=${stability}, throughput=${throughputTps} tps, latency=${avgLatencyMs} ms\n`);
    const unloaded = await unloadModel(target.ollamaModel);
    process.stdout.write(`  => unload=${unloaded ? 'ok' : 'skip'} (${target.ollamaModel})\n`);
  }

  bench.updated_at = new Date().toISOString().slice(0, 10);
  writeJson(benchPath, bench);
  process.stdout.write(`\nWrote benchmark results to: ${benchPath}\n`);
}

main().catch((err) => {
  process.stderr.write(`run-eval failed: ${err.message}\n`);
  process.exit(1);
});
