/**
 *
 * @version 1.1.2 - March 9, 2026
 * @copyright 2026 Pseudo SF
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

function parseArgs(argv) {
  const out = {
    heartbeat: '',
    control: '',
    runtimeDir: '',
    parentPid: 0
  };
  for (let i = 2; i < argv.length; i += 1) {
    const key = String(argv[i] || '');
    const val = String(argv[i + 1] || '');
    if (key === '--heartbeat') out.heartbeat = val;
    if (key === '--control') out.control = val;
    if (key === '--runtime-dir') out.runtimeDir = val;
    if (key === '--parent-pid') out.parentPid = Number(val || 0);
  }
  return out;
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function rotateIfNeeded(filePath, maxBytes = 512 * 1024, keepFiles = 4) {
  let size = 0;
  try {
    size = fs.statSync(filePath).size;
  } catch (_) {
    return;
  }
  if (size <= maxBytes) return;

  for (let i = keepFiles - 1; i >= 1; i -= 1) {
    const src = `${filePath}.${i}`;
    const dst = `${filePath}.${i + 1}`;
    try {
      if (fs.existsSync(src)) fs.renameSync(src, dst);
    } catch (_) {}
  }
  try {
    fs.renameSync(filePath, `${filePath}.1`);
  } catch (_) {}
}

function pruneOld(runtimeDir, logBaseName, keepFiles = 4) {
  try {
    const entries = fs.readdirSync(runtimeDir).filter((name) => name.startsWith(logBaseName));
    const allowed = new Set([logBaseName]);
    for (let i = 1; i <= keepFiles; i += 1) {
      allowed.add(`${logBaseName}.${i}`);
    }
    for (const name of entries) {
      if (!allowed.has(name)) {
        try {
          fs.unlinkSync(path.join(runtimeDir, name));
        } catch (_) {}
      }
    }
  } catch (_) {}
}

function appendLog(filePath, row) {
  try {
    fs.appendFileSync(filePath, row + '\n', 'utf8');
  } catch (_) {}
}

function isPidAlive(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (_) {
    return false;
  }
}

function run() {
  const args = parseArgs(process.argv);
  if (!args.runtimeDir || !args.heartbeat || !args.control) {
    process.exit(0);
  }

  try {
    fs.mkdirSync(args.runtimeDir, { recursive: true });
  } catch (_) {}

  const logFile = path.join(args.runtimeDir, 'canary-events.log');
  let lastStallTs = 0;

  const tick = () => {
    const control = readJson(args.control, {}) || {};
    if (control.stopRequested === true) {
      appendLog(logFile, JSON.stringify({
        ts: Date.now(),
        type: 'canary_stop',
        reason: 'control_stop_requested'
      }));
      process.exit(0);
      return;
    }

    const maxBytes = Number(control.maxBytes || 512 * 1024);
    const keepFiles = Number(control.keepFiles || 4);
    const heartbeatStaleMs = Number(control.heartbeatStaleMs || 7000);

    rotateIfNeeded(logFile, maxBytes, keepFiles);
    pruneOld(args.runtimeDir, 'canary-events.log', keepFiles);

    const hb = readJson(args.heartbeat, null);
    const now = Date.now();
    if (hb && Number.isFinite(hb.ts)) {
      const ageMs = now - Number(hb.ts);
      if (ageMs > heartbeatStaleMs && (now - lastStallTs) > 5000) {
        lastStallTs = now;
        appendLog(logFile, JSON.stringify({
          ts: now,
          type: 'stall_detected',
          heartbeatAgeMs: ageMs,
          snapshot: hb,
          os: {
            loadavg: os.loadavg(),
            freeMem: os.freemem(),
            totalMem: os.totalmem()
          }
        }));
      }
    }

    if (!isPidAlive(args.parentPid)) {
      appendLog(logFile, JSON.stringify({
        ts: Date.now(),
        type: 'parent_exit_detected',
        parentPid: args.parentPid
      }));
      process.exit(0);
    }
  };

  appendLog(logFile, JSON.stringify({
    ts: Date.now(),
    type: 'canary_start',
    pid: process.pid,
    parentPid: args.parentPid
  }));
  setInterval(tick, 2000);
}

run();

