/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { getMergedFilename } = require('../coding-terminal/coding-terminal-ipc-utils');
const evalInFlightByModel = new Map();

function runNodeScript(scriptPath, args = [], options = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const cwd = String(options.cwd || process.cwd());
    let stdout = '';
    let stderr = '';
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd,
      env: { ...process.env, ...(options.env || {}) },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const timeoutMs = Number(options.timeoutMs || 0);
    const resolveOnStdoutRegex = options.resolveOnStdoutRegex instanceof RegExp
      ? options.resolveOnStdoutRegex
      : null;
    let timeoutHandle = null;
    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        try {
          child.kill('SIGTERM');
        } catch (_) {}
        finish({
          ok: false,
          code: -2,
          stdout,
          stderr: `${stderr}\nTimeout after ${timeoutMs}ms`.trim(),
          timedOut: true
        });
      }, timeoutMs);
    }
    child.stdout.on('data', (chunk) => {
      const text = String(chunk || '');
      stdout += text;
      if (typeof options.onStdout === 'function' && text) options.onStdout(text);
      if (resolveOnStdoutRegex && resolveOnStdoutRegex.test(stdout)) {
        try {
          child.kill('SIGTERM');
        } catch (_) {}
        if (timeoutHandle) clearTimeout(timeoutHandle);
        finish({ ok: true, code: 0, stdout, stderr, earlyResolved: true });
      }
    });
    child.stderr.on('data', (chunk) => {
      const text = String(chunk || '');
      stderr += text;
      if (typeof options.onStderr === 'function' && text) options.onStderr(text);
    });
    child.on('error', (err) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      finish({ ok: false, code: -1, stdout, stderr: `${stderr}\n${err.message}`.trim() });
    });
    child.on('close', (code) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      finish({ ok: code === 0, code: Number(code || 0), stdout, stderr });
    });
  });
}

async function evaluateCatalogModel(ctx, event, payload = {}) {
  const modelId = payload?.modelId;
  const verbose = !!payload?.verbose;
  const targetModelId = String(modelId || '').trim();
  let startedSessionId = null;
  const requestId = `eval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const emitProgress = (stage, message, level = 'info') => {
    try {
      event?.sender?.send?.('catalog-evaluate-progress', {
        modelId: targetModelId,
        requestId,
        stage: String(stage || ''),
        level: String(level || 'info'),
        message: String(message || '')
      });
    } catch (_) {}
  };

  if (!targetModelId) {
    return { success: false, message: 'Missing model id for evaluation.' };
  }
  if (evalInFlightByModel.has(targetModelId)) {
    const activeRequestId = evalInFlightByModel.get(targetModelId);
    emitProgress('duplicate', `Duplicate evaluation request suppressed (active=${activeRequestId}).`, 'warn');
    return {
      success: false,
      message: 'Evaluation already running for this model.',
      details: `Duplicate request suppressed. Active request id: ${activeRequestId}.`
    };
  }
  evalInFlightByModel.set(targetModelId, requestId);

  const repoRoot = path.resolve(ctx.appDir, '..');
  const evalScriptPath = path.join(repoRoot, 'mods', 'psf-eval-benchmark', 'run-eval.js');
  const scoreScriptPath = path.join(repoRoot, 'models', 'score-catalog.js');
  const buildScriptPath = path.join(repoRoot, 'models', 'build-catalogs.js');

  if (!fs.existsSync(evalScriptPath)) {
    return {
      success: false,
      message: 'Eval mod runner not found. Install/enable the PSF Eval Benchmark mod first.',
      details: evalScriptPath
    };
  }

  emitProgress('prepare', `Preparing BMOC terminal session (request=${requestId})...`);
  let ollamaPort = Number(ctx?.sessionManager?.getOllamaPortForService?.('terminal')) || 0;
  if (!ollamaPort) {
    emitProgress('prepare', 'Starting BMOC terminal Ollama session...');
    const startResult = await ctx?.sessionManager?.startOllamaForService?.(
      'terminal',
      ctx.appDir,
      ctx.gpuInfo
    );
    if (!startResult?.success) {
      return {
        success: false,
        message: 'Failed to start BMOC terminal Ollama session for evaluation.',
        details: startResult?.message || 'Unknown BMOC startup failure.'
      };
    }
    ollamaPort = Number(startResult.ollamaPort || startResult.port || 0);
    startedSessionId = String(startResult.sessionId || '').trim() || null;
  }
  if (!ollamaPort) {
    return {
      success: false,
      message: 'BMOC did not provide a valid terminal Ollama port.',
      details: 'Expected a non-zero terminal ollamaPort from session-manager.'
    };
  }
  emitProgress('prepare', `BMOC terminal session ready on port ${ollamaPort}.`);

  const masterCatalog = await ctx.catalogManager.getMasterCatalog(ctx.appDir);
  let targetModel = null;
  let targetCollectionKey = null;
  for (const [collectionKey, collection] of Object.entries(masterCatalog?.collections || {})) {
    const match = (collection?.models || []).find((entry) => String(entry?.id || '') === targetModelId);
    if (match) {
      targetModel = match;
      targetCollectionKey = collectionKey;
      break;
    }
  }

  if (!targetModel || !targetCollectionKey) {
    return {
      success: false,
      message: `Model id not found in catalog: ${targetModelId}`,
      details: 'Use a valid catalog model id from Browse & Download Models.'
    };
  }

  // Ensure selected model is loaded in BMOC terminal Ollama before evaluation.
  emitProgress('load-model', `Loading model ${targetModelId} into BMOC terminal session...`);
  const mergedFilename = getMergedFilename(String(targetModel.filename || `${targetModelId}.gguf`));
  const modelPath = path.join('models', targetCollectionKey, mergedFilename);
  const projectorPath = targetModel.projector_filename
    ? path.join('models', targetCollectionKey, String(targetModel.projector_filename))
    : null;
  const launchResult = await ctx.ollamaManager.launchModelInOllama(
    modelPath,
    ctx.appDir,
    targetModel.force_cpu ? null : ctx.gpuInfo,
    projectorPath,
    null,
    !!targetModel.force_cpu,
    { preferredPort: ollamaPort, preventAutoStart: true, bindOnly: true }
  );
  if (!launchResult?.success) {
    return {
      success: false,
      message: 'Failed to load selected model into BMOC terminal Ollama session.',
      details: launchResult?.message || 'Unknown launch-model-in-ollama failure.'
    };
  }
  const launchPort = Number(launchResult.port || 0);
  if (!launchPort || launchPort !== ollamaPort) {
    return {
      success: false,
      message: 'Model launch did not bind to BMOC terminal port.',
      details: `Expected port ${ollamaPort}, got ${launchPort || 'none'}.`
    };
  }
  emitProgress('prepare', `Evaluation using Ollama port ${ollamaPort}.`);
  const launchedModelName = String(
    launchResult.modelName || targetModel.ollama_model || targetModelId
  ).trim();
  emitProgress('load-model', `Model loaded: ${launchedModelName}.`);

  emitProgress('evaluate', `Running evaluation${verbose ? ' (verbose log enabled)' : ''}...`);
  try {
    const evalRun = await runNodeScript(
      evalScriptPath,
      [
        '--models', launchedModelName,
        '--catalog-id', targetModelId,
        '--limit', '1',
        ...(verbose ? ['--verbose'] : [])
      ],
      {
        cwd: repoRoot,
        env: {
          OLLAMA_PORT: String(ollamaPort),
          OLLAMA_BASE: `http://127.0.0.1:${ollamaPort}`
        },
        timeoutMs: 300000,
        resolveOnStdoutRegex: /Wrote benchmark results to:/i,
        onStdout: (line) => emitProgress('evaluate-log', line),
        onStderr: (line) => emitProgress('evaluate-log', line, 'warn')
      }
    );
    if (!evalRun.ok) {
      const details = [evalRun.stderr, evalRun.stdout].filter(Boolean).join('\n').trim();
      return {
        success: false,
        message: 'Model evaluation failed.',
        details: details || `Runner exited with code ${evalRun.code}.`
      };
    }

    emitProgress('score', 'Rebuilding catalog scores...');
    const scoreRun = await runNodeScript(scoreScriptPath, [], {
      cwd: repoRoot,
      timeoutMs: 180000,
      resolveOnStdoutRegex: /Scored\s+\d+\s+models/i
    });
    if (!scoreRun.ok) {
      const details = [scoreRun.stderr, scoreRun.stdout].filter(Boolean).join('\n').trim();
      return {
        success: false,
        message: 'Evaluation completed, but score rebuild failed.',
        details: details || `score-catalog exited with code ${scoreRun.code}.`
      };
    }

    emitProgress('build', 'Rebuilding SKU catalogs...');
    const buildRun = await runNodeScript(buildScriptPath, [], {
      cwd: repoRoot,
      timeoutMs: 180000,
      resolveOnStdoutRegex: /Build complete!/i
    });
    if (!buildRun.ok) {
      const details = [buildRun.stderr, buildRun.stdout].filter(Boolean).join('\n').trim();
      return {
        success: false,
        message: 'Evaluation completed, but catalog build failed.',
        details: details || `build-catalogs exited with code ${buildRun.code}.`
      };
    }
    emitProgress('done', 'Evaluation finished and catalog outputs refreshed.');

    return {
      success: true,
      message: `Evaluation complete for ${targetModelId}. Catalog scores refreshed.`,
      details: [evalRun.stdout, scoreRun.stdout, buildRun.stdout].filter(Boolean).join('\n').trim()
    };
  } finally {
    if (startedSessionId) {
      const PortPoolOllama = require('../port-pool/port-pool-ollama');
      emitProgress('cleanup', `Closing BMOC eval session ${startedSessionId}...`);
      try {
        await ctx.sessionManager.closeSession(startedSessionId, { ollama: PortPoolOllama });
        emitProgress('cleanup', `BMOC eval session closed: ${startedSessionId}.`);
      } catch (err) {
        emitProgress('cleanup', `BMOC eval session close failed (${startedSessionId}): ${err?.message || err}`, 'warn');
      }
    }
    if (evalInFlightByModel.get(targetModelId) === requestId) {
      evalInFlightByModel.delete(targetModelId);
    }
  }
}

function createCatalogHandlers() {
  return {
    'get-sku-config': (ctx) => ctx.catalogManager.getSKUConfig(ctx.appDir),
    'get-sku-manifest': (ctx) => ctx.catalogManager.getSKUManifest(ctx.appDir),
    'get-catalog': (ctx) => ctx.catalogManager.getCatalog(ctx.appDir),
    'get-master-catalog': (ctx) => ctx.catalogManager.getMasterCatalog(ctx.appDir),
    'save-master-catalog': (ctx, event, catalogData) =>
      ctx.catalogManager.saveMasterCatalog(ctx.appDir, catalogData),
    'add-model': (ctx, event, collectionId, modelData) =>
      ctx.catalogManager.addModel(ctx.appDir, collectionId, modelData),
    'edit-model': (ctx, event, collectionId, modelId, updatedData) =>
      ctx.catalogManager.editModel(ctx.appDir, collectionId, modelId, updatedData),
    'delete-model-from-catalog': (ctx, event, collectionId, modelId) =>
      ctx.catalogManager.deleteModelFromCatalog(ctx.appDir, collectionId, modelId),
    'move-model': (ctx, event, fromCollectionId, toCollectionId, modelId) =>
      ctx.catalogManager.moveModel(ctx.appDir, fromCollectionId, toCollectionId, modelId),
    'get-collections': (ctx) => ctx.catalogManager.getCollections(ctx.appDir),
    'add-collection': (ctx, event, collectionId, collectionData) =>
      ctx.catalogManager.addCollection(ctx.appDir, collectionId, collectionData),
    'edit-collection': (ctx, event, collectionId, updatedData) =>
      ctx.catalogManager.editCollection(ctx.appDir, collectionId, updatedData),
    'delete-collection': (ctx, event, collectionId) =>
      ctx.catalogManager.deleteCollection(ctx.appDir, collectionId),
    'import-models-from-file': (ctx, event, importFilePath, targetCollectionId, options) =>
      ctx.catalogManager.importModelsFromFile(ctx.appDir, importFilePath, targetCollectionId, options),
    'preview-import-file': (ctx, event, importFilePath) =>
      ctx.catalogManager.previewImportFile(importFilePath),
    'build-sku-catalogs': (ctx) => ctx.catalogManager.buildSKUCatalogs(ctx.appDir),
    'catalog:evaluate-model': (ctx, event, payload = {}) =>
      evaluateCatalogModel(ctx, event, payload)
  };
}

module.exports = { createCatalogHandlers };
