'use strict';
const config = require('./moe-ngi-config');
const clone = value => JSON.parse(JSON.stringify(value));
const crypto = require('node:crypto');
const TRANSITIONS = new Set(['ngi_apply', 'ngi_arm', 'ngi_start', 'ngi_stop']);
function createState({ getStatus, getStateStatus = () => null, native = {}, emulator, log = () => {} }) {
  let deploymentId;
  let executionTail = Promise.resolve(); let lifecycleTail = Promise.resolve();
  const drafts = new Map();
  function resolve(gatewayId) {
    const status = getStatus();
    if (!status?.id) throw new Error('Deploy the Relay pipeline first');
    if (deploymentId !== status.id) { drafts.clear(); deploymentId = status.id; }
    const gateway = status.gateways?.[gatewayId];
    if (!gateway || gateway.enabled === false || gateway.adapter !== 'kt-emulator-http') throw new Error('NGI Gateway is not deployed/enabled');
    if (Object.values(status.gateways).filter(g => g.enabled !== false && g.adapter === 'kt-emulator-http').length !== 1) throw new Error('One enabled NGI Gateway is required');
    if (!drafts.has(gatewayId)) {
      const saved = gateway.ngiExperiment ? config.loadManifest(gateway.ngiExperiment) : null;
      drafts.set(gatewayId, { experimentId: saved?.experimentId || `ngi-${crypto.randomUUID()}`,
        definition: saved?.definition || config.defaults(), revision: 0, appliedRevision: null,
        appliedManifest: null, status: 'draft', subjectAgentId: gateway.ngiSubjectAgentId || gateway.assignedAgentIds?.[0] || null,
        events: [], conversations: {}, validationRecord: null, run:null, results:[] });
      const draft = drafts.get(gatewayId);
      gateway.ngiExperiment = config.manifest(draft.definition, draft.experimentId);
      gateway.ngiSubjectAgentId = draft.subjectAgentId;
    }
    const entry = { gatewayId, status, gateway, draft: drafts.get(gatewayId) };
    if (entry.draft.run && !validLifetime(entry)) { entry.draft.run.running=false; entry.draft.run.armed=false; entry.draft.status='invalidated'; }
    return entry;
  }
  function validLifetime(entry) {
    const run = entry.draft.run; const subject = entry.status.agents?.[entry.draft.subjectAgentId];
    const state = subject?.sessionId ? getStateStatus(subject.sessionId) : null;
    return !!run && subject?.sessionId === run.sessionId && state?.lifetimeId === run.lifetimeId &&
      state?.generation === run.generation && !['invalidated','invalid'].includes(state?.status);
  }
  function capabilities(entry) {
    const session = entry.status.agents?.[entry.draft.subjectAgentId]?.sessionId;
    return config.capabilities(session && native.capabilities ? native.capabilities(session) : {});
  }
  function authorize(entry, actor) {
    if (actor?.kind === 'user' && ['ui', 'cli'].includes(actor.surface)) return;
    const helper = entry.status.agents?.[actor?.agentId];
    if (actor?.kind !== 'helper' || !helper?.sessionId || helper.ngiManagement !== true) throw new Error('Requesting Agent lacks deployed NGI management permission');
    if (entry.gateway.assignedAgentIds?.includes(actor.agentId) || entry.draft.subjectAgentId === actor.agentId) throw new Error('The experiment subject cannot be its management helper');
  }
  function provenance(entry) {
    const subject = entry.status.agents?.[entry.draft.subjectAgentId];
    return { at: new Date().toISOString(), deploymentId: entry.status.id, gatewayId: entry.gatewayId,
      subjectAgentId: entry.draft.subjectAgentId, sessionId: subject?.sessionId || null,
      modelId: subject?.modelId || null, runtime: subject?.provider || null,
      bmocState: subject?.sessionId ? getStateStatus(subject.sessionId) : null,
      endpoint: entry.gateway.ktEmulator?.baseUrl || null,
      configRevision: entry.draft.revision, manifestSha256: config.hash(config.manifest(entry.draft.definition, entry.draft.experimentId)) };
  }
  function validation(entry) {
    const errors = config.completeness(entry.draft.definition);
    const subject = entry.status.agents?.[entry.draft.subjectAgentId];
    if (!subject?.sessionId) errors.push('Select a deployed subject Agent');
    if (subject?.ngiManagement === true) errors.push('Subject Agent must have NGI management disabled');
    if (subject && (subject.provider !== 'llama.cpp' || subject.persistentSequence !== true)) errors.push('Subject requires persistent llama.cpp state');
    try { require('./moe-kt-emulator').settings(entry.gateway.ktEmulator); } catch (err) { errors.push(err.message); }
    const caps = capabilities(entry); const d = entry.draft.definition; const blockers=[];
    for (const [section,list] of [['observation',caps.observations],['projection',caps.projections],['delta',caps.deltas],['mapping',caps.mappings]]) {
      if (!list.some(item => item.id === d[section].id && item.version === d[section].version)) blockers.push(`Select a supported ${section} capability/version`);
    }
    if (!caps.runtimeExecution) blockers.push(caps.nativeError || 'BMOC native observation capability is unavailable');
    try { require('../session-manager-rwkv-observation').validateSelection(d); } catch (err) { blockers.push(err.message); }
    try { require('./moe-ngi-mapping').validate(d.mapping); } catch (err) { blockers.push(err.message); }
    if (d.trigger.id !== 'after-persistent-turn') blockers.push('Select after-persistent-turn for automatic observation execution');
    if (!native.configure || !native.activate || !native.clear || !native.reset || !emulator) blockers.push('Experiment runtime services unavailable');
    const state = subject?.sessionId ? getStateStatus(subject.sessionId) : null;
    if (!state?.lifetimeId || state?.enabled !== true || ['invalid','invalidated'].includes(state?.status)) blockers.push('BMOC persistent session is unavailable or invalid');
    return { valid: errors.length === 0, errors, readyToRun: errors.length === 0 && blockers.length === 0, blockers };
  }
  function view(entry) {
    const d = entry.draft; const f = d.definition;
    return clone({ experimentId: d.experimentId, definition: f, manifest: config.manifest(f, d.experimentId),
      revision: d.revision, appliedRevision: d.appliedRevision, appliedManifest: d.appliedManifest,
      status: d.status, applied: d.appliedRevision !== null, armed: d.run?.armed === true, running: d.run?.running === true,
      run:d.run ? { id:d.run.id, sessionId:d.run.sessionId, generation:d.run.generation, startedAt:d.run.startedAt || null,
        manifestSha256:d.run.manifestSha256, error:d.run.error || null } : null,
      source: { agentId: d.subjectAgentId, observationId: f.observation.id },
      projection: f.projection, delta: f.delta,
      mapping: f.mapping.id ? f.mapping : null,
      drive: f.drive.positiveInstruction ? { ...f.drive, instruction: f.drive.positiveInstruction } : null,
      trigger: f.trigger.id, logging: f.logging, reset: f.reset, events: d.events,
      validation: validation(entry), validationRecord: d.validationRecord,
      results:d.results, resultNote:d.results.length ? 'Completed run observations' : 'No observations recorded yet',
      gateway: { id: entry.gatewayId, adapter: entry.gateway.adapter, baseUrl: entry.gateway.ktEmulator?.baseUrl,
        manualAssignedAgentIds: entry.gateway.assignedAgentIds || [] },
      availableAgents: Object.entries(entry.status.agents || {}).map(([id, agent]) => ({ id, name: agent.name,
        ngiManagement: agent.ngiManagement === true, provider: agent.provider, persistentSequence: agent.persistentSequence === true })),
      capabilities: { ...capabilities(entry), nativeObservations:capabilities(entry).observations } });
  }
  function record(entry, actor, action, params) {
    const event = { at: new Date().toISOString(), gatewayId: entry.gatewayId, requestingAgentId: actor.agentId || null,
      surface: actor.surface || 'irg', subjectAgentId: entry.draft.subjectAgentId,
      action, params: clone(params), revision: entry.draft.revision };
    entry.draft.events.push(event);
    if (entry.draft.events.length > 50) entry.draft.events.shift();
    try { log(event); } catch (_) {}
  }
  function execute(entry, actor, action, params = {}) {
    authorize(entry, actor);
    if (actor.kind === 'helper' && TRANSITIONS.has(action)) throw new Error('Runtime transitions are unavailable to helper output; explicit user action is required');
    if (['ngi_arm','ngi_start','ngi_stop'].includes(action)) return lifecycle(entry.gatewayId,actor,action,params);
    const d = entry.draft; let patch = null; let subjectId = null; let loaded = null;
    if (['armed','running','starting','arming','stopping'].includes(d.status) && !['ngi_inspect','ngi_status','ngi_results','ngi_validate','ngi_save_manifest'].includes(action)) throw new Error('Stop the experiment before editing or applying its definition');
    if (params.expectedRevision !== undefined && params.expectedRevision !== d.revision) throw new Error('Draft revision changed; refresh before submitting edits');
    switch (action) {
      case 'ngi_select_source': {
        const subject = entry.status.agents?.[params.agentId];
        if (!subject?.sessionId || subject.ngiManagement === true || params.agentId === actor.agentId) throw new Error('Observation source must be a separate deployed subject with NGI management disabled');
        subjectId = params.agentId;
        if (params.observationId) patch = { observation: { id: params.observationId, version: params.version } };
        break;
      }
      case 'ngi_configure': patch = params.patch; break;
      case 'ngi_configure_projection': patch = { projection: params }; break;
      case 'ngi_configure_delta': patch = { delta: params }; break;
      case 'ngi_configure_mapping': patch = { mapping: params }; break;
      case 'ngi_configure_drive': patch = { drive: params.instruction ? {
        positiveInstruction: params.instruction, negativeInstruction: params.instruction, noise: params.noise,
        ...(params.mode !== undefined ? { mode:params.mode } : {})
      } : params }; break;
      case 'ngi_configure_trigger_logging': patch = { trigger: { id: params.trigger }, logging: params.logging }; break;
      case 'ngi_configure_reset': patch = { reset: params }; break;
      case 'ngi_load_manifest': loaded = config.loadManifest(params.manifest); break;
      case 'ngi_validate': d.validationRecord = { ...validation(entry), provenance: provenance(entry) }; break;
      case 'ngi_apply': {
        const result = validation(entry);
        d.validationRecord = { ...result, provenance: provenance(entry) };
        if (!result.readyToRun) throw new Error('Apply requires a complete definition and all required runtime capabilities');
        d.appliedManifest = config.manifest(d.definition, d.experimentId);
        d.appliedRevision = d.revision; d.status = 'applied'; break;
      }
      case 'ngi_inspect': case 'ngi_status': case 'ngi_results': case 'ngi_save_manifest': break;
      default: throw new Error('Unsupported NGI action');
    }
    if (patch || loaded || subjectId) {
      const next = loaded?.definition || (patch ? config.merge(d.definition, patch) : d.definition);
      d.definition = next;
      if (loaded) d.experimentId = loaded.experimentId;
      if (subjectId) d.subjectAgentId = subjectId;
      d.revision++; d.status = 'draft'; d.validationRecord = null;
      // Persistable pipeline fields are distinct from the portable definition.
      entry.gateway.ngiExperiment = config.manifest(d.definition, d.experimentId);
      entry.gateway.ngiSubjectAgentId = d.subjectAgentId;
    }
    record(entry, actor, action, params);
    return { success: true, experiment: view(entry),
      ...(action === 'ngi_save_manifest' ? { manifest: config.manifest(d.definition, d.experimentId) } : {}),
      ...(action === 'ngi_results' ? { results:clone(d.results), provenance: provenance(entry), appliedManifest: d.appliedManifest } : {}) };
  }
  function lifecycle(id,actor,action,params) {
    const boundEpoch=resolve(id).draft.stopEpoch || 0;
    // Stop revokes dispatch synchronously, before waiting on either queue. Turn
    // callbacks never wait on lifecycleTail: this avoids BMOC queue deadlocks.
    if (action === 'ngi_stop') { const d=resolve(id).draft; d.stopEpoch=(d.stopEpoch || 0)+1; if (d.run) d.run.running=false; d.status='stopping'; }
    const operation = lifecycleTail.then(async () => {
      let entry;
      try {
        entry=resolve(id); authorize(entry,actor); const d=entry.draft;
        const run=d.run;
        if (action === 'ngi_stop') {
          await executionTail;
          if (run) await native.clear?.(run.sessionId,run.id);
          if (run) { run.running=false; run.armed=false; }
          d.status='stopped';
        } else {
          if (!validation(entry).readyToRun || d.appliedRevision !== d.revision) throw new Error('Apply the current capability-validated definition first');
          if (action === 'ngi_arm') {
            if (!['applied','stopped','invalidated','paused'].includes(d.status)) throw new Error('Experiment must be applied or stopped before Arm');
            if (run) await native.clear(run.sessionId,run.id);
            const sessionId=entry.status.agents[d.subjectAgentId].sessionId;
            const state=getStateStatus(sessionId);
            d.status='arming';
            const preflight=await emulator(id,{ command:'read',agentId:d.subjectAgentId,experimentId:d.experimentId,
              guard:() => getStatus()?.id === entry.status.id && getStateStatus(sessionId)?.lifetimeId === state.lifetimeId && (d.stopEpoch || 0) === boundEpoch });
            if (!preflight.success) throw new Error(preflight.error || 'External emulator preflight failed');
            const next={ id:`ngi-run-${crypto.randomUUID()}`,sessionId,lifetimeId:state.lifetimeId,generation:state.generation,
              manifestSha256:config.hash(d.appliedManifest),armed:false,running:false,lastTurn:0 };
            const result=await native.configure(sessionId,d.definition,next.id);
            if (!result.success) throw new Error(result.error);
            d.run=next;
            if ((d.stopEpoch || 0) !== boundEpoch) { await native.clear(sessionId,next.id); throw new Error('Arm cancelled by Stop'); }
            if (!validLifetime(resolve(id))) { await native.clear(sessionId,next.id); throw new Error('Subject lifetime changed while arming'); }
            next.armed=true; d.status='armed';
            addResult(entry,{ kind:'preflight-state',runId:next.id,result:preflight.result,trace:preflight.trace });
          } else {
            if (d.status !== 'armed' || !run?.armed || !validLifetime(entry)) throw new Error('Arm the current BMOC session before Start');
            d.status='starting';
            if (d.definition.reset.modelState === 'reset-before-run') {
              const reset=await native.reset(run.sessionId); if (!reset.success) throw new Error(reset.error);
              const state=getStateStatus(run.sessionId); run.lifetimeId=state.lifetimeId; run.generation=state.generation;
              const configured=await native.configure(run.sessionId,d.definition,run.id); if (!configured.success) throw new Error(configured.error);
            }
            if (d.definition.reset.emulator === 'reset-before-run') {
              const reset=await emulator(id,{ command:'reset',agentId:d.subjectAgentId,runId:run.id,
                experimentId:d.experimentId,resetSettings:d.definition.reset.emulatorSettings,guard:() => validLifetime(resolve(id)) && (d.stopEpoch || 0) === boundEpoch });
              if (!reset.success) throw new Error(reset.error);
              addResult(entry,{ kind:'emulator-reset',runId:run.id,trace:reset.trace });
            }
            if (!validLifetime(resolve(id)) || (d.stopEpoch || 0) !== boundEpoch) throw new Error('Subject lifetime changed or Start cancelled by Stop');
            // Commit running status within BMOC's activation queue boundary,
            // before any queued subject turn can observe the new policy.
            const activated=await native.activate(run.sessionId,run.id,() => {
              if (!validLifetime(resolve(id)) || (d.stopEpoch || 0) !== boundEpoch) throw new Error('Start cancelled or session invalidated');
              run.armed=true; run.running=true; run.startedAt=new Date().toISOString(); d.status='running';
            });
            if (!activated.success) throw new Error(activated.error);
            if (!validLifetime(resolve(id)) || (d.stopEpoch || 0) !== boundEpoch) throw new Error('Subject lifetime changed or Start cancelled by Stop');
            if (!run.running) throw new Error('BMOC did not commit observation activation');
          }
        }
        record(entry,actor,action,params); return { success:true,experiment:view(entry) };
      } catch (err) {
        if (entry && action !== 'ngi_stop') {
          if (entry.draft.run) { entry.draft.run.running=false; entry.draft.run.armed=false; entry.draft.run.error=err.message; }
          entry.draft.status='paused';
        }
        return { success:false,error:err.message,...(entry ? { experiment:view(entry) } : {}) };
      }
    });
    lifecycleTail=operation.catch(() => {}); return operation;
  }
  function addResult(entry,record) {
    if (!entry.draft.definition.logging.enabled) return;
    const fields=entry.draft.definition.logging.fields;
    if (['emulator-reset','manual-emulator-operation','preflight-state'].includes(record.kind) && !fields.includes('lifecycle')) return;
    const row={ at:new Date().toISOString(), ...clone(record) };
    if (!fields.includes('observation')) delete row.observation;
    if (row.observation) {
      if (!fields.includes('projection')) delete row.observation.q_t;
      if (!fields.includes('delta')) delete row.observation.d_t;
    }
    if (!fields.includes('delta')) delete row.mapping;
    if (!fields.includes('projection')) delete row.costs;
    if (!fields.includes('drive')) delete row.drive;
    if (!fields.includes('emulator')) { delete row.result; delete row.trace; delete row.read; delete row.feedback; }
    if (!fields.includes('errors')) delete row.error;
    entry.draft.results.push(row);
    while (entry.draft.results.length > entry.draft.definition.logging.maxRecords) entry.draft.results.shift();
    try { log({ kind:'ngi-run-result',...row }); } catch (_) {}
  }
  function consumeTurn(sessionId,response) {
    const status=getStatus(); if (!status?.id || !response.success || !response.bmocObservation) return null;
    const id=Object.keys(status.gateways || {}).find(id => {
      const d=drafts.get(id); return d?.run?.running && d.run.sessionId === sessionId;
    });
    if (!id) return null;
    const bound=resolve(id); const run=bound.draft.run; const observation=clone(response.bmocObservation);
    const operation=executionTail.then(async () => {
      const entry=resolve(id); const d=entry.draft;
      const guard=() => getStatus()?.id === bound.status.id && d.run === run && run.running && validLifetime(resolve(id));
      if (!guard() || response.bmocState?.generation !== run.generation || response.bmocState?.lifetimeId !== run.lifetimeId || response.bmocState?.turnCount <= run.lastTurn) return null;
      run.lastTurn=response.bmocState.turnCount;
      const sample={ kind:'native-state-observation',runId:run.id,experimentId:d.experimentId,agentId:d.subjectAgentId,
        sessionId,generation:run.generation,turnCount:response.bmocState.turnCount,
        manifestSha256:run.manifestSha256,observation,success:true,status:observation.status };
      sample.costs=response.bmocState.observationCost || null;
      try {
        if (observation.status === 'error') throw new Error(observation.error || 'BMOC native observation failed');
        if (!Number.isFinite(observation.q_t) || !Number.isSafeInteger(observation.elementCount) || observation.elementCount < 1 || observation.seed !== d.definition.projection.seed || observation.version !== d.definition.projection.version) throw new Error('Invalid projected observation');
        if (observation.status === 'baseline-established' && observation.d_t === null) { addResult(entry,sample); return sample; }
        if (observation.status !== 'delta-ready' || observation.seed !== d.definition.projection.seed || observation.version !== d.definition.projection.version) throw new Error('Observation capability/seed/status mismatch');
        const mapped=require('./moe-ngi-mapping').map(observation.d_t,d.definition.mapping);
        sample.mapping={ id:d.definition.mapping.id,version:d.definition.mapping.version,parameters:clone(d.definition.mapping.parameters),...mapped };
        if (mapped.direction === 'zero') { sample.status='zero-skipped'; addResult(entry,sample); return sample; }
        const instruction=mapped.direction === 'positive' ? d.definition.drive.positiveInstruction : d.definition.drive.negativeInstruction;
        sample.drive={ mode:d.definition.drive.mode || 'single-instruction',instruction,noise:d.definition.drive.noise };
        const result=await emulator(id,{ command:'evaluate',agentId:d.subjectAgentId,runId:run.id,experimentId:d.experimentId,
          driveMode:sample.drive.mode,drive:{ instruction,noise:sample.drive.noise },guard });
        sample.trace=result.trace; sample.result=result.result;
        if (result.read) sample.read=result.read;
        if (result.feedback) sample.feedback=result.feedback;
        if (!result.success) throw new Error(result.error || 'Emulator execution failed');
        if (!guard()) { sample.status='invalidated-after-dispatch'; sample.success=false; }
      } catch (err) {
        sample.error=err.message; sample.success=false; sample.status='paused'; run.running=false; run.armed=false; run.error=err.message; d.status='paused';
      }
      addResult(entry,sample); return sample;
    }).catch(err => {
      run.running=false; run.armed=false; run.error=err.message;
      return { success:false,status:'invalidated',error:err.message };
    });
    executionTail=operation.catch(() => {}); return operation;
  }
  function onLifecycle(metadata) {
    if (!['reset','invalidated','process-replaced'].includes(metadata.event?.type)) return;
    for (const d of drafts.values()) if (d.run?.sessionId === metadata.sessionId && d.status !== 'starting') {
      d.run.running=false; d.run.armed=false; d.status='invalidated';
    }
  }
  function manualOperation(id,result) {
    try { const entry=resolve(id); if (entry.draft.run) addResult(entry,{ kind:'manual-emulator-operation',runId:entry.draft.run.id,trace:result.trace,success:result.success }); } catch (_) {}
  }
  async function stopAll() {
    for (const [id,d] of drafts) if (d.run && getStatus()?.id === deploymentId) await command(id,'ngi_stop',{}, { kind:'user',surface:'ui' });
  }
  function inspect(id) { try { return { success: true, experiment: view(resolve(id)) }; } catch (err) { return { success: false, error: err.message }; } }
  function command(id, action, params, actor) {
    let entry;
    try { entry = resolve(id); return execute(entry, actor, action, params); }
    catch (err) { return { success: false, error: err.message, ...(entry ? { experiment: view(entry) } : {}) }; }
  }
  function pipelineConfig(pipeline) {
    const status = getStatus();
    return { ...pipeline, items: (pipeline.items || []).map(item => {
      const gateway = status?.gateways?.[item.id];
      return gateway?.ngiExperiment ? { ...item, ngiExperiment: clone(gateway.ngiExperiment), ngiSubjectAgentId: gateway.ngiSubjectAgentId } : item;
    }) };
  }
  return { resolve, authorize, view, execute, inspect, command, pipelineConfig, consumeTurn, onLifecycle, manualOperation, stopAll };
}
module.exports = { createState };
