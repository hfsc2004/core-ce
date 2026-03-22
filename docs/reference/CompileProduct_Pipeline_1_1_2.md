*Version: 1.1.2*
*Copyright © 2026 Global Science Network*
┌───────────────────────────────────────────────────────────────────┐
│                    COMPILE PRODUCT PIPELINE                       │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Step 1: Compile Open WebUI                                       │
│          Python venv → PyInstaller → open-webui (native binary)  │
│          TODO: Future → Nuitka for true C++ compilation          │
│                                                                   │
│  Step 2: Compile AnythingLLM                                      │
│          Node.js source → pkg → anythingllm-server (native bin)  │
│                                                                   │
│  Step 3: Obfuscate Standard Edition                               │
│          PSF Launcher JS → javascript-obfuscator → protected JS  │
│          Presets: light | medium | heavy                          │
│                                                                   │
│  Step 4: Package with electron-builder                            │
│          Everything → .exe / .dmg / .AppImage                    │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
