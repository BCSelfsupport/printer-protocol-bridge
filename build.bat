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

REM Check for GH_TOKEN
if "%GH_TOKEN%"=="" (
    echo WARNING: GH_TOKEN is not set. The installer will be built but NOT published to GitHub.
    echo To publish, set GH_TOKEN before running: set GH_TOKEN=your_github_token
    echo.
    set PUBLISH_FLAG=never
) else (
    echo [OK] GH_TOKEN found - will publish to GitHub Releases
    set PUBLISH_FLAG=always
)
echo.

REM Step 1: Install dependencies
echo [1/5] Installing dependencies...
call npm install
if errorlevel 1 (
    echo ERROR: npm install failed
    pause
    exit /b 1
)
echo.

REM Step 2: Install Electron build tools (devDependencies)
echo [2/5] Installing Electron build tools...
call npm install --save-dev electron electron-builder electron-updater
if errorlevel 1 (
    echo ERROR: Failed to install Electron build tools
    pause
    exit /b 1
)
echo.

REM Step 3: Build the Vite frontend
echo [3/5] Building frontend...
call npm run build
if errorlevel 1 (
    echo ERROR: Frontend build failed
    pause
    exit /b 1
)
echo.

REM Step 4: Ensure icon is ready
echo [4/5] Preparing icon...
if not exist "electron\resources" mkdir "electron\resources"
copy /Y public\codesync-icon.png electron\resources\icon.png >nul 2>&1
echo [OK] Icon ready
echo.

REM Step 5: Package and optionally publish
echo [5/5] Packaging installer...
call npx electron-builder --config electron/electron-builder.json --win --publish %PUBLISH_FLAG%
if errorlevel 1 (
    echo ERROR: Packaging failed
    pause
    exit /b 1
)

echo.
echo ========================================
echo  BUILD COMPLETE!
if "%PUBLISH_FLAG%"=="always" (
    echo  Installer published to GitHub Releases!
) else (
    echo  Installer is in the "release" folder
    echo  To publish: set GH_TOKEN=your_token then re-run
)
echo ========================================
echo.
explorer release
pause
