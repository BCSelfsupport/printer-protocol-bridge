@echo off
cd /d "%~dp0"
echo ========================================
echo  Printer Protocol Bridge - Dev Launcher
echo ========================================
echo.

REM Pull latest code
echo [1/3] Pulling latest code...
git pull
if errorlevel 1 (
    echo Warning: Git pull failed, continuing with local code...
)
echo.

REM Kill any existing processes on port 8080/8081
echo [2/3] Starting Vite dev server...
start "Vite Dev Server" cmd /c "npm run dev"

REM Wait for Vite to start (check for port)
echo Waiting for Vite to be ready...
:waitloop
timeout /t 1 /nobreak >nul
netstat -an | findstr ":8080.*LISTENING" >nul
if errorlevel 1 (
    netstat -an | findstr ":8081.*LISTENING" >nul
    if errorlevel 1 (
        goto waitloop
    ) else (
        set VITE_PORT=8081
        goto viteready
    )
) else (
    set VITE_PORT=8080
    goto viteready
)

:viteready
echo Vite is ready on port %VITE_PORT%
echo.

REM Start Electron
echo [3/3] Starting Electron...
set VITE_DEV_SERVER_URL=http://localhost:%VITE_PORT%
npx -y electron electron/main.cjs

echo.
echo Electron closed. Press any key to exit...
pause >nul
