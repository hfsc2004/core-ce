/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * PSF Coding Terminal - Renderer Git Actions Module
 */

(function() {
  'use strict';

  function createGitActionsModule(ctx) {
    const { state, elements, api } = ctx;

    function showGitHelpModal() {
      if (!elements.gitHelpModal) return;
      elements.gitHelpModal.classList.remove('hidden');
    }

    function hideGitHelpModal() {
      if (!elements.gitHelpModal) return;
      elements.gitHelpModal.classList.add('hidden');
    }

    async function showPromptGuideModal() {
      if (!elements.promptGuideModal || !elements.promptGuideBody) return;
      elements.promptGuideModal.classList.remove('hidden');
      elements.promptGuideBody.innerHTML = 'Loading...';

      if (!window.electronAPI?.getDocContent) {
        elements.promptGuideBody.innerHTML = '<p>Doc API unavailable.</p>';
        return;
      }

      try {
        const result = await window.electronAPI.getDocContent('docs/reference/CodingTerminalPromptGuide.md');
        if (!result?.success) {
          elements.promptGuideBody.innerHTML = `<p>Unable to load guide: ${api.escapeHtml(result?.message || 'Unknown error')}</p>`;
          return;
        }
        const content = String(result.content || '');
        if (window.marked && typeof window.marked.parse === 'function') {
          elements.promptGuideBody.innerHTML = window.marked.parse(content);
        } else {
          elements.promptGuideBody.textContent = content;
        }
        api.highlightCodeBlocks(elements.promptGuideBody);
      } catch (err) {
        elements.promptGuideBody.innerHTML = `<p>Unable to load guide: ${api.escapeHtml(err.message || String(err))}</p>`;
      }
    }

    function hidePromptGuideModal() {
      if (!elements.promptGuideModal || !elements.promptGuideBody) return;
      elements.promptGuideModal.classList.add('hidden');
      elements.promptGuideBody.innerHTML = '';
    }

    async function executeGitAction(action) {
      if (!window.electronAPI?.gitRun) {
        api.addSystemMessage('Git command API unavailable.');
        return;
      }

      try {
        const payload = await promptGitPayload(action);
        if (payload === null) return;
        const result = await window.electronAPI.gitRun(action, payload);
        renderGitCommandOutput(action, payload, result);

        if (!result?.success) {
          api.addSystemMessage(`Git ${action} failed: ${result?.error || 'Unknown error'}`);
        } else {
          api.addSystemMessage(`Git ${action} completed.`);
        }

        if (action === 'init' || action === 'add' || action === 'commit' || action === 'amend' ||
            action === 'checkout' || action === 'pull' || action === 'push' || action === 'reset' ||
            action === 'rebase') {
          await api.refreshGitStatus();
        }
      } catch (err) {
        console.error('[CodingTerminal] Git action error:', err);
        api.addSystemMessage(`Git ${action} error: ${err.message}`);
      }
    }

    async function promptGitPayload(action) {
      const a = String(action || '').toLowerCase();
      switch (a) {
        case 'init':
        case 'status':
        case 'reflog':
          return {};
        case 'add': {
          const raw = await api.promptText('Paths to add (comma-separated). Leave blank for -A:', '');
          if (raw === null) return null;
          const paths = raw.trim()
            ? raw.split(',').map((s) => s.trim()).filter(Boolean)
            : [];
          return { paths };
        }
        case 'blame': {
          const file = await api.promptText('File path for blame (relative to project):', '');
          if (!file) return null;
          const lineRaw = await api.promptText('Optional line number (blank for full blame):', '');
          const line = lineRaw && lineRaw.trim() ? Number(lineRaw) : null;
          return Number.isFinite(line) && line > 0 ? { file: file.trim(), line } : { file: file.trim() };
        }
        case 'bisect': {
          const subcommand = await api.promptText('Bisect subcommand (start|good|bad|reset|log|visualize):', 'start');
          if (!subcommand) return null;
          const extra = await api.promptText('Optional args (comma-separated):', '');
          const confirmToken = await api.promptText('Type I_UNDERSTAND to run bisect:', '');
          if (confirmToken !== 'I_UNDERSTAND') return null;
          return {
            subcommand: subcommand.trim(),
            args: extra ? extra.split(',').map((s) => s.trim()).filter(Boolean) : [],
            confirmToken
          };
        }
        case 'checkout': {
          const ref = await api.promptText('Checkout ref (branch or commit SHA):', '');
          if (!ref) return null;
          const create = await api.confirmAction('Create new branch (-b)?');
          return { ref: ref.trim(), create };
        }
        case 'commit': {
          const message = await api.promptText('Commit message:', '');
          if (!message) return null;
          return { message: message.trim() };
        }
        case 'amend': {
          const message = await api.promptText('Amend message (blank = --no-edit):', '');
          return message && message.trim() ? { message: message.trim() } : {};
        }
        case 'diff': {
          const staged = await api.confirmAction('Diff staged changes? (Cancel = unstaged)');
          const file = await api.promptText('Optional file path for diff (blank = all):', '');
          return { staged, file: (file || '').trim() };
        }
        case 'pull': {
          const remote = await api.promptText('Remote (blank = default):', '');
          if (remote === null) return null;
          const branch = await api.promptText('Branch (blank = default):', '');
          if (branch === null) return null;
          const rebase = await api.confirmAction('Use --rebase?');
          return { remote: remote.trim(), branch: branch.trim(), rebase };
        }
        case 'push': {
          const remote = await api.promptText('Remote (blank = default):', '');
          if (remote === null) return null;
          const branch = await api.promptText('Branch (blank = default):', '');
          if (branch === null) return null;
          const setUpstream = await api.confirmAction('Set upstream (-u)?');
          return { remote: remote.trim(), branch: branch.trim(), setUpstream };
        }
        case 'remote-add': {
          const name = await api.promptText('Remote name (for example origin):', 'origin');
          if (!name) return null;
          const url = await api.promptText('Remote URL:', '');
          if (!url) return null;
          return { name: name.trim(), url: url.trim() };
        }
        case 'log': {
          const limitRaw = await api.promptText('Log entry count (1-200):', '20');
          const limit = Number(limitRaw);
          return { limit: Number.isFinite(limit) ? limit : 20 };
        }
        case 'show': {
          const ref = await api.promptText('Ref to show (blank = HEAD):', 'HEAD');
          if (ref === null) return null;
          return { ref: (ref || 'HEAD').trim() || 'HEAD' };
        }
        case 'rebase': {
          const mode = await api.promptText('Rebase mode: onto | continue | abort', 'onto');
          if (!mode) return null;
          const m = mode.trim().toLowerCase();
          const confirmToken = await api.promptText('Type I_UNDERSTAND to run rebase:', '');
          if (confirmToken !== 'I_UNDERSTAND') return null;
          if (m === 'continue') return { continue: true, confirmToken };
          if (m === 'abort') return { abort: true, confirmToken };
          const onto = await api.promptText('Rebase onto ref (branch or commit):', '');
          if (!onto) return null;
          return { onto: onto.trim(), confirmToken };
        }
        case 'reset': {
          const mode = await api.promptText('Reset mode: soft | mixed | hard', 'mixed');
          if (!mode) return null;
          const target = await api.promptText('Reset target (blank = HEAD):', 'HEAD');
          if (target === null) return null;
          const confirmToken = await api.promptText('Type I_UNDERSTAND to run reset:', '');
          if (confirmToken !== 'I_UNDERSTAND') return null;
          return { mode: mode.trim().toLowerCase(), target: (target || 'HEAD').trim() || 'HEAD', confirmToken };
        }
        default:
          return {};
      }
    }

    function renderGitCommandOutput(action, payload, result) {
      if (!elements.gitOutput) return;
      const stamp = new Date().toLocaleString();
      const payloadText = JSON.stringify(payload || {});
      const stdout = result?.stdout || '';
      const stderr = result?.stderr || '';
      const body = [
        `[${stamp}] git ${action} ${payloadText}`,
        result?.success ? 'status: ok' : `status: error (${result?.code ?? 'n/a'})`,
        result?.command ? `command: ${result.command}` : '',
        result?.cwd ? `cwd: ${result.cwd}` : '',
        stdout ? `stdout:\n${stdout}` : '',
        stderr ? `stderr:\n${stderr}` : '',
        result?.error && !stderr ? `error:\n${result.error}` : ''
      ].filter(Boolean).join('\n\n');

      elements.gitOutput.classList.remove('hidden');
      elements.gitOutput.textContent = body;
      elements.gitOutput.scrollTop = 0;
    }

    return {
      showGitHelpModal,
      hideGitHelpModal,
      showPromptGuideModal,
      hidePromptGuideModal,
      executeGitAction
    };
  }

  window.CodingTerminalRendererGitActions = {
    createGitActionsModule
  };
})();
