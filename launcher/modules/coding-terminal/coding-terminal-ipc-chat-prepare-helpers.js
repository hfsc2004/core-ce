/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
'use strict';

function buildRoutingDebug({ shortHash, turnContext, message, rewrittenMessage = '' }) {
  const msg = String(message || '');
  const rewrite = String(rewrittenMessage || '');
  return {
    requestId: turnContext.requestId,
    traceId: turnContext.traceId,
    sessionId: turnContext.sessionId,
    terminalId: turnContext.terminalId,
    originalHash: shortHash(msg),
    originalLen: msg.length,
    rewriteHash: rewrite ? shortHash(rewrite) : '',
    rewriteLen: rewrite ? rewrite.length : 0,
    effectiveHash: shortHash(msg),
    effectiveLen: msg.length
  };
}

function buildDeterministicPrepareResult({
  modelName,
  deterministic,
  shortHash,
  turnContext,
  message,
  rewrittenMessage,
  grounding,
  dispatch
}) {
  return {
    success: true,
    modelName,
    messages: [],
    sources: deterministic?.sources || [],
    generationOptions: {},
    deterministicResult: deterministic,
    routingDebug: buildRoutingDebug({
      shortHash,
      turnContext,
      message,
      rewrittenMessage
    }),
    grounding: grounding || null,
    dispatch,
    pipeline: turnContext
  };
}

function buildRouterStrictDetails({ shortHash, message, route }) {
  const rawUser = String(message || '').trim();
  const currentRewrite = String(route?.rewrittenMessage || '').trim();
  const parseMode = String(route?.routerParseMode || '').trim().toLowerCase();
  const parseModeLabel = parseMode || 'unknown';
  const rawPreview = String(route?.routerRawPreview || '').trim();
  const rewritePreview = String(route?.routerRewritePreview || currentRewrite || '').trim();
  const rawHash = shortHash(rawUser);
  const rewriteHash = shortHash(currentRewrite);
  const rawLen = rawUser.length;
  const rewriteLen = currentRewrite.length;
  const routerError = String(route?.routerError || '').trim();

  const details = [
    ` parser=${parseModeLabel}`,
    ` raw=${rawHash}/${rawLen}`,
    ` rewrite=${rewriteHash}/${rewriteLen}`
  ];
  if (routerError) details.push(` routerError="${routerError}"`);
  if (rawPreview) details.push(` routerRaw="${rawPreview}"`);
  if (rewritePreview) details.push(` routerRewrite="${rewritePreview}"`);

  return {
    details,
    parseMode,
    parseModeLabel,
    rawUser,
    currentRewrite
  };
}

module.exports = {
  buildRoutingDebug,
  buildDeterministicPrepareResult,
  buildRouterStrictDetails
};
