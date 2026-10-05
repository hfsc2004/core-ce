'use strict';
// View-only operation records: never saved into pipeline config or Agent context.
const ktGatewayViews = new Map();
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
  </div>`;
};
