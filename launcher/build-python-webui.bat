REM @version 1.1.2 - March 5, 2026
REM @copyright 2026 Pseudo SF
@echo off
REM Pseudo Science Fiction Core Collection - Python WebUI Builder (Windows)
REM This script creates a portable Python venv with Open WebUI pre-installed
REM Run this ONCE to create the Windows bundle

echo ============================================================
echo Pseudo Science Fiction - Building Portable Python WebUI Bundle (Windows)
echo ============================================================
echo.

REM Configuration
set PYTHON_VERSION=3.11
set BUNDLE_NAME=python-webui

REM Detect architecture
if "%PROCESSOR_ARCHITECTURE%"=="AMD64" (
    set BUNDLE_DIR=..\binaries\%BUNDLE_NAME%\windows-x64
) else if "%PROCESSOR_ARCHITECTURE%"=="ARM64" (
    set BUNDLE_DIR=..\binaries\%BUNDLE_NAME%\windows-arm64
) else (
    echo ERROR: Unsupported architecture: %PROCESSOR_ARCHITECTURE%
    exit /b 1
)

echo Target platform: Windows-%PROCESSOR_ARCHITECTURE%
echo Output directory: %BUNDLE_DIR%
echo.

REM Check for Python 3.11
where python 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Python not found!
    echo Please install Python 3.11 from: https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation
    exit /b 1
)

python --version | findstr "3.11" >nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Python 3.11 required!
    echo Found: 
    python --version
    echo Please install Python 3.11 from: https://www.python.org/downloads/
    exit /b 1
)

echo Python 3.11 found
echo.

REM Create bundle directory
echo Creating bundle directory...
if not exist "%BUNDLE_DIR%" mkdir "%BUNDLE_DIR%"

REM Remove old venv if exists
if exist "%BUNDLE_DIR%\venv" (
    echo Cleaning old venv...
    rmdir /s /q "%BUNDLE_DIR%\venv"
)

REM Create virtual environment
echo Creating virtual environment...
python -m venv "%BUNDLE_DIR%\venv"

REM Activate venv and install
echo Installing Open WebUI...
call "%BUNDLE_DIR%\venv\Scripts\activate.bat"
python -m pip install --upgrade pip
python -m pip install open-webui
python -m pip install mpremote
echo Installing voice runtime dependencies (transformers, numpy, phonemizer, torch)...
python -m pip install transformers numpy phonemizer
if /I "%PROCESSOR_ARCHITECTURE%"=="AMD64" (
  echo Installing CUDA Torch (cu118) for Windows x64...
  python -m pip install --index-url https://download.pytorch.org/whl/cu118 torch
) else (
  echo Installing CPU Torch...
  python -m pip install --index-url https://download.pytorch.org/whl/cpu torch
)

REM Get version
for /f "tokens=2" %%i in ('pip show open-webui ^| findstr "Version"') do set WEBUI_VERSION=%%i
echo Open WebUI %WEBUI_VERSION% installed
echo.

REM Create launcher script
echo Creating launcher script...
(
echo @echo off
echo REM Pseudo Science Fiction - Open WebUI Launcher
echo.
echo REM Get script directory
echo set SCRIPT_DIR=%%~dp0
echo.
echo REM Set environment variables
echo set OLLAMA_API_BASE_URL=http://localhost:52434/api
echo set DATA_DIR=%%SCRIPT_DIR%%data
echo set WEBUI_SECRET_KEY=psf-robotics-static-key
echo.
echo REM Create data directory
echo if not exist "%%DATA_DIR%%" mkdir "%%DATA_DIR%%"
echo.
echo REM Launch Open WebUI
echo echo Starting Open WebUI...
echo "%%SCRIPT_DIR%%venv\Scripts\python.exe" -m uvicorn open_webui.main:app --host 0.0.0.0 --port 8080
) > "%BUNDLE_DIR%\run-webui.bat"

REM Create data directory
if not exist "%BUNDLE_DIR%\data" mkdir "%BUNDLE_DIR%\data"

REM Create README
(
echo Pseudo Science Fiction Core Collection - Open WebUI Bundle
echo ====================================================
echo.
echo This is a portable Python environment with Open WebUI pre-installed.
echo.
echo Bundle Information:
echo - Platform: Windows-%PROCESSOR_ARCHITECTURE%
echo - Open WebUI Version: %WEBUI_VERSION%
echo - Created: %DATE% %TIME%
echo.
echo To launch manually:
echo   run-webui.bat
echo.
echo The Electron app will launch this automatically when you click "Launch Open WebUI".
echo.
echo Data is stored in: .\data\
echo This includes your chats, settings, and preferences.
echo.
echo For support: https://psfrobotics.com
) > "%BUNDLE_DIR%\README.txt"

REM Deactivate venv
call "%BUNDLE_DIR%\venv\Scripts\deactivate.bat"

REM Get bundle size
for /f "tokens=3" %%i in ('dir /s "%BUNDLE_DIR%" ^| findstr "bytes"') do set BUNDLE_SIZE=%%i

echo.
echo ============================================================
echo Build Complete!
echo ============================================================
echo Bundle location: %BUNDLE_DIR%
echo Open WebUI version: %WEBUI_VERSION%
echo.
echo Next steps:
echo   1. Test the bundle: cd %BUNDLE_DIR% ^&^& run-webui.bat
echo   2. Open browser: http://localhost:8080
echo   3. If it works, bundle is ready for distribution!
echo.
echo Ready to sail!
pause
