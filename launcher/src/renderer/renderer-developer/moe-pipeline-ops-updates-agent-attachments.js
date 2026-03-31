/**
 * MoE Pipeline Ops Updates - Agent Attachments and Routing UI
 * Extracted from moe-pipeline-ops-updates.js
 */
function assignModelToAgent(agentId, modelId) {
  const agent = window.modelOrderingState.moeItems.find(i => i.id === agentId && i.type === 'agent');
  if (!agent) return;
  
  if (modelId) {
    const { catalog } = window.modelOrderingState;
    for (const [collKey, collection] of Object.entries(catalog?.collections || {})) {
      const model = (collection.models || []).find(m => m.id === modelId);
      if (model) {
        agent.modelId = modelId;
        agent.modelName = model.name;
        agent.collectionKey = collKey;
        agent.filename = model.filename;
        agent.projectorFilename = model.projector_filename || null;
        console.log('[MoE] Assigned model to agent:', agentId, modelId, collKey, model.filename);
        break;
      }
    }
  } else {
    agent.modelId = null;
    agent.modelName = null;
    agent.collectionKey = null;
    agent.filename = null;
    agent.projectorFilename = null;
    console.log('[MoE] Cleared model from agent:', agentId);
  }
  renderModelOrdering();
}

function updateAgentProvider(agentId, provider) {
  const agent = window.modelOrderingState.moeItems.find(i => i.id === agentId && i.type === 'agent');
  if (!agent) return;
  const normalized = String(provider || '').trim().toLowerCase() === 'llama.cpp' ? 'llama.cpp' : 'ollama';
  agent.provider = normalized;
  console.log('[MoE] Updated agent provider:', agentId, normalized);
  renderModelOrdering();
}

function toggleAgentRoutingMode(agentId) {
  const agent = window.modelOrderingState.moeItems.find(i => i.id === agentId && i.type === 'agent');
  if (agent) {
    agent.routingMode = agent.routingMode === 'dynamic' ? 'static' : 'dynamic';
    console.log('[MoE] Toggled routing mode:', agentId, agent.routingMode);
    renderModelOrdering();
  }
}

function toggleAgentRlmAssist(agentId, enabled) {
  const agent = window.modelOrderingState.moeItems.find(i => i.id === agentId && i.type === 'agent');
  if (!agent) return;
  agent.rlmAssist = enabled === true;
  console.log('[MoE] Toggled agent RLM assist:', agentId, agent.rlmAssist);
  renderModelOrdering();
}

function updateAgentMultiGpuSplit(agentId, enabled) {
  const agent = window.modelOrderingState.moeItems.find(i => i.id === agentId && i.type === 'agent');
  if (!agent) return;
  agent.multiGpuSplit = enabled === true;
  console.log('[MoE] Updated agent multiGpuSplit:', agentId, agent.multiGpuSplit);
  renderModelOrdering();
}

async function openMoeAttachmentManager(scope, agentId) {
  const safeScope = String(scope || 'agent').trim().toLowerCase() === 'shared' ? 'shared' : 'agent';
  const agent = window.modelOrderingState.moeItems.find((i) => i.id === agentId && i.type === 'agent');
  const initialTarget = await ensureMoeBucketDefaults(agent, safeScope);
  const title = safeScope === 'shared'
    ? 'MoE Shared RLM Files'
    : `MoE Agent RLM Files${agent?.name ? ` • ${agent.name}` : ''}`;

  const existing = document.getElementById('moe-attachments-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'moe-attachments-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.72);display:flex;align-items:center;justify-content:center;z-index:10060;';
  overlay.innerHTML = `
    <div style="width:min(840px,94vw);background:#111827;border:1px solid rgba(255,255,255,0.16);border-radius:10px;box-shadow:0 12px 36px rgba(0,0,0,0.55);overflow:hidden;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.12);background:#0f172a;">
        <div style="display:flex;flex-direction:column;gap:4px;">
          <strong style="color:#e5e7eb;font-size:13px;">${escapeHtml(title)}</strong>
          <span id="moe-attachments-meta" style="color:#9ca3af;font-size:11px;"></span>
        </div>
        <button id="moe-attachments-close" style="background:transparent;border:none;color:#9ca3af;cursor:pointer;font-size:18px;line-height:1;">×</button>
      </div>
      <div style="padding:12px 14px;display:flex;justify-content:space-between;gap:10px;align-items:center;border-bottom:1px solid rgba(255,255,255,0.08);">
        <div style="color:#9ca3af;font-size:12px;display:grid;gap:6px;">
          ${safeScope === 'shared'
            ? 'Files in a shared bucket are visible to agents granted access.'
            : 'Files in this local bucket are visible only to this agent when RLM Assist is enabled.'}
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="color:#7dd3fc;font-size:11px;">Bucket:</span>
            <select id="moe-attachments-bucket-select"
                    style="padding:6px 9px;background:rgba(255,255,255,0.08);border:1px solid #4b5563;border-radius:6px;color:#fff;min-width:220px;font-size:12px;"></select>
            <button id="moe-attachments-new-bucket"
                    style="padding:6px 10px;background:rgba(255,255,255,0.08);border:1px solid #4b5563;border-radius:6px;color:#ddd;cursor:pointer;font-size:12px;">+ Bucket</button>
            <button id="moe-attachments-access-bucket"
                    style="padding:6px 10px;background:rgba(0,212,255,0.12);border:1px solid #00d4ff;border-radius:6px;color:#9fe8ff;cursor:pointer;font-size:12px;">Access</button>
            <button id="moe-attachments-delete-bucket"
                    style="padding:6px 10px;background:rgba(255,107,107,0.12);border:1px solid #ff6b6b;border-radius:6px;color:#ff9b9b;cursor:pointer;font-size:12px;">Delete Bucket</button>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button id="moe-attachments-attach" style="padding:6px 10px;background:rgba(0,212,255,0.16);border:1px solid #00d4ff;border-radius:6px;color:#9fe8ff;cursor:pointer;font-size:12px;">Attach File</button>
          <button id="moe-attachments-refresh" style="padding:6px 10px;background:rgba(255,255,255,0.1);border:1px solid #666;border-radius:6px;color:#ddd;cursor:pointer;font-size:12px;">Refresh</button>
          <button id="moe-attachments-clear" style="padding:6px 10px;background:rgba(255,107,107,0.16);border:1px solid #ff6b6b;border-radius:6px;color:#ff9b9b;cursor:pointer;font-size:12px;">Clear All</button>
        </div>
      </div>
      <div id="moe-attachments-list" style="padding:12px 14px;max-height:58vh;overflow:auto;"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('#moe-attachments-close')?.addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  const listEl = overlay.querySelector('#moe-attachments-list');
  const bucketSelect = overlay.querySelector('#moe-attachments-bucket-select');
  const metaEl = overlay.querySelector('#moe-attachments-meta');
  let currentBuckets = await listMoeBucketsForScope(safeScope, agent);
  let activeBucketId = String(initialTarget.bucketId || '').trim();
  if (!activeBucketId && currentBuckets[0]?.id) {
    activeBucketId = String(currentBuckets[0].id);
  }

  const resolveActiveTarget = () => {
    const selectedBucket = currentBuckets.find((bucket) => String(bucket?.id || '') === activeBucketId) || null;
    if (selectedBucket) {
      return {
        bucketId: String(selectedBucket.id || ''),
        sessionId: String(selectedBucket.sessionId || ''),
        label: String(selectedBucket.label || selectedBucket.id || ''),
        scope: safeScope
      };
    }
    return initialTarget;
  };

  const refreshBucketSelector = () => {
    if (!bucketSelect) return;
    const optionsHtml = currentBuckets.map((bucket) => {
      const id = String(bucket?.id || '').trim();
      if (!id) return '';
      const label = String(bucket?.label || id);
      const selected = id === activeBucketId ? 'selected' : '';
      const scope = String(bucket?.scope || '').trim().toLowerCase();
      const scopeTag = scope === 'global-shared'
        ? '[Global]'
        : (scope === 'relay-shared' ? '[Shared]' : '[Agent]');
      return `<option value="${escapeHtml(id)}" ${selected} style="color:#111;background:#fff;">${escapeHtml(scopeTag)} ${escapeHtml(label)} (${escapeHtml(id)})</option>`;
    }).filter(Boolean).join('');
    bucketSelect.innerHTML = optionsHtml || '<option value="" style="color:#111;background:#fff;">(No buckets)</option>';
    const active = resolveActiveTarget();
    if (metaEl) {
      metaEl.innerHTML = `Bucket: <code>${escapeHtml(active.bucketId || '(none)')}</code> • Session: <code>${escapeHtml(active.sessionId || '(none)')}</code>`;
    }
  };

  const renderList = async () => {
    if (!listEl) return;
    if (!window.electronAPI?.terminalAttachmentsList) {
      listEl.innerHTML = '<div style="color:#fca5a5;font-size:12px;">Attachment list API unavailable.</div>';
      return;
    }
    try {
      const target = resolveActiveTarget();
      applyAttachmentTarget(agent, safeScope, target);
      const result = await window.electronAPI.terminalAttachmentsList({
        ...(target.bucketId ? { bucketId: target.bucketId, userId: getMoeBucketPrincipal() } : { sessionId: target.sessionId })
      });
      const attachments = Array.isArray(result?.attachments) ? result.attachments : [];
      if (attachments.length === 0) {
        listEl.innerHTML = '<div style="color:#9ca3af;font-size:13px;">No files attached.</div>';
        return;
      }
      const rows = attachments.map((att) => {
        const id = String(att?.id || '');
        const name = escapeHtml(String(att?.displayName || att?.originalName || id || 'unnamed'));
        const bytes = Number(att?.sizeBytes || 0);
        const size = `${Math.max(0, bytes)} B`;
        return `
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
            <div style="min-width:0;">
              <div style="color:#e5e7eb;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</div>
              <div style="color:#9ca3af;font-size:11px;">${escapeHtml(id)} • ${escapeHtml(size)}</div>
            </div>
            <button data-att-id="${encodeURIComponent(id)}" class="moe-attachment-delete"
                    style="padding:5px 9px;background:rgba(255,107,107,0.14);border:1px solid #ff6b6b;border-radius:6px;color:#ff9b9b;cursor:pointer;font-size:11px;">
              Delete
            </button>
          </div>
        `;
      }).join('');
      listEl.innerHTML = rows;
      listEl.querySelectorAll('.moe-attachment-delete').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const attId = decodeURIComponent(btn.getAttribute('data-att-id') || '');
          if (!attId || !window.electronAPI?.terminalAttachmentsRemove) return;
          const target = resolveActiveTarget();
          const removed = await window.electronAPI.terminalAttachmentsRemove({
            ...(target.bucketId ? { bucketId: target.bucketId, userId: getMoeBucketPrincipal() } : { sessionId: target.sessionId }),
            attachmentId: attId
          });
          if (!removed?.success && typeof window.appendMoeDeployStatusLine === 'function') {
            window.appendMoeDeployStatusLine(`Delete failed: ${removed?.error || 'Unknown error'}`, 'error');
          }
          await refreshMoeAttachmentCounts({ force: true, rerender: false });
          await renderList();
        });
      });
    } catch (err) {
      listEl.innerHTML = `<div style="color:#fca5a5;font-size:12px;">Error: ${escapeHtml(err.message || String(err))}</div>`;
    }
  };

  bucketSelect?.addEventListener('change', async () => {
    const next = String(bucketSelect.value || '').trim();
    if (!next) return;
    activeBucketId = next;
    const target = resolveActiveTarget();
    applyAttachmentTarget(agent, safeScope, target);
    refreshBucketSelector();
    await refreshMoeAttachmentCounts({ force: true, rerender: true });
    await renderList();
  });

  overlay.querySelector('#moe-attachments-new-bucket')?.addEventListener('click', async () => {
    if (!window.electronAPI?.terminalBucketsCreate) return;
    const suggested = safeScope === 'shared' ? 'shared-group' : `agent-${String(agent?.name || agent?.id || 'local')}`;
    const rawName = window.prompt('New bucket name:', suggested);
    const slug = normalizeMoeBucketId(rawName || '');
    if (!slug) return;
    const createdId = safeScope === 'shared'
      ? `relay-shared-${slug}`
      : `relay-agent-${String(agent?.id || 'unknown')}-${slug}`;
    const createdSession = safeScope === 'shared'
      ? `moe-shared-${slug}`
      : `moe-agent-${String(agent?.id || 'unknown')}-${slug}`;
    const created = await window.electronAPI.terminalBucketsCreate({
      bucketId: createdId,
      label: String(rawName || createdId).trim(),
      scope: safeScope === 'shared' ? 'relay-shared' : 'relay-agent',
      sessionId: createdSession,
      ownerAgentId: safeScope === 'shared' ? '' : String(agent?.id || ''),
      userId: getMoeBucketPrincipal(),
      securityLabel: {
        schemaVersion: 'bucket-label/v0-stub',
        classification: 'UNCLASSIFIED',
        compartments: [],
        releasability: ['INTERNAL'],
        policyTag: safeScope === 'shared' ? 'relay-shared-stub' : 'relay-agent-stub'
      }
    });
    if (!created?.success) {
      if (typeof window.appendMoeDeployStatusLine === 'function') {
        window.appendMoeDeployStatusLine(`Create bucket failed: ${created?.error || 'Unknown error'}`, 'error');
      }
      return;
    }
    currentBuckets = await listMoeBucketsForScope(safeScope, agent);
    activeBucketId = String(created?.bucket?.id || createdId);
    const target = resolveActiveTarget();
    applyAttachmentTarget(agent, safeScope, target);
    refreshBucketSelector();
    await refreshMoeAttachmentCounts({ force: true, rerender: true });
    await renderList();
  });
  overlay.querySelector('#moe-attachments-access-bucket')?.addEventListener('click', async () => {
    if (!window.electronAPI?.terminalBucketsGrant || !window.electronAPI?.terminalBucketsRevoke) return;
    const target = resolveActiveTarget();
    const bucketId = String(target?.bucketId || '').trim();
    if (!bucketId) {
      if (typeof window.appendMoeDeployStatusLine === 'function') {
        window.appendMoeDeployStatusLine('Select a bucket first.', 'warn');
      }
      return;
    }
    const blocker = document.createElement('div');
    blocker.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;z-index:2;';
    blocker.innerHTML = `
      <div style="width:min(620px,94%);background:#0b1220;border:1px solid rgba(255,255,255,0.18);border-radius:10px;padding:12px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <strong style="color:#e5e7eb;font-size:13px;">Bucket Access</strong>
          <button id="moe-access-close" style="padding:5px 8px;background:transparent;border:1px solid #4b5563;border-radius:6px;color:#d1d5db;cursor:pointer;">Close</button>
        </div>
        <div style="color:#9ca3af;font-size:11px;margin-top:6px;">Bucket: <code>${escapeHtml(bucketId)}</code></div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px;">
          <input id="moe-access-principal" type="text" placeholder="principal (e.g. terminal-user)"
                 style="flex:1;min-width:220px;padding:8px;background:rgba(255,255,255,0.08);border:1px solid #4b5563;border-radius:6px;color:#fff;">
          <select id="moe-access-level" style="padding:8px;background:rgba(255,255,255,0.08);border:1px solid #4b5563;border-radius:6px;color:#fff;">
            <option value="read" style="color:#111;background:#fff;">read</option>
            <option value="read-write" style="color:#111;background:#fff;">read-write</option>
          </select>
          <button id="moe-access-grant" style="padding:8px 10px;background:rgba(0,212,255,0.16);border:1px solid #00d4ff;border-radius:6px;color:#9fe8ff;cursor:pointer;">Grant</button>
        </div>
        <div id="moe-access-list" style="margin-top:10px;max-height:36vh;overflow:auto;border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:8px;"></div>
      </div>
    `;
    const root = overlay.querySelector('div');
    if (!root) return;
    root.appendChild(blocker);
    const refreshAccess = async () => {
      const listed = await window.electronAPI.terminalBucketsList({ userId: getMoeBucketPrincipal() });
      const allBuckets = Array.isArray(listed?.buckets) ? listed.buckets : [];
      currentBuckets = allBuckets.filter((bucket) => {
        const bucketScope = String(bucket?.scope || '').trim().toLowerCase();
        if (safeScope === 'shared') return bucketScope === 'relay-shared' || bucketScope === 'global-shared';
        if (bucketScope !== 'relay-agent') return false;
        const ownerAgentId = String(bucket?.ownerAgentId || '').trim();
        return !agent?.id || !ownerAgentId || ownerAgentId === agent.id;
      });
      const bucket = allBuckets.find((b) => String(b?.id || '').trim() === bucketId) || {};
      const grants = Array.isArray(bucket?.grants) ? bucket.grants : [];
      const listEl = blocker.querySelector('#moe-access-list');
      if (!listEl) return;
      if (grants.length === 0) {
        listEl.innerHTML = '<div style="color:#9ca3af;font-size:12px;">No explicit grants (stub-open default).</div>';
        return;
      }
      listEl.innerHTML = grants.map((g) => {
        const principal = String(g?.principal || '').trim();
        const access = String(g?.access || 'read').trim();
        return `
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.08);">
            <div style="color:#e5e7eb;font-size:12px;"><code>${escapeHtml(principal)}</code> • ${escapeHtml(access)}</div>
            <button data-principal="${encodeURIComponent(principal)}" class="moe-access-revoke"
                    style="padding:5px 8px;background:rgba(255,107,107,0.12);border:1px solid #ff6b6b;border-radius:6px;color:#ff9b9b;cursor:pointer;font-size:11px;">Revoke</button>
          </div>
        `;
      }).join('');
      listEl.querySelectorAll('.moe-access-revoke').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const principal = decodeURIComponent(btn.getAttribute('data-principal') || '');
          if (!principal) return;
          await window.electronAPI.terminalBucketsRevoke({
            bucketId,
            principal,
            userId: getMoeBucketPrincipal()
          });
          await refreshAccess();
        });
      });
      refreshBucketSelector();
    };
    blocker.querySelector('#moe-access-close')?.addEventListener('click', () => blocker.remove());
    blocker.addEventListener('click', (event) => {
      if (event.target === blocker) blocker.remove();
    });
    blocker.querySelector('#moe-access-grant')?.addEventListener('click', async () => {
      const principal = String(blocker.querySelector('#moe-access-principal')?.value || '').trim();
      const access = String(blocker.querySelector('#moe-access-level')?.value || 'read').trim();
      if (!principal) return;
      await window.electronAPI.terminalBucketsGrant({
        bucketId,
        principal,
        access,
        userId: getMoeBucketPrincipal()
      });
      blocker.querySelector('#moe-access-principal').value = '';
      await refreshAccess();
    });
    await refreshAccess();
  });
  overlay.querySelector('#moe-attachments-delete-bucket')?.addEventListener('click', async () => {
    if (!window.electronAPI?.terminalBucketsDelete) return;
    const target = resolveActiveTarget();
    const bucketId = String(target?.bucketId || '').trim();
    if (!bucketId) {
      if (typeof window.appendMoeDeployStatusLine === 'function') {
        window.appendMoeDeployStatusLine('Select a bucket to delete.', 'warn');
      }
      return;
    }
    const listed = await window.electronAPI.terminalAttachmentsList({
      bucketId,
      userId: getMoeBucketPrincipal()
    });
    const attachments = Array.isArray(listed?.attachments) ? listed.attachments : [];
    if (attachments.length > 0) {
      if (typeof window.appendMoeDeployStatusLine === 'function') {
        window.appendMoeDeployStatusLine('Bucket must be empty before deletion. Clear files first.', 'warn');
      }
      return;
    }
    if (!window.confirm(`Delete bucket "${bucketId}"?`)) return;
    const deleted = await window.electronAPI.terminalBucketsDelete({
      bucketId,
      userId: getMoeBucketPrincipal()
    });
    if (!deleted?.success || deleted?.removed !== true) {
      if (typeof window.appendMoeDeployStatusLine === 'function') {
        window.appendMoeDeployStatusLine(`Delete bucket failed: ${deleted?.error || 'permission denied or unknown error'}`, 'error');
      }
      return;
    }
    if (safeScope === 'shared') {
      applyAttachmentTarget(agent, safeScope, { bucketId: '', sessionId: 'moe-shared' });
    } else {
      applyAttachmentTarget(agent, safeScope, {
        bucketId: '',
        sessionId: ensureAgentRlmAttachmentSession(agent)
      });
    }
    currentBuckets = await listMoeBucketsForScope(safeScope, agent);
    activeBucketId = String(currentBuckets[0]?.id || '').trim();
    refreshBucketSelector();
    await refreshMoeAttachmentCounts({ force: true, rerender: true });
    await renderList();
  });

  overlay.querySelector('#moe-attachments-refresh')?.addEventListener('click', renderList);
  overlay.querySelector('#moe-attachments-clear')?.addEventListener('click', async () => {
    if (!window.confirm('Clear all attachments in this bucket?')) return;
    if (!window.electronAPI?.terminalAttachmentsClear) return;
    const target = resolveActiveTarget();
    const cleared = await window.electronAPI.terminalAttachmentsClear({
      ...(target.bucketId ? { bucketId: target.bucketId, userId: getMoeBucketPrincipal() } : { sessionId: target.sessionId })
    });
    if (!cleared?.success && typeof window.appendMoeDeployStatusLine === 'function') {
      window.appendMoeDeployStatusLine(`Clear failed: ${cleared?.error || 'Unknown error'}`, 'error');
    }
    await refreshMoeAttachmentCounts({ force: true, rerender: false });
    await renderList();
  });
  overlay.querySelector('#moe-attachments-attach')?.addEventListener('click', async () => {
    if (!window.electronAPI?.selectImportFile || !window.electronAPI?.terminalAttachmentsAttachFile) return;
    const picked = await window.electronAPI.selectImportFile({
      mode: 'attachment',
      title: safeScope === 'shared' ? 'Attach File to MoE Shared Bucket' : 'Attach File to MoE Agent Bucket'
    });
    if (!picked?.success || !picked?.filePath) return;
    const target = resolveActiveTarget();
    const res = await window.electronAPI.terminalAttachmentsAttachFile({
      ...(target.bucketId ? { bucketId: target.bucketId, userId: getMoeBucketPrincipal() } : { sessionId: target.sessionId }),
      sourcePath: picked.filePath
    });
    if (!res?.success && typeof window.appendMoeDeployStatusLine === 'function') {
      window.appendMoeDeployStatusLine(`Attach failed: ${res?.error || 'Unknown error'}`, 'error');
    }
    await refreshMoeAttachmentCounts({ force: true, rerender: false });
    await renderList();
  });

  refreshBucketSelector();
  await renderList();
}

function openMoeRoutingHelp() {
  const html = `
    <div style="display:grid; gap:10px;">
      <div style="color:#d1d5db; font-size:13px;">
        <strong>Dynamic vs Static routing decides who chooses the next hop.</strong>
      </div>
      <div style="background:rgba(0,212,255,0.10); border:1px solid rgba(0,212,255,0.35); border-radius:8px; padding:10px;">
        <div style="color:#00d4ff; font-weight:bold; margin-bottom:4px;">🎲 Dynamic (LLM-led)</div>
        <div style="color:#cbd5e1; font-size:12px;">Agent decides next hop from context and intent. Best for planning/dispatcher agents.</div>
      </div>
      <div style="background:rgba(255,212,0,0.10); border:1px solid rgba(255,212,0,0.35); border-radius:8px; padding:10px;">
        <div style="color:#ffd400; font-weight:bold; margin-bottom:4px;">📋 Static (Rule-led)</div>
        <div style="color:#cbd5e1; font-size:12px;">Engineer-defined deterministic routing. Recommended near control/safety boundaries.</div>
      </div>
      <div style="color:#9ca3af; font-size:12px;">
        Recommended pattern: <strong>Dynamic early</strong> (planning) and <strong>Static late</strong> (actuation/safety).
      </div>
    </div>
  `;
  if (typeof showScrollableModalHtml === 'function') {
    showScrollableModalHtml('Agent Routing Modes', html, 'info');
    return;
  }
  if (typeof window.appendMoeDeployStatusLine === 'function') {
    window.appendMoeDeployStatusLine('Routing help: Dynamic = LLM-led next-hop; Static = deterministic rule-led routing.', 'info');
  } else {
    console.info('[MoE] Routing help: Dynamic = LLM-led next-hop; Static = deterministic rule-led routing.');
  }
}

window.assignModelToAgent = assignModelToAgent;
window.updateAgentProvider = updateAgentProvider;
window.toggleAgentRoutingMode = toggleAgentRoutingMode;
window.toggleAgentRlmAssist = toggleAgentRlmAssist;
window.updateAgentMultiGpuSplit = updateAgentMultiGpuSplit;
window.openMoeAttachmentManager = openMoeAttachmentManager;
window.openMoeRoutingHelp = openMoeRoutingHelp;
