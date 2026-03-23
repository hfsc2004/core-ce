/**
 *
 * @version 1.1.2 - March 5, 2026
 * @copyright 2026 Pseudo SF
 */
/**
 * Injects heavy screen markup for Binary Manager and Compile Product.
 * Split from index-developer.html to keep the shell file maintainable.
 */
(function(){
  'use strict';
  const HEAVY_SCREENS_HTML = `<div id="binary-manager" class="screen">
        <div class="screen-header" style="background:#0f1a27; border-bottom:1px solid rgba(88,166,255,0.08); display:flex; align-items:flex-start; gap:14px; position:sticky; top:0; z-index:45; margin-left:-40px; margin-right:-40px; padding:10px 0 8px;">
          <button class="btn-back" onclick="showScreen('model-browser')" style="color:#e6edf3; border-color:rgba(139,148,158,0.35); font-size:18px; padding:9px 18px; display:flex; align-items:center; gap:8px; margin-left:24px;">
            <span style="font-size:27px; line-height:1;">←</span>
            <span>Back</span>
          </button>
          <div style="flex:1 1 auto; min-width:0;"></div>
          <h2 style="display:none;">Binary Manager</h2>
        </div>
        
        <div class="binary-manager-content">
          <div class="info-card" style="max-width: 1000px; margin: 20px auto;">
            <h3>Download Binaries</h3>
            <p style="color: #aaa; margin: 15px 0;">
              Download standalone binaries for Ollama, OpenWebUI, AnythingLLM, and Node.js. These will be placed in the correct folders for bundling with your releases.
            </p>
            
            <!-- Ollama -->
            <div style="background: rgba(0,212,255,0.05); border: 2px solid var(--psf-border, #0f3460); border-radius: 10px; padding: 20px; margin: 20px 0;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                  <h4 class="binary-product-title" style="color: #00d4ff; margin-bottom: 10px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 16c0-4.4 3.6-8 8-8h2a6 6 0 0 1 6 6v2"/><path d="M7 9V6"/><path d="M12 8V5"/><circle cx="17" cy="16" r="2"/></svg>
                    <span>Ollama</span>
                  </h4>
                  <p style="color: #aaa; font-size: 14px; margin: 5px 0;">
                    Local LLM runtime (required for model execution)
                  </p>
                  <p style="color: #888; font-size: 12px; margin: 5px 0;">
                    Platforms: Windows (x64/ARM), Linux (x64/ARM), macOS (Intel/ARM)
                  </p>
                  <div style="margin-top: 10px; display: flex; align-items: center; gap: 10px;">
                    <span style="color: #666; font-size: 12px;">Current Version:</span>
                    <span id="ollama-version" style="color: #00d4ff; font-family: monospace; font-size: 14px; font-weight: bold;">Loading...</span>
                    <button class="btn-secondary binary-action-btn" onclick="checkForUpdates('ollama')" style="padding: 4px 12px; font-size: 12px;">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15.5-6.36"/><polyline points="19 2 19 8 13 8"/><path d="M21 12a9 9 0 0 1-15.5 6.36"/><polyline points="5 22 5 16 11 16"/></svg>
                      <span>Check for Updates</span>
                    </button>
                  </div>
                  <div id="ollama-update-notice" style="display: none; margin-top: 8px; padding: 8px; background: rgba(255, 212, 0, 0.2); border-left: 3px solid #ffd400; border-radius: 4px;">
                    <span style="color: #ffd400; font-size: 12px; font-weight: bold;">Update Available: </span>
                    <span id="ollama-latest-version" style="color: #ffd400; font-size: 12px; font-family: monospace;"></span>
                    <button onclick="updateVersion('ollama')" style="margin-left: 10px; padding: 2px 8px; font-size: 11px; background: #ffd400; color: #000; border: none; border-radius: 3px; cursor: pointer; font-weight: bold;">Update</button>
                  </div>
                </div>
                <div style="display: flex; gap: 10px;">
                  <button class="btn-secondary binary-action-btn" onclick="checkBinary('ollama')">Check</button>
                  <button class="btn-primary binary-action-btn" onclick="downloadBinary('ollama')">Download</button>
                  <button class="btn-secondary binary-action-btn" onclick="deleteBinary('ollama')" style="border-color: #ff6b6b; color: #ff6b6b;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                    <span>Delete</span>
                  </button>
                </div>
              </div>
              <div id="ollama-status" style="margin-top: 15px; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 5px; font-size: 12px; font-family: monospace; display: none;"></div>
            </div>
            
            <!-- PSF Core Python Dependencies & Open WebUI (Build) -->
            <div style="background: rgba(102,126,234,0.05); border: 2px solid var(--psf-border, #0f3460); border-radius: 10px; padding: 20px; margin: 20px 0;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                  <h4 class="binary-product-title" style="color: var(--psf-accent, #00d4ff); margin-bottom: 10px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5h6a3 3 0 0 1 3 3v2H6V8a3 3 0 0 1 3-3z"/><path d="M15 19H9a3 3 0 0 1-3-3v-2h12v2a3 3 0 0 1-3 3z"/><circle cx="10" cy="8" r="1"/><circle cx="14" cy="16" r="1"/></svg>
                    <span>PSF Core Python Dependencies &amp; Open WebUI</span>
                  </h4>
                  <p style="color: #aaa; font-size: 14px; margin: 5px 0;">
                    Python venv with Open WebUI and core runtime dependencies pre-installed
                  </p>
                  <p style="color: #888; font-size: 12px; margin: 5px 0;">
                    Builds platform-specific Python environment locally
                  </p>
                  <p style="color: #666; font-size: 11px; margin: 5px 0;">
                    ⚠️ Requires Python 3.10-3.12 installed on your system
                  </p>
                </div>
                <div style="display: flex; gap: 10px;">
                  <button class="btn-secondary binary-action-btn" onclick="checkPythonWebUI()">Check</button>
                  <button class="btn-primary binary-action-btn" onclick="buildPythonWebUI()">Build</button>
                  <button class="btn-secondary binary-action-btn" onclick="deleteBinary('python-webui')" style="border-color: #ff6b6b; color: #ff6b6b;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                    <span>Delete</span>
                  </button>
                </div>
              </div>
              <div id="python-webui-status" style="margin-top: 15px; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 5px; font-size: 12px; font-family: monospace; display: none;"></div>
            </div>

            <!-- Voice Runtime (Base Local TTS/STT) -->
            <div style="background: rgba(0, 212, 255, 0.05); border: 2px solid var(--psf-border, #0f3460); border-radius: 10px; padding: 20px; margin: 20px 0;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                  <h4 class="binary-product-title" style="color: #00d4ff; margin-bottom: 10px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 3 9 3 15 6 15 11 19 11 5"></polygon><path d="M15.5 8.5a5 5 0 0 1 0 7"></path><path d="M18.5 6a9 9 0 0 1 0 12"></path></svg>
                    <span>Voice Runtime (Base)</span>
                  </h4>
                  <p style="color: #aaa; font-size: 14px; margin: 5px 0;">
                    JIT Python runtime for local TTS/STT models (non-Chatterbox path).
                  </p>
                  <p style="color: #888; font-size: 12px; margin: 5px 0;">
                    Path: <code>binaries/python-voice/&lt;platform&gt;/venv</code>
                  </p>
                </div>
                <div style="display: flex; gap: 10px;">
                  <button class="btn-secondary binary-action-btn" onclick="checkVoiceRuntime('base')">Check</button>
                  <button class="btn-primary binary-action-btn" onclick="installVoiceRuntime('base')">Install / Repair</button>
                  <button class="btn-secondary binary-action-btn" onclick="deleteVoiceRuntime('base')" style="border-color: #ff6b6b; color: #ff6b6b;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                    <span>Delete</span>
                  </button>
                </div>
              </div>
              <div id="voice-runtime-base-status" style="margin-top: 15px; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 5px; font-size: 12px; font-family: monospace; display: none;"></div>
            </div>

            <!-- Voice Runtime (Chatterbox) -->
            <div style="background: rgba(255, 180, 77, 0.08); border: 2px solid var(--psf-border, #0f3460); border-radius: 10px; padding: 20px; margin: 20px 0;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                  <h4 class="binary-product-title" style="color: #ffb74d; margin-bottom: 10px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h9a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H9l-4 4V7a3 3 0 0 1 3-3z"></path><path d="M20 9h1a2 2 0 0 1 2 2v5l-3-2"></path></svg>
                    <span>Voice Runtime (Chatterbox)</span>
                  </h4>
                  <p style="color: #aaa; font-size: 14px; margin: 5px 0;">
                    Isolated JIT runtime for Chatterbox models.
                  </p>
                  <p style="color: #888; font-size: 12px; margin: 5px 0;">
                    Path: <code>binaries/python-voice-chatterbox/&lt;platform&gt;/venv</code>
                  </p>
                  <p style="color: #666; font-size: 11px; margin: 5px 0;">
                    Requires Python 3.10/3.11 for runtime creation.
                  </p>
                </div>
                <div style="display: flex; gap: 10px;">
                  <button class="btn-secondary binary-action-btn" onclick="checkVoiceRuntime('chatterbox')">Check</button>
                  <button class="btn-primary binary-action-btn" onclick="installVoiceRuntime('chatterbox')">Install / Repair</button>
                  <button class="btn-secondary binary-action-btn" onclick="deleteVoiceRuntime('chatterbox')" style="border-color: #ff6b6b; color: #ff6b6b;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                    <span>Delete</span>
                  </button>
                </div>
              </div>
              <div id="voice-runtime-chatterbox-status" style="margin-top: 15px; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 5px; font-size: 12px; font-family: monospace; display: none;"></div>
            </div>
            
            <!-- AnythingLLM -->
            <div style="background: rgba(0,255,136,0.05); border: 2px solid var(--psf-border, #0f3460); border-radius: 10px; padding: 20px; margin: 20px 0;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                  <h4 class="binary-product-title" style="color: #00ff88; margin-bottom: 10px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="8" width="12" height="10" rx="2"></rect><path d="M9 12h.01"></path><path d="M15 12h.01"></path><path d="M12 8V5"></path><path d="M9 18v2"></path><path d="M15 18v2"></path></svg>
                    <span>AnythingLLM</span>
                  </h4>
                  <p style="color: #aaa; font-size: 14px; margin: 5px 0;">
                    All-in-one RAG & AI agent platform
                  </p>
                  <p style="color: #888; font-size: 12px;">
                    Platforms: Windows, macOS, Linux (AppImage)
                  </p>
                </div>
                <div style="display: flex; gap: 10px;">
                  <button class="btn-secondary binary-action-btn" onclick="checkBinary('anythingllm')">Check</button>
                  <button class="btn-primary binary-action-btn" onclick="downloadBinary('anythingllm')">Download</button>
                  <button class="btn-secondary binary-action-btn" onclick="deleteBinary('anythingllm')" style="border-color: #ff6b6b; color: #ff6b6b;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                    <span>Delete</span>
                  </button>
                </div>
              </div>
              <div id="anythingllm-status" style="margin-top: 15px; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 5px; font-size: 12px; font-family: monospace; display: none;"></div>
            </div>
            
            <!-- Node.js (Portable Runtime) -->
            <div style="background: rgba(104,159,56,0.05); border: 2px solid var(--psf-border, #0f3460); border-radius: 10px; padding: 20px; margin: 20px 0;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                  <h4 class="binary-product-title" style="color: #68a038; margin-bottom: 10px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12,2 20,7 20,17 12,22 4,17 4,7"></polygon><path d="M9 10v4"></path><path d="M12 9v6"></path><path d="M15 11v2"></path></svg>
                    <span>Node.js (Portable Runtime)</span>
                  </h4>
                  <p style="color: #aaa; font-size: 14px; margin: 5px 0;">
                    Portable Node.js runtime for AnythingLLM server execution
                  </p>
                  <p style="color: #888; font-size: 12px; margin: 5px 0;">
                    Platforms: Windows (x64/ARM), Linux (x64/ARM), macOS (Intel/ARM)
                  </p>
                  <div style="margin-top: 10px; display: flex; align-items: center; gap: 10px;">
                    <span style="color: #666; font-size: 12px;">Version:</span>
                    <span id="nodejs-version" style="color: #68a038; font-family: monospace; font-size: 14px; font-weight: bold;">Loading...</span>
                  </div>
                </div>
                <div style="display: flex; gap: 10px;">
                  <button class="btn-secondary binary-action-btn" onclick="checkBinary('nodejs')">Check</button>
                  <button class="btn-primary binary-action-btn" onclick="downloadBinary('nodejs')">Download</button>
                  <button class="btn-secondary binary-action-btn" onclick="deleteBinary('nodejs')" style="border-color: #ff6b6b; color: #ff6b6b;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                    <span>Delete</span>
                  </button>
                </div>
              </div>
              <div id="nodejs-status" style="margin-top: 15px; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 5px; font-size: 12px; font-family: monospace; display: none;"></div>
            </div>

            <!-- ESP32 Toolchain (Arduino CLI) -->
            <div style="background: rgba(0, 188, 212, 0.08); border: 2px solid var(--psf-border, #0f3460); border-radius: 10px; padding: 20px; margin: 20px 0;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                  <h4 class="binary-product-title" style="color: #26c6da; margin-bottom: 10px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h6"></path><path d="M15 12h6"></path><circle cx="12" cy="12" r="3"></circle><path d="M12 3v3"></path><path d="M12 18v3"></path></svg>
                    <span>ESP32 Toolchain (Arduino CLI)</span>
                  </h4>
                  <p style="color: #aaa; font-size: 14px; margin: 5px 0;">
                    Required for PSF Relay live upload to ESP32 targets.
                  </p>
                  <p style="color: #888; font-size: 12px; margin: 5px 0;">
                    Installs portable <code>arduino-cli</code> under <code>binaries/arduino-cli/&lt;platform&gt;/bin</code>.
                  </p>
                  <p style="color: #666; font-size: 11px; margin: 5px 0;">
                    After install, run once in terminal (or pre-seed) to install core: <code>arduino-cli core install esp32:esp32</code>.
                  </p>
                  <div style="margin-top: 10px; display: flex; align-items: center; gap: 10px;">
                    <span style="color: #666; font-size: 12px;">Version:</span>
                    <span id="arduino-cli-version" style="color: #26c6da; font-family: monospace; font-size: 14px; font-weight: bold;">Loading...</span>
                  </div>
                </div>
                <div style="display: flex; gap: 10px;">
                  <button class="btn-secondary binary-action-btn" onclick="checkBinary('arduino-cli')">Check</button>
                  <button class="btn-primary binary-action-btn" onclick="downloadBinary('arduino-cli')">Download</button>
                  <button class="btn-secondary binary-action-btn" onclick="deleteBinary('arduino-cli')" style="border-color: #ff6b6b; color: #ff6b6b;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            <div id="arduino-cli-status" style="margin-top: 15px; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 5px; font-size: 12px; font-family: monospace; display: none;"></div>
            </div>

            <!-- ESP32 Flash Tool (esptool venv) -->
            <div style="background: rgba(255, 193, 7, 0.08); border: 2px solid var(--psf-border, #0f3460); border-radius: 10px; padding: 20px; margin: 20px 0;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                  <h4 class="binary-product-title" style="color: #ffd54f; margin-bottom: 10px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="18" height="11" rx="2"></rect><path d="M8 7V5h8v2"></path><path d="M12 11v4"></path><path d="m10 13 2 2 2-2"></path></svg>
                    <span>ESP32 Flash Tool (esptool)</span>
                  </h4>
                  <p style="color: #aaa; font-size: 14px; margin: 5px 0;">
                    Optional managed Python venv for reliable <code>erase_flash</code> and low-level ESP32 flashing.
                  </p>
                  <p style="color: #888; font-size: 12px; margin: 5px 0;">
                    Installs to: <code>binaries/esptool/&lt;platform&gt;/venv</code>
                  </p>
                  <p style="color: #666; font-size: 11px; margin: 5px 0;">
                    IRG prefers this managed esptool path when present.
                  </p>
                  <div style="margin-top: 10px; display: flex; align-items: center; gap: 10px;">
                    <span style="color: #666; font-size: 12px;">Version:</span>
                    <span id="esptool-version" style="color: #ffd54f; font-family: monospace; font-size: 14px; font-weight: bold;">Loading...</span>
                  </div>
                </div>
                <div style="display: flex; gap: 10px;">
                  <button class="btn-secondary binary-action-btn" onclick="checkBinary('esptool')">Check</button>
                  <button class="btn-primary binary-action-btn" onclick="downloadBinary('esptool')">Download</button>
                  <button class="btn-secondary binary-action-btn" onclick="deleteBinary('esptool')" style="border-color: #ff6b6b; color: #ff6b6b;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                    <span>Delete</span>
                  </button>
                </div>
              </div>
              <div id="esptool-status" style="margin-top: 15px; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 5px; font-size: 12px; font-family: monospace; display: none;"></div>
            </div>

            <!-- llama.cpp (Runtime Backend) -->
            <div style="background: rgba(255, 140, 0, 0.08); border: 2px solid var(--psf-border, #0f3460); border-radius: 10px; padding: 20px; margin: 20px 0;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                  <h4 class="binary-product-title" style="color: #ffb74d; margin-bottom: 10px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 18V6h16v12"></path><path d="M8 10h8"></path><path d="M8 14h5"></path><polyline points="15,18 18,21 22,17"></polyline></svg>
                    <span>llama.cpp (Runtime)</span>
                  </h4>
                  <p style="color: #aaa; font-size: 14px; margin: 5px 0;">
                    Native GGUF runtime backend for Code Terminal migration away from Ollama.
                  </p>
                  <p style="color: #888; font-size: 12px; margin: 5px 0;">
                    Expected targets: llama-server, llama-cli, llama-gguf-split
                  </p>
                  <p style="color: #666; font-size: 11px; margin: 5px 0;">
                    Build source path: <code>binaries/llama.cpp/&lt;platform&gt;</code>
                  </p>
                  <div style="margin-top: 10px; display: flex; align-items: center; gap: 10px;">
                    <span style="color: #666; font-size: 12px;">Version:</span>
                    <span id="llama-cpp-version" style="color: #ffb74d; font-family: monospace; font-size: 14px; font-weight: bold;">Loading...</span>
                  </div>
                </div>
                <div style="display: flex; gap: 10px;">
                  <button class="btn-secondary binary-action-btn" onclick="checkBinary('llama-cpp')">Check</button>
                  <button class="btn-secondary binary-action-btn" onclick="checkLlamaCppBuild()">Check GPU Build</button>
                  <button class="btn-primary binary-action-btn" onclick="downloadBinary('llama-cpp')">Prepare</button>
                  <button class="btn-secondary binary-action-btn" onclick="deleteBinary('llama-cpp')" style="border-color: #ff6b6b; color: #ff6b6b;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                    <span>Delete</span>
                  </button>
                </div>
              </div>
              <div id="llama-cpp-status" style="margin-top: 15px; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 5px; font-size: 12px; font-family: monospace; display: none;"></div>
            </div>

            <!-- Git (Portable CLI) -->
            <div style="background: rgba(255,140,0,0.06); border: 2px solid var(--psf-border, #0f3460); border-radius: 10px; padding: 20px; margin: 20px 0;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                  <h4 class="binary-product-title" style="color: #ff9f43; margin-bottom: 10px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 3 12l9 9 9-9-9-9z"></path><circle cx="9" cy="9" r="1.2"></circle><circle cx="15" cy="15" r="1.2"></circle><path d="M10 10l4 4"></path></svg>
                    <span>Git (Portable CLI)</span>
                  </h4>
                  <p style="color: #aaa; font-size: 14px; margin: 5px 0;">
                    Optional bundled Git fallback for offline version-control workflows.
                  </p>
                  <p style="color: #888; font-size: 12px; margin: 5px 0;">
                    Preferred order at runtime: system Git, then bundled Git.
                  </p>
                  <div style="margin-top: 10px; display: flex; align-items: center; gap: 10px;">
                    <span style="color: #666; font-size: 12px;">Version:</span>
                    <span id="git-version" style="color: #ff9f43; font-family: monospace; font-size: 14px; font-weight: bold;">Loading...</span>
                  </div>
                </div>
                <div style="display: flex; gap: 10px;">
                  <button class="btn-secondary binary-action-btn" onclick="checkBinary('git')">Check</button>
                  <button class="btn-primary binary-action-btn" onclick="downloadBinary('git')">Download</button>
                  <button class="btn-secondary binary-action-btn" onclick="deleteBinary('git')" style="border-color: #ff6b6b; color: #ff6b6b;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                    <span>Delete</span>
                  </button>
                </div>
              </div>
              <div id="git-status" style="margin-top: 15px; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 5px; font-size: 12px; font-family: monospace; display: none;"></div>
            </div>
            
            <!-- Bulk Actions -->
            <div style="margin-top: 30px; display: flex; gap: 15px; justify-content: center;">
              <button class="btn-primary binary-action-btn" onclick="downloadAllBinaries()" style="padding: 15px 40px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><rect x="4" y="17" width="16" height="4" rx="1"></rect></svg>
                <span>Download All Binaries</span>
              </button>
              <button class="btn-secondary binary-action-btn" onclick="checkAllBinaries()" style="padding: 15px 40px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <span>Check All</span>
              </button>
            </div>
            
            <!-- Progress Display -->
            <div id="download-progress" style="display: none; margin-top: 20px; padding: 20px; background: rgba(0,0,0,0.4); border-radius: 10px; border: 2px solid var(--psf-border, #0f3460);">
              <h4 style="color: #00d4ff; margin-bottom: 15px;">Download Progress</h4>
              <div id="current-file" style="color: #aaa; margin-bottom: 10px; font-size: 14px;">Preparing download...</div>
              <div style="background: var(--psf-border, #0f3460); border-radius: 5px; height: 30px; overflow: hidden; margin-bottom: 10px;">
                <div id="progress-bar" style="background: linear-gradient(90deg, #00d4ff, #00ff88); height: 100%; width: 0%; transition: width 0.3s; display: flex; align-items: center; justify-content: center;">
                  <span id="progress-text" style="color: #000; font-weight: bold; font-size: 12px;"></span>
                </div>
              </div>
              <div id="download-stats" style="color: #888; font-size: 12px; display: flex; justify-content: space-between;">
                <span id="files-completed">Files: 0/0</span>
                <span id="download-speed">0 KB/s</span>
              </div>
            </div>
            
            <div style="margin-top: 20px; padding: 15px; background: rgba(255,212,0,0.1); border-left: 3px solid #ffd400; border-radius: 5px;">
              <p style="color: #ffd400; font-size: 14px; margin: 0;">
                <strong>Note:</strong> Binaries will be downloaded to <code>binaries/</code> folder in your project directory. They will be automatically included when you build your package.
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Mixture of Experts Screen (MoE Foundation) -->
      `;

  function mount() {
    const slot = document.getElementById('index-heavy-screens-slot');
    if (!slot) return;
    slot.insertAdjacentHTML('beforebegin', HEAVY_SCREENS_HTML);
    slot.remove();
  }

  window.IndexDeveloperHeavyScreens = { mount };
})();
