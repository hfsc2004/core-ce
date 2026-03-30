/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
function createOllamaPortPoolReporting(ctx) {
  const {
    PortPool,
    constants,
    getWebUIPortsInUse,
    getAnythingLLMPortsInUse,
    getTerminalPortsInUse,
    getAgentPortsInUse,
    getCoordinatorPortsInUse,
    getExternalPortsInUse
  } = ctx || {};

  const {
    WEBUI_PORT_START,
    WEBUI_PORT_END,
    TOTAL_WEBUI_PORTS,
    ANYTHINGLLM_PORT_START,
    ANYTHINGLLM_PORT_END,
    TOTAL_ANYTHINGLLM_PORTS,
    TERMINAL_PORT_START,
    TERMINAL_PORT_END,
    TOTAL_TERMINAL_PORTS,
    AGENT_PORT_START,
    AGENT_PORT_END,
    TOTAL_AGENT_PORTS,
    COORDINATOR_PORT_START,
    COORDINATOR_PORT_END,
    TOTAL_COORDINATOR_PORTS,
    EXTERNAL_PORT_START,
    EXTERNAL_PORT_END,
    TOTAL_EXTERNAL_PORTS,
    TOTAL_STANDARD_PORTS,
    TOTAL_ENTERPRISE_PORTS,
    TOTAL_PORTS
  } = constants || {};

  function getStats() {
    const webuiStats = PortPool.getRangeStats(WEBUI_PORT_START, WEBUI_PORT_END, 'OLLAMA-WEBUI');
    const anythingllmStats = PortPool.getRangeStats(ANYTHINGLLM_PORT_START, ANYTHINGLLM_PORT_END, 'OLLAMA-ANYTHINGLLM');
    const terminalStats = PortPool.getRangeStats(TERMINAL_PORT_START, TERMINAL_PORT_END, 'OLLAMA-TERMINAL');
    const agentStats = PortPool.getRangeStats(AGENT_PORT_START, AGENT_PORT_END, 'OLLAMA-AGENT');
    const coordStats = PortPool.getRangeStats(COORDINATOR_PORT_START, COORDINATOR_PORT_END, 'OLLAMA-COORDINATOR');
    const extStats = PortPool.getRangeStats(EXTERNAL_PORT_START, EXTERNAL_PORT_END, 'OLLAMA-EXTERNAL');

    const standardInUse = webuiStats.portsInUse + anythingllmStats.portsInUse + terminalStats.portsInUse;
    const enterpriseInUse = agentStats.portsInUse + coordStats.portsInUse + extStats.portsInUse;

    return {
      standard: {
        webui: webuiStats,
        anythingllm: anythingllmStats,
        terminal: terminalStats,
        totalPorts: TOTAL_STANDARD_PORTS,
        portsInUse: standardInUse
      },
      enterprise: {
        agent: agentStats,
        coordinator: coordStats,
        external: extStats,
        totalPorts: TOTAL_ENTERPRISE_PORTS,
        portsInUse: enterpriseInUse
      },
      overall: {
        totalPorts: TOTAL_PORTS,
        portsInUse: standardInUse + enterpriseInUse,
        portsAvailable: TOTAL_PORTS - (standardInUse + enterpriseInUse),
        utilizationPercent: Math.round(((standardInUse + enterpriseInUse) / TOTAL_PORTS) * 100)
      }
    };
  }

  function getSummary() {
    const stats = getStats();

    return [
      '╔══════════════════════════════════════════════════════════════════╗',
      '║              OLLAMA PORT POOL STATUS                             ║',
      '╠══════════════════════════════════════════════════════════════════╣',
      '║  STANDARD POOLS:                                                 ║',
      `║    WebUI:        ${String(stats.standard.webui.portsInUse).padStart(5)} / ${String(stats.standard.webui.totalPorts).padEnd(5)}  (52434-52443)          ║`,
      `║    AnythingLLM:  ${String(stats.standard.anythingllm.portsInUse).padStart(5)} / ${String(stats.standard.anythingllm.totalPorts).padEnd(5)}  (52444-52453)          ║`,
      `║    Terminal:     ${String(stats.standard.terminal.portsInUse).padStart(5)} / ${String(stats.standard.terminal.totalPorts).padEnd(5)}  (52454-52463)          ║`,
      '╠══════════════════════════════════════════════════════════════════╣',
      '║  ENTERPRISE POOLS (MoE):                                         ║',
      `║    Agents:       ${String(stats.enterprise.agent.portsInUse).padStart(5)} / ${String(stats.enterprise.agent.totalPorts).padEnd(5)}  (53000-62999)          ║`,
      `║    Coordinators: ${String(stats.enterprise.coordinator.portsInUse).padStart(5)} / ${String(stats.enterprise.coordinator.totalPorts).padEnd(5)}  (63000-63499)          ║`,
      `║    External I/O: ${String(stats.enterprise.external.portsInUse).padStart(5)} / ${String(stats.enterprise.external.totalPorts).padEnd(5)}  (63500-63999)          ║`,
      '╠══════════════════════════════════════════════════════════════════╣',
      `║  TOTAL:          ${String(stats.overall.portsInUse).padStart(5)} / ${String(stats.overall.totalPorts).padEnd(5)}  (${String(stats.overall.utilizationPercent).padStart(3)}% used)              ║`,
      '╚══════════════════════════════════════════════════════════════════╝'
    ].join('\n');
  }

  function logStats() {
    const webui = getWebUIPortsInUse().length;
    const anythingllm = getAnythingLLMPortsInUse().length;
    const terminal = getTerminalPortsInUse().length;
    const agents = getAgentPortsInUse().length;
    const coords = getCoordinatorPortsInUse().length;
    const external = getExternalPortsInUse().length;

    if (agents > 0 || coords > 0 || external > 0) {
      console.log(`[PortPool:Ollama] WebUI: ${webui}/${TOTAL_WEBUI_PORTS}, AnythingLLM: ${anythingllm}/${TOTAL_ANYTHINGLLM_PORTS}, Terminal: ${terminal}/${TOTAL_TERMINAL_PORTS}, Agents: ${agents}/${TOTAL_AGENT_PORTS}, Coord: ${coords}/${TOTAL_COORDINATOR_PORTS}, Ext: ${external}/${TOTAL_EXTERNAL_PORTS}`);
    } else {
      console.log(`[PortPool:Ollama] WebUI: ${webui}/${TOTAL_WEBUI_PORTS}, AnythingLLM: ${anythingllm}/${TOTAL_ANYTHINGLLM_PORTS}, Terminal: ${terminal}/${TOTAL_TERMINAL_PORTS}`);
    }
  }

  function initialize() {
    console.log('[PortPool:Ollama] ═══════════════════════════════════════════════════════');
    console.log('[PortPool:Ollama] Initialized Ollama port ranges:');
    console.log('[PortPool:Ollama]   STANDARD POOLS:');
    console.log(`[PortPool:Ollama]     WEBUI:        ${WEBUI_PORT_START}-${WEBUI_PORT_END} (${TOTAL_WEBUI_PORTS} ports)`);
    console.log(`[PortPool:Ollama]     ANYTHINGLLM:  ${ANYTHINGLLM_PORT_START}-${ANYTHINGLLM_PORT_END} (${TOTAL_ANYTHINGLLM_PORTS} ports)`);
    console.log(`[PortPool:Ollama]     TERMINAL:     ${TERMINAL_PORT_START}-${TERMINAL_PORT_END} (${TOTAL_TERMINAL_PORTS} ports)`);
    console.log('[PortPool:Ollama]   ENTERPRISE POOLS (MoE):');
    console.log(`[PortPool:Ollama]     AGENTS:       ${AGENT_PORT_START}-${AGENT_PORT_END} (${TOTAL_AGENT_PORTS} ports)`);
    console.log(`[PortPool:Ollama]     COORDINATOR:  ${COORDINATOR_PORT_START}-${COORDINATOR_PORT_END} (${TOTAL_COORDINATOR_PORTS} ports)`);
    console.log(`[PortPool:Ollama]     EXTERNAL:     ${EXTERNAL_PORT_START}-${EXTERNAL_PORT_END} (${TOTAL_EXTERNAL_PORTS} ports)`);
    console.log(`[PortPool:Ollama]   TOTAL: ${TOTAL_PORTS} ports`);
    console.log('[PortPool:Ollama] ═══════════════════════════════════════════════════════');
  }

  return {
    getStats,
    getSummary,
    logStats,
    initialize
  };
}

module.exports = createOllamaPortPoolReporting;
