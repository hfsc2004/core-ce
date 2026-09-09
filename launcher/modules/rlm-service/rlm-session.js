/**
 * RLM session record.
 */

const { createRlmEnvironment } = require('./rlm-environment');
const { normalizeRlmBudget, normalizeModelBehavior, normalizeProfile } = require('./rlm-budget');
const { createRlmTrace } = require('./rlm-trace');

function createRlmSession(options = {}) {
  const modelBehavior = normalizeModelBehavior(options.modelBehavior);
  const profile = normalizeProfile(options.profile);
  const budget = normalizeRlmBudget(options.budget || {}, { profile, modelBehavior });
  const environment = createRlmEnvironment({
    prompt: options.prompt,
    messages: options.messages,
    attachments: options.attachments
  });
  const trace = createRlmTrace();
  const startedAt = new Date().toISOString();
  let stopped = false;

  trace.add('session-created', {
    mode: String(options.mode || 'recursive-repl-dry-run'),
    profile,
    modelBehavior,
    promptChars: String(options.prompt || '').length
  });

  return {
    bmocSessionId: String(options.bmocSessionId || ''),
    parentSessionId: String(options.parentSessionId || ''),
    surface: String(options.surface || 'terminal'),
    mode: String(options.mode || 'recursive-repl-dry-run'),
    model: String(options.model || ''),
    backend: String(options.backend || ''),
    modelBehavior,
    behaviorSource: String(options.behaviorSource || 'unknown'),
    profile,
    budget,
    environment,
    trace,
    startedAt,
    stop(reason = 'stopped') {
      stopped = true;
      trace.add('session-stopped', { reason: String(reason || 'stopped') });
    },
    isStopped() {
      return stopped;
    },
    getStatus() {
      return {
        success: true,
        sessionId: this.bmocSessionId,
        parentSessionId: this.parentSessionId || null,
        surface: this.surface,
        mode: this.mode,
        model: this.model || null,
        backend: this.backend || null,
        modelBehavior: this.modelBehavior,
        behaviorSource: this.behaviorSource,
        profile: this.profile,
        budget: { ...this.budget },
        startedAt: this.startedAt,
        stopped,
        environment: this.environment.getMetadata(),
        trace: this.trace.list(50)
      };
    }
  };
}

module.exports = {
  createRlmSession
};
