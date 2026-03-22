/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */

const ESP32_AI_DRIVE_MIN_TICK_MS = 200;
const ESP32_AI_DRIVE_MAX_TICK_MS = 2000;
const ESP32_AI_DRIVE_DEFAULT_TICK_MS = 420;

function getAiDriveTickMs(gatewayId) {
  const gateway = readGatewayById(gatewayId);
  const configured = Number(gateway?.irg?.esp32?.wifiAiDriveTickMs);
  if (!Number.isInteger(configured)) return ESP32_AI_DRIVE_DEFAULT_TICK_MS;
  return Math.max(ESP32_AI_DRIVE_MIN_TICK_MS, Math.min(ESP32_AI_DRIVE_MAX_TICK_MS, configured));
}

function clearAiDriveTimer(state) {
  if (state?.aiDriveTickTimer) {
    clearTimeout(state.aiDriveTickTimer);
    state.aiDriveTickTimer = null;
  }
}

function scheduleAiDriveNextTick(gatewayId, delayMs) {
  const state = readScanState(gatewayId);
  clearAiDriveTimer(state);
  if (state.aiDriveRunning !== true) return;
  const waitMs = Math.max(80, Number(delayMs) || getAiDriveTickMs(gatewayId));
  state.aiDriveTickTimer = setTimeout(() => {
    runGatewayEsp32AiDriveTick(gatewayId).catch((err) => {
      const s = readScanState(gatewayId);
      s.driveError = String(err?.message || err || 'AI drive tick failed');
      esp32LogStatus(`[ESP32 AI] Tick failed: ${s.driveError}`, 'error');
      stopGatewayEsp32AiDriveSession(gatewayId, { silent: true });
    });
  }, waitMs);
}

function extractBalancedJsonObject(text) {
  const source = String(text || '');
  const start = source.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

function parseAiDriveDecision(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return { command: 'stop', ms: 180, reason: 'empty_response', raw: text };

  const jsonSlice = extractBalancedJsonObject(text);
  if (jsonSlice) {
    try {
      const obj = JSON.parse(jsonSlice);
      const command = String(obj?.command || obj?.action || '').trim().toLowerCase();
      const msValue = Number.parseInt(String(obj?.ms ?? obj?.durationMs ?? ''), 10);
      const reason = String(obj?.reason || '').trim();
      if (['forward', 'reverse', 'left', 'right', 'stop'].includes(command)) {
        const ms = Number.isInteger(msValue) ? msValue : 180;
        return { command, ms, reason, raw: text };
      }
    } catch (_) {
      // Fall through to token parsing.
    }
  }

  const lower = text.toLowerCase();
  const tokenMap = [
    ['forward', 'forward'],
    ['fwd', 'forward'],
    ['reverse', 'reverse'],
    ['backward', 'reverse'],
    ['rev', 'reverse'],
    ['left', 'left'],
    ['right', 'right'],
    ['stop', 'stop']
  ];
  let command = 'stop';
  for (const [token, mapped] of tokenMap) {
    if (lower.includes(token)) {
      command = mapped;
      break;
    }
  }
  const msMatch = lower.match(/(\d{2,4})\s*ms/);
  const ms = msMatch ? Number.parseInt(msMatch[1], 10) : 180;
  return { command, ms, reason: 'token_parse', raw: text };
}

function clampAiDecision(decision, telemetry, gatewayId) {
  const cmd = String(decision?.command || 'stop').toLowerCase();
  const msRaw = Number.parseInt(String(decision?.ms ?? 180), 10);
  const ms = Number.isInteger(msRaw) ? Math.max(80, Math.min(1200, msRaw)) : 180;
  const frontAdc = Number(telemetry?.frontAdc);
  const gateway = readGatewayById(gatewayId);
  const thresholdRaw = Number(gateway?.irg?.esp32?.wifiObstacleFrontThreshold);
  const threshold = Number.isInteger(thresholdRaw) ? thresholdRaw : 1500;
  if (Number.isFinite(frontAdc) && frontAdc >= threshold && cmd === 'forward') {
    return {
      command: 'stop',
      ms: 120,
      reason: 'front_guard_block',
      raw: String(decision?.raw || '')
    };
  }
  if (!['forward', 'reverse', 'left', 'right', 'stop'].includes(cmd)) {
    return { command: 'stop', ms: 120, reason: 'invalid_command', raw: String(decision?.raw || '') };
  }
  return {
    command: cmd,
    ms,
    reason: String(decision?.reason || ''),
    raw: String(decision?.raw || '')
  };
}

async function requestAiDriveDecision(gatewayId, telemetry) {
  const gateway = readGatewayById(gatewayId);
  const esp32 = gateway?.irg?.esp32 || {};
  const agentId = String(esp32.wifiAiDriveAgentId || '').trim();
  if (!agentId) {
    throw new Error('AI drive requires a selected agent.');
  }
  if (typeof window.electronAPI?.sendToMoEAgent !== 'function') {
    throw new Error('sendToMoEAgent API unavailable.');
  }

  const objective = String(esp32.wifiAiDriveObjective || '').trim() || 'Explore safely and avoid obstacles.';
  const telemetryCompact = {
    rssi: Number.isFinite(Number(telemetry?.rssi)) ? Number(telemetry.rssi) : null,
    lastCmd: String(telemetry?.lastCmd || '').slice(0, 40),
    cmdAgeMs: Number.isFinite(Number(telemetry?.cmdAgeMs)) ? Number(telemetry.cmdAgeMs) : null,
    frontAdc: Number.isFinite(Number(telemetry?.frontAdc)) ? Number(telemetry.frontAdc) : null,
    guardThreshold: Number.isFinite(Number(telemetry?.guardThreshold)) ? Number(telemetry.guardThreshold) : null,
    guardBlocked: telemetry?.guardBlocked === true
  };

  const prompt = [
    'You are controlling an ESP32 skid-steer robot in short control ticks.',
    `Objective: ${objective}`,
    'Return EXACT JSON only, no prose.',
    'Allowed commands: forward, reverse, left, right, stop.',
    'Output schema: {"command":"forward|reverse|left|right|stop","ms":120-700,"reason":"short"}',
    'Choose one command for the next tick only.',
    `Telemetry: ${JSON.stringify(telemetryCompact)}`
  ].join('\n');

  const result = await window.electronAPI.sendToMoEAgent(agentId, prompt);
  if (!result?.success) {
    throw new Error(String(result?.error || 'AI agent decision call failed'));
  }
  const responseText = String(result?.content || '').trim();
  return parseAiDriveDecision(responseText);
}

async function runGatewayEsp32AiDriveTick(gatewayId) {
  const state = readScanState(gatewayId);
  if (state.aiDriveRunning !== true || state.aiDriveBusy === true) return;
  state.aiDriveBusy = true;
  try {
    const telemetry = await fetchGatewayEsp32Telemetry(gatewayId);
    state.telemetryLive = telemetry;
    state.telemetryLiveAt = new Date().toISOString();

    const cmdAgeMs = Number(telemetry?.cmdAgeMs);
    if (!Number.isFinite(cmdAgeMs) || cmdAgeMs > 4500) {
      await sendGatewayEsp32Stop(gatewayId, { log: false });
      state.aiDriveLastDecision = 'stop 120ms (telemetry stale)';
      scheduleAiDriveNextTick(gatewayId, getAiDriveTickMs(gatewayId));
      return;
    }

    const rawDecision = await requestAiDriveDecision(gatewayId, telemetry);
    const decision = clampAiDecision(rawDecision, telemetry, gatewayId);
    state.aiDriveLastDecision = `${decision.command} ${decision.ms}ms${decision.reason ? ` (${decision.reason})` : ''}`;
    state.aiDriveLastResponse = String(rawDecision?.raw || '').slice(0, 220);

    if (decision.command === 'stop') {
      await sendGatewayEsp32Stop(gatewayId, { log: false });
    } else {
      await runGatewayEsp32TimedDrive(gatewayId, decision.command, decision.ms);
    }
    state.driveError = '';
  } catch (err) {
    state.driveError = String(err?.message || err || 'AI drive tick failed');
    esp32LogStatus(`[ESP32 AI] ${state.driveError}`, 'error');
  } finally {
    state.aiDriveBusy = false;
    esp32Render();
    if (state.aiDriveRunning === true) {
      scheduleAiDriveNextTick(gatewayId, getAiDriveTickMs(gatewayId));
    }
  }
}

function startGatewayEsp32AiDriveSession(gatewayId) {
  const state = readScanState(gatewayId);
  if (state.aiDriveRunning === true) return;
  const gateway = readGatewayById(gatewayId);
  const esp32 = gateway?.irg?.esp32 || {};
  if (esp32.wifiAiDriveEnabled !== true) {
    state.driveError = 'Enable AI Drive first.';
    esp32Render();
    return;
  }
  const agentId = String(esp32.wifiAiDriveAgentId || '').trim();
  if (!agentId) {
    state.driveError = 'Select an AI agent for drive session first.';
    esp32Render();
    return;
  }
  state.aiDriveRunning = true;
  state.aiDriveBusy = false;
  state.driveError = '';
  if (state.takeControl !== true) {
    setGatewayEsp32TakeControl(gatewayId, true);
  }
  esp32LogStatus(`[ESP32 AI] Drive session started with agent ${agentId}.`, 'success');
  esp32Render();
  scheduleAiDriveNextTick(gatewayId, 40);
}

function stopGatewayEsp32AiDriveSession(gatewayId, options = {}) {
  const state = readScanState(gatewayId);
  if (state.aiDriveRunning !== true && !state.aiDriveTickTimer) {
    if (options.forceStop === true) {
      sendGatewayEsp32Stop(gatewayId, { log: false });
    }
    return;
  }
  state.aiDriveRunning = false;
  state.aiDriveBusy = false;
  clearAiDriveTimer(state);
  sendGatewayEsp32Stop(gatewayId, { log: false });
  if (options.silent !== true) {
    esp32LogStatus('[ESP32 AI] Drive session stopped.', 'info');
  }
  esp32Render();
}

window.startGatewayEsp32AiDriveSession = startGatewayEsp32AiDriveSession;
window.stopGatewayEsp32AiDriveSession = stopGatewayEsp32AiDriveSession;
