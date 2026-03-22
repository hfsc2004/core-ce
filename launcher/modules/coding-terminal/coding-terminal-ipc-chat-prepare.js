/**
 * PSF Coding Terminal - IPC Chat Prepare Helper
 */

'use strict';

const prepareHelpers = require('./coding-terminal-ipc-chat-prepare-helpers');
const deterministicRegistry = require('./coding-terminal-ipc-deterministic-registry');
const routingHelpers = require('./coding-terminal-ipc-chat-prepare-routing');

function createChatPrepareTool(deps = {}) {
  const {
    getCodingInferenceBackend,
    ensureTerminalLlamaReady,
    ensureTerminalOllamaReady,
    getTerminalOllamaPort,
    getTerminalLlamaPort,
    withTimeout,
    listInferenceModels,
    modelTools,
    ragDebugLog,
    codingTerminalCommon,
    getChatDispatchMode,
    pipelineTools,
    normalizeRouterModeConfig,
    isRouterSmalltalkPrompt,
    runRouterSmalltalkTurn,
    shortHash,
    groundingTools,
    wantsGroundedFullFileOutput,
    CODING_INSPECT_PROMPT,
    CODING_GENERATE_PROMPT,
    CODING_SYSTEM_PROMPT,
    GROUNDED_FILE_ANALYSIS_PROMPT,
    GROUNDED_FILE_FULL_REWRITE_PROMPT,
    GROUNDED_FILE_REWRITE_PROMPT,
    isProjectFilenameVerificationRequest,
    buildProjectRootFileEvidence,
    buildDeterministicProjectFilenameVerification,
    buildDeterministicReplacementApply,
    buildDeterministicIntegrationFixApply,
    buildDeterministicPlanCreate,
    buildDeterministicPlanValidate,
    buildDeterministicPlanExecuteStep,
    buildDeterministicPlanVerify,
    buildDeterministicPlanRunStart,
    buildDeterministicPlanRunStep,
    buildDeterministicPlanRunAuto,
    buildDeterministicPlanRunStatus,
    buildDeterministicPlanRunVerify,
    buildDeterministicToolRunTests,
    buildDeterministicToolReadFile,
    buildDeterministicToolWriteFile,
    buildDeterministicToolVerify,
    tryGetRagContext,
    runRouterDirectTurn,
    applyRouterRewriteToHistory,
    getEffectiveUserMessage,
    summarizeRagSources,
    buildGenerationOptions
  } = deps;

  function normalizeModelNameStrict(value) {
    return String(value || '')
      .toLowerCase()
      .trim()
      .replace(/:latest$/i, '')
      .replace(/-latest$/i, '')
      .replace(/[^a-z0-9]/g, '');
  }

  function findStrictEquivalentModel(targetModel, availableModels = []) {
    const targetNorm = normalizeModelNameStrict(targetModel);
    if (!targetNorm) return '';
    for (const rawName of availableModels) {
      const name = String(rawName || '').trim();
      if (!name) continue;
      if (normalizeModelNameStrict(name) === targetNorm) return name;
    }
    return '';
  }

  async function prepareChatRequest(message, options = {}) {
    const sender = options?.sender || null;
    const backend = getCodingInferenceBackend();
    if (backend === 'llama-cpp') {
      const llamaReady = await ensureTerminalLlamaReady({ sender });
      if (!llamaReady.success) {
        return { success: false, error: llamaReady.error };
      }
    } else {
      const ollamaReady = await ensureTerminalOllamaReady();
      if (!ollamaReady.success) {
        return { success: false, error: ollamaReady.error };
      }
    }

    const cfg = codingTerminalCommon.getConfig();
    const configuredModel = String(cfg?.modelName || '').trim();
    const configuredLlamaModelPath = String(cfg?.llamaCppModelPath || '').trim();
    const sessionPort = backend === 'ollama'
      ? getTerminalOllamaPort()
      : getTerminalLlamaPort();
    const modelNames = [];
    let selectedModel = '';

    if (backend === 'llama-cpp') {
      if (!configuredModel) {
        return {
          success: false,
          error: 'No coder model selected. Select a model from the Coder dropdown and retry.'
        };
      }
      if (configuredLlamaModelPath) {
        const configuredPathModel = String(configuredLlamaModelPath)
          .split(/[\\/]/)
          .pop()
          .replace(/\.gguf$/i, '')
          .trim();
        if (configuredPathModel && normalizeModelNameStrict(configuredPathModel) !== normalizeModelNameStrict(configuredModel)) {
          return {
            success: false,
            error:
              `Configured model mismatch: modelName="${configuredModel}" but llamaCppModelPath points to "${configuredPathModel}". ` +
              'Re-select the coder model so both settings match.'
          };
        }
      }
      selectedModel = configuredModel;
    } else {
      const modelsResult = await withTimeout(
        listInferenceModels({ port: sessionPort }),
        5000,
        `${backend} model list timeout`
      );
      if (!modelsResult?.success || !Array.isArray(modelsResult.models)) {
        return {
          success: false,
          error: `Unable to query ${backend} models on session ${sessionPort}.`
        };
      }
      modelNames.push(...modelsResult.models.map((m) => m.name || '').filter(Boolean));
      if (!configuredModel) {
        return {
          success: false,
          error: 'No coder model selected. Select a model from the Coder dropdown and retry.'
        };
      }
      const strictMatch = findStrictEquivalentModel(configuredModel, modelNames);
      if (!strictMatch) {
        return {
          success: false,
          error: `Selected model "${configuredModel}" is not available on terminal ${backend} session ${sessionPort}.`
        };
      }
      selectedModel = strictMatch;
    }

    let coderSelectionReason = 'configured-model';
    let pendingCoderSelectionEvent = null;

    if (backend === 'ollama' && typeof modelTools.ensureModelChatTemplateHealthy === 'function') {
      const templateHealth = await modelTools.ensureModelChatTemplateHealthy(selectedModel);
      if (!templateHealth?.success) {
        ragDebugLog('template-health-warning', {
          model: selectedModel,
          message: templateHealth?.message || 'unknown'
        });
      }
    }

    const testMode = cfg?.testMode === true;
    const dispatch = getChatDispatchMode(message, cfg);
    const turnContext = pipelineTools.createTurnContext({
      terminalId: cfg?.terminalId,
      projectPath: codingTerminalCommon.getProject()
    });
    if (pendingCoderSelectionEvent) {
      pipelineTools.appendPipelineEvent({
        ...pendingCoderSelectionEvent,
        requestId: turnContext.requestId,
        traceId: turnContext.traceId
      });
    }
    pipelineTools.appendPipelineEvent({
      kind: 'turn.prepare',
      requestId: turnContext.requestId,
      traceId: turnContext.traceId,
      terminalId: turnContext.terminalId,
      dispatchMode: dispatch.mode
    });

    if (normalizeRouterModeConfig(cfg) === 'on' && isRouterSmalltalkPrompt(message)) {
      const routerSmalltalk = await runRouterSmalltalkTurn(message, cfg);
      if (routerSmalltalk?.success) {
        return routingHelpers.buildRouterSmalltalkDeterministicResult({
          routerSmalltalk,
          prepareHelpers,
          shortHash,
          turnContext,
          message
        });
      }
    }

    const history = codingTerminalCommon.getHistory(20)
      .filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'system')
      .map((m) => ({ role: m.role, content: m.content }));

    const sources = [];
    let exactFileContext = null;
    let hasExactFileContext = false;
    let groundedAnalysisMode = false;
    let groundedRewriteMode = false;
    let groundedRewriteFormat = 'unified_diff';

    const requestedMentions = groundingTools.extractFileMentions(message).slice(0, 3);
    const projectPath = codingTerminalCommon.getProject();
    if (requestedMentions.length > 0) {
      exactFileContext = await groundingTools.tryGetExactFileContext(message, projectPath, { allowBucketFallback: true });
      if (exactFileContext.requestedMentions.length > 0 && exactFileContext.resolvedMentions.length === 0) {
        return {
          success: false,
          error: groundingTools.buildExactFileResolutionError(exactFileContext, projectPath)
        };
      }
      hasExactFileContext = exactFileContext.resolvedMentions.length > 0;
      groundedAnalysisMode = dispatch.mode === 'inspect' || groundingTools.isGroundedFileAnalysisRequest(message, exactFileContext);
      groundedRewriteMode = groundingTools.isGroundedFileRewriteRequest(message, exactFileContext);
      if (groundedRewriteMode && wantsGroundedFullFileOutput(message)) {
        groundedRewriteFormat = 'full_file';
      }
    } else {
      const reusable = groundingTools.getReusableExactFileContext(message);
      if (reusable && reusable.contextBlock) {
        exactFileContext = reusable;
        hasExactFileContext = true;
        groundedAnalysisMode = dispatch.mode === 'inspect' ? true : groundingTools.isGroundedFileAnalysisRequest(message, exactFileContext);
        groundedRewriteMode = groundingTools.isGroundedFileRewriteRequest(message, exactFileContext);
        if (groundedRewriteMode && wantsGroundedFullFileOutput(message)) {
          groundedRewriteFormat = 'full_file';
        }
      }
    }

    if (dispatch.mode === 'generate') {
      if (hasExactFileContext && dispatch.rewriteIntent) {
        groundedAnalysisMode = true;
        groundedRewriteMode = true;
      }
    }

    const finalHistory = (groundedAnalysisMode && (dispatch.mode === 'inspect' || groundedRewriteMode))
      ? [{ role: 'user', content: message }]
      : history;
    const configuredCoderSystemPrompt = String(cfg?.coderSystemPrompt || '').trim();
    const modeSystemPrompt = dispatch.mode === 'inspect'
      ? CODING_INSPECT_PROMPT
      : CODING_GENERATE_PROMPT;
    finalHistory.unshift({
      role: 'system',
      content: configuredCoderSystemPrompt || CODING_SYSTEM_PROMPT
    });
    finalHistory.unshift({ role: 'system', content: modeSystemPrompt });
    if (groundedAnalysisMode) {
      finalHistory.unshift({ role: 'system', content: GROUNDED_FILE_ANALYSIS_PROMPT });
      if (groundedRewriteMode) {
        finalHistory.unshift({
          role: 'system',
          content: groundedRewriteFormat === 'full_file'
            ? GROUNDED_FILE_FULL_REWRITE_PROMPT
            : GROUNDED_FILE_REWRITE_PROMPT
        });
      }
    }

    if (hasExactFileContext && exactFileContext?.contextBlock) {
      finalHistory.unshift({
        role: 'system',
        content:
          'Authoritative file snapshot (use this as source-of-truth for requested file analysis). ' +
          'Do NOT invent file content outside this snapshot.\n\n' +
          exactFileContext.contextBlock
      });
      sources.push(...(exactFileContext.sources || []));
    }

    if (isProjectFilenameVerificationRequest(message)) {
      const fileEvidence = buildProjectRootFileEvidence({
        projectPath,
        exactFileContext
      });
      if (fileEvidence) {
        finalHistory.unshift({
          role: 'system',
          content: fileEvidence
        });
      }
    }

    if (dispatch.mode === 'inspect' && isProjectFilenameVerificationRequest(message)) {
      const deterministic = buildDeterministicProjectFilenameVerification({
        projectPath,
        exactFileContext
      });
      if (deterministic) {
        return prepareHelpers.buildDeterministicPrepareResult({
          modelName: 'deterministic-filename-verify',
          deterministic,
          shortHash,
          turnContext,
          message,
          grounding: groundedAnalysisMode
            ? { enabled: true, rewriteMode: false, rewriteFormat: null, exactFileContext }
            : null,
          dispatch: {
            mode: 'inspect',
            used: false,
            reason: 'deterministic-project-filename-verify',
            rewriteIntent: dispatch.rewriteIntent,
            inspectIntent: dispatch.inspectIntent
          }
        });
      }
    }

    const deterministicPlannerToolResult = deterministicRegistry.resolveDeterministicPrepare({
      prepareHelpers,
      shortHash,
      turnContext,
      message,
      projectPath,
      dispatch,
      config: cfg,
      onMatch: (match) => {
        pipelineTools.appendPipelineEvent({
          kind: 'deterministic.registry.match',
          requestId: turnContext.requestId,
          traceId: turnContext.traceId,
          match
        });
      },
      builders: {
        buildDeterministicPlanCreate,
        buildDeterministicPlanValidate,
        buildDeterministicPlanExecuteStep,
        buildDeterministicPlanVerify,
        buildDeterministicPlanRunStart,
        buildDeterministicPlanRunStep,
        buildDeterministicPlanRunAuto,
        buildDeterministicPlanRunStatus,
        buildDeterministicPlanRunVerify,
        buildDeterministicToolRunTests,
        buildDeterministicToolReadFile,
        buildDeterministicToolWriteFile,
        buildDeterministicToolVerify
      }
    });
    if (deterministicPlannerToolResult) return deterministicPlannerToolResult;

    if (cfg?.deterministicFileRead === true && dispatch.mode === 'generate' && hasExactFileContext && groundedRewriteMode) {
      const deterministicReplace = buildDeterministicReplacementApply({
        message,
        exactFileContext
      });
      if (deterministicReplace) {
        return prepareHelpers.buildDeterministicPrepareResult({
          modelName: 'deterministic-replacement-apply',
          deterministic: deterministicReplace,
          shortHash,
          turnContext,
          message,
          grounding: groundedAnalysisMode
            ? { enabled: true, rewriteMode: true, rewriteFormat: 'full_file', exactFileContext }
            : null,
          dispatch: {
            mode: 'generate',
            used: false,
            reason: 'deterministic-replacement-apply',
            rewriteIntent: dispatch.rewriteIntent,
            inspectIntent: dispatch.inspectIntent,
            strictOutput: 'full_file'
          }
        });
      }

      const deterministicIntegration = buildDeterministicIntegrationFixApply({
        message,
        projectPath,
        exactFileContext
      });
      if (deterministicIntegration) {
        return prepareHelpers.buildDeterministicPrepareResult({
          modelName: 'deterministic-integration-apply',
          deterministic: deterministicIntegration,
          shortHash,
          turnContext,
          message,
          grounding: groundedAnalysisMode
            ? { enabled: true, rewriteMode: true, rewriteFormat: 'full_file', exactFileContext }
            : null,
          dispatch: {
            mode: 'generate',
            used: false,
            reason: 'deterministic-integration-apply',
            rewriteIntent: dispatch.rewriteIntent,
            inspectIntent: dispatch.inspectIntent,
            strictOutput: 'full_file'
          }
        });
      }
    }

    const bypassRouterForSmalltalk = normalizeRouterModeConfig(cfg) === 'on' && isRouterSmalltalkPrompt(message);

    if (!hasExactFileContext && !testMode) {
      const rag = await tryGetRagContext(message);
      if (rag.results && rag.results.length > 0) {
        const contextBlock = rag.results
          .slice(0, 3)
          .map((r) => `# ${r.metadata?.filePath || 'unknown'}\n${r.metadata?.text || ''}`)
          .join('\n\n');
        finalHistory.unshift({
          role: 'system',
          content: `Use this project context when helpful:\n\n${contextBlock}`
        });
        sources.push(...rag.results);
      }
    }

    let route = await routingHelpers.resolveRouteForMessage({
      bypassRouterForSmalltalk,
      message,
      selectedModel,
      modelTools,
      modelNames,
      groundedAnalysisMode,
      hasExactFileContext,
      turnContext
    });
    const routerMode = normalizeRouterModeConfig(cfg);
    const strictRouter = await routingHelpers.enforceRouterStrictMode({
      routerMode,
      route,
      message,
      cfg,
      dispatch,
      shortHash,
      runRouterDirectTurn,
      prepareHelpers,
      turnContext
    });
    if (!strictRouter.ok) {
      return strictRouter.result;
    }
    route = strictRouter.route;
    route = routingHelpers.applyLargeProgramUpgrade({
      route,
      message,
      pipelineTools,
      turnContext
    });
    const routedModel = route?.modelName || selectedModel;
    applyRouterRewriteToHistory(finalHistory, route, message, {
      hasExactFileContext,
      groundedRewriteMode
    });
    const effectiveUserMessage = getEffectiveUserMessage(finalHistory);
    const routerRewrite = String(route?.rewrittenMessage || '');
    ragDebugLog('prepare-chat', {
      model: routedModel,
      dispatchMode: dispatch.mode,
      exactFileContext: hasExactFileContext,
      sources: sources.length,
      sourceList: summarizeRagSources(sources)
    });
    const generationOptions = buildGenerationOptions({
      config: cfg,
      groundedRewriteMode,
      dispatchMode: dispatch.mode
    });
    routingHelpers.applyLargeProgramGenerationOptions(route, generationOptions);

    return {
      success: true,
      modelName: routedModel,
      messages: finalHistory,
      sources,
      generationOptions,
      routingDebug: {
        requestId: turnContext.requestId,
        traceId: turnContext.traceId,
        sessionId: turnContext.sessionId,
        terminalId: turnContext.terminalId,
        originalHash: shortHash(message),
        originalLen: String(message || '').length,
        rewriteHash: route?.used && routerRewrite ? shortHash(routerRewrite) : '',
        rewriteLen: route?.used && routerRewrite ? routerRewrite.length : 0,
        effectiveHash: shortHash(effectiveUserMessage),
        effectiveLen: effectiveUserMessage.length
      },
      grounding: groundedAnalysisMode
        ? { enabled: true, rewriteMode: groundedRewriteMode, rewriteFormat: groundedRewriteFormat, exactFileContext }
        : null,
      dispatch: {
        ...(route || null),
        mode: dispatch.mode,
        rewriteIntent: dispatch.rewriteIntent,
        inspectIntent: dispatch.inspectIntent,
        coderSelectionReason
      },
      pipeline: turnContext
    };
  }

  return { prepareChatRequest };
}

module.exports = createChatPrepareTool;
