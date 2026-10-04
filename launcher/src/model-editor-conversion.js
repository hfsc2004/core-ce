/* Catalog Editor local conversion controls. */
(function () {
  'use strict';
  const api = window.electronAPI;
  const el = id => document.getElementById(id);
  let sessionId = null, busy = false, files = [], pinnedUrl = '';
  const buttons = ['scan', 'update', 'prepare', 'finish'];
  function status(message) { el('hf-conversion-status').textContent = message; }
  function lock(value) {
    busy = value;
    for (const id of buttons) el(`hf-conversion-${id}`).disabled = value;
    el('btn-submit').disabled = value || !!sessionId;
    el('model-url').readOnly = value || !!sessionId;
    el('hf-conversion-revision').readOnly = value || !!sessionId;
    el('hf-conversion-keep').disabled = value || !el('hf-conversion-quantization').hidden;
  }
  function check(result) {
    if (!result?.success) throw new Error(result?.error || result?.message || 'Conversion failed.');
    return result;
  }
  function hideSteps() {
    for (const id of ['hf-existing-gguf', 'hf-conversion-offer', 'hf-conversion-quantization']) el(id).hidden = true;
  }
  async function scan() {
    if (busy) return;
    lock(true); hideSteps(); el('hf-conversion-cancel').hidden = true;
    try {
      if (sessionId) check(await api.cancelHfConversion({ sessionId }));
      sessionId = null;
      status('Scanning repository and installed conversion tools…');
      const result = check(await api.scanHfConversion({ url: el('model-url').value, baseModelUrl: el('model-base-url')?.value || '', revision: el('hf-conversion-revision').value }));
      if (result.mode === 'download') {
        files = result.files;
        const select = el('hf-existing-gguf-choice');
        select.replaceChildren();
        for (const [index, file] of files.entries()) {
          const option = document.createElement('option');
          option.value = index; option.textContent = file.filename; select.appendChild(option);
        }
        el('hf-existing-gguf').hidden = false;
        status('Existing GGUF files found. Select one to use the normal catalog download workflow.');
      } else {
        sessionId = result.sessionId;
        pinnedUrl = el('model-url').value;
        el('hf-conversion-source').textContent = `${result.repo} @ ${result.revision}\nArchitecture: ${result.architecture}. Source download: approximately ${(result.sizeBytes / 1024 ** 3).toFixed(2)} GiB. Conversion also needs space for full-precision and quantized GGUF files.`;
        el('hf-conversion-offer').hidden = false;
        el('hf-conversion-cancel').hidden = false;
        status(result.message);
      }
    } catch (error) { status(error.message); }
    finally { lock(false); }
  }
  el('hf-conversion-scan').addEventListener('click', scan);
  el('hf-existing-gguf-use').addEventListener('click', () => {
    const file = files[Number(el('hf-existing-gguf-choice').value)];
    if (!file) return;
    el('model-download-url').value = file.download_url;
    el('model-filename').value = file.filename.split('/').pop();
    // Clear source-specific checksums before fetching the selected GGUF metadata.
    el('model-sha256').value = file.sha256 || '';
    el('model-checksum-files').value = '';
    el('model-download-url').dispatchEvent(new Event('input', { bubbles: true }));
    el('btn-fetch-file').click();
  });
  el('hf-conversion-prepare').addEventListener('click', async () => {
    if (busy || !sessionId) return;
    lock(true);
    try {
      const result = check(await api.prepareHfConversion({ sessionId, keepSource: el('hf-conversion-keep').checked }));
      const select = el('hf-conversion-choice'); select.replaceChildren();
      const choices = [...result.preferred, ...result.choices.filter(q => !result.preferred.includes(q))];
      for (const choice of choices) {
        const option = document.createElement('option');
        option.value = choice; option.textContent = choice;
        option.selected = choice === result.recommended; select.appendChild(option);
      }
      el('hf-conversion-offer').hidden = true;
      el('hf-conversion-quantization').hidden = false;
      status('Full-precision GGUF created. Choose a quantization to validate and register.');
    } catch (error) {
      sessionId = null; hideSteps(); el('hf-conversion-cancel').hidden = true; status(error.message);
    } finally { lock(false); }
  });
  el('hf-conversion-finish').addEventListener('click', async () => {
    if (busy || !sessionId) return;
    const download = el('model-download-url');
    const required = download.required; download.required = false;
    const valid = el('model-form').reportValidity(); download.required = required;
    if (!valid) return;
    const built = window.ModelEditorRendererHelpers.buildModelData(window.ModelEditorUtils.inferParametersLabel);
    if (!built.ok) { status(built.error); return; }
    lock(true);
    try {
      if (el('model-url').value !== pinnedUrl) throw new Error('Source changed. Cancel and scan again.');
      const result = check(await api.finishHfConversion({ sessionId, quantization: el('hf-conversion-choice').value,
        smokeTest: el('hf-conversion-smoke').checked, collectionId: el('model-collection').value, modelData: built.modelData }));
      sessionId = null; hideSteps(); el('hf-conversion-cancel').hidden = true;
      status(result.message);
      api.refreshPackageManager();
      api.closeModelEditor();
    } catch (error) {
      if (/cancelled/i.test(error.message)) { sessionId = null; hideSteps(); el('hf-conversion-cancel').hidden = true; }
      status(error.message + (sessionId ? '\nYou can retry another quantization or cancel to clean up.' : ''));
    }
    finally { lock(false); }
  });
  el('hf-conversion-cancel').addEventListener('click', async () => {
    // A cancellation request interrupts active subprocesses/downloads.
    try {
      check(await api.cancelHfConversion({ sessionId }));
      if (!busy) { sessionId = null; hideSteps(); el('hf-conversion-cancel').hidden = true; lock(false); }
      status('Conversion cancelled. Temporary GGUF files are being removed.');
    } catch (error) { status(error.message); }
  });
  el('hf-conversion-update').addEventListener('click', async () => {
    if (busy) return;
    if (!window.confirm('Update the existing llama.cpp source, rebuild its runtime and conversion utilities, and install conversion Python dependencies? This changes your installed toolchain.')) return;
    lock(true);
    try {
      if (sessionId) check(await api.cancelHfConversion({ sessionId }));
      sessionId = null; hideSteps(); el('hf-conversion-cancel').hidden = true;
      status('Updating conversion tools…');
      const result = check(await api.updateHfConversionTools()); status(result.message);
    } catch (error) { status(error.message); }
    finally { lock(false); }
  });
  api.onHfConversionProgress(data => status(data.message));
  window.ModelEditorConversion = { scan, active: () => busy || !!sessionId };
})();
