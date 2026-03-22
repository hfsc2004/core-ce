#!/bin/bash

echo ""
echo "========================================"
echo " PSF Robotics Archive Collection"
echo "========================================"
echo ""
echo "Starting launcher..."
echo ""

cd "$(dirname "$0")"

# Make this script executable
chmod +x "$0"

# Check if we're in the launcher directory
if [ -f "launcher/main.js" ]; then
    cd launcher
fi

# Start the Electron app
if [ -f "node_modules/.bin/electron" ]; then
    ./node_modules/.bin/electron . &
    echo ""
    echo "Launcher started successfully!"
    echo "You can close this terminal."
    sleep 2
    exit 0
elif [ -f "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron" ]; then
    ./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron . &
    echo ""
    echo "Launcher started successfully!"
    echo "You can close this terminal."
    sleep 2
    exit 0
else
    echo "ERROR: Electron not found!"
    echo "Please ensure the application is properly installed."
    echo ""
    read -p "Press enter to exit..."
    exit 1
fi
