/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
function createReadinessTools({
  getBackend,
  ensureTerminalOllamaReady,
  ensureRagEmbeddingOllamaReady,
  startupTools,
  ragEngine,
  gitIntegration,
  securityLayer,
  getFlags,
  setFlags
} = {}) {
  async function ensureRagReady() {
    let embeddingPort = null;
    if (getBackend() === 'ollama') {
      const ollamaReady = await ensureTerminalOllamaReady();
      const terminalPort = startupTools.getTerminalOllamaPort();
      if (!ollamaReady.success || !terminalPort) {
        return {
          success: false,
          error: ollamaReady.error || 'Terminal Ollama session not ready for RAG'
        };
      }
      embeddingPort = terminalPort;
    } else {
      const ragOllama = await ensureRagEmbeddingOllamaReady();
      const ragPort = startupTools.getRagOllamaPort();
      if (!ragOllama.success || !ragPort) {
        return {
          success: false,
          error: ragOllama.error || 'RAG embedding Ollama session not ready'
        };
      }
      embeddingPort = ragPort;
    }

    const flags = getFlags();
    if (flags.ragReady && startupTools.getRagOllamaPort() === embeddingPort) {
      return { success: true };
    }

    // If BMOC rotated the terminal port/session, rebind embeddings to the new port.
    if (flags.ragReady && startupTools.getRagOllamaPort() !== embeddingPort) {
      try {
        await ragEngine.shutdown();
      } catch (err) {
        console.warn('[CodingTerminal:IPC] RAG shutdown during rebind failed:', err.message);
      }
      setFlags({ ragReady: false });
    }

    const ok = await ragEngine.initialize({ ollamaPort: embeddingPort });
    if (!ok) {
      return { success: false, error: 'RAG engine not available (check Ollama and embedding model)' };
    }
    setFlags({ ragReady: true });
    return { success: true };
  }

  async function ensureGitReady() {
    const flags = getFlags();
    if (flags.gitReady) return { success: true };
    const ok = await gitIntegration.initialize();
    if (!ok) {
      return { success: false, error: 'Git integration not available (isomorphic-git missing?)' };
    }
    setFlags({ gitReady: true });
    return { success: true };
  }

  async function ensureSecurityReady() {
    const flags = getFlags();
    if (flags.securityReady) return true;
    await securityLayer.initialize();
    setFlags({ securityReady: true });
    return true;
  }

  async function checkPermission(permission) {
    try {
      await ensureSecurityReady();
      return await securityLayer.checkPermission(permission);
    } catch (err) {
      console.error('[CodingTerminal:IPC] Security check error:', err.message);
      return false;
    }
  }

  return {
    ensureRagReady,
    ensureGitReady,
    ensureSecurityReady,
    checkPermission
  };
}

module.exports = createReadinessTools;
