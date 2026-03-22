/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * PSF Coding Terminal - Grounding facade
 */

const analyzers = require('./coding-terminal-ipc-grounding-analyzers');
const createGroundingResolver = require('./coding-terminal-ipc-grounding-resolver');
const createGroundingValidation = require('./coding-terminal-ipc-grounding-validation');
const createGroundingDeterministic = require('./coding-terminal-ipc-grounding-deterministic');

function createGroundingTools(deps = {}) {
  const resolver = createGroundingResolver({
    ...deps,
    analyzers
  });

  const validation = createGroundingValidation({ analyzers });

  const deterministic = createGroundingDeterministic({
    ...deps,
    resolver,
    analyzers
  });

  return {
    tryGetExactFileContext: resolver.tryGetExactFileContext,
    tryHandleDeterministicFileRequest: deterministic.tryHandleDeterministicFileRequest,
    extractFileMentions: resolver.extractFileMentions,
    getReusableExactFileContext: resolver.getReusableExactFileContext,
    buildExactFileResolutionError: resolver.buildExactFileResolutionError,
    isGroundedFileAnalysisRequest: validation.isGroundedFileAnalysisRequest,
    isGroundedFileRewriteRequest: validation.isGroundedFileRewriteRequest,
    validateGroundedAnalysis: validation.validateGroundedAnalysis,
    buildGroundingFailureMessage: validation.buildGroundingFailureMessage
  };
}

module.exports = createGroundingTools;
