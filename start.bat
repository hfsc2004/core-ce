REM @version 1.1.2 - March 5, 2026
REM @copyright 2026 Pseudo SF
@echo off
title PSF Robotics Archive Collection
cd /d "%~dp0"

echo.
echo ========================================
echo  PSF Robotics Archive Collection
echo ========================================
echo.
echo Starting launcher...
echo.

REM Check if we're running from the launcher directory
if exist "launcher\main.js" (
    cd launcher
)

REM Start the Electron app
if exist "node_modules\electron\dist\electron.exe" (
    start "" "node_modules\electron\dist\electron.exe" .
) else (
    echo ERROR: Electron not found!
    echo Please ensure the application is properly installed.
    echo.
    pause
    exit /b 1
)

echo Launcher started successfully!
echo You can close this window.
timeout /t 3 >nul
exit
