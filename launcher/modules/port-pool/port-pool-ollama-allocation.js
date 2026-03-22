/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Global Science Network
 */
/**
 * Port Pool Ollama - Allocation Helpers
 */

function createOllamaAllocationOps(deps = {}) {
  const {
    PortPool,
    AGENT_ROLES,
    agentRegistry,
    logStats,
    WEBUI_PORT_START,
    WEBUI_PORT_END,
    ANYTHINGLLM_PORT_START,
    ANYTHINGLLM_PORT_END,
    TERMINAL_PORT_START,
    TERMINAL_PORT_END,
    AGENT_PORT_START,
    AGENT_PORT_END,
    COORDINATOR_PORT_START,
    COORDINATOR_PORT_END,
    EXTERNAL_PORT_START,
    EXTERNAL_PORT_END,
    getAgentPortsInUse
  } = deps;

  function getWebUIPort(owner = 'Open WebUI Ollama') {
    const port = PortPool.allocatePort(
      WEBUI_PORT_START,
      WEBUI_PORT_END,
      owner,
      'ollama-webui',
      'OLLAMA-WEBUI'
    );

    if (port !== null) {
      console.log(`[PortPool:Ollama] Allocated port ${port} from WEBUI pool for: ${owner}`);
      logStats();
    }

    return port;
  }

  function getAnythingLLMPort(owner = 'AnythingLLM Ollama') {
    const port = PortPool.allocatePort(
      ANYTHINGLLM_PORT_START,
      ANYTHINGLLM_PORT_END,
      owner,
      'ollama-anythingllm',
      'OLLAMA-ANYTHINGLLM'
    );

    if (port !== null) {
      console.log(`[PortPool:Ollama] Allocated port ${port} from ANYTHINGLLM pool for: ${owner}`);
      logStats();
    }

    return port;
  }

  function getTerminalPort(owner = 'Ollama Terminal') {
    const port = PortPool.allocatePort(
      TERMINAL_PORT_START,
      TERMINAL_PORT_END,
      owner,
      'ollama-terminal',
      'OLLAMA-TERMINAL'
    );

    if (port !== null) {
      console.log(`[PortPool:Ollama] Allocated port ${port} from TERMINAL pool for: ${owner}`);
      logStats();
    }

    return port;
  }

  function getServerPort(owner = 'PSF Ollama Server') {
    console.warn('[PortPool:Ollama] ⚠️  DEPRECATED: getServerPort() called. Use getWebUIPort() or getAnythingLLMPort() instead.');
    console.warn('[PortPool:Ollama]    Caller should specify service type for proper pool segregation.');

    let port = PortPool.allocatePort(
      WEBUI_PORT_START,
      WEBUI_PORT_END,
      owner,
      'ollama-webui',
      'OLLAMA-WEBUI'
    );

    if (port !== null) {
      console.log(`[PortPool:Ollama] (deprecated) Allocated port ${port} from WEBUI pool`);
      logStats();
      return port;
    }

    port = PortPool.allocatePort(
      ANYTHINGLLM_PORT_START,
      ANYTHINGLLM_PORT_END,
      owner,
      'ollama-anythingllm',
      'OLLAMA-ANYTHINGLLM'
    );

    if (port !== null) {
      console.log(`[PortPool:Ollama] (deprecated) Allocated port ${port} from ANYTHINGLLM pool (fallback)`);
      logStats();
    }

    return port;
  }

  function getAgentPort(options = {}) {
    const {
      role = AGENT_ROLES.WORKER,
      model = 'smollm2-135m',
      purpose = 'Agent',
      owner = 'MoE System'
    } = options;

    const port = PortPool.allocatePort(
      AGENT_PORT_START,
      AGENT_PORT_END,
      `${owner} [${role}]`,
      'ollama-agent',
      'OLLAMA-AGENT'
    );

    if (port !== null) {
      agentRegistry.set(port, {
        role,
        model,
        purpose,
        owner,
        poolType: 'agent',
        allocatedAt: Date.now()
      });

      const count = getAgentPortsInUse().length;
      if (count <= 10 || count % 100 === 0) {
        console.log(`[PortPool:Ollama] Agent #${count}: port ${port}, role=${role}, model=${model}`);
      }
    }

    return port;
  }

  function getAgentPortsBulk(count, options = {}) {
    const ports = [];
    const startTime = Date.now();

    console.log(`[PortPool:Ollama] Bulk allocating ${count} agents...`);

    for (let i = 0; i < count; i++) {
      const port = getAgentPort({
        ...options,
        owner: options.owner ? `${options.owner}[${i}]` : `Agent[${i}]`
      });

      if (port === null) {
        console.warn(`[PortPool:Ollama] Bulk allocation stopped at ${i}/${count} - pool exhausted`);
        break;
      }

      ports.push(port);
    }

    const elapsed = Date.now() - startTime;
    console.log(`[PortPool:Ollama] Bulk allocated ${ports.length}/${count} agents in ${elapsed}ms`);
    logStats();

    return ports;
  }

  function getCoordinatorPort(options = {}) {
    const {
      role = AGENT_ROLES.ROUTER,
      model = 'llama3-8b',
      purpose = 'Coordinator',
      owner = 'MoE System'
    } = options;

    const port = PortPool.allocatePort(
      COORDINATOR_PORT_START,
      COORDINATOR_PORT_END,
      `${owner} [${role}]`,
      'ollama-coordinator',
      'OLLAMA-COORDINATOR'
    );

    if (port !== null) {
      agentRegistry.set(port, {
        role,
        model,
        purpose,
        owner,
        poolType: 'coordinator',
        allocatedAt: Date.now()
      });

      console.log(`[PortPool:Ollama] Coordinator: port ${port}, role=${role}`);
      logStats();
    }

    return port;
  }

  function getExternalPort(options = {}) {
    const {
      role = AGENT_ROLES.SERIAL_BRIDGE,
      device = 'unknown',
      purpose = 'External I/O',
      owner = 'Hardware Bridge'
    } = options;

    const port = PortPool.allocatePort(
      EXTERNAL_PORT_START,
      EXTERNAL_PORT_END,
      `${owner} [${role}:${device}]`,
      'ollama-external',
      'OLLAMA-EXTERNAL'
    );

    if (port !== null) {
      agentRegistry.set(port, {
        role,
        device,
        purpose,
        owner,
        poolType: 'external',
        allocatedAt: Date.now()
      });

      console.log(`[PortPool:Ollama] External I/O: port ${port}, role=${role}, device=${device}`);
      logStats();
    }

    return port;
  }

  return {
    getWebUIPort,
    getAnythingLLMPort,
    getTerminalPort,
    getServerPort,
    getAgentPort,
    getAgentPortsBulk,
    getCoordinatorPort,
    getExternalPort
  };
}

module.exports = createOllamaAllocationOps;
