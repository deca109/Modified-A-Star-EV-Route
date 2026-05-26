@echo off
echo ==========================================
echo  EV Route Optimizer - Backend Server
echo ==========================================
echo.
cd /d "%~dp0backend"

if not exist "venv\Scripts\python.exe" (
    echo [INFO] Creating virtual environment...
    python -m venv venv
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to create virtual environment. Please verify python is installed and on your PATH.
        pause
        exit /b %errorlevel%
    )
    echo [INFO] Upgrading pip...
    venv\Scripts\python.exe -m pip install --upgrade pip
    echo [INFO] Installing EV Route Optimizer dependencies...
    venv\Scripts\pip install -r requirements.txt
) else (
    echo [INFO] Verifying Python dependencies...
    venv\Scripts\python.exe -c "import fastapi, uvicorn, sklearn, scipy, osmnx, torch, shapely, pandas" >nul 2>&1
    if %errorlevel% neq 0 (
        echo [WARNING] Some python packages are missing or incomplete. Reinstalling dependencies...
        venv\Scripts\pip install -r requirements.txt
    ) else (
        echo [INFO] All dependencies verified successfully!
    )
)

echo Starting FastAPI backend on http://localhost:8000
echo API Docs: http://localhost:8000/docs
echo.
set PYTHONPATH=..
venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Backend server stopped unexpectedly or failed to start (Exit code: %errorlevel%).
    pause
)

