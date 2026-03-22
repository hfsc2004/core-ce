/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
const fs = require('fs');
const path = require('path');

function createMoEHandlers() {
  return {
    'moe-deploy-pipeline': async (ctx, event, pipelineConfig) =>
      ctx.sessionManager.deployMoEPipeline(pipelineConfig, ctx.appDir, ctx.gpuInfo),
    'moe-get-status': (ctx) => ctx.sessionManager.getMoEStatus(),
    'moe-teardown-pipeline': async (ctx) => ctx.sessionManager.teardownMoEPipeline(),
    'moe-save-pipeline': async (ctx, event, pipelineConfig) =>
      ctx.sessionManager.saveMoEPipelineConfig(pipelineConfig, ctx.appDir),
    'moe-save-pipeline-profile': async (ctx, event, pipelineConfig, profileName) =>
      ctx.sessionManager.saveMoEPipelineConfig(pipelineConfig, ctx.appDir, { profileName }),
    'moe-load-pipeline': (ctx) => ctx.sessionManager.loadMoEPipelineConfig(ctx.appDir),
    'moe-load-pipeline-profile': (ctx, event, profileName) =>
      ctx.sessionManager.loadMoEPipelineConfig(ctx.appDir, { profileName }),
    'moe-list-pipeline-profiles': (ctx) => ctx.sessionManager.listMoEPipelineConfigs(ctx.appDir),
    'moe-delete-pipeline-profile': (ctx, event, profileName) =>
      ctx.sessionManager.deleteMoEPipelineConfig(ctx.appDir, { profileName }),
    'moe-route-message': async (ctx, event, message, options) =>
      ctx.sessionManager.routeMoEMessage(message, options),
    'moe-rerun-last-irg': async (ctx, event, options) =>
      ctx.sessionManager.rerunLastMoEIrg(options),
    'moe-run-irg-contract': async (ctx, event, contract, options) =>
      ctx.sessionManager.runMoEIrgContract(contract, options),
    'moe-send-to-agent': async (ctx, event, agentId, message, options) =>
      ctx.sessionManager.sendToMoEAgent(agentId, message, options),
    'moe-ping-agents': async (ctx) => ctx.sessionManager.pingMoEAgents(),
    'moe-list-serial-ports': (ctx) => ctx.sessionManager.listMoESerialPorts(),
    'moe-pick-code-file': async (ctx) => {
      if (!ctx.dialog || typeof ctx.dialog.showOpenDialog !== 'function') {
        return { ok: false, error: 'file picker unavailable' };
      }
      const result = await ctx.dialog.showOpenDialog({
        title: 'Attach Code File',
        properties: ['openFile', 'dontAddToRecent'],
        filters: [
          { name: 'Code Files', extensions: ['ino', 'cpp', 'c', 'h', 'hpp', 'txt'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });
      if (result?.canceled || !Array.isArray(result?.filePaths) || result.filePaths.length === 0) {
        return { ok: true, canceled: true, filePath: '' };
      }
      const filePath = String(result.filePaths[0] || '');
      return {
        ok: true,
        canceled: false,
        filePath,
        fileName: path.basename(filePath)
      };
    },
    'moe-read-text-file': async (ctx, event, filePath, options = {}) => {
      try {
        const resolved = path.resolve(String(filePath || '').trim());
        if (!resolved) return { ok: false, error: 'filePath is required' };
        if (!fs.existsSync(resolved)) return { ok: false, error: `File not found: ${resolved}` };
        const stats = fs.statSync(resolved);
        if (!stats.isFile()) return { ok: false, error: 'Selected path is not a file' };

        const maxBytesRaw = Number(options?.maxBytes);
        const maxBytes = Number.isFinite(maxBytesRaw) ? Math.max(1024, Math.min(2_000_000, Math.floor(maxBytesRaw))) : 500_000;
        const fullBuffer = await fs.promises.readFile(resolved);
        const truncated = fullBuffer.length > maxBytes;
        const buffer = truncated ? fullBuffer.subarray(0, maxBytes) : fullBuffer;

        // Guard against binary file attachment.
        if (buffer.includes(0)) {
          return { ok: false, error: 'Binary file detected. Please attach a text/source file.' };
        }

        const content = buffer.toString('utf8');
        return {
          ok: true,
          filePath: resolved,
          fileName: path.basename(resolved),
          content,
          size: fullBuffer.length,
          truncated
        };
      } catch (err) {
        return { ok: false, error: err.message || String(err) };
      }
    }
  };
}

module.exports = { createMoEHandlers };
