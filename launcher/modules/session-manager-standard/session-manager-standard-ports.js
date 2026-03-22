/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
const net = require('net');

function createPortPools() {
  return {
    terminalOllama: {
      start: 52454,
      end: 52456,
      allocated: new Set(),
      label: 'Terminal Ollama'
    },
    webuiOllama: {
      start: 52434,
      end: 52436,
      allocated: new Set(),
      label: 'WebUI Ollama'
    },
    webuiService: {
      start: 52460,
      end: 52462,
      allocated: new Set(),
      label: 'WebUI Service'
    },
    anythingllmOllama: {
      start: 52444,
      end: 52446,
      allocated: new Set(),
      label: 'AnythingLLM Ollama'
    },
    anythingllmService: {
      start: 52470,
      end: 52472,
      allocated: new Set(),
      label: 'AnythingLLM Service'
    }
  };
}

async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });

    server.listen(port, '127.0.0.1');
  });
}

async function allocatePort(portPools, poolName, owner, logger = console) {
  const pool = portPools[poolName];
  if (!pool) {
    logger.error(`[BMOC-Lite] Unknown port pool: ${poolName}`);
    return null;
  }

  for (let port = pool.start; port <= pool.end; port++) {
    if (!pool.allocated.has(port)) {
      if (await isPortAvailable(port)) {
        pool.allocated.add(port);
        logger.log(`[BMOC-Lite] Allocated port ${port} from ${pool.label} pool for: ${owner}`);
        return port;
      }
    }
  }

  logger.error(`[BMOC-Lite] ${pool.label} pool exhausted (${pool.start}-${pool.end})`);
  return null;
}

function releasePort(portPools, poolName, port, logger = console) {
  const pool = portPools[poolName];
  if (pool && pool.allocated.has(port)) {
    pool.allocated.delete(port);
    logger.log(`[BMOC-Lite] Released port ${port} back to ${pool.label} pool`);
  }
}

function clearAllPools(portPools) {
  for (const poolName of Object.keys(portPools || {})) {
    portPools[poolName].allocated.clear();
  }
}

module.exports = {
  createPortPools,
  isPortAvailable,
  allocatePort,
  releasePort,
  clearAllPools
};
