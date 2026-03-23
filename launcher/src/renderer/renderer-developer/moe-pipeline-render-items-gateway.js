/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */

function renderGatewayRow(gateway, index) {
  const { editMode, expandedMoeItem, expandedMoeItems } = window.modelOrderingState;
  const expanded = Array.isArray(expandedMoeItems) ? expandedMoeItems : [];
  const isExpanded = expanded.includes(gateway.id) || expandedMoeItem === gateway.id;
  const expandIcon = isExpanded ? '▼' : '▶';
  const enabledSources = Object.values(gateway.sources).filter(s => s.enabled).length;
  const theme = getMoeTheme();
  
  return `
    <div class="moe-item moe-gateway ${isExpanded ? 'expanded' : ''}"
         data-moe-id="${gateway.id}" data-moe-type="gateway" data-index="${index}"
         ${editMode ? `draggable="true" ondragstart="handleMoeDragStart(event, '${gateway.id}')" ondragend="handleMoeDragEnd(event)"` : ''}
         onclick="handleMoeItemClick(event, '${gateway.id}')"
         style="background: rgba(0,255,136,0.1); border: 2px solid ${theme.success}; border-radius: 8px; padding: 12px 15px;
                cursor: ${editMode ? 'grab' : 'pointer'}; transition: all 0.15s ease; ${!gateway.enabled ? 'opacity: 0.5;' : ''}">
      <div style="display: flex; align-items: center; gap: 12px;">
        <span onclick="event.stopPropagation(); toggleMoeExpand('${gateway.id}')" 
              style="color: ${theme.success}; cursor: pointer; user-select: none; font-size: 10px; width: 15px;">${expandIcon}</span>
        ${editMode ? `<span class="drag-handle" style="color: ${theme.success}; cursor: grab;">⋮⋮</span>` : ''}
        <span style="color: ${theme.success}; font-weight: bold; min-width: 30px; text-align: center;">${index + 1}</span>
        <span style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:6px;background:rgba(63,185,80,0.15);">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#3fb950" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="14" height="10" rx="2"/><line x1="4" y1="7" x2="8" y2="7"/><line x1="4" y1="10" x2="12" y2="10"/></svg>
        </span>
        <span onclick="event.stopPropagation(); promptRenameMoeItem('${gateway.id}')" onmousedown="event.stopPropagation();"
              style="color:#fff; font-weight:bold; font-size:12px; min-width:150px; padding:4px; border-bottom:1px solid transparent; cursor:text;"
              onmouseover="this.style.borderBottomColor='${theme.success}'" onmouseout="this.style.borderBottomColor='transparent'">${escapeBinding(gateway.name)}</span>
        <span style="background: rgba(0,255,136,0.2); color: ${theme.success}; padding: 3px 10px; border-radius: 10px; font-size: 11px;">
          ${gateway.position === 'input' ? '⬇️ Input' : '⬆️ Output'}
        </span>
        <div style="flex: 1; display: flex; gap: 8px; align-items: center;">
          ${gateway.sources.terminal.enabled ? '<span style="background: var(--psf-accent-medium, rgba(0,212,255,0.2)); color: var(--psf-accent, #00d4ff); padding: 2px 8px; border-radius: 10px; font-size: 10px;">Terminal</span>' : ''}
          ${gateway.sources.api.enabled ? `<span style="background: ${theme.accentMedium}; color: ${theme.accent}; padding: 2px 8px; border-radius: 10px; font-size: 10px;">API :${gateway.sources.api.port}</span>` : ''}
          ${gateway.sources.serial.enabled ? `<span style="background: rgba(255,212,0,0.2); color: ${theme.warning}; padding: 2px 8px; border-radius: 10px; font-size: 10px;">${gateway.sources.serial.port}</span>` : ''}
          ${enabledSources === 0 ? `<span style="color: ${theme.error}; font-size: 11px; font-style: italic;">No sources enabled</span>` : ''}
        </div>
        <label onclick="event.stopPropagation()" style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
          <input type="checkbox" ${gateway.enabled ? 'checked' : ''} onchange="toggleMoeItemEnabled('${gateway.id}', this.checked)">
          <span style="color: #888; font-size: 11px;">Enabled</span>
        </label>
        <button onclick="event.stopPropagation(); deleteMoeItem('${gateway.id}')"
                style="padding: 4px 8px; background: transparent; border: 1px solid ${theme.error}; border-radius: 4px; color: ${theme.error}; cursor: pointer; font-size: 11px;">✕</button>
      </div>
      ${isExpanded ? renderGatewayDetails(gateway) : ''}
    </div>
  `;
}

/**
 * Render gateway expanded details
 */
function renderGatewayDetails(gateway) {
  const theme = getMoeTheme();
  const serialPorts = Array.isArray(window.modelOrderingState?.serialDevices)
    ? window.modelOrderingState.serialDevices
    : [];
  const serialSource = gateway?.sources?.serial || {};
  const irg = gateway?.irg || {};
  const irgLive = irg?.live || {};
  const irgPico = irg?.pico || {};
  const irgEsp32 = irg?.esp32 || {};
  const irgFallbackMode = String(irg?.deterministicFallbackMode || 'on-gaps-or-low-confidence').toLowerCase();
  const irgConfidenceThreshold = Number.isFinite(Number(irg?.deterministicConfidenceThreshold))
    ? Number(irg.deterministicConfidenceThreshold)
    : 0.9;
  const esp32ScanState = (typeof window.getGatewayEsp32WifiScanData === 'function'
    ? window.getGatewayEsp32WifiScanData(gateway.id)
    : null) || {};
  const esp32PasswordVisible = typeof window.isGatewayEsp32PasswordVisible === 'function'
    ? window.isGatewayEsp32PasswordVisible(gateway.id) === true
    : false;
  const esp32ScanBusy = esp32ScanState.busy === true;
  const esp32FlashBusy = esp32ScanState.flashing === true;
  const esp32ApplyBusy = esp32ScanState.applying === true;
  const esp32ScanNetworks = Array.isArray(esp32ScanState.networks) ? esp32ScanState.networks : [];
  const esp32ScanOptions = esp32ScanNetworks
    .map((ap) => {
      const label = `${String(ap?.ssid || '').trim()} ${Number.isFinite(Number(ap?.rssi)) ? `(${Number(ap.rssi)} dBm)` : ''}`.trim();
      return `<option value="${escapeBinding(String(ap?.ssid || ''))}">${escapeBinding(label)}</option>`;
    })
    .join('');
  const esp32ScanError = String(esp32ScanState.error || '').trim();
  const esp32FlashMessage = String(esp32ScanState.flashMessage || '').trim();
  const esp32ApplyMessage = String(esp32ScanState.applyMessage || '').trim();
  const esp32DriveActive = esp32ScanState.driveActive === true;
  const esp32DriveDirection = String(esp32ScanState.driveDirection || '').trim();
  const esp32DriveSpeed = Number.isInteger(Number(esp32ScanState.driveSpeed))
    ? Number(esp32ScanState.driveSpeed)
    : 170;
  const esp32DriveError = String(esp32ScanState.driveError || '').trim();
  const esp32DriveApplying = esp32ScanState.driveApplying === true;
  const esp32DriveDemoRunning = esp32ScanState.driveDemoRunning === true;
  const esp32AiDriveRunning = esp32ScanState.aiDriveRunning === true;
  const esp32AiDriveBusy = esp32ScanState.aiDriveBusy === true;
  const esp32AiDriveLastDecision = String(esp32ScanState.aiDriveLastDecision || '').trim();
  const esp32DriveApplyMessage = String(esp32ScanState.driveApplyMessage || '').trim();
  const esp32DriveLast = String(esp32ScanState.driveLastCommand || '').trim();
  const esp32DriveLastAt = esp32ScanState.driveLastAt
    ? new Date(esp32ScanState.driveLastAt).toLocaleTimeString()
    : '';
  const esp32TakeControl = esp32ScanState.takeControl === true;
  const esp32Telemetry = esp32ScanState.telemetryLive && typeof esp32ScanState.telemetryLive === 'object'
    ? esp32ScanState.telemetryLive
    : null;
  const esp32TelemetryAt = esp32ScanState.telemetryLiveAt
    ? new Date(esp32ScanState.telemetryLiveAt).toLocaleTimeString()
    : '';
  const esp32TelemetryRssi = Number.isFinite(Number(esp32Telemetry?.rssi)) ? Number(esp32Telemetry.rssi) : null;
  const esp32TelemetryCmd = String(esp32Telemetry?.lastCmd || '').trim();
  const esp32TelemetryAge = Number.isFinite(Number(esp32Telemetry?.cmdAgeMs)) ? Number(esp32Telemetry.cmdAgeMs) : null;
  const esp32CameraEnabled = irgEsp32.wifiCameraEnabled === true;
  const esp32CameraSsid = String(irgEsp32.wifiCameraSsid || '').trim();
  const esp32CameraPassword = String(irgEsp32.wifiCameraPassword || '');
  const esp32CameraHost = String(irgEsp32.wifiCameraHost || '').trim();
  const esp32CameraPort = Number.isInteger(Number(irgEsp32.wifiCameraPort)) ? Number(irgEsp32.wifiCameraPort) : 81;
  const esp32CameraStreamPath = String(irgEsp32.wifiCameraStreamPath || '/stream').trim() || '/stream';
  const esp32CameraSnapshotPath = String(irgEsp32.wifiCameraSnapshotPath || '/capture').trim() || '/capture';
  const esp32CameraHealthPath = String(irgEsp32.wifiCameraFlashStatusPath || '/health').trim() || '/health';
  const esp32CameraBoardProfile = String(irgEsp32.wifiCameraBoardProfile || 'ai-thinker-esp32cam').trim().toLowerCase() || 'ai-thinker-esp32cam';
  const esp32CameraFqbn = String(irgEsp32.wifiCameraFqbn || 'esp32:esp32:esp32cam').trim() || 'esp32:esp32:esp32cam';
  const esp32CameraStaEnabled = irgEsp32.wifiCameraStaEnabled !== false;
  const esp32CameraUsbCdcOnBoot = irgEsp32.wifiCameraUsbCdcOnBoot !== false;
  const esp32CameraCaptureRuntimeSerial = irgEsp32.wifiCameraCaptureRuntimeSerial !== false;
  const esp32CameraRuntimeSerialCaptureMs = Number.isInteger(Number(irgEsp32.wifiCameraRuntimeSerialCaptureMs))
    ? Number(irgEsp32.wifiCameraRuntimeSerialCaptureMs)
    : 20000;
  const esp32CameraStaticEnabled = irgEsp32.wifiCameraStaticEnabled === true;
  const esp32CameraStaticIp = String(irgEsp32.wifiCameraStaticIp || '').trim();
  const esp32CameraStaticCidr = Number.isInteger(Number(irgEsp32.wifiCameraStaticCidr)) ? Number(irgEsp32.wifiCameraStaticCidr) : 24;
  const esp32CameraStaticGatewayEnabled = irgEsp32.wifiCameraStaticGatewayEnabled === true;
  const esp32CameraStaticGateway = String(irgEsp32.wifiCameraStaticGateway || '').trim();
  const esp32CameraBusy = esp32ScanState.cameraBusy === true;
  const esp32CameraError = String(esp32ScanState.cameraError || '').trim();
  const esp32CameraMessage = String(esp32ScanState.cameraMessage || '').trim();
  const esp32CameraLastUrl = String(esp32ScanState.cameraLastUrl || '').trim();
  const esp32CameraLastOkAt = esp32ScanState.cameraLastOkAt
    ? new Date(esp32ScanState.cameraLastOkAt).toLocaleTimeString()
    : '';
  const esp32CameraAnimating = esp32FlashBusy || esp32CameraBusy;
  const esp32ScanTime = esp32ScanState.scannedAt
    ? new Date(esp32ScanState.scannedAt).toLocaleTimeString()
    : '';
  const esp32BusyLabel = esp32ApplyBusy
    ? 'Applying'
    : (esp32FlashBusy ? 'Flashing' : (esp32ScanBusy ? 'Scanning' : ''));
  const esp32RebootingHint = /reboot/i.test(esp32ApplyMessage);
  const esp32StatusAnimate = !!(esp32BusyLabel || esp32RebootingHint);
  const esp32AnimateLabel = esp32BusyLabel || (esp32RebootingHint ? 'Rebooting' : '');
  const esp32StatusText = esp32ApplyMessage
    ? `Apply: ${esp32ApplyMessage}`
    : (esp32FlashMessage
      ? `Flash: ${esp32FlashMessage}`
      : (esp32ScanError
        ? `Scan error: ${esp32ScanError}`
        : (esp32ScanTime
          ? `Scanned: ${esp32ScanTime} (${esp32ScanNetworks.length})`
          : 'Used by Relay commands: health / telemetry / scan / stop / fwd / rev / turn')));
  const esp32DriveStatusText = esp32DriveError
    ? `Drive error: ${esp32DriveError}`
    : (esp32DriveApplyMessage
      ? `Drive: ${esp32DriveApplyMessage}`
    : (esp32DriveActive
      ? `Driving: ${esp32DriveDirection || 'active'} @ ${esp32DriveSpeed}`
      : (esp32DriveLast
        ? `Last: ${esp32DriveLast}${esp32DriveLastAt ? ` (${esp32DriveLastAt})` : ''}`
        : `Ready @ ${esp32DriveSpeed}`)));
  const esp32MapForward = String(irgEsp32.wifiDriveMapForward || 'turn_left');
  const esp32MapLeft = String(irgEsp32.wifiDriveMapLeft || 'rev');
  const esp32MapRight = String(irgEsp32.wifiDriveMapRight || 'fwd');
  const esp32MapReverse = String(irgEsp32.wifiDriveMapReverse || 'turn_right');
  const esp32NumControlsEnabled = irgEsp32.wifiNumControlsEnabled === true;
  const esp32AiDriveEnabled = irgEsp32.wifiAiDriveEnabled === true;
  const esp32AiDriveAgentId = String(irgEsp32.wifiAiDriveAgentId || '').trim();
  const esp32AiDriveObjective = String(irgEsp32.wifiAiDriveObjective || 'Explore safely and avoid obstacles.');
  const esp32AiDriveTickMs = Number.isInteger(Number(irgEsp32.wifiAiDriveTickMs))
    ? Number(irgEsp32.wifiAiDriveTickMs)
    : 420;
  const esp32SectionsRaw = (typeof window.getGatewayEsp32SectionState === 'function'
    ? window.getGatewayEsp32SectionState(gateway.id)
    : {
      wifiControl: false,
      drivePad: false,
      staticNetwork: false,
      cameraSidecar: true
    });
  const esp32Sections = (esp32SectionsRaw && typeof esp32SectionsRaw === 'object')
    ? esp32SectionsRaw
    : {
      wifiControl: false,
      drivePad: false,
      staticNetwork: false,
      cameraSidecar: true
    };
  const esp32WifiExpanded = esp32Sections.wifiControl === true;
  const esp32DriveExpanded = esp32Sections.drivePad === true;
  const esp32StaticExpanded = esp32Sections.staticNetwork === true;
  const esp32CameraExpanded = esp32Sections.cameraSidecar !== false;
  const renderEsp32SectionHeader = (sectionKey, title, expanded, borderColor = '#666', textColor = '#ddd') => `
    <button onclick="event.stopPropagation(); toggleGatewayEsp32Section('${gateway.id}', '${sectionKey}')"
            style="display:flex; align-items:center; gap:8px; width:100%; text-align:left; padding:7px 10px; background: rgba(255,255,255,0.04); border:1px solid ${borderColor}; border-radius:6px; color:${textColor}; cursor:pointer; font-size:11px; font-weight:600;">
      <span style="display:inline-block; width:12px; color:${textColor};">${expanded ? '▼' : '▶'}</span>
      <span>${title}</span>
    </button>
  `;
  const esp32AiAgentOptions = (Array.isArray(window.modelOrderingState?.moeItems) ? window.modelOrderingState.moeItems : [])
    .filter((item) => item?.type === 'agent' && item?.enabled !== false)
    .map((item) => {
      const id = String(item.id || '');
      const name = String(item.name || id || 'Agent');
      const model = String(item.modelName || item.modelId || '').trim();
      const label = model ? `${name} (${model})` : name;
      return `<option value="${escapeBinding(id)}" ${id === esp32AiDriveAgentId ? 'selected' : ''}>${escapeBinding(label)}</option>`;
    })
    .join('');
  const selectedSerialPort = String(serialSource.port || 'auto').trim() || 'auto';
  const updatedAt = window.modelOrderingState?.serialDevicesUpdatedAt
    ? new Date(window.modelOrderingState.serialDevicesUpdatedAt).toLocaleTimeString()
    : null;
  const serialOptions = buildSerialPortOptions(serialPorts, selectedSerialPort);
  
  return `
    <div onclick="event.stopPropagation()" style="margin-top: 15px; padding-top: 15px; border-top: 1px solid ${theme.success}33; font-size: 12px;">
      <div style="margin-bottom: 15px;">
        <label style="color: #888; font-size: 12px; display: block; margin-bottom: 5px;">Gateway Position</label>
        <div style="display: flex; gap: 10px;">
          <button onclick="updateGatewayPosition('${gateway.id}', 'input')"
                  style="padding: 8px 20px; background: ${gateway.position === 'input' ? 'rgba(0,255,136,0.3)' : 'rgba(255,255,255,0.05)'}; 
                         border: 1px solid ${gateway.position === 'input' ? theme.success : '#555'}; border-radius: 6px; 
                         color: ${gateway.position === 'input' ? theme.success : '#888'}; cursor: pointer; font-size: 12px;">⬇️ Input</button>
          <button onclick="updateGatewayPosition('${gateway.id}', 'output')"
                  style="padding: 8px 20px; background: ${gateway.position === 'output' ? 'rgba(0,255,136,0.3)' : 'rgba(255,255,255,0.05)'}; 
                         border: 1px solid ${gateway.position === 'output' ? theme.success : '#555'}; border-radius: 6px; 
                         color: ${gateway.position === 'output' ? theme.success : '#888'}; cursor: pointer; font-size: 12px;">⬆️ Output</button>
        </div>
      </div>
      
      <div style="margin-bottom: 15px;">
        <label style="color: #888; font-size: 12px; display: block; margin-bottom: 8px;">Input Sources</label>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          
          <div style="display: flex; align-items: center; gap: 15px; padding: 10px; background: var(--psf-accent-light, rgba(0,212,255,0.05)); border-radius: 6px;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; min-width: 120px;">
              <input type="checkbox" ${gateway.sources.terminal.enabled ? 'checked' : ''} 
                     onchange="toggleGatewaySource('${gateway.id}', 'terminal', this.checked)">
              <span style="color: var(--psf-accent, #00d4ff); font-size: 12px;">Terminal</span>
            </label>
            <span style="color: #666; font-size: 11px;">Built-in chat interface</span>
          </div>
          
          <div style="display: flex; align-items: center; gap: 15px; padding: 10px; background: ${theme.accentLight}; border-radius: 6px;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; min-width: 120px;">
              <input type="checkbox" ${gateway.sources.api.enabled ? 'checked' : ''} 
                     onchange="toggleGatewaySource('${gateway.id}', 'api', this.checked)">
              <span style="color: ${theme.accent}; font-size: 12px;">HTTP API</span>
            </label>
            <input type="number" value="${gateway.sources.api.port}" 
                   onchange="updateGatewaySourceConfig('${gateway.id}', 'api', 'port', parseInt(this.value))"
                   style="width: 80px; padding: 4px 8px; background: rgba(255,255,255,0.1); border: 1px solid #555; border-radius: 4px; color: #fff;"
                   placeholder="Port">
            <span style="color: #666; font-size: 11px;">${gateway.sources.api.endpoint}</span>
          </div>
          
          <div style="display: flex; align-items: center; gap: 15px; padding: 10px; background: rgba(255,212,0,0.05); border-radius: 6px;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; min-width: 120px;">
              <input type="checkbox" ${gateway.sources.serial.enabled ? 'checked' : ''} 
                     onchange="toggleGatewaySource('${gateway.id}', 'serial', this.checked)">
              <span style="color: ${theme.warning}; font-size: 12px;">Serial</span>
            </label>
            <select onchange="updateGatewaySourceConfig('${gateway.id}', 'serial', 'port', this.value)"
                    style="width: clamp(200px, 34vw, 560px); min-width: 200px; padding: 4px 8px; background: rgba(255,255,255,0.1); border: 1px solid #555; border-radius: 4px; color: #fff; font-size: 11px;">
              ${serialOptions}
            </select>
            <input type="number" value="${gateway.sources.serial.baudRate}" 
                   onchange="updateGatewaySourceConfig('${gateway.id}', 'serial', 'baudRate', parseInt(this.value))"
                   style="width: 80px; padding: 4px 8px; background: rgba(255,255,255,0.1); border: 1px solid #555; border-radius: 4px; color: #fff;"
                   placeholder="115200">
            <span style="color: #666; font-size: 11px;">baud</span>
            <button onclick="refreshMoeSerialPorts('${gateway.id}')"
                    style="padding: 4px 10px; background: rgba(255,212,0,0.15); border: 1px solid ${theme.warning}; border-radius: 4px; color: ${theme.warning}; cursor: pointer; font-size: 11px;">
              Scan USB/Serial
            </button>
            <span style="color: #666; font-size: 11px;">
              ${updatedAt ? `Detected: ${serialPorts.length} (${updatedAt})` : `Detected: ${serialPorts.length}`}
            </span>
          </div>
          
        </div>
      </div>

      <div style="margin-bottom: 15px;">
        <label style="color: #888; font-size: 12px; display: block; margin-bottom: 8px;">IRG Runtime</label>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <div style="display:flex; align-items:center; gap:12px; row-gap:8px; flex-wrap:wrap; padding:10px; background: rgba(0,255,136,0.05); border-radius:6px;">
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
              <input type="checkbox" ${irg.enabled !== false ? 'checked' : ''} onchange="updateGatewayIrgEnabled('${gateway.id}', this.checked)">
              <span style="color:${theme.success};">Enable IRG</span>
            </label>
            <label style="color:#888; font-size:11px;">Entry</label>
            <select onchange="updateGatewayIrgEntryMode('${gateway.id}', this.value)"
                    style="padding:4px 8px; background: rgba(255,255,255,0.1); border:1px solid #555; border-radius:4px; color:#fff; font-size: 11px;">
              <option value="deterministic-first" ${String(irg.entryMode || 'deterministic-first').toLowerCase() === 'deterministic-first' ? 'selected' : ''}>Deterministic First</option>
              <option value="llm-plan-first" ${String(irg.entryMode || 'deterministic-first').toLowerCase() === 'llm-plan-first' ? 'selected' : ''}>LLM Plan First</option>
            </select>
            <label style="color:#888; font-size:11px;">Mode</label>
            <select onchange="updateGatewayIrgMode('${gateway.id}', this.value)"
                    style="padding:4px 8px; background: rgba(255,255,255,0.1); border:1px solid #555; border-radius:4px; color:#fff; font-size: 11px;">
              <option value="simulate" ${String(irg.executeMode || 'live').toLowerCase() === 'simulate' ? 'selected' : ''}>simulate</option>
              <option value="live" ${String(irg.executeMode || 'live').toLowerCase() === 'live' ? 'selected' : ''}>live</option>
              <option value="disabled" ${String(irg.executeMode || 'live').toLowerCase() === 'disabled' ? 'selected' : ''}>disabled</option>
            </select>
            <label style="color:#888; font-size:11px;">Fallback</label>
            <select onchange="updateGatewayIrgFallbackMode('${gateway.id}', this.value)"
                    style="padding:4px 8px; background: rgba(255,255,255,0.1); border:1px solid #555; border-radius:4px; color:#fff; font-size: 11px;">
              <option value="off" ${irgFallbackMode === 'off' ? 'selected' : ''}>Off</option>
              <option value="on-gaps" ${irgFallbackMode === 'on-gaps' ? 'selected' : ''}>On Gaps</option>
              <option value="on-gaps-or-low-confidence" ${irgFallbackMode === 'on-gaps-or-low-confidence' ? 'selected' : ''}>On Gaps or Low Confidence</option>
            </select>
            <span style="flex-basis:100%; height:0;"></span>
            <label style="color:#888; font-size:11px;">Confidence</label>
            <input type="number" min="0" max="1" step="0.05" value="${irgConfidenceThreshold.toFixed(2)}"
                   onchange="updateGatewayIrgConfidenceThreshold('${gateway.id}', this.value)"
                   style="width:70px; padding:4px 8px; background: rgba(255,255,255,0.1); border:1px solid #555; border-radius:4px; color:#fff;">
            <label style="color:#888; font-size:11px;">Live Timeout(ms)</label>
            <input type="number" min="2000" max="300000" value="${Number.isFinite(Number(irgLive.timeoutMs)) ? Number(irgLive.timeoutMs) : 60000}"
                   onchange="updateGatewayIrgLiveTimeout('${gateway.id}', this.value)"
                   style="width:110px; padding:4px 8px; background: rgba(255,255,255,0.1); border:1px solid #555; border-radius:4px; color:#fff;">
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="checkbox" ${irg.requireLlmPlanForLive === true ? 'checked' : ''} onchange="updateGatewayIrgRequirePlan('${gateway.id}', this.checked)">
              <span style="color:#ddd; font-size:11px;">Require LLM plan for live run</span>
            </label>
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="checkbox" ${irg.autoExecuteLive === true ? 'checked' : ''} onchange="updateGatewayIrgAutoExecute('${gateway.id}', this.checked)">
              <span style="color:#ddd; font-size:11px;">Auto-execute live contract</span>
            </label>
          </div>
          <div style="display:flex; align-items:center; gap:12px; padding:10px; background: rgba(255,255,255,0.03); border-radius:6px; flex-wrap: wrap;">
            <span style="color:#888; font-size:11px;">Pico Defaults</span>
            <label style="color:#888; font-size:11px;">GPIO</label>
            <input type="number" min="0" max="28" value="${Number.isInteger(Number(irgPico.defaultGpio)) ? Number(irgPico.defaultGpio) : 25}"
                   onchange="updateGatewayIrgPicoConfig('${gateway.id}', 'defaultGpio', this.value)"
                   style="width:70px; padding:4px 8px; background: rgba(255,255,255,0.1); border:1px solid #555; border-radius:4px; color:#fff;">
            <label style="color:#888; font-size:11px;">Period(ms)</label>
            <input type="number" min="50" max="10000" value="${Number.isFinite(Number(irgPico.defaultPeriodMs)) ? Number(irgPico.defaultPeriodMs) : 500}"
                   onchange="updateGatewayIrgPicoConfig('${gateway.id}', 'defaultPeriodMs', this.value)"
                   style="width:90px; padding:4px 8px; background: rgba(255,255,255,0.1); border:1px solid #555; border-radius:4px; color:#fff;">
            <label style="color:#888; font-size:11px;">Iterations</label>
            <input type="number" min="1" max="10000" value="${Number.isInteger(Number(irgPico.defaultIterations)) ? Number(irgPico.defaultIterations) : 20}"
                   onchange="updateGatewayIrgPicoConfig('${gateway.id}', 'defaultIterations', this.value)"
                   style="width:90px; padding:4px 8px; background: rgba(255,255,255,0.1); border:1px solid #555; border-radius:4px; color:#fff;">
          </div>
          ${renderEsp32SectionHeader('wifiControl', 'ESP32 Wi-Fi Control', esp32WifiExpanded, '#4e78bf', '#9fc1ff')}
          ${esp32WifiExpanded ? `<div style="display:flex; align-items:center; gap:12px; padding:10px; background: rgba(90,140,220,0.08); border-radius:6px; flex-wrap: wrap;">
            <span style="color:#9fc1ff; font-size:11px;">ESP32 Wi-Fi Control</span>
            <label style="color:#888; font-size:11px;">SSID</label>
            <input type="text" value="${escapeBinding(String(irgEsp32.wifiSsid || ''))}"
                   onchange="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiSsid', this.value)"
                   placeholder="YourWiFiName"
                   style="min-width:170px; padding:4px 8px; background: rgba(255,255,255,0.1); border:1px solid #555; border-radius:4px; color:#fff;">
            <label style="color:#888; font-size:11px;">Password</label>
            <input type="${esp32PasswordVisible ? 'text' : 'password'}" value="${escapeBinding(String(irgEsp32.wifiPassword || ''))}"
                   onchange="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiPassword', this.value)"
                   placeholder="WiFi password"
                   style="min-width:160px; padding:4px 8px; background: rgba(255,255,255,0.1); border:1px solid #555; border-radius:4px; color:#fff;">
            <button onclick="toggleGatewayEsp32PasswordMask('${gateway.id}')"
                    style="padding:4px 8px; background: rgba(255,255,255,0.08); border:1px solid #666; border-radius:4px; color:#ddd; cursor:pointer; font-size:11px;">
              ${esp32PasswordVisible ? 'Hide' : 'Show'}
            </button>
            <label style="color:#888; font-size:11px;">Host</label>
            <input type="text" value="${escapeBinding(String(irgEsp32.wifiHost || ''))}"
                   onchange="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiHost', this.value)"
                   placeholder="192.168.1.50 or robot.local"
                   style="min-width:180px; padding:4px 8px; background: rgba(255,255,255,0.1); border:1px solid #555; border-radius:4px; color:#fff;">
            <label style="color:#888; font-size:11px;">Port</label>
            <input type="number" min="1" max="65535" value="${Number.isInteger(Number(irgEsp32.wifiPort)) ? Number(irgEsp32.wifiPort) : 8080}"
                   onchange="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiPort', this.value)"
                   style="width:90px; padding:4px 8px; background: rgba(255,255,255,0.1); border:1px solid #555; border-radius:4px; color:#fff;">
            <label style="color:#888; font-size:11px;">Timeout(ms)</label>
            <input type="number" min="1000" max="60000" step="100" value="${Number.isInteger(Number(irgEsp32.wifiTimeoutMs)) ? Number(irgEsp32.wifiTimeoutMs) : 5000}"
                   onchange="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiTimeoutMs', this.value)"
                   style="width:110px; padding:4px 8px; background: rgba(255,255,255,0.1); border:1px solid #555; border-radius:4px; color:#fff;">
            <button onclick="flashGatewayEsp32WifiFirmware('${gateway.id}')"
                    ${esp32FlashBusy ? 'disabled' : ''}
                    style="padding:4px 10px; background:${esp32FlashBusy ? 'rgba(255,255,255,0.08)' : 'rgba(90,220,160,0.2)'}; border:1px solid #5fe3a8; border-radius:4px; color:${esp32FlashBusy ? '#888' : '#bfffe1'}; cursor:${esp32FlashBusy ? 'not-allowed' : 'pointer'}; font-size:11px;">
              ${esp32FlashBusy ? 'Flashing...' : 'Flash Wi-Fi Firmware'}
            </button>
            <button onclick="applyGatewayEsp32NetworkConfig('${gateway.id}')"
                    ${esp32ApplyBusy ? 'disabled' : ''}
                    style="padding:4px 10px; background:${esp32ApplyBusy ? 'rgba(255,255,255,0.08)' : 'rgba(90,200,255,0.2)'}; border:1px solid #67c9ff; border-radius:4px; color:${esp32ApplyBusy ? '#888' : '#c5ebff'}; cursor:${esp32ApplyBusy ? 'not-allowed' : 'pointer'}; font-size:11px;">
              ${esp32ApplyBusy ? 'Applying...' : 'Apply Network Config'}
            </button>
            <button onclick="scanGatewayEsp32Wifi('${gateway.id}')"
                    ${esp32ScanBusy ? 'disabled' : ''}
                    style="padding:4px 10px; background:${esp32ScanBusy ? 'rgba(255,255,255,0.08)' : 'rgba(90,140,220,0.2)'}; border:1px solid #7aa8ff; border-radius:4px; color:${esp32ScanBusy ? '#888' : '#cfe0ff'}; cursor:${esp32ScanBusy ? 'not-allowed' : 'pointer'}; font-size:11px;">
              ${esp32ScanBusy ? 'Scanning...' : 'Scan Wi-Fi'}
            </button>
            <label style="color:#888; font-size:11px;">Found</label>
            <select onchange="selectGatewayEsp32ScannedSsid('${gateway.id}', this.value)"
                    style="min-width:220px; padding:4px 8px; background: rgba(255,255,255,0.1); border:1px solid #555; border-radius:4px; color:#fff; font-size: 11px;">
              <option value="">${esp32ScanNetworks.length > 0 ? 'Select SSID from scan...' : 'No scan results yet'}</option>
              ${esp32ScanOptions}
            </select>
            <span class="esp32-status-pill ${esp32StatusAnimate ? 'busy' : ''}">
              <span class="esp32-status-label">${escapeBinding(esp32StatusText)}</span>
              ${esp32StatusAnimate ? `<span class="esp32-status-dots" aria-label="${escapeBinding(esp32AnimateLabel)} in progress"><span></span><span></span><span></span></span>` : ''}
            </span>
          </div>` : ''}
          ${renderEsp32SectionHeader('drivePad', 'ESP32 Drive Pad', esp32DriveExpanded, '#3d89b8', '#9fd8ff')}
          ${esp32DriveExpanded ? `<div class="esp32-drive-pad-wrap">
            <span class="esp32-drive-title">ESP32 Drive Pad</span>
            <label style="display:flex; align-items:center; gap:5px; color:#d9e6ff; font-size:11px;">
              <input type="checkbox" ${esp32TakeControl ? 'checked' : ''} onchange="setGatewayEsp32TakeControl('${gateway.id}', this.checked)">
              Take Control
            </label>
            <label style="display:flex; align-items:center; gap:5px; color:#d9e6ff; font-size:11px;">
              <input type="checkbox" ${irgEsp32.wifiDriveSwapSides === true ? 'checked' : ''} onchange="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiDriveSwapSides', this.checked)">
              Swap L/R
            </label>
            <label style="display:flex; align-items:center; gap:5px; color:#d9e6ff; font-size:11px;">
              <input type="checkbox" ${irgEsp32.wifiDriveInvertLeft === true ? 'checked' : ''} onchange="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiDriveInvertLeft', this.checked)">
              Invert Left
            </label>
            <label style="display:flex; align-items:center; gap:5px; color:#d9e6ff; font-size:11px;">
              <input type="checkbox" ${irgEsp32.wifiDriveInvertRight === true ? 'checked' : ''} onchange="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiDriveInvertRight', this.checked)">
              Invert Right
            </label>
            <label style="display:flex; align-items:center; gap:5px; color:#d9e6ff; font-size:11px;">
              <input type="checkbox" ${esp32NumControlsEnabled ? 'checked' : ''} onchange="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiNumControlsEnabled', this.checked)">
              Enable NUM controls
            </label>
            <label style="display:flex; align-items:center; gap:5px; color:#d9e6ff; font-size:11px;">
              <input type="checkbox" ${esp32AiDriveEnabled ? 'checked' : ''} onchange="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiAiDriveEnabled', this.checked)">
              Enable AI Drive
            </label>
            <button class="esp32-drive-btn"
                    onclick="showGatewayEsp32NumControlsHelp('${gateway.id}')">?</button>
            <label style="color:#888; font-size:11px;">Speed</label>
            <input type="range" min="40" max="255" step="1" value="${esp32DriveSpeed}"
                   oninput="setGatewayEsp32DriveSpeed('${gateway.id}', this.value)"
                   style="width: 160px;">
            <span style="color:#cde8ff; font-size:11px; min-width:32px; text-align:right;">${esp32DriveSpeed}</span>
            <label style="color:#888; font-size:11px;">Front Guard</label>
            <input type="number" min="200" max="4095" value="${Number.isInteger(Number(irgEsp32.wifiObstacleFrontThreshold)) ? Number(irgEsp32.wifiObstacleFrontThreshold) : 1500}"
                   onchange="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiObstacleFrontThreshold', this.value)"
                   style="width:86px; padding:4px 8px; background: rgba(255,255,255,0.1); border:1px solid #555; border-radius:4px; color:#fff;">
            <button class="esp32-drive-btn"
                    onpointerdown="startGatewayEsp32Drive('${gateway.id}', 'forward'); return false;"
                    onpointerup="stopGatewayEsp32Drive('${gateway.id}'); return false;"
                    onpointerleave="stopGatewayEsp32Drive('${gateway.id}'); return false;"
                    onpointercancel="stopGatewayEsp32Drive('${gateway.id}'); return false;">↑ Fwd</button>
            <button class="esp32-drive-btn"
                    onpointerdown="startGatewayEsp32Drive('${gateway.id}', 'left'); return false;"
                    onpointerup="stopGatewayEsp32Drive('${gateway.id}'); return false;"
                    onpointerleave="stopGatewayEsp32Drive('${gateway.id}'); return false;"
                    onpointercancel="stopGatewayEsp32Drive('${gateway.id}'); return false;">← Left</button>
            <button class="esp32-drive-btn esp32-drive-btn-stop"
                    onclick="sendGatewayEsp32Stop('${gateway.id}')">■ Stop</button>
            <button class="esp32-drive-btn"
                    ${esp32DriveApplying ? 'disabled' : ''}
                    onclick="applyGatewayEsp32DriveConfig('${gateway.id}')">${esp32DriveApplying ? 'Applying...' : 'Apply Drive Mapping'}</button>
            <button class="esp32-drive-btn"
                    onclick="runGatewayEsp32DriveCalibration('${gateway.id}')">Calibrate</button>
            <button class="esp32-drive-btn"
                    onclick="runGatewayEsp32TimedDrive('${gateway.id}', 'forward', 2000)">Fwd 2s</button>
            <button class="esp32-drive-btn"
                    onclick="runGatewayEsp32TimedDrive('${gateway.id}', 'left', 1000)">Left 1s</button>
            <button class="esp32-drive-btn"
                    onclick="runGatewayEsp32TimedDrive('${gateway.id}', 'right', 1000)">Right 1s</button>
            <button class="esp32-drive-btn"
                    onclick="runGatewayEsp32WiggleTest('${gateway.id}')">Wiggle</button>
            <button class="esp32-drive-btn"
                    ${esp32DriveDemoRunning ? 'disabled' : ''}
                    onclick="runGatewayEsp32DemoDrive('${gateway.id}')">${esp32DriveDemoRunning ? 'Demo Running...' : 'Run Demo Drive'}</button>
            <button class="esp32-drive-btn"
                    data-esp32-drive-popout="${gateway.id}"
                    onclick="event.stopPropagation();">Popout Drive</button>
            <label style="color:#888; font-size:11px;">AI Agent</label>
            <select onchange="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiAiDriveAgentId', this.value)"
                    style="min-width:220px; padding:4px 8px; background: rgba(255,255,255,0.1); border:1px solid #555; border-radius:4px; color:#fff; font-size: 11px;">
              <option value="">Select deployed agent...</option>
              ${esp32AiAgentOptions}
            </select>
            <label style="color:#888; font-size:11px;">AI Tick(ms)</label>
            <input type="number" min="200" max="2000" value="${esp32AiDriveTickMs}"
                   oninput="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiAiDriveTickMs', this.value)"
                   onchange="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiAiDriveTickMs', this.value)"
                   style="width:86px; padding:4px 8px; background: rgba(255,255,255,0.1); border:1px solid #555; border-radius:4px; color:#fff;">
            <input type="text" value="${escapeBinding(esp32AiDriveObjective)}"
                   oninput="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiAiDriveObjective', this.value)"
                   onchange="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiAiDriveObjective', this.value)"
                   placeholder="AI drive objective..."
                   style="min-width:280px; padding:4px 8px; background: rgba(255,255,255,0.1); border:1px solid #555; border-radius:4px; color:#fff;">
            <button class="esp32-drive-btn"
                    ${(!esp32AiDriveEnabled || esp32AiDriveRunning) ? 'disabled' : ''}
                    onclick="startGatewayEsp32AiDriveSession('${gateway.id}')">${esp32AiDriveBusy ? 'AI Thinking...' : 'Start AI Drive'}</button>
            <button class="esp32-drive-btn esp32-drive-btn-stop"
                    ${esp32AiDriveRunning ? '' : 'disabled'}
                    onclick="stopGatewayEsp32AiDriveSession('${gateway.id}')">Stop AI Drive</button>
            <button class="esp32-drive-btn"
                    onpointerdown="startGatewayEsp32Drive('${gateway.id}', 'right'); return false;"
                    onpointerup="stopGatewayEsp32Drive('${gateway.id}'); return false;"
                    onpointerleave="stopGatewayEsp32Drive('${gateway.id}'); return false;"
                    onpointercancel="stopGatewayEsp32Drive('${gateway.id}'); return false;">Right →</button>
            <button class="esp32-drive-btn"
                    onpointerdown="startGatewayEsp32Drive('${gateway.id}', 'reverse'); return false;"
                    onpointerup="stopGatewayEsp32Drive('${gateway.id}'); return false;"
                    onpointerleave="stopGatewayEsp32Drive('${gateway.id}'); return false;"
                    onpointercancel="stopGatewayEsp32Drive('${gateway.id}'); return false;">↓ Rev</button>
            <span class="esp32-drive-map-chip">Map F:${escapeBinding(esp32MapForward)} L:${escapeBinding(esp32MapLeft)} R:${escapeBinding(esp32MapRight)} Rev:${escapeBinding(esp32MapReverse)}</span>
            <span class="esp32-drive-status ${(esp32DriveActive || esp32DriveApplying) ? 'active' : ''}">
              ${escapeBinding(esp32DriveStatusText)}
              ${esp32DriveApplying ? `<span class="esp32-status-dots" aria-label="Applying drive mapping"><span></span><span></span><span></span></span>` : ''}
            </span>
            <span class="esp32-drive-map-chip">AI Session: ${esp32AiDriveRunning ? 'RUNNING' : 'stopped'}${esp32AiDriveLastDecision ? ` | Last AI: ${escapeBinding(esp32AiDriveLastDecision)}` : ''}</span>
            <span class="esp32-drive-map-chip">Telemetry: ${esp32TelemetryAt ? escapeBinding(esp32TelemetryAt) : 'n/a'} | RSSI ${esp32TelemetryRssi == null ? 'n/a' : `${esp32TelemetryRssi} dBm`} | Cmd ${escapeBinding(esp32TelemetryCmd || 'n/a')} | Age ${esp32TelemetryAge == null ? 'n/a' : `${esp32TelemetryAge}ms`}</span>
          </div>` : ''}
          ${renderEsp32SectionHeader('staticNetwork', 'ESP32 Static Network', esp32StaticExpanded, '#48a678', '#a8ffd2')}
          ${esp32StaticExpanded ? `<div style="display:flex; align-items:center; gap:12px; padding:10px; background: rgba(90,220,160,0.08); border-radius:6px; flex-wrap: wrap;">
            <span style="color:#a8ffd2; font-size:11px;">ESP32 Static Network (for uploaded firmware)</span>
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="checkbox" ${irgEsp32.wifiStaticEnabled === true ? 'checked' : ''} onchange="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiStaticEnabled', this.checked)">
              <span style="color:#ddd; font-size:11px;">Enable Static IP</span>
            </label>
            <label style="color:#888; font-size:11px;">IP</label>
            <input type="text" value="${escapeBinding(String(irgEsp32.wifiStaticIp || ''))}"
                   onchange="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiStaticIp', this.value)"
                   placeholder="172.20.0.15"
                   style="min-width:140px; padding:4px 8px; background: rgba(255,255,255,0.1); border:1px solid #555; border-radius:4px; color:#fff;">
            <label style="color:#888; font-size:11px;">CIDR</label>
            <input type="number" min="0" max="32" value="${Number.isInteger(Number(irgEsp32.wifiStaticCidr)) ? Number(irgEsp32.wifiStaticCidr) : 24}"
                   onchange="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiStaticCidr', this.value)"
                   style="width:75px; padding:4px 8px; background: rgba(255,255,255,0.1); border:1px solid #555; border-radius:4px; color:#fff;">
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="checkbox" ${irgEsp32.wifiStaticGatewayEnabled === true ? 'checked' : ''} onchange="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiStaticGatewayEnabled', this.checked)">
              <span style="color:#ddd; font-size:11px;">Set Gateway Manually</span>
            </label>
            <label style="color:#888; font-size:11px;">Gateway</label>
            <input type="text" value="${escapeBinding(String(irgEsp32.wifiStaticGateway || ''))}"
                   onchange="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiStaticGateway', this.value)"
                   placeholder="172.20.0.1"
                   style="min-width:130px; padding:4px 8px; background: rgba(255,255,255,0.1); border:1px solid #555; border-radius:4px; color:#fff;">
            <span style="color:#666; font-size:11px;">Applied automatically to sketches containing USE_STATIC_IP/STATIC_IP/STATIC_CIDR constants.</span>
          </div>` : ''}
          ${renderEsp32SectionHeader('cameraSidecar', 'ESP32 Camera Sidecar', esp32CameraExpanded, '#7b5ccf', '#d9c8ff')}
          ${esp32CameraExpanded ? `<div style="display:flex; align-items:center; gap:12px; padding:10px; background: rgba(145,120,255,0.10); border-radius:6px; flex-wrap: wrap;">
            <span style="color:#d9c8ff; font-size:11px;">ESP32 Camera (sidecar stream)</span>
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="checkbox" ${esp32CameraEnabled ? 'checked' : ''} onchange="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiCameraEnabled', this.checked)">
              <span style="color:#ddd; font-size:11px;">Enable Camera Sidecar</span>
            </label>
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="checkbox" ${esp32CameraStaEnabled ? 'checked' : ''} onchange="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiCameraStaEnabled', this.checked)">
              <span style="color:#ddd; font-size:11px;">Enable Wi-Fi (STA)</span>
            </label>
            <label style="color:#888; font-size:11px;">SSID</label>
            <input type="text" value="${escapeBinding(esp32CameraSsid)}"
                   onchange="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiCameraSsid', this.value)"
                   placeholder="Camera Wi-Fi SSID"
                   style="min-width:170px; padding:4px 8px; background: rgba(255,255,255,0.1); border:1px solid #555; border-radius:4px; color:#fff;">
            <label style="color:#888; font-size:11px;">Password</label>
            <input type="${esp32PasswordVisible ? 'text' : 'password'}" value="${escapeBinding(esp32CameraPassword)}"
                   onchange="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiCameraPassword', this.value)"
                   placeholder="Camera Wi-Fi password"
                   style="min-width:170px; padding:4px 8px; background: rgba(255,255,255,0.1); border:1px solid #555; border-radius:4px; color:#fff;">
            <button class="esp32-drive-btn"
                    onclick="toggleGatewayEsp32PasswordMask('${gateway.id}')">${esp32PasswordVisible ? 'Hide' : 'Show'}</button>
            <label style="color:#888; font-size:11px;">Host</label>
            <input type="text" value="${escapeBinding(esp32CameraHost)}"
                   onchange="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiCameraHost', this.value)"
                   placeholder="172.20.0.16"
                   style="min-width:150px; padding:4px 8px; background: rgba(255,255,255,0.1); border:1px solid #555; border-radius:4px; color:#fff;">
            <label style="color:#888; font-size:11px;">Port</label>
            <input type="number" min="1" max="65535" value="${esp32CameraPort}"
                   onchange="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiCameraPort', this.value)"
                   style="width:80px; padding:4px 8px; background: rgba(255,255,255,0.1); border:1px solid #555; border-radius:4px; color:#fff;">
            <label style="color:#888; font-size:11px;">Stream Path</label>
            <input type="text" value="${escapeBinding(esp32CameraStreamPath)}"
                   onchange="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiCameraStreamPath', this.value)"
                   placeholder="/stream"
                   style="min-width:110px; padding:4px 8px; background: rgba(255,255,255,0.1); border:1px solid #555; border-radius:4px; color:#fff;">
            <label style="color:#888; font-size:11px;">Snapshot Path</label>
            <input type="text" value="${escapeBinding(esp32CameraSnapshotPath)}"
                   onchange="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiCameraSnapshotPath', this.value)"
                   placeholder="/capture"
                   style="min-width:120px; padding:4px 8px; background: rgba(255,255,255,0.1); border:1px solid #555; border-radius:4px; color:#fff;">
            <label style="color:#888; font-size:11px;">Health Path</label>
            <input type="text" value="${escapeBinding(esp32CameraHealthPath)}"
                   onchange="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiCameraFlashStatusPath', this.value)"
                   placeholder="/health"
                   style="min-width:100px; padding:4px 8px; background: rgba(255,255,255,0.1); border:1px solid #555; border-radius:4px; color:#fff;">
            <label style="color:#888; font-size:11px;">Board</label>
            <select onchange="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiCameraBoardProfile', this.value)"
                    style="min-width:200px; padding:4px 8px; background: rgba(255,255,255,0.1); border:1px solid #555; border-radius:4px; color:#fff; font-size: 11px;">
              <option value="ai-thinker-esp32cam" ${esp32CameraBoardProfile === 'ai-thinker-esp32cam' ? 'selected' : ''}>AI Thinker ESP32-CAM</option>
              <option value="elegoo-esp32s3-camera-v1" ${esp32CameraBoardProfile === 'elegoo-esp32s3-camera-v1' ? 'selected' : ''}>Elegoo ESP32S3-Camera V1.0</option>
            </select>
            <label style="color:#888; font-size:11px;">FQBN</label>
            <input type="text" value="${escapeBinding(esp32CameraFqbn)}"
                   onchange="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiCameraFqbn', this.value)"
                   placeholder="esp32:esp32:esp32cam"
                   style="min-width:180px; padding:4px 8px; background: rgba(255,255,255,0.1); border:1px solid #555; border-radius:4px; color:#fff;">
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="checkbox" ${esp32CameraUsbCdcOnBoot ? 'checked' : ''} onchange="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiCameraUsbCdcOnBoot', this.checked)">
              <span style="color:#ddd; font-size:11px;">USB CDC on Boot</span>
            </label>
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="checkbox" ${esp32CameraCaptureRuntimeSerial ? 'checked' : ''} onchange="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiCameraCaptureRuntimeSerial', this.checked)">
              <span style="color:#ddd; font-size:11px;">Capture USB runtime logs</span>
            </label>
            <label style="color:#888; font-size:11px;">Capture(ms)</label>
            <input type="number" min="0" max="120000" value="${esp32CameraRuntimeSerialCaptureMs}"
                   onchange="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiCameraRuntimeSerialCaptureMs', this.value)"
                   style="width:100px; padding:4px 8px; background: rgba(255,255,255,0.1); border:1px solid #555; border-radius:4px; color:#fff;">
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="checkbox" ${esp32CameraStaticEnabled ? 'checked' : ''} onchange="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiCameraStaticEnabled', this.checked)">
              <span style="color:#ddd; font-size:11px;">Camera Static IP</span>
            </label>
            <label style="color:#888; font-size:11px;">IP</label>
            <input type="text" value="${escapeBinding(esp32CameraStaticIp)}"
                   onchange="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiCameraStaticIp', this.value)"
                   placeholder="172.20.0.16"
                   style="min-width:130px; padding:4px 8px; background: rgba(255,255,255,0.1); border:1px solid #555; border-radius:4px; color:#fff;">
            <label style="color:#888; font-size:11px;">CIDR</label>
            <input type="number" min="0" max="32" value="${esp32CameraStaticCidr}"
                   onchange="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiCameraStaticCidr', this.value)"
                   style="width:75px; padding:4px 8px; background: rgba(255,255,255,0.1); border:1px solid #555; border-radius:4px; color:#fff;">
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="checkbox" ${esp32CameraStaticGatewayEnabled ? 'checked' : ''} onchange="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiCameraStaticGatewayEnabled', this.checked)">
              <span style="color:#ddd; font-size:11px;">GW</span>
            </label>
            <input type="text" value="${escapeBinding(esp32CameraStaticGateway)}"
                   onchange="updateGatewayIrgEsp32Config('${gateway.id}', 'wifiCameraStaticGateway', this.value)"
                   placeholder="172.20.0.1"
                   style="min-width:120px; padding:4px 8px; background: rgba(255,255,255,0.1); border:1px solid #555; border-radius:4px; color:#fff;">
            <button class="esp32-drive-btn"
                    ${!esp32CameraEnabled ? 'disabled' : ''}
                    onclick="flashGatewayEsp32CameraFirmware('${gateway.id}')">${esp32FlashBusy ? 'Flashing Camera...' : 'Flash Camera Firmware'}</button>
            <button class="esp32-drive-btn"
                    onclick="showGatewayEsp32CameraSketch('${gateway.id}')">Show Sketch</button>
            <button class="esp32-drive-btn"
                    ${!esp32CameraEnabled ? 'disabled' : ''}
                    onclick="probeGatewayEsp32Camera('${gateway.id}')">${esp32CameraBusy ? 'Probing...' : 'Probe Camera'}</button>
            <button class="esp32-drive-btn"
                    ${!esp32CameraEnabled ? 'disabled' : ''}
                    onclick="openGatewayEsp32CameraWindow('${gateway.id}', 'stream')">Open Stream Window</button>
            <button class="esp32-drive-btn"
                    ${!esp32CameraEnabled ? 'disabled' : ''}
                    onclick="openGatewayEsp32CameraWindow('${gateway.id}', 'snapshot')">Open Snapshot</button>
            <span class="esp32-drive-map-chip">
              Camera: ${esp32CameraError ? `ERROR ${escapeBinding(esp32CameraError)}` : (esp32CameraMessage ? escapeBinding(esp32CameraMessage) : (esp32CameraLastOkAt ? `OK ${escapeBinding(esp32CameraLastOkAt)}` : 'idle'))}
              ${esp32CameraAnimating ? `<span class="esp32-status-dots" aria-label="Camera operation in progress"><span></span><span></span><span></span></span>` : ''}
            </span>
            ${esp32CameraLastUrl ? `<span class="esp32-drive-map-chip">Last URL: ${escapeBinding(esp32CameraLastUrl)}</span>` : ''}
          </div>` : ''}
          <div style="color:#666; font-size:11px;">
            Live mode uses serial upload/exec tools over the gateway serial source (<code>mpremote</code> for Pico, <code>arduino-cli</code> for ESP32). Keep Serial enabled with a valid port (or Auto Detect).
          </div>
        </div>
      </div>
    </div>
  `;
}


window.renderGatewayRow = renderGatewayRow;
window.renderGatewayDetails = renderGatewayDetails;
