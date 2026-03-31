'use strict';

function createIngressTools(deps = {}) {
  const { http, settingsManager, networkHost, getActiveDeployment, getBmoc, getCoordinatorBridge, setIngress } = deps;

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
    const server = http.createServer(async (req, res) => {
      try {
        if (req.method === 'OPTIONS') {
          res.writeHead(204, corsHeaders());
          res.end();
          return;
        }

        const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
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
    } catch (err) {
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

  function readRequestBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
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
