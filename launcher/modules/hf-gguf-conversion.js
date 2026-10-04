/* Local HF -> GGUF orchestration. llama.cpp owns architecture and tensor handling. */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { pipeline } = require('stream/promises');
const { getCurrentPlatformKey } = require('./binary-manager/binary-manager-platform');

const UNSUPPORTED = 'This model cannot currently be converted by the installed llama.cpp version.';
const PREFERRED = ['Q8_0', 'Q6_K', 'Q5_K_M', 'Q4_K_M'];
const helper = path.join(__dirname, 'hf-conversion-tools.py');

function parseSource(value, revision = 'main') {
  let repo = String(value || '').trim();
  if (repo.startsWith('https://')) {
    const url = new URL(repo);
    if (url.hostname !== 'huggingface.co' || url.username || url.password) throw new Error('Use a Hugging Face repository URL.');
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    repo = parts.slice(0, 2).join('/');
    if (['tree', 'resolve', 'blob'].includes(parts[2]) && parts[3]) revision = parts[3];
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || repo.split('/').some(p => p === '.' || p === '..')) throw new Error('Invalid Hugging Face repository ID.');
  if (!revision || /[\x00-\x1f]/.test(revision)) throw new Error('Invalid revision.');
  return { repo, revision };
}

function safePath(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.split('/').some(p => !p || p === '.' || p === '..') || /[\x00-\x1f:]/.test(relative)) throw new Error('Unsafe model file path.');
  const target = path.resolve(root, relative);
  const base = path.resolve(root);
  if (!target.startsWith(base + path.sep)) throw new Error('Model file escapes storage root.');
  // Reject existing symlink ancestors, including the storage root itself.
  let cursor = target;
  while (cursor !== path.dirname(cursor)) {
    if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) throw new Error('Symlink storage paths are not allowed.');
    cursor = path.dirname(cursor);
  }
  return target;
}

function quantizations(text) {
  return [...new Set([...text.matchAll(/^\s*(?:\d+\s+or\s+)?(Q\d_[A-Z0-9_]+|IQ\d_[A-Z0-9_]+|TQ\d_[A-Z0-9_]+)\s*(?:=|:|\s)/gm)].map(m => m[1]))];
}

function run(command, args, { cwd, signal, timeout = 30 * 60 * 1000, progress, allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Conversion cancelled.'));
    const child = spawn(command, args, { cwd, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', stopped = '';
    let killTimer;
    const kill = () => {
      try { if (process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM'); else child.kill(); } catch (_) {}
      killTimer = setTimeout(() => { try { if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch (_) {} }, 2000);
      killTimer.unref();
    };
    const abort = () => { stopped = 'Conversion cancelled.'; kill(); };
    const timer = setTimeout(() => { stopped = 'Conversion tool timed out.'; kill(); }, timeout);
    signal?.addEventListener('abort', abort, { once: true });
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
      const text = chunk.toString();
      output = (output + text).slice(-128 * 1024);
      progress?.(text.slice(-1500));
    });
    const cleanup = () => { clearTimeout(timer); clearTimeout(killTimer); signal?.removeEventListener('abort', abort); };
    child.on('error', error => { cleanup(); reject(error); });
    child.on('close', code => {
      cleanup();
      if (stopped || (code !== 0 && !allowFailure)) reject(new Error(stopped || `Tool exited ${code}: ${output.slice(-4000)}`));
      else resolve({ code, output });
    });
  });
}

// Stream weights to disk; never buffer a model in the Electron process. Credentials
// are sent only to huggingface.co, never forwarded to signed CDN redirects.
function response(url, token, signal, redirects = 0) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || redirects > 8) return reject(new Error('Invalid HF download redirect.'));
    const headers = { 'User-Agent': 'PSF-Core-CE' };
    if (parsed.hostname === 'huggingface.co' && token) headers.Authorization = `Bearer ${token}`;
    const request = https.get(parsed, { headers, signal, timeout: 60000 }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        response(new URL(res.headers.location, parsed).href, token, signal, redirects + 1).then(resolve, reject);
      } else if (res.statusCode !== 200) {
        res.resume(); reject(new Error(`Hugging Face returned HTTP ${res.statusCode}. Check repository access and token.`));
      } else resolve(res);
    });
    request.on('timeout', () => request.destroy(new Error('Hugging Face request timed out.')));
    request.on('error', reject);
  });
}

async function jsonRequest(url, token, signal) {
  const res = await response(url, token, signal);
  let data = '';
  for await (const chunk of res) {
    data += chunk;
    if (data.length > 16 * 1024 * 1024) { res.destroy(); throw new Error('HF metadata exceeds limit.'); }
  }
  return JSON.parse(data);
}

async function sha256(file, signal) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file, { signal })) hash.update(chunk);
  return hash.digest('hex');
}

function selectSourceFiles(siblings) {
  const names = siblings.map(f => f.rfilename);
  const hasSafe = names.some(n => /\.safetensors$/i.test(n));
  const tensors = names.filter(n => hasSafe ? /\.safetensors$/i.test(n) : /(?:pytorch_model.*\.bin|\.pt|\.pth)$/i.test(n));
  if (!names.includes('config.json') || !tensors.length) throw new Error('Repository must contain config.json and model tensors.');
  if (!names.some(n => /(?:tokenizer|vocab|merges|spiece|sentencepiece)/i.test(n))) throw new Error('Repository is missing tokenizer files.');
  // Preserve all data/config/tokenizer assets and shard indexes; do not execute HF code.
  return siblings.filter(f => !/\.(?:gguf|py|pyc|exe|dll|so|sh)$/i.test(f.rfilename) && !f.rfilename.startsWith('.git/') &&
    (!hasSafe || !/(?:pytorch_model.*\.bin|pytorch_model.*\.index\.json|\.pt|\.pth)$/i.test(f.rfilename)));
}

function createConversionService(appDir, dependencies = {}) {
  const project = path.resolve(appDir, '..');
  const cacheRoot = path.join(project, '.psf', 'hf-conversion');
  const jobs = new Map();
  const execute = dependencies.run || run;
  const requestJson = dependencies.jsonRequest || jsonRequest;
  const hashFile = dependencies.sha256 || sha256;
  const toolsRoot = dependencies.toolsRoot || path.join(project, 'binaries', 'llama.cpp', getCurrentPlatformKey());
  let updating = false;

  function tool(name) {
    const exe = name + (process.platform === 'win32' ? '.exe' : '');
    const candidate = ['bin', 'build/bin', 'build/bin/Release'].map(dir => path.join(toolsRoot, dir, exe)).find(p => fs.existsSync(p));
    if (!candidate) throw new Error(`${name} is missing. Use Update conversion tools.`);
    return candidate;
  }
  function python() {
    const candidates = [process.env.PSF_LLAMA_CPP_PYTHON, path.join(toolsRoot, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')].filter(Boolean);
    return candidates.find(p => fs.existsSync(p)) || (process.platform === 'win32' ? 'python' : 'python3');
  }
  async function inspect(action, target, job, extra = []) {
    let result;
    try {
      result = await execute(python(), [helper, toolsRoot, action, target, ...extra], { cwd: toolsRoot, signal: job?.controller.signal, timeout: 120000 });
    } catch (error) {
      if (/ModuleNotFoundError|ENOENT/.test(error.message)) throw new Error('Conversion tools or Python dependencies are missing. Use Update conversion tools.');
      throw error;
    }
    return JSON.parse(result.output.trim().split(/\r?\n/).pop());
  }
  async function discover(job) {
    const converter = path.join(toolsRoot, 'convert_hf_to_gguf.py');
    if (!fs.existsSync(converter)) throw new Error('Installed llama.cpp Hugging Face converter is missing. Use Update conversion tools.');
    const options = { cwd: toolsRoot, signal: job?.controller.signal, timeout: 120000, allowFailure: true };
    const help = await execute(python(), [converter, '--help'], options);
    if (help.code !== 0) throw new Error(`Conversion Python dependencies are unavailable. Use Update conversion tools.\n${help.output.slice(-1500)}`);
    if (!help.output.includes('--outfile') || !help.output.includes('--outtype')) throw new Error('Installed converter interface is unavailable. Use Update conversion tools.');
    const outtypes = help.output.match(/--outtype\s+\{([^}]+)\}/)?.[1].split(',').map(s => s.trim()) || [];
    const precision = ['f16', 'bf16', 'f32'].find(t => outtypes.includes(t));
    if (!precision) throw new Error('Installed converter does not expose a supported floating-point output type.');
    const quantize = tool('llama-quantize');
    const quantHelp = await execute(quantize, ['--help'], options);
    if (!/model[^\n]*\.gguf[^\n]*type/i.test(quantHelp.output)) throw new Error('Installed quantizer interface is unavailable. Use Update conversion tools.');
    const choices = quantizations(quantHelp.output);
    if (!choices.length) throw new Error('Cannot determine quantization choices from installed llama-quantize.');
    return { converter, precision, quantize, choices, cli: tool('llama-cli'), vocabOnly: help.output.includes('--vocab-only') };
  }
  function own(id, owner) {
    const job = jobs.get(id);
    if (!job || job.owner !== owner) throw new Error('Conversion session not found. Scan the repository again.');
    return job;
  }
  async function clean(job) {
    await fs.promises.rm(job.work, { recursive: true, force: true });
    jobs.delete(job.id);
  }
  async function scan(owner, input, token, emit) {
    if (updating) throw new Error('Conversion tools are updating. Try again when the update finishes.');
    const source = parseSource(input.url, input.revision);
    const meta = await requestJson(`https://huggingface.co/api/models/${source.repo}/revision/${encodeURIComponent(source.revision)}?blobs=true`, token);
    if (!/^[a-f0-9]{40,64}$/i.test(meta.sha || '')) throw new Error('Hugging Face did not provide an exact source commit.');
    const siblings = meta.siblings || [];
    const ggufs = siblings.filter(f => /\.gguf$/i.test(f.rfilename));
    const pinnedUrl = name => `https://huggingface.co/${source.repo}/resolve/${meta.sha}/${name.split('/').map(encodeURIComponent).join('/')}`;
    if (ggufs.length) return { success: true, mode: 'download', repo: source.repo, revision: meta.sha, files: ggufs.map(f => ({ filename: f.rfilename, download_url: pinnedUrl(f.rfilename), sha256: f.lfs?.sha256 || null })) };
    const files = selectSourceFiles(siblings);
    const baseValue = input.baseModelUrl || (Array.isArray(meta.cardData?.base_model) ? meta.cardData.base_model[0] : meta.cardData?.base_model);
    const baseSource = baseValue ? parseSource(baseValue) : null;
    const id = crypto.randomUUID();
    const work = safePath(cacheRoot, `work/${id}`);
    fs.mkdirSync(work, { recursive: true });
    const job = { id, owner, work, source, meta, files, pinnedUrl, baseSource, supplemental: [], controller: new AbortController(), emit, state: 'scanned' };
    jobs.set(id, job);
    try {
      job.config = await requestJson(pinnedUrl('config.json'), token, job.controller.signal);
      const configPath = path.join(work, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify(job.config));
      job.probe = await inspect('probe', configPath, job);
      if (!job.probe.supported) { await clean(job); return { success: false, unsupported: true, error: UNSUPPORTED }; }
      job.tools = await discover(job);
      return { success: true, mode: 'convert', sessionId: id, repo: source.repo, revision: meta.sha, architecture: job.probe.architecture,
        sizeBytes: files.reduce((n, f) => n + Number(f.size || f.lfs?.size || 0), 0), message: 'No GGUF available. Convert locally?' };
    } catch (error) { await clean(job); throw error; }
  }
  async function download(job, token, phase) {
    const key = crypto.createHash('sha256').update(`${job.source.repo}@${job.meta.sha}`).digest('hex');
    job.sourceDir = safePath(cacheRoot, `sources/${key}`);
    const hashes = [];
    for (const file of job.files) {
      // Shard indexes make upstream initialize missing tensor files even in
      // vocab-only mode, so download them with their tensors after preflight.
      const tensor = /(?:\.safetensors(?:\.index\.json)?|pytorch_model.*\.bin(?:\.index\.json)?|\.pt|\.pth)$/i.test(file.rfilename);
      if (phase === 'metadata' && tensor || phase === 'tensors' && !tensor) continue;
      const target = safePath(job.sourceDir, file.rfilename);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      job.emit(`Downloading source: ${file.rfilename}`);
      const expected = file.lfs?.sha256 || null;
      let digest = fs.existsSync(target) ? await hashFile(target, job.controller.signal) : null;
      if (!digest || (expected && digest !== expected) || !expected) {
        const partial = safePath(job.sourceDir, file.rfilename + '.partial');
        try {
          if (dependencies.download) await dependencies.download(job.pinnedUrl(file.rfilename), partial, token, job.controller.signal);
          else await pipeline(await response(job.pinnedUrl(file.rfilename), token, job.controller.signal), fs.createWriteStream(partial, { flags: 'w' }), { signal: job.controller.signal });
          digest = await hashFile(partial, job.controller.signal);
          const size = Number(file.size || file.lfs?.size || 0);
          if (size && fs.statSync(partial).size !== size) throw new Error(`Incomplete source download: ${file.rfilename}`);
          if (expected && digest !== expected) throw new Error(`Source SHA-256 mismatch: ${file.rfilename}`);
          fs.renameSync(partial, target);
        } finally { fs.rmSync(partial, { force: true }); }
      }
      hashes.push({ path: file.rfilename, sha256: digest, upstream_sha256: expected, git_blob_id: file.blobId || null });
    }
    job.sourceHashes = [...(job.sourceHashes || []), ...hashes];
  }
  async function supplement(job, name, token) {
    const asset = require('./conversion-companion-assets').companion(name);
    if (!asset) return false; // Never invent a compatibility check for an unknown format.
    let candidate = { ...asset, source: 'verified-upstream-companion' };
    if (job.baseSource && job.baseSource.repo !== job.source.repo) {
      const base = job.baseSource;
      const meta = await requestJson(`https://huggingface.co/api/models/${base.repo}/revision/${encodeURIComponent(base.revision)}?blobs=true`, token, job.controller.signal);
      if (!/^[a-f0-9]{40,64}$/i.test(meta.sha || '')) throw new Error('Base repository did not provide an exact commit.');
      job.baseRevision = meta.sha;
      const file = (meta.siblings || []).find(f => f.rfilename === name);
      if (file) candidate = { source: 'base-model-repository', repository: base.repo, revision: meta.sha, path: name,
        sha256: file.lfs?.sha256 || null, size: Number(file.size || file.lfs?.size || 0), verifier: asset.verifier,
        url: `https://huggingface.co/${base.repo}/resolve/${meta.sha}/${encodeURIComponent(name)}` };
    }
    const staged = safePath(job.work, `${name}.companion.partial`);
    const assetToken = new URL(candidate.url).hostname === 'huggingface.co' ? token : null;
    job.emit(`Fetching supplemental tokenizer asset: ${candidate.repository}/${candidate.path}`);
    try {
      if (dependencies.download) await dependencies.download(candidate.url, staged, assetToken, job.controller.signal);
      else {
        const stream = await response(candidate.url, assetToken, job.controller.signal);
        let size = 0;
        stream.on('data', chunk => { size += chunk.length; if (size > 16 * 1024 * 1024) stream.destroy(new Error('Supplemental tokenizer asset exceeds size limit.')); });
        await pipeline(stream, fs.createWriteStream(staged), { signal: job.controller.signal });
      }
      const digest = await hashFile(staged, job.controller.signal);
      if (candidate.sha256 && digest !== candidate.sha256) throw new Error(`Supplemental tokenizer SHA-256 mismatch: ${name}`);
      if (candidate.size && fs.statSync(staged).size !== candidate.size) throw new Error(`Incomplete supplemental tokenizer asset: ${name}`);
      const verification = await inspect(candidate.verifier, job.sourceDir, job, [staged]);
      if (verification.compatible !== true) throw new Error('Supplemental tokenizer does not match source token IDs and bytes.');
      fs.copyFileSync(staged, safePath(job.sourceDir, name));
      job.supplemental.push({ path: name, source: candidate.source, repository: candidate.repository, revision: candidate.revision,
        upstream_path: candidate.path, url: candidate.url, sha256: digest, upstream_sha256: candidate.sha256, verification });
      job.emit(`Verified supplemental tokenizer: ${verification.matched_tokens} token IDs and bytes match. Retrying installed converter.`);
      return true;
    } finally { fs.rmSync(staged, { force: true }); }
  }
  async function prepare(owner, input, token) {
    const job = own(input.sessionId, owner);
    if (job.state !== 'scanned') throw new Error('Conversion already started.');
    // Serialize large conversions and source-cache access across editor windows.
    if ([...jobs.values()].some(j => j !== job && ['converting', 'ready', 'quantizing'].includes(j.state))) throw new Error('Another conversion is active. Finish or cancel it first.');
    job.state = 'converting'; job.keepSource = input.keepSource === true;
    try {
      // Let the installed converter check the repository tokenizer before
      // spending bandwidth or memory on model tensors. No architecture list.
      await download(job, token, 'metadata');
      // Retained caches may contain a previous supplemental asset. Revalidate
      // and record it for this run rather than silently trusting cached data.
      for (const name of require('./conversion-companion-assets').names) {
        if (!job.files.some(f => f.rfilename === name) && fs.existsSync(safePath(job.sourceDir, name))) await supplement(job, name, token);
      }
      if (job.tools.vocabOnly) {
        const vocab = safePath(job.work, 'tokenizer-check.gguf');
        job.emit('Checking tokenizer compatibility with the installed converter…');
        try {
          await execute(python(), [job.tools.converter, job.sourceDir, '--vocab-only', '--outfile', vocab, '--outtype', job.tools.precision],
            { cwd: toolsRoot, signal: job.controller.signal, timeout: 120000 });
        } catch (error) {
          if (job.controller.signal.aborted) throw error;
          const missing = error.message.match(/self\.dir_model\s*\/\s*["']([^"']+)["']\)?\.is_file\(\)/)?.[1];
          if (missing && !job.files.some(f => f.rfilename === missing) && await supplement(job, missing, token)) {
            await execute(python(), [job.tools.converter, job.sourceDir, '--vocab-only', '--outfile', vocab, '--outtype', job.tools.precision],
              { cwd: toolsRoot, signal: job.controller.signal, timeout: 120000 });
          } else {
            throw new Error(`The installed llama.cpp converter recognizes this architecture, but cannot convert this repository's tokenizer.${missing ? ` Required source file is missing: ${missing}.` : ''} No model tensors were downloaded or converted. The source repository must provide the tokenizer assets required by this converter, or llama.cpp must add support for its tokenizer packaging.\n${error.message.slice(-1800)}`);
          }
        } finally { fs.rmSync(vocab, { force: true }); }
      }
      await download(job, token, 'tensors');
      // Re-probe the downloaded, pinned config before touching tensors.
      job.probe = await inspect('probe', path.join(job.sourceDir, 'config.json'), job);
      if (!job.probe.supported) throw new Error(UNSUPPORTED);
      job.sourceDatatypes = (await inspect('source-types', job.sourceDir, job)).datatypes;
      job.base = safePath(job.work, `model-${job.tools.precision.toUpperCase()}.gguf`);
      job.emit('Converting source tensors to full-precision GGUF…');
      await execute(python(), [job.tools.converter, job.sourceDir, '--outfile', job.base, '--outtype', job.tools.precision], { cwd: toolsRoot, signal: job.controller.signal, progress: job.emit });
      job.baseMetadata = await inspect('validate', job.base, job);
      if (!job.baseMetadata.unquantized || job.baseMetadata.architecture !== job.probe.gguf_architecture) throw new Error('Converter output has an unexpected architecture or is already quantized.');
      job.state = 'ready';
      return { success: true, sessionId: job.id, choices: job.tools.choices,
        preferred: PREFERRED.filter(q => job.tools.choices.includes(q)),
        recommended: job.tools.choices.includes('Q5_K_M') ? 'Q5_K_M' : job.tools.choices[0], architecture: job.baseMetadata.architecture };
    } catch (error) {
      if (job.sourceDir && !job.keepSource) await fs.promises.rm(job.sourceDir, { recursive: true, force: true });
      await clean(job); throw error;
    }
  }
  async function finish(owner, input, catalogManager) {
    const job = own(input.sessionId, owner);
    if (job.state !== 'ready') throw new Error('Create a full-precision GGUF first.');
    if (!job.tools.choices.includes(input.quantization)) throw new Error('Quantization is not supported by installed llama-quantize.');
    const collection = String(input.collectionId || '');
    if (!/^[\w-]+$/.test(collection)) throw new Error('Invalid collection.');
    const catalog = await catalogManager.getMasterCatalog(appDir);
    if (!Object.hasOwn(catalog.collections, collection)) throw new Error('Collection does not exist.');
    const sourceName = job.source.repo.split('/')[1];
    const requestedRwkv = job.source.repo === 'shoumenchougou/RWKV7-G1k-2.9B-20260930-FLA';
    const name = requestedRwkv ? 'RWKV7-G1k-2.9B-20260930' : sourceName;
    const modelId = `${name}-${input.quantization}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (catalog.collections[collection].models?.some(m => m.id === modelId)) throw new Error('This conversion is already registered in the collection.');
    const filename = `${name.replace(/[^a-zA-Z0-9._-]/g, '-')}-${input.quantization}-${job.meta.sha.slice(0, 8)}.gguf`;
    const destination = safePath(path.join(project, 'models'), `${collection}/${filename}`);
    if (fs.existsSync(destination) || fs.existsSync(destination + '.provenance.json')) throw new Error('Generated model path already exists.');
    const output = safePath(job.work, filename);
    job.state = 'quantizing';
    let installed = false, registered = false;
    try {
      const base = await inspect('validate', job.base, job);
      if (!base.unquantized) throw new Error('Requantization is disabled. Quantize only from the original F16/F32/BF16 GGUF.');
      job.emit(`Quantizing ${input.quantization} from original ${job.tools.precision.toUpperCase()} GGUF…`);
      await execute(job.tools.quantize, [job.base, output, input.quantization], { cwd: toolsRoot, signal: job.controller.signal, progress: job.emit });
      const metadata = await inspect('validate', output, job);
      if (metadata.architecture !== job.probe.gguf_architecture) throw new Error('Quantization changed architecture identity.');
      if (!metadata.quantization) throw new Error('Generated GGUF quantization metadata is missing.');
      job.emit('Validating GGUF with a CPU model load test…');
      const cliHelp = await execute(job.tools.cli, ['--help'], { cwd: toolsRoot, signal: job.controller.signal, allowFailure: true, timeout: 120000 });
      for (const option of ['--model', '--predict', '--prompt', '--gpu-layers']) if (!cliHelp.output.includes(option)) throw new Error(`Installed llama-cli lacks ${option}; cannot validate load.`);
      const args = ['--model', output, '--gpu-layers', '0', '--predict', input.smokeTest === true ? '1' : '0', '--prompt', 'Hello'];
      if (cliHelp.output.includes('--ctx-size')) args.push('--ctx-size', '512');
      for (const flag of ['--no-conversation', '--no-warmup']) if (cliHelp.output.includes(flag)) args.push(flag);
      await execute(job.tools.cli, args, { cwd: toolsRoot, signal: job.controller.signal, timeout: 10 * 60 * 1000, progress: job.emit });
      const digest = await hashFile(output, job.controller.signal);
      let commit = null;
      try { commit = JSON.parse(fs.readFileSync(path.join(toolsRoot, '.psf-source-version.json'), 'utf8')).commit; } catch (_) {}
      if (!commit && fs.existsSync(path.join(toolsRoot, '.git'))) {
        try { commit = (await execute('git', ['rev-parse', 'HEAD'], { cwd: toolsRoot, timeout: 10000 })).output.trim(); } catch (_) {}
      }
      const version = await execute(job.tools.cli, ['--version'], { cwd: toolsRoot, timeout: 30000, allowFailure: true, signal: job.controller.signal });
      const provenance = { source_repository: job.source.repo, source_revision: job.meta.sha, requested_revision: job.source.revision,
        original_model_name: sourceName, source_architecture: job.probe.architecture, source_model_type: job.config.model_type || null,
        source_tensor_format: job.files.some(f => /\.safetensors$/.test(f.rfilename)) ? 'safetensors' : 'pytorch',
        original_tensor_datatype: job.sourceDatatypes.length ? job.sourceDatatypes : (job.config.torch_dtype || job.config.dtype || 'unspecified in source config'),
        conversion_date: new Date().toISOString(), llama_cpp_commit: commit, llama_cpp_version: version.output.trim(),
        converter_sha256: await hashFile(job.tools.converter, job.controller.signal), intermediate_datatype: job.tools.precision,
        gguf_architecture: metadata.architecture, requested_quantization: input.quantization,
        final_quantization: metadata.quantization, generated_sha256: digest,
        source_files: job.sourceHashes, supplemental_assets: job.supplemental,
        base_model_repository: job.baseSource?.repo || null, base_model_revision: job.baseRevision || null,
        validation: { metadata: true, model_load: true, inference_smoke_test: input.smokeTest === true },
        source_cache_retained: job.keepSource };
      // Preserve the actual upstream GGUF identity. No HF architecture guessing.
      if (requestedRwkv && metadata.architecture !== 'rwkv7') throw new Error('Requested RWKV7 source did not produce an RWKV7 GGUF.');
      const model = { ...(input.modelData || {}), id: modelId, name, filename, download_url: null,
        url: `https://huggingface.co/${job.source.repo}`, huggingface_repo: job.source.repo,
        model_family: requestedRwkv ? 'RWKV-7 Goose' : (input.modelData?.model_family || metadata.architecture),
        architecture: metadata.architecture, architecture_description: metadata.architecture === 'rwkv7' ? 'RWKV7 recurrent' : metadata.architecture,
        runtime: 'llama.cpp', runtimes: ['llama.cpp'], backend: 'llama.cpp', license: job.meta.cardData?.license || input.modelData?.license || null,
        quantization: metadata.quantization, file_size_bytes: fs.statSync(output).size,
        size_mb: Math.ceil(fs.statSync(output).size / (1024 * 1024)), sha256: digest, checksums: { main: digest }, provenance, locally_converted: true };
      if (job.controller.signal.aborted) throw new Error('Conversion cancelled.');
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      // Exclusive copy prevents another workflow's model from being overwritten.
      fs.copyFileSync(output, destination, fs.constants.COPYFILE_EXCL); installed = true;
      fs.writeFileSync(destination + '.provenance.json', JSON.stringify(provenance, null, 2), { flag: 'wx' });
      const result = await catalogManager.addModel(appDir, collection, model);
      if (!result.success) throw new Error(result.message || 'Catalog registration failed.');
      registered = true;
      if (!job.keepSource) await fs.promises.rm(job.sourceDir, { recursive: true, force: true });
      await clean(job);
      return { success: true, model, message: `Created and registered ${filename}. Source tensors ${job.keepSource ? 'kept in cache' : 'deleted'}.` };
    } catch (error) {
      if (installed && !registered) { fs.rmSync(destination, { force: true }); fs.rmSync(destination + '.provenance.json', { force: true }); }
      if (registered) return { success: true, message: `Model registered; temporary cache cleanup needs attention: ${error.message}` };
      fs.rmSync(output, { force: true });
      if (job.controller.signal.aborted) {
        if (!job.keepSource) await fs.promises.rm(job.sourceDir, { recursive: true, force: true });
        await clean(job);
      } else job.state = 'ready'; // Original precision remains available for another quantization choice.
      throw error;
    }
  }
  async function cancel(owner, id) {
    const targets = [...jobs.values()].filter(j => j.owner === owner && (!id || j.id === id));
    for (const job of targets) {
      job.controller.abort();
      if (['scanned', 'ready'].includes(job.state)) {
        if (job.sourceDir && !job.keepSource) await fs.promises.rm(job.sourceDir, { recursive: true, force: true });
        await clean(job);
      }
    }
    return { success: true };
  }
  async function update(emit) {
    if (updating || jobs.size) throw new Error('Finish or cancel scanned conversions before updating tools.');
    updating = true;
    try {
      const { updateConversionTools } = require('./binary-manager/binary-manager-llamacpp-worker');
      return await updateConversionTools(appDir, emit);
    } finally { updating = false; }
  }
  return { scan, prepare, finish, cancel, update };
}

module.exports = { createConversionService, parseSource, safePath, quantizations, selectSourceFiles, UNSUPPORTED, run };
