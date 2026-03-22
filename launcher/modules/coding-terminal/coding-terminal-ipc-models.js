/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
/**
 * PSF Coding Terminal - Model/Router IPC Tools
 */
const modelHelpers = require('./coding-terminal-ipc-models-helpers');
const createModelsRouterTools = require('./coding-terminal-ipc-models-router');
const createModelsOllamaTools = require('./coding-terminal-ipc-models-ollama');

function createModelTools(deps = {}) {
  const {
    codingTerminalCommon,
    catalogManager,
    blobMapper,
    ollamaManager,
    fs,
    path,
    http,
    crypto,
    withTimeout,
    ensureTerminalOllamaReady,
    ensureTerminalLlamaReady,
    swapTerminalLlamaModel,
    closeTerminalLlamaSession,
    ensureRouterOllamaReady,
    ensureRouterLlamaReady,
    getTerminalOllamaPort,
    getRouterOllamaPort,
    getRouterLlamaPort,
    listInferenceModels,
    sendInferenceMessage,
    getRuntimeContext,
    getMergedFilename,
    getInferenceBackend = () => 'ollama',
    sanitizeAssistantText,
    OLLAMA_KEEP_ALIVE = '30m',
    defaultRouterModel = 'smollm2:135m',
    routerSystemPrompt = '',
    pipelineTools = null
  } = deps;
  const templateHealthCache = new Map();
  const LOCAL_COLLECTION_KEY = '__local_gguf__';
  const {
    isModelNameEquivalent,
    isModelNameMatch,
    isSpeechOrAudioModelName,
    isCodingCatalogModel,
    listLocalGgufModels,
    resolveConfiguredModel,
    normalizeRouterMode,
    parseDispatcherDecision,
    validateRouterContract,
    coerceRouterDecisionForUserIntent
  } = modelHelpers;
  const routerTools = createModelsRouterTools({
    getInferenceBackend,
    codingTerminalCommon,
    ensureRouterOllamaReady,
    ensureRouterLlamaReady,
    getRouterOllamaPort,
    getRouterLlamaPort,
    withTimeout,
    listInferenceModels,
    sendInferenceMessage,
    sanitizeAssistantText,
    pipelineTools,
    defaultRouterModel,
    routerSystemPrompt,
    OLLAMA_KEEP_ALIVE,
    resolveConfiguredModel,
    normalizeRouterMode,
    parseDispatcherDecision,
    coerceRouterDecisionForUserIntent,
    validateRouterContract
  });
  const { routeModelViaRouter } = routerTools;
  const ollamaTools = createModelsOllamaTools({
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
  });
  const { ensureModelChatTemplateHealthy, modelExistsOnPort, wrapModelOnPort } = ollamaTools;

  async function handleListModels() {
    try {
      const runtime = getRuntimeContext();
      if (!runtime?.appDir) {
        return { success: false, message: 'Missing appDir context', models: [] };
      }

      const backend = String(getInferenceBackend() || 'ollama').toLowerCase();
      if (backend === 'llama-cpp') {
        const cfg = codingTerminalCommon.getConfig ? codingTerminalCommon.getConfig() : {};
        const ggufs = listLocalGgufModels({
          appDir: runtime.appDir,
          fs,
          path,
          localCollectionKey: LOCAL_COLLECTION_KEY,
          selectedAbsPath: cfg?.llamaCppModelPath || ''
        });
        return { success: true, models: ggufs };
      }

      const catalog = await catalogManager.getCatalog(runtime.appDir);
      const collections = catalog?.collections || {};
      const configuredModel = codingTerminalCommon.getConfig().modelName || '';
      const wrappedNames = new Set(blobMapper.getWrappedModelNames(runtime.appDir));
      const models = [];

      for (const [collectionKey, collection] of Object.entries(collections)) {
        const items = Array.isArray(collection.models) ? collection.models : [];
        for (const model of items) {
          if (!isCodingCatalogModel(model)) continue;
          const filename = model.filename || `${model.id}.gguf`;
          const actualFilename = getMergedFilename(filename);
          const modelPathRel = `models/${collectionKey}/${filename}`;
          const actualModelPathRel = `models/${collectionKey}/${actualFilename}`;
          const modelPathAbs = path.join(runtime.appDir, '..', actualModelPathRel);
          const downloaded = fs.existsSync(modelPathAbs);
          const mergedBase = actualFilename.replace(/\.gguf$/i, '').toLowerCase();
          const modelOllamaName = (model.ollama_model || model.ollama_name || model.id || mergedBase).toLowerCase();
          const wrapped = wrappedNames.has(mergedBase) || wrappedNames.has(modelOllamaName);
          const ollamaName = mergedBase;
          if (!downloaded) continue;
          if (backend === 'ollama' && !wrapped) continue;

          models.push({
            collectionKey,
            collectionName: collection.name || collectionKey,
            modelId: model.id,
            displayName: model.name || model.id,
            filename: actualFilename,
            modelPathRel,
            actualModelPathRel,
            projectorFilename: model.projector_filename || '',
            projectorPathRel: model.projector_filename ? `models/${collectionKey}/${model.projector_filename}` : null,
            supportsVision: !!model.projector_url,
            forceCpu: !!model.force_cpu,
            downloaded,
            wrapped,
            ollamaName,
            selected: false
          });
        }
      }

      models.sort((a, b) => a.displayName.localeCompare(b.displayName));
      if (configuredModel && models.length > 0) {
        const selectedModelName = resolveConfiguredModel(
          configuredModel,
          models.flatMap((m) => [m.ollamaName, m.modelId, m.displayName])
        );
        if (selectedModelName) {
          const idx = models.findIndex((m) => (
            isModelNameEquivalent(m.ollamaName, selectedModelName) ||
            isModelNameEquivalent(m.modelId, selectedModelName) ||
            isModelNameEquivalent(m.displayName, selectedModelName)
          ));
          if (idx >= 0) {
            models[idx].selected = true;
          }
        }
      }
      return { success: true, models };
    } catch (err) {
      return { success: false, message: err.message, models: [] };
    }
  }

  async function handleSelectModel(_event, selection = {}) {
    try {
      const backend = String(getInferenceBackend() || 'ollama').toLowerCase();
      const { collectionKey, modelId } = selection;
      if (!collectionKey || !modelId) {
        return { success: false, message: 'collectionKey and modelId are required' };
      }
      const runtime = getRuntimeContext();
      if (!runtime?.appDir) {
        return { success: false, message: 'Missing appDir context' };
      }
      const previousCfg = codingTerminalCommon.getConfig ? codingTerminalCommon.getConfig() : {};
      const previousLlamaPath = String(previousCfg?.llamaCppModelPath || '').trim();

      if (backend === 'llama-cpp' && collectionKey === LOCAL_COLLECTION_KEY) {
        const relPath = decodeURIComponent(String(modelId || '').trim());
        const modelPathAbs = path.resolve(path.join(runtime.appDir, '..', relPath));
        if (!modelPathAbs.toLowerCase().endsWith('.gguf') || !fs.existsSync(modelPathAbs)) {
          return { success: false, message: `Local GGUF not found: ${relPath}` };
        }
        if (isSpeechOrAudioModelName(path.basename(modelPathAbs))) {
          return { success: false, message: `Audio/speech model not allowed in Coding Terminal: ${path.basename(modelPathAbs)}` };
        }
        const effectiveModelName = path.basename(modelPathAbs, '.gguf');
        if (previousLlamaPath && previousLlamaPath !== modelPathAbs && typeof closeTerminalLlamaSession === 'function') {
          await closeTerminalLlamaSession();
        }
        codingTerminalCommon.updateConfig({
          modelName: effectiveModelName,
          llamaCppModelPath: modelPathAbs
        });
        let warmupNote = '';
        if (typeof ensureTerminalLlamaReady === 'function') {
          const t0 = Date.now();
          const warm = await ensureTerminalLlamaReady();
          if (warm?.success) {
            warmupNote = ` (warmed in ${Math.max(0, Date.now() - t0)}ms)`;
          } else if (warm?.error) {
            warmupNote = ` (warmup deferred: ${String(warm.error)})`;
          }
        }
        return {
          success: true,
          modelName: effectiveModelName,
          wrapped: false,
          message: `llama.cpp model path set: ${relPath}${warmupNote}`
        };
      }

      const catalog = await catalogManager.getCatalog(runtime.appDir);
      const collection = catalog?.collections?.[collectionKey];
      if (!collection || !Array.isArray(collection.models)) {
        return { success: false, message: `Collection not found: ${collectionKey}` };
      }
      const model = collection.models.find((m) => m.id === modelId);
      if (!model) {
        return { success: false, message: `Model not found: ${modelId}` };
      }
      if (!isCodingCatalogModel(model)) {
        return { success: false, message: `Model is audio/speech-only and not allowed in Coding Terminal: ${model.name || model.id}` };
      }

      const filename = model.filename || `${model.id}.gguf`;
      const actualFilename = getMergedFilename(filename);
      const modelPathRel = `models/${collectionKey}/${actualFilename}`;
      const modelPathAbs = path.join(runtime.appDir, '..', modelPathRel);
      if (!fs.existsSync(modelPathAbs)) {
        return {
          success: false,
          message: `Model file not downloaded: ${modelPathRel}. Download it from Browse & Download first.`
        };
      }

      const projectorPathRel = model.projector_filename
        ? `models/${collectionKey}/${model.projector_filename}`
        : null;
      const effectiveModelName = actualFilename.replace(/\.gguf$/i, '');
      if (isSpeechOrAudioModelName(effectiveModelName)) {
        return { success: false, message: `Model is audio/speech-only and not allowed in Coding Terminal: ${effectiveModelName}` };
      }
      let warmupNote = '';
      if (backend === 'ollama') {
        await ensureTerminalOllamaReady();
        const port = getTerminalOllamaPort();

        const hasModel = await modelExistsOnPort(effectiveModelName, port);
        if (!hasModel) {
          return {
            success: false,
            message:
              `Model is not available in Ollama session ${port}: ${effectiveModelName}.\n` +
              'Coding Terminal does not wrap models. Wrap/load it from regular PSF Terminal first.'
          };
        }

        if (isBrokenChatTemplateModel(effectiveModelName)) {
          const show = await showModelOnPort(effectiveModelName, port);
          if (show.success && shouldRepairChatTemplate(show)) {
            return {
              success: false,
              message:
                `Model template is incomplete for ${effectiveModelName}.\n` +
                'Coding Terminal does not repair templates. Re-wrap this model in regular PSF Terminal.'
            };
          }
        }
        codingTerminalCommon.updateConfig({ modelName: effectiveModelName });
        // Prewarm selected model now so first user turn doesn't pay cold-load latency.
        try {
          const warmStartedAt = Date.now();
          await withTimeout(
            sendInferenceMessage(
              effectiveModelName,
              [{ role: 'user', content: 'ping' }],
              {
                port,
                keep_alive: OLLAMA_KEEP_ALIVE,
                temperature: 0,
                num_predict: 1
              }
            ),
            6000,
            'Model prewarm timeout'
          );
          warmupNote = ` (prewarmed in ${Math.max(0, Date.now() - warmStartedAt)}ms)`;
        } catch (_warmErr) {
          // Best effort only.
        }
      } else {
        codingTerminalCommon.updateConfig({
          modelName: effectiveModelName,
          llamaCppModelPath: modelPathAbs
        });
        if (typeof swapTerminalLlamaModel === 'function') {
          await swapTerminalLlamaModel({
            modelPath: modelPathAbs,
            sender: _event?.sender || null
          });
        } else {
          if (previousLlamaPath && previousLlamaPath !== modelPathAbs && typeof closeTerminalLlamaSession === 'function') {
            await closeTerminalLlamaSession();
          }
          if (typeof ensureTerminalLlamaReady === 'function') {
            // Warm model session now so first user turn is not blocked by cold start.
            await ensureTerminalLlamaReady();
          }
        }
      }
      return {
        success: true,
        modelName: effectiveModelName,
        wrapped: backend === 'ollama',
        message: `Model ready: ${effectiveModelName}${warmupNote}`
      };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }


  async function handleListRouterModels() {
    try {
      const backend = String(getInferenceBackend() || 'ollama').toLowerCase();
      if (backend === 'llama-cpp') {
        const runtime = getRuntimeContext();
        if (!runtime?.appDir) {
          return { success: false, message: 'Missing appDir context', models: [] };
        }
        const cfg = codingTerminalCommon.getConfig ? codingTerminalCommon.getConfig() : {};
        const rows = listLocalGgufModels({
          appDir: runtime.appDir,
          fs,
          path,
          localCollectionKey: LOCAL_COLLECTION_KEY,
          selectedAbsPath: cfg?.llamaCppRouterModelPath || cfg?.llamaCppModelPath || ''
        });
        const models = rows.map((r) => ({
          name: r.modelId,
          displayName: r.displayName,
          selected: !!r.selected
        }));
        return { success: true, models };
      }

      const ready = backend === 'ollama'
        ? await ensureRouterOllamaReady()
        : await ensureRouterLlamaReady();
      if (!ready.success) {
        return { success: false, message: ready.error, models: [] };
      }
      const port = backend === 'ollama' ? getRouterOllamaPort() : getRouterLlamaPort();
      const result = await withTimeout(
        listInferenceModels({ port }),
        5000,
        'Router model list timeout'
      );
      if (!result?.success || !Array.isArray(result.models)) {
        return { success: false, message: `Unable to query ${backend} models for router.`, models: [] };
      }

      const names = result.models.map((m) => m.name || '').filter(Boolean);
      const cfg = codingTerminalCommon.getConfig();
      const configured = cfg.routerModelName || cfg.dispatcherModelName || defaultRouterModel;
      const selected = resolveConfiguredModel(configured, names);
      const models = names
        .filter((name) => !isSpeechOrAudioModelName(name))
        .slice()
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({
          name,
          displayName: name,
          selected: !!selected && isModelNameMatch(name, selected)
        }));
      return { success: true, models };
    } catch (err) {
      return { success: false, message: err.message, models: [] };
    }
  }

  async function handleSelectRouterModel(_event, selection = {}) {
    try {
      const backend = String(getInferenceBackend() || 'ollama').toLowerCase();
      const rawModelName = String(selection?.modelName || '').trim();
      if (!rawModelName) {
        return { success: false, message: 'modelName is required' };
      }
      if (backend === 'llama-cpp') {
        const runtime = getRuntimeContext();
        if (!runtime?.appDir) {
          return { success: false, message: 'Missing appDir context' };
        }
        const relPath = decodeURIComponent(rawModelName);
        const abs = path.resolve(path.join(runtime.appDir, '..', relPath));
        if (!abs.toLowerCase().endsWith('.gguf') || !fs.existsSync(abs)) {
          return { success: false, message: `Local GGUF not found: ${relPath}` };
        }
        codingTerminalCommon.updateConfig({
          routerModelName: path.basename(abs, '.gguf'),
          dispatcherModelName: path.basename(abs, '.gguf'),
          llamaCppRouterModelPath: abs
        });
        return { success: true, modelName: path.basename(abs, '.gguf') };
      }

      const ready = backend === 'ollama'
        ? await ensureRouterOllamaReady()
        : await ensureRouterLlamaReady();
      if (!ready.success) {
        return { success: false, message: ready.error };
      }
      const port = backend === 'ollama' ? getRouterOllamaPort() : getRouterLlamaPort();
      const result = await withTimeout(
        listInferenceModels({ port }),
        5000,
        'Router model list timeout'
      );
      if (!result?.success || !Array.isArray(result.models)) {
        return { success: false, message: `Unable to query ${backend} models for router.` };
      }
      const names = result.models.map((m) => m.name || '').filter(Boolean);
      const filteredNames = names.filter((name) => !isSpeechOrAudioModelName(name));
      if (filteredNames.length === 0) {
        return { success: false, message: 'No coding-capable router models available.' };
      }
      const selected = resolveConfiguredModel(rawModelName, filteredNames);
      if (!selected) {
        return { success: false, message: `Router model not found: ${rawModelName}` };
      }
      if (isSpeechOrAudioModelName(selected)) {
        return { success: false, message: `Router model is audio/speech-only and not allowed in Coding Terminal: ${selected}` };
      }
      codingTerminalCommon.updateConfig({ routerModelName: selected, dispatcherModelName: selected });
      return { success: true, modelName: selected };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  async function handleListDispatcherModels(event) {
    return handleListRouterModels(event);
  }

  async function handleSelectDispatcherModel(event, selection = {}) {
    return handleSelectRouterModel(event, selection);
  }

  

  

  return {
    handleListModels,
    handleSelectModel,
    ensureModelChatTemplateHealthy,
    handleListRouterModels,
    handleSelectRouterModel,
    handleListDispatcherModels,
    handleSelectDispatcherModel,
    resolveConfiguredModel,
    routeModelViaRouter
  };
}

module.exports = createModelTools;
