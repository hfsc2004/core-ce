/**
 * ============================================================================
 * MOE GATEWAY ADAPTERS
 * ============================================================================
 *
 * Deterministic adapter helpers for gateway I/O sources.
 * Current implementation focuses on USB/serial discovery and source resolution.
 *
 * @module moe-gateway-adapters
 * @version 1.1.2 - March 5, 2026
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_SERIAL = Object.freeze({
  enabled: false,
  port: 'auto',
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: 'none'
});

function toNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function mergeSerialSource(serial = {}) {
  const merged = {
    ...DEFAULT_SERIAL,
    ...(serial || {})
  };

  merged.port = String(merged.port || 'auto').trim() || 'auto';
  merged.baudRate = Math.max(300, Math.min(2000000, Math.round(toNumber(merged.baudRate, 115200))));
  merged.dataBits = [5, 6, 7, 8].includes(Number(merged.dataBits)) ? Number(merged.dataBits) : 8;
  merged.stopBits = [1, 2].includes(Number(merged.stopBits)) ? Number(merged.stopBits) : 1;
  merged.parity = ['none', 'odd', 'even'].includes(String(merged.parity || '').toLowerCase())
    ? String(merged.parity || '').toLowerCase()
    : 'none';

  return merged;
}

function normalizeSources(sources = {}) {
  const safe = sources || {};
  return {
    api: {
      enabled: safe?.api?.enabled === true,
      port: Math.max(1, Math.min(65535, Math.round(toNumber(safe?.api?.port, 52434)))),
      endpoint: String(safe?.api?.endpoint || '/v1/chat').trim() || '/v1/chat'
    },
    terminal: {
      enabled: safe?.terminal?.enabled !== false
    },
    serial: mergeSerialSource(safe?.serial)
  };
}

function listSerialPorts() {
  switch (process.platform) {
    case 'linux':
      return listSerialPortsLinux();
    case 'darwin':
      return listSerialPortsMac();
    case 'win32':
      return listSerialPortsWindows();
    default:
      return [];
  }
}

function listSerialPortsLinux() {
  const candidates = new Map();

  const addPort = (devicePath, hint = '') => {
    if (!devicePath || !devicePath.startsWith('/dev/')) return;
    if (!fs.existsSync(devicePath)) return;

    const base = path.basename(devicePath);
    const kind = inferSerialKind(devicePath, hint);
    const score = kind === 'usb' ? 200 : kind === 'virtual' ? 50 : 100;
    const existing = candidates.get(devicePath);

    const entry = {
      path: devicePath,
      label: hint || base,
      kind,
      score
    };

    if (!existing || entry.score > existing.score) {
      candidates.set(devicePath, entry);
    }
  };

  const byIdDir = '/dev/serial/by-id';
  if (fs.existsSync(byIdDir)) {
    for (const entry of safeReadDir(byIdDir)) {
      const linkPath = path.join(byIdDir, entry);
      try {
        const resolved = fs.realpathSync(linkPath);
        addPort(resolved, entry);
      } catch {
        // Ignore broken symlink entries.
      }
    }
  }

  // Only include likely external serial endpoints by default.
  // Excludes ttyS* onboard UARTs that create noisy/stable false positives.
  for (const devicePath of safeListDevEntries(/^tty(USB|ACM|AMA|THS|GS|XRUSB|AP|RPMSG)/i)) {
    addPort(devicePath);
  }

  const out = Array.from(candidates.values())
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.path.localeCompare(b.path);
    })
    .map((item) => ({
      path: item.path,
      label: item.label,
      kind: item.kind,
      boardHint: inferBoardHint(item.path, item.label)
    }));

  return out;
}

function listSerialPortsMac() {
  const out = [];
  for (const entry of safeReadDir('/dev')) {
    if (!/^tty\.|^cu\./.test(entry)) continue;
    const devicePath = path.join('/dev', entry);
    out.push({
      path: devicePath,
      label: entry,
      kind: /usb|wch|serial|modem/i.test(entry) ? 'usb' : 'serial',
      boardHint: inferBoardHint(devicePath, entry)
    });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function listSerialPortsWindows() {
  // Non-destructive best effort without extra dependencies.
  // COM discovery can be expanded later with SetupAPI binding.
  return [];
}

function safeReadDir(dirPath) {
  try {
    return fs.readdirSync(dirPath);
  } catch {
    return [];
  }
}

function safeListDevEntries(pattern) {
  const out = [];
  for (const entry of safeReadDir('/dev')) {
    if (!pattern.test(entry)) continue;
    out.push(path.join('/dev', entry));
  }
  return out;
}

function inferSerialKind(devicePath, label = '') {
  const sample = `${devicePath} ${label}`.toLowerCase();
  if (/ttyusb|ttyacm|usb|cp210|ch340|ftdi|wch/.test(sample)) return 'usb';
  if (/pts|pty|virtual/.test(sample)) return 'virtual';
  return 'serial';
}

function inferBoardHint(devicePath, label = '') {
  const sample = `${devicePath} ${label}`.toLowerCase();
  if (/esp32|cp210|ch340|ch910|wchusbserial|silicon[\s_-]*labs/.test(sample)) return 'esp32';
  if (/pico|rp2040|raspberry[\s_-]*pi/.test(sample)) return 'raspberry-pi-pico';
  return '';
}

function resolveSerialPort(serialSource = {}, availablePorts = null) {
  const source = mergeSerialSource(serialSource);
  const ports = Array.isArray(availablePorts) ? availablePorts : listSerialPorts();

  const requested = String(source.port || 'auto').trim();
  const explicitPort = requested && requested.toLowerCase() !== 'auto';

  if (explicitPort) {
    return {
      resolvedPort: requested,
      mode: 'explicit',
      available: ports,
      matched: ports.find((p) => p.path === requested) || null
    };
  }

  const selected = ports[0] || null;
  return {
    resolvedPort: selected?.path || null,
    mode: 'auto',
    available: ports,
    matched: selected
  };
}

function buildGatewayRuntime(gatewayConfig = {}) {
  const sources = normalizeSources(gatewayConfig?.sources || {});
  const availableSerialPorts = sources.serial.enabled ? listSerialPorts() : [];
  const serialResolution = resolveSerialPort(sources.serial, availableSerialPorts);
  const serialReady = sources.serial.enabled
    ? Boolean(serialResolution.resolvedPort)
    : false;

  const activeSources = [];
  if (sources.terminal.enabled) activeSources.push('terminal');
  if (sources.api.enabled) activeSources.push('api');
  if (sources.serial.enabled && serialReady) activeSources.push('serial');

  return {
    started: true,
    activeSources,
    sources,
    serial: {
      enabled: sources.serial.enabled,
      mode: serialResolution.mode,
      configuredPort: sources.serial.port,
      resolvedPort: serialResolution.resolvedPort,
      baudRate: sources.serial.baudRate,
      availablePorts: availableSerialPorts,
      ready: serialReady,
      warning: sources.serial.enabled && !serialReady
        ? 'Serial source enabled but no serial/USB device was detected.'
        : null
    }
  };
}

module.exports = {
  DEFAULT_SERIAL,
  normalizeSources,
  mergeSerialSource,
  listSerialPorts,
  resolveSerialPort,
  buildGatewayRuntime
};
