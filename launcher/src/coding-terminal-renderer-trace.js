/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * PSF Coding Terminal - Renderer Trace Module
 */

(function() {
  'use strict';

  function createTraceModule(ctx) {
    const { state, elements } = ctx;
    const MAX_LOCAL_TRACE_ROWS = 120;
    let pollTimer = null;
    let lastPipelineEventAt = 0;

    state.modelTraceRows = Array.isArray(state.modelTraceRows) ? state.modelTraceRows : [];
    state.cliLoopRows = Array.isArray(state.cliLoopRows) ? state.cliLoopRows : [];
    state.activeModelTrace = state.activeModelTrace || null;
    state.deterministicRegistrySnapshot = state.deterministicRegistrySnapshot || null;

    function formatTime(ts) {
      const n = Number(ts) || Date.now();
      const d = new Date(n);
      return d.toLocaleTimeString();
    }

    function clampText(value, max = 360) {
      const text = String(value || '');
      if (!text) return '';
      return text.length > max ? `${text.slice(0, max)}...` : text;
    }

    function toEventSummary(evt) {
      const kind = String(evt?.kind || 'event');
      if (kind === 'router.request') {
        const target = String(evt?.envelope?.to || 'router');
        return `router request -> ${target}`;
      }
      if (kind === 'router.response') {
        const payload = evt?.envelope?.payload || {};
        const src = String(payload?.rewriteSource || 'router');
        const status = payload?.contractOk ? 'ok' : 'invalid';
        return `router response (${status}, ${src})`;
      }
      if (kind === 'turn.prepare') {
        return `turn.prepare mode=${String(evt?.dispatchMode || 'auto')}`;
      }
      if (kind === 'deterministic.plan') {
        return String(evt?.summary || 'deterministic plan event');
      }
      if (kind === 'deterministic.registry.match') {
        const m = evt?.match || {};
        const key = String(m?.key || 'unknown');
        const cat = String(m?.category || 'general');
        const mode = String(m?.mode || 'inspect');
        return `deterministic match ${key} [${cat}] mode=${mode}`;
      }
      return kind;
    }

    function pushModelTrace(summary, details = '', at = Date.now()) {
      if (!summary) return;
      state.modelTraceRows.push({
        at,
        summary: String(summary || ''),
        details: String(details || '')
      });
      if (state.modelTraceRows.length > MAX_LOCAL_TRACE_ROWS) {
        state.modelTraceRows.splice(0, state.modelTraceRows.length - MAX_LOCAL_TRACE_ROWS);
      }
      renderModelTrace();
    }

    function pushCliLoopTrace(summary, details = '', at = Date.now()) {
      if (!summary) return;
      state.cliLoopRows.push({
        at,
        summary: String(summary || ''),
        details: String(details || '')
      });
      if (state.cliLoopRows.length > MAX_LOCAL_TRACE_ROWS) {
        state.cliLoopRows.splice(0, state.cliLoopRows.length - MAX_LOCAL_TRACE_ROWS);
      }
      renderCliLoopTrace();
    }

    function setActiveModelTrace(patch = {}) {
      if (!patch || typeof patch !== 'object') return;
      state.activeModelTrace = {
        ...(state.activeModelTrace || {}),
        ...patch,
        at: Date.now()
      };
      renderModelTrace();
    }

    function clearActiveModelTrace() {
      state.activeModelTrace = null;
      renderModelTrace();
    }

    function renderModelTrace() {
      const el = elements.modelTraceContent;
      if (!el) return;
      const lines = [];

      const registry = state.deterministicRegistrySnapshot;
      if (registry && Array.isArray(registry.definitions) && registry.definitions.length > 0) {
        const byKey = new Map();
        for (const def of registry.definitions) {
          const key = String(def?.key || '');
          if (!key) continue;
          byKey.set(key, {
            key,
            category: String(def?.category || 'general'),
            priority: Number(def?.priority || 0),
            mode: String(def?.mode || 'inspect'),
            attempts: 0,
            hits: 0,
            errors: 0
          });
        }
        if (Array.isArray(registry.telemetry)) {
          for (const row of registry.telemetry) {
            const key = String(row?.key || '');
            if (!key) continue;
            const existing = byKey.get(key) || {
              key,
              category: String(row?.category || 'general'),
              priority: Number(row?.priority || 0),
              mode: String(row?.mode || 'inspect'),
              attempts: 0,
              hits: 0,
              errors: 0
            };
            existing.attempts = Number(row?.attempts || 0);
            existing.hits = Number(row?.hits || 0);
            existing.errors = Number(row?.errors || 0);
            byKey.set(key, existing);
          }
        }
        const ranked = Array.from(byKey.values()).sort((a, b) => {
          if (b.hits !== a.hits) return b.hits - a.hits;
          if (b.attempts !== a.attempts) return b.attempts - a.attempts;
          return b.priority - a.priority;
        });
        const top = ranked.length ? ranked[0] : null;
        lines.push('<div class="ct-trace-row">');
        lines.push('<div class="ct-trace-meta"><span class="ct-trace-label">Deterministic Registry</span></div>');
        lines.push(`<div><span class="ct-trace-muted">tools:</span> ${Number(registry.definitions.length)}</div>`);
        if (top) {
          lines.push(`<div><span class="ct-trace-muted">top-hit:</span> ${escapeHtml(String(top.key || 'n/a'))} (${Number(top.hits || 0)})</div>`);
          for (const item of ranked.slice(0, 5)) {
            const key = escapeHtml(String(item.key || 'n/a'));
            const cat = escapeHtml(String(item.category || 'general'));
            const mode = escapeHtml(String(item.mode || 'inspect'));
            lines.push(
              `<div class="ct-trace-muted">• ${key} [${cat}] mode=${mode} attempts=${Number(item.attempts || 0)} hits=${Number(item.hits || 0)} errors=${Number(item.errors || 0)}</div>`
            );
          }
        }
        lines.push('</div>');
      }

      if (state.activeModelTrace && state.streaming) {
        const active = state.activeModelTrace;
        lines.push('<div class="ct-trace-row">');
        lines.push(`<div class="ct-trace-meta"><span class="ct-trace-label">Live</span> ${formatTime(active.at)}</div>`);
        lines.push(`<div><span class="ct-trace-muted">Model:</span> ${escapeHtml(active.modelName || 'unknown')}</div>`);
        if (active.phase) {
          lines.push(`<div><span class="ct-trace-muted">Phase:</span> ${escapeHtml(active.phase)}</div>`);
        }
        if (active.rewrite) {
          lines.push(`<div><span class="ct-trace-muted">Rewrite:</span> ${escapeHtml(clampText(active.rewrite, 240))}</div>`);
        }
        if (active.thinking) {
          lines.push(`<div><span class="ct-trace-muted">Thinking:</span> ${escapeHtml(clampText(active.thinking, 300))}</div>`);
        }
        if (active.answer) {
          lines.push(`<div><span class="ct-trace-muted">Answer:</span> ${escapeHtml(clampText(active.answer, 300))}</div>`);
        }
        lines.push('</div>');
      }

      const rows = Array.isArray(state.modelTraceRows)
        ? state.modelTraceRows.slice(-20).reverse()
        : [];
      if (!rows.length && !lines.length) {
        el.innerHTML = '<p class="ct-placeholder">Trace idle.</p>';
        return;
      }

      for (const row of rows) {
        lines.push('<div class="ct-trace-row">');
        lines.push(`<div class="ct-trace-meta">${formatTime(row.at)}</div>`);
        lines.push(`<div>${escapeHtml(row.summary || '')}</div>`);
        if (row.details) {
          lines.push(`<div class="ct-trace-muted">${escapeHtml(clampText(row.details, 500))}</div>`);
        }
        lines.push('</div>');
      }
      el.innerHTML = lines.join('');
    }

    function renderCliLoopTrace() {
      const el = elements.cliLoopContent;
      if (!el) return;
      const rows = Array.isArray(state.cliLoopRows)
        ? state.cliLoopRows.slice(-30).reverse()
        : [];
      if (!rows.length) {
        el.innerHTML = '<p class="ct-placeholder">CLI loop idle.</p>';
        return;
      }
      const lines = [];
      for (const row of rows) {
        lines.push('<div class="ct-trace-row">');
        lines.push(`<div class="ct-trace-meta">${formatTime(row.at)}</div>`);
        lines.push(`<div>${escapeHtml(row.summary || '')}</div>`);
        if (row.details) {
          lines.push(`<div class="ct-trace-muted">${escapeHtml(clampText(row.details, 360))}</div>`);
        }
        lines.push('</div>');
      }
      el.innerHTML = lines.join('');
    }

    function summarizeCliEvent(evt) {
      const kind = String(evt?.kind || '');
      const action = String(evt?.action || '').trim();
      const round = Number(evt?.round || 0);
      if (kind === 'cli.agent.loop.start') {
        return `loop start (budget=${Number(evt?.budget || 0)})`;
      }
      if (kind === 'cli.agent.loop.budget') {
        return `budget reached (${Number(evt?.executed || 0)}/${Number(evt?.budget || 0)})`;
      }
      if (kind === 'cli.agent.loop.done') {
        return `loop done (rounds=${Number(evt?.rounds || 0)}, tools=${Number(evt?.executed || 0)})`;
      }
      if (kind === 'cli.agent.tool.start') {
        return `tool start: ${action || 'unknown'}${round > 0 ? ` (round ${round})` : ''}`;
      }
      if (kind === 'cli.agent.tool.done') {
        return `tool done: ${action || 'unknown'}${round > 0 ? ` (round ${round})` : ''}`;
      }
      if (kind === 'cli.agent.followup.start') {
        return `follow-up start${round > 0 ? ` (round ${round})` : ''}`;
      }
      if (kind === 'cli.agent.followup.done') {
        return `follow-up done${round > 0 ? ` (round ${round})` : ''}`;
      }
      if (kind === 'cli.agent.followup.error') {
        return `follow-up error${round > 0 ? ` (round ${round})` : ''}`;
      }
      if (kind === 'cli.agent.followup.empty') {
        return `follow-up empty${round > 0 ? ` (round ${round})` : ''}`;
      }
      return kind;
    }

    function renderPlanRuns(payload = {}) {
      const el = elements.planRunContent;
      if (!el) return;
      const latest = payload?.latestRun || null;
      const runs = Array.isArray(payload?.runs) ? payload.runs : [];
      if (!latest && runs.length === 0) {
        el.innerHTML = '<p class="ct-placeholder">No plan run yet.</p>';
        return;
      }

      const parts = [];
      if (latest) {
        parts.push('<div class="ct-trace-row">');
        parts.push(`<div class="ct-trace-meta"><span class="ct-trace-label">Latest</span> ${formatTime(latest.updatedAt)}</div>`);
        parts.push(`<div>run=${escapeHtml(latest.runId || '')} status=${escapeHtml(latest.status || '')}</div>`);
        if (latest.goal) {
          parts.push(`<div class="ct-trace-muted">goal=${escapeHtml(clampText(latest.goal, 220))}</div>`);
        }
        const steps = Array.isArray(latest.steps) ? latest.steps : [];
        for (const step of steps.slice(0, 8)) {
          const sid = escapeHtml(step.id || '?');
          const sstatus = escapeHtml(step.status || 'pending');
          const action = escapeHtml(clampText(step.action || '', 180));
          parts.push(`<div class="ct-trace-muted">${sid} [${sstatus}] ${action}</div>`);
        }
        parts.push('</div>');
      }

      for (const run of runs.slice(0, 8)) {
        parts.push('<div class="ct-trace-row">');
        parts.push(`<div class="ct-trace-meta">${formatTime(run.updatedAt)}</div>`);
        parts.push(`<div>${escapeHtml(run.runId || '')} [${escapeHtml(run.status || '')}] done=${Number(run.stepsDone || 0)}/${Number(run.stepsTotal || 0)}</div>`);
        if (run.goal) {
          parts.push(`<div class="ct-trace-muted">${escapeHtml(clampText(run.goal, 170))}</div>`);
        }
        parts.push('</div>');
      }

      el.innerHTML = parts.join('');
    }

    function escapeHtml(text) {
      return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    async function refreshPipelineTrace() {
      if (!window.electronAPI?.getCodingPipelineEvents) return;
      try {
        const result = await window.electronAPI.getCodingPipelineEvents({ limit: 120 });
        if (!result?.success) return;
        const events = Array.isArray(result.events) ? result.events : [];
        for (const evt of events) {
          const at = Number(evt?.at) || 0;
          if (at <= lastPipelineEventAt) continue;
          lastPipelineEventAt = Math.max(lastPipelineEventAt, at);
          if (String(evt?.kind || '').startsWith('cli.agent.')) {
            const summary = summarizeCliEvent(evt);
            const details = evt?.error ? `error=${String(evt.error)}` : '';
            pushCliLoopTrace(summary, details, at || Date.now());
            continue;
          }
          const summary = toEventSummary(evt);
          const details = evt?.requestId ? `request=${evt.requestId}` : '';
          pushModelTrace(summary, details, at || Date.now());
        }
      } catch {}
    }

    async function refreshPlanRuns() {
      if (!window.electronAPI?.getCodingPlanRuns) return;
      try {
        const result = await window.electronAPI.getCodingPlanRuns({ limit: 8, includeLatest: true });
        if (!result?.success) return;
        renderPlanRuns(result);
      } catch {}
    }

    async function refreshDeterministicRegistry() {
      if (!window.electronAPI?.getCodingDeterministicRegistry) return;
      try {
        const result = await window.electronAPI.getCodingDeterministicRegistry({ limit: 200 });
        if (!result?.success) return;
        state.deterministicRegistrySnapshot = {
          definitions: Array.isArray(result.definitions) ? result.definitions : [],
          telemetry: Array.isArray(result.telemetry) ? result.telemetry : []
        };
      } catch {}
    }

    async function refreshNow() {
      await refreshPipelineTrace();
      await refreshPlanRuns();
      await refreshDeterministicRegistry();
      renderCliLoopTrace();
      renderModelTrace();
    }

    function refreshCliLoop() {
      renderCliLoopTrace();
    }

    function startPolling() {
      if (pollTimer) return;
      refreshNow();
      pollTimer = setInterval(() => {
        void refreshNow();
      }, 1200);
    }

    function stopPolling() {
      if (!pollTimer) return;
      clearInterval(pollTimer);
      pollTimer = null;
    }

    return {
      startPolling,
      stopPolling,
      refreshNow,
      refreshPlanRuns,
      refreshCliLoop,
      refreshPipelineTrace,
      pushModelTrace,
      setActiveModelTrace,
      clearActiveModelTrace,
      renderModelTrace
    };
  }

  window.CodingTerminalRendererTrace = {
    createTraceModule
  };
})();
