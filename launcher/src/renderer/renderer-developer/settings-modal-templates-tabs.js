/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * Settings Modal template helpers (speech/hardware/mods/system/about tabs)
 * Extracted from settings-modal-templates.js (structural split only).
 */

function getSpeechTabHTML() {
  return `
    <div class="settings-section">
      <h3>Speech-to-Text / Text-to-Speech</h3>
      <p class="settings-description">
        Global speech settings shared across PSF Terminal, PSF Coding Terminal, and PSF Relay Pipeline Chat.
      </p>

      <div style="display:flex; gap:14px; align-items:center; flex-wrap:wrap; margin-bottom: 12px;">
        <label style="display:inline-flex; align-items:center; gap:8px; color:#ddd; font-size:12px;">
          <input id="settings-voice-stt-enabled" type="checkbox">
          <span>STT ON</span>
        </label>
        <label style="display:inline-flex; align-items:center; gap:8px; color:#ddd; font-size:12px;">
          <input id="settings-voice-tts-enabled" type="checkbox">
          <span>TTS ON</span>
        </label>
        <span id="settings-voice-state" style="color:#888; font-size:12px;"></span>
      </div>
      <h4 style="margin:8px 0 8px 0; color:#ddd;">Per-Window Overrides</h4>
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:10px; margin-bottom:12px;">
        <div style="border:1px solid #2a2a2a; border-radius:8px; padding:8px; background:rgba(255,255,255,0.03);">
          <div style="color:#ddd; font-size:12px; margin-bottom:6px;">PSF Terminal</div>
          <label style="display:inline-flex; align-items:center; gap:6px; color:#bbb; font-size:12px; margin-right:10px;">
            <input id="settings-voice-surface-terminal-stt" type="checkbox">
            <span>STT</span>
          </label>
          <label style="display:inline-flex; align-items:center; gap:6px; color:#bbb; font-size:12px;">
            <input id="settings-voice-surface-terminal-tts" type="checkbox">
            <span>TTS</span>
          </label>
        </div>
        <div style="border:1px solid #2a2a2a; border-radius:8px; padding:8px; background:rgba(255,255,255,0.03);">
          <div style="color:#ddd; font-size:12px; margin-bottom:6px;">Coding Terminal</div>
          <label style="display:inline-flex; align-items:center; gap:6px; color:#bbb; font-size:12px; margin-right:10px;">
            <input id="settings-voice-surface-coding-stt" type="checkbox">
            <span>STT</span>
          </label>
          <label style="display:inline-flex; align-items:center; gap:6px; color:#bbb; font-size:12px;">
            <input id="settings-voice-surface-coding-tts" type="checkbox">
            <span>TTS</span>
          </label>
        </div>
        <div style="border:1px solid #2a2a2a; border-radius:8px; padding:8px; background:rgba(255,255,255,0.03);">
          <div style="color:#ddd; font-size:12px; margin-bottom:6px;">Relay Pipeline Chat</div>
          <label style="display:inline-flex; align-items:center; gap:6px; color:#bbb; font-size:12px; margin-right:10px;">
            <input id="settings-voice-surface-relay-stt" type="checkbox">
            <span>STT</span>
          </label>
          <label style="display:inline-flex; align-items:center; gap:6px; color:#bbb; font-size:12px;">
            <input id="settings-voice-surface-relay-tts" type="checkbox">
            <span>TTS</span>
          </label>
        </div>
      </div>

      <h4 style="margin:12px 0 8px 0; color:#ddd;">Speech-to-Text (Input)</h4>
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
        <div>
          <label style="color:#aaa; font-size:12px;">STT Model</label>
          <select id="settings-voice-stt-model" class="settings-input"></select>
        </div>
        <div>
          <label style="color:#aaa; font-size:12px;">Local STT Endpoint (optional)</label>
          <input id="settings-voice-stt-endpoint" class="settings-input" placeholder="Leave blank to use built-in Local Transformers STT" />
        </div>
      </div>

      <h4 style="margin:16px 0 8px 0; color:#ddd;">Text-to-Speech (Output)</h4>
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
        <div>
          <label style="color:#aaa; font-size:12px;">TTS Runtime (Local)</label>
          <select id="settings-voice-tts-provider" class="settings-input">
            <option value="local-transformers">Built-in Local Transformers</option>
            <option value="huggingface">Custom Local TTS Endpoint</option>
          </select>
        </div>
        <div>
          <label style="color:#aaa; font-size:12px;">Local TTS Model</label>
          <select id="settings-voice-tts-model" class="settings-input"></select>
        </div>
      </div>
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:10px;">
        <div>
          <label style="color:#aaa; font-size:12px;">Local TTS Endpoint (Custom)</label>
          <input id="settings-voice-tts-endpoint" class="settings-input" placeholder="http://127.0.0.1:8001/tts" />
        </div>
        <div>
          <label style="color:#aaa; font-size:12px;">Built-in TTS Model</label>
          <select id="settings-voice-local-model" class="settings-input"></select>
        </div>
      </div>
      <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px; margin-top:10px;">
        <div>
          <div style="display:flex; align-items:center; gap:6px;">
            <label style="color:#aaa; font-size:12px;">Local TTS Device</label>
            <button
              type="button"
              onclick="SettingsModal.showTtsDeviceHelp()"
              title="What are cpu / cuda / mps?"
              style="width:18px; height:18px; line-height:16px; border-radius:50%; border:1px solid #4a4a4a; background:rgba(255,255,255,0.06); color:#ddd; font-size:12px; cursor:pointer; padding:0;"
            >?</button>
          </div>
          <select id="settings-voice-local-device" class="settings-input">
            <option value="cpu">cpu</option>
            <option value="cuda">cuda</option>
            <option value="mps">mps</option>
          </select>
        </div>
        <div>
          <label style="color:#aaa; font-size:12px;">Local TTS dtype</label>
          <select id="settings-voice-local-dtype" class="settings-input">
            <option value="auto">auto</option>
            <option value="float16">float16</option>
            <option value="float32">float32</option>
            <option value="bfloat16">bfloat16</option>
          </select>
        </div>
        <div>
          <label style="color:#aaa; font-size:12px;">Local TTS Python Bin (optional)</label>
          <input id="settings-voice-local-python" class="settings-input" placeholder="python3" />
        </div>
      </div>
      <div style="margin-top:6px; color:#888; font-size:11px;">
        Recommendation: Use <code>cuda</code> when a GPU has free VRAM. Use <code>cpu</code> on low VRAM systems or when chat model already saturates GPU.
      </div>
      <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px; margin-top:10px;">
        <div>
          <label style="color:#aaa; font-size:12px;">VITS Speaking Rate</label>
          <input id="settings-voice-local-speaking-rate" class="settings-input" type="number" min="0.5" max="2.0" step="0.05" placeholder="1.0" />
        </div>
        <div>
          <label style="color:#aaa; font-size:12px;">VITS Noise Scale</label>
          <input id="settings-voice-local-noise-scale" class="settings-input" type="number" min="0.1" max="2.0" step="0.01" placeholder="0.667" />
        </div>
        <div>
          <label style="color:#aaa; font-size:12px;">VITS Noise Duration</label>
          <input id="settings-voice-local-noise-duration" class="settings-input" type="number" min="0.1" max="2.0" step="0.01" placeholder="0.8" />
        </div>
      </div>
      <div style="margin-top:6px; color:#888; font-size:11px;">
        Recommendation (VITS): Speaking Rate <code>0.95-1.10</code>, Noise Scale <code>0.55-0.80</code>, Noise Duration <code>0.60-0.90</code>.
      </div>
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:10px;">
        <div>
          <label style="color:#aaa; font-size:12px;">Chatterbox CFG Weight</label>
          <input id="settings-voice-local-chatterbox-cfg" class="settings-input" type="number" min="0.0" max="1.5" step="0.05" placeholder="0.5" />
        </div>
        <div>
          <label style="color:#aaa; font-size:12px;">Chatterbox Exaggeration</label>
          <input id="settings-voice-local-chatterbox-exaggeration" class="settings-input" type="number" min="0.0" max="1.5" step="0.05" placeholder="0.5" />
        </div>
      </div>
      <div style="margin-top:6px; color:#888; font-size:11px;">
        Recommendation (Chatterbox): CFG <code>0.3-0.8</code>, Exaggeration <code>0.2-0.7</code>. Start low for stability.
      </div>
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:10px;">
        <div>
          <label style="color:#aaa; font-size:12px;">Terminal TTS Chunk Size</label>
          <input id="settings-voice-terminal-chunk-chars" class="settings-input" type="number" min="80" max="2000" step="20" placeholder="360" />
        </div>
        <div>
          <label style="color:#aaa; font-size:12px;">Terminal TTS Timeout (sec)</label>
          <input id="settings-voice-terminal-timeout-sec" class="settings-input" type="number" min="30" max="1800" step="10" placeholder="180" />
        </div>
      </div>
      <div style="margin-top:8px;">
        <label style="display:inline-flex; align-items:center; gap:8px; color:#ddd; font-size:12px;">
          <input id="settings-voice-terminal-debug-trace" type="checkbox">
          <span>Terminal TTS Debug Trace</span>
        </label>
      </div>
      <div style="margin-top:6px; color:#888; font-size:11px;">
        Recommendation: Low-end GPUs <code>chunk 220-380</code>, <code>timeout 180-360s</code>. High-end servers <code>chunk 500-900</code>, <code>timeout 90-180s</code>.
      </div>

      <div style="margin-top: 14px; display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <button class="btn-primary" onclick="SettingsModal.saveSpeechSettings()">Save Speech Settings</button>
        <button class="btn-secondary" onclick="SettingsModal.testSpeechInput()">Test STT</button>
        <button class="btn-secondary" onclick="SettingsModal.testSpeechOutput()">Test TTS</button>
        <span id="settings-speech-status" style="color:#888; font-size:12px;"></span>
      </div>
    </div>
  `;
}

function getHardwareTabHTML() {
  return `
    <div class="settings-section">
      <h3>Hardware</h3>
      <p class="settings-description">
        Global hardware selection shared across PSF Terminal, PSF Coding Terminal, and PSF Relay Pipeline Chat.
      </p>

      <h4 style="margin:12px 0 8px 0; color:#ddd;">Microphone Input</h4>
      <div style="display:grid; grid-template-columns: 1fr auto auto; gap:10px; align-items:center;">
        <div>
          <label style="color:#aaa; font-size:12px;">Input Device</label>
          <div style="margin:6px 0 8px;">
            <label style="display:inline-flex; align-items:center; gap:8px; color:#bfc9d4; font-size:12px; cursor:pointer;">
              <input id="settings-hardware-use-default-mic" type="checkbox" checked onchange="SettingsModal.toggleHardwareMicDefault(this.checked)">
              <span>Use system default microphone</span>
            </label>
          </div>
          <select id="settings-hardware-mic-device" class="settings-input">
            <option value="" selected>System Default Microphone</option>
          </select>
        </div>
        <button class="btn-secondary" style="height:38px; margin:24px 0 0 0; display:inline-flex; align-items:center; justify-content:center; line-height:1; padding:0 16px; box-sizing:border-box; box-shadow:none;" onclick="SettingsModal.refreshHardwareMicrophones()">Refresh</button>
        <button class="btn-primary" style="height:38px; margin:24px 0 0 0; display:inline-flex; align-items:center; justify-content:center; line-height:1; padding:0 16px; box-sizing:border-box; box-shadow:none; border:1px solid transparent;" onclick="SettingsModal.saveHardwareSettings()">Apply</button>
      </div>
      <div style="display:flex; gap:10px; align-items:center; margin-top:10px;">
        <button id="settings-hardware-mic-test-btn" class="btn-secondary" onclick="SettingsModal.testHardwareMicrophone()">Test Mic</button>
        <div style="flex:1; min-width:180px;">
          <div style="color:#aaa; font-size:12px; margin-bottom:4px;">Input Level</div>
          <div style="height:12px; border:1px solid #444; border-radius:10px; background:#1a1a1a; overflow:hidden;">
            <div id="settings-hardware-mic-vu-fill" style="height:100%; width:0%; background:linear-gradient(90deg,#00c853,#ffd600,#ff3d00); transition:width 60ms linear;"></div>
          </div>
        </div>
      </div>
      <div style="margin-top:6px; color:#888; font-size:11px;">
        The selected device is used for STT voice capture globally.
      </div>
      <div style="margin-top:10px;">
        <span id="settings-hardware-status" style="color:#888; font-size:12px;"></span>
      </div>
    </div>
  `;
}

function getModsTabHTML() {
  return `
    <div class="settings-section">
      <h3>Mods</h3>
      <p class="settings-description">
        Install and manage local mod directories.
      </p>

      <div style="display:grid; grid-template-columns: 1fr auto auto auto; gap:10px; align-items:end;">
        <div>
          <label style="color:#aaa; font-size:12px;">Mod Source Directory</label>
          <input id="settings-mods-source-dir" class="settings-input" placeholder="/path/to/mod-folder" />
        </div>
        <button class="btn-secondary" onclick="SettingsModal.pickModsSourceDirectory()">Browse...</button>
        <button class="btn-primary" onclick="SettingsModal.installModDirectory()">Install</button>
        <button class="btn-secondary" onclick="SettingsModal.refreshModsList()">Refresh</button>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr auto auto; gap:10px; align-items:end; margin-top:12px;">
        <div>
          <label style="color:#aaa; font-size:12px;">Signer Key ID</label>
          <input id="settings-mods-key-id" class="settings-input" value="ed25519:local-dev-signer" />
        </div>
        <div>
          <label style="color:#aaa; font-size:12px;">Private Key File</label>
          <input id="settings-mods-private-key-path" class="settings-input" placeholder="/path/to/private.pem" />
        </div>
        <button class="btn-secondary" onclick="SettingsModal.pickModsPrivateKeyFile()">Browse Key...</button>
        <button class="btn-secondary" onclick="SettingsModal.signModDirectory()">Sign + Approve</button>
      </div>
      <div style="display:flex; gap:10px; margin-top:10px;">
        <button class="btn-secondary" onclick="SettingsModal.createModsKeypair()">Create Keypair</button>
        <button class="btn-secondary" onclick="SettingsModal.refreshTrustedModKeys()">Refresh Trusted Keys</button>
      </div>
      <div id="settings-mods-trusted-keys" style="margin-top:8px; color:#999; font-size:11px; max-height:100px; overflow:auto; border:1px solid #2a2a2a; padding:8px; border-radius:6px; background:#0f0f0f;"></div>

      <div style="display:grid; grid-template-columns: 1fr auto auto auto; gap:10px; align-items:end; margin-top:12px;">
        <div>
          <label style="color:#aaa; font-size:12px;">Selected Mod ID</label>
          <input id="settings-mods-selected-id" class="settings-input" placeholder="com.example.mod" />
        </div>
        <button class="btn-secondary" onclick="SettingsModal.enableSelectedMod()">Enable</button>
        <button class="btn-secondary" onclick="SettingsModal.disableSelectedMod()">Disable</button>
        <button class="btn-secondary" onclick="SettingsModal.removeSelectedMod()">Remove</button>
      </div>
      <div style="display:flex; gap:10px; margin-top:10px;">
        <button class="btn-secondary" onclick="SettingsModal.attestSelectedMod()">Attest Selected</button>
        <button class="btn-secondary" onclick="SettingsModal.attestVoiceAbsence()">Attest Voice Absence</button>
      </div>

      <div id="settings-mods-status" style="margin-top:10px; color:#888; font-size:12px;"></div>

      <div id="settings-mods-list" style="margin-top:12px; border:1px solid #333; border-radius:8px; padding:10px; max-height:300px; overflow:auto; background:#111;"></div>
    </div>
  `;
}

function getSystemInfoTabHTML() {
  return `
    <div class="settings-section">
      <h3>System Information</h3>
      <p class="settings-description">
        Hardware detected on this system for AI model compatibility.
      </p>
      
      <div class="system-info-grid">
        <div class="system-info-card">
          <h4 style="font-size: 105%;">
            <svg width="21" height="21" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" style="vertical-align:-4px; margin-right:7px;">
              <rect x="2.5" y="4" width="11" height="8" rx="1.5"></rect>
              <path d="M5 6.5h6M5 9h4"></path>
            </svg>
            Memory
          </h4>
          <div class="value" id="settings-ram-info">--</div>
        </div>
        <div class="system-info-card">
          <h4 style="font-size: 105%;">
            <svg width="21" height="21" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" style="vertical-align:-4px; margin-right:7px;">
              <rect x="4.3" y="4.3" width="7.4" height="7.4" rx="1.4"></rect>
              <path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.1 3.1l1.1 1.1M11.8 11.8l1.1 1.1M12.9 3.1l-1.1 1.1M4.2 11.8l-1.1 1.1"></path>
            </svg>
            CPU
          </h4>
          <div class="value" id="settings-cpu-info">--</div>
        </div>
        <div class="system-info-card">
          <h4 style="font-size: 105%;">
            <svg width="21" height="21" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" style="vertical-align:-4px; margin-right:7px;">
              <rect x="2.3" y="3.2" width="11.4" height="7.8" rx="1.4"></rect>
              <circle cx="6" cy="7.1" r="1.2"></circle>
              <path d="M9 6.2h2.8M9 8h2"></path>
              <path d="M6 11v1.8M10 11v1.8"></path>
            </svg>
            GPU
          </h4>
          <div class="value" id="settings-gpu-info">--</div>
        </div>
      </div>
      
      <div id="settings-gpu-details" style="background: rgba(0,0,0,0.2); padding: 15px; border-radius: 8px; margin-top: 15px;">
        <div style="color: #888; font-size: 12px;">Loading GPU details...</div>
      </div>
      
      <div style="margin-top: 15px; display: flex; gap: 10px; align-items: center;">
        <button class="btn-secondary" onclick="SettingsModal.refreshSystemInfo()" style="font-size: 105%;">
          <svg width="19.5" height="19.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true" style="vertical-align:-4px; margin-right:7px;">
            <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9"></path>
            <path d="M13.5 3.5v3.2h-3.2"></path>
          </svg>
          Refresh
        </button>
        <button id="gpu-monitor-toggle-btn" class="btn-secondary" onclick="SettingsModal.toggleGpuMonitor()" style="min-width: 140px; font-size: 105%;">
          <svg width="19.5" height="19.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true" style="vertical-align:-4px; margin-right:7px;">
            <path d="M2.5 12.5h11"></path>
            <path d="M4.5 11V8.2M8 11V5.5M11.5 11V7"></path>
          </svg>
          Live Monitor
        </button>
        <span id="gpu-monitor-status" style="color: #888; font-size: 12px; margin-left: 10px;"></span>
      </div>
      <p style="color: #666; font-size: 11px; margin-top: 8px;">
        Live Monitor displays real-time GPU stats at the bottom of all screens (All platforms: NVIDIA, AMD, Apple Silicon, ARM SBCs)
      </p>

      <div style="margin-top: 18px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.08);">
        <h4 style="margin: 0 0 8px 0; color: #ddd;">Security & Edition Status (Stub)</h4>
        <p style="color: #888; font-size: 12px; margin: 0 0 8px 0;">
          Read-only diagnostic status. Edition policy can evolve; this section reflects current runtime wiring.
        </p>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 8px 14px; font-size: 12px; margin-bottom: 10px;">
          <div><span style="color:#888;">Edition:</span> <span id="settings-security-edition" style="color:#fff;">--</span></div>
          <div><span style="color:#888;">Security Model:</span> <span id="settings-security-model" style="color:#fff;">--</span></div>
          <div><span style="color:#888;">Security Mode:</span> <span id="settings-security-mode" style="color:#fff;">--</span></div>
          <div><span style="color:#888;">Cluster Join:</span> <span id="settings-security-cluster" style="color:#fff;">--</span></div>
        </div>
      </div>

      <div style="margin-top: 18px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.08);">
        <h4 style="margin: 0 0 8px 0; color: #ddd;">Service Network Policy</h4>
        <p style="color: #888; font-size: 12px; margin: 0 0 8px 0;">
          Controls outbound network posture for Open WebUI and AnythingLLM child processes.
        </p>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <select id="settings-network-policy" class="settings-input" style="max-width: 320px;">
            <option value="privacy">Privacy (disable telemetry)</option>
            <option value="strict-offline">Strict Offline (block outbound HTTP/HTTPS)</option>
            <option value="allow">Allow Internet (no hardening env)</option>
          </select>
          <button class="btn-secondary" onclick="SettingsModal.saveServiceNetworkPolicy()">Save Policy</button>
          <span id="settings-network-policy-status" style="color:#888; font-size:12px;"></span>
        </div>
      </div>

      <div style="margin-top: 18px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.08);">
        <h4 style="margin: 0 0 8px 0; color: #ddd;">Relay Ingress Exposure</h4>
        <p style="color: #888; font-size: 12px; margin: 0 0 8px 0;">
          Controls how the Relay pipeline ingress port is bound. Use LAN only when you need external clients.
        </p>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <select id="settings-relay-ingress-bind" class="settings-input" style="max-width: 320px;">
            <option value="localhost">Localhost only (127.0.0.1)</option>
            <option value="lan">LAN exposed (0.0.0.0)</option>
          </select>
          <button class="btn-secondary" onclick="SettingsModal.saveRelayIngressBind()">Save Exposure</button>
          <span id="settings-relay-ingress-bind-status" style="color:#888; font-size:12px;"></span>
        </div>
      </div>

      <div style="margin-top: 18px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.08);">
        <h4 style="margin: 0 0 8px 0; color: #ddd;">Terminal Session Memory</h4>
        <p style="color: #888; font-size: 12px; margin: 0 0 8px 0;">
          Enables prompt/command history recall with Up/Down arrow across PSF Terminal, Coding Terminal, and MoE/IRG chat terminals.
        </p>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <label style="display:inline-flex; align-items:center; gap:8px; color:#ddd; font-size:12px;">
            <input id="settings-session-memory-enabled" type="checkbox">
            <span>Enable terminal session memory</span>
          </label>
          <button class="btn-secondary" onclick="SettingsModal.saveSessionMemorySettings()">Save</button>
          <button class="btn-secondary" onclick="SettingsModal.clearSessionMemoryHistory()">Clear History</button>
          <span id="settings-session-memory-status" style="color:#888; font-size:12px;"></span>
        </div>
      </div>

      <div style="margin-top: 18px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.08);">
        <h4 style="margin: 0 0 8px 0; color: #ddd;">Interface Motion</h4>
        <p style="color: #888; font-size: 12px; margin: 0 0 8px 0;">
          Enables launcher UI animations (header reveal, menu card transitions, glow effects).
        </p>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <label style="display:inline-flex; align-items:center; gap:8px; color:#ddd; font-size:12px;">
            <input id="settings-animations-enabled" type="checkbox">
            <span>Animation on/off</span>
          </label>
          <button class="btn-secondary" onclick="SettingsModal.saveAnimationSettings()">Save</button>
          <span id="settings-animations-status" style="color:#888; font-size:12px;"></span>
        </div>
      </div>

      <div style="margin-top: 18px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.08);">
        <h4 style="margin: 0 0 8px 0; color: #ddd;">Gateway UI Defaults</h4>
        <p style="color: #888; font-size: 12px; margin: 0 0 8px 0;">
          Controls default expansion state for ESP32 groups inside User Gateway cards.
        </p>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <label style="display:inline-flex; align-items:center; gap:8px; color:#ddd; font-size:12px;">
            <input id="settings-gateway-esp32-sections-collapsed" type="checkbox">
            <span>Collapse ESP32 gateway sections by default</span>
          </label>
          <button class="btn-secondary" onclick="SettingsModal.saveGatewayUiDefaultsSettings()">Save</button>
          <span id="settings-gateway-ui-defaults-status" style="color:#888; font-size:12px;"></span>
        </div>
      </div>

      <div style="margin-top: 18px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.08);">
        <h4 style="margin: 0 0 8px 0; color: #ddd;">Compliance Proof Badge Visibility</h4>
        <p style="color: #888; font-size: 12px; margin: 0 0 8px 0;">
          Controls whether the compliance proof badge is shown in launcher footer and About views.
        </p>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <label style="display:inline-flex; align-items:center; gap:8px; color:#ddd; font-size:12px;">
            <input id="settings-show-main-proof-badge" type="checkbox">
            <span>Show proof badge on main screen footer</span>
          </label>
          <label style="display:inline-flex; align-items:center; gap:8px; color:#ddd; font-size:12px;">
            <input id="settings-show-about-proof-badge" type="checkbox">
            <span>Show proof badge in About sections</span>
          </label>
          <button class="btn-secondary" onclick="SettingsModal.saveComplianceProofBadgeVisibility()">Save</button>
          <span id="settings-compliance-proof-badge-status" style="color:#888; font-size:12px;"></span>
        </div>
      </div>

      <div style="margin-top: 18px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.08);">
        <h4 style="margin: 0 0 8px 0; color: #ddd;">Compliance Evidence Manager</h4>
        <p style="color: #888; font-size: 12px; margin: 0 0 8px 0;">
          Edit evidence metadata, trust signer keys, and sign evidence in-app. COMPLIANT requires verified trusted signature.
        </p>
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:8px;">
          <input id="settings-compliance-standard" class="settings-input" placeholder="Standard (e.g. DODI-8500.01)">
          <input id="settings-compliance-baseline" class="settings-input" placeholder="Baseline (e.g. RMF-IL5)">
          <input id="settings-compliance-profile" class="settings-input" placeholder="Profile (e.g. PROFILED)">
          <input id="settings-compliance-evidence-id" class="settings-input" placeholder="Evidence ID">
          <input id="settings-compliance-assessor" class="settings-input" placeholder="Assessor">
          <input id="settings-compliance-assessment-date" class="settings-input" placeholder="Assessment Date (YYYY-MM-DD)">
          <input id="settings-compliance-expires-on" class="settings-input" placeholder="Expires On (YYYY-MM-DD)">
          <input id="settings-compliance-attestation" class="settings-input" placeholder="Attestation (UNVERIFIED/PROFILED/COMPLIANT)">
        </div>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:8px;">
          <button class="btn-secondary" onclick="SettingsModal.loadComplianceEvidenceManager()">Reload Evidence</button>
          <button class="btn-secondary" onclick="SettingsModal.saveComplianceEvidenceManager()">Save Evidence</button>
          <span id="settings-compliance-evidence-status" style="color:#888; font-size:12px;"></span>
        </div>

        <div style="margin-top:10px; padding-top:10px; border-top:1px dashed rgba(255,255,255,0.12);">
          <h5 style="margin:0 0 6px 0; color:#ddd;">Trusted Signer Keys</h5>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <input id="settings-compliance-key-id" class="settings-input" placeholder="Key ID (e.g. ed25519:compliance-signer)" style="min-width:260px;">
            <button class="btn-secondary" onclick="SettingsModal.removeComplianceTrustedKey()">Remove Key</button>
          </div>
          <textarea id="settings-compliance-public-key-pem" class="settings-input" rows="4" style="margin-top:8px; width:100%; resize:vertical;" placeholder="Public key PEM"></textarea>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:8px;">
            <button class="btn-secondary" onclick="SettingsModal.addComplianceTrustedKey()">Add/Update Trusted Key</button>
            <span id="settings-compliance-key-status" style="color:#888; font-size:12px;"></span>
          </div>
          <div id="settings-compliance-trusted-keys" style="margin-top:8px; color:#888; font-size:12px;">Trusted keys: --</div>
        </div>

        <div style="margin-top:10px; padding-top:10px; border-top:1px dashed rgba(255,255,255,0.12);">
          <h5 style="margin:0 0 6px 0; color:#ddd;">Sign Evidence</h5>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <input id="settings-compliance-private-key-path" class="settings-input" placeholder="Private key path (.pem)" style="min-width:320px;">
            <button class="btn-secondary" onclick="SettingsModal.pickCompliancePrivateKeyPath()">Browse...</button>
          </div>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:8px;">
            <input id="settings-compliance-public-key-path" class="settings-input" placeholder="Public key path (.pem) optional" style="min-width:320px;">
            <button class="btn-secondary" onclick="SettingsModal.pickCompliancePublicKeyPath()">Browse...</button>
            <label style="display:inline-flex; align-items:center; gap:6px; color:#ddd; font-size:12px;">
              <input id="settings-compliance-approve-key" type="checkbox" checked>
              <span>Trust key after signing</span>
            </label>
          </div>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:8px;">
            <button class="btn-secondary" onclick="SettingsModal.signComplianceEvidence()">Sign Evidence</button>
            <span id="settings-compliance-sign-status" style="color:#888; font-size:12px;"></span>
          </div>
        </div>
      </div>
    </div>
  `;
}
