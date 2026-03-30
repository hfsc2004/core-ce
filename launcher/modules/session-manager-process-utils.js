/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const { promisify } = require('util');
const { exec } = require('child_process');

const execPromise = promisify(exec);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function listChildPids(pid) {
  if (!pid) return [];
  try {
    const { stdout } = await execPromise(`pgrep -P ${pid}`);
    return String(stdout || '')
      .trim()
      .split('\n')
      .map((value) => Number(String(value || '').trim()))
      .filter((value) => Number.isFinite(value) && value > 0);
  } catch {
    return [];
  }
}

async function collectDescendantPids(rootPid, seen = new Set()) {
  const out = [];
  const queue = [Number(rootPid)];
  while (queue.length > 0) {
    const current = Number(queue.shift());
    if (!Number.isFinite(current) || current <= 0 || seen.has(current)) continue;
    seen.add(current);
    const children = await listChildPids(current);
    for (const child of children) {
      if (!seen.has(child)) {
        out.push(child);
        queue.push(child);
      }
    }
  }
  return out;
}

async function isProcessRunning(pid) {
  if (!pid) return false;

  const platform = process.platform;

  try {
    if (platform === 'win32') {
      const { stdout } = await execPromise(`tasklist /FI "PID eq ${pid}" /NH`);
      return stdout.includes(pid.toString());
    }
    await execPromise(`ps -p ${pid}`);
    return true;
  } catch {
    return false;
  }
}

async function killProcess(pid, name) {
  if (!pid) return;

  const platform = process.platform;

  try {
    if (platform === 'win32') {
      await execPromise(`taskkill /F /T /PID ${pid}`);
      console.log(`[Session Manager] Killed ${name} process tree (PID ${pid})`);
    } else {
      // Kill descendants first so orphaned ollama runner children do not survive.
      const descendants = await collectDescendantPids(pid);
      for (const childPid of descendants.reverse()) {
        try {
          await execPromise(`kill -TERM ${childPid}`);
        } catch {
          // Already dead.
        }
      }

      try {
        process.kill(-pid, 'SIGTERM');
        console.log(`[Session Manager] Killed ${name} process group (PGID ${pid})`);
      } catch {
        await execPromise(`kill -TERM ${pid}`);
        console.log(`[Session Manager] Killed ${name} (PID ${pid})`);
      }

      // Wait briefly for graceful shutdown, then force-kill if needed.
      let stillRunning = await isProcessRunning(pid);
      if (stillRunning) {
        for (let attempt = 0; attempt < 10; attempt++) {
          await sleep(120);
          stillRunning = await isProcessRunning(pid);
          if (!stillRunning) break;
        }
      }
      if (stillRunning) {
        // Kill descendants first, then process group/pid.
        const remainingDescendants = await collectDescendantPids(pid);
        for (const childPid of remainingDescendants.reverse()) {
          try {
            await execPromise(`kill -KILL ${childPid}`);
          } catch {
            // Already dead.
          }
        }
        try {
          process.kill(-pid, 'SIGKILL');
          console.log(`[Session Manager] Force-killed ${name} process group (PGID ${pid})`);
        } catch {
          try {
            await execPromise(`kill -KILL ${pid}`);
            console.log(`[Session Manager] Force-killed ${name} (PID ${pid})`);
          } catch {
            // Already dead or inaccessible.
          }
        }
      }
    }
  } catch {
    // Process already dead.
  }
}

async function killProcessesOnPort(port, name = 'Process') {
  const targetPort = Number(port || 0);
  if (!Number.isFinite(targetPort) || targetPort <= 0) return;
  if (process.platform === 'win32') return;

  let pids = [];
  try {
    const { stdout } = await execPromise(`lsof -ti:${targetPort}`);
    pids = String(stdout || '')
      .trim()
      .split('\n')
      .map((v) => Number(String(v || '').trim()))
      .filter((v) => Number.isFinite(v) && v > 0);
  } catch {
    pids = [];
  }

  for (const pid of pids) {
    try {
      await killProcess(pid, `${name} on port ${targetPort}`);
    } catch {
      // best effort
    }
  }
}

module.exports = {
  isProcessRunning,
  killProcess,
  killProcessesOnPort
};
