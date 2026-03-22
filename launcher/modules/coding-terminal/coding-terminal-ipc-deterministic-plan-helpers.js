/**
 * Coding Terminal deterministic plan/run helpers.
 */
'use strict';

function createDeterministicPlanHelpers(deps = {}) {
  const emitPlanTrace = typeof deps.emitPlanTrace === 'function' ? deps.emitPlanTrace : () => {};
  const planState = deps.planState || {};

  function inferStepType(actionText) {
    const action = String(actionText || '').toLowerCase();
    if (/(verify|test|assert|check|validate)/.test(action)) return 'verify';
    if (/(inspect|read|list|analy[sz]e|diff)/.test(action)) return 'deterministic';
    return 'coder';
  }

  function isPlanCreateRequest(message) {
    const text = String(message || '').toLowerCase();
    return (
      /\b(plan|orchestrate|sequence|roadmap)\b/.test(text) ||
      /\bbreak\s+.*\s+into\s+steps\b/.test(text) ||
      /\bstep[- ]by[- ]step\b/.test(text)
    );
  }

  function isPlanValidateRequest(message) {
    const text = String(message || '').toLowerCase();
    return (
      /\b(validate|verify|check)\b.*\b(plan|contract|steps)\b/.test(text) ||
      /\bplan\b.*\b(valid|invalid)\b/.test(text)
    );
  }

  function isPlanExecuteStepRequest(message) {
    const text = String(message || '').toLowerCase();
    return /\b(execute|run|perform|do)\b\s+step\s+([0-9]+|s[0-9]+)/.test(text);
  }

  function isPlanVerifyRequest(message) {
    const text = String(message || '').toLowerCase();
    return /\b(verify|check)\b.*\b(plan execution|execution|completion|outcome)\b/.test(text);
  }

  function extractPlanJsonFromText(message) {
    const input = String(message || '');
    if (!input) return null;
    const fenced = input.match(/```json\s*([\s\S]*?)```/i);
    if (fenced && fenced[1]) {
      try { return JSON.parse(fenced[1]); } catch {}
    }
    const tagged = input.match(/IRG_PLAN_JSON\s*:\s*(\{[\s\S]*\})/i);
    if (tagged && tagged[1]) {
      try { return JSON.parse(tagged[1]); } catch {}
    }
    const first = input.indexOf('{');
    const last = input.lastIndexOf('}');
    if (first >= 0 && last > first) {
      const raw = input.slice(first, last + 1);
      try { return JSON.parse(raw); } catch {}
    }
    return null;
  }

  function normalizePlanContract(rawPlan = {}, fallbackGoal = '') {
    const goal = String(rawPlan?.goal || fallbackGoal || '').trim();
    const rawSteps = Array.isArray(rawPlan?.steps) ? rawPlan.steps : [];
    const steps = rawSteps
      .map((step, index) => {
        const id = String(step?.id || `S${index + 1}`).trim() || `S${index + 1}`;
        const action = String(step?.action || '').trim();
        const type = String(step?.type || '').trim().toLowerCase();
        const dependsOn = Array.isArray(step?.dependsOn)
          ? step.dependsOn.map((v) => String(v || '').trim()).filter(Boolean)
          : [];
        const acceptance = String(step?.acceptance || '').trim() || `Step ${id} output is present and non-empty.`;
        return {
          id,
          action,
          type: ['deterministic', 'coder', 'verify'].includes(type) ? type : inferStepType(action),
          dependsOn,
          acceptance
        };
      })
      .filter((step) => step.action);

    return {
      contractVersion: '1.0',
      goal,
      steps,
      finalAcceptance: String(rawPlan?.finalAcceptance || '').trim() || 'All steps pass acceptance criteria.'
    };
  }

  function extractPlanStepCandidates(message) {
    const input = String(message || '').trim();
    if (!input) return [];
    const withoutPreamble = input.replace(/^[^\n:]*:\s*/i, '').trim();
    const clauses = withoutPreamble
      .split(/\n|;|->|\bthen\b|\bnext\b|\bafter that\b|\bfinally\b/gi)
      .map((part) => part.trim())
      .filter(Boolean);
    const unique = [];
    const seen = new Set();
    for (const clause of clauses) {
      const clean = clause.replace(/^[0-9]+[.)]\s*/, '').trim();
      if (!clean || clean.length < 6) continue;
      const key = clean.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(clean);
      if (unique.length >= 8) break;
    }
    return unique;
  }

  function buildDeterministicPlanCreate({ message, projectPath = '' } = {}) {
    if (!isPlanCreateRequest(message)) return null;
    const goal = String(message || '').replace(/\s+/g, ' ').trim();
    const candidates = extractPlanStepCandidates(message);
    const fallbackSteps = [
      `Inspect current codebase context${projectPath ? ` under ${projectPath}` : ''} and identify target files.`,
      'Implement the requested behavior in minimal, testable increments.',
      'Run verification checks (build/test/lint or deterministic validation) and capture failures.',
      'Apply fixes for any failed checks and summarize final change set.'
    ];
    const stepActions = candidates.length > 0 ? candidates : fallbackSteps;
    const steps = stepActions.map((action, idx) => ({
      id: `S${idx + 1}`,
      type: inferStepType(action),
      action,
      dependsOn: idx === 0 ? [] : [`S${idx}`],
      acceptance: `Step S${idx + 1} output is concrete and reviewable.`
    }));
    const contract = normalizePlanContract({
      goal,
      steps,
      finalAcceptance: 'Requested behavior implemented and verified.'
    }, goal);
    planState.setLatestPlanContract(contract);
    emitPlanTrace('plan.create', {
      goal: contract.goal || '',
      steps: Array.isArray(contract.steps) ? contract.steps.length : 0
    });
    return {
      content:
        'Deterministic planner generated a step contract.\n\n' +
        '~~~json\n' +
        `${JSON.stringify(contract, null, 2)}\n` +
        '~~~',
      sources: []
    };
  }

  function buildDeterministicPlanValidate({ message } = {}) {
    if (!isPlanValidateRequest(message)) return null;
    const parsed = extractPlanJsonFromText(message);
    if (!parsed) {
      return {
        content: 'Plan validation: FAIL\nReason: no parsable JSON plan found in request.',
        sources: []
      };
    }
    const contract = normalizePlanContract(parsed, String(parsed?.goal || ''));
    planState.setLatestPlanContract(contract);
    const issues = [];
    if (!contract.goal) issues.push('missing goal');
    if (!Array.isArray(contract.steps) || contract.steps.length === 0) issues.push('missing steps');
    const ids = new Set();
    for (const step of contract.steps) {
      if (!step.id) issues.push('step missing id');
      if (step.id && ids.has(step.id)) issues.push(`duplicate step id: ${step.id}`);
      if (step.id) ids.add(step.id);
      if (!step.action) issues.push(`step ${step.id || '?'} missing action`);
      if (!step.acceptance) issues.push(`step ${step.id || '?'} missing acceptance`);
      for (const dep of step.dependsOn || []) {
        if (!ids.has(dep) && !contract.steps.some((s) => s.id === dep)) {
          issues.push(`step ${step.id || '?'} has unknown dependsOn: ${dep}`);
        }
      }
    }
    const resultLabel = issues.length ? 'FAIL' : 'PASS';
    emitPlanTrace('plan.validate', {
      result: resultLabel,
      issues: issues.slice(0, 8)
    });
    return {
      content:
        `Plan validation: ${resultLabel}` +
        (issues.length ? `\nIssues: ${issues.join('; ')}` : '') +
        '\n\nNormalized Contract:\n~~~json\n' +
        `${JSON.stringify(contract, null, 2)}\n` +
        '~~~',
      sources: []
    };
  }

  function buildDeterministicPlanExecuteStep({ message } = {}) {
    if (!isPlanExecuteStepRequest(message)) return null;
    const parsed = extractPlanJsonFromText(message);
    if (!parsed) {
      return {
        content: 'Step execution contract: FAIL\nReason: no parsable JSON plan found.',
        sources: []
      };
    }
    const contract = normalizePlanContract(parsed, String(parsed?.goal || ''));
    if (!contract.steps.length) {
      return {
        content: 'Step execution contract: FAIL\nReason: plan has no executable steps.',
        sources: []
      };
    }
    const match = String(message || '').toLowerCase().match(/\b(?:execute|run|perform|do)\b\s+step\s+([0-9]+|s[0-9]+)/);
    const token = String(match?.[1] || '1').toUpperCase();
    const targetId = token.startsWith('S') ? token : `S${token}`;
    const targetStep = contract.steps.find((s) => String(s.id || '').toUpperCase() === targetId) || contract.steps[0];
    const executionContract = {
      contractVersion: '1.0',
      goal: contract.goal,
      mode: 'execute_step',
      step: targetStep,
      prerequisites: (targetStep.dependsOn || []).map((id) => contract.steps.find((s) => s.id === id)).filter(Boolean),
      verification: targetStep.acceptance
    };
    return {
      content:
        `Deterministic execution contract prepared for ${targetStep.id}.\n\n` +
        '~~~json\n' +
        `${JSON.stringify(executionContract, null, 2)}\n` +
        '~~~',
      sources: []
    };
  }

  function buildDeterministicPlanVerify({ message } = {}) {
    if (!isPlanVerifyRequest(message)) return null;
    const parsed = extractPlanJsonFromText(message);
    if (!parsed) {
      return {
        content: 'Execution verification: FAIL\nReason: no parsable JSON plan found.',
        sources: []
      };
    }
    const contract = normalizePlanContract(parsed, String(parsed?.goal || ''));
    const missingAcceptance = contract.steps.filter((s) => !String(s.acceptance || '').trim()).map((s) => s.id);
    const unresolvedDeps = contract.steps
      .filter((s) => (s.dependsOn || []).some((dep) => !contract.steps.some((x) => x.id === dep)))
      .map((s) => s.id);
    const pass = missingAcceptance.length === 0 && unresolvedDeps.length === 0;
    return {
      content:
        `Execution verification: ${pass ? 'PASS' : 'FAIL'}` +
        (missingAcceptance.length ? `\nMissing acceptance in: ${missingAcceptance.join(', ')}` : '') +
        (unresolvedDeps.length ? `\nUnresolved dependencies in: ${unresolvedDeps.join(', ')}` : '') +
        '\n\nPlan Snapshot:\n~~~json\n' +
        `${JSON.stringify(contract, null, 2)}\n` +
        '~~~',
      sources: []
    };
  }

  function extractRunId(message) {
    const text = String(message || '').trim();
    const m = text.match(/\b(?:run(?:[_\-. ]?id)?|planrun)\s*[:=]?\s*([A-Za-z0-9_-]+)/i);
    return m ? String(m[1] || '').trim() : '';
  }

  function isPlanRunStartRequest(message) {
    const text = String(message || '').toLowerCase();
    return /\b(run\.start|start run|start plan run|begin plan run)\b/.test(text);
  }

  function isPlanRunStepRequest(message) {
    const text = String(message || '').toLowerCase();
    return /\b(run\.step|run step|execute next step|execute step)\b/.test(text);
  }

  function isPlanRunAutoRequest(message) {
    const text = String(message || '').toLowerCase();
    return /\b(run\.auto|run all steps|execute all steps|auto execute)\b/.test(text);
  }

  function isPlanRunStatusRequest(message) {
    const text = String(message || '').toLowerCase();
    return /\b(run\.status|plan run status|show run status|show plan runs)\b/.test(text);
  }

  function isPlanRunVerifyRequest(message) {
    const text = String(message || '').toLowerCase();
    return /\b(run\.verify|verify run|verify plan run)\b/.test(text);
  }

  function renderRunSummary(run) {
    if (!run) return 'No active plan run.';
    const steps = Array.isArray(run.steps) ? run.steps : [];
    const rows = steps.map((s) => {
      const out = String(s.output || '').trim();
      const shortOut = out ? ` | output=${out.slice(0, 120)}${out.length > 120 ? '…' : ''}` : '';
      return `- ${s.id} [${s.status}] ${s.action}${shortOut}`;
    });
    return [
      `Run: ${run.runId}`,
      `Status: ${run.status}`,
      `Goal: ${run.goal || '(none)'}`,
      `Steps: ${steps.length}`,
      '',
      ...rows
    ].join('\n');
  }

  function getPlanContractForRun(message) {
    const parsed = extractPlanJsonFromText(message);
    if (parsed) return normalizePlanContract(parsed, String(parsed?.goal || ''));
    const latest = planState.getLatestPlanContract();
    if (latest && typeof latest === 'object') {
      return normalizePlanContract(latest, String(latest?.goal || ''));
    }
    return null;
  }

  function buildDeterministicPlanRunStart({ message } = {}) {
    if (!isPlanRunStartRequest(message)) return null;
    const contract = getPlanContractForRun(message);
    if (!contract) {
      return {
        content: 'Plan run start: FAIL\nReason: no plan contract found. Create a plan first or include plan JSON.',
        sources: []
      };
    }
    planState.setLatestPlanContract(contract);
    const run = planState.startPlanRun(contract);
    if (!run) {
      return {
        content: 'Plan run start: FAIL\nReason: unable to initialize plan run state.',
        sources: []
      };
    }
    emitPlanTrace('run.start', {
      runId: run.runId,
      goal: run.goal || '',
      steps: Array.isArray(run.steps) ? run.steps.length : 0
    });
    return {
      content: `Plan run started.\n\n${renderRunSummary(run)}`,
      sources: []
    };
  }

  function buildDeterministicPlanRunStep({ message } = {}) {
    if (!isPlanRunStepRequest(message)) return null;
    const explicitRunId = extractRunId(message);
    const run = explicitRunId ? planState.getPlanRun(explicitRunId) : planState.getLatestPlanRun();
    if (!run) {
      return {
        content: 'Run step: FAIL\nReason: no active plan run. Use run.start first.',
        sources: []
      };
    }
    const stepMatch = String(message || '').toLowerCase().match(/\bstep\s+(s?\d+|next)\b/);
    const requested = String(stepMatch?.[1] || 'next').toUpperCase();
    const requestedId = requested === 'NEXT' ? '' : (requested.startsWith('S') ? requested : `S${requested}`);
    const step = planState.resolveExecutablePlanStep(run.runId, requestedId);
    if (!step) {
      emitPlanTrace('run.step.noop', { runId: run.runId });
      return {
        content: `Run step: PASS\nNo pending executable steps remain.\n\n${renderRunSummary(run)}`,
        sources: []
      };
    }
    const patched = planState.updatePlanRunStep(run.runId, step.id, {
      status: 'done',
      output: `deterministic step completed (${step.type})`
    });
    emitPlanTrace('run.step', {
      runId: run.runId,
      stepId: step.id,
      type: step.type || 'coder'
    });
    return {
      content: `Executed ${step.id}.\n\n${renderRunSummary(patched || run)}`,
      sources: []
    };
  }

  function buildDeterministicPlanRunAuto({ message } = {}) {
    if (!isPlanRunAutoRequest(message)) return null;
    const explicitRunId = extractRunId(message);
    let run = explicitRunId ? planState.getPlanRun(explicitRunId) : planState.getLatestPlanRun();
    if (!run) {
      return {
        content: 'Run auto: FAIL\nReason: no active plan run. Use run.start first.',
        sources: []
      };
    }
    let iterations = 0;
    while (iterations < 64) {
      const step = planState.resolveExecutablePlanStep(run.runId, '');
      if (!step) break;
      const next = planState.updatePlanRunStep(run.runId, step.id, {
        status: 'done',
        output: `deterministic auto-exec completed (${step.type})`
      });
      run = next || run;
      iterations += 1;
    }
    emitPlanTrace('run.auto', {
      runId: run.runId,
      executed: iterations
    });
    return {
      content: `Run auto complete. Steps executed: ${iterations}.\n\n${renderRunSummary(run)}`,
      sources: []
    };
  }

  function buildDeterministicPlanRunStatus({ message } = {}) {
    if (!isPlanRunStatusRequest(message)) return null;
    const explicitRunId = extractRunId(message);
    if (explicitRunId) {
      const run = planState.getPlanRun(explicitRunId);
      if (!run) {
        return {
          content: `Run status: FAIL\nReason: run not found (${explicitRunId}).`,
          sources: []
        };
      }
      return {
        content: renderRunSummary(run),
        sources: []
      };
    }
    const latest = planState.getLatestPlanRun();
    const runs = planState.listPlanRuns(8);
    const lines = [];
    if (latest) {
      lines.push('Latest Run');
      lines.push(renderRunSummary(latest));
      lines.push('');
    }
    lines.push('Recent Runs');
    if (!runs.length) {
      lines.push('- none');
    } else {
      for (const row of runs) {
        lines.push(`- ${row.runId} [${row.status}] done=${row.stepsDone}/${row.stepsTotal} goal=${row.goal || '(none)'}`);
      }
    }
    return {
      content: lines.join('\n'),
      sources: []
    };
  }

  function buildDeterministicPlanRunVerify({ message } = {}) {
    if (!isPlanRunVerifyRequest(message)) return null;
    const explicitRunId = extractRunId(message);
    const run = explicitRunId ? planState.getPlanRun(explicitRunId) : planState.getLatestPlanRun();
    if (!run) {
      return {
        content: 'Run verify: FAIL\nReason: no active plan run.',
        sources: []
      };
    }
    const pending = (run.steps || []).filter((s) => s.status !== 'done');
    const failed = (run.steps || []).filter((s) => s.status === 'failed');
    const pass = pending.length === 0 && failed.length === 0;
    if (pass) {
      planState.setPlanRunStatus(run.runId, 'done');
    }
    emitPlanTrace('run.verify', {
      runId: run.runId,
      pass,
      pending: pending.length,
      failed: failed.length
    });
    const latest = planState.getPlanRun(run.runId) || run;
    return {
      content:
        `Run verify: ${pass ? 'PASS' : 'FAIL'}` +
        (pending.length ? `\nPending: ${pending.map((s) => s.id).join(', ')}` : '') +
        (failed.length ? `\nFailed: ${failed.map((s) => s.id).join(', ')}` : '') +
        `\n\n${renderRunSummary(latest)}`,
      sources: []
    };
  }

  return {
    buildDeterministicPlanCreate,
    buildDeterministicPlanValidate,
    buildDeterministicPlanExecuteStep,
    buildDeterministicPlanVerify,
    buildDeterministicPlanRunStart,
    buildDeterministicPlanRunStep,
    buildDeterministicPlanRunAuto,
    buildDeterministicPlanRunStatus,
    buildDeterministicPlanRunVerify
  };
}

module.exports = createDeterministicPlanHelpers;
