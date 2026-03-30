/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const gatewayAdapters = require('./moe-gateway-adapters');
const liveTools = require('./moe-irg-live-tools');
const {
  stripAnsi,
  applyEsp32NetworkOverridesToSketch,
  resolveEsp32UploadProfiles,
  detectArduinoCliUploadPropertySupport,
  ensureEsp32CoreInstalled,
  resolveMpremoteCommand,
  runHttpRequest,
  resolveArduinoCliCommand,
  buildArduinoCliCandidatePaths,
  runCommandAsync
} = liveTools;

function formatCommandForLog(bin, args = []) {
  const parts = [String(bin || '').trim(), ...args.map((arg) => String(arg ?? ''))].filter(Boolean);
  return parts.map((part) => {
    if (/^[A-Za-z0-9_./:@=+-]+$/.test(part)) return part;
    return `'${part.replace(/'/g, "'\\''")}'`;
  }).join(' ');
}

function resolveEsp32ChipArg(contract, fqbn) {
  const explicit = String(contract?.params?.chip || '').trim().toLowerCase();
  if (explicit) return explicit;
  const f = String(fqbn || '').toLowerCase();
  if (f.includes('esp32s3')) return 'esp32s3';
  if (f.includes('esp32s2')) return 'esp32s2';
  if (f.includes('esp32c3')) return 'esp32c3';
  if (f.includes('esp32c6')) return 'esp32c6';
  if (f.includes('esp32h2')) return 'esp32h2';
  return 'esp32';
}

function resolveManagedEsptoolPath(arduinoCliEnv = {}) {
  const projectRoot = path.resolve(__dirname, '..', '..', '..');
  const platformDir = process.platform === 'linux'
    ? (process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64')
    : (process.platform === 'darwin'
      ? (process.arch === 'arm64' ? 'macos-arm' : 'macos-intel')
      : (process.platform === 'win32'
        ? (process.arch === 'arm64' ? 'windows-arm64' : 'windows-x64')
        : ''));
  const managedVenvPath = process.platform === 'win32'
    ? path.join(projectRoot, 'binaries', 'esptool', platformDir, 'venv', 'Scripts', 'esptool.exe')
    : path.join(projectRoot, 'binaries', 'esptool', platformDir, 'venv', 'bin', 'esptool');
  try {
    if (platformDir && fs.existsSync(managedVenvPath)) return managedVenvPath;
  } catch {
    // ignore lookup errors
  }

  const dataDir = String(arduinoCliEnv?.ARDUINO_DIRECTORIES_DATA || '').trim();
  if (!dataDir) return null;
  const toolsRoot = path.join(dataDir, 'packages', 'esp32', 'tools', 'esptool_py');
  try {
    if (!fs.existsSync(toolsRoot)) return null;
    const dirs = fs.readdirSync(toolsRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
      .reverse();
    for (const dir of dirs) {
      const bin = process.platform === 'win32'
        ? path.join(toolsRoot, dir, 'esptool.exe')
        : path.join(toolsRoot, dir, 'esptool');
      if (fs.existsSync(bin)) return bin;
    }
  } catch {
    // ignore lookup errors
  }
  return null;
}

function resolveMergedBinPath(sketchName, compileStartAtMs = 0) {
  const root = path.join(os.tmpdir(), 'arduino', 'sketches');
  const targetName = `${String(sketchName || '').trim() || 'psf_irg_esp32'}.ino.merged.bin`;
  try {
    if (!fs.existsSync(root)) return null;
    const sketchDirs = fs.readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(root, d.name));
    let best = null;
    let bestMtime = -1;
    for (const dir of sketchDirs) {
      const candidate = path.join(dir, targetName);
      if (!fs.existsSync(candidate)) continue;
      const stat = fs.statSync(candidate);
      const mtime = Number(stat.mtimeMs || 0);
      if (compileStartAtMs && mtime + 5 < compileStartAtMs) continue;
      if (mtime > bestMtime) {
        best = candidate;
        bestMtime = mtime;
      }
    }
    return best;
  } catch {
    return null;
  }
}

function hashSha256(value) {
  try {
    return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
  } catch {
    return '';
  }
}

const ESP32_MIRROR_MAX_FILES = 3;
const ESP32_MIRROR_MAX_BYTES = 100 * 1024;

function truncateUtf8ToBytes(value, maxBytes = ESP32_MIRROR_MAX_BYTES) {
  const text = String(value || '');
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes <= maxBytes) return text;
  const marker = '\n\n[TRUNCATED]\n';
  const markerBytes = Buffer.byteLength(marker, 'utf8');
  const target = Math.max(0, maxBytes - markerBytes);
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const slice = text.slice(0, mid);
    const size = Buffer.byteLength(slice, 'utf8');
    if (size <= target) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo)}${marker}`;
}

function pruneOldMirrorFiles(dir, maxFiles = ESP32_MIRROR_MAX_FILES) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => path.join(dir, d.name))
      .map((filePath) => {
        let mtimeMs = 0;
        try { mtimeMs = Number(fs.statSync(filePath).mtimeMs || 0); } catch { }
        return { filePath, mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    const stale = entries.slice(Math.max(0, maxFiles));
    for (const item of stale) {
      try { fs.rmSync(item.filePath, { force: true }); } catch { }
    }
  } catch {
    // ignore pruning failures
  }
}

function buildEsp32MirrorDump({
  contract,
  policy,
  sketchName,
  sketchText,
  resolvedPort,
  fqbn,
  effectiveFqbn,
  result
} = {}) {
  try {
    const projectRoot = path.resolve(__dirname, '..', '..', '..');
    const dir = path.join(projectRoot, '.psf', 'logs', 'esp32-mirror');
    fs.mkdirSync(dir, { recursive: true });

    const stampIso = new Date().toISOString();
    const stampFile = stampIso.replace(/[:.]/g, '-');
    const status = result?.success ? 'success' : 'error';
    const base = `${stampFile}_${String(sketchName || 'psf_irg_esp32')}_${status}`;

    const sketchPath = path.join(dir, `${base}.ino`);
    const transcriptPath = path.join(dir, `${base}.log`);
    const jsonPath = path.join(dir, `${base}.json`);

    const output = result?.output || {};
    const runtimeSerialBody = String(output.runtimeSerial || '').trim() || '(no runtime serial captured)';
    const sections = [
      ['PREFLIGHT', output.preflight],
      ['ERASE', output.erase],
      ['COMPILE', output.compile],
      ['UPLOAD', output.upload],
      ['RUNTIME_SERIAL', runtimeSerialBody],
      ['STDOUT', output.stdout],
      ['STDERR', output.stderr],
      ['HTTP', output.http]
    ];
    const transcript = sections
      .filter(([, body]) => String(body || '').trim())
      .map(([label, body]) => `===== ${label} =====\n${String(body || '').trim()}`)
      .join('\n\n')
      .trim();

    fs.writeFileSync(sketchPath, truncateUtf8ToBytes(String(sketchText || '')), 'utf8');
    fs.writeFileSync(transcriptPath, truncateUtf8ToBytes(transcript || '(no command output captured)'), 'utf8');

    const payload = {
      at: stampIso,
      status,
      target: 'esp32',
      resolvedPort: String(resolvedPort || ''),
      fqbn: String(fqbn || ''),
      effectiveFqbn: String(effectiveFqbn || ''),
      reason: String(result?.reason || ''),
      metadata: result?.metadata || {},
      serial: result?.serial || {},
      sketch: {
        name: String(sketchName || ''),
        sha256: hashSha256(sketchText),
        bytes: Buffer.byteLength(String(sketchText || ''), 'utf8'),
        path: sketchPath
      },
      transcript: {
        path: transcriptPath
      },
      contract: contract || {},
      policy: policy || {}
    };
    fs.writeFileSync(jsonPath, truncateUtf8ToBytes(JSON.stringify(payload, null, 2)), 'utf8');
    pruneOldMirrorFiles(dir, ESP32_MIRROR_MAX_FILES);
    return { jsonPath, sketchPath, transcriptPath };
  } catch {
    return null;
  }
}

async function captureEsp32RuntimeSerialOnPort(port, timeoutMs = 20000, emit = null, monitorCommand = null) {
  const resolved = String(port || '').trim();
  if (!resolved) return '';
  await runCommandAsync('stty', ['-F', resolved, '115200', 'raw', '-echo'], {
    timeoutMs: 1500
  });
  // Allow USB CDC to re-enumerate and sketch boot logs to start.
  await new Promise((resolve) => setTimeout(resolve, 2500));
  const args = [resolved];
  if (typeof emit === 'function') {
    emit({ stage: 'runtime', level: 'info', line: `$ cat ${resolved}  (capturing runtime serial for ~${Math.max(1, Math.round(timeoutMs / 1000))}s)` });
  }
  const run = await runCommandAsync('cat', args, {
    timeoutMs,
    onStdout: (chunk) => {
      if (typeof emit === 'function') emit({ stage: 'runtime', stream: 'stdout', chunk: String(chunk || '') });
    },
    onStderr: (chunk) => {
      if (typeof emit === 'function') emit({ stage: 'runtime', stream: 'stderr', chunk: String(chunk || '') });
    }
  });
  const out = stripAnsi(`${String(run.stdout || '')}\n${String(run.stderr || '')}`).trim();
  if (out) return out;

  // Fallback: arduino-cli monitor can sometimes capture CDC output when plain cat cannot.
  const monitorBin = String(monitorCommand?.bin || '').trim();
  if (!monitorBin) return '';
  const monitorBaseArgs = Array.isArray(monitorCommand?.baseArgs) ? monitorCommand.baseArgs : [];
  const monitorArgs = [...monitorBaseArgs, 'monitor', '-p', resolved, '-c', 'baudrate=115200'];
  if (typeof emit === 'function') {
    emit({ stage: 'runtime', level: 'info', line: `$ ${formatCommandForLog(monitorBin, monitorArgs)}  (fallback capture)` });
  }
  const monitorRun = await runCommandAsync(monitorBin, monitorArgs, {
    timeoutMs: Math.max(2500, timeoutMs),
    onStdout: (chunk) => {
      if (typeof emit === 'function') emit({ stage: 'runtime', stream: 'stdout', chunk: String(chunk || '') });
    },
    onStderr: (chunk) => {
      if (typeof emit === 'function') emit({ stage: 'runtime', stream: 'stderr', chunk: String(chunk || '') });
    }
  });
  return stripAnsi(`${String(monitorRun.stdout || '')}\n${String(monitorRun.stderr || '')}`).trim();
}

async function captureEsp32RuntimeSerial(resolvedPort, timeoutMs = 20000, emit = null, availablePorts = [], monitorCommand = null) {
  const preferredPort = String(resolvedPort || '').trim();
  const discoveredPorts = Array.isArray(availablePorts)
    ? availablePorts
      .map((entry) => (entry && typeof entry === 'object' ? entry.path : entry))
      .map((entry) => String(entry || '').trim())
      .filter(Boolean)
    : [];
  const candidates = [];
  const seen = new Set();
  const pushCandidate = (entry) => {
    const value = String(entry || '').trim();
    if (!value || seen.has(value)) return;
    seen.add(value);
    candidates.push(value);
  };
  pushCandidate(preferredPort);
  for (const port of discoveredPorts) pushCandidate(port);
  if (candidates.length === 0) {
    return {
      output: '',
      activePort: '',
      attemptedPorts: []
    };
  }
  const totalBudgetMs = Math.max(2000, Number(timeoutMs) || 20000);
  const attempted = [];
  for (let i = 0; i < candidates.length; i += 1) {
    const port = candidates[i];
    const remaining = Math.max(1, candidates.length - i);
    const perPortBudget = Math.max(2500, Math.floor(totalBudgetMs / remaining));
    attempted.push(port);
    if (typeof emit === 'function' && i > 0) {
      emit({ stage: 'runtime', level: 'info', line: `runtime serial fallback probe: ${port}` });
    }
    const out = await captureEsp32RuntimeSerialOnPort(port, perPortBudget, emit, monitorCommand);
    if (out) {
      return {
        output: out,
        activePort: port,
        attemptedPorts: attempted
      };
    }
  }
  return {
    output: '',
    activePort: preferredPort,
    attemptedPorts: attempted
  };
}

function isElegooEsp32s3Camera(contract = {}, fqbn = '') {
  const params = contract?.params || {};
  const profile = String(params.cameraBoardProfile || '').trim().toLowerCase();
  const f = String(fqbn || '').trim().toLowerCase();
  return profile === 'elegoo-esp32s3-camera-v1' && f.includes('esp32s3');
}

function resolveEsp32EffectiveFqbn(contract = {}, fqbn = '') {
  const params = contract?.params || {};
  const explicit = String(params.effectiveFqbn || '').trim();
  if (explicit) return explicit;
  if (isElegooEsp32s3Camera(contract, fqbn)) {
    const withUsbCdc = params?.usbCdcOnBoot !== false;
    const parts = ['PSRAM=opi', 'FlashMode=qio', 'FlashSize=8M', 'PartitionScheme=default_8MB'];
    if (withUsbCdc) {
      parts.push('USBMode=hwcdc', 'CDCOnBoot=cdc');
    }
    return `${String(fqbn).trim()}:${parts.join(',')}`;
  }
  return String(fqbn || '').trim();
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
}

function resolveEsp32CameraLibraryPaths(contract = {}) {
  const params = contract?.params || {};
  const explicit = String(params.cameraLibraryPath || '').trim();
  const explicitList = normalizeStringList(params.cameraLibraryPaths);
  const requested = [explicit, ...explicitList]
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
  const existing = [];

  for (const candidate of requested) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) existing.push(candidate);
    } catch {
      // ignore stat errors
    }
  }
  if (existing.length > 0) {
    return { paths: existing, missingRequested: false };
  }
  if (requested.length > 0) {
    return { paths: [], missingRequested: true };
  }

  const projectRoot = path.resolve(__dirname, '..', '..', '..');
  const defaultCandidates = [
    path.join(projectRoot, 'robot', 'ESP32-S3-WROOM-1-Camera', 'esp32-camera'),
    path.join(projectRoot, '.psf', 'toolchains', 'libraries', 'esp32-camera')
  ];
  const arduinoCoreRoot = path.join(
    projectRoot,
    '.psf',
    'toolchains',
    'arduino-cli',
    'data',
    'packages',
    'esp32',
    'hardware',
    'esp32'
  );
  try {
    if (fs.existsSync(arduinoCoreRoot) && fs.statSync(arduinoCoreRoot).isDirectory()) {
      const versionDirs = fs.readdirSync(arduinoCoreRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
        .reverse();
      for (const version of versionDirs) {
        defaultCandidates.push(path.join(arduinoCoreRoot, version, 'libraries', 'esp32-camera'));
      }
    }
  } catch {
    // ignore lookup errors
  }
  for (const candidate of defaultCandidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        return { paths: [candidate], missingRequested: false };
      }
    } catch {
      // ignore stat errors
    }
  }

  return { paths: [], missingRequested: false };
}

function resolveEsp32CompileProfiles(contract, fqbn) {
  const params = contract?.params || {};
  const explicitBoardOptions = normalizeStringList(params.compileBoardOptions);
  const explicitBuildProperties = normalizeStringList(params.compileBuildProperties);
  if (explicitBoardOptions.length > 0 || explicitBuildProperties.length > 0) {
    return [{
      label: 'contract-explicit',
      boardOptions: explicitBoardOptions,
      buildProperties: explicitBuildProperties
    }];
  }

  const cameraProfile = String(params.cameraBoardProfile || '').trim().toLowerCase();
  const fqbnLower = String(fqbn || '').trim().toLowerCase();
  if (cameraProfile === 'elegoo-esp32s3-camera-v1' && fqbnLower.includes('esp32s3')) {
    // Preferred compile profile from vendor notes for Elegoo ESP32-S3 Camera.
    return [
      {
        label: 'elegoo-s3-recommended',
        boardOptions: [
          'UploadMode=default',
          'USBMode=cdc',
          'FlashSize=8M',
          'PartitionScheme=default_8MB',
          'PSRAM=opi'
        ],
        buildProperties: []
      },
      {
        label: 'default',
        boardOptions: [],
        buildProperties: []
      }
    ];
  }

  return [{
    label: 'default',
    boardOptions: [],
    buildProperties: []
  }];
}

function fqbnHasInlineBoardOptions(fqbn = '') {
  const value = String(fqbn || '').trim();
  if (!value) return false;
  // Typical FQBN shape: vendor:arch:board[:opt=val,opt2=val2]
  return value.split(':').length > 3;
}

async function executeLiveContract({
  contract,
  script,
  expectedSerial,
  gatewayConfig = {},
  policy,
  progressCallback = null,
  progressTag = ''
} = {}) {
  const target = String(contract?.target || '').trim().toLowerCase();
  if (target === 'esp32' && String(contract?.action || '') === 'push_esp32_code') {
    return executeLiveEsp32Contract({
      contract,
      sketch: script,
      expectedSerial,
      gatewayConfig,
      policy,
      progressCallback,
      progressTag
    });
  }
  if (target === 'esp32' && String(contract?.action || '') === 'esp32_wifi_http') {
    return executeLiveEsp32WifiContract({ contract, progressCallback, progressTag });
  }
  return executeLivePicoContract({ script, expectedSerial, gatewayConfig, policy, progressCallback, progressTag });
}

async function executeLivePicoContract({ script, expectedSerial, gatewayConfig = {}, policy, progressCallback = null, progressTag = '' } = {}) {
  const emit = (payload = {}) => {
    if (typeof progressCallback !== 'function') return;
    try { progressCallback({ progressTag, target: 'raspberry-pi-pico', ...payload }); } catch { }
  };
  const serialSource = gatewayConfig?.sources?.serial || {};
  if (serialSource?.enabled !== true) {
    return {
      success: false,
      blocked: true,
      mode: 'live',
      reason: 'Live mode requires gateway serial source to be enabled.'
    };
  }

  const available = gatewayAdapters.listSerialPorts();
  const resolution = gatewayAdapters.resolveSerialPort(serialSource, available);
  const resolvedPort = String(resolution?.resolvedPort || '').trim();
  if (!resolvedPort) {
    return {
      success: false,
      blocked: true,
      mode: 'live',
      reason: 'No serial/USB target resolved for live mode.',
      serial: {
        mode: resolution?.mode || 'auto',
        configuredPort: serialSource?.port || 'auto',
        availablePorts: available
      }
    };
  }

  const timeoutMs = Number.isFinite(Number(policy?.live?.timeoutMs))
    ? Math.max(2000, Math.min(300000, Number(policy.live.timeoutMs)))
    : 60000;
  const executor = String(policy?.live?.executor || 'mpremote').toLowerCase();
  if (executor !== 'mpremote') {
    return {
      success: false,
      blocked: true,
      mode: 'live',
      reason: `Unsupported live executor: ${executor}`
    };
  }

  const command = await resolveMpremoteCommand();
  if (!command) {
    return {
      success: false,
      blocked: true,
      mode: 'live',
      reason: 'mpremote not available. Build Python WebUI in Binary Manager or install mpremote.',
      serial: { resolvedPort }
    };
  }

  const run = await runCommandAsync(command.bin, [...command.baseArgs, 'connect', resolvedPort, 'exec', script], {
    timeoutMs,
    onStdout: (chunk) => emit({ stream: 'stdout', chunk: String(chunk || ''), stage: 'execute' }),
    onStderr: (chunk) => emit({ stream: 'stderr', chunk: String(chunk || ''), stage: 'execute' })
  });
  const stdout = String(run.stdout || '');
  const stderr = String(run.stderr || '');

  if (run.error) {
    return {
      success: false,
      blocked: true,
      mode: 'live',
      reason: `${command.label} execution failed: ${run.error}`,
      serial: { resolvedPort },
      output: { stdout, stderr }
    };
  }
  if (run.status !== 0) {
    return {
      success: false,
      blocked: true,
      mode: 'live',
      reason: `${command.label} exited with code ${run.status}`,
      serial: { resolvedPort },
      output: { stdout, stderr }
    };
  }
  const verified = stdout.includes(expectedSerial) || stderr.includes(expectedSerial);
  if (!verified) {
    return {
      success: false,
      blocked: true,
      mode: 'live',
      reason: `Live execution completed but verification token "${expectedSerial}" was not observed.`,
      serial: { resolvedPort },
      output: { stdout, stderr }
    };
  }

  return {
    success: true,
    mode: 'live',
    verification: {
      expectedSerial,
      matched: true
    },
    serial: { resolvedPort },
    output: { stdout, stderr }
  };
}

async function executeLiveEsp32Contract({
  contract,
  sketch,
  expectedSerial,
  gatewayConfig = {},
  policy,
  progressCallback = null,
  progressTag = ''
} = {}) {
  const emit = (payload = {}) => {
    if (typeof progressCallback !== 'function') return;
    try { progressCallback({ progressTag, target: 'esp32', ...payload }); } catch { }
  };
  const serialSource = gatewayConfig?.sources?.serial || {};
  if (serialSource?.enabled !== true) {
    return {
      success: false,
      blocked: true,
      mode: 'live',
      reason: 'Live mode requires gateway serial source to be enabled.'
    };
  }

  const available = gatewayAdapters.listSerialPorts();
  const resolution = gatewayAdapters.resolveSerialPort(serialSource, available);
  const resolvedPort = String(resolution?.resolvedPort || '').trim();
  if (!resolvedPort) {
    return {
      success: false,
      blocked: true,
      mode: 'live',
      reason: 'No serial/USB target resolved for ESP32 live upload.',
      serial: {
        mode: resolution?.mode || 'auto',
        configuredPort: serialSource?.port || 'auto',
        availablePorts: available
      }
    };
  }

  const arduinoCli = await resolveArduinoCliCommand();
  if (!arduinoCli) {
    const installHint =
      'Install Arduino CLI + ESP32 core, then retry.\n' +
      'Example:\n' +
      '  arduino-cli core update-index\n' +
      '  arduino-cli core install esp32:esp32';
    return {
      success: false,
      blocked: true,
      mode: 'live',
      reason: `arduino-cli not available.\n${installHint}`,
      serial: { resolvedPort },
      tools: {
        arduinoCliSearchedPaths: buildArduinoCliCandidatePaths()
      }
    };
  }

  const sketchNameRaw = String(policy?.esp32?.sketchName || 'psf_irg_esp32').trim();
  const sketchName = sketchNameRaw.replace(/[^a-zA-Z0-9_-]/g, '_') || 'psf_irg_esp32';
  const fqbn = String(policy?.esp32?.fqbn || 'esp32:esp32:esp32').trim() || 'esp32:esp32:esp32';
  const effectiveFqbn = resolveEsp32EffectiveFqbn(contract, fqbn) || fqbn;
  const compileTimeoutMs = Number.isFinite(Number(policy?.esp32?.compileTimeoutMs))
    ? Math.max(10000, Math.min(600000, Number(policy.esp32.compileTimeoutMs)))
    : 180000;
  const uploadTimeoutMs = Number.isFinite(Number(policy?.esp32?.uploadTimeoutMs))
    ? Math.max(10000, Math.min(600000, Number(policy.esp32.uploadTimeoutMs)))
    : 120000;
  const uploadPropertySupported = await detectArduinoCliUploadPropertySupport(arduinoCli);
  const uploadProfiles = resolveEsp32UploadProfiles(policy, { uploadPropertySupported });
  const uploadMode = String(contract?.params?.uploadMode || '').trim().toLowerCase();
  let compileProfiles = resolveEsp32CompileProfiles(contract, fqbn);
  if (fqbnHasInlineBoardOptions(effectiveFqbn)) {
    compileProfiles = [{
      label: 'inline-fqbn-options',
      boardOptions: [],
      buildProperties: []
    }];
  }
  const strictNoFallback = contract?.params?.strictNoFallback === true;
  const eraseFlashBeforeUpload = contract?.params?.eraseFlashBeforeUpload === true;
  const captureRuntimeSerial = contract?.params?.captureRuntimeSerial !== false;
  const runtimeSerialCaptureMs = Number.isFinite(Number(contract?.params?.runtimeSerialCaptureMs))
    ? Math.max(0, Math.min(120000, Number(contract.params.runtimeSerialCaptureMs)))
    : 20000;
  const cameraLibraryResolution = resolveEsp32CameraLibraryPaths(contract);
  const cameraLibraryPaths = Array.isArray(cameraLibraryResolution?.paths)
    ? cameraLibraryResolution.paths
    : [];
  const missingRequestedCameraLibrary = cameraLibraryResolution?.missingRequested === true;

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'psf-irg-esp32-'));
  const sketchDir = path.join(tempRoot, sketchName);
  const sketchFile = path.join(sketchDir, `${sketchName}.ino`);
  const patchedSketch = applyEsp32NetworkOverridesToSketch(String(sketch || ''), policy);
  const finalizeEsp32Result = (resultObj) => {
    const result = (resultObj && typeof resultObj === 'object') ? resultObj : {};
    const dump = buildEsp32MirrorDump({
      contract,
      policy,
      sketchName,
      sketchText: patchedSketch,
      resolvedPort,
      fqbn,
      effectiveFqbn,
      result
    });
    if (dump) {
      result.metadata = {
        ...(result.metadata || {}),
        mirrorDumpPath: dump.jsonPath,
        mirrorSketchPath: dump.sketchPath,
        mirrorTranscriptPath: dump.transcriptPath
      };
    }
    return result;
  };
  try {
    fs.mkdirSync(sketchDir, { recursive: true });
    fs.writeFileSync(sketchFile, patchedSketch, 'utf8');

    let preflightOutGlobal = '';
    let eraseOutGlobal = '';
    const isElegooCamera = isElegooEsp32s3Camera(contract, fqbn);
    if (isElegooCamera && cameraLibraryPaths.length === 0) {
      const missingReason = missingRequestedCameraLibrary
        ? 'Configured esp32-camera library path was not found.'
        : 'esp32-camera library path was not provided.';
      return finalizeEsp32Result({
        success: false,
        blocked: true,
        mode: 'live',
        reason: `${missingReason} Set Camera Sidecar "esp32-camera Lib" to your cloned esp32-camera directory.`,
        serial: { resolvedPort },
        metadata: { target: 'esp32', fqbn: effectiveFqbn, cameraBoardProfile: contract?.params?.cameraBoardProfile || '' },
        output: {}
      });
    }
    const shouldPreflight = isElegooCamera;
    const shouldEraseBeforeCompile = eraseFlashBeforeUpload;
    if (shouldPreflight) {
      const preflightArgs = ['-k', resolvedPort];
      const preflightCommand = formatCommandForLog('fuser', preflightArgs);
      emit({ stage: 'preflight', level: 'info', line: `$ ${preflightCommand}` });
      const killer = await runCommandAsync('fuser', preflightArgs, {
        timeoutMs: 10000,
        env: arduinoCli.env || null,
        onStdout: (chunk) => emit({ stage: 'preflight', stream: 'stdout', chunk: String(chunk || '') }),
        onStderr: (chunk) => emit({ stage: 'preflight', stream: 'stderr', chunk: String(chunk || '') })
      });
      preflightOutGlobal = `$ ${preflightCommand}\n${stripAnsi(`${String(killer.stdout || '')}\n${String(killer.stderr || '')}`).trim()}`.trim();
    }
    if (shouldEraseBeforeCompile) {
      const esptoolBin = resolveManagedEsptoolPath(arduinoCli.env || {}) || 'esptool';
      const chip = resolveEsp32ChipArg(contract, fqbn);
      const eraseArgs = ['--port', resolvedPort, '--chip', chip, 'erase_flash'];
      const eraseCommand = formatCommandForLog(esptoolBin, eraseArgs);
      emit({ stage: 'erase', level: 'info', line: `$ ${eraseCommand}` });
      const erase = await runCommandAsync(esptoolBin, eraseArgs, {
        timeoutMs: uploadTimeoutMs,
        env: arduinoCli.env || null,
        onStdout: (chunk) => emit({ stage: 'erase', stream: 'stdout', chunk: String(chunk || '') }),
        onStderr: (chunk) => emit({ stage: 'erase', stream: 'stderr', chunk: String(chunk || '') })
      });
      eraseOutGlobal = `$ ${eraseCommand}\n${stripAnsi(`${String(erase.stdout || '')}\n${String(erase.stderr || '')}`).trim()}`.trim();
      if (erase.error || erase.status !== 0) {
        return finalizeEsp32Result({
          success: false,
          blocked: true,
          mode: 'live',
          reason: `esptool erase_flash failed${erase.error ? `: ${erase.error}` : ` (code ${erase.status})`}`,
          serial: { resolvedPort },
          metadata: { target: 'esp32', fqbn: effectiveFqbn, uploadMode: uploadMode || 'arduino-cli', eraseFlashBeforeUpload: true },
          output: {
            preflight: preflightOutGlobal,
            erase: eraseOutGlobal
          }
        });
      }
    }

    const compileStartedAt = Date.now();
    const runCompile = async (profile = {}) => {
      const args = [...arduinoCli.baseArgs, 'compile', '--fqbn', effectiveFqbn];
      const boardOptions = Array.isArray(profile?.boardOptions) ? profile.boardOptions : [];
      const buildProperties = Array.isArray(profile?.buildProperties) ? profile.buildProperties : [];
      for (const opt of boardOptions) {
        const value = String(opt || '').trim();
        if (!value) continue;
        args.push('--board-options', value);
      }
      for (const prop of buildProperties) {
        const value = String(prop || '').trim();
        if (!value) continue;
        args.push('--build-property', value);
      }
      for (const libPath of cameraLibraryPaths) {
        const value = String(libPath || '').trim();
        if (!value) continue;
        args.push('--libraries', value);
      }
      args.push(sketchDir);
      const commandLine = formatCommandForLog(arduinoCli.bin, args);
      emit({ stage: 'compile', level: 'info', line: `$ ${commandLine}` });
      const compileResult = await runCommandAsync(arduinoCli.bin, args, {
        timeoutMs: compileTimeoutMs,
        env: arduinoCli.env || null,
        onStdout: (chunk) => emit({ stage: 'compile', stream: 'stdout', chunk: String(chunk || '') }),
        onStderr: (chunk) => emit({ stage: 'compile', stream: 'stderr', chunk: String(chunk || '') })
      });
      const output = stripAnsi(`${String(compileResult.stdout || '')}\n${String(compileResult.stderr || '')}`).trim();
      return { compileResult, output, commandLine };
    };

    let compile = null;
    let compileOut = '';
    let usedCompileProfile = null;
    const compileAttempts = [];

    const compileProfilesToTry = strictNoFallback
      ? [compileProfiles[0] || { label: 'default', boardOptions: [], buildProperties: [] }]
      : compileProfiles;
    for (let i = 0; i < compileProfilesToTry.length; i += 1) {
      const profile = compileProfilesToTry[i] || {};
      const label = String(profile.label || `compile-profile-${i + 1}`);
      let { compileResult, output, commandLine } = await runCompile(profile);
      if (compileResult.error || compileResult.status !== 0) {
        const lower = String(output || '').toLowerCase();
          const missingPlatform =
            lower.includes("platform 'esp32:esp32' not found") ||
            lower.includes('platform not installed') ||
            lower.includes('esp32:esp32 not found');
        if (missingPlatform && !strictNoFallback) {
          const coreInstall = await ensureEsp32CoreInstalled(arduinoCli, fqbn);
          if (coreInstall.success) {
            const retry = await runCompile(profile);
            compileResult = retry.compileResult;
            output = `${output}\n\n[auto-heal] ${coreInstall.message}\n\n${retry.output}`.trim();
            commandLine = retry.commandLine || commandLine;
          } else {
            output = `${output}\n\n[auto-heal failed] ${coreInstall.message}`.trim();
          }
        }
      }

      compileAttempts.push({ label, output, commandLine });
      compile = compileResult;
      compileOut = output;
      if (!compileResult.error && compileResult.status === 0) {
        usedCompileProfile = label;
        break;
      }
    }

    const compileAttemptsOut = compileAttempts
      .map((entry, idx) => `[compile attempt ${idx + 1}/${compileAttempts.length}] ${entry.label}\n$ ${String(entry.commandLine || '').trim()}\n${String(entry.output || '').trim()}`.trim())
      .join('\n\n')
      .trim();

    if (compile.error || compile.status !== 0) {
      return finalizeEsp32Result({
        success: false,
        blocked: true,
        mode: 'live',
        reason: `arduino-cli compile failed${compile.error ? `: ${compile.error}` : ` (code ${compile.status})`}`,
        serial: { resolvedPort },
        metadata: { target: 'esp32', fqbn: effectiveFqbn, sketchFile, cameraLibraries: cameraLibraryPaths },
        output: {
          compile: compileAttemptsOut || compileOut,
          preflight: preflightOutGlobal,
          erase: eraseOutGlobal
        }
      });
    }

    if (uploadMode === 'merged-bin') {
      const mergedBin = resolveMergedBinPath(sketchName, compileStartedAt);
      if (!mergedBin) {
        return finalizeEsp32Result({
          success: false,
          blocked: true,
          mode: 'live',
          reason: 'merged.bin not found after compile',
          serial: { resolvedPort },
          metadata: { target: 'esp32', fqbn: effectiveFqbn, sketchFile, uploadMode: 'merged-bin' },
          output: { compile: compileAttemptsOut || compileOut }
        });
      }
      const preflightOut = preflightOutGlobal;
      const esptoolBin = resolveManagedEsptoolPath(arduinoCli.env || {}) || 'esptool';
      const chip = resolveEsp32ChipArg(contract, fqbn);
      const eraseOut = eraseOutGlobal;
      const esptoolArgs = ['--port', resolvedPort, '--chip', chip, 'write_flash', '0x0', mergedBin];
      const esptoolCommand = formatCommandForLog(esptoolBin, esptoolArgs);
      emit({ stage: 'upload', level: 'info', line: `$ ${esptoolCommand}` });
      const upload = await runCommandAsync(esptoolBin, esptoolArgs, {
        timeoutMs: uploadTimeoutMs,
        env: arduinoCli.env || null,
        onStdout: (chunk) => emit({ stage: 'upload', stream: 'stdout', chunk: String(chunk || '') }),
        onStderr: (chunk) => emit({ stage: 'upload', stream: 'stderr', chunk: String(chunk || '') })
      });
      const uploadOut = `$ ${esptoolCommand}\n${stripAnsi(`${String(upload.stdout || '')}\n${String(upload.stderr || '')}`).trim()}`.trim();
      if (upload.error || upload.status !== 0) {
        return finalizeEsp32Result({
          success: false,
          blocked: true,
          mode: 'live',
          reason: `esptool upload failed${upload.error ? `: ${upload.error}` : ` (code ${upload.status})`}`,
          serial: { resolvedPort },
          metadata: { target: 'esp32', fqbn: effectiveFqbn, chip, mergedBin, uploadMode: 'merged-bin' },
          output: {
            compile: compileAttemptsOut || compileOut,
            preflight: preflightOut,
            erase: eraseOut,
            upload: uploadOut
          }
        });
      }
      const runtimeCapture = captureRuntimeSerial
        ? await captureEsp32RuntimeSerial(
          resolvedPort,
          runtimeSerialCaptureMs,
          emit,
          gatewayAdapters.listSerialPorts(),
          { bin: arduinoCli.bin, baseArgs: arduinoCli.baseArgs }
        )
        : {
          output: '(runtime serial capture disabled)',
          activePort: resolvedPort,
          attemptedPorts: [resolvedPort].filter(Boolean)
        };
      const runtimeSerial = String(runtimeCapture?.output || '').trim()
        || `(no runtime serial captured; attempted ports: ${Array.isArray(runtimeCapture?.attemptedPorts) ? runtimeCapture.attemptedPorts.join(', ') : resolvedPort})`;
      return finalizeEsp32Result({
        success: true,
        mode: 'live',
        verification: {
          expectedSerial: expectedSerial || 'Upload completed',
          matched: false
        },
        serial: { resolvedPort },
        output: {
          compile: compileAttemptsOut || compileOut,
          preflight: preflightOut,
          erase: eraseOut,
          upload: uploadOut,
          runtimeSerial
        },
        metadata: {
          target: 'esp32',
          fqbn: effectiveFqbn,
          compileProfile: usedCompileProfile || null,
          chip,
          sketchFile,
          mergedBin,
          uploadMode: 'merged-bin',
          cameraLibraries: cameraLibraryPaths,
          runtimeSerialPort: String(runtimeCapture?.activePort || '').trim() || null,
          runtimeSerialPortsAttempted: Array.isArray(runtimeCapture?.attemptedPorts) ? runtimeCapture.attemptedPorts : [],
          networkOverridesApplied: patchedSketch !== String(sketch || '')
        }
      });
    }

    const preflightOut = preflightOutGlobal;
    const eraseOut = eraseOutGlobal;

    let upload = null;
    let uploadOut = '';
    let usedUploadProfile = null;
    const uploadAttempts = [];
    const uploadProfilesToTry = strictNoFallback
      ? [uploadProfiles[0] || { label: 'default', uploadProperties: [] }]
      : uploadProfiles;
    for (let i = 0; i < uploadProfilesToTry.length; i += 1) {
      const profile = uploadProfilesToTry[i];
      const args = [
        ...arduinoCli.baseArgs,
        'upload',
        '-p',
        resolvedPort,
        '--fqbn',
        effectiveFqbn
      ];
      const uploadProperties = Array.isArray(profile.uploadProperties) ? profile.uploadProperties : [];
      for (const prop of uploadProperties) {
        const value = String(prop || '').trim();
        if (!value) continue;
        args.push('--upload-property', value);
      }
      args.push(sketchDir);
      const commandLine = formatCommandForLog(arduinoCli.bin, args);
      emit({ stage: 'upload', level: 'info', line: `$ ${commandLine}` });
      const result = await runCommandAsync(arduinoCli.bin, args, {
        timeoutMs: uploadTimeoutMs,
        env: arduinoCli.env || null,
        onStdout: (chunk) => emit({ stage: 'upload', stream: 'stdout', chunk: String(chunk || '') }),
        onStderr: (chunk) => emit({ stage: 'upload', stream: 'stderr', chunk: String(chunk || '') })
      });
      const out = `$ ${commandLine}\n${stripAnsi(`${String(result.stdout || '')}\n${String(result.stderr || '')}`).trim()}`.trim();
      uploadAttempts.push({
        label: profile.label || `profile-${i + 1}`,
        output: out,
        commandLine
      });
      upload = result;
      uploadOut = out;
      if (!result.error && result.status === 0) {
        usedUploadProfile = profile.label || `profile-${i + 1}`;
        break;
      }
    }

    const uploadAttemptsOut = uploadAttempts
      .map((entry, idx) => `[upload attempt ${idx + 1}/${uploadAttempts.length}] ${entry.label}\n${String(entry.output || '').trim()}`.trim())
      .join('\n\n')
      .trim();

    if (!upload || upload.error || upload.status !== 0) {
      return finalizeEsp32Result({
        success: false,
        blocked: true,
        mode: 'live',
        reason: `arduino-cli upload failed${upload.error ? `: ${upload.error}` : ` (code ${upload.status})`}`,
        serial: { resolvedPort },
        metadata: { target: 'esp32', fqbn: effectiveFqbn, sketchFile, uploadProfilesTried: uploadProfilesToTry.map((p) => p.label) },
        output: {
          compile: compileAttemptsOut || compileOut,
          preflight: preflightOut,
          erase: eraseOut,
          upload: uploadAttemptsOut || uploadOut
        }
      });
    }
    const runtimeCapture = captureRuntimeSerial
      ? await captureEsp32RuntimeSerial(
        resolvedPort,
        runtimeSerialCaptureMs,
        emit,
        gatewayAdapters.listSerialPorts(),
        { bin: arduinoCli.bin, baseArgs: arduinoCli.baseArgs }
      )
      : {
        output: '(runtime serial capture disabled)',
        activePort: resolvedPort,
        attemptedPorts: [resolvedPort].filter(Boolean)
      };
    const runtimeSerial = String(runtimeCapture?.output || '').trim()
      || `(no runtime serial captured; attempted ports: ${Array.isArray(runtimeCapture?.attemptedPorts) ? runtimeCapture.attemptedPorts.join(', ') : resolvedPort})`;

    return finalizeEsp32Result({
      success: true,
      mode: 'live',
      verification: {
        expectedSerial: expectedSerial || 'Upload completed',
        matched: false
      },
      serial: { resolvedPort },
      output: {
        compile: compileAttemptsOut || compileOut,
        preflight: preflightOut,
        erase: eraseOut,
        upload: uploadAttemptsOut || uploadOut,
        runtimeSerial
      },
      metadata: {
        target: 'esp32',
        fqbn: effectiveFqbn,
        sketchFile,
        compileProfile: usedCompileProfile || null,
        uploadProfile: usedUploadProfile || null,
        cameraLibraries: cameraLibraryPaths,
        runtimeSerialPort: String(runtimeCapture?.activePort || '').trim() || null,
        runtimeSerialPortsAttempted: Array.isArray(runtimeCapture?.attemptedPorts) ? runtimeCapture.attemptedPorts : [],
        networkOverridesApplied: patchedSketch !== String(sketch || '')
      }
    });
  } finally {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // ignore temp cleanup issues
    }
  }
}

async function executeLiveEsp32WifiContract({ contract, progressCallback = null, progressTag = '' } = {}) {
  const emit = (payload = {}) => {
    if (typeof progressCallback !== 'function') return;
    try { progressCallback({ progressTag, target: 'esp32', ...payload }); } catch { }
  };
  const host = String(contract?.params?.host || '').trim();
  const port = Number(contract?.params?.port);
  const method = String(contract?.params?.method || 'GET').trim().toUpperCase();
  const pathValue = String(contract?.params?.path || '/health').trim();
  const timeoutMs = Number.isFinite(Number(contract?.params?.timeoutMs))
    ? Math.max(1000, Math.min(60000, Number(contract.params.timeoutMs)))
    : 5000;
  const path = pathValue.startsWith('/') ? pathValue : `/${pathValue}`;
  const url = `http://${host}:${port}${path}`;

  emit({ stage: 'http', level: 'info', line: `$ ${method} ${url}` });
  const result = await runHttpRequest({ url, method, timeoutMs });
  const status = Number(result?.statusCode);
  const body = String(result?.body || '').trim();
  const ok = !result?.error && Number.isInteger(status) && status >= 200 && status < 300;

  if (!ok) {
    return {
      success: false,
      blocked: true,
      mode: 'live',
      reason: result?.error
        ? `esp32 wifi request failed: ${result.error}`
        : `esp32 wifi request returned status ${status || 'n/a'}`,
      metadata: {
        target: 'esp32',
        endpoint: url,
        httpStatus: Number.isInteger(status) ? status : null
      },
      output: {
        http: body || ''
      }
    };
  }

  return {
    success: true,
    mode: 'live',
    verification: {
      expectedSerial: `HTTP ${status}`,
      matched: true
    },
    metadata: {
      target: 'esp32',
      endpoint: url,
      httpStatus: status
    },
    output: {
      http: body
    }
  };
}

module.exports = {
  executeLiveContract
};
