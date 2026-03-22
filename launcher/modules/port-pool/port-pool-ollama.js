/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * ============================================================================
 * PORT POOL MANAGER - OLLAMA SERVICE
 * ============================================================================
 */

const PortPool = require('./port-pool');
const constants = require('./port-pool-ollama-constants');
const createOllamaPortPoolReporting = require('./port-pool-ollama-reporting');
const createOllamaReleaseOps = require('./port-pool-ollama-release');
const createOllamaQueryOps = require('./port-pool-ollama-query');
const createOllamaAllocationOps = require('./port-pool-ollama-allocation');

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
  TOTAL_PORTS,
  AGENT_ROLES
} = constants;

const agentRegistry = new Map();

const queryOps = createOllamaQueryOps({
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
});

const isPortAvailable = queryOps.isPortAvailable;
const getWebUIPortsInUse = queryOps.getWebUIPortsInUse;
const getAnythingLLMPortsInUse = queryOps.getAnythingLLMPortsInUse;
const getTerminalPortsInUse = queryOps.getTerminalPortsInUse;
const getServerPortsInUse = queryOps.getServerPortsInUse;
const getAgentPortsInUse = queryOps.getAgentPortsInUse;
const getCoordinatorPortsInUse = queryOps.getCoordinatorPortsInUse;
const getExternalPortsInUse = queryOps.getExternalPortsInUse;
const getPortsInUse = queryOps.getPortsInUse;
const getAgentInfo = queryOps.getAgentInfo;
const getPortsByRole = queryOps.getPortsByRole;

const reporting = createOllamaPortPoolReporting({
  PortPool,
  constants,
  getWebUIPortsInUse,
  getAnythingLLMPortsInUse,
  getTerminalPortsInUse,
  getAgentPortsInUse,
  getCoordinatorPortsInUse,
  getExternalPortsInUse
});

const getStats = reporting.getStats;
const getSummary = reporting.getSummary;
const logStats = reporting.logStats;
const initialize = reporting.initialize;

const allocationOps = createOllamaAllocationOps({
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
});

const getWebUIPort = allocationOps.getWebUIPort;
const getAnythingLLMPort = allocationOps.getAnythingLLMPort;
const getTerminalPort = allocationOps.getTerminalPort;
const getServerPort = allocationOps.getServerPort;
const getAgentPort = allocationOps.getAgentPort;
const getAgentPortsBulk = allocationOps.getAgentPortsBulk;
const getCoordinatorPort = allocationOps.getCoordinatorPort;
const getExternalPort = allocationOps.getExternalPort;

const releaseOps = createOllamaReleaseOps({
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
  logStats: (...args) => logStats(...args)
});

const releasePort = releaseOps.releasePort;
const releasePortsBulk = releaseOps.releasePortsBulk;
const releaseByRole = releaseOps.releaseByRole;
const releaseAllWebUI = releaseOps.releaseAllWebUI;
const releaseAllAnythingLLM = releaseOps.releaseAllAnythingLLM;
const releaseAllTerminal = releaseOps.releaseAllTerminal;
const releaseAllAgents = releaseOps.releaseAllAgents;
const releaseAllCoordinators = releaseOps.releaseAllCoordinators;
const releaseAllExternal = releaseOps.releaseAllExternal;
const releaseAllPorts = releaseOps.releaseAllPorts;

initialize();

module.exports = {
  getWebUIPort,
  getAnythingLLMPort,
  getTerminalPort,
  getServerPort,
  getAgentPort,
  getAgentPortsBulk,
  getCoordinatorPort,
  getExternalPort,
  releasePort,
  releasePortsBulk,
  releaseByRole,
  releaseAllWebUI,
  releaseAllAnythingLLM,
  releaseAllTerminal,
  releaseAllAgents,
  releaseAllCoordinators,
  releaseAllExternal,
  releaseAllPorts,
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
  getPortsByRole,
  getStats,
  getSummary,
  AGENT_ROLES,
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
};
