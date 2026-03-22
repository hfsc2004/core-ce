/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */

window.createMoeChatEsp32Ops = function createMoeChatEsp32Ops(ctx = {}) {
  let pollTimer = null;
  let modeTimer = null;
  let intervalMs = 1500;

  const getElectronAPI = () => (typeof ctx.getElectronAPI === 'function' ? ctx.getElectronAPI() : null);
  const getAttachedCodeFile = () => (typeof ctx.getAttachedCodeFile === 'function' ? ctx.getAttachedCodeFile() : null);
  const getLatestTelemetry = () => (typeof ctx.getLatestTelemetry === 'function' ? ctx.getLatestTelemetry() : { data: null, at: '' });
  const setLatestTelemetry = (data, atIso) => {
    if (typeof ctx.setLatestTelemetry === 'function') {
      ctx.setLatestTelemetry(data, atIso);
    }
  };

  function isEsp32UploadIntent(prompt) {
    return /\b(push|upload|flash|program)\b[\s\S]*\b(esp32|esp-32)\b/i.test(prompt)
      || /\bthis\s+code\b/i.test(prompt);
  }

  function isEsp32ControlIntent(prompt) {
    return /\b(esp32|esp-32|robot)\b/i.test(prompt)
      && /\b(health|telemetry|status|scan|ssid|network|stop|forward|fwd|reverse|backward|turn|spin|drive|cmd)\b/i.test(prompt);
  }

  function appendTelemetryContextIfNeeded(prompt, isUploadIntent, isControlIntent) {
    if (!isControlIntent || isUploadIntent) return prompt;
    const latest = getLatestTelemetry();
    if (!latest?.data || typeof latest.data !== 'object') return prompt;
    const telemetryJson = JSON.stringify(latest.data);
    const ts = latest.at || new Date().toISOString();
    return `${prompt}\n\n[ESP32_TELEMETRY_SNAPSHOT]\ntimestamp=${ts}\n${telemetryJson}\n[/ESP32_TELEMETRY_SNAPSHOT]`;
  }

  function buildOutboundMessage(text) {
    const prompt = String(text || '').trim();
    const uploadIntent = isEsp32UploadIntent(prompt);
    const controlIntent = isEsp32ControlIntent(prompt);
    const attachedCodeFile = getAttachedCodeFile();

    if (!attachedCodeFile?.content) {
      return appendTelemetryContextIfNeeded(prompt, uploadIntent, controlIntent);
    }

    const sourceBanner = `// Source file: ${attachedCodeFile.fileName || 'attached-code'}`;
    const codeBody = `${sourceBanner}\n${String(attachedCodeFile.content || '')}`.trim();
    const fencedCode = `\`\`\`cpp\n${codeBody}\n\`\`\``;

    if (!prompt) return `Push this code to the ESP32:\n${fencedCode}`;
    if (controlIntent && !uploadIntent) return appendTelemetryContextIfNeeded(prompt, uploadIntent, controlIntent);
    if (uploadIntent) return `${prompt}\n\n${fencedCode}`;
    return appendTelemetryContextIfNeeded(`${prompt}\n\nAttached code file:\n${fencedCode}`, uploadIntent, controlIntent);
  }

  function esp32TelemetryTakeControlEnabled(gateway) {
    try {
      const id = String(gateway?.id || '');
      const localState = window.getGatewayEsp32WifiScanData && id
        ? window.getGatewayEsp32WifiScanData(id)
        : null;
      if (localState && localState.takeControl === true) return true;
    } catch (_) {
      // no-op
    }
    return false;
  }

  async function getEsp32GatewayTarget() {
    const electronAPI = getElectronAPI();
    if (!electronAPI?.getMoEStatus) return null;
    const status = await electronAPI.getMoEStatus();
    const gateways = Object.values(status?.gateways || {});
    for (const gateway of gateways) {
      if (String(gateway?.position || '').toLowerCase() !== 'input') continue;
      if (gateway?.irg?.enabled === false) continue;
      if (String(gateway?.irg?.executeMode || '').toLowerCase() !== 'live') continue;
      const esp32 = gateway?.irg?.esp32 || {};
      const host = String(esp32?.wifiHost || '').trim();
      const port = Number(esp32?.wifiPort);
      const timeoutMs = Number(esp32?.wifiTimeoutMs);
      if (!host || !Number.isInteger(port) || port < 1 || port > 65535) continue;
      return {
        host,
        port,
        timeoutMs: Number.isFinite(timeoutMs) ? Math.max(1000, Math.min(60000, timeoutMs)) : 5000,
        takeControl: esp32TelemetryTakeControlEnabled(gateway)
      };
    }
    return null;
  }

  async function fetchEsp32TelemetrySnapshot() {
    const electronAPI = getElectronAPI();
    if (!electronAPI?.runMoEIrgContract) return null;
    const target = await getEsp32GatewayTarget();
    if (!target) return null;
    const contract = {
      contractVersion: '1.0',
      target: 'esp32',
      action: 'esp32_wifi_http',
      params: {
        host: target.host,
        port: target.port,
        method: 'GET',
        path: '/telemetry',
        timeoutMs: target.timeoutMs,
        intent: 'telemetry'
      }
    };
    const result = await electronAPI.runMoEIrgContract(contract, { irgModeOverride: 'live' });
    if (!result?.success) return null;
    const body = String(result?.irg?.execution?.output?.http || '').trim();
    if (!body) return null;
    let parsed = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = { raw: body };
    }
    const atIso = new Date().toISOString();
    setLatestTelemetry(parsed, atIso);
    return parsed;
  }

  function startEsp32TelemetryPolling() {
    stopEsp32TelemetryPolling();
    const poll = () => {
      fetchEsp32TelemetrySnapshot().catch(() => {});
    };
    const schedule = (ms) => {
      intervalMs = ms;
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      pollTimer = setInterval(poll, intervalMs);
      poll();
    };
    schedule(intervalMs);
    modeTimer = setInterval(async () => {
      try {
        const target = await getEsp32GatewayTarget();
        const desired = target?.takeControl === true ? 220 : 1500;
        if (desired !== intervalMs) schedule(desired);
      } catch (_) {
        // no-op
      }
    }, 1200);
  }

  function stopEsp32TelemetryPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (modeTimer) {
      clearInterval(modeTimer);
      modeTimer = null;
    }
  }

  return {
    isEsp32UploadIntent,
    isEsp32ControlIntent,
    buildOutboundMessage,
    fetchEsp32TelemetrySnapshot,
    startEsp32TelemetryPolling,
    stopEsp32TelemetryPolling
  };
};
