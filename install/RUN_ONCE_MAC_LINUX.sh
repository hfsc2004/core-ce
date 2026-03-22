#!/bin/bash
# @version 1.1.2 - March 5, 2026
# @copyright 2026 Pseudo SF
echo "============================================================"
echo "PSF Robotics Archive Collection - Core-CE"
echo "First Run Setup"
echo "============================================================"
echo

cd launcher

if [ -d "node_modules" ]; then
    echo "[OK] Node modules already installed."
    echo
else
    echo "[INFO] Installing Node.js dependencies..."
    echo "This may take 2-5 minutes depending on your connection."
    echo
    npm install
    if [ $? -ne 0 ]; then
        echo
        echo "[ERROR] npm install failed. Please check that Node.js and npm are installed."
        exit 1
    fi
    echo
    echo "[OK] Dependencies installed successfully!"
    echo
    echo "[INFO] Installing Yarn (required for AnythingLLM)..."
    npm install yarn
    if [ $? -ne 0 ]; then
        echo
        echo "[WARN] Yarn installation failed. AnythingLLM features may not work."
    else
        echo "[OK] Yarn installed successfully!"
    fi
    echo
fi

echo "Starting PSF Archive Collection..."
echo
npm start
