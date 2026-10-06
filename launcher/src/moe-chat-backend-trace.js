'use strict';
// Observable backend evidence only. Never requests or displays private reasoning.
window.MoeBackendTrace = (() => {
  let enabled = false;
  function toggle(value) {
    enabled = value === true;
    document.querySelectorAll('.moe-backend-trace').forEach(node => { node.hidden = !enabled; });
  }
  function append(parent, result) {
    const native = !result?.backendTrace && (result?.ngiRun || result?.bmocObservation);
    const trace = result?.backendTrace || (native ? { scope:'NGI native observation',bmocState:result.bmocState,
      observation:result.bmocObservation,experiment:result.ngiRun } : null);
    if (!parent || !trace) return;
    const node = document.createElement('details');
    node.className = 'moe-backend-trace';
    node.hidden = !enabled;
    node.style.cssText = 'margin:8px 12px;padding:10px;border:1px solid #555;border-radius:6px;color:#b9c9dc;font-size:12px;';
    const summary = document.createElement('summary');
    summary.textContent = native ? 'Backend trace — NGI observation and emulator result' : 'Backend trace — retrieval and tool validation';
    const note = document.createElement('p');
    note.textContent = native ? 'BMOC-owned scalar state observation and deterministic emulator execution. No native tensors or model thinking are exposed.' : 'Observable evidence, not model thinking. Excerpts show the reference material supplied to the helper; validation is backend-owned.';
    const pre = document.createElement('pre');
    pre.style.cssText = 'white-space:pre-wrap;word-break:break-word;max-height:420px;overflow:auto;';
    pre.textContent = JSON.stringify(trace, null, 2);
    node.appendChild(summary); node.appendChild(note); node.appendChild(pre);
    parent.appendChild(node);
    parent.scrollTop = parent.scrollHeight;
  }
  return { toggle, append, isEnabled: () => enabled };
})();
