'use strict';
// View-only operation records: never saved into pipeline config or Agent context.
const ktGatewayViews = new Map();
const ngiDraftViews = new Map();
const ktDefaults = { baseUrl: 'http://127.0.0.1:8000', timeoutMs: 5000, instruction: 'FF', noise: 0,
  model: 'float', init: 'medium', seed: 1, read_noise: 0.02, start_y: '' };
window.renderKtGatewayAdapterSelector = gateway => `<label>Adapter
  <select onchange="setKtGatewayAdapter('${gateway.id}', this.value)">
    <option value="" ${!gateway.adapter ? 'selected' : ''}>Existing Gateway</option>
    <option value="kt-emulator-http" ${gateway.adapter === 'kt-emulator-http' ? 'selected' : ''}>kT-emulator HTTP</option>
  </select></label>`;
window.setKtGatewayAdapter = (id, adapter) => {
  const gateway = window.modelOrderingState.moeItems.find(item => item.id === id);
  if (!gateway) return;
  gateway.adapter = adapter;
  if (adapter) {
    gateway.position = 'output';
    gateway.ktEmulator = { ...ktDefaults, ...gateway.ktEmulator };
    gateway.assignedAgentIds = (gateway.assignedAgentIds || []).slice(0, 1);
  }
  renderModelOrdering();
};
window.updateKtGateway = (id, key, value) => {
  const gateway = window.modelOrderingState.moeItems.find(item => item.id === id);
  if (!gateway) return;
  if (key === 'agent') gateway.assignedAgentIds = value ? [value] : [];
  else {
    gateway.ktEmulator = { ...ktDefaults, ...gateway.ktEmulator };
    gateway.ktEmulator[key] = ['timeoutMs', 'noise', 'seed', 'read_noise', 'start_y'].includes(key)
      ? (key === 'start_y' && value === '' ? '' : Number(value)) : value;
  }
};
window.runKtGateway = async (id, command) => {
  if (ktGatewayViews.get(id)?.pending) return;
  ktGatewayViews.set(id, { ...ktGatewayViews.get(id), pending: true });
  renderModelOrdering();
  try {
    const result = await window.electronAPI.runMoEKtGateway(id, command);
    ktGatewayViews.set(id, { pending: false, trace: result.trace, error: result.error });
    console.log('[Relay Gateway trace]', result.trace);
  } catch (err) { ktGatewayViews.set(id, { pending: false, error: err.message }); }
  renderModelOrdering();
};
window.renderKtGatewayDetails = gateway => {
  const config = { ...ktDefaults, ...gateway.ktEmulator };
  const view = ktGatewayViews.get(gateway.id) || {};
  const escape = escapeBinding;
  const input = (key, label, type = 'text') => `<label>${label} <input type="${type}" value="${escape(String(config[key]))}"
    style="color:#e6edf3; background:#21262d; border:1px solid #555; border-radius:4px; padding:4px 8px;"
    onchange="updateKtGateway('${gateway.id}', '${key}', this.value)"></label>`;
  const select = (key, label, values) => `<label>${label} <select onchange="updateKtGateway('${gateway.id}', '${key}', this.value)">${values.map(value =>
    `<option ${config[key] === value ? 'selected' : ''}>${escape(value)}</option>`).join('')}</select></label>`;
  const agents = window.modelOrderingState.moeItems.filter(item => item.type === 'agent');
  return `<div onclick="event.stopPropagation()" style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;color:#ddd;">
    ${window.renderKtGatewayAdapterSelector(gateway)}
    <span>Output · manual operations · one lane/address</span>
    <label>Agent <select onchange="updateKtGateway('${gateway.id}', 'agent', this.value)"><option value="">Select Agent</option>
      ${agents.map(agent => `<option value="${escape(agent.id)}" ${gateway.assignedAgentIds?.[0] === agent.id ? 'selected' : ''}>${escape(agent.name)}</option>`).join('')}</select></label>
    ${input('baseUrl', 'Base URL')}${input('timeoutMs', 'Timeout (ms)', 'number')}
    ${select('instruction', 'Instruction', ['FF','FFLV','RF','RFLV','FH','FL','FU','FA','FZ','RH','RL','RU','RA','RZ'])}
    ${input('noise', 'Evaluation noise', 'number')}
    ${select('model', 'Reset model', ['float','byte','mss','rs'])}
    ${select('init', 'Reset initialization', ['low','medium','high','low_noise','high_noise','medium_noise','medium_high_noise','low_noiseless','medium_noiseless','low_noise_small'])}
    ${input('seed', 'Reset seed', 'number')}${input('read_noise', 'Reset read noise', 'number')}${input('start_y', 'Reset starting y (optional)', 'number')}
    <span>Deploy after changing settings. Actions use the deployed configuration. Reset affects only the external emulator.</span>
    ${[['read','Read State'],['evaluate','Evaluate'],['reset','Reset Emulator']].map(([command,label]) =>
      `<button ${view.pending ? 'disabled' : ''} onclick="runKtGateway('${gateway.id}', '${command}')">${label}</button>`).join('')}
    <pre style="width:100%;white-space:pre-wrap;">${escape(view.pending ? 'Request pending…' : JSON.stringify(view.trace || { error: view.error || 'No manual operations yet' }, null, 2))}</pre>
    ${window.renderNgiExperimentDraft(gateway)}
  </div>`;
};

window.updateAgentNgiManagement = (id, enabled) => {
  const agent = window.modelOrderingState.moeItems.find(item => item.id === id && item.type === 'agent');
  if (!agent) return;
  agent.ngiManagement = enabled === true;
  if (typeof markMoePipelineConfigChanged === 'function') markMoePipelineConfigChanged('NGI management permission');
  renderModelOrdering();
};
window.updateNgiDraftInput = (id, key, value) => {
  ngiDraftViews.set(id, { ...ngiDraftViews.get(id), [key]: value });
};
window.refreshNgiDraft = async id => {
  if (ngiDraftViews.get(id)?.pending) return;
  ngiDraftViews.set(id, { ...ngiDraftViews.get(id), pending: true });
  renderModelOrdering();
  try {
    const result = await window.electronAPI.getMoENgiExperiment(id);
    ngiDraftViews.set(id, { ...ngiDraftViews.get(id), pending: false, result });
  } catch (err) { ngiDraftViews.set(id, { ...ngiDraftViews.get(id), pending: false, result: { error: err.message } }); }
  renderModelOrdering();
};
window.askNgiHelper = async id => {
  const view = ngiDraftViews.get(id) || {};
  if (view.pending) return;
  ngiDraftViews.set(id, { ...view, pending: true }); renderModelOrdering();
  try {
    const result = await window.electronAPI.requestMoENgiHelper(id, view.helperId || '', view.message || '');
    ngiDraftViews.set(id, { ...view, pending: false, result });
    console.log('[Relay NGI draft]', result);
  } catch (err) { ngiDraftViews.set(id, { ...view, pending: false, result: { error: err.message } }); }
  renderModelOrdering();
};
const ngiKnowledgeViews = new Map();
window.inspectNgiKnowledge = async id => {
  const prior = ngiKnowledgeViews.get(id) || {};
  if (prior.open) { ngiKnowledgeViews.set(id, { ...prior, open: false }); renderModelOrdering(); return; }
  ngiKnowledgeViews.set(id, { open: true, loading: true }); renderModelOrdering();
  try {
    const data = await window.electronAPI.getMoENgiKnowledge();
    ngiKnowledgeViews.set(id, { open: true, data });
  } catch (_) { ngiKnowledgeViews.set(id, { open: true, error: 'Managed knowledge information unavailable.' }); }
  renderModelOrdering();
};
window.renderNgiKnowledge = id => {
  const view = ngiKnowledgeViews.get(id) || {};
  const esc = escapeBinding;
  return `<div style="width:100%;">
    <button onclick="inspectNgiKnowledge('${id}')" aria-expanded="${view.open === true}"
      title="Automatic retrieval for private NGI helper chat. Core maintains this collection; user uploads cannot alter it. Deploy after enabling NGI management."
      style="padding:8px 12px;background:#21262d;border:1px solid #555;border-radius:6px;color:#e6edf3;">🔒 NGI Knowledge — managed by Core</button>
    ${view.open ? `<div style="font-size:12px;color:#aaa;margin-top:8px;">
      ${view.loading ? 'Loading source information…' : view.error ? esc(view.error) : `
        <p>Collection ${esc(view.data.id)} · version ${esc(view.data.version)} · reviewed ${esc(view.data.reviewedAt)} · read only</p>
        <p>Automatic source-of-record retrieval. General knowledge does not override live backend capabilities. No upload, edit, delete, or retrieval toggle is available here.</p>
        ${(view.data.documents || []).map(doc => `<details><summary>${esc(doc.title)}</summary>
          <p>${esc(doc.file)}</p><pre style="white-space:pre-wrap;word-break:break-word;">${esc(doc.text)}</pre>
          <p>References: ${doc.references.map(ref => esc(ref)).join('<br>')}</p></details>`).join('')}
      `}
    </div>` : ''}</div>`;
};
window.renderNgiExperimentDraft = gateway => {
  const view = ngiDraftViews.get(gateway.id) || {};
  const helpers = window.modelOrderingState.moeItems.filter(item => item.type === 'agent'
    && item.enabled !== false && item.ngiManagement === true && !gateway.assignedAgentIds?.includes(item.id));
  const esc = escapeBinding;
  const style = 'color:#e6edf3;background:#21262d;border:1px solid #555;border-radius:4px;padding:6px;';
  return `<details ${view.expanded ? 'open' : ''} ontoggle="updateNgiDraftInput('${gateway.id}', 'expanded', this.open)" style="width:100%;border-top:1px solid #555;padding-top:10px;">
    <summary>NGI Experiment Assistant — draft only</summary>
    <p>A separate helper with NGI management permission can propose draft settings. The assigned Agent is the subject. Deploy after editing permissions. Drafts reset on redeployment.</p>
    <label>Experiment Assistant <select style="${style}" onchange="updateNgiDraftInput('${gateway.id}', 'helperId', this.value)">
      <option value="">Select a permitted helper Agent</option>${helpers.map(helper =>
        `<option value="${esc(helper.id)}" ${view.helperId === helper.id ? 'selected' : ''}>${esc(helper.name)}</option>`).join('')}</select></label>
    <textarea style="${style}width:100%;min-height:70px;box-sizing:border-box;margin-top:8px;" maxlength="8000"
      placeholder="Inspect the Gateway, propose draft settings, or validate the draft."
      oninput="updateNgiDraftInput('${gateway.id}', 'message', this.value)">${esc(view.message || '')}</textarea>
    <button ${view.pending ? 'disabled' : ''} onclick="askNgiHelper('${gateway.id}')">Ask Experiment Assistant</button>
    <button ${view.pending ? 'disabled' : ''} onclick="refreshNgiDraft('${gateway.id}')">Refresh draft / validation</button>
    <p>Apply, Arm, Start, observations, measurements, and automatic emulator execution are unavailable in this phase. The manual emulator controls above remain separate.</p>
    <pre style="white-space:pre-wrap;word-break:break-word;">${esc(view.pending ? 'Helper request pending…' : JSON.stringify(view.result || { note: 'Refresh to inspect the deployed draft' }, null, 2))}</pre>
  </details>`;
};
