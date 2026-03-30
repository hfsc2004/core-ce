#!/bin/bash
# @version 1.1.3 - March 5, 2026
# @copyright 2026 Pseudo SF
# Pseudo Science Fiction Core Collection - Python WebUI Builder
# This script creates a portable Python venv with Open WebUI pre-installed
# Uses uv for fast installation (JIT installed into venv)

set -e

echo "🏴‍☠️ Pseudo Science Fiction - Building Portable Python WebUI Bundle"
echo "=========================================================="

# Configuration
BUNDLE_NAME="python-webui"
PLATFORM=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

# Determine output directory based on platform
if [[ "$PLATFORM" == "linux" ]]; then
    if [[ "$ARCH" == "x86_64" ]]; then
        BUNDLE_DIR="../binaries/${BUNDLE_NAME}/linux-x64"
    elif [[ "$ARCH" == "aarch64" ]]; then
        BUNDLE_DIR="../binaries/${BUNDLE_NAME}/linux-arm64"
    else
        echo "❌ Unsupported Linux architecture: $ARCH"
        exit 1
    fi
elif [[ "$PLATFORM" == "darwin" ]]; then
    if [[ "$ARCH" == "x86_64" ]]; then
        BUNDLE_DIR="../binaries/${BUNDLE_NAME}/macos-intel"
    elif [[ "$ARCH" == "arm64" ]]; then
        BUNDLE_DIR="../binaries/${BUNDLE_NAME}/macos-arm"
    else
        echo "❌ Unsupported macOS architecture: $ARCH"
        exit 1
    fi
else
    echo "❌ Unsupported platform: $PLATFORM"
    echo "ℹ️  For Windows, use build-python-webui.bat"
    exit 1
fi

echo "📦 Target platform: $PLATFORM-$ARCH"
echo "📁 Output directory: $BUNDLE_DIR"
echo ""

# Check for Python 3.10, 3.11, or 3.12
PYTHON_CMD=""

if command -v python3.12 &> /dev/null; then
    PYTHON_CMD="python3.12"
elif command -v python3.11 &> /dev/null; then
    PYTHON_CMD="python3.11"
elif command -v python3.10 &> /dev/null; then
    PYTHON_CMD="python3.10"
elif command -v python3 &> /dev/null; then
    # Check version
    PY_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
    case "$PY_VERSION" in
        3.10|3.11|3.12)
            PYTHON_CMD="python3"
            ;;
    esac
fi

if [[ -z "$PYTHON_CMD" ]]; then
    echo "❌ Python 3.10, 3.11, or 3.12 not found!"
    echo "ℹ️  Please install Python:"
    echo "   Ubuntu/Debian: sudo apt install python3 python3-venv"
    echo "   macOS: brew install python@3.11"
    exit 1
fi

echo "✅ Python found: $PYTHON_CMD"
$PYTHON_CMD --version
echo ""

# Create bundle directory
echo "📁 Creating bundle directory..."
mkdir -p "$BUNDLE_DIR"

# Remove old venv if exists
if [ -d "$BUNDLE_DIR/venv" ]; then
    echo "🧹 Removing old venv..."
    rm -rf "$BUNDLE_DIR/venv"
fi

# Create virtual environment
echo "🔨 Creating virtual environment..."
$PYTHON_CMD -m venv "$BUNDLE_DIR/venv"

# Activate venv
echo "⚡ Activating virtual environment..."
source "$BUNDLE_DIR/venv/bin/activate"

# Upgrade pip
echo "📦 Upgrading pip..."
pip install --upgrade pip

# Install uv into the venv (JIT - fast package installer)
echo "🚀 Installing uv (fast package installer)..."
pip install uv

# Install Open WebUI using uv (much faster than pip)
echo "🌐 Installing Open WebUI (using uv for speed)..."
uv pip install open-webui

# Install mpremote for deterministic MicroPython/IRG serial execution
echo "🔌 Installing mpremote..."
uv pip install mpremote

# Install local voice runtime dependencies (Local Transformers / HF local STT/TTS)
echo "🗣️ Installing voice runtime dependencies (transformers, numpy, phonemizer, torch)..."
uv pip install transformers numpy phonemizer
if [[ "$PLATFORM" == "linux" && "$ARCH" == "x86_64" ]]; then
    # NVIDIA x64 path: use cu118 wheel set for broad Pascal-era compatibility (Tesla P4 / sm_61).
    echo "🎮 Installing CUDA Torch (cu118) for Linux x64..."
    uv pip install --index-url https://download.pytorch.org/whl/cu118 torch
else
    # Non-NVIDIA-x64 path: CPU torch for portability.
    echo "🧠 Installing CPU Torch..."
    uv pip install --index-url https://download.pytorch.org/whl/cpu torch
fi

# Get installed version
WEBUI_VERSION=$(pip show open-webui | grep Version | awk '{print $2}')
echo "✅ Open WebUI $WEBUI_VERSION installed"

# Make venv relocatable (remove absolute paths)
echo "🔧 Making venv relocatable..."
# Update pyvenv.cfg to use relative paths
if [[ "$PLATFORM" == "darwin" ]]; then
    sed -i '' 's|^home = .*|home = .|' "$BUNDLE_DIR/venv/pyvenv.cfg"
else
    sed -i 's|^home = .*|home = .|' "$BUNDLE_DIR/venv/pyvenv.cfg"
fi

# Create launcher script
echo "📝 Creating launcher script..."
cat > "$BUNDLE_DIR/run-webui.sh" << 'EOF'
#!/bin/bash
# Pseudo Science Fiction - Open WebUI Launcher
# This script is called by the Electron app

# Get script directory (works even when called from elsewhere)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Set environment variables
export OLLAMA_API_BASE_URL="http://localhost:52434/api"
export DATA_DIR="$SCRIPT_DIR/data"
export WEBUI_SECRET_KEY="psf-robotics-$(uuidgen 2>/dev/null || echo 'static-key')"

# Create data directory if it doesn't exist
mkdir -p "$DATA_DIR"

# Launch Open WebUI
echo "🚀 Starting Open WebUI..."
"$SCRIPT_DIR/venv/bin/python" -m uvicorn open_webui.main:app \
    --host 0.0.0.0 \
    --port 8080 \
    --log-level info
EOF

chmod +x "$BUNDLE_DIR/run-webui.sh"

# Create data directory
mkdir -p "$BUNDLE_DIR/data"

# Create README
cat > "$BUNDLE_DIR/README.txt" << EOF
Pseudo Science Fiction Core Collection - Open WebUI Bundle
====================================================

This is a portable Python environment with Open WebUI pre-installed.

Bundle Information:
- Platform: $PLATFORM-$ARCH
- Python Version: $($PYTHON_CMD --version)
- Open WebUI Version: $WEBUI_VERSION
- Created: $(date)
- Installer: uv (fast)

To launch manually:
  ./run-webui.sh

The Electron app will launch this automatically when you click "Launch Open WebUI".

Data is stored in: ./data/
This includes your chats, settings, and preferences.

For support: https://psfrobotics.com
EOF

# Deactivate venv
deactivate

# Get bundle size
BUNDLE_SIZE=$(du -sh "$BUNDLE_DIR" | awk '{print $1}')

echo ""
echo "=========================================================="
echo "✅ Build Complete!"
echo "=========================================================="
echo "📦 Bundle location: $BUNDLE_DIR"
echo "💾 Bundle size: $BUNDLE_SIZE"
echo "🌐 Open WebUI version: $WEBUI_VERSION"
echo ""
echo "🎯 Next steps:"
echo "   1. Test the bundle: cd $BUNDLE_DIR && ./run-webui.sh"
echo "   2. Open browser: http://localhost:8080"
echo "   3. If it works, bundle is ready for distribution!"
echo ""
echo "🏴‍☠️ Arrr! Ready to sail!"
