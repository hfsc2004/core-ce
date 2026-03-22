'use strict';

function isLargeProgramBuildRequest(message) {
  const text = String(message || '').toLowerCase();
  if (!text) return false;
  const createVerb = /\b(write|create|build|implement|develop|make|generate)\b/.test(text);
  const appNoun = /\b(game|application|app|platform|system|engine|website|site)\b/.test(text);
  const complexity = /\b(animated|animation|full|complete|end-to-end|from scratch|multi-file|ui)\b/.test(text);
  return (createVerb && appNoun) || (createVerb && complexity);
}

function buildLargeProgramContractRewrite(message) {
  const user = String(message || '').trim();
  const userLc = user.toLowerCase();
  const stackSpecified =
    /\b(python|tkinter|pygame|flask|fastapi|java|c\+\+|c#|rust|go|node|react|vue|svelte|unity|unreal)\b/.test(userLc);
  const runtimeDirective = stackSpecified
    ? 'Use only the stack explicitly requested by the user.'
    : 'No stack was explicitly requested. Default to a browser implementation using only HTML/CSS/JavaScript.';
  const fileSchema = stackSpecified
    ? (
      'Return full runnable files only using this exact schema:\n' +
      '###FILE:<relative/path>\n' +
      '```<language>\n' +
      '<complete file content>\n' +
      '```'
    )
    : (
      'Return exactly these files using this exact schema:\n' +
      '###FILE:index.html\n```html\n...\n```\n' +
      '###FILE:styles.css\n```css\n...\n```\n' +
      '###FILE:script.js\n```javascript\n...\n```\n' +
      'After script.js, output a single line with exactly: ###END'
    );
  return (
    `User request: ${user}\n\n` +
    'Translate this into a phased implementation contract and execute in order.\n' +
    'Phase 1 (Architecture): define file map, runtime approach, and data model.\n' +
    'Phase 2 (Core logic): implement core engine/components.\n' +
    'Phase 3 (UI behavior): implement interactions and requested animations.\n' +
    'Phase 4 (Validation): include sanity checks and manual test checklist.\n\n' +
    `${runtimeDirective}\n` +
    'Do not output prose outside file blocks. Do not output diffs.\n' +
    `${fileSchema}\n` +
    'All code must be internally consistent and runnable together.'
  );
}

async function resolveRouteForMessage({
  bypassRouterForSmalltalk,
  message,
  selectedModel,
  modelTools,
  modelNames,
  groundedAnalysisMode,
  hasExactFileContext,
  turnContext
}) {
  if (bypassRouterForSmalltalk) {
    return {
      used: false,
      reason: 'router-smalltalk-bypass',
      modelName: selectedModel,
      rewrittenMessage: String(message || ''),
      routerParseMode: 'local-bypass'
    };
  }
  return modelTools.routeModelViaRouter({
    message,
    selectedModel,
    modelNames,
    groundedAnalysisMode,
    hasExactFileContext,
    pipelineContext: turnContext
  });
}

async function enforceRouterStrictMode({
  routerMode,
  route,
  message,
  cfg,
  dispatch,
  shortHash,
  runRouterDirectTurn,
  prepareHelpers,
  turnContext
}) {
  if (routerMode !== 'on') return { ok: true, route };

  const currentRewrite = String(route?.rewrittenMessage || '').trim();
  const rawUser = String(message || '').trim();
  const parseMode = String(route?.routerParseMode || '').trim().toLowerCase();
  const allowSmalltalkBypass = String(route?.reason || '').trim() === 'router-smalltalk-bypass';
  const isStructuredPassThrough = (
    !!route?.used &&
    !!route?.contractOk &&
    parseMode === 'json' &&
    !!currentRewrite &&
    currentRewrite === rawUser
  );
  if (allowSmalltalkBypass || (route?.used && currentRewrite && (currentRewrite !== rawUser || isStructuredPassThrough))) {
    return { ok: true, route };
  }

  const reason = String(route?.reason || 'router-translation-invalid').trim();
  const strictDetails = prepareHelpers.buildRouterStrictDetails({
    shortHash,
    message,
    route
  });
  const parseModeLabel = strictDetails.parseModeLabel;
  const details = strictDetails.details;
  const routerDirect = await runRouterDirectTurn(message, cfg);
  if (routerDirect?.success) {
    return {
      ok: false,
      result: prepareHelpers.buildDeterministicPrepareResult({
        modelName: routerDirect.modelName || 'router',
        deterministic: {
          content: String(routerDirect.content || ''),
          sources: []
        },
        shortHash,
        turnContext,
        message,
        rewrittenMessage: String(route?.rewrittenMessage || message),
        grounding: null,
        dispatch: {
          mode: dispatch.mode || 'generate',
          used: true,
          reason: 'router-direct-fallback',
          dispatcherModel: routerDirect.modelName || '',
          dispatcherPort: routerDirect.routerPort || null,
          rewriteIntent: dispatch.rewriteIntent,
          inspectIntent: dispatch.inspectIntent,
          taskMode: dispatch.mode || 'generate',
          strictOutput: 'none',
          rewrittenMessage: String(message || ''),
          rewriteSource: 'router-direct-fallback',
          routerParseMode: parseModeLabel,
          translationOnly: false
        }
      })
    };
  }
  return {
    ok: false,
    result: {
      success: false,
      error: `[router-strict-v2] Router is On (strict). Translation failed or was invalid (${reason}), and router direct-answer fallback also failed (${String(routerDirect?.error || 'unknown')}).${details.join('')}`
    }
  };
}

function applyLargeProgramUpgrade({
  route,
  message,
  pipelineTools,
  turnContext
}) {
  const rawUserForUpgrade = String(message || '').trim();
  const rawRewriteForUpgrade = String(route?.rewrittenMessage || '').trim();
  const largeBuildRequest = isLargeProgramBuildRequest(rawUserForUpgrade);
  if (
    largeBuildRequest &&
    (
      !rawRewriteForUpgrade ||
      rawRewriteForUpgrade.toLowerCase() === rawUserForUpgrade.toLowerCase() ||
      rawRewriteForUpgrade.length < Math.min(80, Math.max(24, Math.floor(rawUserForUpgrade.length * 0.7)))
    )
  ) {
    const upgradedRewrite = buildLargeProgramContractRewrite(rawUserForUpgrade);
    const nextRoute = {
      ...(route || {}),
      used: true,
      reason: 'router-large-program-local-upgrade',
      rewrittenMessage: upgradedRewrite,
      taskMode: 'generate',
      strictOutput: 'full_file',
      intentClass: 'build_large_program',
      executionStrategy: 'phased_plan_then_code',
      rewriteSource: 'router-local-large-program-fallback',
      routerParseMode: String(route?.routerParseMode || '').trim() || 'local-upgrade'
    };
    pipelineTools.appendPipelineEvent({
      kind: 'router.local-upgrade',
      requestId: turnContext.requestId,
      traceId: turnContext.traceId,
      reason: 'large-program-upgrade',
      originalLen: rawUserForUpgrade.length,
      rewriteLen: upgradedRewrite.length
    });
    return nextRoute;
  }
  return route;
}

function applyLargeProgramGenerationOptions(route, generationOptions) {
  if (
    String(route?.strictOutput || '').toLowerCase() === 'full_file' &&
    String(route?.rewriteSource || '') === 'router-local-large-program-fallback' &&
    /###END/i.test(String(route?.rewrittenMessage || ''))
  ) {
    const currentPredict = Number(generationOptions?.num_predict);
    if (!Number.isFinite(currentPredict) || currentPredict < 4096) {
      generationOptions.num_predict = 4096;
    }
    const stopSeq = new Set(Array.isArray(generationOptions?.stop) ? generationOptions.stop : []);
    stopSeq.add('###END');
    generationOptions.stop = Array.from(stopSeq);
  }
  return generationOptions;
}

function buildRouterSmalltalkDeterministicResult({
  routerSmalltalk,
  prepareHelpers,
  shortHash,
  turnContext,
  message
}) {
  return prepareHelpers.buildDeterministicPrepareResult({
    modelName: routerSmalltalk.modelName || 'router',
    deterministic: {
      content: String(routerSmalltalk.content || ''),
      sources: []
    },
    shortHash,
    turnContext,
    message,
    rewrittenMessage: message,
    grounding: null,
    dispatch: {
      mode: 'inspect',
      used: true,
      reason: 'router-smalltalk-direct',
      dispatcherModel: routerSmalltalk.modelName || '',
      dispatcherPort: routerSmalltalk.routerPort || null,
      rewriteIntent: false,
      inspectIntent: false,
      taskMode: 'inspect',
      strictOutput: 'none',
      rewrittenMessage: String(message || ''),
      rewriteSource: 'router-direct-chat',
      routerParseMode: 'direct-chat',
      translationOnly: false
    }
  });
}

module.exports = {
  isLargeProgramBuildRequest,
  resolveRouteForMessage,
  enforceRouterStrictMode,
  applyLargeProgramUpgrade,
  applyLargeProgramGenerationOptions,
  buildRouterSmalltalkDeterministicResult
};
