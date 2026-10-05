'use strict';

// External emulator only. This adapter receives read-only deployment/state access;
// it has no model transport or BMOC lifecycle capabilities.
const ADAPTER = 'kt-emulator-http';
const INSTRUCTIONS = ['FF', 'FFLV', 'RF', 'RFLV', 'FH', 'FL', 'FU', 'FA', 'FZ', 'RH', 'RL', 'RU', 'RA', 'RZ'];
const DEFAULTS = Object.freeze({ baseUrl: 'http://127.0.0.1:8000', timeoutMs: 5000,
  instruction: 'FF', noise: 0, model: 'float', init: 'medium', seed: 1, read_noise: 0.02, start_y: '' });
function origin(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) throw new Error('Emulator URL must be an HTTP(S) origin');
  return url.origin;
}
function numeric(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a finite number`);
  return value;
}
function settings(value = {}) {
  const config = { ...DEFAULTS, ...value };
  config.baseUrl = origin(config.baseUrl);
  if (!Number.isInteger(config.timeoutMs) || config.timeoutMs < 100 || config.timeoutMs > 60000) throw new Error('Timeout must be 100–60000 ms');
  if (!INSTRUCTIONS.includes(config.instruction)) throw new Error('Unknown emulator instruction');
  numeric(config.noise, 'Noise'); numeric(config.read_noise, 'Read noise');
  if (config.noise < 0 || config.read_noise < 0) throw new Error('Noise cannot be negative');
  if (!Number.isInteger(config.seed)) throw new Error('Seed must be an integer');
  if (!['float', 'byte', 'mss', 'rs'].includes(config.model)) throw new Error('Unknown emulator model');
  if (!['low', 'medium', 'high', 'low_noise', 'high_noise', 'medium_noise', 'medium_high_noise', 'low_noiseless', 'medium_noiseless', 'low_noise_small'].includes(config.init)) throw new Error('Unknown emulator initialization');
  if (config.start_y !== '' && config.start_y != null) numeric(config.start_y, 'Starting y');
  return config;
}
function deployFields(gateway) {
  return { assignedAgentIds: [...(gateway.assignedAgentIds || [])], adapter: gateway.adapter || '',
    ktEmulator: gateway.adapter === ADAPTER ? settings(gateway.ktEmulator) : undefined };
}
function createGatewayClient({ getStatus, getStateStatus, fetch: request = globalThis.fetch, log = entry => console.log('[Relay Gateway]', JSON.stringify(entry)) }) {
  let tail = Promise.resolve(); // One external instance: serialize across all operations.
  function run(gatewayId, command) {
    const operation = tail.then(() => execute(gatewayId, command));
    tail = operation.catch(() => {});
    return operation;
  }
  async function execute(gatewayId, command) {
    const started = Date.now();
    const entry = { gatewayId, kind: 'external-emulator-observation', origin: 'manual', command,
      startedAt: new Date(started).toISOString(), success: false };
    let timer;
    try {
      const deployment = getStatus();
      const gateway = deployment?.gateways?.[gatewayId];
      if (!deployment?.id || !gateway || gateway.enabled === false || gateway.adapter !== ADAPTER) throw new Error('External emulator Gateway is not deployed/enabled');
      if (Object.values(deployment.gateways).filter(g => g.adapter === ADAPTER && g.enabled !== false).length !== 1) throw new Error('Only one external emulator Gateway is supported');
      if (gateway.position !== 'output') throw new Error('External emulator Gateway must be output');
      if (gateway.assignedAgentIds?.length !== 1) throw new Error('Assign exactly one Agent');
      const agentId = gateway.assignedAgentIds[0];
      const agent = deployment.agents?.[agentId];
      if (!agent?.sessionId) throw new Error('Assigned Agent is not deployed');
      const state = getStateStatus(agent.sessionId);
      Object.assign(entry, { agentId, sessionId: agent.sessionId, generation: state?.generation ?? null,
        turnCount: state?.turnCount ?? null });
      const config = settings(gateway.ktEmulator);
      const target = new URL(config.baseUrl);
      // Never send emulator commands to any deployed model endpoint. Redirects are
      // disabled below so an external service cannot forward them to a model.
      for (const model of Object.values(deployment.agents || {})) {
        if (!model.endpoint) continue;
        const endpoint = new URL(model.endpoint);
        const local = host => ['localhost', '127.0.0.1', '[::1]'].includes(host);
        if (target.origin === endpoint.origin || (local(target.hostname) && local(endpoint.hostname) && target.port === endpoint.port)) throw new Error('Emulator URL cannot target a model endpoint');
      }
      let path; let body;
      if (command === 'read') path = '/api/state';
      else if (command === 'evaluate') {
        path = '/api/evaluate'; body = { instruction: config.instruction, noise: config.noise };
      } else if (command === 'reset') {
        path = '/api/reset'; body = { seed: config.seed, model: config.model, init: config.init, read_noise: config.read_noise };
        if (config.start_y !== '' && config.start_y != null) body.start_y = config.start_y;
      } else throw new Error('Unsupported emulator command');
      Object.assign(entry, { baseUrl: config.baseUrl, endpoint: path, request: body || null });
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), config.timeoutMs);
      const response = await request(config.baseUrl + path, { method: body ? 'POST' : 'GET', redirect: 'error',
        ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}), signal: controller.signal });
      entry.httpStatus = response.status;
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
      const result = {};
      for (const key of ['step', 'y', 'ga', 'gb', 'magnitude', 'seed', 'read_noise']) result[key] = numeric(data[key], key);
      if (!Number.isInteger(result.step) || result.step < 0) throw new Error('Invalid emulator step');
      for (const key of ['instruction', 'model', 'init']) {
        if (typeof data[key] !== 'string') throw new Error(`Missing emulator ${key}`);
        result[key] = data[key];
      }
      entry.result = result;
      entry.success = true;
    } catch (error) {
      entry.error = error.name === 'AbortError' ? 'Emulator request timed out; it may already have executed' : error.message;
    } finally { clearTimeout(timer); }
    entry.durationMs = Date.now() - started;
    try { log(entry); } catch (_) { /* logging must not fail an operation */ }
    return { success: entry.success, error: entry.error, result: entry.result,
      trace: { startedAt: entry.startedAt, completedAt: new Date().toISOString(), steps: [entry] } };
  }
  return { run };
}
module.exports = { ADAPTER, INSTRUCTIONS, DEFAULTS, settings, deployFields, createGatewayClient };
