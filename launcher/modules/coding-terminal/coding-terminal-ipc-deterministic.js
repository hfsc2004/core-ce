/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * PSF Coding Terminal - IPC Deterministic Helpers
 */

'use strict';

const createDeterministicFileHelpers = require('./coding-terminal-ipc-deterministic-file-helpers');
const createDeterministicPlanHelpers = require('./coding-terminal-ipc-deterministic-plan-helpers');
const createDeterministicToolHelpers = require('./coding-terminal-ipc-deterministic-tool-helpers');

function createDeterministicHelpers(deps = {}) {
  const fs = deps.fs;
  const path = deps.path;
  const execFileSync = typeof deps?.execFileSync === 'function' ? deps.execFileSync : null;
  const appendPipelineEvent = typeof deps?.appendPipelineEvent === 'function'
    ? deps.appendPipelineEvent
    : null;
  const planState = {
    setLatestPlanContract: typeof deps?.setLatestPlanContract === 'function' ? deps.setLatestPlanContract : () => {},
    getLatestPlanContract: typeof deps?.getLatestPlanContract === 'function' ? deps.getLatestPlanContract : () => null,
    startPlanRun: typeof deps?.startPlanRun === 'function' ? deps.startPlanRun : () => null,
    getPlanRun: typeof deps?.getPlanRun === 'function' ? deps.getPlanRun : () => null,
    getLatestPlanRun: typeof deps?.getLatestPlanRun === 'function' ? deps.getLatestPlanRun : () => null,
    listPlanRuns: typeof deps?.listPlanRuns === 'function' ? deps.listPlanRuns : () => [],
    updatePlanRunStep: typeof deps?.updatePlanRunStep === 'function' ? deps.updatePlanRunStep : () => null,
    resolveExecutablePlanStep: typeof deps?.resolveExecutablePlanStep === 'function' ? deps.resolveExecutablePlanStep : () => null,
    setPlanRunStatus: typeof deps?.setPlanRunStatus === 'function' ? deps.setPlanRunStatus : () => null
  };

  function emitPlanTrace(summary, payload = {}) {
    if (!appendPipelineEvent) return;
    try {
      appendPipelineEvent({
        kind: 'deterministic.plan',
        summary: String(summary || 'deterministic plan event'),
        payload
      });
    } catch {}
  }

  function wantsGroundedFullFileOutput(message) {
    const text = String(message || '').toLowerCase();
    return /(reprint|print|output|return).*(whole|full|entire).*(file|files)|full file|whole file|entire file|reprint the files/i.test(text);
  }

  function isProjectFilenameVerificationRequest(message) {
    const text = String(message || '').toLowerCase();
    return (
      /(verify|check|validate|compare|match|mismatch(?:es)?|look for mismatches?).*(linked|link|filename|file ?name|file reference|references?)/i.test(text) ||
      /(existing filenames?|actual files?|project root|project folder)/i.test(text)
    );
  }

  function isDeterministicIntegrationFixRequest(message) {
    const text = String(message || '').toLowerCase();
    return (
      /\bintegration issues?\b/.test(text) ||
      /encoding|charset/.test(text) ||
      /viewport|device-?width|whdth/.test(text) ||
      /file refs?|file references?|linked filenames?/.test(text) ||
      /\bid\b|element id/.test(text)
    );
  }

  function applyRouterRewriteToHistory(history, route) {
    if (!Array.isArray(history) || history.length === 0) return;
    const rewrite = String(route?.rewrittenMessage || '').trim();
    if (!rewrite || rewrite.length < 12) return;
    for (let i = history.length - 1; i >= 0; i -= 1) {
      if (history[i]?.role === 'user') {
        history[i] = {
          ...history[i],
          content: rewrite
        };
        return;
      }
    }
  }

  function getEffectiveUserMessage(history = []) {
    for (let i = history.length - 1; i >= 0; i -= 1) {
      if (history[i]?.role === 'user') return String(history[i].content || '');
    }
    return '';
  }

  const fileHelpers = createDeterministicFileHelpers({
    fs,
    path,
    isDeterministicIntegrationFixRequest
  });

  const planHelpers = createDeterministicPlanHelpers({
    emitPlanTrace,
    planState
  });

  const toolHelpers = createDeterministicToolHelpers({
    fs,
    path,
    execFileSync,
    emitPlanTrace,
    languageFromFilename: fileHelpers.languageFromFilename
  });

  return {
    wantsGroundedFullFileOutput,
    isProjectFilenameVerificationRequest,
    buildProjectRootFileEvidence: fileHelpers.buildProjectRootFileEvidence,
    extractLinkedFilenamesFromContext: fileHelpers.extractLinkedFilenamesFromContext,
    buildDeterministicProjectFilenameVerification: fileHelpers.buildDeterministicProjectFilenameVerification,
    buildDeterministicReplacementApply: fileHelpers.buildDeterministicReplacementApply,
    buildDeterministicIntegrationFixApply: fileHelpers.buildDeterministicIntegrationFixApply,
    buildDeterministicPlanCreate: planHelpers.buildDeterministicPlanCreate,
    buildDeterministicPlanValidate: planHelpers.buildDeterministicPlanValidate,
    buildDeterministicPlanExecuteStep: planHelpers.buildDeterministicPlanExecuteStep,
    buildDeterministicPlanVerify: planHelpers.buildDeterministicPlanVerify,
    buildDeterministicPlanRunStart: planHelpers.buildDeterministicPlanRunStart,
    buildDeterministicPlanRunStep: planHelpers.buildDeterministicPlanRunStep,
    buildDeterministicPlanRunAuto: planHelpers.buildDeterministicPlanRunAuto,
    buildDeterministicPlanRunStatus: planHelpers.buildDeterministicPlanRunStatus,
    buildDeterministicPlanRunVerify: planHelpers.buildDeterministicPlanRunVerify,
    buildDeterministicToolRunTests: toolHelpers.buildDeterministicToolRunTests,
    buildDeterministicToolReadFile: toolHelpers.buildDeterministicToolReadFile,
    buildDeterministicToolWriteFile: toolHelpers.buildDeterministicToolWriteFile,
    buildDeterministicToolListFiles: toolHelpers.buildDeterministicToolListFiles,
    buildDeterministicToolSearchCode: toolHelpers.buildDeterministicToolSearchCode,
    buildDeterministicToolReadFileChunk: toolHelpers.buildDeterministicToolReadFileChunk,
    buildDeterministicToolApplyPatch: toolHelpers.buildDeterministicToolApplyPatch,
    buildDeterministicToolVerify: toolHelpers.buildDeterministicToolVerify,
    applyRouterRewriteToHistory,
    getEffectiveUserMessage
  };
}

module.exports = createDeterministicHelpers;
