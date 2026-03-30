/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */

function normalizeDriveCmdToken(rawValue, fallback = 'stop') {
  const value = String(rawValue || '').trim().toLowerCase();
  if (value === 'fwd' || value === 'forward') return 'fwd';
  if (value === 'rev' || value === 'reverse') return 'rev';
  if (value === 'turn_left' || value === 'left' || value === 'turn-left') return 'turn_left';
  if (value === 'turn_right' || value === 'right' || value === 'turn-right') return 'turn_right';
  if (value === 'stop') return 'stop';
  return fallback;
}

function getGatewayDriveMap(gatewayId) {
  const gateway = readGatewayById(gatewayId);
  const esp32 = gateway?.irg?.esp32 || {};
  return {
    forward: normalizeDriveCmdToken(esp32.wifiDriveMapForward, 'turn_left'),
    reverse: normalizeDriveCmdToken(esp32.wifiDriveMapReverse, 'turn_right'),
    left: normalizeDriveCmdToken(esp32.wifiDriveMapLeft, 'rev'),
    right: normalizeDriveCmdToken(esp32.wifiDriveMapRight, 'fwd')
  };
}

function buildDriveCmdPath(gatewayId, direction, speed) {
  const s = Math.max(0, Math.min(255, Number(speed) || 0));
  const map = getGatewayDriveMap(gatewayId);
  const logical = String(direction || '').toLowerCase();
  const token = normalizeDriveCmdToken(map[logical] || 'stop', 'stop');
  switch (token) {
    case 'fwd':
      return `/cmd?fwd=${s}`;
    case 'rev':
      return `/cmd?rev=${s}`;
    case 'turn_left':
      return `/cmd?turn=-${s}`;
    case 'turn_right':
      return `/cmd?turn=${s}`;
    default:
      return '/cmd?stop=1';
  }
}

function clearDrivePulseTimer(state) {
  if (state?.drivePulseTimer) {
    clearInterval(state.drivePulseTimer);
    state.drivePulseTimer = null;
  }
}

function clearTelemetryTimer(state) {
  if (state?.telemetryTimer) {
    clearInterval(state.telemetryTimer);
    state.telemetryTimer = null;
  }
}

function esp32RenderThrottled(state, minIntervalMs = 900) {
  const now = Date.now();
  const last = Number(state?.lastUiRenderAtMs || 0);
  if (Number.isFinite(last) && (now - last) < minIntervalMs) return;
  if (state && typeof state === 'object') {
    state.lastUiRenderAtMs = now;
  }
  esp32Render();
}

function bindDriveReleaseHandlers(gatewayId, state) {
  if (typeof window === 'undefined' || !window.addEventListener) return;
  if (typeof state.driveReleaseHandler === 'function') return;
  const handler = () => {
    stopGatewayEsp32Drive(gatewayId);
  };
  state.driveReleaseHandler = handler;
  window.addEventListener('pointerup', handler);
  window.addEventListener('pointercancel', handler);
  window.addEventListener('blur', handler);
}

function unbindDriveReleaseHandlers(state) {
  if (typeof window === 'undefined' || !window.removeEventListener) return;
  if (typeof state?.driveReleaseHandler !== 'function') return;
  window.removeEventListener('pointerup', state.driveReleaseHandler);
  window.removeEventListener('pointercancel', state.driveReleaseHandler);
  window.removeEventListener('blur', state.driveReleaseHandler);
  state.driveReleaseHandler = null;
}

function setGatewayEsp32DriveSpeed(gatewayId, value) {
  const state = readScanState(gatewayId);
  const parsed = Number.parseInt(String(value), 10);
  state.driveSpeed = Number.isInteger(parsed) ? Math.max(40, Math.min(255, parsed)) : 170;
  if (typeof window.updateGatewayIrgEsp32Config === 'function') {
    window.updateGatewayIrgEsp32Config(gatewayId, 'wifiDriveSpeed', state.driveSpeed);
    return;
  }
  esp32Render();
}

async function applyGatewayEsp32DriveConfig(gatewayId) {
  const gateway = readGatewayById(gatewayId);
  if (!gateway) return;
  const esp32 = gateway?.irg?.esp32 || {};
  const swap = esp32.wifiDriveSwapSides === true ? '1' : '0';
  const invertLeft = esp32.wifiDriveInvertLeft === true ? '1' : '0';
  const invertRight = esp32.wifiDriveInvertRight === true ? '1' : '0';
  const frontThreshold = Number.isInteger(Number(esp32.wifiObstacleFrontThreshold))
    ? Math.max(200, Math.min(4095, Number(esp32.wifiObstacleFrontThreshold)))
    : 1500;
  const path = `/config/drive?swap=${swap}&invertLeft=${invertLeft}&invertRight=${invertRight}&frontThreshold=${frontThreshold}`;
  const state = readScanState(gatewayId);
  state.driveApplying = true;
  state.driveApplyMessage = 'Applying drive mapping...';
  state.driveError = '';
  esp32LogStatus('[ESP32 Drive] Applying runtime drive mapping...', 'info');
  esp32Render();
  try {
    const result = await runGatewayEsp32Http(gatewayId, path, 'config-drive', { timeoutMs: 2200 });
    if (!result?.success) {
      throw new Error(String(result?.error || result?.response || 'Drive config apply failed'));
    }
    state.driveError = '';
    state.driveApplyMessage = 'Drive mapping applied.';
    esp32LogStatus('[ESP32 Drive] Runtime drive config applied.', 'success');
  } catch (err) {
    state.driveError = String(err?.message || err || 'Drive config apply failed');
    state.driveApplyMessage = 'Drive mapping apply failed.';
    esp32LogStatus(`[ESP32 Drive] Runtime drive config failed: ${state.driveError}`, 'error');
  } finally {
    state.driveApplying = false;
    esp32Render();
  }
}

async function fetchGatewayEsp32Telemetry(gatewayId) {
  const result = await runGatewayEsp32Http(gatewayId, '/telemetry', 'telemetry-live', { timeoutMs: 1400 });
  if (!result?.success) {
    throw new Error(String(result?.error || result?.response || 'Telemetry failed'));
  }
  const raw = String(result?.irg?.execution?.output?.http || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

function setGatewayEsp32TakeControl(gatewayId, enabled) {
  const state = readScanState(gatewayId);
  const take = enabled === true;
  state.takeControl = take;
  if (typeof window.updateGatewayIrgEsp32Config === 'function') {
    window.updateGatewayIrgEsp32Config(gatewayId, 'wifiTakeControl', take);
  }

  if (!take) {
    if (typeof stopGatewayEsp32AiDriveSession === 'function') {
      stopGatewayEsp32AiDriveSession(gatewayId, { silent: true });
    }
    clearTelemetryTimer(state);
    state.telemetryLive = null;
    state.telemetryLiveAt = '';
    sendGatewayEsp32Stop(gatewayId, { log: false });
    esp32LogStatus('[ESP32 Drive] Control released.', 'info');
    esp32Render();
    return;
  }

  const poll = async () => {
    try {
      const telemetry = await fetchGatewayEsp32Telemetry(gatewayId);
      state.telemetryLive = telemetry;
      state.telemetryLiveAt = new Date().toISOString();
    } catch (err) {
      state.telemetryLive = null;
      state.telemetryLiveAt = '';
      state.driveError = String(err?.message || err || 'Telemetry poll failed');
    } finally {
      esp32RenderThrottled(state, 1200);
    }
  };

  clearTelemetryTimer(state);
  state.telemetryTimer = setInterval(poll, 1200);
  poll();
  esp32LogStatus('[ESP32 Drive] Control taken. Live telemetry stream enabled.', 'success');
  esp32Render();
}

async function runGatewayEsp32TimedDrive(gatewayId, direction, durationMs, speedOverride = null) {
  const state = readScanState(gatewayId);
  if (state.takeControl !== true) {
    setGatewayEsp32TakeControl(gatewayId, true);
  }
  const gateway = readGatewayById(gatewayId);
  const configuredDriveSpeed = Number(gateway?.irg?.esp32?.wifiDriveSpeed);
  const requestedSpeed = Number.isInteger(Number(speedOverride))
    ? Math.max(40, Math.min(255, Number(speedOverride)))
    : (Number.isInteger(configuredDriveSpeed) ? Math.max(40, Math.min(255, Math.trunc(configuredDriveSpeed))) : state.driveSpeed);
  const dur = Math.max(100, Math.min(5000, Number(durationMs) || 1000));
  const dir = String(direction || '').toLowerCase();
  const stallSafeCruiseFloor = (dir === 'forward' || dir === 'reverse') ? 205 : 190;
  const speed = Math.max(requestedSpeed, stallSafeCruiseFloor);
  const buildPulsePath = (spd) => buildDriveCmdPath(gatewayId, direction, spd);

  const boostSpeed = Math.max(speed, 230);
  const shouldBoost = dur >= 700 && boostSpeed > speed;
  const boostMs = shouldBoost ? Math.min(320, Math.max(140, Math.round(dur * 0.2))) : 0;
  const cruiseMs = shouldBoost ? Math.max(80, dur - boostMs) : dur;
  const pulseEveryMs = 170;

  const runPulseSegment = async (segmentSpeed, segmentMs, intentLabel) => {
    const start = Date.now();
    while ((Date.now() - start) < segmentMs) {
      const path = buildPulsePath(segmentSpeed);
      const result = await runGatewayEsp32Http(gatewayId, path, intentLabel, { timeoutMs: 1400 });
      if (!result?.success) {
        throw new Error(resolveDriveFailure(result, 'Timed drive pulse failed'));
      }
      const remain = segmentMs - (Date.now() - start);
      if (remain <= 0) break;
      await sleep(Math.min(pulseEveryMs, remain));
    }
  };

  try {
    if (shouldBoost) {
      await runPulseSegment(boostSpeed, boostMs, `timed-${direction}-boost`);
      await sleep(35);
    }

    await runPulseSegment(speed, cruiseMs, `timed-${direction}`);
    await sendGatewayEsp32Stop(gatewayId, { log: false });
    state.driveLastCommand = `${String(direction || '').toLowerCase()}@${speed}${shouldBoost ? ` (boost ${boostSpeed})` : ''} for ${dur}ms`;
    state.driveLastAt = new Date().toISOString();
    state.driveError = '';
    esp32LogStatus(
      `[ESP32 Drive] Timed ${direction} ${dur}ms at ${speed}${shouldBoost ? ` (launch boost ${boostSpeed})` : ''} complete.`,
      'success'
    );
  } catch (err) {
    state.driveError = String(err?.message || err || 'Timed drive failed');
    esp32LogStatus(`[ESP32 Drive] Timed ${direction} failed: ${state.driveError}`, 'error');
  } finally {
    esp32Render();
  }
}

async function runGatewayEsp32WiggleTest(gatewayId) {
  await runGatewayEsp32TimedDrive(gatewayId, 'left', 350);
  await sleep(120);
  await runGatewayEsp32TimedDrive(gatewayId, 'right', 350);
  await sleep(120);
  await runGatewayEsp32TimedDrive(gatewayId, 'stop', 200);
}

async function runGatewayEsp32DemoDrive(gatewayId) {
  const state = readScanState(gatewayId);
  if (state.driveDemoRunning === true) return;
  state.driveDemoRunning = true;
  esp32LogStatus('[ESP32 Drive] Demo: forward, stop, left, stop, right, stop.', 'info');
  esp32Render();
  try {
    if (state.takeControl !== true) {
      setGatewayEsp32TakeControl(gatewayId, true);
    }

    await runGatewayEsp32TimedDrive(gatewayId, 'forward', 350);
    await sleep(200);
    await sendGatewayEsp32Stop(gatewayId, { log: false });
    await sleep(120);

    await runGatewayEsp32TimedDrive(gatewayId, 'left', 180);
    await sleep(150);
    await sendGatewayEsp32Stop(gatewayId, { log: false });
    await sleep(120);

    await runGatewayEsp32TimedDrive(gatewayId, 'right', 180);
    await sleep(150);
    await sendGatewayEsp32Stop(gatewayId, { log: false });

    state.driveLastCommand = 'demo-sequence';
    state.driveLastAt = new Date().toISOString();
    esp32LogStatus('[ESP32 Drive] Demo complete.', 'success');
  } catch (err) {
    state.driveError = String(err?.message || err || 'Demo drive failed');
    esp32LogStatus(`[ESP32 Drive] Demo failed: ${state.driveError}`, 'error');
  } finally {
    state.driveDemoRunning = false;
    esp32Render();
  }
}

function runGatewayEsp32DriveCalibration(gatewayId) {
  const map = getGatewayDriveMap(gatewayId);
  const observed = {};
  const buttons = ['forward', 'left', 'right', 'reverse'];
  for (const button of buttons) {
    const response = window.prompt(
      `Calibration: when you press ${button.toUpperCase()}, what does the robot do?\n`
      + 'Type one: forward, reverse, left, right\n'
      + '(Leave blank to skip this step.)'
    );
    const normalized = String(response || '').trim().toLowerCase();
    if (!normalized) continue;
    if (!['forward', 'reverse', 'left', 'right'].includes(normalized)) continue;
    observed[normalized] = map[button];
  }

  const nextMap = { ...map };
  const desired = ['forward', 'reverse', 'left', 'right'];
  for (const key of desired) {
    if (observed[key]) {
      nextMap[key] = normalizeDriveCmdToken(observed[key], nextMap[key]);
    }
  }

  if (typeof window.updateGatewayIrgEsp32Config === 'function') {
    window.updateGatewayIrgEsp32Config(gatewayId, 'wifiDriveMapForward', nextMap.forward);
    window.updateGatewayIrgEsp32Config(gatewayId, 'wifiDriveMapReverse', nextMap.reverse);
    window.updateGatewayIrgEsp32Config(gatewayId, 'wifiDriveMapLeft', nextMap.left);
    window.updateGatewayIrgEsp32Config(gatewayId, 'wifiDriveMapRight', nextMap.right);
  }
  esp32LogStatus(
    `[ESP32 Drive] Calibration updated mapping: fwd=${nextMap.forward}, left=${nextMap.left}, right=${nextMap.right}, rev=${nextMap.reverse}`,
    'success'
  );
}

async function sendGatewayEsp32Stop(gatewayId, options = {}) {
  const state = readScanState(gatewayId);
  clearDrivePulseTimer(state);
  unbindDriveReleaseHandlers(state);
  state.driveActive = false;
  state.driveDirection = '';
  state.driveError = '';
  try {
    const result = await runGatewayEsp32Http(gatewayId, '/cmd?stop=1', 'stop', { timeoutMs: 1800 });
    if (!result?.success) {
      throw new Error(resolveDriveFailure(result, String(result?.error || result?.response || 'Stop failed')));
    }
    state.driveLastCommand = 'stop';
    state.driveLastAt = new Date().toISOString();
    if (options.log !== false) {
      esp32LogStatus('[ESP32 Drive] Stop sent.', 'info');
    }
  } catch (err) {
    state.driveError = String(err?.message || err || 'Stop failed');
    esp32LogStatus(`[ESP32 Drive] Stop failed: ${state.driveError}`, 'error');
  } finally {
    esp32Render();
  }
}

function startGatewayEsp32Drive(gatewayId, direction) {
  const state = readScanState(gatewayId);
  if (state.takeControl !== true) {
    setGatewayEsp32TakeControl(gatewayId, true);
  }
  const gateway = readGatewayById(gatewayId);
  const configuredDriveSpeed = Number(gateway?.irg?.esp32?.wifiDriveSpeed);
  if (Number.isInteger(configuredDriveSpeed)) {
    state.driveSpeed = Math.max(40, Math.min(255, Math.trunc(configuredDriveSpeed)));
  }
  clearDrivePulseTimer(state);
  bindDriveReleaseHandlers(gatewayId, state);
  state.driveActive = true;
  state.driveDirection = String(direction || '').toLowerCase();
  state.driveError = '';
  const pulse = async () => {
    try {
      const path = buildDriveCmdPath(gatewayId, state.driveDirection, state.driveSpeed);
      const result = await runGatewayEsp32Http(gatewayId, path, `drive-${state.driveDirection}`, { timeoutMs: 1500 });
      if (!result?.success) {
        throw new Error(resolveDriveFailure(result, String(result?.error || result?.response || 'Drive command failed')));
      }
      state.driveLastCommand = `${state.driveDirection}@${state.driveSpeed}`;
      state.driveLastAt = new Date().toISOString();
    } catch (err) {
      state.driveError = String(err?.message || err || 'Drive command failed');
      clearDrivePulseTimer(state);
      state.driveActive = false;
      esp32LogStatus(`[ESP32 Drive] ${state.driveDirection} failed: ${state.driveError}`, 'error');
    } finally {
      esp32RenderThrottled(state, 900);
    }
  };

  pulse();
  state.drivePulseTimer = setInterval(() => {
    if (!state.driveActive) {
      clearDrivePulseTimer(state);
      return;
    }
    pulse();
  }, 180);
  esp32LogStatus(`[ESP32 Drive] Hold ${state.driveDirection} @ ${state.driveSpeed}. Release = stop.`, 'info');
  esp32Render();
}

function stopGatewayEsp32Drive(gatewayId) {
  sendGatewayEsp32Stop(gatewayId, { log: false });
}

window.startGatewayEsp32Drive = startGatewayEsp32Drive;
window.stopGatewayEsp32Drive = stopGatewayEsp32Drive;
window.sendGatewayEsp32Stop = sendGatewayEsp32Stop;
window.setGatewayEsp32DriveSpeed = setGatewayEsp32DriveSpeed;
window.applyGatewayEsp32DriveConfig = applyGatewayEsp32DriveConfig;
window.runGatewayEsp32DriveCalibration = runGatewayEsp32DriveCalibration;
window.setGatewayEsp32TakeControl = setGatewayEsp32TakeControl;
window.runGatewayEsp32TimedDrive = runGatewayEsp32TimedDrive;
window.runGatewayEsp32WiggleTest = runGatewayEsp32WiggleTest;
window.runGatewayEsp32DemoDrive = runGatewayEsp32DemoDrive;
