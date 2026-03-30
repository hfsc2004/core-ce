/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * PSF Coding Terminal - Session Management
 * Handles save/load/delete/new session workflows and persistence.
 */

(function() {
  'use strict';

  const CODING_SESSION_INDEX_KEY = 'coding-terminal-sessions-index-v1';
  const CODING_SESSION_LAST_KEY = 'coding-terminal-last-session-v1';
  const CODING_SESSION_AUTOSAVE_NAME = '__last__';
  const CODING_SESSION_PREFIX = 'coding-terminal-session-';
  const LEGACY_SESSION_PREFIXES = [
    'coding_terminal_session_',
    'coding-terminal-session-v0-',
    'coding-session-'
  ];
  const LEGACY_LAST_KEYS = [
    'coding-terminal-last-session',
    'coding_terminal_last_session'
  ];

  function createSessionsModule({ state, api }) {
    function normalizeSessionName(input) {
      const value = String(input || '')
        .trim()
        .replace(/[^a-zA-Z0-9._ -]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return value.slice(0, 80);
    }

    function saveSessionIndex(names) {
      const unique = Array.from(new Set(
        (Array.isArray(names) ? names : [])
          .map((v) => String(v || '').trim())
          .filter(Boolean)
      ));
      localStorage.setItem(CODING_SESSION_INDEX_KEY, JSON.stringify(unique));
    }

    function getSessionStorageKey(name) {
      return `${CODING_SESSION_PREFIX}${String(name || '').trim()}`;
    }

    function loadSessionIndex() {
      const recovered = [];
      try {
        const len = Number(localStorage.length || 0);
        for (let i = 0; i < len; i += 1) {
          const key = String(localStorage.key(i) || '');
          if (key.startsWith(CODING_SESSION_PREFIX)) {
            const name = key.slice(CODING_SESSION_PREFIX.length).trim();
            if (name) recovered.push(name);
            continue;
          }
          for (const prefix of LEGACY_SESSION_PREFIXES) {
            if (!key.startsWith(prefix)) continue;
            const name = key.slice(prefix.length).trim();
            if (name) recovered.push(name);
            break;
          }
        }
      } catch (_) {}

      try {
        const raw = localStorage.getItem(CODING_SESSION_INDEX_KEY);
        if (!raw) {
          const merged = Array.from(new Set(recovered));
          if (merged.length > 0) saveSessionIndex(merged);
          return merged;
        }
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          const merged = Array.from(new Set(recovered));
          if (merged.length > 0) saveSessionIndex(merged);
          return merged;
        }
        const indexed = parsed
          .filter((v) => typeof v === 'string' && v.trim())
          .map((v) => v.trim());
        const merged = Array.from(new Set([...indexed, ...recovered]));
        if (merged.length !== indexed.length) saveSessionIndex(merged);
        return merged;
      } catch (_) {
        const merged = Array.from(new Set(recovered));
        if (merged.length > 0) saveSessionIndex(merged);
        return merged;
      }
    }

    function listNamedSessions() {
      return loadSessionIndex().filter((name) => name !== CODING_SESSION_AUTOSAVE_NAME);
    }

    function saveSessionRecord(name, options = {}) {
      const sessionName = normalizeSessionName(name);
      if (!sessionName) return false;
      const snapshot = api.getConversationSnapshot();
      const now = Date.now();
      const payload = {
        version: 1,
        name: sessionName,
        savedAt: now,
        projectPath: state.projectPath || '',
        modelName: state.modelName || '',
        routerModelName: state.routerModelName || '',
        chatHistory: Array.isArray(snapshot) ? snapshot : []
      };
      try {
        localStorage.setItem(getSessionStorageKey(sessionName), JSON.stringify(payload));
        const names = loadSessionIndex();
        if (!names.includes(sessionName)) {
          names.unshift(sessionName);
          saveSessionIndex(names);
        }
        if (options.markLast !== false) {
          localStorage.setItem(CODING_SESSION_LAST_KEY, sessionName);
        }
        return true;
      } catch (_) {
        return false;
      }
    }

    function loadSessionRecord(name) {
      const sessionName = normalizeSessionName(name);
      if (!sessionName) return null;
      try {
        const candidateKeys = [
          getSessionStorageKey(sessionName),
          ...LEGACY_SESSION_PREFIXES.map((prefix) => `${prefix}${sessionName}`)
        ];
        let parsed = null;
        for (const key of candidateKeys) {
          const raw = localStorage.getItem(key);
          if (!raw) continue;
          try {
            parsed = JSON.parse(raw);
          } catch (_) {
            parsed = null;
          }
          if (parsed && typeof parsed === 'object') break;
        }
        if (!parsed || typeof parsed !== 'object') return null;
        const chatHistory = Array.isArray(parsed.chatHistory)
          ? parsed.chatHistory
          : (Array.isArray(parsed.messages)
            ? parsed.messages
            : (Array.isArray(parsed.history) ? parsed.history : null));
        if (!Array.isArray(chatHistory)) return null;
        parsed.chatHistory = chatHistory;
        return parsed;
      } catch (_) {
        return null;
      }
    }

    function applySessionRecord(record) {
      if (!record || !Array.isArray(record.chatHistory)) return false;
      api.loadConversationEntries(record.chatHistory);
      if (record.projectPath && !state.projectPath) {
        state.projectPath = String(record.projectPath);
        api.updateProjectRootButton();
      }
      return true;
    }

    function restoreLastSessionOnStartup() {
      let lastName = '';
      try {
        lastName = String(localStorage.getItem(CODING_SESSION_LAST_KEY) || '').trim();
      } catch (_) {
        lastName = '';
      }
      if (!lastName) {
        for (const legacyKey of LEGACY_LAST_KEYS) {
          try {
            const legacy = String(localStorage.getItem(legacyKey) || '').trim();
            if (legacy) {
              lastName = legacy;
              break;
            }
          } catch (_) {}
        }
      }
      if (!lastName) return false;

      const record = loadSessionRecord(lastName);
      if (record && applySessionRecord(record)) return true;

      const autosaveRecord = loadSessionRecord(CODING_SESSION_AUTOSAVE_NAME);
      if (autosaveRecord && applySessionRecord(autosaveRecord)) return true;

      const names = loadSessionIndex();
      let newest = null;
      names.forEach((name) => {
        const candidate = loadSessionRecord(name);
        if (!candidate) return;
        const ts = Number(candidate.savedAt || 0);
        if (!newest || ts > Number(newest.savedAt || 0)) newest = candidate;
      });
      if (newest && applySessionRecord(newest)) return true;
      return false;
    }

    function removeSessionRecord(name) {
      const sessionName = normalizeSessionName(name);
      if (!sessionName) return false;
      try {
        localStorage.removeItem(getSessionStorageKey(sessionName));
        const names = loadSessionIndex().filter((n) => n !== sessionName);
        saveSessionIndex(names);
        const last = String(localStorage.getItem(CODING_SESSION_LAST_KEY) || '').trim();
        if (last === sessionName) {
          localStorage.setItem(CODING_SESSION_LAST_KEY, CODING_SESSION_AUTOSAVE_NAME);
        }
        return true;
      } catch (_) {
        return false;
      }
    }

    function promptMultiSelectSessions(names) {
      return new Promise((resolve) => {
        if (!Array.isArray(names) || names.length === 0) {
          resolve([]);
          return;
        }

        const overlay = document.createElement('div');
        overlay.className = 'ct-modal';
        const rows = names.map((name, idx) => {
          const id = `ct-session-delete-${idx}`;
          return `
            <label for="${id}" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--ct-border);">
              <input id="${id}" type="checkbox" data-session-name="${api.escapeHtml(name)}" />
              <span style="color:var(--ct-text-primary);font-size:13px;">${api.escapeHtml(name)}</span>
            </label>
          `;
        }).join('');

        overlay.innerHTML = `
          <div class="ct-modal-card">
            <div class="ct-modal-header"><h3>Delete Saved Sessions</h3></div>
            <div class="ct-modal-body">
              <p>Select one or more sessions to delete.</p>
              <div style="max-height:260px;overflow:auto;margin-top:8px;padding-right:4px;">
                ${rows}
              </div>
              <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;">
                <button id="ct-session-delete-cancel" class="ct-btn ct-btn-small">Cancel</button>
                <button id="ct-session-delete-confirm" class="ct-btn ct-btn-small">Delete Selected</button>
              </div>
            </div>
          </div>
        `;

        const cleanup = () => overlay.remove();
        overlay.querySelector('#ct-session-delete-cancel')?.addEventListener('click', () => {
          cleanup();
          resolve([]);
        });
        overlay.querySelector('#ct-session-delete-confirm')?.addEventListener('click', () => {
          const selected = Array.from(overlay.querySelectorAll('input[type="checkbox"]:checked'))
            .map((el) => String(el.getAttribute('data-session-name') || '').trim())
            .filter(Boolean);
          cleanup();
          resolve(selected);
        });
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) {
            cleanup();
            resolve([]);
          }
        });
        document.body.appendChild(overlay);
      });
    }

    async function handleSessionSave() {
      const defaultName = `session-${new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '')}`;
      const input = await api.promptText('Save session as:', defaultName);
      if (input === null) return;
      const name = normalizeSessionName(input);
      if (!name) {
        api.addSystemMessage('Session save cancelled: name is empty.');
        return;
      }
      const ok = saveSessionRecord(name, { markLast: true });
      api.addSystemMessage(ok ? `Session saved: ${name}` : 'Session save failed.');
    }

    async function handleSessionNew() {
      const ok = await api.confirmAction('Start a new session? This clears the current chat view.');
      if (!ok) {
        api.addSystemMessage('New session cancelled.');
        return;
      }
      api.clearConversation();
      localStorage.setItem(CODING_SESSION_LAST_KEY, CODING_SESSION_AUTOSAVE_NAME);
      api.addSystemMessage('Started new session.');
    }

    async function handleSessionLoad() {
      const names = listNamedSessions();
      const hint = names.length ? `Available: ${names.join(', ')}` : 'No named sessions found.';
      const input = await api.promptText(`Load session name.\n${hint}`, names[0] || '');
      if (input === null) return;
      const name = normalizeSessionName(input);
      if (!name) {
        api.addSystemMessage('Session load cancelled: name is empty.');
        return;
      }
      const record = loadSessionRecord(name);
      if (!record) {
        api.addSystemMessage(`Session not found: ${name}`);
        return;
      }
      const ok = applySessionRecord(record);
      if (ok) {
        localStorage.setItem(CODING_SESSION_LAST_KEY, name);
        api.addSystemMessage(`Session loaded: ${name}`);
      } else {
        api.addSystemMessage(`Session failed to load: ${name}`);
      }
    }

    async function handleSessionDelete() {
      const names = listNamedSessions();
      if (!names.length) {
        api.addSystemMessage('No saved sessions to delete.');
        return;
      }
      const selected = await promptMultiSelectSessions(names);
      if (!selected.length) {
        api.addSystemMessage('Session delete cancelled.');
        return;
      }
      let removed = 0;
      selected.forEach((name) => {
        if (removeSessionRecord(name)) removed += 1;
      });
      api.addSystemMessage(`Deleted ${removed} session${removed === 1 ? '' : 's'}.`);
    }

    function handleConversationChanged() {
      saveSessionRecord(CODING_SESSION_AUTOSAVE_NAME, { markLast: true });
    }

    return {
      restoreLastSessionOnStartup,
      handleSessionSave,
      handleSessionNew,
      handleSessionLoad,
      handleSessionDelete,
      handleConversationChanged
    };
  }

  window.CodingTerminalRendererSessions = {
    createSessionsModule
  };
})();

