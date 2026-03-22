#!/bin/bash
# @version 1.1.2 - March 5, 2026
# @copyright 2026 Pseudo SF

echo ""
echo "========================================"
echo " PSF Robotics Archive Collection"
echo "========================================"
echo ""
echo "Starting launcher..."
echo ""

cd "$(dirname "$0")"

# First, look for AppImage in dist folder (production build)
APPIMAGE=$(find . -maxdepth 3 -name "*.AppImage" -type f 2>/dev/null | head -1)

if [ -n "$APPIMAGE" ] && [ -f "$APPIMAGE" ]; then
    echo "Found AppImage: $APPIMAGE"
    chmod +x "$APPIMAGE"
    "$APPIMAGE" --no-sandbox &
    echo ""
    echo "Launcher started successfully!"
    echo "You can close this terminal."
    sleep 2
    exit 0
fi

# Fall back to development mode
if [ -f "launcher/main.js" ]; then
    cd launcher
fi

# Start the Electron app in dev mode
if [ -f "node_modules/.bin/electron" ]; then
    ./node_modules/.bin/electron . --no-sandbox &
    echo ""
    echo "Launcher started successfully!"
    echo "You can close this terminal."
    sleep 2
    exit 0
elif [ -f "node_modules/electron/dist/electron" ]; then
    ./node_modules/electron/dist/electron . --no-sandbox &
    echo ""
    echo "Launcher started successfully!"
    echo "You can close this terminal."
    sleep 2
    exit 0
else
    echo "ERROR: No launcher found!"
    echo "Please ensure the application is properly installed."
    echo ""
    read -p "Press enter to exit..."
    exit 1
fi
