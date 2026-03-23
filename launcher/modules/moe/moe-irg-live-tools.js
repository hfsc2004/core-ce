/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');

function stripAnsi(value) {
  return String(value || '').replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '');
}

function applyEsp32NetworkOverridesToSketch(sketchText, policy = {}) {
  const text = String(sketchText || '');
  if (!text) return text;
  // Camera firmware is fully parameterized at generation time from
  // wifiCamera* fields. Do not mutate it again here, otherwise generic
  // wifi* overrides can clobber camera SSID/password/static-IP values.
  if (text.includes('// PSF Relay ESP32 Camera Firmware')) {
    return text;
  }
  const esp32 = policy?.esp32 || {};

  const wifiSsid = String(esp32.wifiSsid || '');
  const wifiPassword = String(esp32.wifiPassword || '');
  const staticEnabled = esp32.wifiStaticEnabled === true;
  const staticIp = String(esp32.wifiStaticIp || '').trim();
  const staticCidrRaw = Number(esp32.wifiStaticCidr);
  const staticCidr = Number.isInteger(staticCidrRaw) ? Math.max(0, Math.min(32, staticCidrRaw)) : 24;
  const staticGatewayEnabled = esp32.wifiStaticGatewayEnabled === true;
  const staticGateway = String(esp32.wifiStaticGateway || '').trim();

  const parseIpParts = (value) => {
    const m = String(value || '').trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!m) return null;
    const parts = m.slice(1).map((p) => Number(p));
    if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    return parts;
  };
  const ipParts = parseIpParts(staticIp);
  const gatewayParts = parseIpParts(staticGateway);

  const replaceBoolConst = (source, name, value) => source.replace(
    new RegExp(`(const\\s+bool\\s+${name}\\s*=\\s*)(true|false)(\\s*;)`, 'g'),
    `$1${value ? 'true' : 'false'}$3`
  );
  const replaceIntConst = (source, name, value) => source.replace(
    new RegExp(`(const\\s+int\\s+${name}\\s*=\\s*)(-?\\d+)(\\s*;)`, 'g'),
    `$1${Math.trunc(value)}$3`
  );
  const replaceStringConst = (source, name, value) => {
    const escaped = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return source.replace(
      new RegExp(`(const\\s+char\\*\\s+${name}\\s*=\\s*)"(?:[^"\\\\]|\\\\.)*"(\\s*;)`, 'g'),
      `$1"${escaped}"$2`
    );
  };
  const replaceIpConst = (source, name, parts) => {
    if (!Array.isArray(parts) || parts.length !== 4) return source;
    return source.replace(
      new RegExp(`(const\\s+IPAddress\\s+${name}\\s*\\()\\s*\\d{1,3}\\s*,\\s*\\d{1,3}\\s*,\\s*\\d{1,3}\\s*,\\s*\\d{1,3}(\\s*\\)\\s*;)`, 'g'),
      `$1${parts[0]}, ${parts[1]}, ${parts[2]}, ${parts[3]}$2`
    );
  };

  let out = text;
  out = replaceStringConst(out, 'WIFI_SSID', wifiSsid);
  out = replaceStringConst(out, 'WIFI_PASS', wifiPassword);
  out = replaceBoolConst(out, 'USE_STATIC_IP', staticEnabled);
  out = replaceIntConst(out, 'STATIC_CIDR', staticCidr);
  out = replaceBoolConst(out, 'USE_STATIC_GATEWAY', staticGatewayEnabled);
  if (ipParts) out = replaceIpConst(out, 'STATIC_IP', ipParts);
  if (gatewayParts) out = replaceIpConst(out, 'STATIC_GATEWAY', gatewayParts);
  return out;
}

function resolveEsp32UploadProfiles(policy = {}, options = {}) {
  const uploadPropertySupported = options?.uploadPropertySupported === true;
  const configured = Array.isArray(policy?.esp32?.uploadRetryProfiles) ? policy.esp32.uploadRetryProfiles : [];
  const normalized = [];
  for (const entry of configured) {
    if (!entry || typeof entry !== 'object') continue;
    const label = String(entry.label || '').trim();
    const uploadProperties = uploadPropertySupported && Array.isArray(entry.uploadProperties)
      ? entry.uploadProperties
      : [];
    normalized.push({
      label: label || `custom-${normalized.length + 1}`,
      uploadProperties: uploadProperties.map((p) => String(p || '').trim()).filter(Boolean)
    });
  }
  if (normalized.length > 0) return normalized;
  if (!uploadPropertySupported) return [{ label: 'default', uploadProperties: [] }];

  return [
    { label: 'default', uploadProperties: [] },
    { label: 'slow-460800', uploadProperties: ['upload.speed=460800'] },
    { label: 'safe-115200', uploadProperties: ['upload.speed=115200'] },
    {
      label: 'safe-115200-no-after-reset',
      uploadProperties: ['upload.speed=115200', 'upload.after=no_reset']
    }
  ];
}

async function detectArduinoCliUploadPropertySupport(arduinoCli) {
  if (!arduinoCli?.bin) return false;
  const argsBase = Array.isArray(arduinoCli.baseArgs) ? arduinoCli.baseArgs : [];
  const env = arduinoCli?.env || null;
  const probe = await runCommandAsync(arduinoCli.bin, [...argsBase, 'upload', '--help'], {
    timeoutMs: 5000,
    env
  });
  const out = `${String(probe.stdout || '')}\n${String(probe.stderr || '')}`.toLowerCase();
  return out.includes('--upload-property');
}

async function ensureEsp32CoreInstalled(arduinoCli, fqbn) {
  const corePackage = String(fqbn || 'esp32:esp32:esp32').split(':').slice(0, 2).join(':') || 'esp32:esp32';
  const argsBase = Array.isArray(arduinoCli?.baseArgs) ? arduinoCli.baseArgs : [];
  const env = arduinoCli?.env || null;

  const update = await runCommandAsync(arduinoCli.bin, [...argsBase, 'core', 'update-index'], {
    timeoutMs: 180000,
    env
  });
  const updateOut = stripAnsi(`${String(update.stdout || '')}\n${String(update.stderr || '')}`).trim();
  if (update.error || update.status !== 0) {
    return {
      success: false,
      message: `core update-index failed${update.error ? `: ${update.error}` : ` (code ${update.status})`}\n${updateOut}`
    };
  }

  const install = await runCommandAsync(arduinoCli.bin, [...argsBase, 'core', 'install', corePackage], {
    timeoutMs: 420000,
    env
  });
  const installOut = stripAnsi(`${String(install.stdout || '')}\n${String(install.stderr || '')}`).trim();
  if (install.error || install.status !== 0) {
    return {
      success: false,
      message: `core install ${corePackage} failed${install.error ? `: ${install.error}` : ` (code ${install.status})`}\n${installOut}`
    };
  }

  return {
    success: true,
    message: `Installed missing core ${corePackage}.`
  };
}

async function resolveMpremoteCommand() {
  const managedPython = resolveManagedPythonPath();
  if (managedPython) {
    const probeManaged = await runCommandAsync(managedPython, ['-m', 'mpremote', 'help'], {
      timeoutMs: 5000
    });
    if (!probeManaged.error && probeManaged.status === 0) {
      return {
        label: 'managed python -m mpremote',
        bin: managedPython,
        baseArgs: ['-m', 'mpremote']
      };
    }
  }

  const probeSystem = await runCommandAsync('mpremote', ['help'], {
    timeoutMs: 5000
  });
  if (!probeSystem.error && probeSystem.status === 0) {
    return {
      label: 'system mpremote',
      bin: 'mpremote',
      baseArgs: []
    };
  }

  return null;
}

function runHttpRequest({ url, method = 'GET', timeoutMs = 5000 } = {}) {
  return new Promise((resolve) => {
    let uri = null;
    try {
      uri = new URL(String(url || ''));
    } catch (err) {
      resolve({ error: `invalid url: ${String(err?.message || err || '')}` });
      return;
    }
    const client = uri.protocol === 'https:' ? https : http;
    const req = client.request({
      protocol: uri.protocol,
      hostname: uri.hostname,
      port: uri.port || (uri.protocol === 'https:' ? 443 : 80),
      method: String(method || 'GET').toUpperCase(),
      path: `${uri.pathname || '/'}${uri.search || ''}`,
      timeout: timeoutMs,
      headers: {
        Accept: 'application/json, text/plain;q=0.9, */*;q=0.8'
      }
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve({
          statusCode: Number(res.statusCode),
          headers: res.headers,
          body
        });
      });
    });
    req.on('timeout', () => req.destroy(new Error(`timeout after ${timeoutMs}ms`)));
    req.on('error', (err) => resolve({ error: String(err?.message || err || 'request failed') }));
    req.end();
  });
}

async function resolveArduinoCliCommand() {
  const projectRoot = path.resolve(__dirname, '..', '..', '..');
  const arduinoEnv = buildArduinoCliEnv(projectRoot);
  const managed = resolveManagedArduinoCliPath();
  if (managed) {
    const probeManaged = await runCommandAsync(managed, ['version'], {
      timeoutMs: 5000,
      env: arduinoEnv
    });
    if (!probeManaged.error && probeManaged.status === 0) {
      return {
        label: `managed arduino-cli (${managed})`,
        bin: managed,
        baseArgs: [],
        env: arduinoEnv
      };
    }
  }

  const probe = await runCommandAsync('arduino-cli', ['version'], {
    timeoutMs: 5000,
    env: arduinoEnv
  });
  if (!probe.error && probe.status === 0) {
    return {
      label: 'arduino-cli',
      bin: 'arduino-cli',
      baseArgs: [],
      env: arduinoEnv
    };
  }
  return null;
}

function buildArduinoCliEnv(projectRoot) {
  const baseDir = path.join(projectRoot, '.psf', 'toolchains', 'arduino-cli');
  const configDir = path.join(baseDir, 'config');
  const dataDir = path.join(baseDir, 'data');
  const downloadsDir = path.join(baseDir, 'downloads');
  const userDir = path.join(baseDir, 'user');
  for (const p of [baseDir, configDir, dataDir, downloadsDir, userDir]) {
    try { fs.mkdirSync(p, { recursive: true }); } catch { }
  }
  return {
    ARDUINO_CONFIG_DIR: configDir,
    ARDUINO_DIRECTORIES_DATA: dataDir,
    ARDUINO_DIRECTORIES_DOWNLOADS: downloadsDir,
    ARDUINO_DIRECTORIES_USER: userDir
  };
}

function resolveManagedArduinoCliPath() {
  const candidates = buildArduinoCliCandidatePaths();
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // ignore fs errors for candidate probing
    }
  }
  return null;
}

function buildArduinoCliCandidatePaths() {
  const projectRoot = path.resolve(__dirname, '..', '..', '..');
  const platformDir = getCurrentPlatformDir();
  if (!platformDir) return [];
  const names = process.platform === 'win32' ? ['arduino-cli.exe'] : ['arduino-cli'];
  const dirs = [
    path.join(projectRoot, 'binaries', 'arduino-cli', platformDir),
    path.join(projectRoot, 'binaries', 'arduino', platformDir),
    path.join(projectRoot, 'binaries', 'esp32-tools', platformDir)
  ];
  const out = [];
  for (const dir of dirs) {
    for (const name of names) {
      out.push(path.join(dir, name));
      out.push(path.join(dir, 'bin', name));
    }
  }
  return out;
}

function resolveManagedPythonPath() {
  const platformDir = getCurrentPlatformDir();
  if (!platformDir) return null;

  const projectRoot = path.resolve(__dirname, '..', '..', '..');
  const pythonPath = process.platform === 'win32'
    ? path.join(projectRoot, 'binaries', 'python-webui', platformDir, 'venv', 'Scripts', 'python.exe')
    : path.join(projectRoot, 'binaries', 'python-webui', platformDir, 'venv', 'bin', 'python');

  return fs.existsSync(pythonPath) ? pythonPath : null;
}

function getCurrentPlatformDir() {
  if (process.platform === 'linux') return process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'macos-arm' : 'macos-intel';
  if (process.platform === 'win32') return process.arch === 'arm64' ? 'windows-arm64' : 'windows-x64';
  return null;
}

function runCommandAsync(bin, args = [], options = {}) {
  return new Promise((resolve) => {
    const timeoutMs = Number.isFinite(Number(options?.timeoutMs)) ? Math.max(1000, Number(options.timeoutMs)) : 60000;
    let stdout = '';
    let stderr = '';
    let finished = false;

    let child;
    try {
      child = spawn(bin, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: options?.env && typeof options.env === 'object'
          ? { ...process.env, ...options.env }
          : process.env
      });
    } catch (err) {
      resolve({ status: null, stdout, stderr, error: err.message });
      return;
    }

    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      try { child.kill('SIGTERM'); } catch { }
      resolve({ status: null, stdout, stderr, error: `Timed out after ${timeoutMs}ms` });
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => {
      const text = String(chunk || '');
      stdout += text;
      if (typeof options?.onStdout === 'function') {
        try { options.onStdout(text); } catch { }
      }
    });
    child.stderr?.on('data', (chunk) => {
      const text = String(chunk || '');
      stderr += text;
      if (typeof options?.onStderr === 'function') {
        try { options.onStderr(text); } catch { }
      }
    });
    child.on('error', (err) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ status: null, stdout, stderr, error: err.message });
    });
    child.on('close', (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ status: code, stdout, stderr, error: null });
    });
  });
}

module.exports = {
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
};
