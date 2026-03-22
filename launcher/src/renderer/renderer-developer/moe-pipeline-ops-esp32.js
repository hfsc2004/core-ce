/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */

const moeEsp32WifiScanStateByGateway = Object.create(null);

function readGatewayById(gatewayId) {
  const items = Array.isArray(window.modelOrderingState?.moeItems)
    ? window.modelOrderingState.moeItems
    : [];
  return items.find((item) => item?.type === 'gateway' && item.id === gatewayId) || null;
}

function listEsp32GatewayIds() {
  const items = Array.isArray(window.modelOrderingState?.moeItems)
    ? window.modelOrderingState.moeItems
    : [];
  return items
    .filter((item) => item?.type === 'gateway')
    .map((item) => item.id);
}

function readScanState(gatewayId) {
  if (!moeEsp32WifiScanStateByGateway[gatewayId]) {
    moeEsp32WifiScanStateByGateway[gatewayId] = {
      busy: false,
      error: '',
      networks: [],
      scannedAt: '',
      passwordVisible: false,
      flashing: false,
      flashMessage: '',
      applying: false,
      applyMessage: '',
      driveActive: false,
      driveDirection: '',
      driveSpeed: 170,
      driveError: '',
      driveApplying: false,
      driveApplyMessage: '',
      driveDemoRunning: false,
      aiDriveRunning: false,
      aiDriveBusy: false,
      aiDriveTickTimer: null,
      aiDriveLastDecision: '',
      aiDriveLastResponse: '',
      driveLastCommand: '',
      driveLastAt: '',
      takeControl: false,
      telemetryLive: null,
      telemetryLiveAt: '',
      cameraBusy: false,
      cameraError: '',
      cameraMessage: '',
      cameraLastSketch: '',
      cameraLastUrl: '',
      cameraLastOkAt: '',
      drivePulseTimer: null,
      driveReleaseHandler: null,
      telemetryTimer: null
    };
  }
  return moeEsp32WifiScanStateByGateway[gatewayId];
}

function sleep(ms) {
  const delayMs = Number.isFinite(Number(ms)) ? Math.max(0, Number(ms)) : 0;
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}


function getGatewayEsp32Target(gatewayId) {
  const gateway = readGatewayById(gatewayId);
  if (!gateway) return null;
  const esp32 = gateway?.irg?.esp32 || {};
  const host = String(esp32.wifiHost || '').trim();
  const port = Number(esp32.wifiPort);
  const timeoutMs = Number(esp32.wifiTimeoutMs);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return {
    host,
    port,
    timeoutMs: Number.isFinite(timeoutMs) ? Math.max(1000, Math.min(60000, timeoutMs)) : 5000
  };
}

async function runGatewayEsp32Http(gatewayId, path, intent, options = {}) {
  if (!window.electronAPI?.runMoEIrgContract) {
    throw new Error('IRG contract API unavailable.');
  }
  const target = getGatewayEsp32Target(gatewayId);
  if (!target) {
    throw new Error('Set ESP32 Wi-Fi host and port first.');
  }
  const timeoutMs = Number.isFinite(Number(options.timeoutMs))
    ? Math.max(800, Math.min(30000, Number(options.timeoutMs)))
    : target.timeoutMs;
  const method = String(options.method || 'GET').trim().toUpperCase() || 'GET';
  const contract = {
    contractVersion: '1.0',
    target: 'esp32',
    action: 'esp32_wifi_http',
    params: {
      host: target.host,
      port: target.port,
      method,
      path,
      timeoutMs,
      intent: String(intent || 'esp32-http')
    }
  };
  return window.electronAPI.runMoEIrgContract(contract, { irgModeOverride: 'live' });
}

function resolveDriveFailure(result, fallbackMessage) {
  const fallback = String(fallbackMessage || 'Drive command failed');
  const raw = String(result?.irg?.execution?.output?.http || '').trim();
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.reason === 'front_obstacle' || parsed?.blocked === true) {
      const adc = Number(parsed?.frontAdc);
      return Number.isFinite(adc)
        ? `Blocked by front obstacle (frontAdc=${adc})`
        : 'Blocked by front obstacle';
    }
  } catch {
    // no-op
  }
  return fallback;
}
