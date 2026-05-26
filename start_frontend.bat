@echo off
echo ==========================================
echo  EV Route Optimizer - Frontend Server
echo ==========================================
echo.

REM Hardcoded Node.js path (works even if PATH is not set in this CMD window)
set "NODE_DIR=C:\Program Files\nodejs"
set "PATH=%NODE_DIR%;%PATH%"

REM Verify node is available
if not exist "%NODE_DIR%\node.exe" (
    echo [ERROR] Node.js not found at: %NODE_DIR%
    echo Please verify Node.js is installed correctly.
    echo.
    pause
    exit /b 1
)

echo [INFO] Using Node.js from: %NODE_DIR%
"%NODE_DIR%\node.exe" --version
echo.

REM Change to the frontend directory
cd /d "%~dp0frontend"
echo [INFO] Working directory: %CD%
echo.

REM Install dependencies if needed
if not exist "node_modules" (
    echo [INFO] Installing npm dependencies - this may take a few minutes...
    "%NODE_DIR%\node.exe" "%NODE_DIR%\node_modules\npm\bin\npm-cli.js" install
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] Failed to install npm dependencies.
        pause
        exit /b %errorlevel%
    )
)

echo [INFO] Starting Next.js frontend on http://localhost:3000
echo [INFO] Press Ctrl+C to stop the server.
echo.
"%NODE_DIR%\node.exe" "%NODE_DIR%\node_modules\npm\bin\npm-cli.js" run dev

echo.
echo [INFO] Server stopped (Exit code: %errorlevel%).
echo.
pause
