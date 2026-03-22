/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * Settings Modal - Hardware tab controls
 * Global microphone selection for STT capture across all terminals.
 */

const hardwareMicTestState = {
  active: false,
  stream: null,
  audioContext: null,
  sourceNode: null,
  analyserNode: null,
  rafId: null
};

function getMicTestButton() {
  return document.getElementById('settings-hardware-mic-test-btn');
}

function setMicTestButtonActive(active) {
  const btn = getMicTestButton();
  if (!btn) return;
  btn.textContent = active ? 'Stop Test' : 'Test Mic';
  btn.classList.toggle('recording', active === true);
}

function setHardwareVuLevel(level) {
  const fill = document.getElementById('settings-hardware-mic-vu-fill');
  if (!fill) return;
  const clamped = Math.max(0, Math.min(100, Number(level) || 0));
  fill.style.width = `${clamped}%`;
}

function setMicSelectOptions(selectId, devices, selectedValue) {
  const select = document.getElementById(selectId);
  if (!select) return;
  const safeDevices = Array.isArray(devices) ? devices : [];
  let html = '<option value="">System Default Microphone</option>';
  for (const item of safeDevices) {
    const id = String(item?.deviceId || '').trim();
    if (!id) continue;
    const labelRaw = String(item?.label || '').trim();
    const label = (labelRaw || 'Microphone')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    const escapedValue = id
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    html += `<option value="${escapedValue}">${label}</option>`;
  }
  select.innerHTML = html;
  select.value = String(selectedValue || '').trim();
}

async function listAvailableMicrophones() {
  try {
    if (!navigator?.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return (Array.isArray(devices) ? devices : [])
      .filter((d) => String(d?.kind || '') === 'audioinput')
      .map((d) => ({
        deviceId: String(d?.deviceId || ''),
        label: String(d?.label || '')
      }));
  } catch (_err) {
    return [];
  }
}

async function stopHardwareMicrophoneTest() {
  if (hardwareMicTestState.rafId) {
    cancelAnimationFrame(hardwareMicTestState.rafId);
    hardwareMicTestState.rafId = null;
  }
  try {
    if (hardwareMicTestState.sourceNode) hardwareMicTestState.sourceNode.disconnect();
  } catch (_) {}
  try {
    if (hardwareMicTestState.analyserNode) hardwareMicTestState.analyserNode.disconnect();
  } catch (_) {}
  try {
    if (hardwareMicTestState.stream) {
      hardwareMicTestState.stream.getTracks().forEach((t) => t.stop());
    }
  } catch (_) {}
  if (hardwareMicTestState.audioContext) {
    try {
      await hardwareMicTestState.audioContext.close();
    } catch (_) {}
  }
  hardwareMicTestState.active = false;
  hardwareMicTestState.stream = null;
  hardwareMicTestState.audioContext = null;
  hardwareMicTestState.sourceNode = null;
  hardwareMicTestState.analyserNode = null;
  setMicTestButtonActive(false);
  setHardwareVuLevel(0);
}

function renderHardwareVuMeter() {
  if (!hardwareMicTestState.active || !hardwareMicTestState.analyserNode) return;
  const analyser = hardwareMicTestState.analyserNode;
  const fftSize = Number(analyser.fftSize || 512);
  const data = new Uint8Array(fftSize);
  analyser.getByteTimeDomainData(data);

  let sumSq = 0;
  for (let i = 0; i < data.length; i += 1) {
    const n = (data[i] - 128) / 128;
    sumSq += n * n;
  }
  const rms = Math.sqrt(sumSq / Math.max(1, data.length));
  const boosted = Math.min(1, rms * 3.2);
  setHardwareVuLevel(Math.round(boosted * 100));
  hardwareMicTestState.rafId = requestAnimationFrame(renderHardwareVuMeter);
}

async function loadHardwareSettings() {
  const statusEl = document.getElementById('settings-hardware-status');
  try {
    if (!window.electronAPI?.voiceToTextGetConfig) {
      throw new Error('Voice settings API unavailable.');
    }
    const result = await window.electronAPI.voiceToTextGetConfig();
    if (!result?.success || !result?.config) {
      throw new Error(result?.error || 'Failed to load hardware settings.');
    }
    const selectedId = String(result?.config?.hardware?.inputDeviceId || '').trim();
    const devices = await listAvailableMicrophones();
    setMicSelectOptions('settings-hardware-mic-device', devices, selectedId);
    if (statusEl) {
      statusEl.textContent = '';
      statusEl.style.color = '#888';
    }
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = `Load failed: ${err.message || String(err)}`;
      statusEl.style.color = '#ff6b6b';
    }
  }
}

async function refreshHardwareMicrophones() {
  const statusEl = document.getElementById('settings-hardware-status');
  try {
    if (statusEl) {
      statusEl.textContent = 'Refreshing microphone list...';
      statusEl.style.color = '#ffd400';
    }
    await loadHardwareSettings();
    if (statusEl) {
      statusEl.textContent = 'Microphone list refreshed.';
      statusEl.style.color = '#00ff88';
    }
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = `Refresh failed: ${err.message || String(err)}`;
      statusEl.style.color = '#ff6b6b';
    }
  }
}

async function saveHardwareSettings() {
  const statusEl = document.getElementById('settings-hardware-status');
  try {
    if (!window.electronAPI?.voiceToTextSetConfig) {
      throw new Error('Voice settings API unavailable.');
    }
    const select = document.getElementById('settings-hardware-mic-device');
    const inputDeviceId = String(select?.value || '').trim();
    const result = await window.electronAPI.voiceToTextSetConfig({
      hardware: { inputDeviceId }
    });
    if (!result?.success) {
      throw new Error(result?.error || 'Failed to save hardware settings.');
    }
    if (statusEl) {
      statusEl.textContent = 'Saved hardware settings.';
      statusEl.style.color = '#00ff88';
    }
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = `Save failed: ${err.message || String(err)}`;
      statusEl.style.color = '#ff6b6b';
    }
  }
}

async function testHardwareMicrophone() {
  const statusEl = document.getElementById('settings-hardware-status');
  try {
    if (hardwareMicTestState.active) {
      await stopHardwareMicrophoneTest();
      if (statusEl) {
        statusEl.textContent = 'Microphone test stopped.';
        statusEl.style.color = '#888';
      }
      return;
    }

    const select = document.getElementById('settings-hardware-mic-device');
    const selectedDeviceId = String(select?.value || '').trim();
    const constraints = selectedDeviceId
      ? { audio: { deviceId: { exact: selectedDeviceId } } }
      : { audio: true };

    if (statusEl) {
      statusEl.textContent = 'Starting microphone test...';
      statusEl.style.color = '#ffd400';
    }

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error('AudioContext is unavailable in this environment.');
    const audioContext = new Ctx();
    const sourceNode = audioContext.createMediaStreamSource(stream);
    const analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 512;
    analyserNode.smoothingTimeConstant = 0.8;
    sourceNode.connect(analyserNode);

    hardwareMicTestState.active = true;
    hardwareMicTestState.stream = stream;
    hardwareMicTestState.audioContext = audioContext;
    hardwareMicTestState.sourceNode = sourceNode;
    hardwareMicTestState.analyserNode = analyserNode;
    setMicTestButtonActive(true);
    renderHardwareVuMeter();

    if (statusEl) {
      statusEl.textContent = 'Mic test running. Speak to see live input level.';
      statusEl.style.color = '#00ff88';
    }
  } catch (err) {
    await stopHardwareMicrophoneTest();
    if (statusEl) {
      statusEl.textContent = `Mic test failed: ${err.message || String(err)}`;
      statusEl.style.color = '#ff6b6b';
    }
  }
}
