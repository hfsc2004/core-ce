'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function createIngressTools(deps = {}) {
  const { http, settingsManager, networkHost, getActiveDeployment, getBmoc, getCoordinatorBridge, setIngress } = deps;
  const managementFiles = new Map();

  function getInputApiGatewayConfig() {
    const gateways = Object.values(getActiveDeployment()?.gateways || {});
    for (const gateway of gateways) {
      const position = String(gateway?.position || '').toLowerCase();
      if (position !== 'input' && position !== 'bidirectional') continue;
      if (gateway?.enabled === false) continue;
      const api = gateway?.sources?.api || {};
      const rawPort = Number.parseInt(String(api.port || ''), 10);
      return {
        name: gateway?.name || 'Input Gateway',
        port: Number.isInteger(rawPort) ? rawPort : null,
        endpoint: String(api.endpoint || '/v1/chat').trim() || '/v1/chat'
      };
    }
    return {
      name: 'Relay Pipeline',
      port: null,
      endpoint: '/v1/chat'
    };
  }

  async function deployIngressIfConfigured(appPath) {
    const gatewayApi = getInputApiGatewayConfig();
    if (!gatewayApi) {
      setIngress(null);
      return { enabled: false };
    }

    const bmoc = getBmoc();
    const bridge = getCoordinatorBridge();
    if (typeof bmoc.allocateCoordinatorPort !== 'function' || typeof bmoc.releaseCoordinatorPort !== 'function') {
      throw new Error('BMOC coordinator port allocator is unavailable for Relay ingress');
    }
    if (typeof bridge.routeMoEMessage !== 'function') {
      throw new Error('MoE coordinator bridge is unavailable for Relay ingress');
    }

    const activeDeployment = getActiveDeployment();
    const allocatedPort = bmoc.allocateCoordinatorPort(
      gatewayApi.port,
      `Relay Pipeline Ingress [${activeDeployment?.id || 'moe'}]`
    );
    if (!Number.isInteger(allocatedPort)) {
      throw new Error('BMOC could not allocate a coordinator port for Relay ingress');
    }

    const endpointPath = gatewayApi.endpoint.startsWith('/') ? gatewayApi.endpoint : `/${gatewayApi.endpoint}`;
    const bindMode = resolveRelayIngressBindMode(appPath);
    const bindHost = bindMode === 'lan' ? '0.0.0.0' : '127.0.0.1';
    const detectedHost = networkHost.getPrimaryLanIpv4();
    const accessHost = detectedHost || (bindMode === 'lan' ? bindHost : '127.0.0.1');
    const managementToken = crypto.randomBytes(32).toString('hex');
    const server = http.createServer(async (req, res) => {
      try {
        if (req.method === 'OPTIONS') {
          res.writeHead(204, corsHeaders());
          res.end();
          return;
        }

        const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
        if (reqUrl.pathname === '/v1/ngi') {
          const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket?.remoteAddress);
          if (!local || req.headers.origin || req.headers.authorization !== `Bearer ${managementToken}`) {
            sendJson(res, 403, { success: false, error: 'Local NGI management authorization required' }); return;
          }
          if (req.method !== 'POST' || typeof bridge.ngiCommand !== 'function') {
            sendJson(res, 404, { success: false, error: 'NGI management unavailable' }); return;
          }
          const payload = JSON.parse(await readRequestBody(req, 256 * 1024));
          if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).some(key => !['gatewayId','action','params'].includes(key))) {
            sendJson(res, 400, { success: false, error: 'Invalid NGI command fields' }); return;
          }
          const result = await bridge.ngiCommand(payload);
          sendJson(res, result.success ? 200 : 400, result); return;
        }
        if (req.method === 'GET' && reqUrl.pathname === '/health') {
          sendJson(res, 200, { ok: true, deploymentId: getActiveDeployment()?.id || null });
          return;
        }

        if (req.method !== 'POST' || reqUrl.pathname !== endpointPath) {
          sendJson(res, 404, { success: false, error: 'not_found' });
          return;
        }

        const rawBody = await readRequestBody(req);
        const payload = tryParseJson(rawBody);
        const message = String(payload?.message ?? payload?.prompt ?? payload?.input ?? '').trim();
        if (!message) {
          sendJson(res, 400, { success: false, error: 'message_required' });
          return;
        }

        const options = payload?.options && typeof payload.options === 'object' ? payload.options : {};
        const result = await bridge.routeMoEMessage(message, options);
        if (!result?.success) {
          sendJson(res, 400, {
            success: false,
            error: result?.error || 'route_failed',
            trace: result?.trace || null,
            response: result?.response || ''
          });
          return;
        }

        sendJson(res, 200, {
          success: true,
          response: result.response,
          trace: result.trace || null,
          irg: result.irg || null
        });
      } catch (err) {
        sendJson(res, 500, { success: false, error: err.message || 'internal_error' });
      }
    });

    try {
      await listenOnPort(server, allocatedPort, bindHost);
      if (typeof bridge.ngiCommand === 'function') {
        const file = path.join(appPath, '..', 'config/relay/ngi-management.json');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const temporary = `${file}.${managementToken.slice(0, 8)}.tmp`;
        fs.writeFileSync(temporary, JSON.stringify({ schemaVersion: '1.0', deploymentId: activeDeployment.id,
          url: `http://127.0.0.1:${server.address().port}/v1/ngi`, token: managementToken }), { mode: 0o600, flag: 'wx' });
        fs.renameSync(temporary, file);
        managementFiles.set(server, { file, token: managementToken });
      }
    } catch (err) {
      try { server.close(); } catch (_) {}
      if (typeof bmoc.releaseCoordinatorPort === 'function') {
        bmoc.releaseCoordinatorPort(allocatedPort);
      }
      throw err;
    }

    const ingress = {
      enabled: true,
      name: gatewayApi.name,
      host: bindHost,
      requestedPort: gatewayApi.port,
      port: allocatedPort,
      bindMode,
      bindHost,
      accessHost,
      endpoint: endpointPath,
      url: `http://${bindHost}:${allocatedPort}${endpointPath}`,
      accessUrl: `http://${accessHost}:${allocatedPort}${endpointPath}`,
      server
    };
    setIngress(ingress);
    console.log(`[MoE Deployment] 🌐 Relay ingress: ${ingress.url}`);
    return ingress;
  }

  function readRequestBody(req, limit = Infinity) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > limit) { reject(new Error('NGI request exceeds size limit')); req.destroy(); return; }
        chunks.push(chunk);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  function tryParseJson(rawText) {
    if (!rawText) return {};
    try {
      return JSON.parse(rawText);
    } catch (_err) {
      return {};
    }
  }

  function corsHeaders() {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json; charset=utf-8'
    };
  }

  function sendJson(res, statusCode, body) {
    res.writeHead(statusCode, corsHeaders());
    res.end(JSON.stringify(body || {}));
  }

  function listenOnPort(server, port, host = '127.0.0.1') {
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        server.removeListener('error', reject);
        resolve();
      });
    });
  }

  function closeIngressServer(server, port) {
    return new Promise((resolve) => {
      const release = () => {
        const descriptor = managementFiles.get(server);
        if (descriptor) {
          try { if (JSON.parse(fs.readFileSync(descriptor.file, 'utf8')).token === descriptor.token) fs.unlinkSync(descriptor.file); } catch (_) {}
          managementFiles.delete(server);
        }
        const bmoc = getBmoc();
        if (Number.isInteger(Number(port)) && typeof bmoc.releaseCoordinatorPort === 'function') {
          bmoc.releaseCoordinatorPort(Number(port));
        }
        resolve();
      };
      try {
        server.close(() => release());
      } catch (_err) {
        release();
      }
    });
  }

  function sanitizeIngress(ingress) {
    if (!ingress || typeof ingress !== 'object') return null;
    return {
      enabled: ingress.enabled === true,
      name: ingress.name || 'Relay Pipeline',
      host: ingress.host || '127.0.0.1',
      bindMode: ingress.bindMode || 'localhost',
      bindHost: ingress.bindHost || ingress.host || '127.0.0.1',
      accessHost: ingress.accessHost || ingress.host || '127.0.0.1',
      requestedPort: Number.isInteger(Number(ingress.requestedPort)) ? Number(ingress.requestedPort) : null,
      port: Number.isInteger(Number(ingress.port)) ? Number(ingress.port) : null,
      endpoint: ingress.endpoint || '/v1/chat',
      url: ingress.url || null,
      accessUrl: ingress.accessUrl || null
    };
  }

  function resolveRelayIngressBindMode(appPath) {
    try {
      const settings = settingsManager.getSettings(appPath) || {};
      const raw = String(settings.relay_ingress_bind || 'localhost').trim().toLowerCase();
      return raw === 'lan' ? 'lan' : 'localhost';
    } catch (_err) {
      return 'localhost';
    }
  }

  return {
    deployIngressIfConfigured,
    closeIngressServer,
    sanitizeIngress
  };
}

module.exports = createIngressTools;
