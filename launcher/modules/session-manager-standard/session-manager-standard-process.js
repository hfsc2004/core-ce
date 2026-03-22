/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
const { exec } = require('child_process');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function killProcess(pid, name, logger = console) {
  if (!pid) return;

  logger.log(`[BMOC-Lite] Killing ${name} (PID ${pid})...`);

  try {
    process.kill(pid, 'SIGTERM');
    await sleep(3000);

    try {
      process.kill(pid, 0);
      logger.log(`[BMOC-Lite] ${name} still running, sending SIGKILL`);
      process.kill(pid, 'SIGKILL');
    } catch {
      // Process already exited.
    }
  } catch {
    logger.log(`[BMOC-Lite] ${name} (PID ${pid}) already stopped`);
  }
}

async function killProcessGroup(pid, name, logger = console) {
  if (!pid) return;

  logger.log(`[BMOC-Lite] Killing ${name} process group (PID ${pid})...`);

  try {
    if (process.platform !== 'win32') {
      try {
        process.kill(-pid, 'SIGTERM');
        await sleep(2000);
        try {
          process.kill(-pid, 'SIGKILL');
        } catch {
          // Process group already dead.
        }
      } catch {
        try {
          process.kill(pid, 'SIGTERM');
        } catch {
          // Process already dead.
        }
      }
    } else {
      exec(`taskkill /F /T /PID ${pid}`, (err) => {
        if (err) {
          logger.log(`[BMOC-Lite] taskkill error (may be already dead): ${err.message}`);
        }
      });
    }
  } catch {
    logger.log(`[BMOC-Lite] ${name} (PID ${pid}) already stopped`);
  }
}

module.exports = {
  killProcess,
  killProcessGroup
};
