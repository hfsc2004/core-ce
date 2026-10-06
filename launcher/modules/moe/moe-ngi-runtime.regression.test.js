'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const native=require('../session-manager-rwkv-observation');
const createBMOC=require('../session-manager-sequence-state');
const { createController }=require('./moe-ngi-experiment');
const user={ kind:'user',surface:'ui' };
function stateFile(scale=1) {
  const chunks=[]; const u32=n => { const b=Buffer.alloc(4); b.writeUInt32LE(n); chunks.push(b); };
  const u64=n => { const b=Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); chunks.push(b); };
  u32(0x67677371); u32(3); u32(2); u32(100); u32(200); u32(1); u32(42); u32(0); u32(0); u32(2);
  for (const values of [[1,2],[3,4],[5,6],[7,8]]) { u32(0); u64(8); const b=Buffer.alloc(8); values.forEach((n,i)=>b.writeFloatLE(n*scale,i*4)); chunks.push(b); }
  return Buffer.concat(chunks);
}
const layout={ layers:2,rElements:2,sElements:2 };
function selection(seed=42) { return { observation:native.OBSERVATION,projection:{ ...native.PROJECTION,seed },delta:{ ...native.DELTA,parameters:{} } }; }
function fixture(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ngi-native-')); t.after(()=>fs.rmSync(dir,{ recursive:true,force:true }));
  const sessions={ s:{ ollamaPID:10,ollamaPort:12345,startTime:1,metadata:{ backend:'llama-cpp',persistentSequence:true,sequenceControlPath:dir,modelPath:'synthetic',modelId:'rwkv7-test' } } };
  const http=[]; let scale=1; let failSave=false;
  const bmoc=createBMOC({ getSession:id=>sessions[id],log:()=>{},observationReader:{ inspect:()=>layout,projectFile:native.projectFile,validateSelection:native.validateSelection },
    fetch:async(url,options)=>{
      const body=JSON.parse(options.body || '{}'); http.push({ url,body });
      let data;
      if (url.includes('/apply-template')) data={ prompt:'__BMOC_SEQUENCE_BOUNDARY__User:hi' };
      else if (url.endsWith('/tokenize')) data={ tokens:[1] };
      else if (url.endsWith('/completion')) data={ tokens:[2],content:'hello' };
      else if (url.includes('action=save')) {
        if (failSave) throw new Error('save unavailable');
        fs.writeFileSync(path.join(dir,body.filename),stateFile(scale)); data={ n_written:stateFile().length };
      } else data={};
      return { ok:true,json:async()=>data };
    } });
  const status={ id:'d',agents:{ subject:{ sessionId:'s',provider:'llama.cpp',persistentSequence:true,ngiManagement:false },helper:{ sessionId:'h',ngiManagement:true } },
    gateways:{ g:{ adapter:'kt-emulator-http',position:'output',assignedAgentIds:['subject'],ktEmulator:{ baseUrl:'http://127.0.0.1:8000' } } } };
  const requests=[]; const preflights=[]; let emulatorError=null; let hold=null; let helperCalls=0;
  const controller=createController({ getStatus:()=>status,getStateStatus:id=>bmoc.status(id),log:()=>{},
    callHelper:async()=>{ helperCalls++; return { success:true,content:'Hello' }; },
    native:{ capabilities:id=>bmoc.observationCapabilities(id),configure:(...args)=>bmoc.configureObservation(...args),activate:(...args)=>bmoc.activateObservation(...args),clear:(...args)=>bmoc.clearObservation(...args),reset:id=>bmoc.reset(id) },
    emulator:async(id,op)=>{
      if (!op.guard()) return { success:false,error:'invalidated' };
      (op.command === 'read' ? preflights : requests).push(op); if (hold) await hold;
      if (op.driveMode === 'read-feedback' && !emulatorError) return {
        success:true,result:{ y:0.25,ga:2,gb:3,magnitude:5 },
        read:{ success:true,result:{ y:0.25,ga:1,gb:1,magnitude:2 } },
        feedback:{ success:true,result:{ y:0.25,ga:2,gb:3,magnitude:5 } },
        trace:{ steps:[{ phase:'read',request:{ instruction:'FF',noise:op.drive.noise } },
          { phase:'feedback',request:{ instruction:op.drive.instruction,noise:0 } }] }
      };
      return emulatorError ? { success:false,error:emulatorError } : { success:true,result:{ y:1,ga:2,gb:3,magnitude:5 },trace:{ steps:[{ command:op.command,result:{ y:1,ga:2,gb:3,magnitude:5 } }] } };
    } });
  bmoc.setObservers(controller.consumeTurn,controller.onLifecycle);
  const command=(action,params={})=>controller.command('g',action,params,user);
  function definition() { return { ...selection(),mapping:{ id:'scaled-delta-sign',version:'1',parameters:{ scale:1 } },
    drive:{ positiveInstruction:'FH',negativeInstruction:'RL',noise:0 },trigger:{ id:'after-persistent-turn' } }; }
  async function start(patch={}) {
    assert.equal(command('ngi_configure',{ patch:{ ...definition(),...patch } }).success,true);
    assert.equal(command('ngi_apply').success,true);
    const arm=await command('ngi_arm'); assert.equal(arm.success,true,arm.error);
    const start=await command('ngi_start'); assert.equal(start.success,true,start.error);
  }
  return { bmoc,controller,command,start,status,sessions,http,requests,preflights,dir,
    turn:()=>bmoc.runTurn('s',{ messages:[{ role:'user',content:'hi' }] }),
    setScale:n=>{ scale=n; }, failSave:()=>{ failSave=true; }, setEmulatorError:e=>{ emulatorError=e; },hold:p=>{ hold=p; },helperCalls:()=>helperCalls };
}
test('projection has a fixed golden vector, ignores prompt metadata, rejects truncated or non-finite tensor data', t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'projection-vector-')); t.after(()=>fs.rmSync(dir,{ recursive:true,force:true }));
  const file=path.join(dir,'state'); fs.writeFileSync(file,stateFile());
  const a=native.projectFile(file,layout,42);
  assert.equal(a.elementCount,8);
  // Independently checked with Python hashlib: digest begins bc b8 c1 aa;
  // least-significant-bit-first signs [-1,-1,+1,+1,+1,+1,-1,+1].
  assert.equal(a.q,16/Math.sqrt(8));
  assert.equal(native.projectFile(file,layout,42).q,a.q);
  const changed=stateFile(); changed.writeUInt32LE(999,12); changed.writeUInt32LE(900,24); fs.writeFileSync(file,changed);
  assert.equal(native.projectFile(file,layout,42).q,a.q);
  fs.writeFileSync(file,stateFile().subarray(0,-1)); assert.throws(()=>native.projectFile(file,layout,42),/Truncated/);
  const bad=stateFile(); bad.writeFloatLE(NaN,52); fs.writeFileSync(file,bad); assert.throws(()=>native.projectFile(file,layout,42),/Non-finite/);
  fs.writeFileSync(file,stateFile()); assert.notEqual(native.projectFile(file,layout,43).q,a.q);
});
test('native reader handles F16/BF16 rows and validates empty Arm probes without establishing an observation',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'projection-types-')); t.after(()=>fs.rmSync(dir,{ recursive:true,force:true }));
  const file=path.join(dir,'state');
  const words={ 1:[0x3c00,0x4000,0x4200,0x4400,0x4500,0x4600,0x4700,0x4800],
    30:[0x3f80,0x4000,0x4040,0x4080,0x40a0,0x40c0,0x40e0,0x4100] };
  for (const type of [1,30]) {
    const chunks=[stateFile().subarray(0,40)];
    for (let row=0;row<4;row++) {
      const header=Buffer.alloc(12); header.writeUInt32LE(type); header.writeBigUInt64LE(4n,4);
      const data=Buffer.alloc(4); data.writeUInt16LE(words[type][row*2]); data.writeUInt16LE(words[type][row*2+1],2);
      chunks.push(header,data);
    }
    fs.writeFileSync(file,Buffer.concat(chunks));
    assert.equal(native.projectFile(file,layout,42).q,16/Math.sqrt(8));
  }
  const emptyHeader=Buffer.alloc(24); emptyHeader.writeUInt32LE(0x67677371); emptyHeader.writeUInt32LE(3,4); emptyHeader.writeUInt32LE(2,20);
  const rowHeader=Buffer.alloc(12); rowHeader.writeBigUInt64LE(8n,4);
  fs.writeFileSync(file,Buffer.concat([emptyHeader,...Array(4).fill(rowHeader)]));
  assert.throws(()=>native.projectFile(file,layout,42),/exactly one/);
  const empty=native.projectFile(file,layout,42,true); assert.equal(empty.q,null); assert.equal(empty.elementCount,0);
});
test('baseline emits no instruction; positive, negative and zero deltas use only user-configured instructions',async t=>{
  const f=fixture(t); await f.start();
  const first=await f.turn(); assert.equal(first.success,true); assert.equal(first.bmocObservation.d_t,null); assert.equal(f.requests.length,0);
  f.setScale(2); const second=await f.turn();
  assert.equal(second.bmocObservation.d_t,second.bmocObservation.q_t-first.bmocObservation.q_t);
  assert.equal(f.requests[0].drive.instruction,second.bmocObservation.d_t > 0 ? 'FH' : 'RL');
  f.setScale(1); await f.turn(); assert.notEqual(f.requests[0].drive.instruction,f.requests[1].drive.instruction);
  const zero=await f.turn(); assert.equal(zero.ngiRun.status,'zero-skipped'); assert.equal(f.requests.length,2);
  assert.equal(f.helperCalls(),0); assert.deepEqual(fs.readdirSync(f.dir),[]);
  const results=f.command('ngi_results').results.filter(row=>row.kind === 'native-state-observation'); assert.equal(results.length,4); assert.equal(results[1].result.magnitude,5);
  assert.equal(results[1].sessionId,'s'); assert.equal(results[1].observation.elementCount,8);
  assert(!JSON.stringify(first.bmocObservation).includes('tensor'));
});
test('controller forwards read-feedback mode only for a nonzero delta and retains both phase records',async t=>{
  const f=fixture(t); await f.start({ drive:{ mode:'read-feedback',positiveInstruction:'FH',negativeInstruction:'RL',noise:0.2 } });
  await f.turn(); assert.equal(f.requests.length,0);
  f.setScale(2); const next=await f.turn();
  assert.equal(f.requests.length,1); assert.equal(f.requests[0].driveMode,'read-feedback');
  assert.equal(f.requests[0].drive.noise,0.2); assert.equal(next.ngiRun.drive.mode,'read-feedback');
  assert.equal(next.ngiRun.read.result.y,0.25); assert.equal(next.ngiRun.feedback.result.ga,2);
  assert.deepEqual(next.ngiRun.trace.steps.map(s=>s.phase),['read','feedback']);
  const recorded=f.command('ngi_results').results.find(row=>row.read);
  assert.equal(recorded.result.y,0.25); assert.equal(recorded.result.magnitude,5);
  await f.turn(); assert.equal(f.requests.length,1); assert.equal(f.helperCalls(),0);
});
test('reset and process replacement invalidate run and baseline; re-Arm/Start produces a new baseline',async t=>{
  const f=fixture(t); await f.start(); await f.turn();
  await f.bmoc.reset('s'); assert.equal(f.controller.inspect('g').experiment.status,'invalidated');
  await f.turn(); assert.equal(f.requests.length,0);
  assert.equal((await f.command('ngi_arm')).success,true); assert.equal((await f.command('ngi_start')).success,true);
  assert.equal((await f.turn()).bmocObservation.d_t,null);
  f.sessions.s.ollamaPID=11; assert.equal(f.controller.inspect('g').experiment.running,false);
  await f.turn(); assert.equal(f.requests.length,0);
  assert.equal((await f.command('ngi_arm')).success,true); assert.equal((await f.command('ngi_start')).success,true);
  assert.equal((await f.turn()).bmocObservation.d_t,null);
  await f.bmoc.invalidate('s'); assert.equal(f.controller.inspect('g').experiment.running,false);
});
test('Stop drains an in-flight request without deadlock and blocks later dispatch',async t=>{
  const f=fixture(t); await f.start(); await f.turn(); f.setScale(2);
  let release; f.hold(new Promise(resolve=>{ release=resolve; }));
  const turning=f.turn(); while (!f.requests.length) await new Promise(resolve=>setImmediate(resolve));
  const stopping=f.command('ngi_stop'); assert.equal(f.controller.inspect('g').experiment.running,false);
  release(); await turning; const stopped=await stopping; assert.equal(stopped.success,true); assert.equal(stopped.experiment.status,'stopped');
  await f.turn(); assert.equal(f.requests.length,1);
});
test('observation and ambiguous emulator errors pause execution without failing or resetting the subject turn',async t=>{
  const f=fixture(t); await f.start(); await f.turn(); f.setScale(2); f.setEmulatorError('timed out; may already have executed');
  const result=await f.turn(); assert.equal(result.success,true); assert.equal(result.ngiRun.success,false);
  assert.equal(f.controller.inspect('g').experiment.status,'paused'); await f.turn(); assert.equal(f.requests.length,1);
  assert.equal(f.http.filter(call=>call.url.includes('action=erase')).length,0);
  const g=fixture(t); await g.start(); g.failSave(); const failed=await g.turn();
  assert.equal(failed.success,true); assert.equal(failed.bmocState.status,'ready'); assert.equal(failed.bmocObservation.status,'error');
  assert.equal(g.controller.inspect('g').experiment.status,'paused'); assert.equal(g.requests.length,0); assert.deepEqual(fs.readdirSync(g.dir),[]);
});
test('registered capabilities and explicit instructions gate Apply; running configuration is immutable and helper transitions denied',async t=>{
  const f=fixture(t); const patch={ ...selection(),mapping:{ id:'scaled-delta-sign',version:'1',parameters:{ scale:1 } },trigger:{ id:'after-persistent-turn' } };
  f.command('ngi_configure',{ patch }); assert.equal(f.command('ngi_apply').success,false);
  assert.equal(f.controller.inspect('g').experiment.definition.drive.positiveInstruction,null);
  await f.start(); assert.equal(f.command('ngi_configure',{ patch:{ projection:{ seed:7 } } }).success,false);
  for (const action of ['ngi_apply','ngi_arm','ngi_start','ngi_stop']) assert.equal((await f.controller.command('g',action,{}, { kind:'helper',agentId:'helper',surface:'irg' })).success,false);
  const result=await f.command('ngi_stop'); assert.equal(result.success,true);
  f.command('ngi_configure',{ patch:{ mapping:{ id:'unimplemented' } } }); assert.equal(f.command('ngi_apply').success,false);
});
test('reset policies execute only at explicit Start; mapping overflow pauses and duplicate turn delivery is ignored',async t=>{
  const f=fixture(t); await f.start({ reset:{ modelState:'reset-before-run',emulator:'reset-before-run' } });
  assert.equal(f.http.filter(call=>call.url.includes('action=erase')).length,1); assert.equal(f.requests[0].command,'reset');
  const first=await f.turn(); assert.equal(first.bmocObservation.d_t,null);
  assert.equal(await f.controller.consumeTurn('s',first),null);
  assert.equal(f.command('ngi_results').results.filter(row=>row.kind==='native-state-observation').length,1);
  await f.command('ngi_stop'); await f.start({ mapping:{ id:'scaled-delta-sign',version:'1',parameters:{ scale:Number.MAX_VALUE } } });
  await f.turn(); f.setScale(100); const overflow=await f.turn(); assert.equal(overflow.success,true); assert.match(overflow.ngiRun.error,/overflow/);
});
test('invalid observation configuration leaves a normal BMOC session usable',async t=>{
  const f=fixture(t); await f.turn();
  const bad=await f.bmoc.configureObservation('s',selection(-1),'bad'); assert.equal(bad.success,false); assert.equal(bad.bmocState.status,'ready');
  assert.equal((await f.turn()).success,true);
});
test('Arm rejects a failed external preflight without configuring native state',async t=>{
  const f=fixture(t);
  const c=selection();
  f.command('ngi_configure',{ patch:{ ...c,mapping:{ id:'scaled-delta-sign',version:'1',parameters:{ scale:1 } },
    drive:{ positiveInstruction:'FH',negativeInstruction:'RL',noise:0 },trigger:{ id:'after-persistent-turn' } } });
  assert.equal(f.command('ngi_apply').success,true); f.setEmulatorError('connection refused');
  assert.equal((await f.command('ngi_arm')).success,false);
  assert.equal(f.http.filter(call=>call.url.includes('action=save')).length,0);
  assert.equal((await f.turn()).success,true); assert.equal(f.requests.length,0);
});
test('Stop during Arm cancels activation and frees the reserved observation policy',async t=>{
  const f=fixture(t);
  f.command('ngi_configure',{ patch:{ ...selection(),mapping:{ id:'scaled-delta-sign',version:'1',parameters:{ scale:1 } },
    drive:{ positiveInstruction:'FH',negativeInstruction:'RL',noise:0 },trigger:{ id:'after-persistent-turn' } } });
  assert.equal(f.command('ngi_apply').success,true);
  let release; f.hold(new Promise(resolve=>{ release=resolve; }));
  const arming=f.command('ngi_arm'); while (!f.preflights.length) await new Promise(resolve=>setImmediate(resolve));
  const stop=f.command('ngi_stop'); release(); assert.equal((await arming).success,false); assert.equal((await stop).success,true);
  assert.equal((await f.turn()).bmocObservation,undefined); assert.equal(f.requests.length,0);
});
test('disabled and bounded logging never changes deterministic execution or feeds results to BMOC prompts',async t=>{
  const f=fixture(t); await f.start({ logging:{ enabled:false,maxRecords:2,fields:[] } });
  await f.turn(); f.setScale(2); await f.turn(); assert.equal(f.command('ngi_results').results.length,0); assert.equal(f.requests.length,1);
  assert(f.http.filter(call=>call.url.endsWith('/completion')).every(call=>Object.keys(call.body).sort().join(',') === 'cache_prompt,id_slot,prompt,return_tokens,stream'));
  await f.command('ngi_stop'); await f.start({ logging:{ enabled:true,maxRecords:2,fields:['observation','delta'] } });
  await f.turn(); f.setScale(3); await f.turn(); f.setScale(4); await f.turn();
  const results=f.command('ngi_results').results; assert.equal(results.length,2); assert.equal(results[0].observation.q_t,undefined);
  assert.equal(results[0].result,undefined); assert.equal(results[0].drive,undefined); assert.equal(typeof results[0].observation.d_t,'number');
});
