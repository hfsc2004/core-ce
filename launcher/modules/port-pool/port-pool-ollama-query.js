/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
function createOllamaQueryOps(ctx) {
  const {
    PortPool,
    agentRegistry,
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
    EXTERNAL_PORT_END
  } = ctx || {};

  function isPortAvailable(port) {
    const inWebUIRange = (port >= WEBUI_PORT_START && port <= WEBUI_PORT_END);
    const inAnythingLLMRange = (port >= ANYTHINGLLM_PORT_START && port <= ANYTHINGLLM_PORT_END);
    const inTerminalRange = (port >= TERMINAL_PORT_START && port <= TERMINAL_PORT_END);
    const inAgentRange = (port >= AGENT_PORT_START && port <= AGENT_PORT_END);
    const inCoordinatorRange = (port >= COORDINATOR_PORT_START && port <= COORDINATOR_PORT_END);
    const inExternalRange = (port >= EXTERNAL_PORT_START && port <= EXTERNAL_PORT_END);

    if (!inWebUIRange && !inAnythingLLMRange && !inTerminalRange && !inAgentRange && !inCoordinatorRange && !inExternalRange) {
      console.warn(`[PortPool:Ollama] Port ${port} is outside valid Ollama ranges`);
      return false;
    }

    return PortPool.isPortAvailable(port);
  }

  function getWebUIPortsInUse() {
    return PortPool.getPortsInUseFromRange(WEBUI_PORT_START, WEBUI_PORT_END);
  }

  function getAnythingLLMPortsInUse() {
    return PortPool.getPortsInUseFromRange(ANYTHINGLLM_PORT_START, ANYTHINGLLM_PORT_END);
  }

  function getTerminalPortsInUse() {
    return PortPool.getPortsInUseFromRange(TERMINAL_PORT_START, TERMINAL_PORT_END);
  }

  function getServerPortsInUse() {
    console.warn('[PortPool:Ollama] ⚠️  DEPRECATED: getServerPortsInUse() called. Use getWebUIPortsInUse() or getAnythingLLMPortsInUse() instead.');
    return [
      ...getWebUIPortsInUse(),
      ...getAnythingLLMPortsInUse()
    ];
  }

  function getAgentPortsInUse() {
    return PortPool.getPortsInUseFromRange(AGENT_PORT_START, AGENT_PORT_END);
  }

  function getCoordinatorPortsInUse() {
    return PortPool.getPortsInUseFromRange(COORDINATOR_PORT_START, COORDINATOR_PORT_END);
  }

  function getExternalPortsInUse() {
    return PortPool.getPortsInUseFromRange(EXTERNAL_PORT_START, EXTERNAL_PORT_END);
  }

  function getPortsInUse() {
    return [
      ...getWebUIPortsInUse(),
      ...getAnythingLLMPortsInUse(),
      ...getTerminalPortsInUse(),
      ...getAgentPortsInUse(),
      ...getCoordinatorPortsInUse(),
      ...getExternalPortsInUse()
    ];
  }

  function getAgentInfo(port) {
    return agentRegistry.get(port) || null;
  }

  function getPortsByRole(role) {
    const result = [];
    for (const [port, info] of agentRegistry.entries()) {
      if (info.role === role) {
        result.push({ port, ...info });
      }
    }
    return result;
  }

  return {
    isPortAvailable,
    getWebUIPortsInUse,
    getAnythingLLMPortsInUse,
    getTerminalPortsInUse,
    getServerPortsInUse,
    getAgentPortsInUse,
    getCoordinatorPortsInUse,
    getExternalPortsInUse,
    getPortsInUse,
    getAgentInfo,
    getPortsByRole
  };
}

module.exports = createOllamaQueryOps;
