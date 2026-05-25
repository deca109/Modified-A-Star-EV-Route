@echo off
echo ==========================================
echo  EV Route Optimizer - Frontend Server
echo ==========================================
echo.
cd /d "%~dp0frontend"

if not exist "node_modules" (
    echo Installing npm dependencies...
    npm install
)

echo Starting Next.js frontend on http://localhost:3000
echo.
npm run dev
