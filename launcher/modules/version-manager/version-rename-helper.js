/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * Version Manager - Detached workspace rename + relaunch helper
 * Runs outside Electron main process after quit.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForPidExit(pid, timeoutMs = 120000) {
  const start = Date.now();
  while ((Date.now() - start) < timeoutMs) {
    if (!isPidAlive(pid)) return true;
    await sleep(250);
  }
  return !isPidAlive(pid);
}

async function renameWithRetry(from, to, timeoutMs = 60000) {
  const start = Date.now();
  let lastErr = null;
  while ((Date.now() - start) < timeoutMs) {
    try {
      if (!fs.existsSync(from)) return { ok: false, error: `Source not found: ${from}` };
      if (fs.existsSync(to)) return { ok: false, error: `Target already exists: ${to}` };
      fs.renameSync(from, to);
      return { ok: true };
    } catch (err) {
      lastErr = err;
      await sleep(350);
    }
  }
  return { ok: false, error: lastErr ? lastErr.message : 'Rename timeout' };
}

function replaceRoot(value, fromRoot, toRoot) {
  const raw = String(value || '');
  if (!raw) return raw;
  const normalized = raw.replace(/\\/g, '/');
  const fromNorm = String(fromRoot || '').replace(/\\/g, '/');
  if (!fromNorm) return raw;
  if (!normalized.includes(fromNorm)) return raw;
  return normalized.replace(fromNorm, String(toRoot || '').replace(/\\/g, '/'));
}

function relaunch(payload, rootToUse) {
  const relaunchInfo = payload?.relaunch || {};
  const execPath = String(relaunchInfo.execPath || '').trim();
  if (!execPath) return { ok: false, error: 'Missing relaunch execPath' };
  const fromRoot = String(payload?.from || '');
  const args = Array.isArray(relaunchInfo.args)
    ? relaunchInfo.args.map((arg) => replaceRoot(arg, fromRoot, rootToUse))
    : [];
  const cwd = replaceRoot(relaunchInfo.cwd || path.dirname(execPath), fromRoot, rootToUse);
  const relaunchEnv = { ...process.env };
  // Helper may run under Electron in forced Node mode; never carry this into app relaunch.
  delete relaunchEnv.ELECTRON_RUN_AS_NODE;

  try {
    const child = spawn(execPath, args, {
      cwd,
      detached: true,
      stdio: 'ignore',
      env: relaunchEnv
    });
    child.unref();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function main() {
  const payloadRaw = process.argv[2] || '';
  if (!payloadRaw) process.exit(1);
  const payload = JSON.parse(Buffer.from(payloadRaw, 'base64').toString('utf8'));
  const parentPid = Number(payload?.parentPid);
  const from = String(payload?.from || '');
  const to = String(payload?.to || '');
  const logFile = String(payload?.logFile || '');

  const log = (line) => {
    if (!logFile) return;
    try {
      fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${line}\n`, 'utf8');
    } catch {}
  };

  log(`Helper started. Waiting for PID ${parentPid} to exit`);
  await waitForPidExit(parentPid, 120000);

  let finalRoot = from;
  if (from && to && from !== to) {
    const renamed = await renameWithRetry(from, to, 60000);
    if (renamed.ok) {
      finalRoot = to;
      log(`Rename successful: ${from} -> ${to}`);
    } else {
      log(`Rename failed: ${renamed.error}`);
    }
  }

  const relaunched = relaunch(payload, finalRoot);
  if (relaunched.ok) {
    log(`Relaunch successful from ${finalRoot}`);
  } else {
    log(`Relaunch failed: ${relaunched.error}`);
  }
}

main().catch(() => {
  process.exit(1);
});
