/**
 * MoE Pipeline Ops Updates - Gateway IRG
 * Extracted from moe-pipeline-ops-updates.js
 */
function ensureGatewayIrg(gateway) {
  if (!gateway.irg || typeof gateway.irg !== 'object') {
    gateway.irg = {};
  }
  if (!gateway.irg.entryMode) {
    gateway.irg.entryMode = 'deterministic-first';
  }
  if (!gateway.irg.deterministicFallbackMode) {
    gateway.irg.deterministicFallbackMode = 'on-gaps-or-low-confidence';
  }
  if (!Number.isFinite(Number(gateway.irg.deterministicConfidenceThreshold))) {
    gateway.irg.deterministicConfidenceThreshold = 0.9;
  }
  if (!gateway.irg.executeMode) {
    gateway.irg.executeMode = 'live';
  }
  if (typeof gateway.irg.requireLlmPlanForLive !== 'boolean') {
    gateway.irg.requireLlmPlanForLive = false;
  }
  if (typeof gateway.irg.autoExecuteLive !== 'boolean') {
    gateway.irg.autoExecuteLive = true;
  }
  if (!gateway.irg.live || typeof gateway.irg.live !== 'object') {
    gateway.irg.live = { executor: 'mpremote', timeoutMs: 60000 };
  }
  if (!Array.isArray(gateway.irg.targets) || gateway.irg.targets.length === 0) {
    gateway.irg.targets = ['raspberry-pi-pico', 'esp32'];
  }
  if (!gateway.irg.pico || typeof gateway.irg.pico !== 'object') {
    gateway.irg.pico = { defaultGpio: 25, defaultPeriodMs: 500, defaultIterations: 20 };
  }
  if (!gateway.irg.esp32 || typeof gateway.irg.esp32 !== 'object') {
    gateway.irg.esp32 = {
      fqbn: 'esp32:esp32:esp32',
      sketchName: 'psf_irg_esp32',
      compileTimeoutMs: 180000,
      uploadTimeoutMs: 120000,
      monitorBaudRate: 115200,
      wifiSsid: '',
      wifiPassword: '',
      wifiHost: '',
      wifiPort: 8080,
      wifiTimeoutMs: 5000,
      wifiDriveSpeed: 170,
      wifiDriveSwapSides: false,
      wifiDriveInvertLeft: false,
      wifiDriveInvertRight: false,
      wifiNumControlsEnabled: false,
      wifiAiDriveEnabled: false,
      wifiAiDriveAgentId: '',
      wifiAiDriveObjective: 'Explore safely and avoid obstacles.',
      wifiAiDriveTickMs: 420,
      wifiDriveMapForward: 'turn_left',
      wifiDriveMapReverse: 'turn_right',
      wifiDriveMapLeft: 'rev',
      wifiDriveMapRight: 'fwd',
      wifiObstacleFrontThreshold: 1500,
      wifiCameraEnabled: false,
      wifiCameraSsid: '',
      wifiCameraPassword: '',
      wifiCameraHost: '',
      wifiCameraPort: 81,
      wifiCameraStreamPath: '/stream',
      wifiCameraSnapshotPath: '/capture',
      wifiCameraFlashStatusPath: '/health',
      wifiCameraFqbn: 'esp32:esp32:esp32cam',
      wifiCameraBoardProfile: 'ai-thinker-esp32cam',
      wifiCameraStaticEnabled: false,
      wifiCameraStaticIp: '',
      wifiCameraStaticCidr: 24,
      wifiCameraStaticGatewayEnabled: false,
      wifiCameraStaticGateway: '',
      wifiStaticEnabled: false,
      wifiStaticIp: '',
      wifiStaticCidr: 24,
      wifiStaticGatewayEnabled: false,
      wifiStaticGateway: ''
    };
  } else {
    if (typeof gateway.irg.esp32.wifiSsid !== 'string') gateway.irg.esp32.wifiSsid = '';
    if (typeof gateway.irg.esp32.wifiPassword !== 'string') gateway.irg.esp32.wifiPassword = '';
    if (typeof gateway.irg.esp32.wifiHost !== 'string') gateway.irg.esp32.wifiHost = '';
    if (!Number.isInteger(Number(gateway.irg.esp32.wifiPort))) gateway.irg.esp32.wifiPort = 8080;
    if (!Number.isInteger(Number(gateway.irg.esp32.wifiTimeoutMs))) gateway.irg.esp32.wifiTimeoutMs = 5000;
    if (!Number.isInteger(Number(gateway.irg.esp32.wifiDriveSpeed))) gateway.irg.esp32.wifiDriveSpeed = 170;
    if (typeof gateway.irg.esp32.wifiDriveSwapSides !== 'boolean') gateway.irg.esp32.wifiDriveSwapSides = false;
    if (typeof gateway.irg.esp32.wifiDriveInvertLeft !== 'boolean') gateway.irg.esp32.wifiDriveInvertLeft = false;
    if (typeof gateway.irg.esp32.wifiDriveInvertRight !== 'boolean') gateway.irg.esp32.wifiDriveInvertRight = false;
    if (typeof gateway.irg.esp32.wifiNumControlsEnabled !== 'boolean') gateway.irg.esp32.wifiNumControlsEnabled = false;
    if (typeof gateway.irg.esp32.wifiAiDriveEnabled !== 'boolean') gateway.irg.esp32.wifiAiDriveEnabled = false;
    if (typeof gateway.irg.esp32.wifiAiDriveAgentId !== 'string') gateway.irg.esp32.wifiAiDriveAgentId = '';
    if (typeof gateway.irg.esp32.wifiAiDriveObjective !== 'string') gateway.irg.esp32.wifiAiDriveObjective = 'Explore safely and avoid obstacles.';
    if (!Number.isInteger(Number(gateway.irg.esp32.wifiAiDriveTickMs))) gateway.irg.esp32.wifiAiDriveTickMs = 420;
    if (typeof gateway.irg.esp32.wifiDriveMapForward !== 'string') gateway.irg.esp32.wifiDriveMapForward = 'turn_left';
    if (typeof gateway.irg.esp32.wifiDriveMapReverse !== 'string') gateway.irg.esp32.wifiDriveMapReverse = 'turn_right';
    if (typeof gateway.irg.esp32.wifiDriveMapLeft !== 'string') gateway.irg.esp32.wifiDriveMapLeft = 'rev';
    if (typeof gateway.irg.esp32.wifiDriveMapRight !== 'string') gateway.irg.esp32.wifiDriveMapRight = 'fwd';
    if (!Number.isInteger(Number(gateway.irg.esp32.wifiObstacleFrontThreshold))) gateway.irg.esp32.wifiObstacleFrontThreshold = 1500;
    if (typeof gateway.irg.esp32.wifiCameraEnabled !== 'boolean') gateway.irg.esp32.wifiCameraEnabled = false;
    if (typeof gateway.irg.esp32.wifiCameraSsid !== 'string') gateway.irg.esp32.wifiCameraSsid = '';
    if (typeof gateway.irg.esp32.wifiCameraPassword !== 'string') gateway.irg.esp32.wifiCameraPassword = '';
    if (typeof gateway.irg.esp32.wifiCameraHost !== 'string') gateway.irg.esp32.wifiCameraHost = '';
    if (!Number.isInteger(Number(gateway.irg.esp32.wifiCameraPort))) gateway.irg.esp32.wifiCameraPort = 81;
    if (typeof gateway.irg.esp32.wifiCameraStreamPath !== 'string') gateway.irg.esp32.wifiCameraStreamPath = '/stream';
    if (typeof gateway.irg.esp32.wifiCameraSnapshotPath !== 'string') gateway.irg.esp32.wifiCameraSnapshotPath = '/capture';
    if (typeof gateway.irg.esp32.wifiCameraFlashStatusPath !== 'string') gateway.irg.esp32.wifiCameraFlashStatusPath = '/health';
    if (typeof gateway.irg.esp32.wifiCameraFqbn !== 'string') gateway.irg.esp32.wifiCameraFqbn = 'esp32:esp32:esp32cam';
    if (typeof gateway.irg.esp32.wifiCameraBoardProfile !== 'string') gateway.irg.esp32.wifiCameraBoardProfile = 'ai-thinker-esp32cam';
    if (typeof gateway.irg.esp32.wifiCameraStaticEnabled !== 'boolean') gateway.irg.esp32.wifiCameraStaticEnabled = false;
    if (typeof gateway.irg.esp32.wifiCameraStaticIp !== 'string') gateway.irg.esp32.wifiCameraStaticIp = '';
    if (!Number.isInteger(Number(gateway.irg.esp32.wifiCameraStaticCidr))) gateway.irg.esp32.wifiCameraStaticCidr = 24;
    if (typeof gateway.irg.esp32.wifiCameraStaticGatewayEnabled !== 'boolean') gateway.irg.esp32.wifiCameraStaticGatewayEnabled = false;
    if (typeof gateway.irg.esp32.wifiCameraStaticGateway !== 'string') gateway.irg.esp32.wifiCameraStaticGateway = '';
    if (typeof gateway.irg.esp32.wifiStaticEnabled !== 'boolean') gateway.irg.esp32.wifiStaticEnabled = false;
    if (typeof gateway.irg.esp32.wifiStaticIp !== 'string') gateway.irg.esp32.wifiStaticIp = '';
    if (!Number.isInteger(Number(gateway.irg.esp32.wifiStaticCidr))) gateway.irg.esp32.wifiStaticCidr = 24;
    if (typeof gateway.irg.esp32.wifiStaticGatewayEnabled !== 'boolean') gateway.irg.esp32.wifiStaticGatewayEnabled = false;
    if (typeof gateway.irg.esp32.wifiStaticGateway !== 'string') gateway.irg.esp32.wifiStaticGateway = '';
  }
}

function updateGatewayIrgEntryMode(gatewayId, entryMode) {
  const gateway = window.modelOrderingState.moeItems.find(i => i.id === gatewayId && i.type === 'gateway');
  if (!gateway) return;
  ensureGatewayIrg(gateway);
  const normalized = String(entryMode || '').trim().toLowerCase();
  gateway.irg.entryMode = ['deterministic-first', 'llm-plan-first'].includes(normalized)
    ? normalized
    : 'deterministic-first';
  console.log('[MoE] Updated gateway IRG entry mode:', gatewayId, gateway.irg.entryMode);
  renderModelOrdering();
}

function updateGatewayIrgEnabled(gatewayId, enabled) {
  const gateway = window.modelOrderingState.moeItems.find(i => i.id === gatewayId && i.type === 'gateway');
  if (!gateway) return;
  ensureGatewayIrg(gateway);
  gateway.irg.enabled = enabled !== false;
  console.log('[MoE] Updated gateway IRG enabled:', gatewayId, gateway.irg.enabled);
  renderModelOrdering();
}

function updateGatewayIrgMode(gatewayId, mode) {
  const gateway = window.modelOrderingState.moeItems.find(i => i.id === gatewayId && i.type === 'gateway');
  if (!gateway) return;
  ensureGatewayIrg(gateway);
  const normalized = String(mode || '').trim().toLowerCase();
  gateway.irg.executeMode = ['simulate', 'live', 'disabled'].includes(normalized)
    ? normalized
    : 'live';
  console.log('[MoE] Updated gateway IRG mode:', gatewayId, gateway.irg.executeMode);
  renderModelOrdering();
}

function updateGatewayIrgFallbackMode(gatewayId, mode) {
  const gateway = window.modelOrderingState.moeItems.find(i => i.id === gatewayId && i.type === 'gateway');
  if (!gateway) return;
  ensureGatewayIrg(gateway);
  const normalized = String(mode || '').trim().toLowerCase();
  gateway.irg.deterministicFallbackMode = ['off', 'on-gaps', 'on-gaps-or-low-confidence'].includes(normalized)
    ? normalized
    : 'on-gaps-or-low-confidence';
  console.log('[MoE] Updated gateway IRG deterministic fallback mode:', gatewayId, gateway.irg.deterministicFallbackMode);
  renderModelOrdering();
}

function updateGatewayIrgConfidenceThreshold(gatewayId, value) {
  const gateway = window.modelOrderingState.moeItems.find(i => i.id === gatewayId && i.type === 'gateway');
  if (!gateway) return;
  ensureGatewayIrg(gateway);
  const parsed = Number.parseFloat(String(value));
  gateway.irg.deterministicConfidenceThreshold = Number.isFinite(parsed)
    ? Math.max(0, Math.min(1, parsed))
    : 0.9;
  console.log('[MoE] Updated gateway IRG deterministic confidence threshold:', gatewayId, gateway.irg.deterministicConfidenceThreshold);
  renderModelOrdering();
}

function updateGatewayIrgRequirePlan(gatewayId, enabled) {
  const gateway = window.modelOrderingState.moeItems.find(i => i.id === gatewayId && i.type === 'gateway');
  if (!gateway) return;
  ensureGatewayIrg(gateway);
  gateway.irg.requireLlmPlanForLive = enabled === true;
  console.log('[MoE] Updated gateway IRG strict LLM plan mode:', gatewayId, gateway.irg.requireLlmPlanForLive);
  renderModelOrdering();
}

function updateGatewayIrgAutoExecute(gatewayId, enabled) {
  const gateway = window.modelOrderingState.moeItems.find(i => i.id === gatewayId && i.type === 'gateway');
  if (!gateway) return;
  ensureGatewayIrg(gateway);
  gateway.irg.autoExecuteLive = enabled === true;
  console.log('[MoE] Updated gateway IRG auto-execute live:', gatewayId, gateway.irg.autoExecuteLive);
  renderModelOrdering();
}

function updateGatewayIrgLiveTimeout(gatewayId, timeoutMs) {
  const gateway = window.modelOrderingState.moeItems.find(i => i.id === gatewayId && i.type === 'gateway');
  if (!gateway) return;
  ensureGatewayIrg(gateway);
  const value = Number.parseInt(String(timeoutMs), 10);
  gateway.irg.live.timeoutMs = Number.isInteger(value) && value >= 2000
    ? Math.min(value, 300000)
    : 60000;
  console.log('[MoE] Updated gateway IRG live timeout:', gatewayId, gateway.irg.live.timeoutMs);
}

function updateGatewayIrgPicoConfig(gatewayId, key, value) {
  const gateway = window.modelOrderingState.moeItems.find(i => i.id === gatewayId && i.type === 'gateway');
  if (!gateway) return;
  ensureGatewayIrg(gateway);
  const parsed = Number.parseInt(String(value), 10);
  switch (key) {
    case 'defaultGpio':
      gateway.irg.pico.defaultGpio = Number.isInteger(parsed) && parsed >= 0 ? Math.min(parsed, 28) : 25;
      break;
    case 'defaultPeriodMs':
      gateway.irg.pico.defaultPeriodMs = Number.isInteger(parsed) && parsed >= 50 ? Math.min(parsed, 10000) : 500;
      break;
    case 'defaultIterations':
      gateway.irg.pico.defaultIterations = Number.isInteger(parsed) && parsed >= 1 ? Math.min(parsed, 10000) : 20;
      break;
    default:
      return;
  }
  console.log('[MoE] Updated gateway IRG pico config:', gatewayId, key, gateway.irg.pico[key]);
  renderModelOrdering();
}

function updateGatewayIrgEsp32Config(gatewayId, key, value) {
  const gateway = window.modelOrderingState.moeItems.find(i => i.id === gatewayId && i.type === 'gateway');
  if (!gateway) return;
  ensureGatewayIrg(gateway);
  switch (key) {
    case 'wifiSsid':
      gateway.irg.esp32.wifiSsid = String(value || '');
      break;
    case 'wifiPassword':
      gateway.irg.esp32.wifiPassword = String(value || '');
      break;
    case 'wifiHost':
      gateway.irg.esp32.wifiHost = String(value || '').trim();
      break;
    case 'wifiPort': {
      const parsedPort = Number.parseInt(String(value), 10);
      gateway.irg.esp32.wifiPort = Number.isInteger(parsedPort) && parsedPort >= 1
        ? Math.min(parsedPort, 65535)
        : 8080;
      break;
    }
    case 'wifiTimeoutMs': {
      const parsedTimeout = Number.parseInt(String(value), 10);
      gateway.irg.esp32.wifiTimeoutMs = Number.isInteger(parsedTimeout) && parsedTimeout >= 1000
        ? Math.min(parsedTimeout, 60000)
        : 5000;
      break;
    }
    case 'wifiDriveSpeed': {
      const parsedSpeed = Number.parseInt(String(value), 10);
      gateway.irg.esp32.wifiDriveSpeed = Number.isInteger(parsedSpeed) && parsedSpeed >= 40
        ? Math.min(parsedSpeed, 255)
        : 170;
      break;
    }
    case 'wifiDriveSwapSides':
      gateway.irg.esp32.wifiDriveSwapSides = value === true;
      break;
    case 'wifiDriveInvertLeft':
      gateway.irg.esp32.wifiDriveInvertLeft = value === true;
      break;
    case 'wifiDriveInvertRight':
      gateway.irg.esp32.wifiDriveInvertRight = value === true;
      break;
    case 'wifiNumControlsEnabled':
      gateway.irg.esp32.wifiNumControlsEnabled = value === true;
      break;
    case 'wifiAiDriveEnabled':
      gateway.irg.esp32.wifiAiDriveEnabled = value === true;
      break;
    case 'wifiAiDriveAgentId':
      gateway.irg.esp32.wifiAiDriveAgentId = String(value || '').trim();
      break;
    case 'wifiAiDriveObjective':
      gateway.irg.esp32.wifiAiDriveObjective = String(value || '').trim() || 'Explore safely and avoid obstacles.';
      break;
    case 'wifiAiDriveTickMs': {
      const parsedTickMs = Number.parseInt(String(value), 10);
      gateway.irg.esp32.wifiAiDriveTickMs = Number.isInteger(parsedTickMs) && parsedTickMs >= 200
        ? Math.min(parsedTickMs, 2000)
        : 420;
      break;
    }
    case 'wifiDriveMapForward':
      gateway.irg.esp32.wifiDriveMapForward = String(value || 'turn_left').trim() || 'turn_left';
      break;
    case 'wifiDriveMapReverse':
      gateway.irg.esp32.wifiDriveMapReverse = String(value || 'turn_right').trim() || 'turn_right';
      break;
    case 'wifiDriveMapLeft':
      gateway.irg.esp32.wifiDriveMapLeft = String(value || 'rev').trim() || 'rev';
      break;
    case 'wifiDriveMapRight':
      gateway.irg.esp32.wifiDriveMapRight = String(value || 'fwd').trim() || 'fwd';
      break;
    case 'wifiObstacleFrontThreshold': {
      const parsedThreshold = Number.parseInt(String(value), 10);
      gateway.irg.esp32.wifiObstacleFrontThreshold = Number.isInteger(parsedThreshold) && parsedThreshold >= 200
        ? Math.min(parsedThreshold, 4095)
        : 1500;
      break;
    }
    case 'wifiCameraEnabled':
      gateway.irg.esp32.wifiCameraEnabled = value === true;
      break;
    case 'wifiCameraSsid':
      gateway.irg.esp32.wifiCameraSsid = String(value || '');
      break;
    case 'wifiCameraPassword':
      gateway.irg.esp32.wifiCameraPassword = String(value || '');
      break;
    case 'wifiCameraHost':
      gateway.irg.esp32.wifiCameraHost = String(value || '').trim();
      break;
    case 'wifiCameraPort': {
      const parsedCameraPort = Number.parseInt(String(value), 10);
      gateway.irg.esp32.wifiCameraPort = Number.isInteger(parsedCameraPort) && parsedCameraPort >= 1
        ? Math.min(parsedCameraPort, 65535)
        : 81;
      break;
    }
    case 'wifiCameraStreamPath': {
      const path = String(value || '').trim();
      gateway.irg.esp32.wifiCameraStreamPath = path ? (path.startsWith('/') ? path : `/${path}`) : '/stream';
      break;
    }
    case 'wifiCameraSnapshotPath': {
      const path = String(value || '').trim();
      gateway.irg.esp32.wifiCameraSnapshotPath = path ? (path.startsWith('/') ? path : `/${path}`) : '/capture';
      break;
    }
    case 'wifiCameraFlashStatusPath': {
      const path = String(value || '').trim();
      gateway.irg.esp32.wifiCameraFlashStatusPath = path ? (path.startsWith('/') ? path : `/${path}`) : '/health';
      break;
    }
    case 'wifiCameraFqbn':
      gateway.irg.esp32.wifiCameraFqbn = String(value || '').trim() || 'esp32:esp32:esp32cam';
      break;
    case 'wifiCameraBoardProfile': {
      const profile = String(value || '').trim().toLowerCase();
      gateway.irg.esp32.wifiCameraBoardProfile = profile || 'ai-thinker-esp32cam';
      // Nudge FQBN to the recommended default for the selected profile.
      if (profile === 'elegoo-esp32s3-camera-v1') {
        gateway.irg.esp32.wifiCameraFqbn = 'esp32:esp32:esp32s3';
      } else if (profile === 'ai-thinker-esp32cam') {
        gateway.irg.esp32.wifiCameraFqbn = 'esp32:esp32:esp32cam';
      }
      break;
    }
    case 'wifiCameraStaticEnabled':
      gateway.irg.esp32.wifiCameraStaticEnabled = value === true;
      break;
    case 'wifiCameraStaticIp':
      gateway.irg.esp32.wifiCameraStaticIp = String(value || '').trim();
      break;
    case 'wifiCameraStaticCidr': {
      const parsedCameraCidr = Number.parseInt(String(value), 10);
      gateway.irg.esp32.wifiCameraStaticCidr = Number.isInteger(parsedCameraCidr) && parsedCameraCidr >= 0
        ? Math.min(parsedCameraCidr, 32)
        : 24;
      break;
    }
    case 'wifiCameraStaticGatewayEnabled':
      gateway.irg.esp32.wifiCameraStaticGatewayEnabled = value === true;
      break;
    case 'wifiCameraStaticGateway':
      gateway.irg.esp32.wifiCameraStaticGateway = String(value || '').trim();
      break;
    case 'wifiStaticEnabled':
      gateway.irg.esp32.wifiStaticEnabled = value === true;
      break;
    case 'wifiStaticIp':
      gateway.irg.esp32.wifiStaticIp = String(value || '').trim();
      break;
    case 'wifiStaticCidr': {
      const parsedCidr = Number.parseInt(String(value), 10);
      gateway.irg.esp32.wifiStaticCidr = Number.isInteger(parsedCidr) && parsedCidr >= 0
        ? Math.min(parsedCidr, 32)
        : 24;
      break;
    }
    case 'wifiStaticGatewayEnabled':
      gateway.irg.esp32.wifiStaticGatewayEnabled = value === true;
      break;
    case 'wifiStaticGateway':
      gateway.irg.esp32.wifiStaticGateway = String(value || '').trim();
      break;
    default:
      return;
  }
  console.log('[MoE] Updated gateway IRG esp32 config:', gatewayId, key, gateway.irg.esp32[key]);
  renderModelOrdering();
}


window.updateGatewayIrgEntryMode = updateGatewayIrgEntryMode;
window.updateGatewayIrgEnabled = updateGatewayIrgEnabled;
window.updateGatewayIrgMode = updateGatewayIrgMode;
window.updateGatewayIrgFallbackMode = updateGatewayIrgFallbackMode;
window.updateGatewayIrgConfidenceThreshold = updateGatewayIrgConfidenceThreshold;
window.updateGatewayIrgRequirePlan = updateGatewayIrgRequirePlan;
window.updateGatewayIrgAutoExecute = updateGatewayIrgAutoExecute;
window.updateGatewayIrgLiveTimeout = updateGatewayIrgLiveTimeout;
window.updateGatewayIrgPicoConfig = updateGatewayIrgPicoConfig;
window.updateGatewayIrgEsp32Config = updateGatewayIrgEsp32Config;
window.ensureGatewayIrg = ensureGatewayIrg;
