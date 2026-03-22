/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const http = require('http');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForOllamaHealth(port, timeout = 45000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    try {
      const healthy = await new Promise((resolve) => {
        const req = http.get(`http://127.0.0.1:${port}/api/tags`, (res) => {
          resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(2000, () => {
          req.destroy();
          resolve(false);
        });
      });

      if (healthy) return true;
    } catch {
      // Continue waiting.
    }

    await sleep(1000);
  }

  return false;
}

async function waitForWebUIReady(port, timeout = 120000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    try {
      const ready = await new Promise((resolve) => {
        const req = http.get(`http://127.0.0.1:${port}/api/config`, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            try {
              JSON.parse(data);
              resolve(true);
            } catch {
              resolve(false);
            }
          });
        });
        req.on('error', () => resolve(false));
        req.setTimeout(2000, () => {
          req.destroy();
          resolve(false);
        });
      });

      if (ready) return true;
    } catch {
      // Continue waiting.
    }

    await sleep(1000);
  }

  return false;
}

async function waitForAnythingLLMReady(port, timeout = 90000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    try {
      const ready = await new Promise((resolve) => {
        const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
          resolve(res.statusCode < 500);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(2000, () => {
          req.destroy();
          resolve(false);
        });
      });

      if (ready) return true;
    } catch {
      // Continue waiting.
    }

    await sleep(2000);
  }

  return false;
}

module.exports = {
  waitForOllamaHealth,
  waitForWebUIReady,
  waitForAnythingLLMReady
};
