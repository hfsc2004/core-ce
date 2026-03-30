/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
function createOllamaReleaseOps(ctx) {
  const {
    PortPool,
    agentRegistry,
    AGENT_PORT_START,
    AGENT_PORT_END,
    COORDINATOR_PORT_START,
    COORDINATOR_PORT_END,
    EXTERNAL_PORT_START,
    EXTERNAL_PORT_END,
    WEBUI_PORT_START,
    WEBUI_PORT_END,
    ANYTHINGLLM_PORT_START,
    ANYTHINGLLM_PORT_END,
    TERMINAL_PORT_START,
    TERMINAL_PORT_END,
    logStats
  } = ctx || {};

  function releasePort(port) {
    if (agentRegistry.has(port)) {
      agentRegistry.delete(port);
    }

    const result = PortPool.releasePort(port);
    if (result) {
      logStats();
    }
    return result;
  }

  function releasePortsBulk(ports) {
    let released = 0;
    const startTime = Date.now();

    for (const port of ports) {
      if (releasePort(port)) {
        released++;
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`[PortPool:Ollama] Bulk released ${released}/${ports.length} ports in ${elapsed}ms`);
    return released;
  }

  function releaseByRole(role) {
    const portsToRelease = [];
    for (const [port, info] of agentRegistry.entries()) {
      if (info.role === role) {
        portsToRelease.push(port);
      }
    }
    console.log(`[PortPool:Ollama] Releasing ${portsToRelease.length} ports with role=${role}`);
    return releasePortsBulk(portsToRelease);
  }

  function releaseAllWebUI() {
    console.log('[PortPool:Ollama] Releasing all WebUI ports...');
    return PortPool.releaseRangePorts(WEBUI_PORT_START, WEBUI_PORT_END);
  }

  function releaseAllAnythingLLM() {
    console.log('[PortPool:Ollama] Releasing all AnythingLLM ports...');
    return PortPool.releaseRangePorts(ANYTHINGLLM_PORT_START, ANYTHINGLLM_PORT_END);
  }

  function releaseAllTerminal() {
    console.log('[PortPool:Ollama] Releasing all Terminal ports...');
    return PortPool.releaseRangePorts(TERMINAL_PORT_START, TERMINAL_PORT_END);
  }

  function releaseAllAgents() {
    console.log('[PortPool:Ollama] Releasing all agent ports...');
    for (const [port, info] of agentRegistry.entries()) {
      if (info.poolType === 'agent') {
        agentRegistry.delete(port);
      }
    }
    return PortPool.releaseRangePorts(AGENT_PORT_START, AGENT_PORT_END);
  }

  function releaseAllCoordinators() {
    console.log('[PortPool:Ollama] Releasing all coordinator ports...');
    for (const [port, info] of agentRegistry.entries()) {
      if (info.poolType === 'coordinator') {
        agentRegistry.delete(port);
      }
    }
    return PortPool.releaseRangePorts(COORDINATOR_PORT_START, COORDINATOR_PORT_END);
  }

  function releaseAllExternal() {
    console.log('[PortPool:Ollama] Releasing all external ports...');
    for (const [port, info] of agentRegistry.entries()) {
      if (info.poolType === 'external') {
        agentRegistry.delete(port);
      }
    }
    return PortPool.releaseRangePorts(EXTERNAL_PORT_START, EXTERNAL_PORT_END);
  }

  function releaseAllPorts() {
    console.log('[PortPool:Ollama] Releasing ALL Ollama ports...');

    agentRegistry.clear();

    const webuiCount = PortPool.releaseRangePorts(WEBUI_PORT_START, WEBUI_PORT_END);
    const anythingllmCount = PortPool.releaseRangePorts(ANYTHINGLLM_PORT_START, ANYTHINGLLM_PORT_END);
    const terminalCount = PortPool.releaseRangePorts(TERMINAL_PORT_START, TERMINAL_PORT_END);
    const agentCount = PortPool.releaseRangePorts(AGENT_PORT_START, AGENT_PORT_END);
    const coordCount = PortPool.releaseRangePorts(COORDINATOR_PORT_START, COORDINATOR_PORT_END);
    const extCount = PortPool.releaseRangePorts(EXTERNAL_PORT_START, EXTERNAL_PORT_END);

    const total = webuiCount + anythingllmCount + terminalCount + agentCount + coordCount + extCount;
    console.log(`[PortPool:Ollama] Released ${total} total ports`);
    return total;
  }

  return {
    releasePort,
    releasePortsBulk,
    releaseByRole,
    releaseAllWebUI,
    releaseAllAnythingLLM,
    releaseAllTerminal,
    releaseAllAgents,
    releaseAllCoordinators,
    releaseAllExternal,
    releaseAllPorts
  };
}

module.exports = createOllamaReleaseOps;
