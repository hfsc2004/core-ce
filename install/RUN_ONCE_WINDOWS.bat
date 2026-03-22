REM @version 1.1.2 - March 5, 2026
REM @copyright 2026 Global Science Network
@echo off
echo ============================================================
echo PSF Robotics Archive Collection - Developer Edition
echo First Run Setup
echo ============================================================
echo.

cd launcher

if exist node_modules (
    echo [OK] Node modules already installed.
    echo.
) else (
    echo [INFO] Installing Node.js dependencies...
    echo This may take 2-5 minutes depending on your connection.
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo [ERROR] npm install failed. Please check that Node.js and npm are installed.
        pause
        exit /b 1
    )
    echo.
    echo [OK] Dependencies installed successfully!
    echo.
    echo [INFO] Installing Yarn (required for AnythingLLM)...
    call npm install yarn
    if errorlevel 1 (
        echo.
        echo [WARN] Yarn installation failed. AnythingLLM features may not work.
    ) else (
        echo [OK] Yarn installed successfully!
    )
    echo.
)

echo Starting PSF Archive Collection...
echo.
npm start

pause
