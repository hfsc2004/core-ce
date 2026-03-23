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
        <div class="screen-header">
          <button class="btn-back" onclick="showScreen('model-browser')">← Back</button>
          <h2>Binary Manager</h2>
        </div>
        
        <div class="binary-manager-content">
          <div class="info-card" style="max-width: 1000px; margin: 20px auto;">
            <h3>Download Binaries</h3>
            <p style="color: #aaa; margin: 15px 0;">
              Download standalone binaries for Ollama, OpenWebUI, AnythingLLM, and Node.js. These will be placed in the correct folders for bundling with your releases.
            </p>
            
            <!-- Ollama -->
            <div style="background: rgba(0,212,255,0.05); border: 2px solid var(--psf-border, #0f3460); border-radius: 10px; padding: 20px; margin: 20px 0;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <h4 style="color: #00d4ff; margin-bottom: 10px;">🦙 Ollama</h4>
                  <p style="color: #aaa; font-size: 14px; margin: 5px 0;">
                    Local LLM runtime (required for model execution)
                  </p>
                  <p style="color: #888; font-size: 12px; margin: 5px 0;">
                    Platforms: Windows (x64/ARM), Linux (x64/ARM), macOS (Intel/ARM)
                  </p>
                  <div style="margin-top: 10px; display: flex; align-items: center; gap: 10px;">
                    <span style="color: #666; font-size: 12px;">Current Version:</span>
                    <span id="ollama-version" style="color: #00d4ff; font-family: monospace; font-size: 14px; font-weight: bold;">Loading...</span>
                    <button class="btn-secondary" onclick="checkForUpdates('ollama')" style="padding: 4px 12px; font-size: 12px;">🔄 Check for Updates</button>
                  </div>
                  <div id="ollama-update-notice" style="display: none; margin-top: 8px; padding: 8px; background: rgba(255, 212, 0, 0.2); border-left: 3px solid #ffd400; border-radius: 4px;">
                    <span style="color: #ffd400; font-size: 12px; font-weight: bold;">Update Available: </span>
                    <span id="ollama-latest-version" style="color: #ffd400; font-size: 12px; font-family: monospace;"></span>
                    <button onclick="updateVersion('ollama')" style="margin-left: 10px; padding: 2px 8px; font-size: 11px; background: #ffd400; color: #000; border: none; border-radius: 3px; cursor: pointer; font-weight: bold;">Update</button>
                  </div>
                </div>
                <div style="display: flex; gap: 10px;">
                  <button class="btn-secondary" onclick="checkBinary('ollama')">Check</button>
                  <button class="btn-primary" onclick="downloadBinary('ollama')">Download</button>
                  <button class="btn-secondary" onclick="deleteBinary('ollama')" style="background: #ff6b6b; border-color: #ff6b6b;">🗑️ Delete</button>
                </div>
              </div>
              <div id="ollama-status" style="margin-top: 15px; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 5px; font-size: 12px; font-family: monospace; display: none;"></div>
            </div>
            
            <!-- PSF Core Python Dependencies & Open WebUI (Build) -->
            <div style="background: rgba(102,126,234,0.05); border: 2px solid var(--psf-border, #0f3460); border-radius: 10px; padding: 20px; margin: 20px 0;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <h4 style="color: var(--psf-accent, #00d4ff); margin-bottom: 10px;">🐍 PSF Core Python Dependencies &amp; Open WebUI</h4>
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
                  <button class="btn-secondary" onclick="checkPythonWebUI()">Check</button>
                  <button class="btn-primary" onclick="buildPythonWebUI()">Build</button>
                  <button class="btn-secondary" onclick="deleteBinary('python-webui')" style="background: #ff6b6b; border-color: #ff6b6b;">🗑️ Delete</button>
                </div>
              </div>
              <div id="python-webui-status" style="margin-top: 15px; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 5px; font-size: 12px; font-family: monospace; display: none;"></div>
            </div>

            <!-- Voice Runtime (Base Local TTS/STT) -->
            <div style="background: rgba(0, 212, 255, 0.05); border: 2px solid var(--psf-border, #0f3460); border-radius: 10px; padding: 20px; margin: 20px 0;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <h4 style="color: #00d4ff; margin-bottom: 10px;">🔊 Voice Runtime (Base)</h4>
                  <p style="color: #aaa; font-size: 14px; margin: 5px 0;">
                    JIT Python runtime for local TTS/STT models (non-Chatterbox path).
                  </p>
                  <p style="color: #888; font-size: 12px; margin: 5px 0;">
                    Path: <code>binaries/python-voice/&lt;platform&gt;/venv</code>
                  </p>
                </div>
                <div style="display: flex; gap: 10px;">
                  <button class="btn-secondary" onclick="checkVoiceRuntime('base')">Check</button>
                  <button class="btn-primary" onclick="installVoiceRuntime('base')">Install / Repair</button>
                  <button class="btn-secondary" onclick="deleteVoiceRuntime('base')" style="background: #ff6b6b; border-color: #ff6b6b;">🗑️ Delete</button>
                </div>
              </div>
              <div id="voice-runtime-base-status" style="margin-top: 15px; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 5px; font-size: 12px; font-family: monospace; display: none;"></div>
            </div>

            <!-- Voice Runtime (Chatterbox) -->
            <div style="background: rgba(255, 180, 77, 0.08); border: 2px solid var(--psf-border, #0f3460); border-radius: 10px; padding: 20px; margin: 20px 0;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <h4 style="color: #ffb74d; margin-bottom: 10px;">🗣️ Voice Runtime (Chatterbox)</h4>
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
                  <button class="btn-secondary" onclick="checkVoiceRuntime('chatterbox')">Check</button>
                  <button class="btn-primary" onclick="installVoiceRuntime('chatterbox')">Install / Repair</button>
                  <button class="btn-secondary" onclick="deleteVoiceRuntime('chatterbox')" style="background: #ff6b6b; border-color: #ff6b6b;">🗑️ Delete</button>
                </div>
              </div>
              <div id="voice-runtime-chatterbox-status" style="margin-top: 15px; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 5px; font-size: 12px; font-family: monospace; display: none;"></div>
            </div>
            
            <!-- AnythingLLM -->
            <div style="background: rgba(0,255,136,0.05); border: 2px solid var(--psf-border, #0f3460); border-radius: 10px; padding: 20px; margin: 20px 0;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <h4 style="color: #00ff88; margin-bottom: 10px;">🤖 AnythingLLM</h4>
                  <p style="color: #aaa; font-size: 14px; margin: 5px 0;">
                    All-in-one RAG & AI agent platform
                  </p>
                  <p style="color: #888; font-size: 12px;">
                    Platforms: Windows, macOS, Linux (AppImage)
                  </p>
                </div>
                <div style="display: flex; gap: 10px;">
                  <button class="btn-secondary" onclick="checkBinary('anythingllm')">Check</button>
                  <button class="btn-primary" onclick="downloadBinary('anythingllm')">Download</button>
                  <button class="btn-secondary" onclick="deleteBinary('anythingllm')" style="background: #ff6b6b; border-color: #ff6b6b;">🗑️ Delete</button>
                </div>
              </div>
              <div id="anythingllm-status" style="margin-top: 15px; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 5px; font-size: 12px; font-family: monospace; display: none;"></div>
            </div>
            
            <!-- Node.js (Portable Runtime) -->
            <div style="background: rgba(104,159,56,0.05); border: 2px solid var(--psf-border, #0f3460); border-radius: 10px; padding: 20px; margin: 20px 0;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <h4 style="color: #68a038; margin-bottom: 10px;">⬢ Node.js (Portable Runtime)</h4>
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
                  <button class="btn-secondary" onclick="checkBinary('nodejs')">Check</button>
                  <button class="btn-primary" onclick="downloadBinary('nodejs')">Download</button>
                  <button class="btn-secondary" onclick="deleteBinary('nodejs')" style="background: #ff6b6b; border-color: #ff6b6b;">🗑️ Delete</button>
                </div>
              </div>
              <div id="nodejs-status" style="margin-top: 15px; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 5px; font-size: 12px; font-family: monospace; display: none;"></div>
            </div>

            <!-- ESP32 Toolchain (Arduino CLI) -->
            <div style="background: rgba(0, 188, 212, 0.08); border: 2px solid var(--psf-border, #0f3460); border-radius: 10px; padding: 20px; margin: 20px 0;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <h4 style="color: #26c6da; margin-bottom: 10px;">📡 ESP32 Toolchain (Arduino CLI)</h4>
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
                  <button class="btn-secondary" onclick="checkBinary('arduino-cli')">Check</button>
                  <button class="btn-primary" onclick="downloadBinary('arduino-cli')">Download</button>
                  <button class="btn-secondary" onclick="deleteBinary('arduino-cli')" style="background: #ff6b6b; border-color: #ff6b6b;">🗑️ Delete</button>
                </div>
              </div>
            <div id="arduino-cli-status" style="margin-top: 15px; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 5px; font-size: 12px; font-family: monospace; display: none;"></div>
            </div>

            <!-- ESP32 Flash Tool (esptool venv) -->
            <div style="background: rgba(255, 193, 7, 0.08); border: 2px solid var(--psf-border, #0f3460); border-radius: 10px; padding: 20px; margin: 20px 0;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <h4 style="color: #ffd54f; margin-bottom: 10px;">🧰 ESP32 Flash Tool (esptool)</h4>
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
                  <button class="btn-secondary" onclick="checkBinary('esptool')">Check</button>
                  <button class="btn-primary" onclick="downloadBinary('esptool')">Download</button>
                  <button class="btn-secondary" onclick="deleteBinary('esptool')" style="background: #ff6b6b; border-color: #ff6b6b;">🗑️ Delete</button>
                </div>
              </div>
              <div id="esptool-status" style="margin-top: 15px; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 5px; font-size: 12px; font-family: monospace; display: none;"></div>
            </div>

            <!-- llama.cpp (Runtime Backend) -->
            <div style="background: rgba(255, 140, 0, 0.08); border: 2px solid var(--psf-border, #0f3460); border-radius: 10px; padding: 20px; margin: 20px 0;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <h4 style="color: #ffb74d; margin-bottom: 10px;">🦙 llama.cpp (Runtime)</h4>
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
                  <button class="btn-secondary" onclick="checkBinary('llama-cpp')">Check</button>
                  <button class="btn-secondary" onclick="checkLlamaCppBuild()">Check GPU Build</button>
                  <button class="btn-primary" onclick="downloadBinary('llama-cpp')">Prepare</button>
                  <button class="btn-secondary" onclick="deleteBinary('llama-cpp')" style="background: #ff6b6b; border-color: #ff6b6b;">🗑️ Delete</button>
                </div>
              </div>
              <div id="llama-cpp-status" style="margin-top: 15px; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 5px; font-size: 12px; font-family: monospace; display: none;"></div>
            </div>

            <!-- Git (Portable CLI) -->
            <div style="background: rgba(255,140,0,0.06); border: 2px solid var(--psf-border, #0f3460); border-radius: 10px; padding: 20px; margin: 20px 0;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <h4 style="color: #ff9f43; margin-bottom: 10px;">🔧 Git (Portable CLI)</h4>
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
                  <button class="btn-secondary" onclick="checkBinary('git')">Check</button>
                  <button class="btn-primary" onclick="downloadBinary('git')">Download</button>
                  <button class="btn-secondary" onclick="deleteBinary('git')" style="background: #ff6b6b; border-color: #ff6b6b;">🗑️ Delete</button>
                </div>
              </div>
              <div id="git-status" style="margin-top: 15px; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 5px; font-size: 12px; font-family: monospace; display: none;"></div>
            </div>
            
            <!-- Bulk Actions -->
            <div style="margin-top: 30px; display: flex; gap: 15px; justify-content: center;">
              <button class="btn-primary" onclick="downloadAllBinaries()" style="padding: 15px 40px;">
                📦 Download All Binaries
              </button>
              <button class="btn-secondary" onclick="checkAllBinaries()" style="padding: 15px 40px;">
                ✓ Check All
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

      <!-- Compile Project Screen -->
      <div id="compile-project" class="screen">
        <div class="screen-header">
          <button class="btn-back" onclick="showScreen('main-menu')">← Back</button>
          <h2>🚀 Compile Product</h2>
        </div>
        
        <div style="padding: 20px; max-width: 1400px; margin: 0 auto;">
          
          <!-- Configuration Section -->
          <div class="info-card" style="margin-bottom: 20px;">
            <h3 style="color: var(--psf-accent, #00d4ff);">📁 Build Configuration</h3>
            
            <div style="display: grid; grid-template-columns: 1fr auto auto; gap: 15px; align-items: end; margin-top: 15px;">
              <div>
                <label style="display: block; color: #aaa; margin-bottom: 5px;">Select Configuration</label>
                <select id="config-selector" onchange="loadSelectedConfig()" style="width: 100%; padding: 10px; background: var(--psf-bg-primary, #1a1a2e); border: 1px solid var(--psf-border, #0f3460); border-radius: 5px; color: #fff;">
                  <option value="">-- Select a configuration --</option>
                </select>
              </div>
              <button class="btn-primary" onclick="showNewConfigForm()" style="background: var(--psf-accent-medium, rgba(0,212,255,0.3)); border-color: var(--psf-accent, #00d4ff);">
                ➕ New Config
              </button>
              <button class="btn-secondary" onclick="deleteCurrentConfig()" style="border-color: #ff6b6b; color: #ff6b6b;">
                🗑️ Delete
              </button>
            </div>
            
            <p id="config-status" style="color: #888; font-size: 13px; margin-top: 10px;">Loading configurations...</p>
          </div>
          
          <!-- Product Settings -->
          <div class="info-card" style="margin-bottom: 20px;">
            <h3 style="color: var(--psf-accent, #00d4ff);">⚙️ Product Settings</h3>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 15px;">
              <div>
                <label style="display: block; color: #aaa; margin-bottom: 5px;">Product Name</label>
                <input type="text" id="compile-product-name" value="PSF Archive Collection" 
                       style="width: 100%; padding: 10px; background: rgba(255,255,255,0.1); border: 1px solid var(--psf-border, #0f3460); border-radius: 5px; color: #fff;">
              </div>
              <div>
                <label style="display: block; color: #aaa; margin-bottom: 5px;">Version</label>
                <input type="text" id="compile-version" value="1.0.0" 
                       style="width: 100%; padding: 10px; background: rgba(255,255,255,0.1); border: 1px solid var(--psf-border, #0f3460); border-radius: 5px; color: #fff;">
              </div>
              <div>
                <label style="display: block; color: #aaa; margin-bottom: 5px;">Output Folder Name</label>
                <input type="text" id="compile-output-folder" value="PSF_Archive_Collection_PRODUCT" 
                       style="width: 100%; padding: 10px; background: rgba(255,255,255,0.1); border: 1px solid var(--psf-border, #0f3460); border-radius: 5px; color: #fff;">
              </div>
              <div>
                <label style="display: block; color: #aaa; margin-bottom: 5px;">Storage Label</label>
                <input type="text" id="compile-storage-label" value="Custom SSD" 
                       style="width: 100%; padding: 10px; background: rgba(255,255,255,0.1); border: 1px solid var(--psf-border, #0f3460); border-radius: 5px; color: #fff;">
              </div>
            </div>
          </div>
          
          <!-- Available Models -->
          <div class="info-card" style="margin-bottom: 20px;">
            <h3 style="color: #00ff88;">📦 Available Models (with Ollama Blobs)</h3>
            <div id="available-models-for-compile" style="margin-top: 15px;">
              <p style="color: #888;">Loading available models...</p>
            </div>
          </div>
          
          <!-- Custom Collections -->
          <div class="info-card" style="margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <h3 style="color: #ffd400;">📂 Custom Collections</h3>
              <button class="btn-primary" onclick="showAddCustomCollectionForm()" style="background: rgba(255,212,0,0.2); border-color: #ffd400; color: #ffd400;">
                ➕ Add Collection
              </button>
            </div>
            <div id="custom-collections-list" style="margin-top: 15px;">
              <p style="color: #888; text-align: center;">No collections yet. Click "Add Collection" to create one.</p>
            </div>
          </div>
          
          <!-- Compile Summary -->
          <div class="info-card" style="margin-bottom: 20px;">
            <h3 style="color: #ff6b6b;">📊 Build Summary</h3>
            <div id="compile-summary" style="margin-top: 15px;">
              <p style="color: #888;">No models selected. Add models to custom collections above.</p>
            </div>
          </div>
          
          <!-- Compile Progress -->
          <div id="compile-progress" style="display: none; margin-bottom: 20px;" class="info-card">
            <h3 style="color: #00d4ff;">🔄 Compilation Progress</h3>
            <p id="compile-status" style="color: #aaa; margin: 10px 0;">Initializing...</p>
            
            <!-- Timer Display -->
            <div id="compile-timer" style="display: none; margin: 15px 0;"></div>
            
            <div style="background: rgba(255,255,255,0.1); border-radius: 10px; height: 20px; overflow: hidden; margin: 10px 0;">
              <div id="compile-progress-bar" style="background: linear-gradient(90deg, var(--psf-accent, #00d4ff), var(--psf-success, #00ff88)); height: 100%; width: 0%; transition: width 0.3s;"></div>
            </div>
            <div id="compile-log" style="background: rgba(0,0,0,0.3); padding: 15px; border-radius: 8px; max-height: 200px; overflow-y: auto; font-family: monospace; font-size: 12px; color: #aaa; margin-top: 15px;"></div>
          </div>
          
          <!-- Compiled Binaries Status -->
          <div class="info-card" style="margin-bottom: 20px;">
            <h3 style="color: #ffd400;">Compiled Binaries</h3>
            <p style="color: #888; margin-bottom: 15px; font-size: 13px;">
              Pre-compiled binaries are cached and reused. Delete to force recompilation with new settings.
            </p>
            <div id="compiled-binaries-status">
              <span style="color: #888;">Checking...</span>
            </div>
          </div>
          
          <!-- Compile Button -->
          <div style="text-align: center; margin-top: 30px;">
            <button class="btn-primary" onclick="startCompile()" style="padding: 15px 50px; font-size: 18px; background: linear-gradient(135deg, var(--psf-accent-dark, #0099cc) 0%, var(--psf-accent, #00d4ff) 100%); border: none;">
              🚀 Start Compilation
            </button>
            <p style="color: #888; margin-top: 15px; font-size: 13px;">
              This will create a standalone product package with all selected models and binaries.
            </p>
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
