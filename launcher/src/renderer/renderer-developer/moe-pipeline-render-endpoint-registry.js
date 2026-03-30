/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * ============================================================================
 * MOE PIPELINE RENDER - Endpoint Registry Section
 * ============================================================================
 *
 * Extracted from moe-pipeline-render.js to keep that file manageable.
 * No behavior changes: this is a structural split only.
 * ============================================================================
 */

function renderEndpointRegistryDetails() {
  const state = ensureEndpointRegistryRenderState();
  const agents = (window.modelOrderingState.moeItems || []).filter((item) => item.type === 'agent');
  const roleWorkers = flattenEndpointWorkers(state.roles);
  const roleMap = state.agentRoleMap || {};

  return `
    <div onclick="event.stopPropagation()" style="margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(129,140,248,0.35);">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px;">
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <label style="display:flex; align-items:center; gap:6px; color:#ddd; font-size:12px;">
            <input type="checkbox" ${state.enabled ? 'checked' : ''} onchange="setEndpointRegistryEnabled(this.checked)">
            Enabled
          </label>
          <label style="display:flex; align-items:center; gap:6px; color:#9aa; font-size:12px;">
            Policy Preset
            <select id="moe-dtools-policy-preset" style="padding:5px 8px; background:#0f172a; color:#fff; border:1px solid #3a475d; border-radius:6px;">
              <option value="permissive">permissive</option>
              <option value="rlm" selected>rlm</option>
              <option value="irg_strict">irg_strict</option>
            </select>
          </label>
          <button onclick="applyDeterministicPolicyPresetFromMoe()"
                  style="padding:5px 10px; background:rgba(0,212,255,0.2); border:1px solid #00d4ff; color:#9fe8ff; border-radius:6px; cursor:pointer; font-size:11px;">
            Apply Preset
          </button>
        </div>
      </div>

      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:10px; margin-bottom:12px;">
        <label style="display:flex; flex-direction:column; gap:5px; color:#9aa; font-size:11px;">
          Selection
          <select onchange="updateEndpointRegistryCore('selection', this.value)" style="padding:7px; background:#0f172a; color:#fff; border:1px solid #3a475d; border-radius:6px;">
            <option value="priority" ${state.selection === 'priority' ? 'selected' : ''}>Priority</option>
            <option value="latency" ${state.selection === 'latency' ? 'selected' : ''}>Latency</option>
          </select>
        </label>
        <label style="display:flex; flex-direction:column; gap:5px; color:#9aa; font-size:11px;">
          Default Timeout (ms)
          <input type="number" min="1000" max="600000" value="${Number(state.defaultTimeoutMs || 120000)}"
                 onchange="updateEndpointRegistryCore('defaultTimeoutMs', this.value)"
                 style="padding:7px; background:#0f172a; color:#fff; border:1px solid #3a475d; border-radius:6px;">
        </label>
        <label style="display:flex; flex-direction:column; gap:5px; color:#9aa; font-size:11px;">
          Max Consecutive Failures
          <input type="number" min="1" max="20" value="${Number(state.maxConsecutiveFailures || 2)}"
                 onchange="updateEndpointRegistryCore('maxConsecutiveFailures', this.value)"
                 style="padding:7px; background:#0f172a; color:#fff; border:1px solid #3a475d; border-radius:6px;">
        </label>
        <label style="display:flex; flex-direction:column; gap:5px; color:#9aa; font-size:11px;">
          Cooldown (ms)
          <input type="number" min="1000" max="300000" value="${Number(state.cooldownMs || 20000)}"
                 onchange="updateEndpointRegistryCore('cooldownMs', this.value)"
                 style="padding:7px; background:#0f172a; color:#fff; border:1px solid #3a475d; border-radius:6px;">
        </label>
      </div>

      <label style="display:flex; align-items:center; gap:6px; color:#ddd; font-size:12px; margin-bottom:12px;">
        <input type="checkbox" ${state.includeLocalAgents !== false ? 'checked' : ''} onchange="updateEndpointRegistryCore('includeLocalAgents', this.checked)">
        Include local deployed agents as fallback workers
      </label>

      <div style="display:grid; gap:10px;">
        <div style="padding:10px; border:1px solid rgba(255,255,255,0.1); border-radius:8px; background:rgba(0,0,0,0.2);">
          <div style="color:#cbd5e1; font-size:12px; font-weight:600; margin-bottom:8px;">Agent Role Map</div>
          ${agents.length === 0
            ? '<div style="color:#777; font-size:12px;">Add agents to map roles.</div>'
            : agents.map((agent) => `
              <div style="display:grid; grid-template-columns: minmax(140px, 1fr) minmax(140px, 1fr); gap:8px; align-items:center; margin-bottom:6px;">
                <div style="color:#9aa; font-size:12px;">${escapeBinding(agent.name || agent.id)}</div>
                <input type="text" value="${escapeBinding(roleMap[agent.id] || '')}" placeholder="e.g. navigator"
                       onchange="updateEndpointRegistryAgentRole('${agent.id}', this.value)"
                       style="padding:6px 8px; background:#0f172a; color:#fff; border:1px solid #3a475d; border-radius:6px;">
              </div>
            `).join('')}
        </div>

        <div style="padding:10px; border:1px solid rgba(255,255,255,0.1); border-radius:8px; background:rgba(0,0,0,0.2);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div style="color:#cbd5e1; font-size:12px; font-weight:600;">Role Workers</div>
            <button onclick="addEndpointRegistryWorker()" style="padding:5px 10px; background:rgba(0,212,255,0.2); border:1px solid #00d4ff; color:#9fe8ff; border-radius:6px; cursor:pointer; font-size:11px;">+ Add Worker</button>
          </div>
          ${roleWorkers.length === 0 ? '<div style="color:#777; font-size:12px;">No workers configured.</div>' : roleWorkers.map((entry) => renderEndpointWorkerRow(entry)).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderEndpointWorkerRow(entry) {
  const worker = entry.worker;
  const isUnix = worker.endpointType === 'unix';
  const roleArg = encodeURIComponent(entry.role);
  return `
    <div style="display:grid; grid-template-columns: 120px 110px 1fr 130px 1fr 90px 70px 70px auto; gap:6px; align-items:center; margin-bottom:6px;">
      <input type="text" value="${escapeBinding(entry.role)}" placeholder="role"
             onchange="updateEndpointRegistryWorker('${roleArg}', ${entry.index}, 'role', this.value)"
             style="padding:6px 8px; background:#0f172a; color:#fff; border:1px solid #3a475d; border-radius:6px;">
      <select onchange="updateEndpointRegistryWorker('${roleArg}', ${entry.index}, 'endpointType', this.value)"
              style="padding:6px 8px; background:#0f172a; color:#fff; border:1px solid #3a475d; border-radius:6px;">
        <option value="remote" ${worker.endpointType === 'remote' ? 'selected' : ''}>Remote</option>
        <option value="local" ${worker.endpointType === 'local' ? 'selected' : ''}>Local</option>
        <option value="unix" ${worker.endpointType === 'unix' ? 'selected' : ''}>Unix</option>
      </select>
      <input type="text" value="${escapeBinding(worker.name)}" placeholder="worker name"
             onchange="updateEndpointRegistryWorker('${roleArg}', ${entry.index}, 'name', this.value)"
             style="padding:6px 8px; background:#0f172a; color:#fff; border:1px solid #3a475d; border-radius:6px;">
      <input type="text" value="${escapeBinding(worker.host)}" placeholder="${isUnix ? '/tmp/worker.sock' : 'host'}"
             onchange="updateEndpointRegistryWorker('${roleArg}', ${entry.index}, '${isUnix ? 'socket' : 'host'}', this.value)"
             style="padding:6px 8px; background:#0f172a; color:#fff; border:1px solid #3a475d; border-radius:6px;">
      <input type="text" value="${escapeBinding(worker.modelId)}" placeholder="model id"
             onchange="updateEndpointRegistryWorker('${roleArg}', ${entry.index}, 'modelId', this.value)"
             style="padding:6px 8px; background:#0f172a; color:#fff; border:1px solid #3a475d; border-radius:6px;">
      <input type="number" value="${Number(worker.priority)}" min="-100" max="100"
             onchange="updateEndpointRegistryWorker('${roleArg}', ${entry.index}, 'priority', this.value)"
             style="padding:6px 8px; background:#0f172a; color:#fff; border:1px solid #3a475d; border-radius:6px;">
      <input type="number" value="${Number(worker.port)}" min="1" max="65535" ${isUnix ? 'disabled' : ''}
             onchange="updateEndpointRegistryWorker('${roleArg}', ${entry.index}, 'port', this.value)"
             style="padding:6px 8px; background:${isUnix ? '#1f2937' : '#0f172a'}; color:#fff; border:1px solid #3a475d; border-radius:6px;">
      <label style="display:flex; align-items:center; justify-content:center;">
        <input type="checkbox" ${worker.enabled ? 'checked' : ''}
               onchange="updateEndpointRegistryWorker('${roleArg}', ${entry.index}, 'enabled', this.checked)">
      </label>
      <button onclick="removeEndpointRegistryWorker('${roleArg}', ${entry.index})"
              style="padding:5px 8px; background:rgba(255,107,107,0.15); border:1px solid #ff6b6b; color:#ff9b9b; border-radius:6px; cursor:pointer;">✕</button>
    </div>
  `;
}

function flattenEndpointWorkers(roles) {
  const out = [];
  const entries = roles && typeof roles === 'object' ? Object.entries(roles) : [];
  for (const [role, workers] of entries) {
    const list = Array.isArray(workers) ? workers : [];
    list.forEach((worker, index) => {
      out.push({
        role,
        index,
        worker: {
          name: String(worker?.name || ''),
          modelId: String(worker?.modelId || ''),
          priority: Number.isFinite(Number(worker?.priority)) ? Number(worker.priority) : 0,
          enabled: worker?.enabled !== false,
          endpointType: normalizeEndpointType(worker?.endpoint?.type),
          host: String(worker?.endpoint?.host || ''),
          socket: String(worker?.endpoint?.socket || ''),
          port: Number.isInteger(Number(worker?.endpoint?.port)) ? Number(worker.endpoint.port) : 11434
        }
      });
    });
  }
  return out;
}

function normalizeEndpointType(type) {
  const value = String(type || '').trim().toLowerCase();
  if (value === 'unix') return 'unix';
  if (value === 'remote') return 'remote';
  return 'local';
}

function ensureEndpointRegistryRenderState() {
  if (!window.modelOrderingState.endpointRegistry || typeof window.modelOrderingState.endpointRegistry !== 'object') {
    window.modelOrderingState.endpointRegistry = {};
  }
  const registry = window.modelOrderingState.endpointRegistry;
  if (typeof registry.enabled !== 'boolean') registry.enabled = false;
  if (typeof registry.includeLocalAgents !== 'boolean') registry.includeLocalAgents = true;
  if (!['priority', 'latency'].includes(String(registry.selection || '').toLowerCase())) registry.selection = 'priority';
  if (!Number.isFinite(Number(registry.defaultTimeoutMs))) registry.defaultTimeoutMs = 120000;
  if (!Number.isFinite(Number(registry.maxConsecutiveFailures))) registry.maxConsecutiveFailures = 2;
  if (!Number.isFinite(Number(registry.cooldownMs))) registry.cooldownMs = 20000;
  if (!registry.agentRoleMap || typeof registry.agentRoleMap !== 'object' || Array.isArray(registry.agentRoleMap)) registry.agentRoleMap = {};
  if (!registry.roles || typeof registry.roles !== 'object' || Array.isArray(registry.roles)) registry.roles = {};
  return registry;
}

window.renderEndpointRegistryDetails = renderEndpointRegistryDetails;
