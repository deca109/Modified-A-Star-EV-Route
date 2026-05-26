@echo off
echo ==========================================
echo  EV Route Optimizer - Frontend Server
echo ==========================================
echo.
cd /d "%~dp0frontend"

if not exist "node_modules" (
    echo [INFO] Installing npm dependencies (this may take a minute)...
    npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install npm dependencies. Please check npm logs.
        pause
        exit /b %errorlevel%
    )
)

echo Starting Next.js frontend on http://localhost:3000
echo.
npm run dev
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Frontend server stopped unexpectedly or failed to start (Exit code: %errorlevel%).
    pause
)

