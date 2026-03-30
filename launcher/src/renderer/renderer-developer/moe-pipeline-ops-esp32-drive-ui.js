/**
 *
 * @version 1.1.3 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */

const ESP32_NUMPAD_CW_180_MS = 820;
const esp32DrivePopoutsByGateway = window.__esp32DrivePopoutsByGateway || (window.__esp32DrivePopoutsByGateway = Object.create(null));
const esp32HeldNumpadByGateway = window.__esp32HeldNumpadByGateway || (window.__esp32HeldNumpadByGateway = Object.create(null));

async function runGatewayEsp32NumpadAction(gatewayId, keyCode) {
  const code = String(keyCode || '').trim();
  if (code === 'Numpad5') {
    await runGatewayEsp32TimedDrive(gatewayId, 'right', ESP32_NUMPAD_CW_180_MS);
  }
}

function handleGatewayEsp32NumpadCommand(gatewayId, keyCode, isDown) {
  const code = String(keyCode || '').trim();
  const down = isDown === true;
  if (!esp32HeldNumpadByGateway[gatewayId]) {
    esp32HeldNumpadByGateway[gatewayId] = Object.create(null);
  }
  const held = esp32HeldNumpadByGateway[gatewayId];
  const wasHeld = held[code] === true;
  if (down) held[code] = true;
  else held[code] = false;

  if (code === 'Numpad8') {
    if (down) startGatewayEsp32Drive(gatewayId, 'forward');
    else stopGatewayEsp32Drive(gatewayId);
    return;
  }
  if (code === 'Numpad4' || code === 'Numpad7' || code === 'Numpad1') {
    if (down) startGatewayEsp32Drive(gatewayId, 'left');
    else stopGatewayEsp32Drive(gatewayId);
    return;
  }
  if (code === 'Numpad6' || code === 'Numpad9' || code === 'Numpad3') {
    if (down) startGatewayEsp32Drive(gatewayId, 'right');
    else stopGatewayEsp32Drive(gatewayId);
    return;
  }
  if (code === 'Numpad2') {
    if (down) startGatewayEsp32Drive(gatewayId, 'reverse');
    else stopGatewayEsp32Drive(gatewayId);
    return;
  }
  if (code === 'Numpad0') {
    if (down) sendGatewayEsp32Stop(gatewayId, { log: false });
    return;
  }

  if (down && !wasHeld) {
    runGatewayEsp32NumpadAction(gatewayId, code).catch((err) => {
      const state = readScanState(gatewayId);
      state.driveError = String(err?.message || err || 'Numpad action failed');
      esp32Render();
    });
  }
}

function showGatewayEsp32NumControlsHelp(gatewayId) {
  const gateway = readGatewayById(gatewayId);
  const name = String(gateway?.name || 'Gateway');
  esp32LogStatus(
    `[ESP32 Drive] NUM controls for ${name}: hold 8 = Fwd, 2 = Rev, 7/4/1 = Left, 9/6/3 = Right, 5 = CW 180, 0 = STOP.`,
    'info'
  );
  esp32LogStatus(
    '[ESP32 Drive] Requires: Enable NUM controls = ON and Take Control = ON for the gateway.',
    'info'
  );
}

function buildEsp32DrivePopoutHtml(gatewayId, title) {
  const safeId = String(gatewayId).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const safeTitle = String(title || 'ESP32 Drive').replace(/[&<>"]/g, (ch) => (
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : '&quot;'
  ));
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${safeTitle} • Popout</title>
  <style>
    body { margin: 0; padding: 12px; font-family: system-ui, sans-serif; background: #0f172a; color: #e6edf7; }
    .card { border: 1px solid #334155; border-radius: 10px; padding: 10px; background: #111827; }
    .title { font-weight: 700; margin-bottom: 8px; font-size: 14px; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    button { border: 1px solid #475569; border-radius: 8px; background: #1f2937; color: #dbeafe; padding: 10px; font-size: 13px; cursor: pointer; }
    button:active { transform: scale(0.98); }
    .accent { border-color: #38bdf8; background: #0b2a3a; }
    .warn { border-color: #ef4444; background: #3a1116; color: #fecaca; }
    .hint { margin-top: 10px; color: #93c5fd; font-size: 12px; line-height: 1.4; }
    .code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #bfdbfe; }
  </style>
</head>
<body>
  <div class="card">
    <div class="title">${safeTitle}</div>
    <div class="grid">
      <button class="accent" data-code="Numpad8" data-hold="1">8 FWD</button>
      <button data-code="Numpad7" data-hold="1">7 LEFT</button>
      <button data-code="Numpad9" data-hold="1">9 RIGHT</button>
      <button class="accent" data-code="Numpad4" data-hold="1">4 LEFT</button>
      <button class="warn" data-code="Numpad5">5 CW 180</button>
      <button class="accent" data-code="Numpad6" data-hold="1">6 RIGHT</button>
      <button data-code="Numpad1" data-hold="1">1 LEFT</button>
      <button class="accent" data-code="Numpad2" data-hold="1">2 REV</button>
      <button data-code="Numpad3" data-hold="1">3 RIGHT</button>
      <button class="warn" data-code="Numpad0">0 STOP</button>
    </div>
    <div class="hint">
      Keyboard: <span class="code">Numpad 8</span> fwd, <span class="code">2</span> rev, <span class="code">7/4/1</span> left, <span class="code">9/6/3</span> right (all hold-drive), <span class="code">5</span> CW 180, <span class="code">0</span> stop.
    </div>
  </div>
  <script>
    (function() {
      const gatewayId = '${safeId}';
      const control = (code, isDown) => {
        if (!window.opener || !window.opener.handleGatewayEsp32NumpadCommand) return;
        window.opener.handleGatewayEsp32NumpadCommand(gatewayId, code, !!isDown);
      };
      const toNumpadCode = (ev) => {
        const c = String(ev.code || '');
        if (/^Numpad[0-9]$/.test(c)) return c;
        if (/^Digit[0-9]$/.test(c)) return 'Numpad' + c.replace('Digit', '');
        return '';
      };
      window.addEventListener('keydown', (ev) => {
        const code = toNumpadCode(ev);
        if (!code) return;
        ev.preventDefault();
        control(code, true);
      });
      window.addEventListener('keyup', (ev) => {
        const code = toNumpadCode(ev);
        if (!code) return;
        ev.preventDefault();
        control(code, false);
      });
      window.addEventListener('beforeunload', () => {
        ['Numpad8','Numpad4','Numpad6','Numpad2'].forEach((c) => control(c, false));
        control('Numpad0', true);
      });
      document.querySelectorAll('button[data-code]').forEach((btn) => {
        const code = btn.getAttribute('data-code');
        const hold = btn.getAttribute('data-hold') === '1';
        if (hold) {
          btn.addEventListener('pointerdown', () => control(code, true));
          btn.addEventListener('pointerup', () => control(code, false));
          btn.addEventListener('pointercancel', () => control(code, false));
          btn.addEventListener('pointerleave', () => control(code, false));
        } else {
          btn.addEventListener('click', () => { control(code, true); control(code, false); });
        }
      });
    })();
  </script>
</body>
</html>`;
}

function openGatewayEsp32DrivePopout(gatewayId) {
  const gateway = readGatewayById(gatewayId);
  if (!gateway) {
    esp32LogStatus(`[ESP32 Drive] Gateway not found for popout id: ${String(gatewayId || '')}`, 'error');
    return;
  }
  const existing = esp32DrivePopoutsByGateway[gatewayId];
  if (existing && !existing.closed) {
    existing.focus();
    esp32LogStatus('[ESP32 Drive] Popout focused.', 'info');
    return;
  }
  const title = `${String(gateway.name || 'ESP32 Gateway')} Drive`;
  const pop = window.open('', `esp32-drive-${gatewayId}`, 'width=460,height=520,resizable=yes');
  if (!pop) {
    const state = readScanState(gatewayId);
    state.driveError = 'Popout blocked by window policy.';
    esp32LogStatus('[ESP32 Drive] Popout blocked by browser window policy.', 'warn');
    esp32Render();
    return;
  }
  esp32DrivePopoutsByGateway[gatewayId] = pop;
  pop.document.open();
  pop.document.write(buildEsp32DrivePopoutHtml(gatewayId, title));
  pop.document.close();
  esp32LogStatus('[ESP32 Drive] Popout opened.', 'success');
}

function ensureEsp32DrivePopoutClickDelegate() {
  if (window.__esp32DrivePopoutDelegateBound === true) return;
  window.__esp32DrivePopoutDelegateBound = true;
  document.addEventListener('click', (event) => {
    const target = event.target?.closest?.('[data-esp32-drive-popout]');
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    const gatewayId = String(target.getAttribute('data-esp32-drive-popout') || '').trim();
    if (!gatewayId) {
      esp32LogStatus('[ESP32 Drive] Popout click ignored: missing gateway id.', 'error');
      return;
    }
    openGatewayEsp32DrivePopout(gatewayId);
  }, true);
}

function normalizeMainNumpadCode(ev) {
  const code = String(ev?.code || '').trim();
  if (/^Numpad[0-9]$/.test(code)) return code;
  if (/^Digit[0-9]$/.test(code)) return `Numpad${code.slice(5)}`;
  return '';
}

function isKeyboardEventFromEditableTarget(ev) {
  const el = ev?.target;
  if (!el || typeof el !== 'object') return false;
  const tag = String(el.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable === true) return true;
  return false;
}

function resolveMainNumpadGatewayId() {
  const ids = listEsp32GatewayIds();
  for (const id of ids) {
    const gateway = readGatewayById(id);
    if (!gateway || gateway.enabled === false) continue;
    const esp32 = gateway?.irg?.esp32 || {};
    if (esp32.wifiNumControlsEnabled !== true) continue;
    const state = readScanState(id);
    if (state.takeControl === true) return id;
  }
  return '';
}

function ensureEsp32MainNumpadHandlers() {
  if (window.__esp32MainNumpadHandlersBound === true) return;
  window.__esp32MainNumpadHandlersBound = true;

  document.addEventListener('keydown', (event) => {
    if (isKeyboardEventFromEditableTarget(event)) return;
    const code = normalizeMainNumpadCode(event);
    if (!code) return;
    const gatewayId = resolveMainNumpadGatewayId();
    if (!gatewayId) return;
    event.preventDefault();
    event.stopPropagation();
    handleGatewayEsp32NumpadCommand(gatewayId, code, true);
  }, true);

  document.addEventListener('keyup', (event) => {
    if (isKeyboardEventFromEditableTarget(event)) return;
    const code = normalizeMainNumpadCode(event);
    if (!code) return;
    const gatewayId = resolveMainNumpadGatewayId();
    if (!gatewayId) return;
    event.preventDefault();
    event.stopPropagation();
    handleGatewayEsp32NumpadCommand(gatewayId, code, false);
  }, true);
}

ensureEsp32DrivePopoutClickDelegate();
ensureEsp32MainNumpadHandlers();

window.openGatewayEsp32DrivePopout = openGatewayEsp32DrivePopout;
window.handleGatewayEsp32NumpadCommand = handleGatewayEsp32NumpadCommand;
window.showGatewayEsp32NumControlsHelp = showGatewayEsp32NumControlsHelp;
