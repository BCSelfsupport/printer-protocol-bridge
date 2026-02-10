@echo off
cd /d "%~dp0"
echo ========================================
echo  CodeSync™ - Windows Installer Builder
echo ========================================
echo.

REM Check Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed. Download from https://nodejs.org
    pause
    exit /b 1
)
echo [OK] Node.js found: 
node --version
echo.

REM Step 1: Install dependencies
echo [1/4] Installing dependencies...
call npm install
if errorlevel 1 (
    echo ERROR: npm install failed
    pause
    exit /b 1
)
echo.

REM Step 2: Install Electron build tools (devDependencies)
echo [2/4] Installing Electron build tools...
call npm install --save-dev electron electron-builder
if errorlevel 1 (
    echo ERROR: Failed to install Electron build tools
    pause
    exit /b 1
)
echo.

REM Step 3: Build the Vite frontend
echo [3/4] Building frontend...
call npm run build
if errorlevel 1 (
    echo ERROR: Frontend build failed
    pause
    exit /b 1
)
echo.

REM Step 4: Package with electron-builder
echo [4/4] Packaging installer...
call npx electron-builder --config electron/electron-builder.json --win
if errorlevel 1 (
    echo ERROR: Packaging failed
    pause
    exit /b 1
)

echo.
echo ========================================
echo  BUILD COMPLETE!
echo  Installer is in the "release" folder
echo ========================================
echo.
explorer release
pause
