/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * ==========================================================================
 * MOE COORDINATOR
 * ==========================================================================
 */

const moeIrg = require('./moe-irg');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const createAgentTransport = require('./moe-coordinator-agents');
const {
  DEFAULT_CHANNEL_POLICY,
  buildRoutingConfigMap,
  resolveNextAgentIndex,
  getChannelPoliciesForAgentEdges,
  getEdgePolicyForTransition,
  resolveChannelConstrainedNext,
  shouldPassThroughEdge
} = require('./moe-coordinator-routing');
const {
  buildEndpointRegistry,
  resolveExecutionTarget,
  startGateway,
  listAvailableSerialPorts,
  getInputGateway,
  getAnyEnabledIrgGateway,
  normalizeIrgEntryMode,
  normalizeIrgModeOverride,
  isLikelyHardwareIntent,
  buildHardwarePlanContext
} = require('./moe-coordinator-gateways');
const {
  buildAgentRlmAssistContext,
  getRlmAttachmentSessionsForAgent,
  collectRlmAttachmentEvidenceFromStore
} = require('./moe-coordinator-rlm');
const {
  rerunLastIrgInternal,
  runIrgContractInternal
} = require('./moe-coordinator-irg-replay');

let deploymentManager = null;
let deterministicToolsRuntime = null;
let attachmentStore = null;
const gatewayRuntime = new Map();
let lastIrgReplay = null;
const execAsync = promisify(exec);
const CLI_AGENT_WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..');

const REQUEST_TIMEOUT = 120000;

const transport = createAgentTransport({ requestTimeout: REQUEST_TIMEOUT });

function initialize(deployment, options = {}) {
  deploymentManager = deployment;
  deterministicToolsRuntime = options?.deterministicToolsRuntime || null;
  attachmentStore = options?.attachmentStore || null;
  gatewayRuntime.clear();
  lastIrgReplay = null;
  console.log('[MoE Coordinator] Initialized');
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeCliToolName(value) {
  return String(value || '').trim().toLowerCase().replace(/[.\s-]+/g, '_');
}

function normalizeCliAgentNode(item = {}) {
  const hooks = item?.hooks && typeof item.hooks === 'object' ? item.hooks : {};
  return {
    id: String(item.id || '').trim() || `cli-agent-${Date.now()}`,
    type: String(item.type || 'cli_agent').trim(),
    name: String(item.name || 'CLI Agent').trim() || 'CLI Agent',
    ownerAgentId: String(item.ownerAgentId || '').trim(),
    projectPath: String(item.projectPath || '').trim(),
    executionMode: String(item.executionMode || 'on-tool').trim().toLowerCase(),
    policyProfile: String(item.policyProfile || 'workspace-write').trim().toLowerCase(),
    stepBudget: Number.isInteger(Number(item.stepBudget)) ? Math.max(1, Math.min(500, Number(item.stepBudget))) : 50,
    tokenBudget: Number.isInteger(Number(item.tokenBudget)) ? Math.max(256, Math.min(200000, Number(item.tokenBudget))) : 8000,
    timeoutMs: Number.isInteger(Number(item.timeoutMs)) ? Math.max(1000, Math.min(3600000, Number(item.timeoutMs))) : 300000,
    hooks: {
      runCommand: hooks.runCommand === true,
      writeFile: hooks.writeFile === true,
      runTests: hooks.runTests === true,
      gitDiff: hooks.gitDiff === true,
      flashFirmware: hooks.flashFirmware === true
    },
    enabled: item.enabled !== false
  };
}

function collectCliAgentNodes(configItems = []) {
  return (Array.isArray(configItems) ? configItems : [])
    .filter((item) => item && (item.type === 'cli_agent' || item.type === 'deep_agent' || item.type === 'executor'))
    .map(normalizeCliAgentNode)
    .filter((item) => item.enabled !== false);
}

function matchesOwnerToken(nodeOwner, agent = {}) {
  const token = String(nodeOwner || '').trim();
  if (!token) return false;
  const agentId = String(agent?.id || '').trim();
  const agentName = String(agent?.name || '').trim();
  if (!agentId && !agentName) return false;
  if (token === agentId) return true;
  return agentName && token.toLowerCase() === agentName.toLowerCase();
}

function getOwnedCliAgentsForAgent(agent, cliAgents = [], orderedAgents = []) {
  const totalAgents = Array.isArray(orderedAgents) ? orderedAgents.length : 0;
  return (Array.isArray(cliAgents) ? cliAgents : []).filter((node) => {
    const owner = String(node?.ownerAgentId || '').trim();
    if (owner) {
      if (matchesOwnerToken(owner, agent)) return true;
      // Resilient fallback for stale saved owner IDs when only one agent is active.
      return totalAgents === 1;
    }
    return totalAgents === 1;
  });
}

function buildCliToolContextForAgent(agent, cliAgents = [], orderedAgents = []) {
  const owned = getOwnedCliAgentsForAgent(agent, cliAgents, orderedAgents);
  const active = owned.filter((node) => node.executionMode === 'on-tool' || node.executionMode === 'auto');
  if (!active.length) return '';
  const lines = [
    'CLI Agent capability is available on this hop via owner assignment.',
    'When a deterministic tool action is needed, emit one or more lines in this exact format:',
    'CLI_TOOL_JSON: {"tool":"run_command|write_file|read_file|list_files|search_code|read_file_chunk|apply_patch|run_tests|git_diff","args":{...}}',
    'Allowed args:',
    '- run_command: {"cmd":"<shell command>","cwd":"<relative optional>"}',
    '- run_tests: {"cmd":"<test command>","cwd":"<relative optional>"}',
    '- write_file: {"path":"<relative file path>","content":"<full file content>"}',
    '- read_file: {"path":"<relative file path>"}',
    '- list_files: {"path":"<relative optional, default .>","max_depth":2,"limit":200}',
    '- search_code: {"query":"<text or regex>","path":"<relative optional, default .>","limit":100,"regex":false}',
    '- read_file_chunk: {"path":"<relative file path>","start":1,"count":200}',
    '- apply_patch: {"path":"<relative file path>","old_text":"<existing text>","new_text":"<replacement text>"}',
    '- git_diff: {"cwd":"<relative optional>"}',
    'Do not emit CLI_TOOL_JSON unless action is explicitly needed for the user task.'
  ];
  return lines.join('\n');
}

function extractCliToolRequests(text) {
  const raw = String(text || '');
  if (!raw) return [];
  const requests = [];
  const regex = /^CLI_TOOL_JSON\s*:\s*(\{.+\})\s*$/gim;
  let match = regex.exec(raw);
  while (match) {
    const blob = String(match[1] || '').trim();
    if (!blob) {
      match = regex.exec(raw);
      continue;
    }
    try {
      const parsed = parseCliToolJson(blob);
      const tool = normalizeCliToolName(parsed?.tool || parsed?.name || '');
      if (!tool) {
        match = regex.exec(raw);
        continue;
      }
      const args = parsed?.args && typeof parsed.args === 'object' ? parsed.args : {};
      requests.push({ tool, args });
    } catch (_) {
      // ignore malformed request lines
    }
    match = regex.exec(raw);
  }
  return requests;
}

function parseCliToolJson(blob) {
  const source = String(blob || '').trim();
  if (!source) throw new Error('empty tool json');
  try {
    return JSON.parse(source);
  } catch (_) {
    // Tolerate common weak-model truncation: missing trailing braces.
    const open = (source.match(/\{/g) || []).length;
    const close = (source.match(/\}/g) || []).length;
    if (open > close) {
      const repaired = `${source}${'}'.repeat(open - close)}`;
      return JSON.parse(repaired);
    }
    throw _;
  }
}

function extractRequestedReadFilePath(instructionText) {
  const raw = String(instructionText || '');
  if (!raw) return '';
  const match = raw.match(/step\s*2\s*:\s*read_file\s+path\s*=\s*([^\s,;]+)/i);
  if (!match) return '';
  return String(match[1] || '').trim();
}

function guessPrimaryFilePathFromRequests(requests) {
  const list = Array.isArray(requests) ? requests : [];
  for (const req of list) {
    const tool = normalizeCliToolName(req?.tool);
    if (!['write_file', 'apply_patch', 'read_file', 'read_file_chunk'].includes(tool)) continue;
    const p = String(req?.args?.path || '').trim();
    if (p) return p;
  }
  return '';
}

function normalizeRequestedReadPath(requestedPath, requests) {
  const base = String(requestedPath || '').trim();
  if (!base) return '';
  const hasLikelyExt = /\.[a-z0-9]{1,8}$/i.test(base);
  if (hasLikelyExt) return base;
  const list = Array.isArray(requests) ? requests : [];
  const candidates = list
    .map((req) => String(req?.args?.path || '').trim())
    .filter(Boolean);
  const prefixMatch = candidates.find((candidate) => candidate.startsWith(base));
  if (prefixMatch) return prefixMatch;
  return base;
}

function ensureInstructionFollowThrough(requests, instructionText) {
  const list = Array.isArray(requests) ? [...requests] : [];
  const requestedReadPathRaw = extractRequestedReadFilePath(instructionText);
  const requestedReadPath = normalizeRequestedReadPath(requestedReadPathRaw, list) || guessPrimaryFilePathFromRequests(list);
  if (!requestedReadPath) return list;
  const hasRead = list.some((req) => normalizeCliToolName(req?.tool) === 'read_file');
  if (!hasRead) {
    list.push({
      tool: 'read_file',
      args: { path: requestedReadPath }
    });
  }
  return list;
}

function isCommandPotentiallyDestructive(cmd) {
  const value = String(cmd || '').toLowerCase();
  if (!value) return true;
  const blockedPatterns = [
    /(^|\s)rm\s+-rf(\s|$)/,
    /(^|\s)mkfs(\s|$)/,
    /(^|\s)dd\s+if=/,
    /(^|\s)shutdown(\s|$)/,
    /(^|\s)reboot(\s|$)/,
    /(^|\s)poweroff(\s|$)/,
    /(^|\s)halt(\s|$)/,
    /(^|\s)init\s+0(\s|$)/,
    /:\(\)\s*\{/,
    /(^|\s)userdel(\s|$)/,
    /(^|\s)passwd(\s|$)/
  ];
  return blockedPatterns.some((pattern) => pattern.test(value));
}

function resolveNodeWorkspaceRoot(node = {}) {
  const configured = String(node?.projectPath || '').trim();
  if (!configured) return CLI_AGENT_WORKSPACE_ROOT;
  const absolute = path.resolve(configured);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()) {
    throw new Error(`CLI Agent project root not found: ${configured}`);
  }
  return absolute;
}

function resolveWithinWorkspace(inputPath, workspaceRoot, { allowDirectory = true } = {}) {
  const root = path.resolve(String(workspaceRoot || CLI_AGENT_WORKSPACE_ROOT));
  const candidate = String(inputPath || '').trim();
  if (!candidate) return root;
  const absolute = path.isAbsolute(candidate)
    ? path.resolve(candidate)
    : path.resolve(root, candidate);
  const rootWithSep = `${root}${path.sep}`;
  const isRoot = absolute === root;
  const isInside = absolute.startsWith(rootWithSep);
  if (!isRoot && !isInside) {
    throw new Error(`Path escapes workspace: ${candidate}`);
  }
  if (!allowDirectory) {
    const parent = path.dirname(absolute);
    const parentWithSep = `${root}${path.sep}`;
    const parentInside = parent === root || parent.startsWith(parentWithSep);
    if (!parentInside) {
      throw new Error(`File path escapes workspace: ${candidate}`);
    }
  }
  return absolute;
}

function isCliToolAllowedByPolicy(node, toolName) {
  const tool = normalizeCliToolName(toolName);
  if (String(node?.policyProfile || '').toLowerCase() === 'privileged-approval') {
    return { allowed: false, reason: 'policy profile requires privileged approval' };
  }
  if (String(node?.policyProfile || '').toLowerCase() === 'read-only') {
    if (!['git_diff', 'run_tests', 'read_file', 'list_files', 'search_code', 'read_file_chunk'].includes(tool)) {
      return { allowed: false, reason: 'read-only policy blocks mutating tools' };
    }
  }
  const hooks = node?.hooks || {};
  const hookMap = {
    run_command: hooks.runCommand === true,
    write_file: hooks.writeFile === true,
    read_file: hooks.writeFile === true,
    list_files: hooks.writeFile === true,
    search_code: hooks.writeFile === true,
    read_file_chunk: hooks.writeFile === true,
    apply_patch: hooks.writeFile === true,
    run_tests: hooks.runTests === true,
    git_diff: hooks.gitDiff === true,
    flash_firmware: hooks.flashFirmware === true
  };
  if (hookMap[tool] !== true) {
    return { allowed: false, reason: `hook disabled for ${tool}` };
  }
  return { allowed: true, reason: 'ok' };
}

function listFilesRecursive(rootDir, options = {}) {
  const maxDepth = Math.max(0, Math.min(Number(options.maxDepth) || 2, 8));
  const limit = Math.max(1, Math.min(Number(options.limit) || 200, 2000));
  const out = [];
  const stack = [{ dir: rootDir, depth: 0 }];
  while (stack.length > 0 && out.length < limit) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = path.join(current.dir, entry.name);
      if (entry.isDirectory()) {
        if (current.depth < maxDepth) stack.push({ dir: full, depth: current.depth + 1 });
        continue;
      }
      if (!entry.isFile()) continue;
      out.push(full);
      if (out.length >= limit) break;
    }
  }
  return out;
}

async function executeCliToolRequest(node, request) {
  const tool = normalizeCliToolName(request?.tool);
  const args = request?.args && typeof request.args === 'object' ? request.args : {};
  const workspaceRoot = resolveNodeWorkspaceRoot(node);
  const gate = isCliToolAllowedByPolicy(node, tool);
  if (!gate.allowed) {
    return { success: false, tool, error: gate.reason };
  }

  if (tool === 'write_file') {
    const relPath = String(args.path || '').trim();
    if (!relPath) return { success: false, tool, error: 'write_file requires args.path' };
    const nextContent = String(args.content ?? '');
    const fullPath = resolveWithinWorkspace(relPath, workspaceRoot, { allowDirectory: false });
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, nextContent, 'utf8');
    return {
      success: true,
      tool,
      output: `Wrote ${Buffer.byteLength(nextContent, 'utf8')} bytes to ${path.relative(workspaceRoot, fullPath)}`
    };
  }

  if (tool === 'read_file') {
    const relPath = String(args.path || '').trim();
    if (!relPath) return { success: false, tool, error: 'read_file requires args.path' };
    const fullPath = resolveWithinWorkspace(relPath, workspaceRoot, { allowDirectory: false });
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
      return { success: false, tool, error: `file not found: ${relPath}` };
    }
    const content = fs.readFileSync(fullPath, 'utf8');
    return {
      success: true,
      tool,
      output: `Path: ${path.relative(workspaceRoot, fullPath)}\n\n${String(content || '').slice(0, 200000)}`
    };
  }

  if (tool === 'list_files') {
    const relPath = String(args.path || '.').trim() || '.';
    const maxDepth = Math.max(0, Math.min(Number(args.max_depth ?? args.maxDepth ?? 2), 8));
    const limit = Math.max(1, Math.min(Number(args.limit ?? 200), 2000));
    const targetDir = resolveWithinWorkspace(relPath, workspaceRoot, { allowDirectory: true });
    if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
      return { success: false, tool, error: `directory not found: ${relPath}` };
    }
    const files = listFilesRecursive(targetDir, { maxDepth, limit })
      .map((entry) => path.relative(workspaceRoot, entry).split(path.sep).join('/'));
    return {
      success: true,
      tool,
      output: `Path: ${path.relative(workspaceRoot, targetDir) || '.'}\nCount: ${files.length}\n\n${files.join('\n')}`
    };
  }

  if (tool === 'search_code') {
    const query = String(args.query || '').trim();
    if (!query) return { success: false, tool, error: 'search_code requires args.query' };
    const relPath = String(args.path || '.').trim() || '.';
    const limit = Math.max(1, Math.min(Number(args.limit ?? 100), 1000));
    const maxDepth = Math.max(0, Math.min(Number(args.max_depth ?? args.maxDepth ?? 5), 10));
    const regex = args.regex === true;
    const targetDir = resolveWithinWorkspace(relPath, workspaceRoot, { allowDirectory: true });
    if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
      return { success: false, tool, error: `directory not found: ${relPath}` };
    }
    let matcher = null;
    if (regex) {
      try {
        matcher = new RegExp(query, 'i');
      } catch (err) {
        return { success: false, tool, error: `invalid regex: ${String(err?.message || err)}` };
      }
    }
    const files = listFilesRecursive(targetDir, { maxDepth, limit: 5000 });
    const hits = [];
    for (const filePath of files) {
      if (hits.length >= limit) break;
      let content = '';
      try {
        content = fs.readFileSync(filePath, 'utf8');
      } catch {
        continue;
      }
      const lines = String(content || '').split(/\r?\n/);
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        const matched = regex ? matcher.test(line) : line.toLowerCase().includes(query.toLowerCase());
        if (!matched) continue;
        hits.push(`${path.relative(workspaceRoot, filePath).split(path.sep).join('/')}:${i + 1}: ${line}`);
        if (hits.length >= limit) break;
      }
    }
    return {
      success: true,
      tool,
      output: `Query: ${query}\nMatches: ${hits.length}\n\n${hits.join('\n')}`
    };
  }

  if (tool === 'read_file_chunk') {
    const relPath = String(args.path || '').trim();
    if (!relPath) return { success: false, tool, error: 'read_file_chunk requires args.path' };
    const start = Math.max(1, Number(args.start ?? 1));
    const count = Math.max(1, Math.min(Number(args.count ?? 200), 5000));
    const fullPath = resolveWithinWorkspace(relPath, workspaceRoot, { allowDirectory: false });
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
      return { success: false, tool, error: `file not found: ${relPath}` };
    }
    const lines = String(fs.readFileSync(fullPath, 'utf8') || '').split(/\r?\n/);
    const startIdx = Math.min(Math.max(0, start - 1), Math.max(0, lines.length - 1));
    const endIdx = Math.min(lines.length, startIdx + count);
    const chunk = [];
    for (let i = startIdx; i < endIdx; i += 1) {
      chunk.push(`${i + 1}: ${lines[i]}`);
    }
    return {
      success: true,
      tool,
      output: `Path: ${path.relative(workspaceRoot, fullPath)}\nRange: ${startIdx + 1}-${endIdx}\n\n${chunk.join('\n')}`
    };
  }

  if (tool === 'apply_patch') {
    const relPath = String(args.path || '').trim();
    const oldText = String(args.old_text ?? args.oldText ?? '').replace(/\r\n/g, '\n');
    const newText = String(args.new_text ?? args.newText ?? '').replace(/\r\n/g, '\n');
    if (!relPath) return { success: false, tool, error: 'apply_patch requires args.path' };
    if (!oldText) return { success: false, tool, error: 'apply_patch requires args.old_text' };
    const fullPath = resolveWithinWorkspace(relPath, workspaceRoot, { allowDirectory: false });
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
      return { success: false, tool, error: `file not found: ${relPath}` };
    }
    const current = String(fs.readFileSync(fullPath, 'utf8') || '');
    if (!current.includes(oldText)) {
      if (newText && current.includes(newText)) {
        return {
          success: true,
          tool,
          output: `No-op patch for ${path.relative(workspaceRoot, fullPath)} (already contains replacement text)`
        };
      }
      return { success: false, tool, error: 'old_text not found in target file' };
    }
    const next = current.replace(oldText, newText);
    fs.writeFileSync(fullPath, next, 'utf8');
    return {
      success: true,
      tool,
      output: `Patched ${path.relative(workspaceRoot, fullPath)} (${Buffer.byteLength(oldText, 'utf8')} bytes replaced)`
    };
  }

  if (tool === 'git_diff') {
    const cwd = resolveWithinWorkspace(String(args.cwd || ''), workspaceRoot, { allowDirectory: true });
    const cmd = `git -C ${JSON.stringify(cwd)} diff -- .`;
    const { stdout, stderr } = await execAsync(cmd, {
      timeout: Math.min(120000, Number(node?.timeoutMs || 120000)),
      maxBuffer: 1024 * 1024
    });
    return {
      success: true,
      tool,
      output: String(stdout || stderr || '(no diff)').slice(0, 4000)
    };
  }

  if (tool === 'run_command' || tool === 'run_tests') {
    const cmd = String(args.cmd || '').trim();
    if (!cmd) return { success: false, tool, error: `${tool} requires args.cmd` };
    if (isCommandPotentiallyDestructive(cmd)) {
      return { success: false, tool, error: `blocked potentially destructive command: ${cmd}` };
    }
    const cwd = resolveWithinWorkspace(String(args.cwd || ''), workspaceRoot, { allowDirectory: true });
    const { stdout, stderr } = await execAsync(cmd, {
      cwd,
      timeout: Math.min(240000, Number(node?.timeoutMs || 240000)),
      maxBuffer: 1024 * 1024
    });
    const combined = [String(stdout || ''), String(stderr || '')].filter(Boolean).join('\n').trim();
    return {
      success: true,
      tool,
      output: combined ? combined.slice(0, 6000) : '(ok)'
    };
  }

  if (tool === 'flash_firmware') {
    return { success: false, tool, error: 'flash_firmware runtime hook not implemented yet' };
  }

  return { success: false, tool, error: `unknown tool: ${tool}` };
}

async function executeCliAgentNode(node, ownerOutput, ownerInstruction = '') {
  const extracted = extractCliToolRequests(ownerOutput);
  const requests = ensureInstructionFollowThrough(extracted, ownerInstruction);
  if (!requests.length) {
    return { handled: false, summary: '', requests: [] };
  }
  const maxOps = Math.max(1, Math.min(Number(node?.stepBudget || 1), requests.length));
  const limited = requests.slice(0, maxOps);
  const results = [];
  for (const req of limited) {
    try {
      const res = await executeCliToolRequest(node, req);
      results.push(res);
    } catch (err) {
      results.push({
        success: false,
        tool: normalizeCliToolName(req?.tool),
        error: String(err?.message || err || 'tool execution failed')
      });
    }
  }
  const summaryLines = results.map((row, idx) => {
    if (row.success) return `${idx + 1}. ${row.tool}: PASS\n${String(row.output || '').trim()}`;
    return `${idx + 1}. ${row.tool}: FAIL\n${String(row.error || 'unknown error').trim()}`;
  });
  return {
    handled: true,
    requests: limited,
    results,
    summary: `CLI Agent ${node.name} execution results:\n${summaryLines.join('\n\n')}`
  };
}

function sanitizeAgentOutputForHandoff(value) {
  let text = String(value || '');
  if (!text) return '';
  // Prevent recursive prompt-echo loops across hops.
  text = text.replace(
    /\n*Previous agents in the chain have provided the following context:[\s\S]*$/i,
    ''
  );
  // UI marker occasionally echoed by weaker models.
  text = text.replace(/\n*Handoff payload \(input to this agent\)[\s\S]*$/i, '');
  return text.trim();
}

function extractSection(text, heading) {
  const source = String(text || '');
  if (!source) return '';
  const escaped = String(heading).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`${escaped}\\s*:\\s*([\\s\\S]*?)(?=\\n[A-Z_][A-Z0-9_ ]*:\\s*|$)`, 'i');
  const match = source.match(pattern);
  return String(match?.[1] || '').trim();
}

function buildStructuredUpdateFromStep(outputText) {
  const out = String(outputText || '');
  if (!out) return {};
  const update = {};
  const motion = extractSection(out, 'MOTION');
  const forCase = extractSection(out, 'FOR_CASE');
  const risks = extractSection(out, 'RISKS');
  const amendment = extractSection(out, 'AMENDMENT');
  const plan = extractSection(out, 'PLAN');
  const safetyCheck = extractSection(out, 'SAFETY_CHECK');
  const rationale = extractSection(out, 'RATIONALE');
  const requiredGuardrail = extractSection(out, 'REQUIRED_GUARDRAIL');
  if (motion) update.MOTION = motion;
  if (forCase) update.FOR_CASE = forCase;
  if (risks) update.RISKS = risks;
  if (amendment) update.AMENDMENT = amendment;
  if (plan) update.PLAN = plan;
  if (safetyCheck) update.SAFETY_CHECK = safetyCheck;
  if (rationale) update.RATIONALE = rationale;
  if (requiredGuardrail) update.REQUIRED_GUARDRAIL = requiredGuardrail;
  return update;
}

function buildStructuredContextText(record = {}) {
  const fields = [
    `MOTION: ${record.MOTION || 'N/A'}`,
    `FOR_CASE: ${record.FOR_CASE || 'N/A'}`,
    `RISKS: ${record.RISKS || 'N/A'}`,
    `AMENDMENT: ${record.AMENDMENT || 'N/A'}`,
    `PLAN: ${record.PLAN || 'N/A'}`,
    `SAFETY_CHECK: ${record.SAFETY_CHECK || 'N/A'}`,
    `RATIONALE: ${record.RATIONALE || 'N/A'}`,
    `REQUIRED_GUARDRAIL: ${record.REQUIRED_GUARDRAIL || 'N/A'}`
  ];
  return fields.join('\n');
}

function normalizeToolName(value) {
  return String(value || '').trim().toLowerCase();
}

function extractAgentToolCapabilities(agent = {}) {
  const caps = {
    pipelineStateRead: false,
    pipelineStateWrite: false
  };
  const tools = Array.isArray(agent?.tools) ? agent.tools : [];
  for (const entry of tools) {
    if (typeof entry === 'string') {
      const name = normalizeToolName(entry);
      if (name === 'pipeline_state' || name === 'pipeline-state') {
        caps.pipelineStateRead = true;
        caps.pipelineStateWrite = true;
      } else if (name === 'pipeline_state:read' || name === 'pipeline-state:read') {
        caps.pipelineStateRead = true;
      } else if (name === 'pipeline_state:write' || name === 'pipeline-state:write') {
        caps.pipelineStateWrite = true;
      }
      continue;
    }
    if (entry && typeof entry === 'object') {
      const name = normalizeToolName(entry.name || entry.id || entry.tool || '');
      if (name === 'pipeline_state' || name === 'pipeline-state') {
        if (entry.read === false && entry.write === false) continue;
        if (entry.read === true || entry.read == null) caps.pipelineStateRead = true;
        if (entry.write === true || entry.write == null) caps.pipelineStateWrite = true;
      }
    }
  }
  return caps;
}

function parsePipelineStateGetKeys(text) {
  const raw = String(text || '');
  if (!raw) return [];
  const keys = [];
  const regex = /PIPE_STATE_GET\s*:\s*(.+)$/gim;
  let match = regex.exec(raw);
  while (match) {
    const payload = String(match[1] || '').trim();
    if (payload) {
      if (payload.startsWith('{') || payload.startsWith('[')) {
        try {
          const parsed = JSON.parse(payload);
          if (Array.isArray(parsed)) {
            for (const row of parsed) {
              const key = String(row || '').trim();
              if (key) keys.push(key);
            }
          } else if (parsed && typeof parsed === 'object') {
            const list = Array.isArray(parsed.keys) ? parsed.keys : [];
            for (const row of list) {
              const key = String(row || '').trim();
              if (key) keys.push(key);
            }
          }
        } catch {
          for (const part of payload.split(',')) {
            const key = String(part || '').trim();
            if (key) keys.push(key);
          }
        }
      } else {
        for (const part of payload.split(',')) {
          const key = String(part || '').trim();
          if (key) keys.push(key);
        }
      }
    }
    match = regex.exec(raw);
  }
  return Array.from(new Set(keys));
}

function parsePipelineStateSetOps(text) {
  const raw = String(text || '');
  if (!raw) return [];
  const ops = [];
  const regex = /PIPE_STATE_SET\s*:\s*(.+)$/gim;
  let match = regex.exec(raw);
  while (match) {
    const payload = String(match[1] || '').trim();
    if (!payload) {
      match = regex.exec(raw);
      continue;
    }
    if (payload.startsWith('{')) {
      try {
        const parsed = JSON.parse(payload);
        if (parsed && typeof parsed === 'object') {
          const key = String(parsed.key || '').trim();
          const value = parsed.value != null ? String(parsed.value) : '';
          if (key) ops.push({ key, value });
        }
      } catch {
        // ignore malformed json
      }
      match = regex.exec(raw);
      continue;
    }
    const eqIndex = payload.indexOf('=');
    if (eqIndex > 0) {
      const key = payload.slice(0, eqIndex).trim();
      const value = payload.slice(eqIndex + 1).trim();
      if (key) ops.push({ key, value });
    }
    match = regex.exec(raw);
  }
  return ops;
}

function buildPipelineStateReadContext(keys = [], store = null) {
  const list = Array.isArray(keys) ? keys : [];
  if (!store || !(store instanceof Map) || list.length === 0) return '';
  const lines = [];
  for (const key of list) {
    const val = store.has(key) ? String(store.get(key)) : 'N/A';
    lines.push(`${key}=${val}`);
  }
  return lines.join('\n');
}

function rememberLastIrgExecution({ contract, gatewayConfig } = {}) {
  if (!contract || !gatewayConfig) return;
  lastIrgReplay = {
    contract: deepClone(contract),
    gatewayConfig: deepClone(gatewayConfig),
    capturedAt: new Date().toISOString()
  };
}

async function routeMessage(userMessage, options = {}) {
  if (!deploymentManager || !deploymentManager.isActive()) {
    return { success: false, error: 'No active MoE deployment' };
  }

  const agents = deploymentManager.getAgentsInOrder();
  if (agents.length === 0) {
    return { success: false, error: 'No agents in pipeline' };
  }

  const hardwareIntent = isLikelyHardwareIntent(userMessage);
  const inputGateway = getInputGateway(deploymentManager);
  const irgGateway = inputGateway || (hardwareIntent ? getAnyEnabledIrgGateway(deploymentManager) : null);
  if (irgGateway && !gatewayRuntime.has(irgGateway.id)) {
    gatewayRuntime.set(irgGateway.id, startGateway(irgGateway));
  }

  const irgEntryMode = normalizeIrgEntryMode(irgGateway?.irg?.entryMode);
  const irgModeOverride = normalizeIrgModeOverride(options?.irgModeOverride);
  let forceLlmIrgRefinement = false;
  let deterministicDraftResult = null;

  if (irgGateway && irgEntryMode === 'deterministic-first') {
    const irgResult = await moeIrg.tryHandleGatewayRequest({
      message: userMessage,
      gatewayConfig: irgGateway,
      llmPlan: '',
      requireLlmPlan: false,
      modeOverride: irgModeOverride
    });
    if (irgResult.handled) {
      if (irgResult.needsLlmRefinement === true) {
        forceLlmIrgRefinement = true;
        deterministicDraftResult = irgResult;
      } else {
      if (irgResult.success) {
        rememberLastIrgExecution({
          contract: irgResult.contract || null,
          gatewayConfig: irgGateway
        });
      }
      const trace = {
        conversationId: options.conversationId || `conv-${Date.now()}`,
        startedAt: new Date().toISOString(),
        steps: [{
          agentId: 'irg-gateway',
          agentName: irgGateway.name || 'IRG Gateway',
          modelName: 'deterministic-irg',
          input: String(userMessage || '').slice(0, 200),
          output: irgResult.response,
          durationMs: 0,
          success: !!irgResult.success
        }],
        finalResponse: irgResult.response,
        completedAt: new Date().toISOString(),
        totalDurationMs: 0,
        mode: 'irg-deterministic'
      };
      return {
        success: !!irgResult.success,
        response: irgResult.response,
        trace,
        error: irgResult.success ? undefined : (String(irgResult.response || '').trim() || 'IRG error'),
        irg: {
          handled: true,
          contract: irgResult.contract || null,
          execution: irgResult.execution || null
        }
      };
      }
    }
  }

  const deploymentStatus = deploymentManager?.getStatus?.() || null;
  const cliAgentNodes = collectCliAgentNodes(deploymentStatus?.config?.items || []);
  const orderedAgentIds = agents.map((agent) => agent.id);
  const channelPolicyContext = getChannelPoliciesForAgentEdges(
    agents.length,
    deploymentStatus,
    REQUEST_TIMEOUT,
    orderedAgentIds
  );
  const routingConfigByAgentId = buildRoutingConfigMap(deploymentStatus?.config?.items, agents);
  const endpointRegistry = buildEndpointRegistry(deploymentStatus?.config, agents);
  const maxHops = Math.max(8, agents.length * 4);

  const trace = {
    conversationId: options.conversationId || `conv-${Date.now()}`,
    startedAt: new Date().toISOString(),
    steps: [],
    finalResponse: null,
    deterministicTools: {
      enabled: !!deterministicToolsRuntime
    },
    pipelineState: {}
  };
  if (forceLlmIrgRefinement && deterministicDraftResult) {
    trace.steps.push({
      agentId: 'irg-gateway',
      agentName: irgGateway?.name || 'IRG Gateway',
      modelName: 'deterministic-irg',
      input: String(userMessage || '').slice(0, 200),
      output: deterministicDraftResult.response,
      durationMs: 0,
      success: false,
      route: {
        mode: 'llm-refinement-required',
        reason: Array.isArray(deterministicDraftResult?.analysis?.gaps)
          ? deterministicDraftResult.analysis.gaps.join(', ')
          : 'coverage-gaps'
      }
    });
  }

  let currentContext = userMessage;
  const pipelineState = new Map();
  const structuredRecord = {
    MOTION: '',
    FOR_CASE: '',
    RISKS: '',
    AMENDMENT: '',
    PLAN: '',
    SAFETY_CHECK: '',
    RATIONALE: '',
    REQUIRED_GUARDRAIL: ''
  };
  let previousResponses = [];
  let previousStepSuccess = true;
  let currentAgentIndex = 0;
  let previousAgentIndex = -1;
  let previousAgentId = null;
  let pendingEdgePolicy = DEFAULT_CHANNEL_POLICY;
  let hops = 0;

  try {
    while (currentAgentIndex >= 0 && currentAgentIndex < agents.length && hops < maxHops) {
      const agent = agents[currentAgentIndex];
      const isLast = (currentAgentIndex === agents.length - 1);
      const edgePolicy = previousAgentIndex >= 0
        ? (pendingEdgePolicy || getEdgePolicyForTransition(channelPolicyContext, previousAgentId, agent.id, previousAgentIndex))
        : DEFAULT_CHANNEL_POLICY;

      if (previousAgentIndex >= 0 && !shouldPassThroughEdge(edgePolicy, previousStepSuccess)) {
        trace.steps.push({
          agentId: `channel-${edgePolicy.id || previousAgentIndex}`,
          agentName: edgePolicy.label || 'Channel Gate',
          modelName: 'channel-control',
          input: String(currentContext || '').slice(0, 200),
          output: `Skipped downstream routing due to flowCondition=${edgePolicy.flowCondition}`,
          durationMs: 0,
          success: true
        });
        break;
      }

      hops += 1;
      const rlmAssistContext = await buildAgentRlmAssistContext({
        agent,
        currentInput: currentContext,
        routingConfigByAgentId,
        deterministicToolsRuntime,
        attachmentStore
      });
      const cliToolContext = buildCliToolContextForAgent(agent, cliAgentNodes, agents);

      const messages = transport.buildAgentMessages(
        agent,
        currentContext,
        previousResponses,
        isLast,
        {
          includeHardwarePlanContext:
            currentAgentIndex === 0 &&
            !!irgGateway &&
            hardwareIntent,
          hardwarePlanContext: currentAgentIndex === 0 ? buildHardwarePlanContext(irgGateway) : '',
          rlmAssistContext,
          pipelineStateToolCapabilities: extractAgentToolCapabilities(agent),
          pipelineStateReadContext: buildPipelineStateReadContext(
            parsePipelineStateGetKeys(`${agent?.systemPrompt || ''}\n${currentContext || ''}`),
            pipelineState
          ),
          cliToolContext,
          structuredRecordContext:
            String(agent?.name || '').trim().toLowerCase() === 'clerk'
              ? buildStructuredContextText(structuredRecord)
              : ''
        }
      );

      const stepStart = Date.now();
      const resolvedExecution = resolveExecutionTarget(agent, endpointRegistry);
      const response = await transport.callAgentWithPolicy(
        resolvedExecution.agent,
        messages,
        edgePolicy
      );
      const stepDuration = Date.now() - stepStart;
      const normalizedOutput = sanitizeAgentOutputForHandoff(response?.content);
      if (resolvedExecution.worker && endpointRegistry?.enabled) {
        endpointRegistry.reportResult(resolvedExecution.worker.id, {
          success: !!response?.success,
          latencyMs: stepDuration,
          error: response?.error || ''
        });
      }

      const step = {
        agentId: agent.id,
        agentName: agent.name,
        modelName: agent.modelName,
        input: String(currentContext || '').substring(0, 200),
        output: normalizedOutput || response.content,
        durationMs: stepDuration,
        success: response.success,
        attempts: response.attempts || 1,
        execution: resolvedExecution.meta || null,
        rlmAssistApplied: rlmAssistContext.length > 0,
        rlmAssistContextChars: rlmAssistContext.length,
        pipelineStateOps: []
      };
      const toolCaps = extractAgentToolCapabilities(agent);
      if (toolCaps.pipelineStateWrite) {
        const setOps = parsePipelineStateSetOps(normalizedOutput || response.content);
        for (const op of setOps) {
          pipelineState.set(op.key, op.value);
          step.pipelineStateOps.push({ op: 'set', key: op.key, valuePreview: String(op.value).slice(0, 80) });
        }
      }
      trace.steps.push(step);

      if (options.onAgentResponse) {
        options.onAgentResponse(step, currentAgentIndex, agents.length);
      }

      if (!response.success) {
        previousStepSuccess = false;
        if (edgePolicy.onFailure === 'continue') {
      const failConstrained = resolveChannelConstrainedNext({
        channelContext: channelPolicyContext,
        currentAgentId: agent.id,
        proposedNextIndex: (currentAgentIndex + 1 < agents.length) ? currentAgentIndex + 1 : null,
        orderedAgentIds,
        agents,
        currentInput: step.input,
        currentOutput: String(response.error || ''),
        previousStepSuccess: false
      });
          if (!Number.isInteger(failConstrained.nextIndex)) break;
          previousAgentIndex = currentAgentIndex;
          previousAgentId = agent.id;
          pendingEdgePolicy = failConstrained.edgePolicy || DEFAULT_CHANNEL_POLICY;
          currentAgentIndex = failConstrained.nextIndex;
          continue;
        }
        trace.error = `Agent ${agent.name} failed: ${response.error}`;
        return { success: false, trace, error: trace.error };
      }

      previousResponses.push({ agent: agent.name, response: normalizedOutput || response.content });
      Object.assign(structuredRecord, buildStructuredUpdateFromStep(normalizedOutput || response.content));
      currentContext = normalizedOutput || response.content;

      const ownedCliAgents = getOwnedCliAgentsForAgent(agent, cliAgentNodes, agents);
      for (const cliNode of ownedCliAgents) {
        const mode = String(cliNode.executionMode || 'on-tool').toLowerCase();
        if (mode !== 'on-tool' && mode !== 'auto') continue;
        const execStart = Date.now();
        const cliExec = await executeCliAgentNode(cliNode, currentContext, step.input);
        if (!cliExec.handled) continue;
        const success = cliExec.results.every((row) => row.success === true);
        const output = String(cliExec.summary || '').trim();
        const cliStep = {
          agentId: cliNode.id,
          agentName: cliNode.name,
          modelName: 'cli-agent-runtime',
          input: String(currentContext || '').slice(0, 200),
          output,
          durationMs: Date.now() - execStart,
          success,
          route: {
            mode: 'cli-agent',
            reason: `owner=${agent.name}`
          }
        };
        trace.steps.push(cliStep);
        if (options.onAgentResponse) {
          options.onAgentResponse(cliStep, currentAgentIndex, agents.length);
        }
        previousResponses.push({ agent: cliNode.name, response: output });
        currentContext = `${currentContext}\n\n${output}`.trim();
      }
      previousStepSuccess = true;

      const routeDecision = resolveNextAgentIndex({
        currentAgent: agent,
        currentAgentIndex,
        currentInput: step.input,
        currentOutput: normalizedOutput || response.content,
        agents,
        orderedAgentIds,
        routingConfigByAgentId
      });
      step.route = routeDecision;
      const constrained = resolveChannelConstrainedNext({
        channelContext: channelPolicyContext,
        currentAgentId: agent.id,
        proposedNextIndex: routeDecision.nextIndex,
        orderedAgentIds,
        agents,
        currentInput: step.input,
        currentOutput: normalizedOutput || response.content,
        previousStepSuccess: true
      });
      step.channel = {
        reason: constrained.reason,
        fromAgentId: agent.id,
        toAgentId: Number.isInteger(constrained.nextIndex) ? orderedAgentIds[constrained.nextIndex] : null
      };
      if (!Number.isInteger(constrained.nextIndex)) break;
      previousAgentIndex = currentAgentIndex;
      previousAgentId = agent.id;
      pendingEdgePolicy = constrained.edgePolicy || DEFAULT_CHANNEL_POLICY;
      currentAgentIndex = constrained.nextIndex;
    }

    if (hops >= maxHops) {
      trace.steps.push({
        agentId: 'routing-guard',
        agentName: 'Routing Guard',
        modelName: 'coordinator',
        input: String(currentContext || '').slice(0, 200),
        output: `Stopped after ${maxHops} hops to prevent routing loop.`,
        durationMs: 0,
        success: false
      });
      trace.error = `Routing loop guard triggered after ${maxHops} hops`;
      return { success: false, trace, error: trace.error };
    }

    trace.finalResponse = currentContext;
    trace.pipelineState = Object.fromEntries(pipelineState.entries());
    trace.completedAt = new Date().toISOString();
    trace.totalDurationMs = trace.steps.reduce((sum, s) => sum + s.durationMs, 0);

    const shouldRunPostLlmIrg =
      !!irgGateway &&
      hardwareIntent;
    if (shouldRunPostLlmIrg) {
      const llmPlan = String(trace.finalResponse || '').trim();
      const strictLlmPlan = irgGateway?.irg?.requireLlmPlanForLive === true || forceLlmIrgRefinement;
      const irgResult = await moeIrg.tryHandleGatewayRequest({
        message: String(userMessage || '').trim(),
        gatewayConfig: irgGateway,
        llmPlan,
        requireLlmPlan: strictLlmPlan,
        modeOverride: irgModeOverride
      });
      if (irgResult.handled) {
        trace.steps.push({
          agentId: 'irg-gateway',
          agentName: irgGateway.name || 'IRG Gateway',
          modelName: 'deterministic-irg',
          input: String(userMessage || '').trim().slice(0, 200),
          output: irgResult.response,
          durationMs: 0,
          success: !!irgResult.success
        });
        trace.finalResponse = irgResult.response;
        trace.mode = forceLlmIrgRefinement
          ? 'deterministic-first+llm-refined+irg'
          : (irgEntryMode === 'llm-plan-first'
            ? 'llm-plan-first+irg'
            : 'deterministic-first+llm-plan+irg');
        if (!irgResult.success) {
          trace.error = String(irgResult.response || 'IRG error');
          return {
            success: false,
            response: irgResult.response,
            trace,
            error: String(irgResult.response || 'IRG error'),
            irg: {
              handled: true,
              contract: irgResult.contract || null,
              execution: irgResult.execution || null
            }
          };
        }
        rememberLastIrgExecution({
          contract: irgResult.contract || null,
          gatewayConfig: irgGateway
        });
        return {
          success: true,
          response: irgResult.response,
          trace,
          irg: {
            handled: true,
            contract: irgResult.contract || null,
            execution: irgResult.execution || null
          }
        };
      }
      const llmPlanPreview = llmPlan.length > 700 ? `${llmPlan.slice(0, 700)}...` : llmPlan;
      const parseError =
        'Error\n' +
        'Reason: LLM returned a hardware plan that did not map to an allowed deterministic action schema.\n' +
        'Expected prefix/schema: IRG_PLAN_JSON: {"action":"<allowed_action>","params":{...}} (allowed: blink_gpio, blink_color_sequence, blink_color_group, blink_pattern_sequence, blink_multi_phase, push_esp32_code)\n' +
        `LLM output (preview):\n${llmPlanPreview}`;
      trace.steps.push({
        agentId: 'irg-gateway',
        agentName: irgGateway.name || 'IRG Gateway',
        modelName: 'deterministic-irg',
        input: String(userMessage || '').trim().slice(0, 200),
        output: parseError,
        durationMs: 0,
        success: false
      });
      trace.finalResponse = parseError;
      trace.error = parseError;
      return {
        success: false,
        response: parseError,
        trace,
        error: parseError,
        irg: {
          handled: false,
          contract: null,
          execution: null
        }
      };
    }

    return { success: true, response: trace.finalResponse, trace };
  } catch (err) {
    trace.error = err.message;
    return { success: false, trace, error: err.message };
  }
}


async function rerunLastIrg(options = {}) {
  return rerunLastIrgInternal({
    lastIrgReplay,
    moeIrg,
    normalizeIrgModeOverride,
    rememberLastIrgExecution,
    options
  });
}

async function runIrgContract(contractInput, options = {}) {
  return runIrgContractInternal({
    contractInput,
    options,
    getInputGateway: () => getInputGateway(deploymentManager),
    getAnyEnabledIrgGateway: () => getAnyEnabledIrgGateway(deploymentManager),
    moeIrg,
    normalizeIrgModeOverride,
    rememberLastIrgExecution,
    getLastIrgReplay: () => lastIrgReplay
  });
}

async function sendToAgent(agentId, message, options = {}) {
  const agent = deploymentManager?.getAgent(agentId);
  if (!agent) return { success: false, error: `Agent not found: ${agentId}` };
  const deploymentStatus = deploymentManager?.getStatus?.() || null;
  const cliAgentNodes = collectCliAgentNodes(deploymentStatus?.config?.items || []);
  const orderedAgents = Array.isArray(deploymentStatus?.config?.items)
    ? deploymentStatus.config.items
      .filter((item) => item?.enabled !== false && item?.type === 'agent')
      .map((item) => ({ id: String(item.id || '').trim(), name: String(item.name || '').trim() }))
      .filter((item) => item.id)
    : [];
  const cliToolContext = buildCliToolContextForAgent(agent, cliAgentNodes, orderedAgents);

  const rlmAssistContext = await buildAgentRlmAssistContext({
    agent,
    currentInput: message,
    routingConfigByAgentId: new Map([[agent.id, { rlmAssist: agent.rlmAssist === true }]]),
    deterministicToolsRuntime,
    attachmentStore
  });

  const messages = [];
  if (agent.systemPrompt) messages.push({ role: 'system', content: agent.systemPrompt });
  if (rlmAssistContext) {
    messages.push({
      role: 'system',
      content:
        `RLM assist context for this hop:\n${String(rlmAssistContext)}\n\n` +
        `Use it as grounding context. If it conflicts with explicit user intent, follow user intent.`
    });
  }
  if (cliToolContext) {
    messages.push({
      role: 'system',
      content: cliToolContext
    });
  }
  messages.push({ role: 'user', content: message });
  const response = await transport.callAgent(agent, messages);
  if (!response?.success) return response;

  let finalContent = String(response.content || '');
  const ownedCliAgents = getOwnedCliAgentsForAgent(agent, cliAgentNodes, orderedAgents);
  for (const cliNode of ownedCliAgents) {
    const mode = String(cliNode.executionMode || 'on-tool').toLowerCase();
    if (mode !== 'on-tool' && mode !== 'auto') continue;
    const cliExec = await executeCliAgentNode(cliNode, finalContent, message);
    if (!cliExec.handled) continue;
    finalContent = `${finalContent}\n\n${cliExec.summary}`.trim();
  }

  return { ...response, content: finalContent };
}

async function pingAgent(agentId) {
  const agent = deploymentManager?.getAgent(agentId);
  return transport.pingAgent(agent);
}

async function pingAllAgents() {
  const agents = deploymentManager?.getAgentsInOrder() || [];
  const results = {};

  for (const agent of agents) {
    results[agent.id] = await pingAgent(agent.id);
    results[agent.id].name = agent.name;
  }

  return results;
}

module.exports = {
  initialize,
  routeMessage,
  sendToAgent,
  pingAgent,
  pingAllAgents,
  rerunLastIrg,
  runIrgContract,
  listAvailableSerialPorts,
  startGateway,
  REQUEST_TIMEOUT,
  __test: {
    getRlmAttachmentSessionsForAgent,
    collectRlmAttachmentEvidenceFromStore
  }
};
