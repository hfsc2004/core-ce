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
    ${window.renderNgiExperimentEditor(gateway)}
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
const ngiExperimentEdits = new Map();
const ngiManifestImports = new Map();
window.updateNgiExperimentField = (id, section, key, value, type) => {
  const current = ngiDraftViews.get(id)?.result?.experiment;
  if (!current) return;
  const edit = ngiExperimentEdits.get(id) || { revision: current.revision, patch: {} };
  edit.errors ||= {};
  try {
    const parsed = type === 'json' ? JSON.parse(value) : type === 'number' ? Number(value) :
      type === 'boolean' ? value === true : value === '' ? null : value;
    edit.patch[section] = { ...(edit.patch[section] || {}), [key]: parsed };
    delete edit.errors[`${section}.${key}`];
  } catch (_) { edit.errors[`${section}.${key}`] = 'Invalid JSON in experiment field'; }
  edit.error = Object.values(edit.errors)[0] || null;
  ngiExperimentEdits.set(id, edit);
};
window.commandNgiExperiment = async (id, action, params = {}) => {
  const prior = ngiDraftViews.get(id) || {};
  if (prior.pending) return;
  ngiDraftViews.set(id, { ...prior, pending: true }); renderModelOrdering();
  try {
    const result = await window.electronAPI.commandMoENgiExperiment(id, action, params);
    ngiDraftViews.set(id, { ...prior, pending: false, result });
    if (result.success && ['ngi_configure','ngi_load_manifest'].includes(action)) ngiExperimentEdits.delete(id);
    const gateway = window.modelOrderingState.moeItems.find(item => item.id === id);
    if (gateway && result.experiment) {
      gateway.ngiExperiment = result.experiment.manifest;
      gateway.ngiSubjectAgentId = result.experiment.source.agentId;
    }
    renderModelOrdering(); return result;
  } catch (err) {
    ngiDraftViews.set(id, { ...prior, pending: false, result: { ...prior.result, success: false, error: err.message } });
    renderModelOrdering();
  }
};
window.submitNgiExperimentEdits = id => {
  const edit = ngiExperimentEdits.get(id);
  if (!edit || edit.error) { alert(edit?.error || 'No experiment fields changed'); return; }
  return window.commandNgiExperiment(id, 'ngi_configure', { patch: edit.patch, expectedRevision: edit.revision });
};
window.discardNgiExperimentEdits = id => { ngiExperimentEdits.delete(id); renderModelOrdering(); };
window.updateNgiSection = (id,key,open) => {
  const view=ngiDraftViews.get(id) || {};
  ngiDraftViews.set(id,{ ...view,sections:{ ...view.sections,[key]:open } });
};
window.selectNgiCapability = (id,section,key) => {
  const current=ngiDraftViews.get(id)?.result?.experiment;
  const cap=current?.capabilities?.[{ observation:'observations',projection:'projections',delta:'deltas',mapping:'mappings' }[section]]?.find(cap => `${cap.id}@${cap.version}` === key);
  window.updateNgiExperimentField(id,section,'id',cap?.id || '', 'text');
  window.updateNgiExperimentField(id,section,'version',cap?.version || '', 'text');
  if (cap && section === 'delta') window.updateNgiExperimentField(id,'delta','parameters','{}','json');
  if (cap && section === 'mapping') window.updateNgiExperimentField(id,'mapping','parameters','{"scale":1}','json');
  renderModelOrdering();
};
function downloadNgiJson(value, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
window.saveNgiManifest = async id => {
  const result = await window.commandNgiExperiment(id, 'ngi_save_manifest');
  if (result?.success) downloadNgiJson(result.manifest, 'ngi-experiment.json');
};
window.exportNgiResults = async id => {
  const result = await window.commandNgiExperiment(id, 'ngi_results');
  if (result?.success) downloadNgiJson(result, 'ngi-results.json');
};
window.loadNgiManifest = async (id, file) => {
  if (!file) return;
  try {
    if (file.size > 256 * 1024) throw new Error('Manifest exceeds size limit');
    const manifest = JSON.parse(await file.text());
    ngiManifestImports.set(id, manifest); renderModelOrdering();
  } catch (err) { alert(err.message); }
};
window.confirmNgiManifestImport = async id => {
  const manifest = ngiManifestImports.get(id); if (!manifest) return;
  const result = await window.commandNgiExperiment(id, 'ngi_load_manifest', { manifest });
  if (result?.success) ngiManifestImports.delete(id);
  renderModelOrdering();
};
window.cancelNgiManifestImport = id => { ngiManifestImports.delete(id); renderModelOrdering(); };
window.renderNgiExperimentEditor = gateway => {
  const id = gateway.id; const view = ngiDraftViews.get(id) || {}; const current = view.result?.experiment;
  const esc = escapeBinding; const edit = ngiExperimentEdits.get(id);
  const style = 'color:#e6edf3;background:#21262d;border:1px solid #555;border-radius:4px;padding:5px;';
  const values = section => ({ ...current.definition[section], ...edit?.patch?.[section] });
  const input = (section, key, label, type = 'text') => `<label>${label}
    <input type="${type === 'number' ? 'number' : 'text'}" style="${style}" value="${esc(String(values(section)[key] ?? ''))}"
      onchange="updateNgiExperimentField('${id}','${section}','${key}',this.value,'${type}')"></label>`;
  const json = (section, key, label) => `<label style="display:block;">${label}
    <textarea style="${style}width:95%;" onchange="updateNgiExperimentField('${id}','${section}','${key}',this.value,'json')">${esc(JSON.stringify(values(section)[key]))}</textarea></label>`;
  const select = (section, key, label, options) => `<label>${label}<select style="${style}"
    onchange="updateNgiExperimentField('${id}','${section}','${key}',this.value,'text')">
    ${options.map(value => `<option value="${esc(value)}" ${values(section)[key] === value ? 'selected' : ''}>${esc(value || 'Unspecified')}</option>`).join('')}</select></label>`;
  const section = (title, body) => `<details ${view.sections?.[title] ? 'open' : ''} ontoggle="updateNgiSection('${id}','${title}',this.open)" style="width:100%;padding:6px 0;"><summary>${title}</summary><div style="display:flex;gap:8px;flex-wrap:wrap;padding:8px;">${body}</div></details>`;
  const capability = (name,label) => {
    const list=current.capabilities[{ observation:'observations',projection:'projections',delta:'deltas',mapping:'mappings' }[name]];
    const selected=`${values(name).id}@${values(name).version}`;
    return `<label>${label}<select style="${style}" onchange="selectNgiCapability('${id}','${name}',this.value)"><option value="">Select capability</option>
      ${list.map(cap => `<option value="${esc(cap.id+'@'+cap.version)}" ${selected === cap.id+'@'+cap.version ? 'selected' : ''}>${esc(cap.id)} · v${esc(cap.version)}</option>`).join('')}
      ${values(name).id && !list.some(cap => selected === cap.id+'@'+cap.version) ? `<option selected value="">Unsupported: ${esc(selected)}</option>` : ''}</select></label>`;
  };
  if (!current) return `<div style="width:100%;"><strong>NGI Experiment</strong><button onclick="refreshNgiDraft('${id}')">Refresh / open experiment configuration</button><p>${esc(view.result?.error || 'Deploy, then refresh to configure the shared draft.')}</p></div>`;
  return `<div style="width:100%;border-top:1px solid #555;padding-top:10px;">
    <strong>NGI Experiment · ${esc(current.status)} · draft revision ${current.revision} · applied revision ${current.appliedRevision ?? 'none'}</strong>
    <button onclick="refreshNgiDraft('${id}')">Refresh shared draft</button>
    <p>BMOC measures native RWKV7 state. First turn establishes a baseline; later deltas select the configured positive/negative instruction. No LLM participates in this measurement loop and no emulator values feed back into the subject. Apply stores the definition; Arm binds the session; Start enables completed-turn execution. Edits never execute or reset anything.</p>
    ${view.result?.error ? `<p style="color:#ff9b9b;">${esc(view.result.error)}</p>` : ''}
    ${edit ? `<p>Unsubmitted form edits based on revision ${edit.revision}. ${esc(edit.error || '')}<button onclick="discardNgiExperimentEdits('${id}')">Discard form edits</button></p>` : ''}
    <fieldset ${current.armed || current.running || view.pending ? 'disabled' : ''} style="border:0;width:100%;padding:0;">
    ${section('Subject and observation source', `<label>Subject Agent <select style="${style}" onchange="commandNgiExperiment('${id}','ngi_select_source',{agentId:this.value})">
      ${current.availableAgents.filter(agent => !agent.ngiManagement).map(agent => `<option value="${esc(agent.id)}" ${current.source.agentId === agent.id ? 'selected' : ''}>${esc(agent.name || agent.id)}</option>`).join('')}</select></label>
      <p>Local binding; omitted from the portable manifest. ${esc(current.capabilities.nativeError || '')}</p>
      ${capability('observation','Observation source')}`)}
    ${section('Projection and delta', `${capability('projection','Projection')}${input('projection','seed','Projection seed','number')}
      ${capability('delta','Delta mode')}${json('delta','parameters','Delta parameters (numeric JSON; successive-q uses {})')}`)}
    ${section('Numeric mapping / scaling', `${capability('mapping','Numeric mapping')}${json('mapping','parameters','Scaling parameters: {"scale":1}. Signal = delta × scale; its sign selects the instruction. No analog amplitude is sent.')}`)}
    ${section('Drive instructions', `${select('drive','mode','Drive mode',['single-instruction','read-feedback'])}
      <p>Read + Feedback executes FF with evaluation noise, records fresh y, then executes the selected instruction with noise 0. Conductances and magnitude are recorded after the second instruction. Single-instruction executes only the selected instruction.</p>
      ${select('drive','positiveInstruction','Positive instruction',['','FF','FFLV','RF','RFLV','FH','FL','FU','FA','FZ','RH','RL','RU','RA','RZ'])}
      ${select('drive','negativeInstruction','Negative instruction',['','FF','FFLV','RF','RFLV','FH','FL','FU','FA','FZ','RH','RL','RU','RA','RZ'])}${input('drive','noise','Evaluation noise','number')}${select('drive','zeroPolicy','Zero signal',['skip'])}`)}
    ${section('Trigger and reset declarations', `${select('trigger','id','Trigger',['manual','after-persistent-turn'])}${select('reset','modelState','Model reset policy',['preserve','reset-before-run'])}
      ${select('reset','emulator','Emulator reset policy',['preserve','reset-before-run'])}${select('reset','baseline','Comparison baseline',['new-on-start'])}${json('reset','emulatorSettings','Emulator reset settings (JSON)')}
      <p>Start explicitly executes selected reset policies. BMOC owns model reset. Every Start establishes a new observation baseline. Preserve leaves the existing model/emulator state intact.</p>`)}
    ${section('Logging', `<label>Enabled <input type="checkbox" ${values('logging').enabled ? 'checked' : ''} onchange="updateNgiExperimentField('${id}','logging','enabled',this.checked,'boolean')"></label>
      ${input('logging','maxRecords','Maximum records','number')}${json('logging','fields','Recorded fields (JSON list)')}`)}
    <button ${view.pending ? 'disabled' : ''} onclick="submitNgiExperimentEdits('${id}')">Update shared draft</button>
    </fieldset>
    ${['validate','apply','arm','start','stop'].map(action => {
      const unavailable= action === 'apply' ? !current.validation.readyToRun || current.armed || current.running :
        action === 'arm' ? !current.validation.readyToRun || current.appliedRevision !== current.revision || current.armed || current.running :
        action === 'start' ? !current.validation.readyToRun || !current.armed || current.running : false;
      return `<button ${view.pending || unavailable ? 'disabled' : ''} title="${unavailable ? 'Validate required capabilities and lifecycle first' : 'Explicit user action'}" onclick="commandNgiExperiment('${id}','ngi_${action}')">${action[0].toUpperCase()+action.slice(1)}</button>`;
    }).join('')}
    <button onclick="saveNgiManifest('${id}')">Save manifest</button><label>Load manifest <input type="file" accept=".json,application/json" onchange="loadNgiManifest('${id}',this.files[0])"></label>
    ${ngiManifestImports.has(id) ? `<div><strong>Manifest import preview — definition only</strong><pre style="white-space:pre-wrap;max-height:300px;overflow:auto;">${esc(JSON.stringify(ngiManifestImports.get(id),null,2))}</pre>
      <p>Loading changes the draft only. It does not Apply, Arm, Start, restore, or reset any state.</p><button onclick="confirmNgiManifestImport('${id}')">Load into draft</button><button onclick="cancelNgiManifestImport('${id}')">Cancel import</button></div>` : ''}
    <button onclick="exportNgiResults('${id}')">Export results / provenance</button>
    ${section('Experiment status / results', `<pre style="white-space:pre-wrap;word-break:break-word;">${esc(JSON.stringify({ revision: current.revision,
      status: current.status, appliedRevision: current.appliedRevision, armed: current.armed, running: current.running,
      run:current.run,validation: current.validation, validationRecord: current.validationRecord, totalRetainedResults:current.results.length,
      results: current.results.slice(-20), note: current.resultNote },null,2))}</pre>`)}
  </div>`;
};
window.renderNgiExperimentDraft = gateway => {
  const view = ngiDraftViews.get(gateway.id) || {};
  const helpers = window.modelOrderingState.moeItems.filter(item => item.type === 'agent'
    && item.enabled !== false && item.ngiManagement === true && !gateway.assignedAgentIds?.includes(item.id));
  const esc = escapeBinding;
  const style = 'color:#e6edf3;background:#21262d;border:1px solid #555;border-radius:4px;padding:6px;';
  return `<details ${view.expanded ? 'open' : ''} ontoggle="updateNgiDraftInput('${gateway.id}', 'expanded', this.open)" style="width:100%;border-top:1px solid #555;padding-top:10px;">
    <summary>NGI Experiment Assistant — draft only</summary>
    <p>A separate helper with NGI management permission can propose shared draft settings. The experiment subject is selected above. Deploy after editing permissions. Saved definitions survive redeployment; revisions and runtime status begin a new lifetime.</p>
    <label>Experiment Assistant <select style="${style}" onchange="updateNgiDraftInput('${gateway.id}', 'helperId', this.value)">
      <option value="">Select a permitted helper Agent</option>${helpers.map(helper =>
        `<option value="${esc(helper.id)}" ${view.helperId === helper.id ? 'selected' : ''}>${esc(helper.name)}</option>`).join('')}</select></label>
    <textarea style="${style}width:100%;min-height:70px;box-sizing:border-box;margin-top:8px;" maxlength="8000"
      placeholder="Inspect the Gateway, propose draft settings, or validate the draft."
      oninput="updateNgiDraftInput('${gateway.id}', 'message', this.value)">${esc(view.message || '')}</textarea>
    <button ${view.pending ? 'disabled' : ''} onclick="askNgiHelper('${gateway.id}')">Ask Experiment Assistant</button>
    <button ${view.pending ? 'disabled' : ''} onclick="refreshNgiDraft('${gateway.id}')">Refresh draft / validation</button>
    <p>The helper can inspect and edit a stopped draft, but cannot Apply, Arm, Start, or Stop. Runtime transitions require explicit user controls. The measurement loop never calls the helper. Manual emulator controls remain separate.</p>
    <pre style="white-space:pre-wrap;word-break:break-word;">${esc(view.pending ? 'Helper request pending…' : JSON.stringify(view.result || { note: 'Refresh to inspect the deployed draft' }, null, 2))}</pre>
  </details>`;
};
// Read-only status polling while a run is armed/running. No model or emulator
// calls; preserve open sections and avoid replacing focused text controls.
if (typeof setInterval === 'function' && window.addEventListener) {
  const interval=setInterval(() => {
    if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) return;
    for (const [id,view] of ngiDraftViews) {
      if (!view.pending && (view.result?.experiment?.running || view.result?.experiment?.armed)) window.refreshNgiDraft(id);
    }
  },2000);
  window.addEventListener('beforeunload',() => clearInterval(interval),{ once:true });
}
